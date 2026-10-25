# LIMO ISA Freeze (M2, requirement R1)

| Item | Value |
|---|---|
| ISA | LIMO |
| Frozen version | **1.0** |
| Prepared | 24 October 2026 |
| Team | Assemblers, lab group A |
| Specification | `docs/isa_specification.md` |
| Machine-readable ISA | `src/isa.json` |
| SHA-256 of `src/isa.json` at freeze | `dafc3fb667e1e484b981413311d37a786de268d8215e56ccef054e97230e35f3` |
| D1 feedback | **Pending** (D1 postponed). Amendments are allowed once, as version 1.0.1, see section 5. |
| Team sign-off | **Pending** (section 7) |

To check that `isa.json` has not been changed since the freeze, run `sha256sum src/isa.json` (Git Bash or Linux) or `Get-FileHash src\isa.json` (PowerShell). The result must equal the value above, or the version number and this table must have been updated through section 4.

## 1. What "frozen" means

From this point, the assembler, the control decoder, the simulator, the tests and the user guide are all built on ISA 1.0. A change to the ISA breaks every one of them, so it can be made only through the change-control process in section 4.

### 1.1 Frozen (changes need a change request)

- The 16 registers: numbers, Sesotho names and aliases, r0 hard-wired to 0, the PC.
- The five formats, every field position and width, and the reserved bits.
- All 13 instructions: mnemonic, format, opcode, funct3, funct7, syntax and operation.
- The pseudo-instruction `khutla` and its expansion.
- Immediate widths and ranges, and the word-offset rule for branches and jumps.
- Memory sizes, byte order, alignment rule and reset state.
- The lexical rules, including the apostrophe rule.
- The three sample programs' machine code, final states and cycle counts.

### 1.2 Not frozen (the team may change these freely)

- The simulator design: stages, latches, hazard unit and everything in `pipeline-data-model.md` and `architecture.md`.
- The assembler's error messages, extra assembler features (such as a `.word` directive) and the interface.
- Additional example programs and tests.

An assembler feature is allowed without a change request only if every program that assembled before still assembles to the same machine code.

## 2. Checks done at freeze

| Check | Result |
|---|---|
| `isa.json` is valid JSON and has the 16 registers, 5 formats, 13 instructions, 1 pseudo-instruction | Passed |
| Every instruction's example assembles to the stated hex, and its opcode in binary matches the hex | Passed (13 of 13) |
| The three sample programs assemble to the machine code in the M1 report | Passed |
| An independent interpreter runs the three programs and confirms instructions executed, stalls, flushed slots, cycles and final registers and memory | Passed (31, 47 and 22 cycles) |
| Hand-derived encodings in the specification (R, I, S, B and J) match the assembler | Passed |
| Assembler unit tests and data-model tests (`npm test`) | Passed (31 of 31) |

The interpreter check also confirmed some values the M1 report did not list for `lenane.limo`: nk0 = 9, nk1 = 4, nk2 = 4, bl0 = 12, bl1 = 9.

## 3. Decisions the team must confirm before M3

These are not ISA rules, but the simulator cannot be built until each has one answer. They are written into `isa.json` under `referenceImplementation.decisionsToConfirm` and in section 9 of `pipeline-data-model.md`.

| # | Decision | Proposed answer | Agreed |
|---|---|---|---|
| 1 | When does `ema` halt the machine? | When it reaches WB. An `ema` that is flushed has no effect. | [ ] |
| 2 | Register-file timing | Write in the first half of the cycle, read in the second half. | [ ] |
| 3 | Data address outside 0 to 1020, or not a multiple of 4 | The simulator stops with a plain-language error. | [ ] |
| 4 | An illegal instruction word reaches ID | The simulator stops with a plain-language error. | [ ] |
| 5 | Branch resolution | In EX, predict not-taken, a taken branch or jump flushes 2 slots. | [ ] |

## 4. Change control (after the freeze)

1. **Raise an issue** on the GitHub board with the label `isa-change`. State what would change, why, and which files and tests it affects.
2. **Decide.** The ISA architect and at least one other member must approve. If the team disagrees, the Scrum and release lead refers it to the project coordinator, as in the team charter.
3. **Make the change in one pull request** that updates all of these together: `src/isa.json`, `docs/isa_specification.md`, the affected tests in `tests/`, the assembler if needed, and this file.
4. **Bump the version** (section 6) and record the new SHA-256 of `isa.json` in the table at the top.
5. **Tell everyone** in the team chat. Members rebase their branches before continuing.

A change after the freeze costs marks if it is not recorded. The handout expects the ISA to be frozen with D1 feedback applied, so do not use this process for convenience, only for errors and for D1 feedback.

## 5. D1 feedback log

Fill this in after the D1 defence. Apply all accepted items in one pull request and publish them as version 1.0.1.

| # | Examiner's comment | Decision (accept, reject with reason) | Files changed | Done |
|---|---|---|---|---|
| 1 | | | | [ ] |
| 2 | | | | [ ] |
| 3 | | | | [ ] |

## 6. Version history

| Version | Date | Change | `isa.json` SHA-256 |
|---|---|---|---|
| 1.0 | 24 Oct 2026 | First freeze from the M1 specification. Added complete field widths, ranges, examples, behaviour rules and sample-program data to `isa.json`. | `dafc3fb6...e35f3` (full value in the table at the top) |

## 7. Team sign-off

Each member confirms that they have read the specification and `isa.json`, and can explain any instruction's encoding from memory.

| Member | Role | Signed (initials) | Date |
|---|---|---|---|
| Letuka | ISA architect | | |
| Thoahlane | Assembler lead | | |
| Moletsane | Pipeline lead | | |
| Phethoka | Hazard-unit lead, Scrum and release lead | | |
| Khobotlo | Interface lead | | |
| Mongaula | Test lead | | |

## 8. Items to correct before the final submission

These are in the M1 report or the specification. They do not change the ISA.

1. **Reference [4]** (Sesotho sources) is still a placeholder. Name the dictionary or the first-language speaker, and confirm the meanings of the mnemonics and the register-group names `nakoana`, `boloka` and `ntlha`.
2. **Live-site link** in the M1 report has a space after `https://`.
3. **Project board link** points to `limo-Assembers-.git`, which is misspelled and is a repository address, not the board.
4. **Phethoka's GitHub name** is written `Phethokatokelo-igtm` in the member table, but the repository owner is `phethokatokelo-lgtm`.
5. **Sprint note**: "Not done, and why" says "Done", and four checklist items are marked "To verify" (`AI_USE.md`, `docs/M1.pdf`, the commit SHA, the tag).
6. **`AI_USE.md`** must also list this use of Claude (writing the specification and freeze documents, generating `isa.json`, checking examples), with what the team changed.
