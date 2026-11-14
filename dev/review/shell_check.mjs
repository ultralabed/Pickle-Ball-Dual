// Review: shell robustness probes in Chromium (restart leaks, RAF count, DOM mutations per frame, pause/replay click, held keys).
import { launch, sleep } from '../playtest/lib.mjs';

const t = await launch({ width: 960, height: 600, log: false });
const { page } = t;
await page.addInitScript(() => {});
// instrument
await page.evaluate(() => {
  window.__rev = { raf: 0, listeners: 0, muts: 0 };
  const oraf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { window.__rev.raf++; return oraf(cb); };
  const oadd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (...a) { window.__rev.listeners++; return oadd.apply(this, a); };
  new MutationObserver((ms) => { window.__rev.muts += ms.length; }).observe(document.getElementById('ui'), { subtree: true, childList: true, characterData: true, attributes: true });
});
const R = {};
// 1) DOM mutations per frame during a rally, human idle
await page.evaluate(() => { __game.startMatch({ mode: 'doubles', scoring: 'sideout', opp: 4, mate: 4, handed: 'R', quality: 'low', seed: 7, autoplay: true }); __game.setReplayEnabled(false); });
await sleep(1500);
const m0 = await page.evaluate(() => ({ muts: __rev.muts, raf: __rev.raf }));
await sleep(2000);
const m1 = await page.evaluate(() => ({ muts: __rev.muts, raf: __rev.raf }));
R.domMutationsPerFrame = +((m1.muts - m0.muts) / Math.max(1, m1.raf - m0.raf)).toFixed(2);
R.rafPerSec = (m1.raf - m0.raf) / 2;
// 2) restart 12 times; memory + programs + listeners + RAF rate
const before = await page.evaluate(() => { const i = __game.view.renderer.info; return { geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs.length, listeners: __rev.listeners }; });
for (let k = 0; k < 12; k++) {
  await page.evaluate((k) => { if (k % 2) __game.toMenu(); __game.startMatch({ mode: k % 3 ? 'doubles' : 'singles', scoring: 'rally', opp: 4, mate: 4, handed: k % 4 ? 'R' : 'L', quality: 'low', seed: k }); }, k);
  await sleep(250);
}
await sleep(1000);
const r0 = await page.evaluate(() => __rev.raf); await sleep(1000); const r1 = await page.evaluate(() => __rev.raf);
const after = await page.evaluate(() => { const i = __game.view.renderer.info; return { geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs.length, listeners: __rev.listeners }; });
R.restart = { before, after, rafPerSecAfter: r1 - r0 };
// 3) setQuality churn: does switching quality leak?
const q0 = await page.evaluate(() => { const i = __game.view.renderer.info; return { geo: i.memory.geometries, tex: i.memory.textures }; });
for (let k = 0; k < 10; k++) { await page.evaluate((k) => __game.view.setQuality(['low', 'medium', 'high'][k % 3]), k); await sleep(80); }
await page.evaluate(() => __game.view.setQuality('low')); await sleep(300);
const q1 = await page.evaluate(() => { const i = __game.view.renderer.info; return { geo: i.memory.geometries, tex: i.memory.textures }; });
R.qualityChurn = { q0, q1 };
// 4) clicking "繼續" on the pause menu during a replay skips the replay
await page.evaluate(() => { __game.startMatch({ mode: 'doubles', scoring: 'rally', opp: 4, mate: 4, handed: 'R', quality: 'low', seed: 3, autoplay: true }); __game.setReplayEnabled(true); });
let gotReplay = false;
for (let i = 0; i < 80 && !gotReplay; i++) {
  await page.evaluate(() => { __game.setRender(false); __game.advance(20); });
  gotReplay = await page.evaluate(() => __game.mode === 'replay');
}
if (gotReplay) {
  await page.evaluate(() => __game.setRender(true));
  await page.keyboard.press('Escape');
  await sleep(200);
  const st = await page.evaluate(() => ({ mode: __game.mode, paused: __game.paused }));
  await page.click('[data-screen="pause"] .btn.primary');
  await sleep(200);
  const st2 = await page.evaluate(() => ({ mode: __game.mode, paused: __game.paused }));
  R.resumeClickDuringReplay = { beforeClick: st, afterClick: st2 };
} else R.resumeClickDuringReplay = 'no replay reached';
// 5) key held through pause/resume is lost (keydown repeats ignored)
await page.evaluate(() => { __game.startMatch({ mode: 'singles', scoring: 'rally', opp: 4, handed: 'R', quality: 'low', seed: 11 }); __game.setReplayEnabled(false); });
await sleep(300);
// human is server in preServe; hold D (move along baseline), pause/resume with Esc while D is held, check movement
await page.keyboard.down('KeyD'); await sleep(300);
const x0 = await page.evaluate(() => __game.getState().players[0].pos.x);
await page.keyboard.press('Escape'); await sleep(150); await page.keyboard.press('Escape'); await sleep(100);
// emulate OS auto-repeat while held
for (let i = 0; i < 5; i++) { await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd', repeat: true }))); await sleep(40); }
const xa = await page.evaluate(() => __game.getState().players[0].pos.x); await sleep(400);
const xb = await page.evaluate(() => __game.getState().players[0].pos.x);
await page.keyboard.up('KeyD');
R.heldKeyAfterResume = { movedBeforePause: +(x0).toFixed(2), afterResumeDelta: +(xb - xa).toFixed(3), held: await page.evaluate(() => ({ ...__game.input.held })) };
// 6) human server never pressing: stays in preServe
await page.evaluate(() => { __game.startMatch({ mode: 'doubles', scoring: 'sideout', opp: 4, mate: 4, handed: 'R', quality: 'low', seed: 5 }); __game.setRender(false); __game.advance(60); });
R.idleServer60s = await page.evaluate(() => ({ phase: __game.getState().phase, phaseTime: +__game.getState().phaseTime.toFixed(1), isServer: __game.getState().players[0].isServer }));
console.log(JSON.stringify(R, null, 1));
console.log('problems', t.problems.slice(0, 10));
await t.close();
