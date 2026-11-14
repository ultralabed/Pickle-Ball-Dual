// Frame-stepped check that the paddle meets the ball at contact for every shot type. Produces contact sheets in out/.
import { launch, sleep, ROOT } from './lib.mjs';
import fs from 'node:fs';
const OFFS = [-14, -9, -5, -2, 0, 3, 8];
const t = await launch({ width: 960, height: 600 });
const { page } = t;
const found = await page.evaluate(() => {
  const g = __game;
  g.startMatch({ mode: 'doubles', scoring: 'rally', opp: 6, mate: 6, seed: 21, humanDupr: 5.5 });
  g.setAutoplay(true); g.setReplayEnabled(false);
  const sim = g.sim, s = sim.state;
  const ring = []; const out = {}; const want = new Set(['serve/forehand', 'drive/forehand', 'drive/backhand', 'drop/forehand', 'dink/forehand', 'dink/backhand', 'lob/forehand', 'volley/forehand', 'volley/backhand', 'smash/forehand', 'drop/backhand']);
  const seen = new Map();
  let ticks = 0;
  while (ticks < 120 * 600 && Object.keys(out).length < want.size) {
    ring.push(sim.snapshot()); if (ring.length > 24) ring.shift();
    g.advance(1 / 120);
    ticks++;
    for (const p of s.players) {
      const key = `${p.anim.name}/${p.anim.side}`;
      const k2 = p.anim.name === 'serve' ? 'serve/forehand' : key;
      if (p.anim.hit && p.anim.t >= p.anim.tc - 1e-6 && p.anim.t <= p.anim.tc + 1e-4 && want.has(k2) && !out[k2]) {
        out[k2] = { snap: ring[ring.length - 16], id: p.id, tick: s.tick, ball: { ...s.ball.pos }, shot: p.anim.shot };
      }
    }
    if (g.mode !== 'play') break;
  }
  window.__found = out;
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { id: v.id, tick: v.tick, ball: v.ball }]));
});
console.log(Object.keys(found));
await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; });
let n = 0;
for (const key of Object.keys(found)) {
  const dir = `${ROOT}/dev/playtest/out/${key.replace('/', '_')}`; fs.mkdirSync(dir, { recursive: true });
  for (const off of OFFS) {
    const info = await page.evaluate(({ key, off }) => {
      const g = __game, v = g.view, F = window.__found[key];
      g.sim.restore(F.snap);
      g.freeze(true);
      const steps = 16 + off;                 // snapshot is 16 ticks before contact
      let st = g.sim.state;
      for (let i = 0; i < steps; i++) { g.sim.step({}); g.sim.drainEvents(); v.update(g.sim.state, 1 / 120); }
      st = g.sim.state;
      const p = st.players[F.id];
      const side = (p.handed === 'R' ? 1 : -1) * (p.team === 0 ? 1 : -1);
      const bx = F.ball.x, by = F.ball.y, bz = F.ball.z;
      v.setCameraOverride({ position: [p.pos.x + 2.3 * side, Math.max(1.1, by * 0.6 + 0.6), p.pos.z + 0.4 * (p.team === 0 ? 1 : -1)], target: [p.pos.x - 0.1 * side, Math.max(0.85, by * 0.8), p.pos.z - 0.15 * (p.team === 0 ? 1 : -1)], fov: 40 });
      v.update(st, 1 / 120); v.update(st, 1 / 120); v.render();
      return { t: p.anim.t, tc: p.anim.tc, hit: p.anim.hit, name: p.anim.name, ballY: st.ball.pos.y };
    }, { key, off });
    await page.screenshot({ path: `${dir}/f${String(off + 20).padStart(3, '0')}.png`, clip: { x: 80, y: 40, width: 800, height: 520 } });
    n++;
  }
}
console.log('frames', n, 'problems', t.problems);
await t.close();
