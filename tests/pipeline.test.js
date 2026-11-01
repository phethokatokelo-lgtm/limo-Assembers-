import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../src/assembler.js';
import { Cpu, decode } from '../src/pipeline.js';

// M3 has no forwarding or stalls, so dependent instructions are kept 3 apart with nops.
const NOP = 'eketsana letho, letho, 0';
const NOPS = `${NOP}\n${NOP}\n`;
function runProg(src) {
  const a = assemble(src); assert.deepEqual(a.errors, []);
  const cpu = new Cpu(); cpu.load(a.words); cpu.run(); return cpu;
}

test('Reset state: PC, registers and data memory are 0', () => {
  const cpu = new Cpu(); cpu.load([0x0B]);
  assert.equal(cpu.pc, 0); assert.equal(cpu.cycle, 0);
  assert.ok(cpu.regs.every(v => v === 0) && cpu.dmem.every(v => v === 0));
});
test('Control unit decodes all 13 instructions from the spec hex', () => {
  const t = { '0010C1B3': 'eketsa', '40114333': 'tlosa', '00180293': 'eketsana', '000EFA33': 'le', '000EF2B3': 'kapa',
    '00090B93': 'suthela', '0001D403': 'nka', '00581023': 'kenya', '00110163': 'lekana', 'FFD52763': 'nyane',
    '000050EF': 'tsamaea', '00004067': 'boela', '0000000B': 'ema' };
  for (const [h, n] of Object.entries(t)) assert.equal(decode(parseInt(h, 16))?.name, n, n);
  assert.equal(decode(0), null); assert.equal(decode(0x0010C1B3 | (1 << 22)), null); // reserved bit set
});
test('Straight-line code: results and cycle count (instructions + 4)', () => {
  const cpu = runProg(`eketsana nk0, letho, 5\n${NOPS}eketsana nk1, nk0, 7\nema`);
  assert.equal(cpu.regs[4], 12); assert.equal(cpu.executed, 5); assert.equal(cpu.cycle, 9);
});
test('All ALU instructions', () => {
  const cpu = runProg(`eketsana nk0, letho, 12\neketsana nk1, letho, 10\n${NOPS}` +
    `eketsa nk2, nk0, nk1\ntlosa nk3, nk1, nk0\nle bl0, nk0, nk1\nkapa bl1, nk0, nk1\nsuthela bl2, nk0, 3\nema`);
  assert.deepEqual([5, 6, 7, 8, 9].map(i => cpu.regs[i]), [22, -2, 8, 14, 96]);
});
test('Store then load through data memory', () => {
  const cpu = runProg(`eketsana nk0, letho, 42\n${NOPS}kenya nk0, 8(letho)\nnka nk1, 8(letho)\n${NOPS}eketsana nk2, nk1, 1\nema`);
  assert.equal(cpu.dmem[2], 42); assert.equal(cpu.regs[4], 42); assert.equal(cpu.regs[5], 43);
});
test('r0 stays 0 even when written', () => {
  const cpu = runProg('eketsana letho, letho, 9\nema');
  assert.equal(cpu.regs[0], 0);
});
test('Taken branch flushes 2 slots; wrong-path instructions have no effect', () => {
  const cpu = runProg('lekana letho, letho, fin\neketsana nk0, letho, 99\neketsana nk1, letho, 99\neketsana nk2, letho, 99\nfin: ema');
  assert.deepEqual([3, 4, 5].map(i => cpu.regs[i]), [0, 0, 0]);
  assert.equal(cpu.flushed, 2); assert.equal(cpu.executed, 2); assert.equal(cpu.cycle, 2 + 4 + 2);
});
test('Not-taken branch costs nothing', () => {
  const cpu = runProg('eketsana nk0, letho, 1\n' + NOPS + 'lekana nk0, letho, fin\neketsana nk1, letho, 7\nfin: ema');
  assert.equal(cpu.regs[4], 7); assert.equal(cpu.flushed, 0);
});
test('Loop (sum 1 to 5, hazard-free version of kakaretso): nk0 = 15', () => {
  const cpu = runProg(`eketsana nk0, letho, 0\neketsana nk1, letho, 1\neketsana nk2, letho, 6\n${NOPS}` +
    `lupu: eketsa nk0, nk0, nk1\neketsana nk1, nk1, 1\n${NOPS}nyane nk1, nk2, lupu\nema`);
  assert.deepEqual([3, 4, 5].map(i => cpu.regs[i]), [15, 6, 6]);
  assert.equal(cpu.flushed, 8); assert.equal(cpu.executed, 31); assert.equal(cpu.cycle, 31 + 4 + 8);
});
test('Call and return: tsamaea writes khutlo, khutla returns', () => {
  const cpu = runProg(`eketsana nt0, letho, 12\n${NOPS}tsamaea khutlo, habeli\neketsana nk3, letho, 99\nema\n` +
    `habeli: eketsa nt0, nt0, nt0\nkhutla`);
  assert.equal(cpu.regs[11], 24); assert.equal(cpu.regs[1], 4 * 4); // khutlo = address after the call
  assert.equal(cpu.regs[6], 99);
});
test('A flushed ema has no effect; the program continues', () => {
  const cpu = runProg('lekana letho, letho, fin\nema\n' + NOP + '\nfin: eketsana nk0, letho, 7\nema');
  assert.equal(cpu.regs[3], 7); assert.equal(cpu.halted, true);
});
test('Reset keeps the program and restores the start state; run again gives the same result', () => {
  const cpu = runProg(`eketsana nk0, letho, 5\nema`); const c1 = cpu.cycle;
  cpu.reset(); assert.equal(cpu.cycle, 0); assert.equal(cpu.regs[3], 0); cpu.run();
  assert.equal(cpu.regs[3], 5); assert.equal(cpu.cycle, c1);
});
test('Step advances one cycle at a time until ema reaches WB', () => {
  const a = assemble('ema'); const cpu = new Cpu(); cpu.load(a.words);
  for (let i = 1; i <= 4; i++) { cpu.step(); assert.equal(cpu.halted, false); }
  cpu.step(); assert.equal(cpu.halted, true); assert.equal(cpu.step(), false);
});
test('Errors in plain language: illegal word, bad data address, endless loop', () => {
  const c1 = new Cpu(); c1.load([0xFFFFFFFF, 0x0B]); c1.run(); assert.match(c1.error, /is not a LIMO instruction/);
  const c2 = new Cpu(); c2.load(assemble('nka nk0, 2048(letho)\nema').words); c2.run(); assert.match(c2.error, /data address 2048/);
  const c3 = new Cpu(); c3.load(assemble('lupu: lekana letho, letho, lupu').words); c3.run(500); assert.match(c3.error, /did not stop/);
});
test('Back undoes one cycle at a time, also after a halt, a flush and an error', () => {
  const a = assemble('lekana letho, letho, fin\neketsana nk0, letho, 9\neketsana nk1, letho, 9\nfin: ema');
  const cpu = new Cpu(); cpu.load(a.words); assert.equal(cpu.back(), false);
  const seen = []; while (!cpu.halted) { seen.push(JSON.stringify([cpu.pc, [...cpu.regs], cpu.cycle, cpu.flushed])); cpu.step(); }
  while (seen.length) assert.equal(JSON.stringify([...(cpu.back(), [cpu.pc, [...cpu.regs], cpu.cycle, cpu.flushed])]), seen.pop());
  assert.equal(cpu.back(), false); assert.equal(cpu.halted, false);
  const e = new Cpu(); e.load([0xFFFFFFFF, 0x0B]); e.run(); assert.ok(e.error); e.back(); assert.equal(e.error, null);
});
test('Per-stage control signals are exposed for the datapath view', () => {
  const cpu = new Cpu(); cpu.load(assemble('eketsana nk0, letho, 5\nema').words); cpu.step(); cpu.step(); cpu.step();
  assert.equal(cpu.ctl.EX.name, 'eketsana'); assert.equal(cpu.ctl.EX.useImm, 1); assert.equal(cpu.pcs.EX, 0);
});

// ---- Hand-worked tests (Phethoka, test lead). Every expected value below was worked out on paper first. ----
// Cycles = instructions executed + 4 (fill) + stalls + flushed slots. M3 has no stalls, so only fill and flushes appear.
test('Hand-worked 1: shift then subtract. 5 << 4 = 80, 80 - 5 = 75; 8 instructions, 12 cycles', () => {
  // addi, nop, nop, suthela, nop, nop, tlosa, ema = 8 instructions; 8 + 4 = 12 cycles
  const cpu = runProg(`eketsana nk0, letho, 5\n${NOPS}suthela nk1, nk0, 4\n${NOPS}tlosa nk2, nk1, nk0\nema`);
  assert.equal(cpu.regs[4], 80); assert.equal(cpu.regs[5], 75);
  assert.equal(cpu.executed, 8); assert.equal(cpu.flushed, 0); assert.equal(cpu.cycle, 12);
});
test('Hand-worked 2: nyane is a SIGNED compare. -1 < 1 is taken; wrong path flushed; 6 instr + 4 + 2 = 12 cycles', () => {
  // -1 < 1 is true when signed (an unsigned compare would see 0xFFFFFFFF > 1 and not branch).
  // executed: addi, addi, nop, nop, nyane, ema = 6; the two instructions after nyane are flushed (2 slots).
  const cpu = runProg(`eketsana nk0, letho, -1\neketsana nk1, letho, 1\n${NOPS}nyane nk0, nk1, fin\n` +
    'eketsana nk2, letho, 99\neketsana nk3, letho, 99\nfin: ema');
  assert.equal(cpu.regs[3], -1); assert.equal(cpu.regs[4], 1);
  assert.equal(cpu.regs[5], 0); assert.equal(cpu.regs[6], 0);   // wrong-path instructions left no trace
  assert.equal(cpu.executed, 6); assert.equal(cpu.flushed, 2); assert.equal(cpu.cycle, 12);
});
test('Hand-worked 3: add, store, load. 7 + 9 = 16 stored at byte 12 (dmem[3]); 10 instr, 14 cycles', () => {
  // addi, addi, nop, nop, eketsa, nop, nop, kenya, nka, ema = 10 instructions; 10 + 4 = 14 cycles
  const cpu = runProg(`eketsana nk0, letho, 7\neketsana nk1, letho, 9\n${NOPS}eketsa nk2, nk0, nk1\n${NOPS}` +
    'kenya nk2, 12(letho)\nnka nk3, 12(letho)\nema');
  assert.equal(cpu.regs[5], 16); assert.equal(cpu.dmem[3], 16); assert.equal(cpu.regs[6], 16);
  assert.equal(cpu.dmem[0], 0);                                  // byte 12 is word 3, not word 0
  assert.equal(cpu.executed, 10); assert.equal(cpu.cycle, 14);
});
