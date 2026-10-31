# B8-2  back-to-back RAW dependencies (forwarding, 0 stalls)
        addi t0, zero, 5
        addi t1, t0, 7           # 12
        add   t2, t1, t0         # 17
        sub    t3, t2, t1         # 5
        li a7, 10
        ecall
