# B8: Ripes cross-check programs (Phethoka, test lead)

Each `.limo` file has a Ripes-ready `.s` twin (translated by alias, never by register number; `ema` becomes `li a7, 10` + `ecall`).
Cycles = instructions executed + 4 + load-use stalls + 2 per taken branch/jump (ema counted).

| Program | Tests | Instr (incl. ema) | Stalls | Flushed | LIMO cycles | Final state |
|---|---|---|---|---|---|---|
| b8-1-alu | all ALU ops | 9 | 0 | 0 | 13 | bl0=22 bl1=-2 bl2=8 bl3=14 nt0=48 |
| b8-2-raw-forward | back-to-back RAW | 5 | 0 | 0 | 9 | nk1=12 nk2=17 nk3=5 |
| b8-3-load-use | load then use | 5 | 1 | 0 | 10 | nk1=42 nk2=43 mem[8]=42 |
| b8-4-branch-taken | taken lekana | 5 | 0 | 2 | 11 | bl0=1, nk2=nk3=0 |
| b8-5-branch-not-taken | not-taken lekana | 5 | 0 | 0 | 9 | nk2=7 |
| b8-6-countdown-loop | nyane loop | 13 | 0 | 4 | 21 | nk0=6 |
| b8-7-call-return | tsamaea / khutla | 6 | 0 | 4 | 14 | nt0=12 nk0=13 khutlo=8 |
| b8-8-load-then-branch | load feeds branch | 6 | 1 | 2 | 13 | bl0=5 mem[0]=9 |

To compare with Ripes: load the `.s`, choose the 5-stage processor WITH forwarding and hazard detection, run, record the cycle
count, then subtract the 2 extra instructions that the translated `ema` adds (`li a7,10` and `ecall`) and explain any difference.
