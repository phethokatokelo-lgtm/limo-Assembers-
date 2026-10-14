# LIMO Processor — Design Document (M1)

## 1. Overview
LIMO is a RISC-V-style processor implemented for CS3520. This document
describes the planned architecture for Milestone 1: the instruction set,
the datapath, the control logic, and the hazard-handling strategy.

## 2. Design Goals
- Correctly execute the LIMO instruction set defined in `ISA_SPECIFICATION.md`.
- Keep the datapath simple and traceable for grading/defence.
- Define a clear hazard-handling plan ahead of the pipelined implementation.

## 3. Architecture Overview
- **ISA:** RISC-V-style, defined in `docs/ISA_SPECIFICATION.md` (A1–A6).
- **Datapath style (M1):** single-cycle baseline, with the hazard plan below
  prepared for the later pipelined version.
- **Main blocks:** Program Counter, Instruction Memory, Register File, ALU,
  Data Memory, Control Unit, and the Hazard Unit.

## 4. Datapath
1. **Fetch** — PC indexes instruction memory; PC increments by 4 (or branches).
2. **Decode** — instruction fields drive the Control Unit and read the
   register file.
3. **Execute** — the ALU computes results / addresses / branch conditions.
4. **Memory** — load/store instructions access data memory.
5. **Write-back** — results are written to the destination register.

## 5. Control Unit
The Control Unit decodes the opcode/funct fields and produces the control
signals (RegWrite, ALUSrc, ALUOp, MemRead, MemWrite, MemToReg, Branch, PCSrc).
Signal values per instruction type are listed in `ISA_SPECIFICATION.md`.

## 6. Hazard Handling (owner: Phethoka — Hazard-unit lead)
This section specifies how the processor will detect and resolve hazards once
the design moves to a pipeline. For M1 it defines the plan and the unit's
interface.

### 6.1 Types of hazards addressed
- **Data hazards** — an instruction needs a result not yet written back.
- **Control hazards** — branches/jumps change the PC before the outcome is known.
- **Structural hazards** — avoided by separate instruction and data memories.

### 6.2 Hazard Unit — responsibilities
- Compare source registers of the current instruction against destination
  registers of in-flight instructions to detect data hazards.
- Decide between **forwarding** (bypassing) and **stalling** (inserting bubbles)
  depending on whether the needed value is available yet.
- On a taken branch, signal a **flush** of the wrongly-fetched instruction(s).

### 6.3 Forwarding plan
- Forward ALU results from later stages back to the ALU inputs when the
  destination register of a prior instruction matches a source register of the
  current one and `RegWrite` is set.
- Prefer the most recent matching result.

### 6.4 Stalling plan
- **Load-use hazard:** a load followed immediately by a dependent instruction
  cannot be solved by forwarding alone — stall one cycle, then forward.
- Stalling holds the PC and the fetch/decode registers and inserts a bubble.

### 6.5 Control-hazard plan
- Resolve branches as early as practical.
- On a taken branch, flush the incorrectly fetched instruction(s) using PCSrc.

### 6.6 Hazard Unit interface (inputs / outputs)
- **Inputs:** source register IDs of the current instruction; destination
  register IDs + RegWrite/MemRead signals of in-flight instructions.
- **Outputs:** forwarding-select signals, stall (PC/pipeline-register enable),
  and flush signals.

## 7. Testing & Verification Plan
- Trace sample `.limo` programs through the datapath (see `examples/`).
- Add targeted tests under `tests/` for forwarding, load-use stalls, and
  taken branches.

## 8. Open Questions / Next Steps (M2)
- Finalise the pipeline register layout.
- Confirm the exact branch-resolution stage.
- Implement and test the Hazard Unit in hardware/HDL.

## 9. Contributors
- Phethoka — Hazard-unit lead, Scrum/release lead (this document)
- Letuka — ISA architect
- (other members per TEAM_CHARTER.md)