// Verifies the zh-TW message for every fault reason, and the contextual HUD hints (two-bounce, kitchen, serve prompts).
import { launch, sleep, ROOT } from './lib.mjs';
const SH = `${ROOT}/dev/shots/shell`;
const t = await launch({ width: 1440, height: 900, query: '?pdb=1' });
const { page } = t;
const res = []; const ok = (name, cond, extra = '') => { res.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const REASONS = ['out', 'net', 'doubleBounce', 'kitchen', 'twoBounceRule', 'serveShort', 'serveWrongCourt', 'bodyHit'];
await page.evaluate(() => { __game.setReplayEnabled(false); __game.startMatch({ mode: 'doubles', scoring: 'rally', opp: 4, mate: 4, seed: 9 }); __game.setRender(false); });
for (const reason of REASONS) {
  const r = await page.evaluate((reason) => {
    const g = __game;
    // get into a live rally by autoplaying a serve, then force the fault on the human's team
    g.setAutoplay(true); g.advance(30, { until: (s) => s.phase === 'rally' }); g.setAutoplay(false);
    g.sim.debug.endRally(0, reason, 0);
    g.advance(1 / 120);
    const b = document.querySelector('.banner');
    return { main: b.querySelector('.bn-main').textContent, sub: b.querySelector('.bn-sub').textContent, cls: b.className, voice: g.voiceLog().slice(-3) };
  }, reason);
  ok(`fault "${reason}" shows a zh-TW banner`, /[一-鿿]/.test(r.main) && !/undefined/.test(r.main + r.sub), `${r.main} | ${r.sub} | voice: ${r.voice.join(' / ')}`);
  if (reason === 'kitchen' || reason === 'twoBounceRule') { await page.evaluate(() => __game.setRender(true)); await sleep(700); await page.screenshot({ path: `${SH}/11_fault_${reason}.png` }); await page.evaluate(() => __game.setRender(false)); }
  await page.evaluate(() => { __game.skipReplay(); __game.G.sim.skipPointOver(); __game.advance(0.1); });
}
// hints
const hint = () => page.evaluate(() => { const h = document.querySelector('.hint'); return h.classList.contains('hidden') ? '' : h.textContent; });
await page.evaluate(() => { __game.startMatch({ mode: 'doubles', scoring: 'sideout', opp: 4, seed: 9 }); __game.setRender(false); });
await sleep(300);
let h = await hint(); ok('serve prompt when the human serves', /輪到你發球/.test(h), h);
// make the human a receiver: opponents serve (singles so the human is always the receiver)
await page.evaluate(() => { __game.startMatch({ mode: 'singles', scoring: 'sideout', opp: 4, seed: 9 }); __game.setRender(false); });
await page.evaluate(() => { const g = __game; g.setAutoplay(true); g.advance(400, { until: (s) => s.phase === 'preServe' && s.score.servingTeam === 1 }); g.setAutoplay(false); g.freeze(true); g.advance(1 / 120); });
await sleep(300); h = await hint(); ok('receive prompt when the opponents serve', /接發球/.test(h), h);
// two-bounce hint: ball on its way to the human, serve not yet bounced on our side
await page.evaluate(() => { const g = __game; g.setAutoplay(true); g.advance(400, { until: (s) => s.score.servingTeam === 1 && s.phase === 'serve' && s.ball.vel.z > 0 && s.ball.pos.z > -2 }); g.setAutoplay(false); g.freeze(true); g.advance(1 / 120); });
await sleep(200); h = await hint(); ok('two-bounce hint on the return of serve', /兩跳規則/.test(h), h);
// kitchen hint
await page.evaluate(() => { const g = __game, s = g.getState(); g.setAutoplay(true); g.advance(40, { until: (s2) => s2.phase === 'rally' && s2.rally.twoBounceRemaining === 0 && s2.ball.bounces === 0 && s2.ball.lastHitBy !== null && s2.players[s2.ball.lastHitBy].team === 1 && s2.ball.vel.z > 0 }); g.setAutoplay(false); g.freeze(true); const st = g.getState(); st.players[0].pos.z = 1.6; g.input.releaseAll(); });
await page.evaluate(() => __game.advance(1 / 120)); await sleep(200); h = await hint();
ok('kitchen hint when standing in the kitchen with a ball coming', /廚房區/.test(h), h);
await page.evaluate(() => { __game.hud.hideBanner(); __game.setRender(true); __game.settleView(45, 0.1); }); await page.screenshot({ path: `${SH}/12_hint_kitchen.png` });
console.log('problems', t.problems);
ok('no console errors/warnings', t.problems.length === 0, t.problems.join(' | '));
console.log(res.filter((r) => r[0] === 'FAIL').length, 'failures of', res.length);
await t.close();
