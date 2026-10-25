# LIMO Instruction Set Architecture: Specification

**Version 1.0 (frozen; see `ISA_FREEZE.md`)**
CS3520 Computer Organisation and Architecture, National University of Lesotho, AY 2026/2027
Team: Assemblers (lab group A). Machine-readable form: `src/isa.json` (the two must always agree).

If your course ISA Specification Template uses different headings, copy each section below into it. The sections follow the handout items A1 to A6.

## 0. Contents

1. Overview (A1)
2. Register file (A2)
3. Instruction formats and immediates (A3)
4. Instruction set and Sesotho mnemonics (A4)
5. Assembly language rules (A4)
6. Encoding and worked examples (A5)
7. Programming model and behaviour
8. Design-decision log (A6)
9. Sample programs
10. Mapping to RV32I
11. Reference implementation notes (not part of the ISA)
12. References and AI-use declaration

## 1. Overview (A1)

LIMO is a small 32-bit load-store processor whose assembly language is Sesotho. It is derived from RISC-V (RV32I). Programs see 16 registers, a program counter and a data memory. Every instruction is 32 bits long and there are 13 instructions.

| Item | Specification | Rationale |
|---|---|---|
| Style | 32-bit load-store with fixed 32-bit instructions. Only `nka` (load) and `kenya` (store) use memory. 13 instructions. | Same word size as RV32I. Memory access only in load and store keeps the ALU and the MEM stage simple and the hazard rules few. Fixed length means fetch is PC + 4 and decode is one step. Rejected: arithmetic with memory operands, because the datapath becomes more complex. |
| Registers | 16 registers r0 to r15 (12 general-purpose r3 to r14; 4 special r0, r1, r2, r15) plus the PC. Register fields are 4 bits. | Shorter fields free bits for bigger immediates and make forwarding comparators smaller. The cost is fewer registers and more spills to memory. Rejected: 32 registers (RV32I) and 8 registers (too few for array loops). |
| Addressing modes | Register (R-type); immediate (14-bit signed); base + offset (`nka`, `kenya`, `boela`); PC-relative with a word offset (`lekana`, `nyane`, `tsamaea`). | Same modes as RV32I. Enough for loops, arrays and procedure calls with little extra hardware. |
| Memory | Byte-addressed, little-endian, word-aligned. Separate instruction memory (4 KiB, 1024 words) and data memory (1 KiB, 256 words), both starting at address 0. Reset: PC = 0, registers = 0, data memory = 0. | Same as RISC-V. Separate memories mean IF and MEM never clash, so there is no structural hazard. `nka` and `kenya` offsets must be multiples of 4 (the assembler checks). A misaligned access is unspecified because LIMO has no exceptions. Reset makes tests repeatable. Rejected: one shared memory. |
| Formats | R, I, S, B and J, all 32 bits. Opcode [6:0] and the low field [10:7] are in the same place in every format. funct3 [13:11] and rs1 [17:14] are the same in R, I, S and B. | Decode and register-file reads are the same for all formats, so the control unit only reads the opcode. Rejected: RISC-V's scrambled B and J immediates (harder to read and wire, no gain here). |

### 1.1 Departures from RV32I

| # | Departure | Reason |
|---|---|---|
| 1 | 16 registers, 4-bit register fields | Fewer comparator bits and freed encoding bits. Cost: register pressure. |
| 2 | Different field positions (rd [10:7], funct3 [13:11], rs1 [17:14]) | Follows from 1: the freed bits go to the immediate. |
| 3 | 14-bit immediates (RV32I has 12) | Uses the 2 bits freed by 1 in I, S and B. |
| 4 | Branch and jump offsets count words, not bytes | Instruction addresses are multiples of 4, so the low 2 bits are always 0. Word offsets give 4 times the reach. |
| 5 | B and J immediates are not scrambled | Simpler to encode and decode by hand. |
| 6 | No `lui` or `auipc` | 14-bit immediates cover the 1 KiB data memory. Bigger constants use `eketsana`, `suthela` and `eketsa`. |
| 7 | New halt instruction `ema` | LIMO has no system calls or exceptions, so the simulator needs a stop instruction. It uses the RISC-V custom-0 opcode, which standard instructions never use. |
| 8 | Subset of RV32I only (13 instructions, word load and store only) | Enough for the sample programs and keeps the hazard unit small. |

## 2. Register file (A2)

| Number | Sesotho name | Alias | Type | Purpose and convention |
|---|---|---|---|---|
| r0 | `letho` | zero | SPR | Hard-wired to 0. Writes are ignored. |
| r1 | `khutlo` | ra | SPR | Return address, written by `tsamaea` and `boela`. |
| r2 | `qubu` | sp | SPR | Stack pointer (convention only; no push or pop). |
| r3 to r6 | `nk0` to `nk3` (nakoana) | t0 to t3 | GPR | Temporaries. |
| r7 to r10 | `bl0` to `bl3` (boloka) | s0 to s3 | GPR | Saved registers. |
| r11 to r14 | `nt0` to `nt3` (ntlha) | a0 to a3 | GPR | Arguments and results. |
| r15 | `motheo` | gp | SPR | Global pointer (convention only); base for data addresses. |
| PC | `sebaka` | pc | SPR | Byte address of the current instruction. Not in the register file. Changed only by PC + 4, branches and jumps. |

**Rationale.** The alias column uses the RISC-V ABI names, so LIMO programs translate directly for the Ripes comparison (section 10). The register numbers differ from RISC-V. The Sesotho names are short to type. The conventions for r1, r2, r15 and the three register groups are software rules only: the hardware treats r1 to r15 alike, and only r0 is special. The PC is separate from the register file so that no instruction can write it by accident.

**Effect on field widths.** 16 registers need 4 bits per register field (RV32I: 5). In R-type, three fields save 3 bits, which are kept reserved. In I, S and B, two fields save 2 bits, which go to the immediate (12 to 14 bits).

## 3. Instruction formats and immediates (A3)

| Bits | 31 to 25 | 24 to 22 | 21 to 18 | 17 to 14 | 13 to 11 | 10 to 7 | 6 to 0 |
|---|---|---|---|---|---|---|---|
| R | funct7 | rsv | rs2 | rs1 | funct3 | rd | opcode |
| I | imm[13:0] (bits 31 to 18) | | | rs1 | funct3 | rd | opcode |
| S | imm[13:4] (bits 31 to 22) | | rs2 | rs1 | funct3 | imm[3:0] | opcode |
| B | off[13:4] (bits 31 to 22) | | rs2 | rs1 | funct3 | off[3:0] | opcode |
| J | off[20:0] (bits 31 to 11) | | | | | rd | opcode |

(A cell spanning several columns in the table above is shown at its starting column. The exact bit positions are in `isa.json`, section `formats`.)

| Field | R | I | S | B | J |
|---|---|---|---|---|---|
| opcode | [6:0] | [6:0] | [6:0] | [6:0] | [6:0] |
| rd | [10:7] | [10:7] | | | [10:7] |
| funct3 | [13:11] | [13:11] | [13:11] | [13:11] | |
| rs1 | [17:14] | [17:14] | [17:14] | [17:14] | |
| rs2 | [21:18] | | [21:18] | [21:18] | |
| rsv | [24:22] | | | | |
| funct7 | [31:25] | | | | |
| imm / off | | [31:18] | [31:22] and [10:7] | [31:22] and [10:7] | [31:11] |

### 3.1 Immediate ranges

| Use | Width | Range | Unit |
|---|---|---|---|
| I and S immediates (`eketsana`, `nka`, `kenya`, `boela`) | 14-bit signed | -8192 to +8191 | bytes or plain numbers |
| `nka` and `kenya` offsets | as above | must also be multiples of 4 | bytes |
| Shift amount (`suthela`) | 5 bits | 0 to 31 (imm[13:5] must be 0) | bits |
| B offset (`lekana`, `nyane`) | 14-bit signed | -8192 to +8191 words (-32,768 to +32,764 bytes) | words |
| J offset (`tsamaea`) | 21-bit signed | -1,048,576 to +1,048,575 words (about +/- 4 MiB) | words |

Offset = (target address - address of this instruction) / 4. The assembler rejects out-of-range values and names the line and the allowed range.

**Rationale.** R-type bits [24:22] are reserved and must be 0, for future extensions. In I, S and B the 2 bits freed by 4-bit register fields go to the immediate. J has no register or funct3 fields, so most of the word is offset. S and B immediates are split so that rs1 and rs2 stay in fixed places, as in RISC-V. The split pieces join in a simple order (low bits at [10:7], high bits at the top), unlike RISC-V's scrambled order.

## 4. Instruction set and Sesotho mnemonics (A4)

### 4.1 Glossary and opcode table

| Class | Mnemonic | Meaning | Syntax | Operation | Fmt | Opcode (bin / hex) | funct3 | funct7 | RV32I |
|---|---|---|---|---|---|---|---|---|---|
| Arithmetic | `eketsa` | ho eketsa, "to add" | `eketsa rd, rs1, rs2` | R[rd] = R[rs1] + R[rs2] | R | 0110011 / 0x33 | 000 | 0000000 | add |
| Arithmetic | `tlosa` | ho tlosa, "to take away" | `tlosa rd, rs1, rs2` | R[rd] = R[rs1] - R[rs2] | R | 0110011 / 0x33 | 000 | 0100000 | sub |
| Arithmetic | `eketsana` | eketsa + -ana, "add a small constant" (coined) | `eketsana rd, rs1, imm` | R[rd] = R[rs1] + sext(imm14) | I | 0010011 / 0x13 | 000 | none | addi |
| Logic | `le` | le, "and" | `le rd, rs1, rs2` | R[rd] = R[rs1] & R[rs2] | R | 0110011 / 0x33 | 111 | 0000000 | and |
| Logic | `kapa` | kapa, "or" | `kapa rd, rs1, rs2` | R[rd] = R[rs1] or R[rs2] (bitwise) | R | 0110011 / 0x33 | 110 | 0000000 | or |
| Logic | `suthela` | ho suthela, "to move towards" | `suthela rd, rs1, sh` | R[rd] = R[rs1] << sh | I | 0010011 / 0x13 | 001 | none | slli |
| Memory | `nka` | ho nka, "to take" | `nka rd, off(rs1)` | R[rd] = Mem32[R[rs1] + sext(off)] | I | 0000011 / 0x03 | 010 | none | lw |
| Memory | `kenya` | ho kenya, "to put in" | `kenya rs2, off(rs1)` | Mem32[R[rs1] + sext(off)] = R[rs2] | S | 0100011 / 0x23 | 010 | none | sw |
| Branch | `lekana` | ho lekana, "to be equal" | `lekana rs1, rs2, label` | if R[rs1] == R[rs2]: PC = PC + 4*off | B | 1100011 / 0x63 | 000 | none | beq |
| Branch | `nyane` | nyane, "small / less" | `nyane rs1, rs2, label` | if R[rs1] < R[rs2] (signed): PC = PC + 4*off | B | 1100011 / 0x63 | 100 | none | blt |
| Jump | `tsamaea` | ho tsamaea, "to go" | `tsamaea rd, label` | R[rd] = PC + 4; PC = PC + 4*off | J | 1101111 / 0x6F | none | none | jal |
| Jump | `boela` | ho boela, "to return" | `boela rd, rs1, imm` | R[rd] = PC + 4; PC = (R[rs1] + sext(imm)) & ~3 | I | 1100111 / 0x67 | 000 | none | jalr |
| System | `ema` | ho ema, "to stop" | `ema` | stop fetching, drain the pipeline, halt | none | 0001011 / 0x0B | none | none | none |

**Pseudo-instruction (assembler only).** `khutla` = `boela letho, khutlo, 0` (ho khutla, "to return from a procedure"). Machine code 0x00004067.

Opcodes and funct3 match RISC-V where possible. `tlosa` differs from `eketsa` only in funct7 bit 30, as in RISC-V. For `suthela`, the shift amount is imm[4:0] and imm[13:5] must be 0. `ema` uses RISC-V custom-0 (reserved for extensions, so it cannot clash with a standard instruction); its other bits are 0.

**Class counts against the handout (A3):** arithmetic 3 (one with an immediate); logic 3 (one a shift); word load and word store; 2 conditional branches; 2 jumps; 1 system. Total 13 (allowed 10 to 20). No multiply or divide, floating point, CSRs or exceptions.

### 4.2 Rationale for every instruction

| Instruction | Why it is in LIMO |
|---|---|
| `eketsa` | The basic two-register add. Every program needs it. Same encoding as RISC-V `add`, so the comparison with Ripes is direct. |
| `tlosa` | Needed for counting down and for differences. It shares opcode and funct3 with `eketsa`, and only funct7 bit 30 differs, as in RISC-V, so the ALU control needs one extra bit. |
| `eketsana` | Adds a constant. With `letho` as the source it loads a constant (RISC-V `li`), and with 0 it copies a register (`mv`). One instruction replaces both, which keeps the set small. Negative constants are allowed, so no separate subtract-immediate is needed. |
| `le` | Bitwise AND for masks and tests. Part of the required logic class. |
| `kapa` | Bitwise OR, to set bits and combine masks. |
| `suthela` | Shift left is the cheapest way to multiply by 4 (array index to byte offset) because LIMO has no multiply. It also gives the required shift. No right shifts, to keep the ALU small. |
| `nka` | The only way to read data memory. Word-only loads keep alignment simple, with no byte or halfword cases and no sign-extension choices. Its load-use hazard (one stall even with forwarding) is a deliberate feature for the simulator to show. |
| `kenya` | The only way to write data memory. The split immediate keeps rs1 and rs2 in fixed places. |
| `lekana` | Equality test and branch in one instruction (no flags register). Covers "skip if equal" and loops that run to an exact value. |
| `nyane` | Signed less-than test and branch in one instruction, the usual loop test `i < n`. Other comparisons are made by swapping the operands or by branching around. |
| `tsamaea` | Procedure call with the return address saved in rd. PC-relative with a 21-bit word offset for long reach. With rd = `letho` it is an unconditional jump. |
| `boela` | Return from a procedure and indirect jump. Same format as the I-type, so no extra hardware. The low 2 bits are cleared so the target is word-aligned (RISC-V clears only bit 0). |
| `ema` | The simulator needs a defined end. LIMO has no system calls, so one halt instruction is used. The custom-0 opcode cannot clash with a standard instruction. |

## 5. Assembly language rules (A4)

1. One instruction per line. A label (name and ":") may be on its own line or before an instruction. Comments start with ";".
2. Mnemonics, register names and labels are not case-sensitive (ADD = add).
3. A register may be written as a number (`r3`), an alias (`t0`) or a Sesotho name (`nk0`, `letho`). Operands are separated by commas. Memory operands are written `offset(register)`.
4. Immediates are decimal or hexadecimal (`0x...`) and may be negative.
5. A label cannot have the same name as a register, an instruction or a pseudo-instruction.
6. There are no directives in version 1.0. A `.word` or `.data` directive can be added to the assembler later without changing the ISA.
7. Errors are written in simple language and give the line number and, where useful, the allowed range or the nearest instruction name.

**Apostrophes (ts', ch').** Both the straight apostrophe (') and the curly apostrophes are accepted and removed when names are compared, so `ts'ebetso`, `ts’ebetso` and `tsebetso` are one name. Reason: apostrophes are typed differently on different keyboards and phones, and word processors change them, which causes spelling mistakes that are hard to see. Labels that become equal after this rule are reported as duplicates, so no program can silently mean two things. No LIMO mnemonic uses an apostrophe, so the rule affects only labels.

## 6. Encoding and worked examples (A5)

Each example is derived by hand: each field value is shifted to its bit position and the results are added.

### 6.1 R-type: `eketsa nk0, nk0, nk1`

nk0 = r3, nk1 = r4. Fields: funct7 0, rsv 0, rs2 4, rs1 3, funct3 0, rd 3, opcode 0x33.

rs2 << 18 = 0x100000; rs1 << 14 = 0x00C000; rd << 7 = 0x000180; opcode = 0x33. Sum = **0x0010C1B3**.
Binary: `0000 0000 0001 0000 1100 0001 1011 0011`.

### 6.2 I-type: `eketsana nk2, letho, 6`

nk2 = r5, letho = r0. Fields: imm 6, rs1 0, funct3 0, rd 5, opcode 0x13.

imm << 18 = 0x180000; rd << 7 = 0x000280; opcode = 0x13. Sum = **0x00180293**.
Binary: `0000 0000 0001 1000 0000 0010 1001 0011`.

### 6.3 S-type: `kenya nk3, 16(letho)`

nk3 = r6, offset 16. imm[13:4] = 1, imm[3:0] = 0. Fields: rs2 6, rs1 0, funct3 2, opcode 0x23.

imm[13:4] << 22 = 0x400000; rs2 << 18 = 0x180000; funct3 << 11 = 0x001000; imm[3:0] << 7 = 0; opcode = 0x23. Sum = **0x00581023**.
Binary: `0000 0000 0101 1000 0001 0000 0010 0011`.

### 6.4 B-type: `nyane nk1, nk2, lupu` (branch at 0x14, lupu = 0x0C)

off = (0x0C - 0x14) / 4 = -2 = 0x3FFE in 14 bits. off[13:4] = 0x3FF, off[3:0] = 14. Fields: rs2 5 (nk2), rs1 4 (nk1), funct3 4, opcode 0x63.

0x3FF << 22 = 0xFFC00000; rs2 << 18 = 0x140000; rs1 << 14 = 0x010000; funct3 << 11 = 0x002000; 14 << 7 = 0x000700; opcode = 0x63. Sum = **0xFFD52763**.
Binary: `1111 1111 1101 0101 0010 0111 0110 0011`.

### 6.5 J-type: `tsamaea khutlo, habeli` (jump at 0x04, habeli = 0x2C)

off = (0x2C - 0x04) / 4 = 10. Fields: off 10, rd 1 (khutlo), opcode 0x6F.

off << 11 = 0x005000; rd << 7 = 0x000080; opcode = 0x6F. Sum = **0x000050EF**.
Binary: `0000 0000 0000 0000 0101 0000 1110 1111`.

### 6.6 Other encodings (checked by the assembler tests)

| Instruction | Hex | Instruction | Hex |
|---|---|---|---|
| `tlosa nk3, nk2, nk1` | 0x40114333 | `suthela bl0, nk1, 2` | 0x00090B93 |
| `le nk1, nt0, nk0` | 0x000EFA33 | `nka bl1, 0(bl0)` | 0x0001D403 |
| `kapa nk2, nt0, nk0` | 0x000EF2B3 | `lekana nk1, nk1, qetello` (at 0x20, target 0x28) | 0x00110163 |
| `khutla` | 0x00004067 | `ema` | 0x0000000B |

## 7. Programming model and behaviour

| Topic | Rule |
|---|---|
| Registers | r0 always reads 0, and writes to r0 are ignored. r1, r2 and r15 have software conventions only. |
| Reset | PC = 0, all registers = 0, all data memory = 0. |
| Program end | `ema` ends the program. |
| Alignment | `nka` and `kenya` offsets must be multiples of 4 (the assembler checks this). If the base register is misaligned or the address is outside data memory (0 to 1020), the result is unspecified. The reference simulator stops with a plain-language error. |
| Reserved bits | R-type bits [24:22] must be 0. For `suthela`, imm[13:5] must be 0. For `ema`, all bits other than the opcode are 0. |
| Undefined words | Any other 32-bit word is not a LIMO instruction. The ISA does not say what happens. The reference simulator stops with an error. |
| Exceptions | None. LIMO has no multiply, divide, floating point, CSRs or system calls. |
| Endianness | Little-endian. Because only word accesses exist, endianness does not change any program's results. It matters only for how a memory view shows individual bytes. |

## 8. Design-decision log (A6)

Each answer is at most 120 words.

**(a) Register-file size.** We use 16 registers, so a register field needs 4 bits, not 5. In R-type, three fields save 3 bits (kept reserved). In I, S and B, two fields save 2 bits, which we give to the immediate (12 to 14 bits). Forwarding comparators compare 4-bit numbers instead of 5-bit, and the register file is smaller. The cost is register pressure: only 12 general registers (r3 to r14). `lenane.limo` needs 6 of them for one array.

**(b) Architectural or microarchitectural?** Architectural (visible to programs, fixed by the ISA): the PC, r0 to r15 (r0 is always 0) and data memory. Microarchitectural (inside one implementation): IR, the IF/ID, ID/EX, EX/MEM and MEM/WB registers, control latches, forwarding muxes and the hazard unit. The ISA must not specify these, because a single-cycle, 5-stage or 7-stage LIMO must run the same binary and give the same results. Fixing them would block better designs. Example: `kakaretso.limo` always ends with nk0 = 15, but its 31 cycles on our pipeline are not part of the ISA.

**(c) Branch resolution.** LIMO resolves branches in EX and predicts not-taken. A taken branch or jump flushes the two younger instructions already fetched. `kakaretso.limo` has 4 taken branches: 8 flushed slots in 31 cycles (26%). `mosebetsi.limo` loses 6 of 22 cycles and `lenane.limo` 6 of 47. Resolving in ID would flush only 1 slot, but needs an extra comparator and target adder in ID, forwarding into ID, and a stall when a branch follows an ALU instruction (1 cycle) or a load (2 cycles). We chose EX: no extra hardware and simpler control.

**(d) Load-use.** Load data is ready only at the end of MEM, but a dependent instruction needs it at the start of EX. Forwarding can send a value forward in time, not back, so one bubble is unavoidable. In the diagram, the load is in MEM in cycle 4; the dependent instruction waits one cycle and gets the forwarded value in EX in cycle 5. `lenane.limo` stalls once per loop: 4 stalls in 47 cycles.

| Clock cycle | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| `nka bl1, 0(bl0)` | IF | ID | EX | MEM | WB | | |
| `eketsa nk3, nk3, bl1` | | IF | ID | stall | EX | MEM | WB |

**(e) A flags register?** No. LIMO's branches compare and branch in one instruction, so a loop test costs one instruction. With flags it becomes compare + branch: `lenane.limo` would run 4 more instructions (47 to 51 cycles). Flags are also hidden state to save across calls, and they add a new RAW dependency: each flag-setting instruction needs forwarding to the next branch, and the hazard unit must track flag writers. The main benefit, carry for multi-word arithmetic, is not needed because LIMO has no multiply or divide.

**(f) What breaks first?** Register count. With 12 general registers, a loop with two arrays, indices, bounds and a sum uses most of them, and without push and pop each spill costs a store and a load. `lenane.limo` already uses 6 for one array. Immediate range is next: 14 bits reach +/- 8 KiB, and larger constants need `eketsana` + `suthela` + `eketsa` because there is no `lui` (our data memory is only 1 KiB). Branch reach (+/- 8192 instructions) breaks last, because our instruction memory is only 1024 words.

## 9. Sample programs

Cycles = instructions executed + 4 (pipeline fill) + stalls + flushed slots. Source files are in `examples/`. The machine code below was produced by the assembler and checked against a separate reference interpreter, which also confirmed every instruction count, stall count and final state.

### 9.1 `kakaretso.limo`: sum of 1 to 5 (loop and signed branch)

| Address | Hex | Instruction | Comment |
|---|---|---|---|
| 0x00 | 0x00000193 | `eketsana nk0, letho, 0` | sum = 0 |
| 0x04 | 0x00040213 | `eketsana nk1, letho, 1` | i = 1 |
| 0x08 | 0x00180293 | `eketsana nk2, letho, 6` | limit = 6 |
| 0x0C | 0x0010C1B3 | `lupu: eketsa nk0, nk0, nk1` | sum = sum + i |
| 0x10 | 0x00050213 | `eketsana nk1, nk1, 1` | i = i + 1 |
| 0x14 | 0xFFD52763 | `nyane nk1, nk2, lupu` | if i < limit, repeat |
| 0x18 | 0x0000000B | `ema` | stop |

Pipeline: 19 + 4 + 0 stalls + 8 flushed = **31 cycles** (CPI 1.63). Expected final state: nk0 = 15, nk1 = 6, nk2 = 6.

### 9.2 `lenane.limo`: array store, then load and add (load-use stall)

| Address | Hex | Instruction | Comment |
|---|---|---|---|
| 0x00 | 0x000C0193 | `eketsana nk0, letho, 3` | |
| 0x04 | 0x000C1023 | `kenya nk0, 0(letho)` | mem[0] = 3 |
| 0x08 | 0x00140193 | `eketsana nk0, letho, 5` | |
| 0x0C | 0x000C1223 | `kenya nk0, 4(letho)` | mem[4] = 5 |
| 0x10 | 0x001C0193 | `eketsana nk0, letho, 7` | |
| 0x14 | 0x000C1423 | `kenya nk0, 8(letho)` | mem[8] = 7 |
| 0x18 | 0x00240193 | `eketsana nk0, letho, 9` | |
| 0x1C | 0x000C1623 | `kenya nk0, 12(letho)` | mem[12] = 9 |
| 0x20 | 0x00000213 | `eketsana nk1, letho, 0` | i = 0 |
| 0x24 | 0x00100293 | `eketsana nk2, letho, 4` | n = 4 |
| 0x28 | 0x00000313 | `eketsana nk3, letho, 0` | sum = 0 |
| 0x2C | 0x00090B93 | `lupu: suthela bl0, nk1, 2` | offset = i * 4 |
| 0x30 | 0x0001D403 | `nka bl1, 0(bl0)` | bl1 = a[i] |
| 0x34 | 0x00218333 | `eketsa nk3, nk3, bl1` | sum += a[i] (1 stall) |
| 0x38 | 0x00050213 | `eketsana nk1, nk1, 1` | i++ |
| 0x3C | 0xFFD52663 | `nyane nk1, nk2, lupu` | if i < n, repeat |
| 0x40 | 0x00581023 | `kenya nk3, 16(letho)` | mem[16] = sum |
| 0x44 | 0x0000000B | `ema` | stop |

Pipeline: 33 + 4 + 4 stalls + 6 flushed = **47 cycles** (CPI 1.42). Expected final state: mem[0] = 3, mem[4] = 5, mem[8] = 7, mem[12] = 9, mem[16] = 24; nk3 = 24 (also nk0 = 9, nk1 = 4, nk2 = 4, bl0 = 12, bl1 = 9).

### 9.3 `mosebetsi.limo`: procedure call and return, logic, subtraction, equal branch

| Address | Hex | Instruction | Comment |
|---|---|---|---|
| 0x00 | 0x00300593 | `eketsana nt0, letho, 12` | argument |
| 0x04 | 0x000050EF | `tsamaea khutlo, habeli` | call habeli; khutlo = return address |
| 0x08 | 0x00280193 | `eketsana nk0, letho, 10` | |
| 0x0C | 0x000EFA33 | `le nk1, nt0, nk0` | 24 AND 10 = 8 |
| 0x10 | 0x000EF2B3 | `kapa nk2, nt0, nk0` | 24 OR 10 = 26 |
| 0x14 | 0x40114333 | `tlosa nk3, nk2, nk1` | 26 - 8 = 18 |
| 0x18 | 0x002C1023 | `kenya nt0, 0(letho)` | mem[0] = 24 |
| 0x1C | 0x00181223 | `kenya nk3, 4(letho)` | mem[4] = 18 |
| 0x20 | 0x00110163 | `lekana nk1, nk1, qetello` | 8 = 8, so taken |
| 0x24 | 0x018C0313 | `eketsana nk3, letho, 99` | skipped |
| 0x28 | 0x0000000B | `qetello: ema` | stop |
| 0x2C | 0x002EC5B3 | `habeli: eketsa nt0, nt0, nt0` | nt0 = 2 * nt0 |
| 0x30 | 0x00004067 | `khutla` | return (`boela letho, khutlo, 0`) |

Pipeline: 12 + 4 + 0 stalls + 6 flushed = **22 cycles** (CPI 1.83). Expected final state: nt0 = 24, nk0 = 10, nk1 = 8, nk2 = 26, nk3 = 18, khutlo = 8; mem[0] = 24, mem[4] = 18.

## 10. Mapping to RV32I (for the Ripes cross-check, B8)

**Registers.** The LIMO aliases are RISC-V ABI names, so they can be used unchanged in Ripes: `zero`, `ra`, `sp`, `gp`, `t0` to `t3`, `s0` to `s3`, `a0` to `a3`. LIMO numbers differ from RISC-V numbers, so translate by alias, never by number.

| LIMO | RV32I | LIMO | RV32I |
|---|---|---|---|
| `eketsa rd, rs1, rs2` | `add` | `lekana rs1, rs2, L` | `beq rs1, rs2, L` |
| `tlosa rd, rs1, rs2` | `sub` | `nyane rs1, rs2, L` | `blt rs1, rs2, L` |
| `eketsana rd, rs1, imm` | `addi` | `tsamaea rd, L` | `jal rd, L` |
| `le`, `kapa` | `and`, `or` | `boela rd, rs1, imm` | `jalr rd, imm(rs1)` |
| `suthela rd, rs1, sh` | `slli` | `khutla` | `ret` (`jalr x0, ra, 0`) |
| `nka rd, off(rs1)` | `lw rd, off(rs1)` | `kenya rs2, off(rs1)` | `sw rs2, off(rs1)` |
| `ema` | `li a7, 10` then `ecall` (exit) | | |

**Cycle comparison.** The translated `ema` adds two instructions (`li a7, 10` and `ecall`). Count the program up to the instruction before `ema`, and explain any difference in the test report.

## 11. Reference implementation notes (not part of the ISA)

These are the choices of the team's simulator. A different LIMO implementation may choose differently and must still run the same binaries with the same results.

- Five stages: IF, ID, EX, MEM, WB, with IF/ID, ID/EX, EX/MEM and MEM/WB registers and separate instruction and data memories.
- Branches and jumps are resolved in EX; the pipeline predicts not-taken; a taken branch or jump flushes 2 slots.
- Forwarding from EX/MEM and MEM/WB into EX; one stall for a load followed by a dependent instruction.
- The register file writes in the first half of a cycle and reads in the second half.
- `ema` takes effect when it reaches WB; an `ema` that is flushed has no effect.
- Illegal words and bad data addresses stop the simulator with a plain-language error.

Details are in `pipeline-data-model.md` and `architecture.md`.

## 12. References and AI-use declaration

1. The RISC-V Instruction Set Manual, Volume I: Unprivileged ISA. RISC-V International.
2. D. Patterson and J. Hennessy, *Computer Organization and Design: The Hardware/Software Interface, RISC-V Edition*. Morgan Kaufmann.
3. Ripes, a graphical RISC-V pipeline simulator (used for comparison).
4. **TO COMPLETE BEFORE SUBMISSION:** the Sesotho sources or speakers consulted for the mnemonics and register-group names (for example a named dictionary or a named first-language speaker). The meanings in section 4 are those given in the M1 report; the team must confirm them against these sources.

AI-use declaration: see `AI_USE.md`. Claude was used to assemble this document from the M1 report, to generate `isa.json` from it, and to cross-check the examples with an independent interpreter. The team must record this, and every member must be able to explain every part.
