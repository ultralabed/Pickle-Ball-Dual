// Fixed-timestep loop robustness: sim time must track wall time at low fps, with no spiral of death after a long stall.
import { launch, sleep } from './lib.mjs';
const t = await launch({ width: 1440, height: 900 });
const { page } = t;
await page.evaluate(() => { __game.startMatch({ quality: 'high', seed: 4, autoplay: true }); });
await sleep(1500);
const a = await page.evaluate(() => ({ tick: __game.getState().tick, now: performance.now() }));
await sleep(5000);
const b = await page.evaluate(() => ({ tick: __game.getState().tick, now: performance.now() }));
console.log('sim seconds per wall second at high/1440x900 (SwiftShader):', ((b.tick - a.tick) / 120 / ((b.now - a.now) / 1000)).toFixed(2));
// stall the main thread for 3 s, then check we recover (clamped, not 3 s of catch-up in one frame)
const r = await page.evaluate(async () => {
  const t0 = __game.getState().tick; const s = performance.now(); while (performance.now() - s < 3000) { /* busy */ }
  await new Promise((r) => setTimeout(r, 300));
  return (__game.getState().tick - t0) / 120;
});
console.log('sim seconds advanced across a 3 s stall + 0.3 s:', r.toFixed(2), '(clamped catch-up expected <= ~1 s)');
console.log(t.problems);
await t.close();
