// Review: a slightly early swing at an unbounced ball that must bounce (two-bounce rule) becomes a forced volley fault,
// because tryContact connects at the END of the window whenever the ball is anywhere within REACH (1.3 m).
import { manual, liveBall, place, run, ofType } from '../../tests/lib/util.mjs';
import { DT } from '../../src/sim/index.js';
import { trace } from '../../src/sim/physics.js';
const pos = { x: 0.5, y: 0.9, z: -6.0 }, vel = { x: 0, y: 3.5, z: 12.5 };
const L = trace(pos, vel);
console.log('ball lands at', L.x.toFixed(2), L.z.toFixed(2), 't', L.t.toFixed(2));
for (let lead = 0.10; lead <= 0.50; lead += 0.04) {
  const sim = manual('singles', 'rally', 3);
  place(sim, 0, L.x - 0.3, L.z + 0.9);   // standing just behind the bounce spot, as a receiver should
  liveBall(sim, { hitter: 1, pos, vel, hits: 1, twoBounce: 2 });   // this is the serve; return must bounce
  const pressAt = Math.round((L.t - lead) / DT);
  const evs = run(sim, 300, (i) => (i === pressAt ? { 0: { swing: 'drive' } } : {}));
  const f = ofType(evs, 'fault')[0]; const h = ofType(evs, 'hit')[0];
  console.log(`press ${lead.toFixed(2)}s before the bounce: ` + (h ? `hit volley=${h.isVolley} y=${h.pos.y.toFixed(2)}` : 'no hit') + ' -> ' + (f ? f.reason + '/team' + f.team : 'no fault (rally continues)'));
}
