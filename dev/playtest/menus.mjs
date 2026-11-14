// Clicks through every menu path with the real mouse + keyboard, checks state, settings persistence, pause, mute, legend.
import { launch, sleep, ROOT } from './lib.mjs';
const SH = `${ROOT}/dev/shots/shell`;
const t = await launch({ width: 1440, height: 900 });
const { page } = t;
const res = []; const ok = (name, cond, extra = '') => { res.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const btn = (txt) => page.locator('.screen:not(.hidden) button').filter({ has: page.locator(`.bl:text-is("${txt}")`) }).first();
const seg = (label, v) => page.locator('.screen:not(.hidden) .row', { has: page.locator('label', { hasText: label }) }).locator('.segbtn', { hasText: v }).first();
const screen = () => page.evaluate(() => __game.menus.current);

await sleep(1200);
await page.screenshot({ path: `${SH}/01_main_menu.png` });
ok('boots to main menu', (await screen()) === 'main' && (await page.evaluate(() => __game.mode)) === 'menu');

// help from main
await btn('操作說明').click(); await sleep(400);
ok('help opens', (await screen()) === 'help');
await page.screenshot({ path: `${SH}/09_help.png` });
await btn('返回').click(); await sleep(200);
ok('help returns to main', (await screen()) === 'main');
// settings from main
await btn('設定').click(); await sleep(400);
ok('settings opens', (await screen()) === 'settings');
await seg('畫質', '中').click();
await seg('音效', '靜音').click();
ok('mute via settings', await page.evaluate(() => __game.settings.muted === true && __game.settings.quality === 'medium'));
await page.screenshot({ path: `${SH}/10_settings.png` });
await seg('音效', '開').click();
await seg('語音', '關').click(); await seg('語音', '開').click();
await btn('返回').click(); await sleep(200);

// setup screen
await btn('開始比賽').click(); await sleep(400);
ok('setup opens', (await screen()) === 'setup');
await page.screenshot({ path: `${SH}/02_setup.png` });
// every option
await seg('模式', '單打').click();
ok('mate row hidden in singles', await page.evaluate(() => document.querySelector('.screen[data-screen=setup] .row.hidden') !== null));
await seg('模式', '雙打').click();
await seg('計分', 'Rally').click();
await seg('對手強度', '6.0').click();
await seg('隊友強度', '5.0').click();
await seg('持拍手', '左手').click();
await seg('畫質', '低').click();
await page.screenshot({ path: `${SH}/02b_setup_changed.png` });
await btn('返回').click(); await sleep(200);
ok('back to main from setup', (await screen()) === 'main');
// persisted?
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pickleball3d.settings.v1')));
ok('settings persisted', saved && saved.scoring === 'rally' && saved.opp === 6 && saved.handed === 'L' && saved.quality === 'low', JSON.stringify(saved));
await btn('開始比賽').click(); await sleep(300);
ok('setup remembers choices', await page.evaluate(() => { const on = [...document.querySelectorAll('.screen[data-screen=setup] .segbtn.on')].map((b) => b.textContent); return on.join(',') ; }).then((v) => { console.log('  on:', v); return v.includes('Rally 15 分') && v.includes('6.0') && v.includes('左手'); }));
// start the match with those (doubles rally dupr6 left-handed, low)
await btn('開始比賽').click(); await sleep(1200);
let cfg = await page.evaluate(() => { const c = __game.getState().config; return { mode: c.mode, scoring: c.scoring, dupr: c.players.map((p) => p.dupr), handed: c.players[0].handed }; });
ok('match started with chosen config', cfg.mode === 'doubles' && cfg.scoring === 'rally' && cfg.dupr[2] === 6 && cfg.dupr[1] === 5 && cfg.handed === 'L', JSON.stringify(cfg));
ok('HUD visible', await page.evaluate(() => !document.querySelector('.hud').classList.contains('hidden')));
await page.screenshot({ path: `${SH}/_03_gameplay_start.png` });
const au = await page.evaluate(async () => { __game.setAutoplay(true); __game.advance(25); __game.setAutoplay(false); return __game.audio.state; });
ok('WebAudio unlocked by the menu click and events play without errors', au === 'running', au);

// Esc pause / resume
let tick0 = await page.evaluate(() => __game.getState().tick);
await page.keyboard.press('Escape'); await sleep(500);
ok('Esc pauses', await page.evaluate(() => __game.paused) && (await screen()) === 'pause');
await page.screenshot({ path: `${SH}/07_pause_menu.png` });
let tick1 = await page.evaluate(() => __game.getState().tick); await sleep(600);
let tick2 = await page.evaluate(() => __game.getState().tick);
ok('sim frozen while paused', tick1 === tick2, `${tick1}==${tick2}`);
await page.keyboard.press('Escape'); await sleep(300);
ok('Esc resumes', !(await page.evaluate(() => __game.paused)));
await sleep(500);
{ const info = await page.evaluate(() => ({ tick: __game.getState().tick, mode: __game.mode, paused: __game.paused })); ok('sim runs after resume (or a highlight replay is playing, which pauses the sim)', info.tick > tick2 || info.mode === 'replay', JSON.stringify(info)); }
// blur auto-pause
await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(200);
ok('window blur pauses', await page.evaluate(() => __game.paused));
await btn('繼續').click(); await sleep(200);
ok('resume button', !(await page.evaluate(() => __game.paused)));
// legend toggle H, mute M
const legendHidden = () => page.evaluate(() => document.querySelector('.legend').classList.contains('hidden'));
const l0 = await legendHidden(); await page.keyboard.press('KeyH'); await sleep(100);
ok('H toggles legend', (await legendHidden()) !== l0);
await page.keyboard.press('KeyH'); await sleep(100);
const m0 = await page.evaluate(() => __game.settings.muted); await page.keyboard.press('KeyM'); await sleep(100);
ok('M toggles mute', (await page.evaluate(() => __game.settings.muted)) !== m0);
await page.keyboard.press('KeyM'); await sleep(100);
await page.locator('.hud .iconbtn[title^="靜音"]').click(); await sleep(100);
ok('mute button works', await page.evaluate(() => __game.settings.muted));
await page.locator('.hud .iconbtn[title^="靜音"]').click(); await sleep(100);
// pause -> help -> back -> settings -> back
await page.locator('.hud .iconbtn[title^="暫停"]').click(); await sleep(300);
ok('pause button', (await screen()) === 'pause');
await btn('操作說明').click(); await sleep(200); ok('pause->help', (await screen()) === 'help');
await page.keyboard.press('Escape'); await sleep(200); ok('Esc help->pause', (await screen()) === 'pause');
await btn('設定').click(); await sleep(200); ok('pause->settings', (await screen()) === 'settings');
await btn('返回').click(); await sleep(200); ok('settings->pause', (await screen()) === 'pause');
// restart
await page.evaluate(() => { __game.G.sim.state.score.points[0] = 3; });
await btn('重新開始').click(); await sleep(600);
const afterRestart = await page.evaluate(() => ({ pts: __game.getState().score.points, tick: __game.getState().tick, paused: __game.paused }));
ok('restart resets score & unpauses', afterRestart.pts[0] === 0 && !afterRestart.paused && afterRestart.tick < 400, JSON.stringify(afterRestart));
// back to menu
await page.keyboard.press('Escape'); await sleep(300);
await btn('回主選單').click(); await sleep(700);
ok('back to main menu', (await screen()) === 'main' && (await page.evaluate(() => __game.mode)) === 'menu');

// singles flow from the UI
await btn('開始比賽').click(); await sleep(300);
await seg('模式', '單打').click(); await seg('計分', '傳統').click(); await seg('對手強度', '3.0').click(); await seg('持拍手', '右手').click(); await seg('畫質', '高').click();
await btn('開始比賽').click(); await sleep(1200);
cfg = await page.evaluate(() => { const c = __game.getState().config; return { mode: c.mode, scoring: c.scoring, n: c.players.length, dupr: c.players[1].dupr }; });
ok('singles/sideout/3.0 started', cfg.mode === 'singles' && cfg.scoring === 'sideout' && cfg.n === 2 && cfg.dupr === 3, JSON.stringify(cfg));
await page.screenshot({ path: `${SH}/_03b_singles_start.png` });
// localStorage reload persistence
await page.reload(); await page.waitForFunction(() => window.__game && window.__game.sim); await sleep(600);
const s2 = await page.evaluate(() => ({ ...__game.settings }));
ok('settings survive reload', s2.mode === 'singles' && s2.scoring === 'sideout' && s2.opp === 3 && s2.quality === 'high', JSON.stringify(s2));
// ui works with storage blocked
console.log('console problems:', t.problems);
ok('no console errors/warnings', t.problems.length === 0, t.problems.join(' | '));
console.log(res.filter((r) => r[0] === 'FAIL').length, 'failures of', res.length);
await t.close();
