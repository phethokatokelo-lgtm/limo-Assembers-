# B8-5  not-taken lekana costs nothing
        addi t0, zero, 4
        addi t1, zero, 5
        beq   t0, t1, fin
        addi t2, zero, 7
fin:    li a7, 10
        ecall
