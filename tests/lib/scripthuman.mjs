// A simple scripted "human": uses only public state plus the physics predictor.
import { predictPath } from '../../src/sim/physics.js';

export function scriptHuman(sim, id = 0, opts = {}) {
  const s = sim.state, p = s.players[id], b = s.ball, I = s.internal;
  const inp = { mx: 0, mz: 0, swing: null, power: 0.5, aim: 0 };
  const go = (tx, tz) => {
    const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.1) { const m = Math.min(1, d / 0.5); inp.mx = dx / d * m; inp.mz = dz / d * m; }
  };
  if (s.phase === 'preServe') {
    if (p.isServer && s.phaseTime > 1.0) inp.swing = opts.serve || 'drop';
    return inp;
  }
  if (s.phase !== 'serve' && s.phase !== 'rally') return inp;
  const lh = b.lastHitBy;
  const incoming = lh !== null && s.players[lh].team !== p.team;
  if (incoming) {
    const pp = predictPath(b.pos, b.vel, b.bounces, I.sp, 3);
    let pick = null;
    for (const sm of pp.samples) {
      if (sm.z * (p.team === 0 ? 1 : -1) < 0.3) continue;
      if (sm.b >= 2) break;
      if (sm.b >= 1 && sm.vy <= 0.4 && sm.y < 1.2) { pick = sm; break; }
    }
    if (pick) {
      go(pick.x - 0.3 * (p.team === 0 ? 1 : -1), pick.z + 0.45 * (p.team === 0 ? 1 : -1));
      if (pick.t < 0.2 && !I.sw[id]) {
        const own = Math.abs(p.pos.z);
        inp.swing = s.rally.hits === 1 ? 'drive' : s.rally.hits === 2 ? 'drop' : own < 3.8 ? 'dink' : 'drive';
      }
    } else if (b.bounces === 0 && pp.firstBounce) {
      go(pp.firstBounce.x, pp.firstBounce.z + 0.8 * (p.team === 0 ? 1 : -1));
    }
  } else {
    go(p.pos.x >= 0 ? 1.5 : -1.5, (s.rally.hits <= 2 ? 5.5 : 3.4) * (p.team === 0 ? 1 : -1));
  }
  return inp;
}
