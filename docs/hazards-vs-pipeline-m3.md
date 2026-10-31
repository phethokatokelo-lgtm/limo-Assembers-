# M3 comparison: `docs/hazards.md` vs `src/pipeline.js`

**Prepared for:** Thoahlane (hazard-side check) · **Milestone:** M3 · **Compared:** `docs/hazards.md` (M2) with `src/pipeline.js` (M3, 37 tests passing)

## Summary

`pipeline.js` implements the five stages, the pipeline registers, the control unit and the **control hazard** (flush). It does **not** yet implement **forwarding** or the **load-use stall**, which are planned for M4. Six wording gaps in `hazards.md` should be fixed before M4 is coded.

## A. Documented but not yet implemented (planned for M4)

| # | `hazards.md` | `pipeline.js` (M3) | Action |
|---|---|---|---|
| A1 | §2 Forwarding: ForwardA and ForwardB from EX/MEM and MEM/WB | Not implemented. EX always uses the values read in ID. | Implement in M4 |
| A2 | §3 Load-use stall: hold PC and IF/ID, bubble into ID/EX | Not implemented. The core cannot hold the PC or IF/ID yet. | Implement in M4 |
| A3 | §5 Diagrams 1, 2 and 4 (forwarding and stall cases) | Cannot be reproduced yet | Re-check after A1 and A2 |
| A4 | §7 Evidence: 31, 47 and 22 cycles | Not matched yet (see table below) | Re-check after A1 and A2 |

**The three M1 programs run on the M3 core** (no forwarding, no stalls):

| Program | `hazards.md` (instructions / flushed / cycles) | M3 core (instructions / flushed / cycles) |
|---|---|---|
| kakaretso.limo | 19 / 8 / 31 | 22 / 10 / 36 |
| lenane.limo | 33 / 6 / 47 | 38 / 8 / 50 |
| mosebetsi.limo | 12 / 6 / 22 | 12 / 6 / 22 |

The first two differ because instructions read old register values, which changes how many times the loops run. This is expected without forwarding. `mosebetsi.limo` matches in counts, but its final registers and memory have **not** been checked, so the match does not prove it is correct. M4 target: all three programs give the documented numbers **and** the correct final state.

## B. Documented and matching the code

- **Control hazard (§4):** a taken `lekana`, `nyane`, `tsamaea` or `boela` sets the PC to the target and flushes 2 slots; a branch that is not taken costs nothing. The target is fetched in the cycle after the branch is in EX, as in Diagram 3.
- **No structural hazard (§1):** instruction memory and data memory are separate.
- **Register-file timing (§6):** written in the first half of the cycle, read in the second. The code runs WB before ID to do this.
- **Cost table (§6):** agrees with the code's timing. A consumer with two or more instructions between it and its producer reads the correct value without forwarding.
- **Cycle formula (§7):** instructions executed + 4 + stalls + flushed slots, with stalls = 0 in M3.
- **r0 (§2):** writes to r0 are ignored.

## C. Gaps and wording to fix in `hazards.md`

| # | Gap | Proposed fix |
|---|---|---|
| C1 | The forwarding rules (§2) and the load-use condition (§3) compare `rd` with "rs1 or rs2". For `eketsana`, `nka` and `suthela`, the bits that decode as `rs2` are the low bits of the immediate, so the rule would cause false stalls and false forwards. | Add: "and the instruction actually reads that register". The code already carries `reads1` and `reads2` for this. |
| C2 | `boela` computes its target `(rs1 + imm)` in EX, so it needs ForwardA. §2 mentions only the ALU, `kenya` and branches. | Add `boela` to the ForwardA users. |
| C3 | Diagram 3 shows the instruction at B+8 in IF in cycle 3. The simulator leaves IF empty in that cycle (nothing is fetched on a redirect). The cycle count is the same. | Decide whether the M4 pipeline chart shows an `X` or an empty slot, and make the document and the chart agree. |
| C4 | `ema` is not covered. The code stops fetching once an `ema` is in flight, and a flushed `ema` has no effect. | State how a stall or flush next to `ema` behaves. |
| C5 | §3 defines a bubble as "all control bits 0, `valid = false`". The code's bubble is `{ valid: false }` with no control fields. They are equivalent. | Pick one wording. |
| C6 | Names differ: `ID/EX.rs1`, `RegWrite`, `MemRead` in the document; `idex.c.rs1`, `c.regWrite`, `c.memRead` in the code. | Add the name table from section 10 of `pipeline-register-data-model-m2.md`. |

## D. Items for the board (one issue each)

Suggested label: `docs-mismatch` (use `M4` for A1 and A2).

1. **A1 + A2: Forwarding and load-use stall not implemented in M3.** Planned for M4. Acceptance test: the three M1 programs give 31, 47 and 22 cycles with the correct final state.
2. **C1: Add "instruction actually reads the register" to the forwarding and stall rules.** Owner: author of `docs/hazards.md`.
3. **C2: Add `boela` to the ForwardA users.**
4. **C3: Decide how the pipeline chart shows the slot after a taken branch.**
5. **C4 + C5 + C6: `ema`, bubble wording and name table in `hazards.md`.**

## E. Text for the M3 sprint note ("Not done, and why")

Forwarding and the load-use stall (`docs/hazards.md` §2 and §3) are not implemented in M3. The M3 requirement is hazard-free programs, so they are planned for M4. The control hazard (flush of 2 slots on a taken branch or jump) is implemented and tested. Running the three M1 programs on the M3 core gives 36, 50 and 22 cycles instead of 31, 47 and 22; the difference is expected without forwarding and will be re-checked in M4. Six documentation gaps in `hazards.md` are listed on the board as `docs-mismatch` issues.
