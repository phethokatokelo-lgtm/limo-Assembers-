# LIMO hazards and forwarding (M2)

Pipeline: IF, ID, EX, MEM, WB. Registers: IF/ID, ID/EX, EX/MEM, MEM/WB.
Branches and jumps resolve in EX (A6c). Register numbers are 4 bits wide, so
every forwarding comparator compares two 4-bit values (A6a).

## 1. Hazard types

- **RAW (data) hazard:** an instruction reads a register that an earlier,
  still-in-flight instruction has not yet written back.
- **Load-use hazard:** a RAW hazard where the earlier instruction is `nka`.
  The loaded value exists only at the end of MEM, so forwarding alone cannot
  remove the delay.
- **Control hazard:** a taken `lekana`, `nyane`, `tsamaea` or `boela` changes
  the PC after younger instructions have already been fetched.

There is no structural hazard: instruction memory and data memory are separate,
so IF and MEM never compete (A1).

## 2. Forwarding rules

For ALU input A (rs1) the forwarding unit sets ForwardA; for input B (rs2) it
sets ForwardB. For `kenya`, the store data (rs2) uses the ForwardB path.

1. **From EX/MEM** if `EX/MEM.RegWrite = 1`, `EX/MEM.rd != r0` and
   `EX/MEM.rd = ID/EX.rs1` (or rs2).
2. **Else from MEM/WB** if `MEM/WB.RegWrite = 1`, `MEM/WB.rd != r0` and
   `MEM/WB.rd = ID/EX.rs1` (or rs2).
3. **Else** use the value read from the register file in ID.

Why EX/MEM is checked first: if two older instructions both write the same
register, the newer one (in EX/MEM) holds the correct value.
Why r0 is excluded: r0 is hard-wired to 0, so a write to it must never be
forwarded as a value.
The branch comparison in EX uses the same ForwardA/ForwardB values, so a
branch right after an ALU instruction needs no stall.

## 3. Load-use stall

Condition (checked in ID): `ID/EX.MemRead = 1` and `ID/EX.rd != r0` and
(`ID/EX.rd = IF/ID.rs1` or `ID/EX.rd = IF/ID.rs2`).

Action: hold the PC and IF/ID for one cycle, and insert a bubble into ID/EX
(all control bits 0, `valid = false`).

**Why one bubble is unavoidable (A6d).** The loaded word is read from data
memory during MEM, so it exists only at the end of that cycle. The instruction
right behind the load reaches EX in that same cycle and needs the value at the
start of it. Forwarding can only carry a value forward in time, to a later
cycle, never back to an earlier one. So the dependent instruction must wait one
cycle, and then receives the value from MEM/WB.

## 4. Control hazard

Branches and jumps resolve in EX. If the branch is taken (or the instruction
is `tsamaea` or `boela`), the hardware:

1. loads the target address into the PC,
2. turns IF/ID and ID/EX into bubbles (the two younger instructions are
   flushed).

Cost: 2 flushed slots per taken branch or jump. A branch that is not taken
costs nothing, because LIMO predicts not-taken and keeps fetching in sequence.
Resolving in ID would flush only 1 slot but needs an extra comparator and
target adder in ID, forwarding into ID, and extra stalls (A6c).

## 5. Worked cycle diagrams

Notation: IF, ID, EX, MEM, WB are stages; `stall` means the instruction waits
in ID; `X` means flushed (turned into a bubble).

### Diagram 1: forwarding into a store (no stall)

```
eketsana nk0, letho, 3
kenya    nk0, 0(letho)
```

| Cycle | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| eketsana nk0, letho, 3 | IF | ID | EX | MEM | WB | |
| kenya nk0, 0(letho) | | IF | ID | EX | MEM | WB |

`eketsana` computes nk0 in EX (cycle 3), so the value sits in EX/MEM at the
start of cycle 4. `kenya` is in EX in cycle 4 and needs nk0 as its store data.
ForwardB selects EX/MEM, and the data travels on to MEM in cycle 5. No stall.

### Diagram 2: load-use (one stall, from our lenane.limo)

```
nka    bl1, 0(bl0)
eketsa nk3, nk3, bl1
```

| Cycle | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| nka bl1, 0(bl0) | IF | ID | EX | MEM | WB | | |
| eketsa nk3, nk3, bl1 | | IF | ID | stall | EX | MEM | WB |

`nka` reads memory in MEM (cycle 4). Without the bubble, `eketsa` would be in
EX in cycle 4 and need the value before it exists. With the bubble it is in EX
in cycle 5, and ForwardB takes the value from MEM/WB. lenane.limo has this
pair in its loop, so it stalls once per iteration: 4 stalls in 47 cycles.

### Diagram 3: taken branch (two flushed instructions)

`nyane` at address B is taken and jumps to target T.

| Cycle | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| nyane (taken) | IF | ID | EX | MEM | WB | | | |
| B+4 (wrong path) | | IF | ID | X | | | | |
| B+8 (wrong path) | | | IF | X | | | | |
| T (branch target) | | | | IF | ID | EX | MEM | WB |

The branch outcome is known in EX (cycle 3). B+4 is in ID and B+8 is in IF at
that moment; both are flushed. The target is fetched in cycle 4. Cost: 2 slots.
kakaretso.limo has 4 taken branches, so 8 flushed slots in 31 cycles.

### Diagram 4: forwarding from MEM/WB (one instruction between)

```
eketsana nk0, letho, 3
eketsana nk1, letho, 4
eketsa   nk2, nk0, nk1
```

| Cycle | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| eketsana nk0, letho, 3 | IF | ID | EX | MEM | WB | | |
| eketsana nk1, letho, 4 | | IF | ID | EX | MEM | WB | |
| eketsa nk2, nk0, nk1 | | | IF | ID | EX | MEM | WB |

In cycle 5, `eketsa` is in EX. Its input nk1 comes from EX/MEM (rule 1) and its
input nk0 comes from MEM/WB (rule 2), because the first instruction is now two
stages ahead. No stall.

## 6. Cost without forwarding (the Forwarding OFF switch)

Assumption: the register file is written in the first half of a clock cycle
and read in the second half, so a value written in WB can be read by an
instruction in ID in the same cycle. The simulator must use the same rule.

| Dependency distance | Stalls with forwarding | Stalls without forwarding |
|---|---|---|
| Next instruction (ALU result) | 0 | 2 |
| One instruction between | 0 | 1 |
| Two or more between | 0 | 0 |
| Load, next instruction | 1 | 2 |

## 7. Evidence from our own programs

| Program | Instructions | Stalls | Flushed slots | Cycles |
|---|---|---|---|---|
| kakaretso.limo | 19 | 0 | 8 | 31 |
| lenane.limo | 33 | 4 | 6 | 47 |
| mosebetsi.limo | 12 | 0 | 6 | 22 |

Cycles = instructions executed + 4 (pipeline fill) + stalls + flushed slots.

## 8. AI use

Drafted with Claude and then checked by the author against the ISA
specification (M1) and the cycle diagrams in A6. Recorded in AI_USE.md.
