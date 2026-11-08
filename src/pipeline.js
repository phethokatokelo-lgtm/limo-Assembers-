// LIMO pipeline core (M3): IF, ID, EX, MEM, WB with IF/ID, ID/EX, EX/MEM, MEM/WB registers.
// Pure ES module, no dependencies. Follows ISA 1.0 (frozen) and the decisions in ISA_FREEZE.md section 3:
//  1 ema halts at WB (a flushed ema has no effect); 2 register file writes in the first half-cycle and
//  reads in the second; 3/4 bad data address or illegal word stops the simulator with a plain error;
//  5 branches and jumps resolve in EX, predict not-taken, a taken one flushes 2 slots.
// M3 has NO forwarding and NO stalls: a program is hazard-free only if every register is read
// at least 3 instructions after the instruction that writes it (two filler instructions between).
export const IMEM_WORDS = 1024, DMEM_WORDS = 256;
const hex = w => '0x' + (w >>> 0).toString(16).toUpperCase().padStart(8, '0');
const bubble = () => ({ valid: false });

// ---- Control unit: one instruction word -> control signals (null = not a LIMO instruction) ----
export function decode(w) {
  const op = w & 127, f3 = (w >> 11) & 7, f7 = w >>> 25;
  const rd = (w >> 7) & 15, rs1 = (w >> 14) & 15, rs2 = (w >> 18) & 15;
  const C = (name, fmt, o) => ({ name, fmt, rd, rs1, rs2, imm: 0, reads1: 0, reads2: 0, regWrite: 0, memRead: 0,
    memWrite: 0, useImm: 0, alu: null, br: null, jump: null, halt: 0, ...o });
  const immI = w >> 18, immSB = ((w >> 22) << 4) | ((w >> 7) & 15); // arithmetic shifts sign-extend
  switch (op) {
    case 0x33: {
      const t = { '0:0': ['eketsa', 'add'], '0:32': ['tlosa', 'sub'], '7:0': ['le', 'and'], '6:0': ['kapa', 'or'] }[f3 + ':' + f7];
      if (!t || (w >> 22) & 7) return null; // unknown funct, or reserved bits [24:22] not 0
      return C(t[0], 'R', { alu: t[1], regWrite: 1, reads1: 1, reads2: 1 });
    }
    case 0x13:
      if (f3 === 0) return C('eketsana', 'I', { imm: immI, alu: 'add', useImm: 1, regWrite: 1, reads1: 1 });
      if (f3 === 1 && immI >= 0 && immI <= 31) return C('suthela', 'I', { imm: immI, alu: 'sll', useImm: 1, regWrite: 1, reads1: 1 });
      return null;
    case 0x03: return f3 === 2 ? C('nka', 'I', { imm: immI, alu: 'add', useImm: 1, memRead: 1, regWrite: 1, reads1: 1 }) : null;
    case 0x23: return f3 === 2 ? C('kenya', 'S', { imm: immSB, alu: 'add', useImm: 1, memWrite: 1, reads1: 1, reads2: 1 }) : null;
    case 0x63:
      if (f3 === 0 || f3 === 4) return C(f3 ? 'nyane' : 'lekana', 'B', { imm: immSB, br: f3 ? 'lt' : 'eq', reads1: 1, reads2: 1 });
      return null;
    case 0x6f: return C('tsamaea', 'J', { imm: w >> 11, jump: 'jal', regWrite: 1 });
    case 0x67: return f3 === 0 ? C('boela', 'I', { imm: immI, jump: 'jalr', regWrite: 1, reads1: 1 }) : null;
    case 0x0b: return w === 0x0b ? C('ema', 'N', { halt: 1 }) : null;
  }
  return null;
}

const ALU = { add: (a, b) => (a + b) | 0, sub: (a, b) => (a - b) | 0, and: (a, b) => a & b, or: (a, b) => a | b, sll: (a, b) => a << (b & 31) };

export class Cpu {
  constructor() { this.imem = new Uint32Array(IMEM_WORDS); this.reset(); }
  load(words) { this.imem.fill(0); words.forEach((w, i) => { this.imem[i] = w; }); this.reset(); }
  reset() { // PC = 0, registers = 0, data memory = 0; the loaded program stays
    this.pc = 0; this.regs = new Int32Array(16); this.dmem = new Int32Array(DMEM_WORDS);
    this.ifid = bubble(); this.idex = bubble(); this.exmem = bubble(); this.memwb = bubble();
    this.cycle = 0; this.executed = 0; this.flushed = 0; this.halted = false; this.error = null;
    this.stages = { IF: '-', ID: '-', EX: '-', MEM: '-', WB: '-' };
    this.pcs = { IF: null, ID: null, EX: null, MEM: null, WB: null };
    this.ctl = { ID: null, EX: null, MEM: null, WB: null }; this.taken = false; this.hist = [];
  }
  snap() { // everything step() can change, so back() can undo one cycle
    return { pc: this.pc, regs: this.regs.slice(), dmem: this.dmem.slice(), ifid: this.ifid, idex: this.idex, exmem: this.exmem,
      memwb: this.memwb, cycle: this.cycle, executed: this.executed, flushed: this.flushed, halted: this.halted, error: this.error,
      stages: this.stages, pcs: this.pcs, ctl: this.ctl, taken: this.taken };
  }
  back() { const s = this.hist.pop(); if (!s) return false; Object.assign(this, s); return true; }
  fail(msg) { this.error = msg; return false; }

  // One clock cycle. Stages run WB -> IF so each reads the registers as they were at the start of the cycle.
  step() {
    if (this.halted || this.error) return false;
    this.hist.push(this.snap()); if (this.hist.length > 5000) this.hist.shift();
    const { regs, dmem } = this, ifid = this.ifid, idex = this.idex, exmem = this.exmem, memwb = this.memwb;
    this.cycle++;
    const name = l => (l.valid ? l.name : '-');

    // WB: write the register file (first half-cycle, so ID below sees the new value); ema halts here.
    if (memwb.valid) {
      if (memwb.c.regWrite && memwb.rd !== 0) regs[memwb.rd] = memwb.val;
      this.executed++;
      if (memwb.c.halt) this.halted = true;
    }

    // MEM: data memory access (word-aligned, addresses 0 to 1020).
    let nmw = bubble();
    if (exmem.valid) {
      let val = exmem.alu;
      if (exmem.c.memRead || exmem.c.memWrite) {
        const a = exmem.alu;
        if (a < 0 || a >= DMEM_WORDS * 4 || a % 4 !== 0)
          return this.fail(`${exmem.name} at address ${hex(exmem.pc)} uses data address ${a}, which is not a multiple of 4 between 0 and ${DMEM_WORDS * 4 - 4}.`);
        if (exmem.c.memRead) val = dmem[a >> 2]; else dmem[a >> 2] = exmem.store;
      }
      nmw = { valid: true, name: exmem.name, c: exmem.c, rd: exmem.rd, pc: exmem.pc, val };
    }

    // EX: ALU, branch comparison and jump target. Taken branch or jump -> redirect and flush 2 slots.
    let nex = bubble(), redirect = null;
    if (idex.valid) {
      if (idex.illegal) return this.fail(`Instruction ${hex(idex.word)} at address ${hex(idex.pc)} is not a LIMO instruction.`);
      const c = idex.c, b = c.useImm ? idex.imm : idex.b;
      let r = c.alu ? ALU[c.alu](idex.a, b) : 0;
      if (c.jump) { r = idex.pc + 4; redirect = c.jump === 'jal' ? idex.pc + 4 * idex.imm : (idex.a + idex.imm) & ~3; }
      if (c.br && (c.br === 'eq' ? idex.a === idex.b : idex.a < idex.b)) redirect = idex.pc + 4 * idex.imm;
      nex = { valid: true, name: idex.name, c, rd: idex.rd, pc: idex.pc, alu: r, store: idex.b };
    }

    // ID: decode, read the register file. An illegal word is only reported if it reaches EX unflushed.
    let nid = bubble();
    if (ifid.valid) {
      const c = decode(ifid.word);
      nid = c ? { valid: true, name: c.name, c, rd: c.rd, pc: ifid.pc, word: ifid.word, a: regs[c.rs1], b: regs[c.rs2], imm: c.imm }
              : { valid: true, name: 'illegal', illegal: true, pc: ifid.pc, word: ifid.word };
    }

    // IF: fetch at PC; fetching stops once an ema is in flight (a flush above lifts that again).
    if (redirect !== null) { nid = bubble(); this.pc = redirect; this.flushed += 2; }
    const ema = l => l.valid && l.c && l.c.halt;
    const stop = this.halted || ema(nid) || ema(nex) || ema(nmw);
    let nif = bubble(), fetched = '-';
    if (!stop && redirect === null) { // on a redirect the IF slot is flushed too: the target is fetched next cycle
      const w = this.pc >= 0 && this.pc < IMEM_WORDS * 4 ? this.imem[this.pc >> 2] : 0;
      nif = { valid: true, pc: this.pc, word: w }; this.pc += 4;
      fetched = decode(w)?.name ?? hex(w);
    }

    this.stages = { IF: fetched, ID: name(ifid.valid ? { valid: 1, name: decode(ifid.word)?.name ?? 'illegal' } : ifid),
      EX: name(idex), MEM: name(exmem), WB: name(memwb) };
    const pc = l => (l.valid ? l.pc : null); // address of the instruction in each stage (for the UI)
    this.pcs = { IF: pc(nif), ID: pc(ifid), EX: pc(idex), MEM: pc(exmem), WB: pc(memwb) };
    this.ctl = { ID: ifid.valid ? decode(ifid.word) : null, EX: idex.valid ? idex.c : null, MEM: exmem.valid ? exmem.c : null, WB: memwb.valid ? memwb.c : null };
    this.taken = redirect !== null;
    this.ifid = nif; this.idex = nid; this.exmem = nex; this.memwb = nmw;
    return true;
  }

  run(maxCycles = 100000) {
    let n = 0;
    while (!this.halted && !this.error && n++ < maxCycles) this.step();
    if (!this.halted && !this.error) this.fail(`The program did not stop after ${maxCycles} cycles (an endless loop?).`);
    return this.halted;
  }
}
