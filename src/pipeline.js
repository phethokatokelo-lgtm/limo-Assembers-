// LIMO pipeline core (M3)
//
// Five stages (IF, ID, EX, MEM, WB) separated by the IF/ID, ID/EX, EX/MEM and
// MEM/WB pipeline registers. Plain ES module, no dependencies.
//
// This follows ISA 1.0 (frozen) and the decisions in ISA_FREEZE.md, section 3:
//   1. ema halts when it reaches WB. An ema that gets flushed has no effect.
//   2. The register file is written in the first half of a cycle and read in
//      the second half, so a write in WB is visible to the read in ID.
//   3. A bad data address stops the simulator with a plain-language error.
//   4. So does an illegal instruction word (only if it actually reaches EX).
//   5. Branches and jumps resolve in EX and we predict not-taken. A taken one
//      flushes the two younger slots.
//
// M3 has NO forwarding and NO stalls. A program is only hazard-free if every
// register is read at least 3 instructions after the instruction that writes
// it (i.e. two filler instructions in between).

export const IMEM_WORDS = 1024;
export const DMEM_WORDS = 256;

const DMEM_BYTES = DMEM_WORDS * 4;
const IMEM_BYTES = IMEM_WORDS * 4;
const HISTORY_LIMIT = 5000; // how many cycles back() can undo

// Opcodes (same values RISC-V uses for the matching instruction classes).
const OP_REG    = 0x33; // R-type arithmetic and logic
const OP_IMM    = 0x13; // eketsana, suthela
const OP_LOAD   = 0x03; // nka
const OP_STORE  = 0x23; // kenya
const OP_BRANCH = 0x63; // lekana, nyane
const OP_JAL    = 0x6f; // tsamaea
const OP_JALR   = 0x67; // boela
const OP_HALT   = 0x0b; // ema (RISC-V custom-0)

const hex = word => '0x' + (word >>> 0).toString(16).toUpperCase().padStart(8, '0');

// An empty pipeline slot.
const bubble = () => ({ valid: false });


// ---------------------------------------------------------------------------
// Control unit: one instruction word in, control signals out.
// Returns null when the word is not a LIMO instruction.
// ---------------------------------------------------------------------------

// R-type instructions are told apart by "funct3:funct7".
const R_TYPE = {
  '0:0':  { name: 'eketsa', alu: 'add' },
  '0:32': { name: 'tlosa',  alu: 'sub' },
  '7:0':  { name: 'le',     alu: 'and' },
  '6:0':  { name: 'kapa',   alu: 'or'  },
};

export function decode(word) {
  const opcode = word & 0x7f;
  const funct3 = (word >> 11) & 7;
  const funct7 = word >>> 25;

  const rd  = (word >> 7) & 15;
  const rs1 = (word >> 14) & 15;
  const rs2 = (word >> 18) & 15;

  // The shifts are arithmetic, so both immediates come out sign-extended.
  const immI  = word >> 18;
  const immSB = ((word >> 22) << 4) | ((word >> 7) & 15);

  // Build the full set of control signals; callers only list what is non-zero.
  const control = (name, fmt, signals) => ({
    name, fmt, rd, rs1, rs2,
    imm: 0, reads1: 0, reads2: 0,
    regWrite: 0, memRead: 0, memWrite: 0, useImm: 0,
    alu: null, br: null, jump: null, halt: 0,
    ...signals,
  });

  switch (opcode) {
    case OP_REG: {
      const entry = R_TYPE[funct3 + ':' + funct7];
      const reservedBits = (word >> 22) & 7; // [24:22] must be zero
      if (!entry || reservedBits) return null;
      return control(entry.name, 'R', { alu: entry.alu, regWrite: 1, reads1: 1, reads2: 1 });
    }

    case OP_IMM:
      if (funct3 === 0) {
        return control('eketsana', 'I', { imm: immI, alu: 'add', useImm: 1, regWrite: 1, reads1: 1 });
      }
      if (funct3 === 1 && immI >= 0 && immI <= 31) {
        return control('suthela', 'I', { imm: immI, alu: 'sll', useImm: 1, regWrite: 1, reads1: 1 });
      }
      return null;

    case OP_LOAD:
      if (funct3 !== 2) return null;
      return control('nka', 'I', {
        imm: immI, alu: 'add', useImm: 1, memRead: 1, regWrite: 1, reads1: 1,
      });

    case OP_STORE:
      if (funct3 !== 2) return null;
      return control('kenya', 'S', {
        imm: immSB, alu: 'add', useImm: 1, memWrite: 1, reads1: 1, reads2: 1,
      });

    case OP_BRANCH:
      if (funct3 === 0) return control('lekana', 'B', { imm: immSB, br: 'eq', reads1: 1, reads2: 1 });
      if (funct3 === 4) return control('nyane',  'B', { imm: immSB, br: 'lt', reads1: 1, reads2: 1 });
      return null;

    case OP_JAL:
      return control('tsamaea', 'J', { imm: word >> 11, jump: 'jal', regWrite: 1 });

    case OP_JALR:
      if (funct3 !== 0) return null;
      return control('boela', 'I', { imm: immI, jump: 'jalr', regWrite: 1, reads1: 1 });

    case OP_HALT:
      // ema is exactly the opcode with every other bit zero.
      return word === OP_HALT ? control('ema', 'N', { halt: 1 }) : null;
  }

  return null;
}


// ---------------------------------------------------------------------------
// ALU
// ---------------------------------------------------------------------------

const ALU = {
  add: (a, b) => (a + b) | 0,
  sub: (a, b) => (a - b) | 0,
  and: (a, b) => a & b,
  or:  (a, b) => a | b,
  sll: (a, b) => a << (b & 31),
};

const isEma = latch => latch.valid && latch.c && latch.c.halt;
const stageName = latch => (latch.valid ? latch.name : '-');
const addressOf = latch => (latch.valid ? latch.pc : null); // shown in the UI


// ---------------------------------------------------------------------------
// The CPU
// ---------------------------------------------------------------------------

export class Cpu {
  constructor() {
    this.imem = new Uint32Array(IMEM_WORDS);
    this.reset();
  }

  // Put a program into instruction memory and start from a clean state.
  load(words) {
    this.imem.fill(0);
    words.forEach((word, i) => { this.imem[i] = word; });
    this.reset();
  }

  // PC = 0, registers = 0, data memory = 0. The loaded program stays.
  reset() {
    this.pc = 0;
    this.regs = new Int32Array(16);
    this.dmem = new Int32Array(DMEM_WORDS);

    this.ifid = bubble();
    this.idex = bubble();
    this.exmem = bubble();
    this.memwb = bubble();

    this.cycle = 0;
    this.executed = 0;
    this.flushed = 0;
    this.halted = false;
    this.error = null;

    // What the UI shows for each stage: instruction names, addresses, control signals.
    this.stages = { IF: '-', ID: '-', EX: '-', MEM: '-', WB: '-' };
    this.pcs = { IF: null, ID: null, EX: null, MEM: null, WB: null };
    this.ctl = { ID: null, EX: null, MEM: null, WB: null };
    this.taken = false;

    this.hist = [];
  }

  // Copy of everything step() can change, so back() can undo one cycle.
  snap() {
    return {
      pc: this.pc,
      regs: this.regs.slice(),
      dmem: this.dmem.slice(),
      ifid: this.ifid,
      idex: this.idex,
      exmem: this.exmem,
      memwb: this.memwb,
      cycle: this.cycle,
      executed: this.executed,
      flushed: this.flushed,
      halted: this.halted,
      error: this.error,
      stages: this.stages,
      pcs: this.pcs,
      ctl: this.ctl,
      taken: this.taken,
    };
  }

  // Undo the last cycle. Returns false if there is nothing to undo.
  back() {
    const previous = this.hist.pop();
    if (!previous) return false;
    Object.assign(this, previous);
    return true;
  }

  // Record an error and stop the simulator.
  fail(message) {
    this.error = message;
    return false;
  }

  // Run one clock cycle. The stages are evaluated from WB back to IF so that
  // each one sees the pipeline registers as they were at the start of the cycle.
  // Returns false if the simulator is stopped (halted, or an error happened).
  step() {
    if (this.halted || this.error) return false;

    this.hist.push(this.snap());
    if (this.hist.length > HISTORY_LIMIT) this.hist.shift();

    // Pipeline registers as they stand at the start of this cycle.
    const { ifid, idex, exmem, memwb } = this;
    this.cycle++;

    this.writeBack(memwb);

    const nextMemwb = this.memoryStage(exmem);
    if (nextMemwb === null) return false;

    const executed = this.executeStage(idex);
    if (executed === null) return false;
    const { latch: nextExmem, redirect } = executed;

    let nextIdex = this.decodeStage(ifid);

    // A taken branch or jump throws away the instruction that was just decoded
    // and the slot being fetched, which is two instructions.
    if (redirect !== null) {
      nextIdex = bubble();
      this.pc = redirect;
      this.flushed += 2;
    }

    const { latch: nextIfid, fetched } = this.fetchStage(nextIdex, nextExmem, nextMemwb, redirect);

    this.updateDisplay(nextIfid, fetched, redirect);

    this.ifid = nextIfid;
    this.idex = nextIdex;
    this.exmem = nextExmem;
    this.memwb = nextMemwb;
    return true;
  }

  // Keep stepping until the program halts, fails, or runs too long.
  run(maxCycles = 100000) {
    let cycles = 0;
    while (!this.halted && !this.error && cycles++ < maxCycles) this.step();

    if (!this.halted && !this.error) {
      this.fail(`The program did not stop after ${maxCycles} cycles (an endless loop?).`);
    }
    return this.halted;
  }


  // ----- the stages -----

  // WB: write the register file (first half-cycle, so ID sees the new value).
  // This is also where ema takes effect.
  writeBack(slot) {
    if (!slot.valid) return;

    if (slot.c.regWrite && slot.rd !== 0) {
      this.regs[slot.rd] = slot.val;
    }
    this.executed++;
    if (slot.c.halt) this.halted = true;
  }

  // MEM: data memory access. Addresses must be word-aligned and in range.
  // Returns the new MEM/WB register, or null if the access failed.
  memoryStage(slot) {
    if (!slot.valid) return bubble();

    let value = slot.alu;

    if (slot.c.memRead || slot.c.memWrite) {
      const address = slot.alu;
      const outOfRange = address < 0 || address >= DMEM_BYTES;
      if (outOfRange || address % 4 !== 0) {
        this.fail(
          `${slot.name} at address ${hex(slot.pc)} uses data address ${address}, ` +
          `which is not a multiple of 4 between 0 and ${DMEM_BYTES - 4}.`
        );
        return null;
      }

      if (slot.c.memRead) {
        value = this.dmem[address >> 2];
      } else {
        this.dmem[address >> 2] = slot.store;
      }
    }

    return { valid: true, name: slot.name, c: slot.c, rd: slot.rd, pc: slot.pc, val: value };
  }

  // EX: ALU work, branch comparison and jump targets.
  // Returns { latch, redirect } where redirect is the new PC for a taken branch
  // or jump (null if nothing was taken), or null if the instruction was illegal.
  executeStage(slot) {
    if (!slot.valid) return { latch: bubble(), redirect: null };

    if (slot.illegal) {
      this.fail(`Instruction ${hex(slot.word)} at address ${hex(slot.pc)} is not a LIMO instruction.`);
      return null;
    }

    const c = slot.c;
    const operandB = c.useImm ? slot.imm : slot.b;
    let result = c.alu ? ALU[c.alu](slot.a, operandB) : 0;
    let redirect = null;

    if (c.jump) {
      // Jumps write the return address and always redirect.
      result = slot.pc + 4;
      redirect = c.jump === 'jal'
        ? slot.pc + 4 * slot.imm
        : (slot.a + slot.imm) & ~3;
    }

    if (c.br) {
      const taken = c.br === 'eq' ? slot.a === slot.b : slot.a < slot.b;
      if (taken) redirect = slot.pc + 4 * slot.imm;
    }

    const latch = {
      valid: true, name: slot.name, c, rd: slot.rd, pc: slot.pc,
      alu: result, store: slot.b,
    };
    return { latch, redirect };
  }

  // ID: decode and read the register file. An illegal word is only reported
  // if it reaches EX without being flushed, so here it just gets marked.
  decodeStage(slot) {
    if (!slot.valid) return bubble();

    const c = decode(slot.word);
    if (!c) {
      return { valid: true, name: 'illegal', illegal: true, pc: slot.pc, word: slot.word };
    }

    return {
      valid: true, name: c.name, c, rd: c.rd, pc: slot.pc, word: slot.word,
      a: this.regs[c.rs1], b: this.regs[c.rs2], imm: c.imm,
    };
  }

  // IF: fetch the word at PC. Fetching stops once an ema is in flight (a flush
  // lifts that again, because the ema is gone). On a redirect the IF slot is
  // flushed as well, so the target is not fetched until the next cycle.
  fetchStage(nextIdex, nextExmem, nextMemwb, redirect) {
    const emaInFlight = this.halted || isEma(nextIdex) || isEma(nextExmem) || isEma(nextMemwb);

    if (emaInFlight || redirect !== null) {
      return { latch: bubble(), fetched: '-' };
    }

    const inRange = this.pc >= 0 && this.pc < IMEM_BYTES;
    const word = inRange ? this.imem[this.pc >> 2] : 0;
    const latch = { valid: true, pc: this.pc, word };
    this.pc += 4;

    const control = decode(word);
    return { latch, fetched: control ? control.name : hex(word) };
  }

  // Refresh what the UI reads: stage names, addresses and control signals.
  updateDisplay(nextIfid, fetched, redirect) {
    const { ifid, idex, exmem, memwb } = this;

    // ID shows the instruction waiting in IF/ID, so decode it again just for the name.
    const idName = ifid.valid ? (decode(ifid.word)?.name ?? 'illegal') : '-';

    this.stages = {
      IF: fetched,
      ID: idName,
      EX: stageName(idex),
      MEM: stageName(exmem),
      WB: stageName(memwb),
    };

    this.pcs = {
      IF: addressOf(nextIfid),
      ID: addressOf(ifid),
      EX: addressOf(idex),
      MEM: addressOf(exmem),
      WB: addressOf(memwb),
    };

    this.ctl = {
      ID: ifid.valid ? decode(ifid.word) : null,
      EX: idex.valid ? idex.c : null,
      MEM: exmem.valid ? exmem.c : null,
      WB: memwb.valid ? memwb.c : null,
    };

    this.taken = redirect !== null;
  }
}
