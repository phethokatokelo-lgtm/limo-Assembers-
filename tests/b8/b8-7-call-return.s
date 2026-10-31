# B8-7  call, return, use result
        addi a0, zero, 6
        jal  ra, dubula
        addi t0, a0, 1           # 13
        li a7, 10
        ecall
dubula: add   a0, a0, a0         # 12
        ret
