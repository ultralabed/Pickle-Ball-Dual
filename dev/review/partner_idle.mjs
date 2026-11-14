// Review: does the AI partner cover its own half when the human doesn't chase? Human serves (drop) and then stands still.
import { createSim } from '../../src/sim/index.js';
import { scriptHuman } from '../../tests/lib/scripthuman.mjs';
const r = { mateHits: 0, rallies: 0, droppedOnMateHalf: 0, droppedOnHumanHalf: 0, claimsHuman: 0, claimsMate: 0 };
for (let seed = 1; seed <= 30; seed++) {
  const players = [{ id: 0, team: 0, controller: 'human', dupr: 4.5, handed: 'R' }, { id: 1, team: 0, controller: 'ai', dupr: 4, handed: 'R' },
    { id: 2, team: 1, controller: 'ai', dupr: 4, handed: 'R' }, { id: 3, team: 1, controller: 'ai', dupr: 4, handed: 'L' }];
  const sim = createSim({ mode: 'doubles', scoring: 'rally', seed, players });
  const s = sim.state; let lastSeq = -1;
  while (s.phase !== 'gameOver' && s.tick < 120 * 60 * 10) {
    const inp = s.phase === 'preServe' ? scriptHuman(sim, 0, { serve: 'drop' }) : {};
    sim.step({ 0: inp });
    const cl = s.internal.claim[0];
    if (cl && cl.seq !== lastSeq) { lastSeq = cl.seq; if (cl.pid === 0) r.claimsHuman++; else r.claimsMate++; }
    for (const e of sim.drainEvents()) {
      if (e.type === 'hit' && e.playerId === 1 && !e.isServe) r.mateHits++;
      if (e.type === 'rallyEnd') r.rallies++;
      if (e.type === 'fault' && e.reason === 'doubleBounce' && e.team === 0) {
        const h = s.players[0], m = s.players[1], b = s.ball.pos;
        if (Math.hypot(b.x - m.pos.x, b.z - m.pos.z) < Math.hypot(b.x - h.pos.x, b.z - h.pos.z)) r.droppedOnMateHalf++; else r.droppedOnHumanHalf++;
      }
    }
  }
}
console.log(JSON.stringify(r));
