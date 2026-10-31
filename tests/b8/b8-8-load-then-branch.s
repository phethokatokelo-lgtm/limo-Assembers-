# B8-8  load feeding a branch (1 stall), then taken
        addi t0, zero, 9
        sw    t0, 0(zero)
        lw      t1, 0(zero)
        beq   t1, t0, fin         # 9 == 9, taken, needs nk1 at once
        addi t2, zero, 99        # skipped
        addi t3, zero, 99        # skipped
fin:    addi s0, zero, 5
        li a7, 10
        ecall
