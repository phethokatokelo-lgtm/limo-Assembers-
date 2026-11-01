# B8-3  load followed at once by its user (1 stall)
        addi t0, zero, 42
        sw    t0, 8(zero)
        lw      t1, 8(zero)
        addi t2, t1, 1           # load-use: 43
        li a7, 10
        ecall
