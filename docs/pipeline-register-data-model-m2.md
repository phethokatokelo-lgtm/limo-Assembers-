# LIMO Pipeline-Register Data Model (M2, R3; updated for M3)

**Status:** M3 implemented and tested; M4 parts marked *planned*
**Code:** `src/pipeline.js` (this draft called it `src/pipeline-model.js`)
**Tests:** `tests/pipeline.test.js` (this draft called it `tests/pipeline-model.test.js`)

## 1. Purpose

The simulator models the processor as a clocked machine in which each call to `step()` is one clock cycle. This document defines the machine state and the pipeline registers used by the stages (M3), the hazard unit (M4) and the interface (M4).

The model describes the processor's microarchitecture, not the ISA, as explained in A6(b). The ISA itself is frozen in `ISA_FREEZE.md`.

**What M3 changed in this document.** The M2 draft described the design. M3 builds the five stages, the four pipeline registers, the control unit, Step, Run, Reset and Back. Names, fields and behaviour below are those of the code. Where the code differs from the M2 draft, section 10 lists the difference so the team can confirm it. Hazard handling beyond the flush (forwarding, load-use stall, hazard statistics) is **M4** and is kept in the document as the specification for that milestone.

## 2. Machine State

The machine state is the `Cpu` object in `src/pipeline.js`.

| Field | Type | Purpose | Status |
|---|---|---|---|
| `cycle` | Integer | Number of completed clock cycles | M3 |
| `pc` | Integer | Byte address of the next instruction to fetch | M3 |
| `imem` | 1024 words | Instruction memory (`Uint32Array`), loaded by `load(words)` | M3 |
| `dmem` | 256 words | Data memory (`Int32Array`), indexed by `address / 4` | M3 |
| `regs` | 16 integers | Registers r0–r15; writes to r0 are ignored | M3 |
| `ifid`, `idex`, `exmem`, `memwb` | Latches | The four pipeline registers | M3 |
| `halted` | Boolean | `ema` has reached WB | M3 |
| `error` | String or null | Plain-language reason why execution stopped | M3 |
| `executed` | Integer | Instructions retired (valid instructions that reached WB) | M3 |
| `flushed` | Integer | Flushed slots (2 for every taken branch or jump) | M3 |
| `stages`, `pcs`, `ctl`, `taken` | Objects | What each stage held in the cycle just run: instruction name, instruction address, control signals, and whether a branch or jump redirected the PC. Read by the interface | M3 |
| `hist` | List | Snapshots for Back (section 7) | M3 |
| `hazard` | Object | Hazard unit decisions for the current cycle | M4, planned |
| `forwarding` | Boolean | Enables or disables forwarding | M4, planned |
| `stats.stalls` | Integer | Stall cycles | M4, planned (0 in M3) |

CPI is calculated as `cycle / executed`. It is shown in the interface in M4.

## 3. Pipeline Registers

A pipeline register is a plain object that is **replaced** on every cycle and never changed in place. Every latch has `valid` (does it hold a real instruction?) and, when valid, `pc` and `name` (the mnemonic). A latch with `valid = false` is a bubble.

### IF/ID
`{ valid, pc, word }` — the fetched instruction word and its address.

### ID/EX
`{ valid, pc, word, name, c, rd, a, b, imm }`
- `c` — the control signals (section 4).
- `rd` — destination register number. The source register numbers `rs1` and `rs2` are inside `c`, together with the flags `reads1` and `reads2`. The flags prevent false hazards when an instruction does not read a register (used in M4).
- `a`, `b` — register values read for `rs1` and `rs2`.
- `imm` — the sign-extended immediate, or the word offset for a branch or jump.
- An illegal word is carried as `{ valid, name: 'illegal', illegal: true, pc, word }`. It is reported only if it reaches EX unflushed.

### EX/MEM
`{ valid, pc, name, c, rd, alu, store }`
- `alu` — the ALU result, or the address calculation for `nka` and `kenya`, or **PC + 4** for `tsamaea` and `boela` (the return address).
- `store` — the value of `rs2`, written to memory by `kenya`. In M4 this is the forwarded value.

### MEM/WB
`{ valid, pc, name, c, rd, val }`
- `val` — the value to write back. MEM chooses it: the loaded word for `nka`, otherwise the `alu` value. So the M2 selection `memToReg ? memData : aluResult` is made in MEM in the code, and WB just writes `val`.

Signals needed only within a stage, such as the branch comparison and the PC multiplexer decision, are not stored in pipeline registers. In M3 the result is recorded as `cpu.taken` and drawn in the datapath view. In M4 it is recorded in `hazard`.

## 4. Control Signals

The control unit is the function `decode(word)`. It reads opcode, funct3 and funct7 in ID and returns the signals below, or `null` for any word that is not a LIMO instruction (unknown funct, reserved bits set, a `suthela` shift outside 0 to 31, or the all-zero word). The signals travel in `c` through the pipeline registers.

| Signal | Meaning |
|---|---|
| `fmt` | Instruction format: R, I, S, B, J or N |
| `rs1`, `rs2`, `rd` | Register numbers from the word |
| `reads1`, `reads2` | The instruction actually reads rs1 / rs2 |
| `imm` | Immediate or word offset |
| `regWrite` | Enables register write-back in WB |
| `useImm` | ALU input B is the immediate (otherwise the rs2 value) |
| `alu` | `add`, `sub`, `and`, `or` or `sll`; `null` when the ALU is not used |
| `memRead`, `memWrite` | Reads or writes data memory in MEM |
| `br` | Branch condition: `eq` (`lekana`) or `lt` (signed, `nyane`); `null` if not a branch |
| `jump` | `jal` (`tsamaea`: PC + 4 × offset) or `jalr` (`boela`: (rs1 + imm) with the low two bits cleared); `null` if not a jump |
| `halt` | `ema` |

Values for each instruction (a blank cell is 0 or `null`):

| Instruction | fmt | reads1 | reads2 | regWrite | useImm | alu | memRead | memWrite | br | jump | halt |
|---|---|---:|---:|---:|---:|---|---:|---:|---|---|---:|
| `eketsa` | R | 1 | 1 | 1 | | add | | | | | |
| `tlosa` | R | 1 | 1 | 1 | | sub | | | | | |
| `le` | R | 1 | 1 | 1 | | and | | | | | |
| `kapa` | R | 1 | 1 | 1 | | or | | | | | |
| `eketsana` | I | 1 | | 1 | 1 | add | | | | | |
| `suthela` | I | 1 | | 1 | 1 | sll | | | | | |
| `nka` | I | 1 | | 1 | 1 | add | 1 | | | | |
| `kenya` | S | 1 | 1 | | 1 | add | | 1 | | | |
| `lekana` | B | 1 | 1 | | | | | | eq | | |
| `nyane` | B | 1 | 1 | | | | | | lt | | |
| `tsamaea` | J | | | 1 | | | | | | jal | |
| `boela` | I | 1 | | 1 | | | | | | jalr | |
| `ema` | N | | | | | | | | | | 1 |

Notes:
- The M2 draft's table had a missing column in the `ema` row. The correct values are `halt = 1` and every other signal 0.
- The branch comparison is done by a **comparator** in EX (`a == b` or signed `a < b`), not by the ALU, so there is no `SLT` ALU operation in the code. A separate adder calculates the branch and `tsamaea` target `PC + 4 × offset`; `boela` uses `(a + imm)`.
- `link` is implied by `jump`: EX puts PC + 4 in `alu`, and MEM and WB carry it to `rd`. `memToReg` is implied by `memRead`.

`PCSrc` is decided in EX, not ID:

`PCSrc = jump or (branch and condition true)`

When it is true, the PC is set to the target and the datapath view lights the `PCSrc` line.

## 5. Bubbles and Flushes

A bubble is a latch with `valid = false`. Every stage ignores an invalid latch, so a bubble cannot write a register, write memory, redirect the PC or be counted.

| Situation | Latch content | Statistics |
|---|---|---|
| Real instruction | `valid = true` | Counted in `executed` when it reaches WB |
| Fill (the first cycles, pipeline empty) | bubble | Not counted |
| Flush (wrong-path slots after a taken branch or jump) | bubble | `flushed += 2` per redirect |
| Drain (fetching stopped after `ema` while the pipeline finishes) | bubble | Not counted |
| Stall (M4, a load-use hazard) | bubble | `stalls += 1` (planned) |

The M2 draft also stored a `kind` label (`fill`, `stall`, `flush`, `drain`) and a source `text` in every latch. M3 does not store them: the interface finds the source line from `pc`. If the M4 pipeline chart needs the labels, they can be added to bubbles without changing the stages.

Flush behaviour in M3: in the cycle when a taken branch or jump is in EX, the instruction in ID is discarded, the slot being fetched is left empty, and the PC is set to the target. The target is fetched in the next cycle. That is **2 flushed slots**.

The cycle formula from M1 holds, with stalls equal to 0 in M3:

`Cycles = instructions executed + 4 + stalls + flushed slots`

## 6. Hazard Unit Decisions

**In M3** only the flush exists, inside `step()`: `taken` and `flushed`. **There is no forwarding and no stall.** An instruction that reads a register written by one of the two instructions before it reads the old value, so M3 programs are *hazard-free* only when two filler instructions separate a producer and its consumer.

**M4 specification (planned).** The hazard unit recalculates its decisions every cycle and stores them in `hazard`.

| Field | Purpose |
|---|---|
| `stall`, `stallReason` | Indicate a stall and explain its cause |
| `forwardA`, `forwardB` | Select `NONE`, `EX/MEM` or `MEM/WB` as the operand source |
| `branchTaken`, `target` | Indicate a redirect and provide the new PC |
| `flush` | Indicates that IF/ID and ID/EX receive flush bubbles |
| `detail` | A sentence for the narration panel |

Rules:

1. **EX/MEM forwarding:** if `exmem.c.regWrite` is true, `exmem.rd` is not zero, and it matches a source register actually used (`reads1` / `reads2`) by the instruction in ID/EX, the result is forwarded from EX/MEM.
2. **MEM/WB forwarding:** if EX/MEM does not match, the same check is made on MEM/WB. The newest available result takes priority.
3. **Forwarded store data:** forwarded `rs2` supplies the data written by `kenya` and the comparison operand for branches.
4. **Load-use stall:** if the instruction in ID/EX is a load (`memRead = 1`) and its destination matches a source register used by the instruction in IF/ID, one stall bubble is inserted. The PC and IF/ID are held, so the loaded value can be forwarded.
5. **Branch or jump redirect:** when a branch is taken or a jump occurs in EX, the target is loaded into the PC and IF/ID and ID/EX are flushed. *(Implemented in M3.)*
6. **Forwarding disabled:** rules 1 and 2 are off. A dependent instruction stalls while its producer is in ID/EX or EX/MEM. A producer in WB is not a hazard, because the register file writes in the first half of the cycle and reads in the second. *(M3 already has this timing; M4 adds the stall.)*

## 7. Snapshots and Step Back

**Implemented in M3.** At the start of every `step()`, the simulator pushes a snapshot onto `hist`: PC, a copy of `regs` and `dmem`, the four latches, the counters (`cycle`, `executed`, `flushed`), `halted`, `error`, and the display fields (`stages`, `pcs`, `ctl`, `taken`). Because latches are replaced and never changed in place, only the two arrays need copying. The most recent 5000 snapshots are kept.

`back()` removes the latest snapshot and restores it. It works after a halt, after a flush and after an error. `reset()` clears the history. The pipeline chart (M4) will be built from the per-cycle `stages` and `pcs` recorded across cycles.

Changes to registers and memory are identified by comparing snapshots, as required by B6.

## 8. Worked Checks

### M3: a hazard-free program

```
eketsana nk0, letho, 5      i0
eketsana letho, letho, 0    i1   (filler)
eketsana letho, letho, 0    i2   (filler)
eketsa   nk1, nk0, nk0      i3
ema                         i4
```

| Cycle | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| i0 | IF | ID | EX | MEM | **WB** | | | | |
| i3 | | | | IF | **ID** | EX | MEM | WB | |
| i4 (`ema`) | | | | | IF | ID | EX | MEM | WB |

`i0` writes `nk0` in WB in cycle 5, and `i3` is in ID in the same cycle. The register file writes in the first half of the cycle and reads in the second, so `i3` reads the new value 5. The result is `nk1 = 10`. `ema` is in IF in cycle 5 and reaches WB in cycle 9, so the machine halts after **9 cycles** (5 instructions + 4, no flushes).

### M3: a taken branch

```
lekana letho, letho, fin
eketsana nk0, letho, 99     (wrong path)
eketsana nk1, letho, 99     (wrong path)
eketsana nk2, letho, 99     (wrong path)
fin: ema
```

`lekana` is in EX in cycle 3 and is taken. The instruction in ID and the slot being fetched are flushed, so `nk0`, `nk1` and `nk2` stay 0. `ema` is fetched in cycle 4 and reaches WB in cycle 8: **2 instructions + 4 + 2 flushed = 8 cycles**. This check is in `tests/pipeline.test.js`.

### M4: RAW hazard with forwarding (planned)

Consider three instructions:

- `eketsana nk0,letho,10`
- `eketsana nk1,letho,20`
- `eketsa nk2,nk0,nk1`

The third instruction reaches EX in cycle 5. At that point, I2 is in EX/MEM and I1 is in MEM/WB. Therefore, `forwardA = MEM/WB` supplies `nk0`, while `forwardB = EX/MEM` supplies `nk1`. No stall or bubble is required.

### M4: load-use hazard (planned)

Consider the A6(d) sequence:

- `nka bl1,0(bl0)`
- `eketsa nk3,nk3,bl1`

In cycle 3, the load is in ID/EX while the dependent instruction is in IF/ID. The hazard unit inserts one stall bubble and holds the PC and IF/ID. In cycle 5, the load is in MEM/WB, so `forwardB = MEM/WB`. This produces the one-cycle load-use stall expected in A6(d). In the M3 code, MEM/WB carries the loaded value in `val`.

## 9. Team Decisions to Confirm

The model assumes the following. The status column shows what the M3 code does.

| # | Assumption | Status |
|---|---|---|
| 1 | The processor uses a five-stage pipeline: IF, ID, EX, MEM and WB | Implemented |
| 2 | Each instruction occupies one 32-bit word, and the PC advances by 4 bytes during sequential execution | Implemented |
| 3 | The register file contains 16 registers, r0–r15, and writes to r0 are ignored | Implemented |
| 4 | Data memory is word-addressed internally; byte addresses are converted using `address / 4` | Implemented |
| 5 | Forwarding is enabled by default but can be disabled for testing | M4 |
| 6 | A load-use hazard requires one stall cycle when forwarding is enabled | M4 |
| 7 | Branches and jumps are resolved in EX, and a redirect flushes two younger pipeline slots | Implemented |
| 8 | `ema` halts execution when it reaches WB, allowing earlier instructions to complete; a flushed `ema` has no effect | Implemented |
| 9 | Instructions are counted as retired when valid instructions reach WB; CPI is `cycle / retired` | Counting implemented; CPI shown in M4 |
| 10 | Step Back restores the complete previous machine state | Implemented (`back()`) |

The code also assumes the decisions in `ISA_FREEZE.md` section 3. These boxes are still **unticked** and need the team's agreement:

1. `ema` halts at WB (same as item 8 above).
2. Register file: write in the first half of the cycle, read in the second.
3. A data address outside 0 to 1020, or not a multiple of 4, stops the simulator with a plain-language error.
4. An illegal instruction word stops the simulator with a plain-language error. It is reported when the word reaches EX unflushed, so a wrong-path word removed by a taken branch causes no false error.
5. Branch resolution in EX, predict not-taken, a taken branch or jump flushes 2 slots (same as item 7 above).

Two further choices were made in M3 and also need confirming: fetching stops once an `ema` is in flight (it restarts if that `ema` is flushed), and `run()` stops with an error after 100000 cycles to catch endless loops.

Any agreed changes must be reflected consistently in the data model, pipeline stages, hazard unit, tests and simulator interface.

## 10. Differences Between This M2 Draft and the M3 Code

| M2 draft | M3 code | Reason |
|---|---|---|
| `step(state) -> state` (pure function) | `Cpu.step()` changes the object; `snap()` and `back()` provide the history | Simpler for the interface; Back gives the same result |
| Latch fields `kind`, `text` | Not stored | Source text is found from `pc`; `kind` can be added in M4 |
| `rs1`, `rs2`, `rd`, `rs1Used`, `rs2Used`, `rs1Val`, `rs2Val` in ID/EX | `rd`, `a`, `b`, `imm`, and `c.rs1`, `c.rs2`, `c.reads1`, `c.reads2` | Same information, grouped with the control signals |
| `aluSrc`, `aluCtrl` (ADD, SUB, AND, OR, SLL, SLT) | `useImm`, `alu` (`add`, `sub`, `and`, `or`, `sll`) | The comparator does `lekana` and `nyane`, so no `SLT` or `SUB` is needed for branches |
| `branch` + `branchCond`, `jump` + `jumpReg` | `br` (`eq`, `lt`), `jump` (`jal`, `jalr`) | One field each |
| `memToReg`, `link` | Implied by `memRead` and by `jump` | MEM selects `val`; EX puts PC + 4 in `alu` for jumps |
| EX/MEM and MEM/WB carry `aluResult`, `memData` | EX/MEM has `alu`; MEM/WB has the single value `val` | The selection is made in MEM |
| `pcPlus4` in IF/ID | Not stored | The datapath view draws PC + 4 from the PC |
| `hazard`, `forwarding`, `stats.stalls` | Not present yet | M4 |

If the team prefers the M2 names, the code can be renamed without changing behaviour; the 16 pipeline tests would check it.
