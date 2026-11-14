// Headless (no browser) statistics of human shot outcomes using the test script-human with a forced shot/aim.
import { createSim } from '../../src/sim/index.js';
import { scriptHuman } from '../../tests/lib/scripthuman.mjs';
const N = +(process.argv[2] || 300);
function run(shot, aim, power, seed0, mode = 'singles') {
  const out = { n: 0, in: 0, net: 0, out: 0, landX: 0, landZ: 0, shots: {} };
  for (let seed = seed0; out.n < N && seed < seed0 + 400; seed++) {
    const players = mode === 'singles' ? [
      { id: 0, team: 0, controller: 'human', dupr: 4.5, handed: 'R', name: 'h' }, { id: 1, team: 1, controller: 'ai', dupr: 3, handed: 'R', name: 'o' }]
      : [{ id: 0, team: 0, controller: 'human', dupr: 4.5, handed: 'R', name: 'h' }, { id: 1, team: 0, controller: 'ai', dupr: 4, handed: 'R', name: 'm' }, { id: 2, team: 1, controller: 'ai', dupr: 3, handed: 'R', name: 'a' }, { id: 3, team: 1, controller: 'ai', dupr: 3, handed: 'L', name: 'b' }];
    const sim = createSim({ mode, scoring: 'rally', seed, players });
    const s = sim.state; let pend = null, cnt = 0;
    while (s.phase !== 'gameOver' && s.tick < 120 * 200 && cnt < 12) {
      const inp = scriptHuman(sim, 0, { serve: 'drop' });
      if (inp.swing && s.phase !== 'preServe' && s.rally.hits > 1) { inp.swing = shot; inp.aim = aim; inp.power = power; }
      sim.step({ 0: inp });
      for (const e of sim.drainEvents()) {
        if (e.type === 'hit' && e.playerId === 0 && !e.isServe) { pend = { shot: e.atp ? 'atp' : e.shot, hit: e.pos }; }
        else if (e.type === 'hit') pend = null;
        else if (pend && e.type === 'fault' && e.team === 0 && (e.reason === 'net' || e.reason === 'out') && e.playerId === 0) { out.n++; cnt++; if (e.reason === 'net') out.net++; else out.out++; out.shots[pend.shot] = (out.shots[pend.shot] || 0) + 1; pend = null; }
        else if (pend && e.type === 'bounce') { out.n++; cnt++; if (e.inBounds) out.in++; else out.out++; out.landX += e.pos.x; out.landZ += e.pos.z; out.shots[pend.shot] = (out.shots[pend.shot] || 0) + 1; pend = null; }
      }
    }
  }
  return out;
}
const fmt = (o) => `n=${o.n} in=${Math.round(100 * o.in / o.n)}% net=${Math.round(100 * o.net / o.n)}% out=${Math.round(100 * o.out / o.n)}% meanX=${(o.landX / Math.max(1, o.in + o.out - o.net)).toFixed(2)} meanZ=${(o.landZ / Math.max(1, o.in + o.out - o.net)).toFixed(2)} ${JSON.stringify(o.shots)}`;
let seed = 1000;
for (const [shot, power] of [['drive', 0.5], ['drive', 1.0], ['drop', 0.5], ['dink', 0.5], ['lob', 0.5]]) {
  for (const aim of [-1, 0, 1]) console.log(`${shot.padEnd(6)} pw${power} aim${String(aim).padStart(2)}: ${fmt(run(shot, aim, power, seed))}`);
}
