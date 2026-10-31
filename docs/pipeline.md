# Module Design — Pipeline (M3)

**Owner:** Moletsane (Student ID: 202201258)
**Role:** Pipeline Lead
**Milestone:** M3 (updated from M1)
**Code:** `src/pipeline.js` · **Tests:** `tests/pipeline.test.js` · **UI:** `index.html`

## 1. Role Summary
Moletsane owns the **pipeline structure** of the LIMO processor: dividing
instruction execution into stages, placing the pipeline registers that carry
data and control signals between those stages, and making sure instructions
flow through the pipeline correctly, one stage per clock cycle.

In M1 this was a design on paper. In **M3 it is implemented and tested** as a
cycle-accurate JavaScript simulator that runs in the browser and in Node.

## 2. Responsibilities
- Define the **pipeline stages** and what work happens in each. *(done, M3)*
- Specify the **pipeline registers** between stages and what each one carries. *(done, M3)*
- Define how **control signals travel down the pipeline** alongside the data. *(done, M3)*
- Provide the hooks the hazard unit needs: **stalls, bubbles and flushes**.
  Flush is **implemented** in M3; stall, bubble and forwarding are **M4**
  (Phethoka, Hazard-unit lead).
- Coordinate with the Datapath/ALU and ISA leads so each stage carries the right
  fields (ISA 1.0, frozen in `ISA_FREEZE.md`).

## 3. Pipeline Stages
LIMO uses the classic 5-stage RISC-V pipeline:

1. **IF** — Instruction Fetch: read the instruction word at PC from
   instruction memory (1024 words), compute PC + 4.
2. **ID** — Instruction Decode: the control unit (`decode`) turns the word into
   control signals; the register file is read (16 registers, r0 always 0).
3. **EX** — Execute: the ALU does arithmetic and address calculation; the
   comparator decides branches; jump and branch targets are computed.
4. **MEM** — Memory: `nka` reads and `kenya` writes data memory
   (256 words, word-aligned).
5. **WB** — Write-Back: the result is written to the destination register;
   `ema` halts the machine here.

Once the pipeline is full and there are no hazards, one instruction completes
every cycle. Total cycles for a program are
**instructions executed + 4 + 2 × taken branches/jumps** (the +4 is the time to
fill the pipeline; in M4 stalls are added to this sum).

## 4. Pipeline Registers
Registers sit **between** each pair of stages and hold everything the next stage
needs. They are replaced together on each clock cycle, so each stage works on a
different instruction. A register that holds no instruction is a **bubble**
(`valid = false`).

| Register | Sits between | Fields in `pipeline.js` |
|---|---|---|
| IF/ID  | IF → ID  | `pc`, `word` (the fetched instruction) |
| ID/EX  | ID → EX  | `pc`, `word`, `name`, control signals `c`, `rd`, register values `a` (rs1) and `b` (rs2), `imm` (sign-extended) |
| EX/MEM | EX → MEM | `pc`, `name`, control signals `c`, `rd`, `alu` (ALU result, or PC + 4 for a jump), `store` (data for `kenya`) |
| MEM/WB | MEM → WB | `pc`, `name`, control signals `c`, `rd`, `val` (loaded data, ALU result or link address) |

> Control signals are generated once in ID and then **ride along** these
> registers (`c` in each) to the stage where each one is used.

## 5. Control Unit
`decode(word)` in `src/pipeline.js` maps an instruction word to its control
signals, using opcode, funct3 and funct7 from the frozen ISA. It returns `null`
for any word that is not a LIMO instruction, including a word with reserved bits
set, an unknown funct, a `suthela` shift amount outside 0 to 31, or the all-zero
word.

| Signal | Meaning | Used in |
|---|---|---|
| `reads1`, `reads2` | instruction reads rs1 / rs2 | ID (and the M4 hazard unit) |
| `useImm` | second ALU input is the immediate | EX |
| `alu` | `add`, `sub`, `and`, `or`, `sll` | EX |
| `br` | branch condition: `eq` (`lekana`) or `lt` (`nyane`) | EX |
| `jump` | `jal` (`tsamaea`) or `jalr` (`boela`) | EX |
| `memRead`, `memWrite` | `nka` / `kenya` | MEM |
| `regWrite` | write `rd` (ignored when `rd` = r0) | WB |
| `halt` | `ema` | WB |

## 6. Cycle Behaviour (Design Decisions)
Stages are evaluated from **WB back to IF** each cycle, so every stage reads the
pipeline registers as they were at the start of the cycle. The five decisions
from `ISA_FREEZE.md` section 3 are implemented as proposed:

1. **`ema` halts at WB.** Fetching stops once an `ema` is in flight, and a
   flushed `ema` has no effect.
2. **Register file timing:** written in the first half of the cycle, read in the
   second half. A register written in WB is therefore visible to the instruction
   in ID in the same cycle.
3. **Bad data address** (outside 0 to 1020, or not a multiple of 4): the
   simulator stops with a plain-language error.
4. **Illegal instruction word:** the simulator stops with a plain-language error.
   It is reported when the word reaches EX unflushed, so a wrong-path word that
   a taken branch removes does not cause a false error.
5. **Branches and jumps resolve in EX**, with predict-not-taken. A taken branch
   or jump sets the PC to the target and **flushes 2 slots** (the instruction in
   ID and the one being fetched); the target is fetched in the next cycle.

## 7. Hazard Handling: M3 Scope and M4 Hooks
**M3 does not forward or stall.** A program is *hazard-free* only if every
register is read at least 3 instructions after the instruction that writes it
(two filler instructions between them, for example
`eketsana letho, letho, 0`). The sample programs `kakaretso.limo`, `lenane.limo`
and `mosebetsi.limo` contain hazards and are expected to give wrong results until
M4.

| Action | M3 | M4 plan |
|---|---|---|
| **Flush** | Done: 2 slots on a taken branch or jump | unchanged |
| **Forwarding** | Not implemented | EX/MEM and MEM/WB results into the ALU inputs |
| **Stall** | Not implemented | Freeze PC and IF/ID for one cycle (load-use) |
| **Bubble** | Done as the empty register (`valid = false`) | Insert into ID/EX on a stall |

The simulator already exposes what the hazard unit needs: `reads1`/`reads2` and
`rd` for every instruction in flight, and the pipeline registers as plain
objects.

## 8. Interface
**Software API (`class Cpu`):**
- `load(words)` loads an assembled program (from `assemble()`) and resets.
- `step()` runs one clock cycle. `run(maxCycles)` runs until `ema` reaches WB, an
  error occurs, or `maxCycles` is hit (default 100000).
- `reset()` sets PC to 0, registers and data memory to 0, and keeps the program.
- `back()` undoes one clock cycle (a history of up to 5000 cycles is kept).

**State read by the interface:** `regs`, `dmem`, `pc`, `cycle`, `executed`
(instructions finished), `flushed`, `halted`, `error`, `stages` (instruction name
per stage), `pcs` (instruction address per stage), `ctl` (control signals per
stage) and `taken` (a branch or jump redirected this cycle).

**User interface (`index.html`):** an **Editor** tab (source, executable code,
console) and a **Processor** tab (five-stage datapath with the four pipeline
registers, instruction memory with a Stage column, data memory, execution info),
with a register panel and **Reset, Back, Step, Run** controls.

## 9. Testing & Verification
`node --test` runs **37 tests** (21 assembler, 16 pipeline); all pass.
Pipeline tests in `tests/pipeline.test.js` cover:
- the control unit decoding all 13 instructions from the specification's hex,
  and rejecting reserved bits and the zero word;
- straight-line code with the exact cycle count (instructions + 4);
- every ALU instruction, store then load, and r0 staying 0;
- a taken branch flushing 2 slots with no effect from the wrong path; a
  not-taken branch costing nothing;
- a hazard-free loop (31 instructions, 8 flushed slots, 43 cycles, result 15),
  and call and return with `tsamaea` and `khutla`;
- a flushed `ema` having no effect;
- Reset, Step, `back()` (including after a halt, a flush and an error), and the
  plain-language errors for an illegal word, a bad data address and an endless
  loop.

**Still to do:** compare the simulator's cycle counts and final registers with an
independent run of the three sample programs once forwarding and stalls exist in
M4 (the freeze document records 31, 47 and 22 cycles).

## 10. Next Steps (M4)
- Add **forwarding** and the **load-use stall**, with Phethoka's hazard unit
  driving stall, bubble and flush.
- Show forwarded values and control signals live on the datapath view; add the
  pipeline chart and statistics.
- Make the three sample programs run correctly without filler instructions.

## 11. Related Docs
- `docs/design.md` — overall design incl. hazard handling (Phethoka)
- `docs/ISA_SPECIFICATION.md` — instruction formats (Letuka)
- `docs/TEAM_CHARTER.md` — roles and responsibilities
- `ISA_FREEZE.md` — frozen ISA 1.0 and the decisions in section 6 above
- `AI_USE.md` — records that Claude was used to draft `src/pipeline.js`,
  `tests/pipeline.test.js` and the simulator interface, and what the team checked
