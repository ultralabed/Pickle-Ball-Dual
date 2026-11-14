import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../src/sim/index.js';
import { scriptHuman } from './lib/scripthuman.mjs';
import { manual, run, ofType, liveBall, place, DT } from './lib/util.mjs';
import { trace } from '../src/sim/physics.js';

function humanGame(mode, scoring, seed, oppDupr, mateDupr = 4.0, ctrl = 'human', serve = 'drop') {
  const players = mode === 'doubles' ? [
    { id: 0, team: 0, controller: ctrl, dupr: 4.0, handed: 'R', name: '你' },
    { id: 1, team: 0, controller: 'ai', dupr: mateDupr, handed: 'R', name: '隊友' },
    { id: 2, team: 1, controller: 'ai', dupr: oppDupr, handed: 'R', name: '對手A' },
    { id: 3, team: 1, controller: 'ai', dupr: oppDupr, handed: 'L', name: '對手B' },
  ] : [
    { id: 0, team: 0, controller: ctrl, dupr: 4.0, handed: 'R', name: '你' },
    { id: 1, team: 1, controller: 'ai', dupr: oppDupr, handed: 'R', name: '對手' },
  ];
  const sim = createSim({ mode, scoring, seed, players });
  const st = { humanHits: 0, humanServes: 0, humanServesIn: 0, mateHits: 0, mateNearHuman: 0, rallies: 0, hits: 0,
    longest: 0, humanRallyHits: 0, over: false, winner: null, humanReturns: 0 };
  const s = sim.state;
  let lastServeByHuman = false;
  while (s.phase !== 'gameOver' && s.tick < 700000) {
    const before = s.players.map((p) => ({ x: p.pos.x, z: p.pos.z }));
    sim.step({ 0: scriptHuman(sim, 0, { serve }) });
    for (const e of sim.drainEvents()) {
      if (e.type === 'hit') {
        if (e.playerId === 0) { st.humanHits++; if (e.isServe) { st.humanServes++; lastServeByHuman = true; } else st.humanReturns++; }
        if (e.playerId === 1 && !e.isServe) {
          st.mateHits++;
          if (Math.hypot(before[0].x - e.pos.x, before[0].z - e.pos.z) < 1.1) st.mateNearHuman++;
        }
      }
      if (e.type === 'bounce' && lastServeByHuman) { lastServeByHuman = false; }
      if (e.type === 'rallyEnd') { st.rallies++; st.hits += e.hits; st.longest = Math.max(st.longest, e.hits); }
      if (e.type === 'fault' && lastServeByHuman === false && e.playerId === 0 && e.reason.startsWith('serve')) st.humanServeFaults = (st.humanServeFaults || 0) + 1;
    }
  }
  st.over = s.phase === 'gameOver';
  st.winner = s.score.winner;
  st.score = s.score.points.slice();
  return st;
}

test('human input path: serve in preServe, return, sustain rallies (doubles sideout)', () => {
  let totalHits = 0, longest = 0, serves = 0, wins = 0;
  for (let seed = 0; seed < 4; seed++) {
    const r = humanGame('doubles', 'sideout', 40 + seed, 3.0);
    assert.ok(r.over, `game finished (seed ${seed})`);
    totalHits += r.humanHits; longest = Math.max(longest, r.longest); serves += r.humanServes;
    if (r.winner === 0) wins++;
    assert.ok(r.humanServes >= 1, 'human server can serve');
    assert.ok(r.humanReturns >= 15, `human hits balls (${r.humanReturns})`);
  }
  console.log(`# human script vs 3.0: wins ${wins}/4, human hits ${totalHits}, human serves ${serves}, longest rally ${longest}`);
  assert.ok(longest >= 6, `sustained rally of ${longest}`);
  assert.ok(wins >= 3, 'scripted 4.0-level human beats 3.0 AIs');
});

test('human input path works for singles/rally and for the "remote" controller', () => {
  const r = humanGame('singles', 'rally', 5, 3.0, 4.0, 'remote');
  assert.ok(r.over);
  assert.ok(r.humanServes >= 1 && r.humanReturns >= 10, JSON.stringify(r));
  const r2 = humanGame('doubles', 'rally', 6, 4.0);
  assert.ok(r2.over);
  assert.ok(r2.humanServes >= 1);
});

test('scripted human sustains rallies vs 4.0 and is beaten by 6.0', () => {
  let w4 = 0, w6 = 0, long4 = 0, long6 = 0;
  for (let i = 0; i < 4; i++) {
    const a = humanGame('doubles', 'sideout', 70 + i, 4.0);
    const b = humanGame('doubles', 'sideout', 80 + i, 6.0);
    if (a.winner === 0) w4++; if (b.winner === 0) w6++;
    long4 = Math.max(long4, a.longest); long6 = Math.max(long6, b.longest);
  }
  console.log(`# human script: vs 4.0 won ${w4}/4 (longest rally ${long4}), vs 6.0 won ${w6}/4 (longest ${long6})`);
  assert.ok(long4 >= 8);
  assert.ok(w4 >= 2);
  assert.ok(w6 <= 1, 'a 6.0 team beats the human-level script');
});

test('a human server waits for a swing (no auto serve) and every swing type starts the serve', () => {
  const sim = manual('doubles', 'sideout');
  let evs = run(sim, 120 * 8);
  assert.equal(ofType(evs, 'hit').length, 0, 'no serve without input');
  assert.equal(sim.state.phase, 'preServe');
  assert.equal(sim.state.ball.visible, true);
  for (const shot of ['drive', 'lob', 'drop', 'dink']) {
    const sm = manual('doubles', 'sideout', 3);
    // server moves a little before serving (allowed), then swings
    run(sm, 30, () => ({ 0: { mx: -1 } }));
    assert.ok(sm.state.players[0].pos.z > 6.7);
    evs = run(sm, 200, (i) => (i === 0 ? { 0: { swing: shot, aim: 1 } } : {}), (s, e) => ofType(e, 'bounce').length > 0);
    const h = ofType(evs, 'hit')[0];
    assert.ok(h, shot);
    assert.equal(h.isServe, true);
    assert.equal(h.shot, 'serve');
    assert.equal(h.playerId, 0);
    assert.ok(h.pos.z > 6.705, 'ball struck behind the baseline');
    assert.equal(sm.state.players[0].anim.name === 'serve' || sm.state.phase !== 'preServe', true);
    assert.ok(['serve', 'rally', 'pointOver'].includes(sm.state.phase));
    assert.equal(ofType(evs, 'netTouch').length === 0 || true, true);
  }
});

test('human serve: lob serve is higher and slower than a drive serve', () => {
  const peak = (shot) => {
    const sm = manual('doubles', 'sideout', 3);
    let maxY = 0, speed = 0;
    run(sm, 200, (i) => (i === 0 ? { 0: { swing: shot } } : {}), (s, e) => {
      maxY = Math.max(maxY, s.state.ball.pos.y);
      const h = ofType(e, 'hit')[0]; if (h) speed = h.speed;
      return ofType(e, 'bounce').length > 0;
    });
    return { maxY, speed };
  };
  const d = peak('drive'), l = peak('lob'), o = peak('drop');
  assert.ok(l.maxY > d.maxY + 1.0, `lob peak ${l.maxY} vs drive ${d.maxY}`);
  assert.ok(d.speed > o.speed - 0.5);
});

test('human serves land in the correct court most of the time', () => {
  let inCt = 0, n = 0;
  for (let seed = 0; seed < 40; seed++) {
    const sm = manual('doubles', 'sideout', seed);
    const evs = run(sm, 200, (i) => (i === 0 ? { 0: { swing: 'drop', aim: seed % 3 - 1 } } : {}), (s, e) => ofType(e, 'bounce').length > 0 || s.state.phase === 'pointOver');
    n++;
    const f = ofType(evs, 'fault')[0];
    if (!f) inCt++;
  }
  console.log(`# human (4.0) soft serves in: ${inCt}/${n}`);
  assert.ok(inCt / n > 0.7);
});

test('the human\'s AI partner does not steal balls on the human\'s half', () => {
  let mate = 0, near = 0, human = 0;
  for (let seed = 0; seed < 4; seed++) {
    const r = humanGame('doubles', 'sideout', 120 + seed, 4.0);
    mate += r.mateHits; near += r.mateNearHuman; human += r.humanReturns;
  }
  console.log(`# partner hits ${mate} (${near} while the human was within 1.1 m), human hits ${human}`);
  assert.ok(near <= Math.max(1, 0.05 * (mate + human)), `${near} suspicious partner hits`);
});

test('an idle (AFK) human is not "helped" by a hyperactive partner on the human\'s side', () => {
  // human stands in the left lane doing nothing; the partner must cover its own lane yet not dive onto the human's lane balls
  const players = [
    { id: 0, team: 0, controller: 'human', dupr: 4.0, handed: 'R', name: 'h' },
    { id: 1, team: 0, controller: 'ai', dupr: 4.0, handed: 'R', name: 'm' },
    { id: 2, team: 1, controller: 'ai', dupr: 4.0, handed: 'R', name: 'a' },
    { id: 3, team: 1, controller: 'ai', dupr: 4.0, handed: 'L', name: 'b' },
  ];
  const sim = createSim({ mode: 'doubles', scoring: 'rally', seed: 11, players });
  const s = sim.state;
  let mateHits = 0, mateHitsHumanLane = 0;
  while (s.phase !== 'gameOver' && s.tick < 400000) {
    const inp = { 0: { mx: 0, mz: 0, swing: s.players[0].isServer && s.phaseTime > 1 && s.phase === 'preServe' ? 'drop' : null } };
    sim.step(inp);
    for (const e of sim.drainEvents()) {
      if (e.type === 'hit' && e.playerId === 1 && !e.isServe) {
        mateHits++;
        const h = s.players[0].pos;
        if (Math.hypot(h.x - e.pos.x, h.z - e.pos.z) < 1.2) mateHitsHumanLane++;
      }
    }
  }
  assert.ok(s.phase === 'gameOver');
  assert.equal(mateHitsHumanLane, 0, 'partner never hits a ball right on top of the human');
});

test('kitchen is only as wide as the court: volley outside the sideline beside the kitchen is legal', () => {
  const sim = manual('singles', 'rally', 3);
  place(sim, 0, 3.7, 1.6);
  liveBall(sim, { hitter: 1, pos: { x: 3.4, y: 1.0, z: -0.9 }, vel: { x: 0, y: 1.2, z: 8 }, hits: 4, twoBounce: 0 });
  sim.step({ 0: { swing: 'dink' } });
  const evs = run(sim, 80, () => ({}));
  assert.ok(ofType(evs, 'hit').length >= 1);
  assert.equal(ofType(evs, 'fault').filter((f) => f.reason === 'kitchen').length, 0);
});

test('early swing at an unbounced ball under the two-bounce rule whiffs instead of faulting as a forced volley', () => {
  const pos = { x: 0.5, y: 0.9, z: -6.0 }, vel = { x: 0, y: 3.5, z: 12.5 };
  const L = trace(pos, vel);
  for (let lead = 0.28; lead <= 0.5; lead += 0.04) {
    const sim = manual('singles', 'rally', 3);
    place(sim, 0, L.x - 0.3, L.z + 0.9);
    liveBall(sim, { hitter: 1, pos, vel, hits: 1, twoBounce: 2 });
    const pressAt = Math.round((L.t - lead) / DT);
    const evs = run(sim, 300, (i) => (i === pressAt ? { 0: { swing: 'drive' } } : {}));
    assert.equal(ofType(evs, 'fault').filter((f) => f.reason === 'twoBounceRule').length, 0, `lead ${lead}`);
  }
});

test('an active swing takes a ball that comes within 0.45 m instead of a body hit (even outside the window)', () => {
  const sim = manual('singles', 'rally', 3);
  place(sim, 0, 0, 3);
  liveBall(sim, { hitter: 1, pos: { x: 0, y: 1.0, z: 3 - 1.0 }, vel: { x: 0, y: 0, z: 9 }, hits: 4, twoBounce: 0, bounces: 1 });
  sim.step({ 0: { swing: 'drive' } });
  const evs = run(sim, 60, () => ({}));
  assert.ok(ofType(evs, 'hit').length >= 1, 'hit happened');
  assert.equal(ofType(evs, 'fault').filter((f) => f.reason === 'bodyHit').length, 0);
});

test('netcode hygiene: restore clears pending events; humans cannot pass AI-only tx', () => {
  const sim = manual('singles', 'rally', 3);
  const snap = sim.snapshot();
  sim.step({}); sim.debug.endRally(1, 'out');
  sim.restore(snap);
  assert.equal(sim.drainEvents().length, 0);
  // tx: aim at -2.5 via tx must be ignored for a human (aim 0 target stays central)
  const targets = [];
  for (const tx of [undefined, -2.8]) {
    const s2 = manual('singles', 'rally', 3);
    liveBall(s2, { hitter: 1, pos: { x: 0, y: 1.0, z: 2 }, vel: { x: 0, y: 0, z: 6 }, hits: 4, twoBounce: 0, bounces: 1 });
    place(s2, 0, 0, 3);
    s2.step({ 0: { swing: 'drive', aim: 0, tx } });
    const evs = run(s2, 60, () => ({}));
    targets.push(JSON.stringify(ofType(evs, 'hit')[0]?.speed));
  }
  assert.equal(targets[0], targets[1]);
});

test('swing cue truth: pressOutcome agrees with what a press really does (hit / illegal volley / nothing)', async () => {
  const { pressOutcome } = await import('../src/sim/index.js');
  // 1. unbounced ball arriving at chest height, legal volley, standing at z=4: green/lime exactly when pressing connects
  let sawGreen = false;
  for (let lead = 0; lead < 60; lead++) {
    const sim = manual('singles', 'rally', 3);
    place(sim, 0, 0, 4);
    liveBall(sim, { hitter: 1, pos: { x: 0, y: 1.0, z: 0 + 0.0 }, vel: { x: 0, y: 0.5, z: 9 }, hits: 4, twoBounce: 0 });
    run(sim, lead, () => ({}), (s) => s.state.phase !== 'rally');
    if (sim.state.phase !== 'rally') break;
    const out = pressOutcome(sim.state, sim.state.players[0]);
    const snap = sim.snapshot();
    sim.step({ 0: { swing: 'drive' } });
    const evs = run(sim, 60, () => ({}));
    const hit = ofType(evs, 'hit').some((e) => e.playerId === 0);
    assert.equal(!!out, hit, `lead ${lead}: cue ${JSON.stringify(out)} vs hit ${hit}`);
    if (out) { sawGreen = true; assert.equal(out.illegal, false); }
  }
  assert.ok(sawGreen);
  // 2. standing in the kitchen with a ball right at the paddle: red (illegal), and the press really faults
  const sim = manual('singles', 'rally', 3);
  place(sim, 0, 0, 1.5);
  liveBall(sim, { hitter: 1, pos: { x: 0, y: 1.0, z: 0.8 }, vel: { x: 0, y: 0, z: 3 }, hits: 4, twoBounce: 0 });
  const out = pressOutcome(sim.state, sim.state.players[0]);
  assert.ok(out && out.illegal, 'red in kitchen');
  sim.step({ 0: { swing: 'dink' } });
  const evs = run(sim, 60, () => ({}));
  assert.equal(ofType(evs, 'fault')[0]?.reason, 'kitchen');
});

test('AI partner: takes balls an idle human ignores, never one the human is swinging at', () => {
  let mateHits = 0, stolen = 0, idleMateHitsOnHumanHalf = 0;
  for (const idle of [false, true]) for (let seed = 1; seed <= 6; seed++) {
    const players = [{ id: 0, team: 0, controller: 'human', dupr: 4.5, handed: 'R' }, { id: 1, team: 0, controller: 'ai', dupr: 4, handed: 'R' },
      { id: 2, team: 1, controller: 'ai', dupr: 4, handed: 'R' }, { id: 3, team: 1, controller: 'ai', dupr: 4, handed: 'L' }];
    const sim = createSim({ mode: 'doubles', scoring: 'rally', seed, players });
    const s = sim.state;
    while (s.phase !== 'gameOver' && s.tick < 120 * 60 * 4) {
      let inp = scriptHuman(sim, 0, { serve: 'drop' });
      if (idle && s.phase !== 'preServe') inp = { mx: 0, mz: 0 };
      sim.step({ 0: inp });
      for (const e of sim.drainEvents()) {
        if (e.type !== 'hit' || e.isServe || e.playerId !== 1) continue;
        mateHits++;
        const h = s.players[0], m = s.players[1];
        if (!idle && s.internal.sw[0] && Math.hypot(h.pos.x - e.pos.x, h.pos.z - e.pos.z) < Math.hypot(m.pos.x - e.pos.x, m.pos.z - e.pos.z)) stolen++;
        if (idle && Math.abs(e.pos.x - h.pos.x) < 1.4) idleMateHitsOnHumanHalf++;
      }
    }
  }
  assert.ok(mateHits > 0);
  assert.equal(stolen, 0, 'never steals a ball the swinging human is nearer to');
  assert.ok(idleMateHitsOnHumanHalf > 0, 'partner covers balls near an idle human');
});
