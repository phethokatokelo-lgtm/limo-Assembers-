# Module Design — Assembler & Sesotho Assembly Language (M1)

**Owner:** Thoahlane (GitHub: GideoneThoahlane, 202403757)
**Role:** Assembler Lead
**Issues:** #4 (A3 – LIMO Instruction Set), #5 (A4 – Sesotho Assembly Language)

## 1. Role Summary
Thoahlane owns the LIMO assembler and the Sesotho assembly language: the
13-instruction set, the Sesotho mnemonics, the syntax/lexical rules, and how a
`.limo` source file is parsed and encoded into 32-bit machine instructions.
This builds on the formats and encodings in `docs/ISA_SPECIFICATION.md`.

## 2. Instruction Set (13 instructions)
| Class | Mnemonic | Syntax | Operation | Fmt | RV32I |
|---|---|---|---|---|---|
| Arithmetic | eketsa | eketsa rd, rs1, rs2 | R[rd] ← R[rs1] + R[rs2] | R | add |
| Arithmetic | tlosa | tlosa rd, rs1, rs2 | R[rd] ← R[rs1] − R[rs2] | R | sub |
| Arithmetic | eketsana | eketsana rd, rs1, imm | R[rd] ← R[rs1] + sext(imm14) | I | addi |
| Logic | le | le rd, rs1, rs2 | R[rd] ← R[rs1] & R[rs2] | R | and |
| Logic | kapa | kapa rd, rs1, rs2 | R[rd] ← R[rs1] \| R[rs2] | R | or |
| Logic | suthela | suthela rd, rs1, sh | R[rd] ← R[rs1] << sh (sh 0–31) | I | slli |
| Memory | nka | nka rd, off(rs1) | R[rd] ← Mem32[R[rs1] + sext(off)] | I | lw |
| Memory | kenya | kenya rs2, off(rs1) | Mem32[R[rs1] + sext(off)] ← R[rs2] | S | sw |
| Branch | lekana | lekana rs1, rs2, label | if R[rs1]=R[rs2]: PC ← PC + 4·off | B | beq |
| Branch | nyane | nyane rs1, rs2, label | if R[rs1]<R[rs2] (signed): PC ← PC + 4·off | B | blt |
| Jump | tsamaea | tsamaea rd, label | R[rd] ← PC+4; PC ← PC + 4·off | J | jal |
| Jump | boela | boela rd, rs1, imm | R[rd] ← PC+4; PC ← (R[rs1]+sext(imm)) & ~3 | I | jalr |
| System | ema | ema | stop fetching, drain pipeline, halt | – | none |

**Pseudo-instruction (assembler only):**
`khutla` → `boela letho, khutlo, 0` ("to return from a procedure").

## 3. Register Operand Forms
Registers may be written three ways (all equivalent):
- **Number:** `r0`–`r15`
- **Alias:** `zero, ra, sp, t0–t3, s0–s3, a0–a3, gp`
- **Sesotho name:** `letho, khutlo, qubu, nk0–nk3, bl0–bl3, nt0–nt3, motheo`

## 4. Lexical Rules
- One instruction per line: `<mnemonic> <operands>`.
- A label is a name followed by `:` — on its own line or before an instruction
  (e.g. `lupu:`).
- Comments start with `;` and run to end of line.
- Mnemonics, register names and labels are **case-insensitive** (`ADD` = `add`).
- Operands are comma-separated; memory operands are `offset(register)`.
- Immediates are decimal or hexadecimal (`0x…`) and may be negative.
- **Apostrophes** (`'` and `` ` ``) are accepted and stripped when names are
  compared, so `ts'ebetso`, `ts'ebetso` and `tsebetso` are one name. Labels that
  become equal are reported as duplicates. (No mnemonic uses an apostrophe.)
- Errors are written in simple language and give the **line number**.

## 5. Assembler Flow
1. Read the `.limo` source line by line.
2. Strip comments (`;`) and blank lines; record label addresses.
3. Parse each line into a mnemonic + operands; resolve register forms 
4. Encode into the correct 32-bit format (R/I/S/B/J) per the ISA spec.
5. Compute branch/jump offsets as `(target − this address) / 4` (word offsets).
6. Output the machine-code image for instruction memory.

## 6. Range & Alignment Checks (assembler must enforce)
- I/S immediates: 14-bit signed, −8192…+8191.
- `nka`/`kenya` offsets must be multiples of 4.
- `suthela` shift amount: 0–31 (imm[13:5] must be 0).
- B offset: 14-bit signed word offset; J offset: 21-bit signed word offset.
- Out-of-range values are rejected, naming the line and the allowed range.

## 7. Testing & Verification Plan
- Assemble the three sample programs (`kakaretso.limo`, `lenane.limo`,
  `mosebetsi.limo`) and confirm the hex matches the A5 worked examples.
- Test error handling: unknown mnemonic, wrong operand count, undefined label,
  duplicate (apostrophe-equal) labels, out-of-range immediate, misaligned offset.

## 8. Related Docs
- `docs/ISA_SPECIFICATION.md` — formats, opcodes, encodings (A1–A5, Letuka)
- `docs/DESIGN_DECISION_LOG.md` — A6 decisions
- `docs/TEAM_CHARTER.md` — roles




