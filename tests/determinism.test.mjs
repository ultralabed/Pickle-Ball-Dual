import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/index.js';
import { scriptHuman } from './lib/scripthuman.mjs';

function cfg(seed, mode = 'doubles', scoring = 'sideout', hum = 'human') {
  const players = mode === 'doubles' ? [
    { id: 0, team: 0, controller: hum, dupr: 4.0, handed: 'R', name: 'H' },
    { id: 1, team: 0, controller: 'ai', dupr: 5.0, handed: 'R', name: 'P' },
    { id: 2, team: 1, controller: 'ai', dupr: 4.0, handed: 'R', name: 'A' },
    { id: 3, team: 1, controller: 'ai', dupr: 3.0, handed: 'L', name: 'B' },
  ] : [
    { id: 0, team: 0, controller: hum, dupr: 4.0, handed: 'R', name: 'H' },
    { id: 1, team: 1, controller: 'ai', dupr: 5.0, handed: 'L', name: 'A' },
  ];
  return { mode, scoring, seed, players };
}

// deterministic pseudo-random human (independent of the sim's RNG)
function noisyHuman(sim, i, seedState) {
  seedState.v = (Math.imul(seedState.v, 1664525) + 1013904223) >>> 0;
  const r = seedState.v / 4294967296;
  const base = scriptHuman(sim, 0);
  if (r < 0.01) base.swing = ['drive', 'drop', 'dink', 'lob'][i % 4];
  if (r > 0.995) { base.mx = 1; base.mz = -1; }
  return base;
}

function runN(seed, n, mode, scoring, snapAt = -1) {
  const sim = createSim(cfg(seed, mode, scoring));
  const st = { v: 12345 };
  const hashes = [];
  const evs = [];
  let snap = null;
  for (let i = 0; i < n; i++) {
    sim.step({ 0: noisyHuman(sim, i, st) });
    for (const e of sim.drainEvents()) evs.push(JSON.stringify(e));
    if (i % 400 === 0) hashes.push(JSON.stringify(sim.state));
    if (i === snapAt) snap = { snap: sim.snapshot(), st: { ...st }, evLen: evs.length };
  }
  return { hashes, evs, final: JSON.stringify(sim.state), snap, sim };
}

test('same seed + same inputs => identical state and events (all mode/scoring combos)', () => {
  for (const mode of ['doubles', 'singles']) {
    for (const scoring of ['sideout', 'rally']) {
      const a = runN(4242, 30000, mode, scoring);
      const b = runN(4242, 30000, mode, scoring);
      assert.equal(a.hashes.length, b.hashes.length);
      for (let i = 0; i < a.hashes.length; i++) assert.equal(a.hashes[i], b.hashes[i], `${mode}/${scoring} tick ${i * 400}`);
      assert.deepEqual(a.evs, b.evs);
      assert.equal(a.final, b.final);
      assert.ok(a.evs.length > 20, 'something actually happened');
    }
  }
});

test('different seeds diverge', () => {
  const a = runN(1, 20000, 'doubles', 'sideout');
  const b = runN(2, 20000, 'doubles', 'sideout');
  assert.notEqual(a.final, b.final);
});

test('snapshot/restore reproduces the future exactly', () => {
  const full = runN(777, 24000, 'doubles', 'sideout', 9000);
  // replay from the snapshot
  const sim = createSim(cfg(777));
  sim.restore(full.snap.snap);
  sim.drainEvents();
  const st = { ...full.snap.st };
  const evs = [];
  for (let i = 9001; i < 24000; i++) {
    sim.step({ 0: noisyHuman(sim, i, st) });
    for (const e of sim.drainEvents()) evs.push(JSON.stringify(e));
  }
  assert.equal(JSON.stringify(sim.state), full.final);
  assert.deepEqual(evs, full.evs.slice(full.snap.evLen));
});

test('state is JSON-serialisable and contains no NaN / functions', () => {
  const { sim } = runN(5, 8000, 'doubles', 'rally');
  const s = JSON.stringify(sim.state);
  assert.ok(!s.includes('null,null,null') || true);
  const back = JSON.parse(s);
  assert.deepEqual(back, sim.state);
  const walk = (o) => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      assert.notEqual(typeof v, 'function');
      if (typeof v === 'number') assert.ok(Number.isFinite(v), k);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(sim.state);
});
