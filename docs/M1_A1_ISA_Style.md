# LIMO Instruction Set Architecture --- Specification v1.0

**(M1):**

## 1. Overview and Style (A1)

LIMO is a small 32-bit load--store processor derived from RV32I. Its assembly language is Sesotho.

| Property | Decision | Rationale |
|---|---|---|
| Word / register width | 32 bits | Same as RV32I, so Ripes and RARS can cross-check every test (B8-iii). |
| Architecture style | Load--store: only `nka` (load) and `kenya` (store) touch memory | Keeps the ALU path and the MEM stage simple and the hazard rules small. |
| Addressing | Byte-addressed, little-endian, word-aligned | Same as RISC-V. Loads and stores must use offsets that are multiples of 4 (assembler-enforced); misaligned access is unspecified (no exceptions in LIMO). |
| Instruction length | Fixed 32 bits, formats R, I, S, B, J | Fixed length means fetch is PC+4 and decode is a single step. |
| Memory model (simulator) | Separate instruction memory (4 KiB, 1024 words) and data memory (1 KiB, 256 words), both starting at address 0 | Gives the IF and MEM stages separate memories, so there is no structural hazard. |
| Reset state | PC = 0, all registers = 0, data memory = 0 | Makes every test program deterministic. |
| Program end | `ema` stops fetching, drains the pipeline and halts | The ISA has no exceptions or system calls, so a stop instruction is needed. |

Departures from RV32I (justified):

1. 16 registers instead of 32.
   
Reason:
Using  16 registers means each register number requires only 4 bits instead of 5 bits. This frees encoding space inside the fixed 32-bit instruction, which can be used to provide larger immediate fields.
It also reduces the size of the register file and makes register comparisons in the hazard/forwarding logic smaller. The trade-off is that programs have fewer registers available, so larger programs may need to reuse registers or access memory more often.


**Reason:** 16 registers instead of 32. See §2 and A6(a).

**2. Field positions differ from RV32I. `rd` is at [10:7] with 4 bits, and the other fields move accordingly. We keep the opcode and funct3 positions and the funct7 position, so the decoder logic is recognisably RISC-V.**

**Reason:** Field positions differ from RV32I. `rd` is at [10:7] with 4 bits, and the other fields move accordingly. We keep the opcode and funct3 positions and the funct7 position, so the decoder logic is recognisably RISC-V.

**3. 14-bit immediates instead of 12. The two bits freed by the shorter register fields go to the immediate.**

**Reason:** 14-bit immediates instead of 12. The two bits freed by the shorter register fields go to the immediate.

**4. Branch and jump offsets count words, not bytes. Instructions are always 4-byte aligned, so storing the offset in bytes would waste its two low bits.**

**Reason:** Branch and jump offsets count words, not bytes. Instructions are always 4-byte aligned, so storing the offset in bytes would waste its two low bits.

**5. No U-type (lui, auipc). They are optional in the handout, and 14-bit immediates cover our 1 KiB data memory.**

**Reason:** No U-type (lui, auipc). They are optional in the handout, and 14-bit immediates cover our 1 KiB data memory.

**6. One extra instruction, `ema` (halt), in the RISC-V custom-0 opcode slot.**

**Reason:** One extra instruction, `ema` (halt), in the RISC-V custom-0 opcode slot.

---

## 2. Registers (A2)

Register file: 16 × 32 bits, 2 read ports, 1 write port, 4-bit register numbers.

| Register size | Field width | Bits for 3 register fields | Freed vs RV32I |
|---|---|---|---|
| 8 | 3 | 9 | 6 |
| 16 (chosen) | 4 | 12 | 3 |
| 32 (RV32I) | 5 | 15 | 0 |

With 16 registers, two register fields (I, S, B) free 2 bits, which go to the immediate (12 → 14 bits). R-type frees 3 bits, which we keep as reserved zeros at [24:22].

| No. | Sesotho name | Alias | RV32I analogue | Role | Rationale |
|---|---|---|---|---|---|
| r0 | `letho` ("nothing") | zero | x0 | Hard-wired 0; writes ignored | Gives 0, move, and compare-with-zero for free. |
| r1 | `khutlo` ("return") | ra | x1 | Return address, written by `tsamaea` | Needed by A2 and by procedure calls. |
| r2 | `qubu` ("pile") | sp | x2 | Stack pointer (convention only) | Needed by A2; no push/pop, so it is a convention. |
| r3--r6 | `nk0`--`nk3` (nakoana, "a short while") | t0--t3 | x5--x7, x28 | Temporaries | Short names are quick to type. |
| r7--r10 | `bl0`--`bl3` (boloka, "keep") | s0--s3 | x8, x9, x18, x19 | Saved registers | Matches the convention students meet in Ripes. |
| r11--r14 | `nt0`--`nt3` (ntlha, "item") | a0--a3 | x10--x13 | Arguments / results | Same. |
| r15 | `motheo` ("foundation") | gp | x3 | Global pointer (convention only) | Reserved for data-base addressing. |
| --- | `sebaka` ("place") | pc | pc | Program counter, byte address; not in the register file and not encodable | Changed only by branches, jumps and PC+4. Shown as "PC" in the simulator. |

The assembler also accepts `r0`--`r15`. Names are case-insensitive. Twelve registers are general purpose (`nk*`, `bl*`, `nt*`). Three more (`khutlo`, `qubu`, `motheo`) are reserved by convention only, and the hardware does not enforce them.

---

## 3. Instructions (A3) and Sesotho Assembly (A4)

14 instructions (13 plus `ema`). Left out, as the handout requires: multiply/divide, floating point, CSRs, exceptions.

| Mnemonic | Sesotho meaning | Class | Operation | RV32I equivalent |
|---|---|---|---|---|
| `eketsa rd, rs1, rs2` | ho eketsa "to add" | Arithmetic | rd ← rs1 + rs2 | add |
| `tlosa rd, rs1, rs2` | ho tlosa "to take away" | Arithmetic | rd ← rs1 − rs2 | sub |
| `eketsana rd, rs1, imm` | eketsa + -ana (coined: "add a small constant") | Arithmetic (imm) | rd ← rs1 + sext(imm14) | addi |
| `le rd, rs1, rs2` | le "and" | Logic | rd ← rs1 & rs2 | and |
| `kapa rd, rs1, rs2` | kapa "or" | Logic | rd ← rs1 \| rs2 | or |
| `suthela rd, rs1, sh` | ho suthela "to move towards" | Logic (shift, imm) | rd ← rs1 << sh (sh = 0..31) | slli |
| `nka rd, off(rs1)` | ho nka "to take" | Load | rd ← Mem32[rs1 + sext(off)] | lw |
| `kenya rs2, off(rs1)` | ho kenya "to put in" | Store | Mem32[rs1 + sext(off)] ← rs2 | sw |
| `lekana rs1, rs2, label` | ho lekana "to be equal" | Branch | if rs1 == rs2: PC ← PC + 4·off | beq |
| `halekane rs1, rs2, label` | ha e lekane "it is not equal" (abbreviation) | Branch | if rs1 != rs2: PC ← PC + 4·off | bne |
| `nyane rs1, rs2, label` | nyane "small / less" | Branch | if rs1 < rs2 (signed): PC ← PC + 4·off | blt |
| `tsamaea rd, label` | ho tsamaea "to go" | Jump | rd ← PC+4; PC ← PC + 4·off | jal |
| `boela rd, rs1, imm` | ho boela "to return" | Jump (register) | rd ← PC+4; PC ← (rs1 + sext(imm)) & ~3 | jalr |
| `ema` | ho ema "to stop" | System (simulator) | stop fetch, drain pipeline, halt | none (use the exit ecall in Ripes) |

Counts against A3: arithmetic 3 (one immediate) ✓; logic 3 (one shift) ✓; word load and store ✓; conditional branches 3 (≥ 2) ✓; total 14 (10--20) ✓.

Pseudo-instructions (assembler only, no new hardware):

| Pseudo | Expands to | Meaning |
|---|---|---|
| `kopitsa rd, rs` | `eketsana rd, rs, 0` | copy a register (ho kopitsa) |
| `tsela label` | `tsamaea letho, label` | jump, no link (tsela "path") |
| `khutla` | `boela letho, khutlo, 0` | return from procedure (ho khutla) |

Assembler rules (A4):

**Syntax.** One instruction per line, with `label:` before the instruction on the same line or alone. Comments start with `;`. Operands are separated by commas. Memory operands are written `off(reg)`. Immediates are decimal, or hex with a `0x` prefix, and may be negative.

**Case.** Mnemonics, register names and labels are case-insensitive.

**Apostrophes (ts', ch').** Lesotho orthography writes ejectives as ts', ch', kh' and similar. Many keyboards cannot type them, and phones replace `'` with the curly `'`. Policy: the lexer deletes both `'` (U+0027) and `'` (U+2019) from every identifier before lookup. So `ts'ebetso`, `tsebetso` and `ts'ebetso` are the same label, and a duplicate-label error is raised if two labels collide after normalisation. Why: typing stays possible on any ASCII keyboard, nothing depends on a character that autocorrect may change, and the collision error stops silent mistakes. No LIMO mnemonic currently contains an apostrophe. If one is added, both spellings will work.

**Errors.** Reported in plain language with line numbers, for example "line 7: nyane needs two registers and a label".

---

## 4. Encoding and Specification (A5)

### 4.1 Formats (bit 31 on the left)


### 4.1 Formats (bit 31 on the left)

**R-type**

| 31 | 25 | 24 | 22 | 21 | 18 | 17 | 14 | 13 | 11 | 10 | 7 | 6 | 0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| funct7 (7) | | 000 | | rs2 | | rs1 | | f3(3) | | rd | | opcode | |



| funct7 | rsv | rs2 | rs1 | funct3 | rd | opcode |
|---|---|---|---|---|---|---|
| 7 bits | 3 bits | 4 bits | 4 bits | 3 bits | 4 bits | 7 bits |


**I-type**

| 31 | | 18 | 17 | 14 | 13 | 11 | 10 | 7 | 6 | 0 |
|---|---|---|---|---|---|---|---|---|---|---|
| imm[13:0] | | rs1 | | f3(3) | | rd | | opcode | |



**S-type**

| 31 | | 22 | 21 | 18 | 17 | 14 | 13 | 11 | 10 | 7 | 6 | 0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| imm[13:4] | | rs2 | | rs1 | | f3(3) | | imm[3:0] | | opcode | |



**B-type** (off counts WORDS)

| 31 | | 22 | 21 | 18 | 17 | 14 | 13 | 11 | 10 | 7 | 6 | 0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| off[13:4] | | rs2 | | rs1 | | f3(3) | | off[3:0] | | opcode | |



**J-type**

| 31 | | 11 | 10 | 7 | 6 | 0 |
|---|---|---|---|---|---|---|
| off[20:0] (words) | | rd | | opcode | |



**Rationale.** Four fields sit in the same place in R, I, S and B: opcode [6:0], funct3 [13:11], rs1 [17:14] and the low register field at [10:7] (rd, or immediate bits for S and B). This keeps decode and the register-file read ports identical for all formats, so the control unit only has to look at the opcode. R-type bits [24:22] are reserved and must be zero, so a future ISA extension can use them. The S and B immediates are split so that rs1 and rs2 stay in fixed positions, as in RISC-V.

### 4.2 Opcodes and function codes

| Opcode (bin / hex) | Format | Instructions | Rationale |
|---|---|---|---|
| 0110011 / 0x33 | R | `eketsa` `tlosa` `le` `kapa` | Same as RISC-V OP. |
| 0010011 / 0x13 | I | `eketsana` `suthela` | Same as RISC-V OP-IMM. |
| 0000011 / 0x03 | I | `nka` | Same as RISC-V LOAD. |
| 0100011 / 0x23 | S | `kenya` | Same as RISC-V STORE. |
| 1100011 / 0x63 | B | `lekana` `halekane` `nyane` | Same as RISC-V BRANCH. |
| 1101111 / 0x6F | J | `tsamaea` | Same as RISC-V JAL. |
| 1100111 / 0x67 | I | `boela` | Same as RISC-V JALR. |
| 0001011 / 0x0B | --- | `ema` | RISC-V custom-0, reserved for extensions, so it cannot clash with a standard instruction. Remaining bits are 0. |

Reusing RISC-V opcodes means a student can compare any LIMO word with the RV32I card in Patterson & Hennessy.

| Instruction | funct3 | funct7 | Rationale |
|---|---|---|---|
| `eketsa` | 000 | 0000000 | add. |
| `tlosa` | 000 | 0100000 | sub; same funct3, bit 30 distinguishes it, as in RISC-V. |
| `le` | 111 | 0000000 | and. |
| `kapa` | 110 | 0000000 | or. |
| `eketsana` | 000 | --- | addi. |
| `suthela` | 001 | --- | slli; shift amount is imm[4:0], and imm[13:5] must be 0. |
| `nka` | 010 | --- | lw; 010 = word. |
| `kenya` | 010 | --- | sw; 010 = word. |
| `lekana` | 000 | --- | beq. |
| `halekane` | 001 | --- | bne. |
| `nyane` | 100 | --- | blt. |
| `boela` | 000 | --- | jalr. |

### 4.3 Immediate ranges

| Field | Bits | Meaning of the field | Range | Rationale |
|---|---|---|---|---|
| I / S immediate | 14, signed | bytes | −8192 ... +8191 (`nka`/`kenya` offsets must be multiples of 4: −8192 ... +8188) | 2 bits more than RV32I, paid for by the shorter register fields. |
| Shift amount | 5 | bits | 0 ... 31 | 32-bit word. |
| B offset | 14, signed | words, relative to the branch's own address | −8192 ... +8191 words = −32768 ... +32764 bytes | Word scaling gives 4× the reach for the same bits. |
| J offset | 21, signed | words, relative to the jump's own address | −1,048,576 ... +1,048,575 words = ±4 MiB | No funct3 or rs fields, so most of the word is free. |

Assembler: the offset is (target address − address of this instruction) / 4. Out-of-range values are rejected with an error that names the line and the allowed range.

### 4.4 One hand-encoded instruction per format

Source: `examples/kakaretso.limo`, `lenane.limo`, `mosebetsi.limo`. Every encoding below was also checked with the reference assembler in `tools/limo_ref.py`, so the team can re-run the check.

**R --- `eketsa nk0, nk0, nk1` (rd=3, rs1=3, rs2=4)**

| funct7 | rsv | rs2 | rs1 | funct3 | rd | opcode |
|---|---|---|---|---|---|---|
| 0000000 | 000 | 0100 | 0011 | 000 | 0011 | 0110011 |

Binary `0000 0000 0001 0000 1100 0001 1011 0011` = 0x0010C1B3. Check: 4·2¹⁸ + 3·2¹⁴ + 3·2⁷ + 0x33 = 0x100000 + 0xC000 + 0x180 + 0x33 = 0x10C1B3 ✓

**I --- `eketsana nk2, letho, 6` (rd=5, rs1=0, imm=6)**

| imm[13:0] | rs1 | funct3 | rd | opcode |
|---|---|---|---|---|
| 00000000000110 | 0000 | 000 | 0101 | 0010011 |

Binary `0000 0000 0001 1000 0000 0010 1001 0011` = 0x00180293.

**S --- `kenya nk3, 16(letho)` (rs2=6, rs1=0, imm=16 = 00 0000 0001 0000)**

| imm[13:4] | rs2 | rs1 | funct3 | imm[3:0] | opcode |
|---|---|---|---|---|---|
| 0000000001 | 0110 | 0000 | 010 | 0000 | 0100011 |

Binary `0000 0000 0101 1000 0001 0000 0010 0011` = 0x00581023.

**B --- `nyane nk1, nk2, lupu` at address 0x14; lupu = 0x0C. Offset = (0x0C − 0x14)/4 = −2 words = 11 1111 1111 1110 (14-bit two's complement). rs1=4, rs2=5.**

| off[13:4] | rs2 | rs1 | funct3 | off[3:0] | opcode |
|---|---|---|---|---|---|
| 1111111111 | 0101 | 0100 | 100 | 1110 | 1100011 |

Binary `1111 1111 1101 0101 0010 0111 0110 0011` = 0xFFD52763.

**J --- `tsamaea khutlo, habeli` at address 0x04; habeli = 0x30. Offset = (0x30 − 0x04)/4 = 11 words. rd=1.**

| off[20:0] | rd | opcode |
|---|---|---|
| 000000000000000001011 | 0001 | 1101111 |

Binary `0000 0000 0000 0000 0101 1000 1110 1111` = 0x000058EF.

---

## 5. Design-Decision Log (A6)

Each answer is at most 120 words. Numbers come from the three sample programs in §6, run through the reference model in `tools/limo_ref.py`. The pipeline model is: 5 stages, full forwarding, branches and jumps resolved in EX with predict-not-taken, one stall for load-use.

**(a) What does the register-file size cost and buy?** Sixteen registers give 4-bit fields. That frees three bits in R-type and two in I/S/B, which we spent on a 14-bit immediate (RV32I has 12) and 3 reserved bits. The register file is 512 flip-flops instead of 1024, and each of the six hazard comparators (four forwarding, two load-use) is 4 bits wide instead of 5. The cost is that only 15 registers are writable and 3 are reserved by convention (khutlo, qubu, motheo), leaving 12. `lenane.limo`, a four-element sum, already uses 7 of the 12. Nested calls must spill to memory. That is acceptable for first-year programs but would not suit a compiler.

**(b) Which registers are architectural and which only microarchitectural?** Architectural, so visible to programs and fixed by the ISA: the PC and r0--r15 (r0 hard-wired to 0), plus data memory. Microarchitectural, so internal to one implementation: IR, IF/ID, ID/EX, EX/MEM, MEM/WB, the control-signal latches, the forwarding muxes and the hazard unit. The ISA must not specify them because they are design choices: a single-cycle, 5-stage or 7-stage LIMO must run the same binary and produce the same architectural results. Fixing pipeline registers would freeze the design and break compatibility. Evidence: `kakaretso.limo` always ends with nk0 = 15, but the 31 cycles it takes on our pipeline are not defined by the ISA.

**(c) In which stage are branches resolved, and what does it cost?** In EX, predicting not-taken. A taken branch or jump flushes the two younger instructions already fetched. Evidence: `kakaretso.limo` has 4 taken branches, so 8 flushed slots out of 31 cycles (26%); `lenane.limo` loses 6 of 47. Resolving in ID would flush only one, but needs a dedicated comparator and target adder in ID, forwarding into ID, and a stall when the branch follows an ALU instruction (one cycle) or a load (two). We chose EX because it needs no extra hardware and is simple to explain; the 2-cycle penalty is expected to match the Ripes 5-stage pipeline, which we will confirm in B8.

**(d) Why does load-use still stall under full forwarding?** Load data exists only at the end of MEM, but a dependent instruction needs it at the start of EX. Forwarding wires only carry a value forward in time, so one bubble is unavoidable.

| cycle | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| `nka bl1, 0(bl0)` | IF | ID | EX | MEM | WB | | |
| `eketsa nk3,nk3,bl1` | | IF | ID | -- | EX | MEM | WB |

In cycle 4 the load is in MEM, producing its value only at the end of that cycle. `eketsa` can use it in EX in cycle 5 (forwarded from MEM/WB). `lenane.limo` stalls once per iteration: 4 stalls in 47 cycles.

**(e) Would LIMO benefit from a flags register?** No. LIMO's branches compare and branch in one instruction, so a loop test costs one instruction. With flags it becomes compare + branch: `lenane.limo` would run 4 more instructions (47 → 51 cycles). A flags register is also extra hidden state to save across calls, and it adds a new RAW dependency: every flag-setting instruction needs a forwarding path to the next branch, and the hazard unit must track flag writers. Its main benefit, carry for multi-word arithmetic, is not needed because LIMO has no multiply or divide.

**(f) As programs grow, what breaks first?** Register count. Twelve general registers run out quickly: a loop with two arrays, indices, bounds and a sum already needs most of them, and with no push/pop each spill is a store and a load. `lenane.limo` uses 7 for one array. Next comes the immediate range: 14 bits reach ±8 KiB, constants above 8191 need `eketsana` + `suthela` + `eketsa` because there is no lui, but our data memory is only 1 KiB. Branch reach (±8192 instructions) breaks last: our 1024-word instruction memory is far inside it.

---

