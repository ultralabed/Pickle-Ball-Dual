import { createSim, DT, COURT } from '../../src/sim/index.js';

export { DT, COURT };

export function players(mode, ctrl = 'human', d = [4, 4, 4, 4], hands = ['R', 'R', 'R', 'L']) {
  if (mode === 'singles') {
    return [
      { id: 0, team: 0, controller: ctrl, dupr: d[0], handed: hands[0], name: 'A' },
      { id: 1, team: 1, controller: ctrl, dupr: d[2] ?? d[1], handed: hands[2], name: 'B' },
    ];
  }
  return [
    { id: 0, team: 0, controller: ctrl, dupr: d[0], handed: hands[0], name: 'A' },
    { id: 1, team: 0, controller: ctrl, dupr: d[1], handed: hands[1], name: 'B' },
    { id: 2, team: 1, controller: ctrl, dupr: d[2], handed: hands[2], name: 'C' },
    { id: 3, team: 1, controller: ctrl, dupr: d[3], handed: hands[3], name: 'D' },
  ];
}

// all-'human' sim with no inputs: nothing happens unless the test makes it happen
export function manual(mode = 'doubles', scoring = 'sideout', seed = 1, extra = {}) {
  return createSim({ mode, scoring, seed, players: players(mode, 'human', extra.dupr, extra.hands) });
}

export function aiSim(mode, scoring, seed, dupr0, dupr1, hands) {
  const ps = mode === 'singles'
    ? [{ id: 0, team: 0, controller: 'ai', dupr: dupr0, handed: 'R', name: 'A' },
       { id: 1, team: 1, controller: 'ai', dupr: dupr1, handed: 'R', name: 'B' }]
    : [{ id: 0, team: 0, controller: 'ai', dupr: dupr0, handed: 'R', name: 'A' },
       { id: 1, team: 0, controller: 'ai', dupr: dupr0, handed: hands ? hands[1] : 'R', name: 'B' },
       { id: 2, team: 1, controller: 'ai', dupr: dupr1, handed: 'R', name: 'C' },
       { id: 3, team: 1, controller: 'ai', dupr: dupr1, handed: 'L', name: 'D' }];
  return createSim({ mode, scoring, seed, players: ps });
}

// Put the sim in a live rally with a ball in flight (test scaffolding that pokes internal state).
export function liveBall(sim, { hitter = 0, pos, vel = { x: 0, y: 0, z: 0 }, hits = 3, twoBounce = 0, bounces = 0,
  serve = false, crossed = true }) {
  const s = sim.state, I = s.internal;
  s.phase = serve ? 'serve' : 'rally';
  s.phaseTime = 0;
  I.held = false; I.live = true; I.serveActive = serve; I.crossed = crossed; I.resting = false; I.sp = 0;
  I.hitSeq++; I.lastHitTime = s.time;
  const b = s.ball;
  b.pos = { ...pos }; b.vel = { ...vel };
  b.bounces = bounces; b.lastHitBy = hitter; b.landing = null; b.visible = true;
  s.rally.hits = hits; s.rally.twoBounceRemaining = twoBounce;
  for (const p of s.players) I.sw[p.id] = null;
}

export function place(sim, id, x, z) {
  const p = sim.state.players[id];
  p.pos.x = x; p.pos.z = z; p.vel.x = 0; p.vel.z = 0;
  sim.state.internal.inK[id] = Math.abs(z) <= COURT.kitchen;
}

// step n ticks with an input generator f(tick)->inputs; collect events
export function run(sim, n, f = () => ({}), stop = null) {
  const evs = [];
  for (let i = 0; i < n; i++) {
    sim.step(f(i));
    const e = sim.drainEvents();
    for (const x of e) evs.push(x);
    if (stop && stop(sim, evs)) break;
  }
  return evs;
}

export const ofType = (evs, t) => evs.filter((e) => e.type === t);

// finish current point and move to the next serve
export function nextPoint(sim) {
  sim.skipPointOver();
  sim.step({});
  return sim.drainEvents();
}

export function winPoint(sim, team) {
  sim.debug.endRally(1 - team, 'out');
  const evs = sim.drainEvents();
  return evs.concat(nextPoint(sim));
}
