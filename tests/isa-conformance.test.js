// ISA conformance: the pipeline decoder must agree with the FROZEN ISA v1.0 table.
// Expected opcode / funct3 / funct7 are typed in from the specification, not read from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../src/assembler.js';
import { decode } from '../src/pipeline.js';

// mnemonic: [example, format, opcode, funct3 (or null), funct7 (or null)]
const ISA = {
  eketsa:  ['eketsa r3, r4, r5',    'R', 0x33, 0, 0x00],
  tlosa:   ['tlosa r3, r4, r5',     'R', 0x33, 0, 0x20],
  le:      ['le r3, r4, r5',        'R', 0x33, 7, 0x00],
  kapa:    ['kapa r3, r4, r5',      'R', 0x33, 6, 0x00],
  eketsana:['eketsana r3, r4, -7',  'I', 0x13, 0, null],
  suthela: ['suthela r3, r4, 31',   'I', 0x13, 1, null],
  nka:     ['nka r3, 8(r4)',        'I', 0x03, 2, null],
  kenya:   ['kenya r3, -8(r4)',     'S', 0x23, 2, null],
  lekana:  ['l: lekana r3, r4, l',  'B', 0x63, 0, null],
  nyane:   ['l: nyane r3, r4, l',   'B', 0x63, 4, null],
  tsamaea: ['l: tsamaea r1, l',     'J', 0x6f, null, null],
  boela:   ['boela r0, r1, 4',      'I', 0x67, 0, null],
  ema:     ['ema',                  'N', 0x0b, null, null],
};
for (const [m, [src, fmt, op, f3, f7]] of Object.entries(ISA))
  test(`ISA v1.0: ${m} is format ${fmt}, opcode 0x${op.toString(16)}, decoded as ${m}`, () => {
    const w = assemble(src).words[0];
    assert.equal(w & 127, op, 'opcode field');
    if (f3 !== null) assert.equal((w >> 11) & 7, f3, 'funct3 field');
    if (f7 !== null) assert.equal(w >>> 25, f7, 'funct7 field');
    const d = decode(w);
    assert.ok(d, 'decoder accepts the word'); assert.equal(d.name, m); assert.equal(d.fmt, fmt);
  });
test('ISA v1.0: immediates sign-extend correctly (I, S, B, J)', () => {
  assert.equal(decode(assemble('eketsana r3, r4, -7').words[0]).imm, -7);
  assert.equal(decode(assemble('kenya r3, -8(r4)').words[0]).imm, -8);
  assert.equal(decode(assemble('l: ema\nnyane r1, r2, l').words[1]).imm, -1);
  assert.equal(decode(assemble('ema\nl: ema\nema\ntsamaea r1, l').words[3]).imm, -2);
});
test('ISA v1.0: words outside the ISA are rejected', () => {
  assert.equal(decode(0), null, 'opcode 0');
  assert.equal(decode(assemble('eketsa r3, r4, r5').words[0] | (1 << 22)), null, 'reserved R bit set');
  assert.equal(decode(assemble('ema').words[0] | (1 << 7)), null, 'ema with non-zero filler');
});
