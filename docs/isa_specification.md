 # LIMO ISA Specification

Course: CS3520 – Computer Organisation and Architecture
Project: LIMO
Version: 1.0
Status: Draft for Defence 1

## A1. Overview and Style

LIMO is a small 32-bit load-store processor derived from RV32I. Its assembly language is Sesotho.

Word/register width: 32 bits.
Rationale: Matches RV32I and keeps cross-checking with Ripes/RARS straightforward.

Architecture style: load-store; only `nka` (load) and `kenya` (store) touch memory.
Rationale: Keeps the ALU path and MEM stage simple and keeps hazard rules small.

Addressing: byte-addressed, little-endian, word-aligned.
Rationale: Matches RISC-V. Loads/stores use offsets that are multiples of 4; misaligned access is unspecified (no exceptions).

Instruction length: fixed 32 bits. Formats: R, I, S, B, J.
Rationale: Fixed length makes fetch use PC+4 and keeps decode as one step.

Memory model (simulator): separate instruction memory (4 KiB/1024 words) and data memory (1 KiB/256 words), both starting at address 0.
Rationale: Gives IF and MEM separate memories, so there is no structural hazard.

Reset: PC=0, all registers=0, data memory=0.
Rationale: Makes tests deterministic and repeatable.

Program end: `ema` stops fetching, drains the pipeline, and halts.
Rationale: LIMO has no exceptions or system calls, so a stop instruction is needed.

Departures from RV32I:

1. 16 registers instead of 32.
Reason:
Using 16 registers means each register number requires only 4 bits instead of 5 bits. 
This frees encoding space inside the fixed 32-bit instruction, which can be used to provide larger immediate fields.
It also reduces the size of the register file and makes register comparisons in the hazard/forwarding logic smaller. 
The trade-off is that programs have fewer registers available, so larger programs may need to reuse registers or access memory more often.

2. Field positions differ; rd is at [10:7] with 4 bits; opcode/funct3/funct7 positions are kept recognizable.

Reason:
Four bits are sufficient to identify any of the 16 LIMO registers because:

2⁴ = 16

This saves encoding bits while still allowing every LIMO register to be addressed.
The saved bits can then be used for larger immediate values while keeping the instruction length fixed at 32 bits.

3. 14-bit immediates instead of 12; freed register bits are used for the larger immediate.

Reason:
Reducing the register fields from 5 bits to 4 bits frees two bits in a 32-bit instruction.
These two bits can be added to the immediate field, increasing it from 12 bits to 14 bits.

4. Branch/jump offsets count words rather than bytes because instructions are 4-byte aligned.
Reason:
LIMO instructions are fixed at 32 bits, meaning every instruction occupies 4 bytes and instruction
addresses are therefore aligned to multiples of 4. The two lowest bits of a byte address are 
consequently always zero for an instruction address so we don’t store them, and the same 14 bits reach 4× further (±32 KiB instead of ±8 KiB).


5. No U-type instructions (lui, auipc); optional U-type instructions are omitted because the 14-bit immediates cover the 1 KiB data memory.
Reason:
14-bit immediates already cover the 1 KiB data memory, so a “load upper immediate” is not needed.

6. `ema` halt uses the RISC-V custom-0 opcode.

Reason:
LIMO is intended to run programs in a simulator, and the basic ISA does not rely on operating-system system calls or exceptions to 
terminate a program. Therefore, the simulator needs an explicit architectural instruction that tells it that the program has finished.
ema provides a simple and predictable way to stop fetching new instructions and terminate execution.

## A2. Registers

Register file: 16 × 32 bits, 2 read ports, 1 write port, 4-bit register numbers.

Register-file size comparison:

| Register size | Field width | Bits for 3 register fields | Freed vs RV32I |
| ------------- | ----------: | -------------------------: | -------------: |
| 8             |           3 |                          9 |              6 |
| 16 (chosen)   |           4 |                         12 |              3 |
| 32 (RV32I)    |           5 |                         15 |              0 |

With 16 registers, two register fields in I, S and B formats free 2 bits, which go to the immediate, increasing it from 12 to 14 bits. R-type frees 3 bits, which are kept as reserved zeros at [24:22].

| No.     | Sesotho name                       | Alias | RV32I analogue   | Role                                                                      | Rationale                                                                 |
| ------- | ---------------------------------- | ----- | ---------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| r0      | letho (“nothing”)                  | zero  | x0               | Hard-wired 0; writes ignored                                              | Gives 0, move, and compare-with-zero for free.                            |
| r1      | khutlo (“return”)                  | ra    | x1               | Return address, written by tsamaea                                        | Needed for procedure calls.                                               |
| r2      | qubu (“pile”)                      | sp    | x2               | Stack pointer, convention only                                            | Needed by A2; no push/pop, so it is a convention.                         |
| r3–r6   | nk0–nk3 (nakoana, “a short while”) | t0–t3 | x5–x7, x28       | Temporaries                                                               | Short names are quick to type.                                            |
| r7–r10  | bl0–bl3 (boloka, “keep”)           | s0–s3 | x8, x9, x18, x19 | Saved registers                                                           | Matches the convention students meet in Ripes.                            |
| r11–r14 | nt0–nt3 (ntlha, “item”)            | a0–a3 | x10–x13          | Arguments / results                                                       | Same convention.                                                          |
| r15     | motheo (“foundation”)              | gp    | x3               | Global pointer, convention only                                           | Reserved for data-base addressing.                                        |
| none    | sebaka (“place”)                   | pc    | pc               | Program counter, byte address; not in the register file and not encodable | Changed only by branches, jumps and PC+4. Shown as “PC” in the simulator. |

The assembler also accepts r0–r15. Names are case-insensitive. Twelve registers are general purpose (nk*, bl*, nt*). Three more (khutlo, qubu, motheo) are reserved by convention only, and the hardware does not enforce them.

## A3. Instructions

LIMO has 14 instructions. Multiply/divide, floating point, CSRs and exceptions are left out.

| Mnemonic                 | Sesotho meaning                       | Class              | Operation                              | RV32I equivalent |
| ------------------------ | ------------------------------------- | ------------------ | -------------------------------------- | ---------------- |
| eketsa rd, rs1, rs2      | ho eketsa “to add”                    | Arithmetic         | rd ← rs1 + rs2                         | add              |
| tlosa rd, rs1, rs2       | ho tlosa “to take away”               | Arithmetic         | rd ← rs1 − rs2                         | sub              |
| eketsana rd, rs1, imm    | eketsa + -ana, “add a small constant” | Arithmetic (imm)   | rd ← rs1 + sext(imm14)                 | addi             |
| le rd, rs1, rs2          | le “and”                              | Logic              | rd ← rs1 & rs2                         | and              |
| kapa rd, rs1, rs2        | kapa “or”                             | Logic              | rd ← rs1 | rs2                         | or               |
| suthela rd, rs1, sh      | ho suthela “to move towards”          | Logic (shift, imm) | rd ← rs1 << sh, sh = 0..31             | slli             |
| nka rd, off(rs1)         | ho nka “to take”                      | Load               | rd ← Mem32[rs1 + sext(off)]            | lw               |
| kenya rs2, off(rs1)      | ho kenya “to put in”                  | Store              | Mem32[rs1 + sext(off)] ← rs2           | sw               |
| lekana rs1, rs2, label   | ho lekana “to be equal”               | Branch             | If rs1 == rs2: PC ← PC + 4·off         | beq              |
| halekane rs1, rs2, label | ha e lekane “it is not equal”         | Branch             | If rs1 != rs2: PC ← PC + 4·off         | bne              |
| nyane rs1, rs2, label    | nyane “small / less”                  | Branch             | If rs1 < rs2 (signed): PC ← PC + 4·off | blt              |
| tsamaea rd, label        | ho tsamaea “to go”                    | Jump               | rd ← PC+4; PC ← PC + 4·off             | jal              |
| boela rd, rs1, imm       | ho boela “to return”                  | Jump (register)    | rd ← PC+4; PC ← (rs1 + sext(imm)) & ~3 | jalr             |
| ema                      | ho ema “to stop”                      | System (simulator) | Stop fetch, drain pipeline, halt       | None             |

The instruction set satisfies the required categories: 3 arithmetic instructions including one immediate, 3 logic instructions including one shift, word load/store, at least 2 conditional branches, and 14 total instructions.

## A4. Sesotho Assembly

### Pseudo-instructions

| Pseudo-instruction | Expands to             | Meaning                           |
| ------------------ | ---------------------- | --------------------------------- |
| kopitsa rd, rs     | eketsana rd, rs, 0     | Copy a register (ho kopitsa)      |
| tsela label        | tsamaea letho, label   | Jump with no link                 |
| khutla             | boela letho, khutlo, 0 | Return from procedure (ho khutla) |

### Assembler rules

Syntax:

* One instruction per line.
* A label may appear before an instruction on the same line or on its own line.
* Comments start with `;`.
* Operands are separated by commas.
* Memory operands are written as `off(reg)`.
* Immediates may be decimal or hexadecimal with a `0x` prefix.
* Negative immediates are allowed.
* Mnemonics, register names and labels are case-insensitive.

### Apostrophes

Lesotho orthography writes ejectives as ts', ch', kh' and similar forms. Many keyboards cannot type them, and phones may replace `'` with the curly `’`.

The lexer deletes both `'` (U+0027) and `’` (U+2019) from every identifier before lookup. Therefore, spellings such as `ts'ebetso` and `ts’ebetso` are treated equivalently after normalisation. A duplicate-label error is raised if two labels collide after normalisation.

This keeps typing possible on ASCII keyboards, avoids problems caused by autocorrect, and prevents silent naming mistakes. No current LIMO mnemonic contains an apostrophe. If one is added later, both spellings will work.

### Errors

Errors are reported in plain language with line numbers.

Example:

`line 7: nyane needs two registers and a label`

## A5. Encoding and Specification

### A5.1 Instruction formats

Bit 31 is on the left.

```text
R | funct7 (7) | 000 | rs2 | rs1 | f3 (3) | rd | opcode |
```

```text
I | imm[13:0] | rs1 | f3 (3) | rd | opcode |
```

```text
S | imm[13:4] | rs2 | rs1 | f3 (3) | imm[3:0] | opcode |
```

```text
B | off[13:4] | rs2 | rs1 | f3 (3) | off[3:0] | opcode |
```

B-format offsets count WORDS.

```text
J | off[20:0] (words) | rd | opcode |
```

Common field positions:

* opcode: [6:0]
* funct3: [13:11]
* rs1: [17:14]
* low register field: [10:7]

In R-type instructions, bits [24:22] are reserved and must be zero.

The S and B immediates are split so that rs1 and rs2 remain in fixed positions, following the RISC-V approach.

### A5.2 Opcodes and function codes

| Opcode (binary / hex) | Format | Instructions            | Rationale                                                                                                       |
| --------------------- | ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| 0110011 / 0x33        | R      | eketsa, tlosa, le, kapa | Same as RISC-V OP.                                                                                              |
| 0010011 / 0x13        | I      | eketsana, suthela       | Same as RISC-V OP-IMM.                                                                                          |
| 0000011 / 0x03        | I      | nka                     | Same as RISC-V LOAD.                                                                                            |
| 0100011 / 0x23        | S      | kenya                   | Same as RISC-V STORE.                                                                                           |
| 1100011 / 0x63        | B      | lekana, halekane, nyane | Same as RISC-V BRANCH.                                                                                          |
| 1101111 / 0x6F        | J      | tsamaea                 | Same as RISC-V JAL.                                                                                             |
| 1100111 / 0x67        | I      | boela                   | Same as RISC-V JALR.                                                                                            |
| 0001011 / 0x0B        | —      | ema                     | RISC-V custom-0, reserved for extensions, so it cannot clash with a standard instruction. Remaining bits are 0. |

Reusing RISC-V opcodes allows students to compare LIMO machine words with the RV32I instruction card.

| Instruction | funct3 | funct7  | Rationale                                               |
| ----------- | ------ | ------- | ------------------------------------------------------- |
| eketsa      | 000    | 0000000 | add                                                     |
| tlosa       | 000    | 0100000 | sub; same funct3, bit 30 distinguishes it as in RISC-V  |
| le          | 111    | 0000000 | and                                                     |
| kapa        | 110    | 0000000 | or                                                      |
| eketsana    | 000    | —       | addi                                                    |
| suthela     | 001    | —       | slli; shift amount is imm[4:0], and imm[13:5] must be 0 |
| nka         | 010    | —       | lw; 010 = word                                          |
| kenya       | 010    | —       | sw; 010 = word                                          |
| lekana      | 000    | —       | beq                                                     |
| halekane    | 001    | —       | bne                                                     |
| nyane       | 100    | —       | blt                                                     |
| boela       | 000    | —       | jalr                                                    |

### A5.3 Immediate ranges

| Field           | Bits | Meaning                                           | Range                                                                  | Rationale                                                      |
| --------------- | ---: | ------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| I / S immediate |   14 | Signed bytes                                      | −8192 … +8191; nka/kenya offsets must be multiples of 4: −8192 … +8188 | Two bits more than RV32I, paid for by shorter register fields. |
| Shift amount    |    5 | Shift amount                                      | 0 … 31                                                                 | 32-bit word.                                                   |
| B offset        |   14 | Signed words relative to the branch's own address | −8192 … +8191 words = −32768 … +32764 bytes                            | Word scaling gives 4× the reach for the same number of bits.   |
| J offset        |   21 | Signed words relative to the jump's own address   | −1,048,576 … +1,048,575 words = ±4 MiB                                 | No funct3 or register fields, so most of the word is free.     |

Assembler rule:

`offset = (target address − address of this instruction) / 4`

Out-of-range values are rejected with an error that gives the line number and allowed range.

### A5.4 One hand-encoded instruction per format

#### R — eketsa nk0, nk0, nk1

rd = 3, rs1 = 3, rs2 = 4

```text
funct7   rsv   rs2   rs1   funct3   rd     opcode
0000000  000   0100  0011  000      0011   0110011
```

Binary:

```text
0000 0000 0001 0000 1100 0001 1011 0011
```

Hex:

```text
0x0010C1B3
```

#### I — eketsana nk2, letho, 6

rd = 5, rs1 = 0, imm = 6

```text
imm[13:0]        rs1   funct3   rd     opcode
00000000000110   0000  000     0101   0010011
```

Binary:

```text
0000 0000 0001 1000 0000 0010 1001 0011
```

Hex:

```text
0x00180293
```

#### S — kenya nk3, 16(letho)

rs2 = 6, rs1 = 0, imm = 16

```text
imm[13:4]   rs2   rs1   funct3   imm[3:0]   opcode
0000000001  0110  0000  010     0000       0100011
```

Binary:

```text
0000 0000 0101 1000 0001 0000 0010 0011
```

Hex:

```text
0x00581023
```

#### B — nyane nk1, nk2, lupu

Instruction address = 0x14

Label lupu = 0x0C

```text
Offset = (0x0C − 0x14) / 4
       = −2 words
```

The 14-bit two's-complement representation is:

```text
11111111111110
```

rs1 = 4, rs2 = 5

Binary:

```text
1111 1111 1101 0101 0010 0111 0110 0011
```

Hex:

```text
0xFFD52763
```

#### J — tsamaea khutlo, habeli

Instruction address = 0x04

Label habeli = 0x30

```text
Offset = (0x30 − 0x04) / 4
       = 11 words
```

rd = 1

Binary:

```text
0000 0000 0000 0000 0101 1000 1110 1111
```

Hex:

```text
0x000058EF
```

## A6. Design-Decision Log

### A6(a) What does the register-file size cost and buy?

Sixteen registers give 4-bit fields. This frees three bits in R-type and two in I/S/B, which are used for a 14-bit immediate and 3 reserved bits. The register file is 512 flip-flops instead of 1024, and each of the six hazard comparators is 4 bits wide instead of 5. The cost is that only 15 registers are writable and 3 are reserved by convention (khutlo, qubu, motheo), leaving 12 general registers. lenane.limo, a four-element sum, already uses 7 of the 12. Nested calls must spill to memory. That is acceptable for first-year programs but would not suit a compiler.

### A6(b) Which registers are architectural and which only microarchitectural?

Architectural, so visible to programs and fixed by the ISA: the PC and r0–r15 (r0 hard-wired to 0), plus data memory. Microarchitectural, so internal to one implementation: IR, IF/ID, ID/EX, EX/MEM, MEM/WB, the control-signal latches, the forwarding muxes and the hazard unit. The ISA must not specify them because they are design choices: a single-cycle, 5-stage or 7-stage LIMO must run the same binary and produce the same architectural results. Fixing pipeline registers would freeze the design and break compatibility. Evidence: kakaretso.limo always ends with nk0 = 15, but the 31 cycles it takes on our pipeline are not defined by the ISA.

### A6(c) In which stage are branches resolved, and what does it cost?

In EX, predicting not-taken. A taken branch or jump flushes the two younger instructions already fetched. Evidence: kakaretso.limo has 4 taken branches, so 8 flushed slots out of 31 cycles (26%); lenane.limo loses 6 of 47. Resolving in ID would flush only one, but needs a dedicated comparator and target adder in ID, forwarding into ID, and a stall when the branch follows an ALU instruction (one cycle) or a load (two). We chose EX because it needs no extra hardware and is simple to explain; the 2-cycle penalty is expected to match the Ripes 5-stage pipeline, which we will confirm in B8.

### A6(d) Why does load-use still stall under full forwarding?

Load data exists only at the end of MEM, but a dependent instruction needs it at the start of EX. Forwarding wires only carry a value forward in time, so one bubble is unavoidable.

```text
cycle                 1   2   3   4   5   6   7

nka bl1, 0(bl0)       IF  ID  EX  MEM WB

eketsa nk3,nk3,bl1        IF  ID  **  EX MEM  WB
```

In cycle 4 the load is in MEM, producing its value only at the end of that cycle. eketsa can use it in EX in cycle 5, forwarded from MEM/WB. lenane.limo stalls once per iteration: 4 stalls in 47 cycles.

### A6(e) Would LIMO benefit from a flags register?

No. LIMO's branches compare and branch in one instruction, so a loop test costs one instruction. With flags it becomes compare + branch: lenane.limo would run 4 more instructions (47 → 51 cycles). A flags register is also extra hidden state to save across calls, and it adds a new RAW dependency: every flag-setting instruction needs a forwarding path to the next branch, and the hazard unit must track flag writers. Its main benefit, carry for multi-word arithmetic, is not needed because LIMO has no multiply or divide.

### A6(f) As programs grow, what breaks first?

Register count. Twelve general registers run out quickly: a loop with two arrays, indices, bounds and a sum already needs most of them, and with no push/pop each spill is a store and a load. lenane.limo uses 7 for one array. Next comes the immediate range: 14 bits reach ±8 KiB, constants above 8191 need eketsana + suthela + eketsa because there is no lui, but our data memory is only 1 KiB. Branch reach (±8192 instructions) breaks last: our 1024-word instruction memory is far inside it.

