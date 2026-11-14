// Screenshots of every menu/gameplay screen after transitions settle: node dev/playtest/finalshots.mjs [W] [H] [suffix]
import { launch, sleep, ROOT } from './lib.mjs';
const OUT = `${ROOT}/dev/shots/final`;
const W = +process.argv[2] || 1440, H = +process.argv[3] || 900, tag = process.argv[4] || '';
const t = await launch({ width: W, height: H, query: '?pdb=1' });
const { page } = t;
const shot = async (name) => { await sleep(900); await page.screenshot({ path: `${OUT}/${name}${tag}.png` }); console.log('shot', name + tag); };
const btn = (txt) => page.locator('.screen:not(.hidden) button').filter({ has: page.locator(`.bl:text-is("${txt}")`) }).first();
await sleep(1200);
await shot('01_main_menu');
await btn('開始比賽').click(); await shot('02_setup');
await btn('返回').click(); await sleep(300);
await btn('操作說明').click(); await shot('03_help');
// does the help panel fit?
console.log('help panel overflow', await page.evaluate(() => { const p = document.querySelector('.screen[data-screen=help] .panel'); return { sh: p.scrollHeight, ch: p.clientHeight }; }));
console.log('setup panel overflow', await page.evaluate(() => { __game.menus.openSetup(__game.settings); const p = document.querySelector('.screen[data-screen=setup] .panel'); return { sh: p.scrollHeight, ch: p.clientHeight }; }));
await page.evaluate(() => __game.toMenu()); await sleep(300);
await btn('設定').click(); await shot('03b_settings');
await btn('返回').click(); await sleep(200);
// gameplay
await page.evaluate(() => { __game.startMatch({ mode: 'doubles', scoring: 'sideout', opp: 4, mate: 4, handed: 'R', quality: 'high', seed: 7 }); __game.freeze(true); });
await page.evaluate(() => { __game.settleView(30, 0.1); __game.hud.hideBanner(); });
await shot('05_serving');
await page.evaluate(() => {
  const g = __game; g.freeze(false); g.setReplayEnabled(false); g.setAutoplay(true);
  g.advance(60, { until: (s) => s.phase === 'rally' && s.rally.hits >= 3 && s.ball.bounces === 0 && s.ball.lastHitBy !== null && s.players[s.ball.lastHitBy].team === 1 && s.ball.vel.z > 0 && s.ball.pos.z < -1 && s.ball.pos.z > -5 && s.ball.landing && s.ball.landing.z > 2 });
  g.setAutoplay(false); g.freeze(true); g.hud.hideBanner(); g.settleView(30, 0.1); g.hud.hideBanner();
});
await shot('04_gameplay');
// replay
await page.evaluate(() => { const g = __game; g.freeze(false); g.setReplayEnabled(true); g.setAutoplay(true); g.G.sinceReplay = 9; });
const gotReplay = await page.evaluate(() => { const g = __game; for (let i = 0; i < 80 && g.mode !== 'replay'; i++) { g.advance(10); } return g.mode; });
console.log('mode', gotReplay);
await page.evaluate(() => { __game.freeze(false); });
await sleep(1500);
await shot('06_replay');
// pause during replay, then check "繼續" resumes the replay (not skip)
await page.evaluate(() => __game.pause()); await sleep(500);
await shot('07_pause');
await btn('繼續').click(); await sleep(300);
console.log('after clicking 繼續 during replay: mode =', await page.evaluate(() => __game.mode), 'paused =', await page.evaluate(() => __game.paused));
await page.evaluate(() => { __game.skipReplay(); __game.setAutoplay(true); __game.setReplayEnabled(false); __game.advance(900, { until: () => __game.mode === 'over' }); });
await sleep(2500);
console.log('mode', await page.evaluate(() => __game.mode));
await shot('08_game_over');
console.log('problems', t.problems);
await t.close();
