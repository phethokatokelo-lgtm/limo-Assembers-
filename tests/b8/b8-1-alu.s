# B8-1  ALU mix, no hazards
        addi t0, zero, 12
        addi t1, zero, 10
        addi t2, zero, 3
        add   s0, t0, t1         # 22
        sub    s1, t1, t0         # -2
        and       s2, t0, t1         # 8
        or     s3, t0, t1         # 14
        slli  a0, t2, 4           # 48
        li a7, 10
        ecall
