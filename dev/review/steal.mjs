// Review: AI partner hits where the human was closer to the contact point / ball on the human's half.
import { createSim } from '../../src/sim/index.js';
import { scriptHuman } from '../../tests/lib/scripthuman.mjs';
const r = { mateHits: 0, humanCloser: 0, humanCloserAndSwinging: 0, onHumansHalf: 0, simultaneousSwing: 0, noOneSwung: 0, humanHits: 0 };
for (let seed = 1; seed <= 40; seed++) {
  const players = [{ id: 0, team: 0, controller: 'human', dupr: 4.5, handed: 'R' }, { id: 1, team: 0, controller: 'ai', dupr: 4, handed: 'R' },
    { id: 2, team: 1, controller: 'ai', dupr: 4, handed: 'R' }, { id: 3, team: 1, controller: 'ai', dupr: 4, handed: 'L' }];
  const sim = createSim({ mode: 'doubles', scoring: 'rally', seed, players });
  const s = sim.state;
  while (s.phase !== 'gameOver' && s.tick < 120 * 60 * 15) {
    sim.step({ 0: scriptHuman(sim, 0, { serve: 'drop' }) });
    for (const e of sim.drainEvents()) {
      if (e.type !== 'hit' || e.isServe) continue;
      if (e.playerId === 0) r.humanHits++;
      if (e.playerId !== 1) continue;
      r.mateHits++;
      const h = s.players[0], m = s.players[1];
      const dh = Math.hypot(h.pos.x - e.pos.x, h.pos.z - e.pos.z), dm = Math.hypot(m.pos.x - e.pos.x, m.pos.z - e.pos.z);
      if (dh < dm) { r.humanCloser++; if (s.internal.sw[0]) r.humanCloserAndSwinging++; }
      const mid = (h.pos.x + m.pos.x) / 2;
      if ((e.pos.x - mid) * (h.pos.x - mid) > 0) r.onHumansHalf++;
    }
  }
}
console.log(JSON.stringify(r));
