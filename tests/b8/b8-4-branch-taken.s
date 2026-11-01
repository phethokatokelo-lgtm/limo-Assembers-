# B8-4  taken lekana skips two instructions (2 flushed)
        addi t0, zero, 4
        addi t1, zero, 4
        beq   t0, t1, fin
        addi t2, zero, 99        # skipped
        addi t3, zero, 99        # skipped
fin:    addi s0, zero, 1
        li a7, 10
        ecall
