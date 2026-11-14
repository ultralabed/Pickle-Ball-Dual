// Verifies the swing-cue truth: at every tick where the ring is green/lime/red, a press at that moment (player standing still)
// really hits / faults; when it is amber/none a press does not connect. Uses pressOutcome (the same function the shell uses).
import { createSim, pressOutcome } from '../../src/sim/index.js';
const stat = { green: [0, 0], lime: [0, 0], red: [0, 0], none: [0, 0] };
let firstGreenLead = [];
for (let seed = 1; seed <= 12; seed++) {
  const players = [{ id: 0, team: 0, controller: 'human', dupr: 4.5, handed: 'R' }, { id: 1, team: 0, controller: 'ai', dupr: 4, handed: 'R' },
    { id: 2, team: 1, controller: 'ai', dupr: 5, handed: 'R' }, { id: 3, team: 1, controller: 'ai', dupr: 5, handed: 'L' }];
  const sim = createSim({ mode: 'doubles', scoring: 'rally', seed, players });
  let s = sim.state;
  while (s.phase !== 'gameOver' && s.tick < 120 * 90) {
    sim.step({ 0: s.phase === 'preServe' ? { swing: 'drop' } : {} });
    sim.drainEvents();
    if (s.phase !== 'rally' || s.tick % 3) continue;
    const b = s.ball;
    if (b.lastHitBy === null || s.players[b.lastHitBy].team === 0 || s.players[0].anim.name.match(/drive|drop|dink|lob|smash|volley/)) continue;
    const out = pressOutcome(s, s.players[0]);
    const kind = out ? (out.illegal ? 'red' : Math.abs(out.tc - 0.17) <= 0.05 ? 'lime' : 'green') : 'none';
    // fork
    const snap = sim.snapshot();
    const hitBefore = s.rally.hits;
    sim.step({ 0: { swing: 'drive' } }); sim.drainEvents();
    let connected = false, faulted = false;
    for (let i = 0; i < 40; i++) { sim.step({}); for (const e of sim.drainEvents()) { if (e.type === 'hit' && e.playerId === 0) connected = true; if (e.type === 'fault' && e.playerId === 0 && (e.reason === 'kitchen' || e.reason === 'twoBounceRule' || e.reason === 'bodyHit')) faulted = true; } if (connected) break; }
    sim.restore(snap); s = sim.state;
    const ok = kind === 'none' ? !connected : kind === 'red' ? connected && faulted : connected && !faulted;
    stat[kind][ok ? 0 : 1]++;
  }
}
console.log(JSON.stringify(stat), '(each [matches, mismatches])');
