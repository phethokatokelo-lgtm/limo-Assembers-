\# LIMO Pipeline-Register Data Model (M2, R3)



\*\*Status:\*\* Draft for team review  

\*\*Code:\*\* `src/pipeline-model.js`  

\*\*Tests:\*\* `tests/pipeline-model.test.js`



\## 1. Purpose



The simulator models the processor as a function, `step(state) -> state`, where each call represents one clock cycle. This document defines the machine state and pipeline registers used by the stages (M3), hazard unit (M4), and interface (M4).



The model describes the processor's microarchitecture, not the ISA, as explained in A6(b).



\## 2. Machine State



The machine state contains the information needed to execute and monitor the program.



| Field | Type | Purpose |

|---|---|---|

| `cycle` | Integer | Number of completed clock cycles |

| `pc` | Integer | Byte address of the next instruction |

| `imem` | 1024 words | Instruction memory |

| `dmem` | 256 words | Data memory, indexed by `address / 4` |

| `regs` | 16 integers | Registers r0–r15; writes to r0 are ignored |

| `ifid`, `idex`, `exmem`, `memwb` | Latches | Four pipeline registers |

| `hazard` | Object | Hazard unit decisions for the current cycle |

| `forwarding` | Boolean | Enables or disables forwarding |

| `halted` | Boolean | Indicates that `ema` has reached WB |

| `error` | String or null | Explains why execution stopped |

| `stats` | Object | Tracks retired instructions, stalls, and flushes |



CPI is calculated as `cycle / retired`.



\## 3. Pipeline Registers



Each pipeline latch contains `valid`, `kind`, `pc`, `word`, and `text`. These fields identify whether the latch contains a real instruction, why it exists, its address, its encoding, and its source line.



\### IF/ID



Stores the fetched instruction and `pcPlus4`, which is displayed in the datapath view.



\### ID/EX



Stores the decoded register numbers (`rs1`, `rs2`, `rd`), source-use flags (`rs1Used`, `rs2Used`), register values (`rs1Val`, `rs2Val`), the immediate (`imm`), and control signals (`ctrl`).



The source-use flags prevent false hazards when an instruction does not actually read a register.



\### EX/MEM



Carries the destination register (`rd`), `aluResult`, forwarded `storeData`, and the control signals `regWrite`, `memRead`, `memWrite`, `memToReg`, and `halt`.



\### MEM/WB



Carries `rd`, `aluResult`, loaded data (`memData`), and the control signals `regWrite`, `memToReg`, and `halt`.



The write-back value is selected using:



`memToReg ? memData : aluResult`



Signals needed only within a stage, such as the branch comparison and PC mux decision, are not stored in pipeline registers. They are recorded in `hazard` and displayed in the datapath view.



\## 4. Control Signals



The control unit generates signals in ID using the opcode, funct3, and funct7 fields. These signals travel through the pipeline and are removed when later stages no longer need them.



| Signal | Meaning |

|---|---|

| `regWrite` | Enables register write-back in WB |

| `aluSrc` | Selects a register or immediate for ALU input B |

| `aluCtrl` | Selects ADD (0), SUB (1), AND (2), OR (3), SLL (4), or SLT (5) |

| `memRead` | Reads data memory in MEM |

| `memWrite` | Writes data memory in MEM |

| `memToReg` | Selects loaded data or the ALU result for write-back |

| `branch` | Indicates a conditional branch |

| `branchCond` | Selects equal (EQ) or signed less-than (LT) |

| `jump` | Enables `tsamaea`, using `PC + 4 × offset` |

| `jumpReg` | Enables `boela`, using `(rs1 + imm)` with the low two bits cleared |

| `link` | Writes `PC + 4` to `rd` as the return address |

| `halt` | Stops execution when `ema` reaches WB |



The instruction control table defines the values for each instruction:



| Instruction | regWrite | aluSrc | aluCtrl | memRead | memWrite | memToReg | branch | branchCond | jump | jumpReg | link | halt |

|---|---:|---:|---|---:|---:|---:|---:|---|---:|---:|---:|---:|

| `eketsa` | 1 | 0 | ADD | 0 | 0 | 0 | 0 | – | 0 | 0 | 0 | 0 |

| `tlosa` | 1 | 0 | SUB | 0 | 0 | 0 | 0 | – | 0 | 0 | 0 | 0 |

| `le` | 1 | 0 | AND | 0 | 0 | 0 | 0 | – | 0 | 0 | 0 | 0 |

| `kapa` | 1 | 0 | OR | 0 | 0 | 0 | 0 | – | 0 | 0 | 0 | 0 |

| `eketsana` | 1 | 1 | ADD | 0 | 0 | 0 | 0 | – | 0 | 0 | 0 | 0 |

| `suthela` | 1 | 1 | SLL | 0 | 0 | 0 | 0 | – | 0 | 0 | 0 | 0 |

| `nka` | 1 | 1 | ADD | 1 | 0 | 1 | 0 | – | 0 | 0 | 0 | 0 |

| `kenya` | 0 | 1 | ADD | 0 | 1 | 0 | 0 | – | 0 | 0 | 0 | 0 |

| `lekana` | 0 | 0 | SUB | 0 | 0 | 0 | 1 | EQ | 0 | 0 | 0 | 0 |

| `nyane` | 0 | 0 | SLT | 0 | 0 | 0 | 1 | LT | 0 | 0 | 0 | 0 |

| `tsamaea` | 1 | – | – | 0 | 0 | 0 | 0 | – | 1 | 0 | 1 | 0 |

| `boela` | 1 | 1 | ADD | 0 | 0 | 0 | 0 | – | 0 | 1 | 1 | 0 |

| `ema` | 0 | 0 | ADD | 0 | 0 | 0 | 0 | – | 0 | 0 | 1 |



A dash means the signal is unused and is stored as 0. Branch targets use a separate adder to calculate `PC + 4 × offset`; the ALU performs the comparison.



`PCSrc` is decided in EX, not ID:



`PCSrc = jump or jumpReg or (branch and condition true)`



It is displayed as an EX output in the control view.



\## 5. Bubbles and Flushes



A bubble has `valid = false`, all control signals set to 0, and `rd = 0`, ensuring that it cannot write a result.



| Kind | Purpose | Statistics |

|---|---|---|

| `instr` | Represents a real instruction | Counted as retired when it reaches WB |

| `fill` | Represents an initially empty pipeline stage | Not counted |

| `stall` | Inserted when a hazard requires a stall | Increments `stats.stalls` |

| `flush` | Replaces wrong-path instructions after a taken branch or jump | Counts two flushed slots per redirect |

| `drain` | Represents stopped fetching while the pipeline finishes | Not counted |



These categories support the M1 cycle formula:



`Cycles = instructions executed + 4 + stalls + flushed slots`



\## 6. Hazard Unit Decisions



The hazard unit recalculates its decisions every cycle.



| Field | Purpose |

|---|---|

| `stall`, `stallReason` | Indicate a stall and explain its cause |

| `forwardA`, `forwardB` | Select `NONE`, `EX/MEM`, or `MEM/WB` as the operand source |

| `branchTaken`, `target` | Indicate a redirect and provide the new PC |

| `flush` | Indicates that IF/ID and ID/EX receive flush bubbles |

| `detail` | Provides a sentence for the narration panel |



The hazard unit follows these rules:



1\. \*\*EX/MEM forwarding:\*\* If `exmem.ctrl.regWrite` is true, `exmem.rd` is not zero, and it matches a source register actually used by ID/EX, the result is forwarded from EX/MEM.



2\. \*\*MEM/WB forwarding:\*\* If EX/MEM does not match, the same check is performed on MEM/WB. The newest available result takes priority.



3\. \*\*Forwarded store data:\*\* Forwarded `rs2` supplies the data written by `kenya` and the comparison operand for branches.



4\. \*\*Load-use stall:\*\* If the instruction in ID/EX is a load (`memRead = 1`) and its destination matches a source register used by the instruction in IF/ID, one stall bubble is inserted. The PC and IF/ID are held, allowing the loaded value to become available for forwarding.



5\. \*\*Branch or jump redirect:\*\* When a branch is taken or a jump occurs in EX, `branchTaken` is set, the target is loaded into the PC, and IF/ID and ID/EX are flushed.



6\. \*\*Forwarding disabled:\*\* When forwarding is OFF, rules 1 and 2 are disabled. A dependent instruction stalls while its producer is in ID/EX or EX/MEM. A producer in WB is not a hazard because the register file writes in the first half of the cycle and reads in the second.



\## 7. Snapshots and Step Back



After each cycle, the simulator saves a deep-copy snapshot of the machine state in the history list. Step Back removes the latest snapshot to restore the previous state.



Changes to registers and memory are identified by comparing snapshots, as required by B6. The pipeline chart is built from each latch's `text` and `kind` recorded across cycles.



\## 8. Worked Checks Against M1



\### RAW hazard with forwarding



Consider three instructions:



\- `eketsana nk0,letho,10`

\- `eketsana nk1,letho,20`

\- `eketsa nk2,nk0,nk1`



The third instruction reaches EX in cycle 5. At that point, I2 is in EX/MEM and I1 is in MEM/WB. Therefore, `forwardA = MEM/WB` supplies `nk0`, while `forwardB = EX/MEM` supplies `nk1`.



No stall or bubble is required.



\### Load-use hazard



Consider the A6(d) sequence:



\- `nka bl1,0(bl0)`

\- `eketsa nk3,nk3,bl1`



In cycle 3, the load is in ID/EX while the dependent instruction is in IF/ID. The hazard unit inserts one stall bubble and holds the PC and IF/ID.



In cycle 5, the load is in MEM/WB, so `forwardB = MEM/WB`. Since `memToReg = 1`, the forwarded value comes from `memData`. This produces the one-cycle load-use stall expected in A6(d).



\## 9. Team Decisions to Confirm



The model currently assumes the following:



1\. The processor uses a five-stage pipeline: IF, ID, EX, MEM, and WB.

2\. Each instruction occupies one 32-bit word, and the PC advances by 4 bytes during sequential execution.

3\. The register file contains 16 registers, r0–r15, and writes to r0 are ignored.

4\. Data memory is word-addressed internally, with byte addresses converted using `address / 4`.

5\. Forwarding is enabled by default but can be disabled for testing.

6\. A load-use hazard requires one stall cycle when forwarding is enabled.

7\. Branches and jumps are resolved in EX, and a redirect flushes two younger pipeline slots.

8\. The instruction `ema` halts execution when it reaches WB, allowing earlier instructions to complete.

9\. Instructions are counted as retired when valid instructions reach WB, and CPI is calculated as `cycle / retired`.

10\. Step Back restores the complete previous machine state, including registers, memory, pipeline registers, statistics, and control decisions.



The team should review and confirm these assumptions before implementation is finalised. Any agreed changes must be reflected consistently in the data model, pipeline stages, hazard unit, tests, and simulator interface.

