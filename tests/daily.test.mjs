// Daily challenge: content is data-driven, deterministic per date, and every generated stage is beatable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, BY_ID } from '../src/daily/challenges.js';
import { genStage, solveStage, playBall, stageScore, ringScore, SOLVE_MIN, ROBUST_MIN, flight, launchVel, SHOT, finishStage } from '../src/daily/engine.js';
import { pickDay, genDay, dayInfo, totals, shareText, STAGES } from '../src/daily/day.js';

test('there are 20 challenges, each with an id, zh/en name and instruction, a generator and a scoring rule', () => {
  assert.equal(CHALLENGES.length, 20);
  assert.equal(new Set(CHALLENGES.map((c) => c.id)).size, 20);
  for (const c of CHALLENGES) {
    for (const k of ['name', 'how']) { assert.ok(c[k].zh && c[k].en, `${c.id}.${k}`); }
    assert.equal(typeof c.gen, 'function'); assert.equal(typeof c.score, 'function');
    assert.ok([1, 2, 3].includes(c.tier));
  }
  for (const t of [1, 2, 3]) assert.ok(CHALLENGES.filter((c) => c.tier === t).length >= 2, `tier ${t}`);
});

for (const def of CHALLENGES) {
  test(`${def.id}: every seed is beatable (solver >= ${SOLVE_MIN}) and the solver's shot really scores it`, () => {
    for (let i = 0; i < 40; i++) {
      const st = genStage(def, `t-${i}`);
      assert.ok(st, `seed ${i} generated`);
      assert.ok(st.solved >= SOLVE_MIN, `seed ${i}: best possible ${st.solved}`);
      assert.ok(st.robust >= ROBUST_MIN, `seed ${i}: a shot slightly off the perfect one still scores (${st.robust})`);
      st.sols.forEach((s, ti) => {
        const out = playBall(st, def, s.si, s.power, s.ang, ti, 0);
        // a moving target is wherever it is at landing: the solver only promises the spot is reachable
        if (!st.targets[ti].move) assert.equal(out.score, s.score, `seed ${i} target ${ti}`);
      });
      assert.ok(st.shots.length >= 1 && st.shots.length <= 3);
    }
  });
}

test('a day is 5 different challenges, easy first and hardest last, the same for the same date', () => {
  for (let d = 0; d < 120; d++) {
    const key = `2026-11-${18 + d}`;
    const ids = pickDay(key);
    assert.equal(ids.length, STAGES); assert.equal(new Set(ids).size, STAGES);
    assert.deepEqual(ids.map((id) => BY_ID[id].tier), [1, 1, 2, 2, 3]);
    assert.deepEqual(pickDay(key), ids);
  }
  const a = genDay('2026-11-18'), b = genDay('2026-11-18');
  assert.deepEqual(a.map((g) => g.st.targets), b.map((g) => g.st.targets));
  assert.deepEqual(a.map((g) => g.st.player), b.map((g) => g.st.player));
  assert.notDeepEqual(genDay('2026-11-19').map((g) => g.st.player), a.map((g) => g.st.player));
});

test('the next 60 days are all beatable and every challenge type shows up', () => {
  const seen = new Set();
  const t0 = new Date(2026, 10, 18);
  for (let d = 0; d < 60; d++) {
    const day = dayInfo(new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + d));
    assert.equal(day.n, d + 1);
    for (const g of genDay(day.key)) { seen.add(g.def.id); assert.ok(g.st.solved >= SOLVE_MIN, `${day.key} ${g.def.id}: ${g.st.solved}`); }
  }
  assert.equal(seen.size, 20);
});

test('scoring: 100 inside 0.75 ft, 0 at 8 ft, net / out / blocked score 0', () => {
  assert.equal(ringScore(0.2), 100); assert.equal(ringScore(2.44), 0); assert.equal(ringScore(5), 0);
  assert.ok(ringScore(1.0) > 50 && ringScore(1.0) < 80);
  const def = BY_ID['line-pass'];
  const st = finishStage({ player: { x: 0, z: 6 }, targets: [{ x: 0, z: -4, full: 0.23, zero: 2.44 }], shots: [SHOT.drive], defs: [{ x: 0, z: -2 }] });
  // the weakest drive drops before the net; somewhere between weak and hard it hits the net, then the defender
  assert.equal(flight(st, st.hit, launchVel(SHOT.drive, 0.02, 0)).kind, 'short');
  const kinds = new Set();
  for (let p = 0; p <= 1; p += 0.02) kinds.add(flight(st, st.hit, launchVel(SHOT.drive, p, 0)).kind);
  assert.ok(kinds.has('net'), 'some drive hits the net');
  assert.ok(kinds.has('block'), 'some drive is blocked by the defender');
  assert.equal(flight({ ...st, defs: [] }, st.hit, launchVel(SHOT.drive, 1, 0)).kind, 'out');   // full power with nobody in the way flies long
  const blocked = playBall(st, def, 0, 0.55, Math.atan2(0 - st.hit.x, st.hit.z + 4), 0, 0);
  assert.equal(blocked.res.kind, 'block'); assert.equal(blocked.score, 0);
  st.defs = [];
  assert.ok(solveStage(st, def).min >= 95);
});

test('stage score: best ball, or the average over the targets for in-order stages; share text', () => {
  assert.equal(stageScore({ agg: 'best', targets: [1] }, [{ s: 40 }, { s: 90 }, { s: 10 }]), 90);
  assert.equal(stageScore({ agg: 'avg', targets: [1, 2, 3] }, [{ s: 90 }, { s: 60 }]), 50);
  const stages = genDay('2026-11-18');
  const tot = totals(stages, [[{ s: 100 }], [{ s: 50 }, { s: 70 }], [{ s: 0 }], [], [{ s: 30 }]]);
  assert.equal(tot.total, 200); assert.equal(tot.balls, 5); assert.equal(tot.emoji, '🟢🟡⚫⚫🟠');
  assert.match(shareText('Daily Pickleball', 7, tot, '5 balls used'), /^Daily Pickleball #7 {2}200\/500\n🟢🟡⚫⚫🟠 {2}5 balls used/u);
});
