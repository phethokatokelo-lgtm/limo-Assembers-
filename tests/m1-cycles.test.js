// Checks the M1 spec cycle counts (31, 47, 22) with a small reference model that has forwarding and the
// load-use stall. The M3 Cpu in src/pipeline.js has neither, so it cannot reproduce these numbers directly.
// Cycles = instructions executed + 4 + load-use stalls + 2 per taken branch or jump.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assemble } from '../src/assembler.js';
import { decode } from '../src/pipeline.js';

function model(file) {
  const a = assemble(readFileSync(new URL(`../examples/${file}.limo`, import.meta.url), 'utf8'));
  assert.deepEqual(a.errors, []);
  const w = a.words, R = new Int32Array(16), M = new Int32Array(256);
  let pc = 0, n = 0, stalls = 0, flushed = 0, prev = null;
  for (;;) {
    const c = decode(w[pc >> 2]); n++;
    if (prev && prev.memRead && prev.rd && ((c.reads1 && c.rs1 === prev.rd) || (c.reads2 && c.rs2 === prev.rd))) stalls++;
    if (c.halt) break;
    const A = R[c.rs1], B = R[c.rs2], b = c.useImm ? c.imm : B; let next = pc + 4, res = 0;
    if (c.alu) res = { add: (x, y) => x + y | 0, sub: (x, y) => x - y | 0, and: (x, y) => x & y, or: (x, y) => x | y, sll: (x, y) => x << y }[c.alu](A, b);
    if (c.memRead) res = M[res >> 2]; if (c.memWrite) M[res >> 2] = B;
    if (c.jump) { res = pc + 4; next = c.jump === 'jal' ? pc + 4 * c.imm : (A + c.imm) & ~3; flushed += 2; }
    if (c.br && (c.br === 'eq' ? A === B : A < B)) { next = pc + 4 * c.imm; flushed += 2; }
    if (c.regWrite && c.rd) R[c.rd] = res;
    prev = c; pc = next;
  }
  return { n, stalls, flushed, cycles: n + 4 + stalls + flushed, R, M };
}

test('kakaretso: 19 + 4 + 0 + 8 = 31 cycles; nk0 = 15', () => {
  const m = model('kakaretso');
  assert.deepEqual([m.n, m.stalls, m.flushed, m.cycles], [19, 0, 8, 31]); assert.deepEqual([m.R[3], m.R[4], m.R[5]], [15, 6, 6]);
});
test('lenane: 33 + 4 + 4 + 6 = 47 cycles; mem[16] = 24', () => {
  const m = model('lenane');
  assert.deepEqual([m.n, m.stalls, m.flushed, m.cycles], [33, 4, 6, 47]); assert.deepEqual([...m.M.slice(0, 5)], [3, 5, 7, 9, 24]);
});
test('mosebetsi: 12 + 4 + 0 + 6 = 22 cycles; nt0 = 24, khutlo = 8', () => {
  const m = model('mosebetsi');
  assert.deepEqual([m.n, m.stalls, m.flushed, m.cycles], [12, 0, 6, 22]); assert.equal(m.R[11], 24); assert.equal(m.R[1], 8);
});
