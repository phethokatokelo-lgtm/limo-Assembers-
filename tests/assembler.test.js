import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assemble } from '../src/assembler.js';
const hexOf = s => assemble(s).listing.map(l => l.hex.slice(2));
const firstErr = s => assemble(s).errors[0]?.msg ?? '';

// Expected words are copied from the M1 specification (hand-encoded, independent of the assembler).
const M1 = {
  kakaretso: '00000193 00040213 00180293 0010C1B3 00050213 FFD52763 0000000B',
  lenane: '000C0193 000C1023 00140193 000C1223 001C0193 000C1423 00240193 000C1623 00000213 00100293 00000313 00090B93 0001D403 00218333 00050213 FFD52663 00581023 0000000B',
  mosebetsi: '00300593 000050EF 00280193 000EFA33 000EF2B3 40114333 002C1023 00181223 00110163 018C0313 0000000B 002EC5B3 00004067',
};
for (const [name, words] of Object.entries(M1))
  test(`M1 sample program ${name}.limo matches hand-encoded hex`, () => {
    const r = assemble(readFileSync(new URL(`../examples/${name}.limo`, import.meta.url), 'utf8'));
    assert.deepEqual(r.errors, []);
    assert.equal(r.listing.map(l => l.hex.slice(2)).join(' '), words);
  });

test('A5 worked example: one instruction per format', () => {
  assert.deepEqual(hexOf('eketsa nk0, nk0, nk1'), ['0010C1B3']);            // R
  assert.deepEqual(hexOf('eketsana nk2, letho, 6'), ['00180293']);          // I
  assert.deepEqual(hexOf('kenya nk3, 16(letho)'), ['00581023']);            // S
  assert.deepEqual(hexOf('nop: ema'), ['0000000B']);                        // N (halt)
});
test('J: tsamaea at 0x04 to 0x2C encodes 0x000050EF', () => {
  const src = 'ema\ntsamaea khutlo, h\n' + 'ema\n'.repeat(9) + 'h: ema';
  assert.equal(hexOf(src)[1], '000050EF');
});
test('B: backward branch gives negative offset, forward gives positive', () => {
  assert.equal(assemble('nop: ema\nema\nnyane nk1, nk2, nop').listing[2].fields[0].bits, '1111111111'); // off=-2 (0x3FE): off[13:4]=0x3FF
  const r = assemble('lekana r0, r0, f\nema\nf: ema');
  assert.equal(r.listing[0].fields.find(f => f.name === 'off[3:0]').bits, '0010'); // +2 words
});
test('Register names: number, alias and Sesotho name are equivalent', () => {
  const a = hexOf('eketsa r3, r11, r7')[0];
  for (const s of ['eketsa nk0, nt0, bl0', 'eketsa t0, a0, s0', 'EKETSA Nk0 , Nt0 , Bl0']) assert.equal(hexOf(s)[0], a);
  assert.equal(hexOf('eketsa letho, khutlo, qubu')[0], hexOf('eketsa r0, r1, r2')[0]);
  assert.equal(hexOf('eketsa motheo, motheo, motheo')[0], hexOf('eketsa r15, r15, r15')[0]);
});
test('Apostrophes in labels are ignored; labels that collide are duplicates', () => {
  assert.deepEqual(assemble("ts'ebetso: ema\ntsamaea r0, tsebetso").errors, []);
  assert.deepEqual(assemble("ts’ebetso: ema\ntsamaea r0, ts‘ebetso").errors, []);
  assert.match(firstErr("ts'a: ema\ntsa: ema"), /Line 2: label "tsa" is already defined/);
});
test('Pseudo-instruction khutla = boela letho, khutlo, 0', () => {
  assert.equal(hexOf('khutla')[0], '00004067');
  assert.equal(hexOf('boela letho, khutlo, 0')[0], '00004067');
});
test('Comments, blank lines, labels on their own line, hex and negative immediates', () => {
  const r = assemble('; header\n\nstart:\n  eketsana r3, r0, 0x10 ; sixteen\n  eketsana r3, r3, -1\n');
  assert.deepEqual(r.errors, []);
  assert.equal(r.listing[0].addr, 0); assert.equal(r.labels.start, 0);
  assert.equal(r.listing[0].fields[0].bits, '00000000010000');          // imm = 16
  assert.equal(r.listing[1].fields[0].bits, '11111111111111');          // imm = -1 (14-bit)
});
test('Immediate range: -8192..8191 accepted, 8192 rejected with line and range', () => {
  assert.deepEqual(assemble('eketsana r3, r0, 8191\neketsana r3, r0, -8192').errors, []);
  assert.match(firstErr('ema\neketsana r3, r0, 8192'), /Line 2: .*out of range.*-8192 to 8191/);
});
test('suthela shift amount must be 0..31', () => {
  assert.deepEqual(assemble('suthela r3, r4, 31').errors, []);
  assert.match(firstErr('suthela r3, r4, 32'), /shift amount 32 is out of range.*0 to 31/);
});
test('nka/kenya offsets must be multiples of 4 and use offset(register) syntax', () => {
  assert.match(firstErr('nka r3, 2(r4)'), /multiple of 4/);
  assert.match(firstErr('kenya r3, r4'), /offset\(register\)/);
  assert.deepEqual(assemble('nka r3, (r4)').errors, []);
});
test('Plain-language errors name the line', () => {
  assert.match(firstErr('eketsa r3, r1'), /Line 1: "eketsa" needs 3 operands .* found 2/);
  assert.match(firstErr('\n\neketsaa r3, r1, r2'), /Line 3: .*"eketsaa".*Did you mean "eketsa"/);
  assert.match(firstErr('eketsa r3, r1, r16'), /"r16" is not a register/);
  assert.match(firstErr('lekana r1, r2, nowhere'), /label "nowhere" is not defined/);
  assert.match(firstErr('eketsana r3, r0, abc'), /"abc" is not a immediate|"abc" is not a/);
});
test('All errors are collected, not just the first', () => {
  const r = assemble('foo\neketsa r1\nnka r3, 2(r4)');
  assert.equal(r.ok, false); assert.equal(r.errors.length, 3); assert.deepEqual(r.words, []);
});
test('Branch beyond 14-bit word reach is rejected', () => {
  const far = 'lekana r0, r0, f\n' + 'ema\n'.repeat(8192) + 'f: ema';
  assert.ok(assemble(far).errors.some(e => /too far away/.test(e.msg)));  // also exceeds 1024-word memory
});
test('Program larger than instruction memory (1024 words) is rejected', () => {
  assert.match(firstErr('ema\n'.repeat(1025)), /holds only 1024/);
  assert.deepEqual(assemble('ema\n'.repeat(1024)).errors, []);
});
test('Case-insensitive mnemonics; fields expose colour-coding data', () => {
  const l = assemble('EKETSA R3, R4, R5').listing[0];
  assert.equal(l.fmt, 'R'); assert.equal(l.fields.map(f => f.name).join(), 'funct7,rsv,rs2,rs1,funct3,rd,opcode');
  assert.equal(l.fields.map(f => f.bits).join(''), l.bin);
});
test('kapa r3, r4, r5 (R-type, funct3 110)', () => {
  assert.deepEqual(hexOf('kapa r3, r4, r5'), ['001531B3']);
});
test('eketsana with -1 fills the 14-bit immediate', () => {
  assert.deepEqual(hexOf('eketsana r3, r0, -1'), ['FFFC0193']);
});
test('nka r3, 8(r4) (I-type load, funct3 010)', () => {
  assert.deepEqual(hexOf('nka r3, 8(r4)'), ['00211183']);
});
