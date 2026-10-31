# B8-6  sum 3+2+1 with nyane loop
        addi t0, zero, 0         # sum
        addi t1, zero, 3         # i
        addi t2, zero, 0         # zero limit
lupu:   add   t0, t0, t1
        addi t1, t1, -1
        blt    t2, t1, lupu        # 0 < i ?
        li a7, 10
        ecall
