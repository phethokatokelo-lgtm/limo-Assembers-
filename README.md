# LIMO — A Sesotho-Based Instruction Set Architecture

**CS3520: Computer Organisation and Architecture**  
National University of Lesotho · Faculty of Science and Technology  
Academic Year 2026/2027

## Overview

LIMO is an educational processor project based on a subset of the RISC-V instruction set architecture (ISA). It introduces Sesotho-based assembly mnemonics and is designed to support the study of instruction encoding, processor datapaths, pipeline execution, and hazard control.

The project includes an assembler and an online pipeline datapath and control simulator.

## Objectives

- Design a compact, 32-bit instruction set using Sesotho mnemonics.
- Implement instruction encoding and decoding.
- Demonstrate arithmetic, logic, memory access, branching, and procedure calls.
- Explore processor pipelining, data hazards, control hazards, forwarding, and stalls.
- Provide an educational environment for understanding computer organisation and architecture.

## Architecture

LIMO uses a 32-bit, load-store architecture with fixed-length 32-bit instructions.

| Component | Specification |
|---|---|
| Instruction length | 32 bits |
| Instruction formats | R, I, S, B, J |
| Total instructions | 13 |
| Registers | 16 general-purpose and special-purpose register slots |
| General-purpose registers | 12: r3–r14 |
| Instruction memory | 4 KiB (1024 words) |
| Data memory | 1 KiB (256 words) |
| Memory organisation | Byte-addressed, little-endian |
| Memory operations | Word load and word store |

Instruction memory and data memory are separate. The processor starts with the program counter at address zero.

## Instruction Set

| Mnemonic | Function | Equivalent RISC-V instruction |
|---|---|---|
| `eketsa` | Add two registers | `add` |
| `tlosa` | Subtract | `sub` |
| `eketsana` | Add an immediate | `addi` |
| `le` | Bitwise AND | `and` |
| `kapa` | Bitwise OR | `or` |
| `suthela` | Logical left shift | `slli` |
| `nka` | Load a word | `lw` |
| `kenya` | Store a word | `sw` |
| `lekana` | Branch if equal | `beq` |
| `nyane` | Branch if signed less-than | `blt` |
| `tsamaea` | Jump and link | `jal` |
| `boela` | Jump and link register | `jalr` |
| `ema` | Halt execution | No direct RV32I equivalent |

The assembler also supports `khutla` as a pseudo-instruction for returning from a procedure.

## Register Conventions

| Registers | Sesotho names | Purpose |
|---|---|---|
| `r0` | `letho` | Constant zero |
| `r1` | `khutlo` | Return address |
| `r2` | `qubu` | Stack pointer convention |
| `r3–r6` | `nk0–nk3` | Temporary values |
| `r7–r10` | `bl0–bl3` | Saved values |
| `r11–r14` | `nt0–nt3` | Arguments and results |
| `r15` | `motheo` | Global pointer convention |

The program counter is called `sebaka` in Sesotho. The stack-pointer and global-pointer conventions do not imply built-in push/pop instructions.

## Assembly Syntax

A simple LIMO instruction follows this structure:

```asm
mnemonic destination, source, operand
```

Example:

```asm
eketsana nk0, letho, 5
eketsana nk1, letho, 3
eketsa nk2, nk0, nk1
ema
```

This example loads 5 and 3 into registers, adds them, and halts. The expected result is `nk2 = 8`.

Assembly syntax supports:
- Register numbers, aliases, and Sesotho register names.
- Decimal and hexadecimal immediate values.
- Labels for branches and jumps.
- Semicolon (`;`) comments.
- Case-insensitive mnemonics, register names, and labels.
- Memory operands in `offset(register)` format.

## Sample Programs

The M1 specification provides three sample programs:

1. **`kakaretso.limo`** — calculates the sum of integers from 1 to 5 using a loop.
2. **`lenane.limo`** — stores four integers in memory, loads them, calculates their sum, and stores the result.
3. **`mosebetsi.limo`** — demonstrates a procedure call and return, bitwise operations, subtraction, memory stores, and conditional branching.

These examples illustrate arithmetic, arrays, branches, memory access, and procedure control flow.

## Pipeline and Hazard Control

The five-stage pipeline considered in the M1 design consists of:

1. Instruction Fetch (IF)
2. Instruction Decode (ID)
3. Execute (EX)
4. Memory Access (MEM)
5. Write Back (WB)

The design uses forwarding to reduce data hazards. A load-use dependency still requires a stall because loaded data becomes available only at the end of the MEM stage.

Branches are resolved in EX, with a not-taken prediction policy. Taken branches and jumps flush younger instructions already in the pipeline.

## Repository

- **Source code:** https://github.com/phethokatokelo-lgtm/limo-Assemblers

## Testing

The M1 specification includes hand-encoded instructions and expected results for three sample programs. These provide reference cases for checking the assembler and simulator.

Before releasing a change:
- Verify instruction encodings against the ISA specification.
- Test immediate values, branches, jumps, loads, and stores.
- Check procedure calls and returns.
- Test load-use stalls and taken-branch flushing.
- Confirm expected register and memory states.
- Submit changes through a reviewed pull request and ensure tests pass.

## Development Workflow

The team follows a feature-branch and pull-request workflow.

1. Create a feature branch.
2. Implement and document the change.
3. Test the change.
4. Open a pull request.
5. Obtain review and approval from another team member.
6. Merge the approved change into the protected main branch.

## References

- RISC-V International. *The RISC-V Instruction Set Manual, Volume I: Unprivileged ISA*.
- Patterson, D. A., and Hennessy, J. L. *Computer Organization and Design: The Hardware/Software Interface, RISC-V Edition*.
- Ripes, a graphical RISC-V pipeline simulator, used for comparison.

## Academic Project

LIMO is developed as part of CS3520 Computer Organisation and Architecture at the National University of Lesotho during the 2026/2027 academic year.
