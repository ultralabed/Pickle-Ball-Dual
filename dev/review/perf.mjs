import { createSim } from '../../src/sim/index.js';
const ps = [0, 1, 2, 3].map((i) => ({ id: i, team: i < 2 ? 0 : 1, controller: 'ai', dupr: 5, handed: i === 3 ? 'L' : 'R' }));
const sim = createSim({ mode: 'doubles', scoring: 'rally', seed: 9, players: ps });
let worst = 0, total = 0, n = 0; const hist = {};
for (let i = 0; i < 120 * 600; i++) {
  const t0 = performance.now(); sim.step({}); sim.drainEvents(); const dt = performance.now() - t0;
  if (i > 1000) { worst = Math.max(worst, dt); total += dt; n++; const b = dt < 0.1 ? '<0.1' : dt < 0.5 ? '<0.5' : dt < 1 ? '<1' : dt < 2 ? '<2' : dt < 5 ? '<5' : '>=5'; hist[b] = (hist[b] || 0) + 1; }
  if (sim.state.phase === 'gameOver') { sim.restore(sim.snapshot()); break; }
}
console.log({ ticks: n, meanMs: +(total / n).toFixed(4), worstMs: +worst.toFixed(2), hist });
