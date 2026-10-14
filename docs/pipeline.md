# Module Design — Pipeline (M1)

**Owner:** Moletsane (Student ID: 202201258)
**Role:** Pipeline Lead
**Milestone:** M1

## 1. Role Summary
Moletsane owns the **pipeline structure** of the LIMO processor — dividing
instruction execution into stages, placing the pipeline registers that carry
data and control signals between those stages, and ensuring instructions flow
through the pipeline correctly, one stage per clock cycle.

## 2. Responsibilities (M1)
- Define the **pipeline stages** and what work happens in each.
- Specify the **pipeline registers** between stages and what each one carries.
- Define how **control signals travel down the pipeline** alongside the data.
- Coordinate with the Hazard-unit lead (Phethoka): the pipeline must support
  **stalls (freezing registers), bubbles, and flushes** that the hazard unit
  requests.
- Coordinate with the Datapath/ALU and ISA leads so each stage carries the
  right fields.

## 3. Pipeline Stages
LIMO uses the classic 5-stage RISC-V pipeline:

1. **IF** — Instruction Fetch: read the instruction from instruction memory;
   compute PC + 4.
2. **ID** — Instruction Decode: decode the instruction, read the register file,
   generate control signals.
3. **EX** — Execute: the ALU performs arithmetic, address calculation, and
   branch comparison.
4. **MEM** — Memory: load/store instructions access data memory.
5. **WB** — Write-Back: write the result into the destination register.

Ideally one instruction completes every cycle once the pipeline is full.

## 4. Pipeline Registers
Registers sit **between** each pair of stages and hold everything the next stage
needs. They latch on each clock edge so each stage works on a different
instruction.

| Register | Sits between | Carries (examples) |
|---|---|---|
| IF/ID  | IF → ID  | fetched instruction, PC |
| ID/EX  | ID → EX  | register values, immediate, control signals, dest reg |
| EX/MEM | EX → MEM | ALU result, store data, control signals, dest reg |
| MEM/WB | MEM → WB | loaded data, ALU result, control signals, dest reg |

> Control signals are generated once in ID and then **ride along** these
> registers to the stage where each one is used.

## 5. Supporting Hazard Handling
The pipeline must give the hazard unit the hooks it needs:
- **Stall:** freeze the PC and the IF/ID register (hold their values) for a cycle.
- **Bubble:** insert a NOP by clearing the control signals in the ID/EX register.
- **Flush:** clear a wrongly-fetched instruction after a taken branch.

These are driven by the hazard unit's stall/flush signals — the pipeline just
has to be built so those actions are possible.

## 6. Interface
- **Inputs:** clock, reset, and the hazard unit's stall/flush/enable signals.
- **Outputs:** the staged instruction/data/control values held in each pipeline
  register, available to the datapath and hazard unit.

## 7. Testing & Verification Plan
- Trace sample `.limo` programs in `examples/` and confirm each instruction
  advances one stage per cycle.
- Test that a stall correctly holds the pipeline and a bubble produces no
  side effects.
- Confirm a taken branch flushes the right instruction.

## 8. Next Steps (M2)
- Implement the pipeline registers and stage logic in hardware/HDL.
- Integrate with the hazard unit so stalls, bubbles, and flushes work end to end.

## 9. Related Docs
- `docs/design.md` — overall design incl. hazard handling (Phethoka)
- `docs/ISA_SPECIFICATION.md` — instruction formats (Letuka)
- `docs/TEAM_CHARTER.md` — roles and responsibilities