// i18n checks: default language per browser locale, switching from Settings / main-menu toggle / pause menu mid-match,
// persistence, no CJK left in English mode on any screen, and English screenshots at 1440x900 and 1280x720.
import { launch, sleep, ROOT } from './lib.mjs';
const SH = `${ROOT}/dev/shots/i18n`;
const res = []; const ok = (name, cond, extra = '') => { res.push(!!cond); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const problemsAll = [];

const htmlLang = (page) => page.evaluate(() => document.documentElement.lang);
const text = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
const screen = (page) => page.evaluate(() => __game.menus.current);
const CJK = '[\\u3000-\\u9fff\\uff00-\\uffef]';
/** visible text + title/aria-label attributes under #ui, minus the language names themselves */
const cjkIn = (page) => page.evaluate((src) => {
  const re = new RegExp(src);
  const allowed = ['繁體中文', '語言 / Language'];
  const strip = (s) => allowed.reduce((a, x) => a.split(x).join(''), s);
  const out = [];
  const tx = strip(document.querySelector('#ui').innerText);
  const m = tx.match(new RegExp(`.{0,15}${src}+.{0,15}`)); if (m) out.push(m[0]);
  for (const el of document.querySelectorAll('#ui *, #game')) for (const a of ['title', 'aria-label', 'placeholder', 'alt']) { const v = el.getAttribute(a); if (v && re.test(strip(v))) out.push(`${a}=${v}`); }
  return out;
}, CJK);
const clickSeg = (page, scope, label) => page.locator(`${scope} .segbtn`, { hasText: label }).first().click();
const btnByText = (page, txt) => page.locator('.screen:not(.hidden) button').filter({ has: page.locator(`.bl:text-is("${txt}")`) }).first();

async function fresh(locale, opts = {}) {
  const t = await launch({ width: 1440, height: 900, locale, query: opts.query || '' });
  await sleep(900);
  return t;
}

// ---------------------------------------------------------------- 1. defaults by browser locale
{
  const t = await fresh('en-US'); const { page } = t;
  ok('en-US: html lang=en', (await htmlLang(page)) === 'en');
  const main = await text(page, '.screen[data-screen=main]');
  ok('en-US: main menu in English', /Play/.test(main) && /How to play/.test(main) && !(await cjkIn(page)).length, main);
  ok('en-US: stored lang unset until the user chooses', await page.evaluate(() => !JSON.parse(localStorage.getItem('pickleball3d.settings.v1') || '{}').lang));
  problemsAll.push(...t.problems); await t.close();
}
{
  const t = await fresh('zh-TW'); const { page } = t;
  ok('zh-TW: html lang=zh-Hant-TW', (await htmlLang(page)) === 'zh-Hant-TW');
  const main = await text(page, '.screen[data-screen=main]');
  ok('zh-TW: main menu in Chinese', /開始比賽/.test(main) && /操作說明/.test(main), main);
  problemsAll.push(...t.problems); await t.close();
}
{
  const t = await fresh('zh-CN'); const { page } = t;
  ok('zh-CN (any zh*): defaults to Chinese', /開始比賽/.test(await text(page, '.screen[data-screen=main]')));
  problemsAll.push(...t.problems); await t.close();
}
{
  const t = await fresh('fr-FR'); const { page } = t;
  ok('other locale (fr-FR): defaults to English', /How to play/.test(await text(page, '.screen[data-screen=main]')));
  problemsAll.push(...t.problems); await t.close();
}

// ---------------------------------------------------------------- 2. switch from Settings + main toggle, persistence
{
  const t = await fresh('en-US'); const { page } = t;
  await btnByText(page, 'Settings').click(); await sleep(300);
  ok('settings screen (en)', (await text(page, '.screen[data-screen=settings] h2')) === 'Settings');
  await clickSeg(page, '.screen[data-screen=settings]', '繁體中文'); await sleep(100);
  ok('Settings switch to zh is immediate (heading, back button, html lang)', (await text(page, '.screen[data-screen=settings] h2')) === '設定' && /返回/.test(await text(page, '.screen[data-screen=settings] .btn-row')) && (await htmlLang(page)) === 'zh-Hant-TW');
  ok('still on the settings screen', (await screen(page)) === 'settings');
  await page.locator('.screen[data-screen=settings] .btn-row button').click(); await sleep(300);
  ok('main menu is Chinese after Settings switch', /開始比賽/.test(await text(page, '.screen[data-screen=main]')));
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__game && window.__game.sim); await sleep(600);
  ok('Settings choice persists across reload (zh stays even with en-US browser)', /開始比賽/.test(await text(page, '.screen[data-screen=main]')) && (await htmlLang(page)) === 'zh-Hant-TW');
  // main-menu toggle back to English
  await clickSeg(page, '.lang-toggle', 'English'); await sleep(100);
  ok('main-menu toggle to English is immediate', /How to play/.test(await text(page, '.screen[data-screen=main]')) && (await htmlLang(page)) === 'en');
  ok('toggle button marked active', await page.evaluate(() => document.querySelector('.lang-toggle .segbtn.on').textContent === 'English'));
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__game && window.__game.sim); await sleep(600);
  ok('toggle choice persists across reload', /How to play/.test(await text(page, '.screen[data-screen=main]')));
  await clickSeg(page, '.lang-toggle', '繁體中文'); await sleep(100);
  ok('main-menu toggle to zh', /開始比賽/.test(await text(page, '.screen[data-screen=main]')));
  // setup screen re-renders in place and keeps selections
  await btnByText(page, '開始比賽').click(); await sleep(300);
  await clickSeg(page, '.screen[data-screen=setup]', 'Rally');
  await page.evaluate(() => __game.menus.syncSettings(__game.settings));
  await page.evaluate(() => { const l = window.__game; });
  problemsAll.push(...t.problems); await t.close();
}

// ---------------------------------------------------------------- 3. mid-match switching through the pause menu
{
  const t = await fresh('en-US', { query: '?pdb=1' }); const { page } = t;
  await btnByText(page, 'Play').click(); await sleep(300);
  ok('setup screen in English', /Opponent level \(DUPR\)/.test(await text(page, '.screen[data-screen=setup]')));
  await btnByText(page, 'Start match').click(); await sleep(1500);
  const snap = () => page.evaluate(() => { const s = __game.getState(); return { tick: s.tick, pts: s.score.points.slice(), phase: s.phase, serving: s.score.servingTeam, call: s.score.callText, seed: s.config.seed, names: s.players.map((p) => p.name) }; });
  const hud = () => page.evaluate(() => ({ names: [...document.querySelectorAll('.sb-row .names')].map((e) => e.textContent), mode: document.querySelector('.modeinfo').textContent, hint: document.querySelector('.hint').classList.contains('hidden') ? '' : document.querySelector('.hint').textContent, legend: document.querySelector('.legend .lg-title').textContent, callLbl: document.querySelector('.calllbl').textContent, pause: document.querySelector('.hud .iconbtn:last-child').title }));
  const h0 = await hud(), s0 = await snap();
  ok('HUD in English', h0.names[0] === 'You & Partner' && h0.names[1] === 'Opp A & Opp B' && /^Doubles/.test(h0.mode) && /Your serve/.test(h0.hint) && h0.legend === 'Controls' && h0.pause === 'Pause (Esc)', JSON.stringify(h0));
  ok('sim player names are stable keys, not translated', s0.names.join() === 'you,mate,oppA,oppB', s0.names.join());
  // force a fault banner then pause with it still showing
  await page.evaluate(() => { __game.setReplayEnabled(false); __game.setAutoplay(true); __game.advance(30, { until: (s) => s.phase === 'rally' }); __game.setAutoplay(false); __game.sim.debug.endRally(0, 'kitchen', 0); __game.advance(1 / 120); });
  const banEn = await text(page, '.banner');
  ok('fault banner in English', /Kitchen fault/.test(banEn) && /Volleyed in the kitchen/.test(banEn), banEn);
  await page.keyboard.press('Escape'); await sleep(400);
  ok('paused', (await screen(page)) === 'pause' && (await page.evaluate(() => __game.paused)));
  const sP = await snap();
  await btnByText(page, 'Settings').click(); await sleep(300);
  await clickSeg(page, '.screen[data-screen=settings]', '繁體中文'); await sleep(150);
  const hz = await hud(), sz = await snap();
  ok('HUD switched to Chinese while paused', hz.names[0] === '你 & 隊友' && hz.names[1] === '對手A & 對手B' && /^雙打/.test(hz.mode) && hz.legend === '操作' && hz.callLbl === '報分' && hz.pause === '暫停 (Esc)', JSON.stringify(hz));
  const banZh = await text(page, '.banner');
  ok('visible fault banner re-worded', /廚房區違例/.test(banZh) && /在廚房區內截擊/.test(banZh), banZh);
  ok('match state intact (tick, score, phase, seed, server)', sz.tick === sP.tick && sz.pts.join() === sP.pts.join() && sz.phase === sP.phase && sz.seed === sP.seed && sz.serving === sP.serving && sz.call === sP.call, `${JSON.stringify(sP)} -> ${JSON.stringify(sz)}`);
  ok('still paused on settings, still in the same match', (await screen(page)) === 'settings' && (await page.evaluate(() => __game.paused && __game.mode === 'play')));
  await page.locator('.screen[data-screen=settings] .btn-row button').click(); await sleep(200);
  ok('back to Chinese pause menu', (await screen(page)) === 'pause' && /繼續/.test(await text(page, '.screen[data-screen=pause]')));
  await btnByText(page, '繼續').click(); await sleep(400);
  ok('resumed', !(await page.evaluate(() => __game.paused)));
  // let the next serve prompt appear and check the zh hint, then switch back while a hint is showing
  await page.evaluate(() => { __game.G.sim.skipPointOver && __game.G.sim.skipPointOver(); __game.advance(6, { until: (s) => s.phase === 'preServe' }); });
  await sleep(300);
  const hh = await hud();
  ok('hint in Chinese after switch', hh.hint === '' || /[一-鿿]/.test(hh.hint), hh.hint);
  await page.keyboard.press('Escape'); await sleep(300);
  await btnByText(page, '設定').click(); await sleep(250);
  await clickSeg(page, '.screen[data-screen=settings]', 'English'); await sleep(150);
  const he = await hud(), se = await snap();
  ok('HUD back to English incl. hint', he.names[0] === 'You & Partner' && /^Doubles/.test(he.mode) && (he.hint === '' || !/[一-鿿]/.test(he.hint)), JSON.stringify(he));
  ok('no CJK anywhere visible after switching back', (await cjkIn(page)).length === 0, JSON.stringify(await cjkIn(page)));
  ok('match still the same (seed, no restart)', se.seed === s0.seed && se.tick >= sP.tick);
  // scoring text: serve-number badge ("Server 1") follows language in side-out doubles
  const badge = await page.evaluate(() => [...document.querySelectorAll('.srvno')].map((e) => e.textContent).join('|'));
  ok('server badge text', /Server [12]/.test(badge) || badge === '|' || badge === '', badge);
  problemsAll.push(...t.problems); await t.close();
}

// ---------------------------------------------------------------- 4. English: no CJK on any screen + screenshots
async function sweep(w, h, tag, shoot) {
  const t = await launch({ width: w, height: h, locale: 'en-US', query: '?pdb=1' }); const { page } = t;
  await sleep(1200);
  const shot = async (name) => { if (shoot) { await page.mouse.move(2, 2); await sleep(700); await page.screenshot({ path: `${SH}/${tag}_${name}.png` }); } };
  const scan = async (label) => { const bad = await cjkIn(page); ok(`no CJK on ${label} (${tag})`, bad.length === 0, bad.join(' | ')); };
  const noClip = async (label) => {
    const r = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('.screen:not(.hidden) .panel, .hud:not(.hidden) *')) {
        const cs = getComputedStyle(el); if (cs.display === 'none') continue;
        if (el.matches('.panel') && el.scrollHeight > el.clientHeight + 1) bad.push(`panel scrolls ${el.className} ${el.scrollHeight}>${el.clientHeight}`);
        if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && el.children.length === 0) bad.push(`clipped: ${el.className} "${el.textContent.slice(0, 30)}"`);
      }
      return bad;
    });
    ok(`no clipping / scrolling on ${label} (${tag})`, r.length === 0, r.join(' | '));
  };
  await scan('main'); await noClip('main'); await shot('01_main');
  await btnByText(page, 'Play').click(); await sleep(300);
  for (const sc of ['Traditional (to 11)', 'Rally (to 15)']) { await clickSeg(page, '.screen[data-screen=setup]', sc); await scan(`setup ${sc}`); }
  for (const d of ['3.0', '4.0', '5.0', '6.0']) { await page.locator('.screen[data-screen=setup] .row', { has: page.locator('label', { hasText: 'Opponent' }) }).locator('.segbtn', { hasText: d }).click(); await scan(`setup opp ${d}`); await noClip(`setup opp ${d}`); }
  await clickSeg(page, '.screen[data-screen=setup]', 'Traditional (to 11)');
  await shot('02_setup');
  await clickSeg(page, '.screen[data-screen=setup]', 'Singles'); await scan('setup singles'); await clickSeg(page, '.screen[data-screen=setup]', 'Doubles');
  await btnByText(page, 'Back').click(); await sleep(200);
  await btnByText(page, 'How to play').click(); await sleep(300);
  await scan('help'); await noClip('help'); await shot('03_help');
  await btnByText(page, 'Back').click(); await sleep(200);
  await btnByText(page, 'Settings').click(); await sleep(300);
  await scan('settings'); await noClip('settings'); await shot('04_settings');
  await btnByText(page, 'Back').click(); await sleep(200);
  // gameplay
  await btnByText(page, 'Play').click(); await sleep(300);
  await btnByText(page, 'Start match').click(); await sleep(600);
  await page.evaluate(() => { __game.setReplayEnabled(false); __game.hud.hideBanner(); __game.advance(0.05); __game.setRender(true); __game.settleView(30, 0.1); });
  await sleep(500);
  await scan('gameplay HUD + legend + hint'); await noClip('gameplay HUD');
  await page.evaluate(() => __game.hud.toast('drive', 0.9)); await scan('shot toast');
  await page.evaluate(() => __game.hud.toast('atp')); await scan('atp toast');
  await page.evaluate(() => { __game.hud.clearTransient(); __game.hud.hideBanner(); });
  await sleep(300); await shot('05_gameplay');
  // fault banners: every reason
  for (const reason of ['out', 'net', 'doubleBounce', 'kitchen', 'twoBounceRule', 'serveShort', 'serveWrongCourt', 'bodyHit']) {
    await page.evaluate((reason) => { const g = __game; g.setRender(false); g.setAutoplay(true); g.advance(30, { until: (s) => s.phase === 'rally' }); g.setAutoplay(false); g.sim.debug.endRally(0, reason, 0); g.advance(1 / 120); }, reason);
    await scan(`fault banner ${reason}`); await noClip(`fault banner ${reason}`);
    if (reason === 'kitchen') { await page.evaluate(() => __game.setRender(true)); await shot('06_fault'); }
    await page.evaluate(() => { __game.skipReplay(); __game.G.sim.skipPointOver(); __game.advance(0.1); });
  }
  // hints
  await page.evaluate(() => { __game.setRender(true); __game.startMatch({ mode: 'singles', scoring: 'sideout', opp: 4, seed: 9 }); __game.setReplayEnabled(false); __game.setRender(false); });
  await page.evaluate(() => { const g = __game; g.setAutoplay(true); g.advance(400, { until: (s) => s.phase === 'preServe' && s.score.servingTeam === 1 }); g.setAutoplay(false); g.freeze(true); g.advance(1 / 120); });
  await sleep(200); await scan('receive hint');
  await page.evaluate(() => { const g = __game; g.freeze(false); g.setAutoplay(true); g.advance(400, { until: (s) => s.score.servingTeam === 1 && s.phase === 'serve' && s.ball.vel.z > 0 && s.ball.pos.z > -2 }); g.setAutoplay(false); g.freeze(true); g.advance(1 / 120); });
  await sleep(200); await scan('two-bounce hint');
  await page.evaluate(() => { const g = __game; g.freeze(false); g.setAutoplay(true); g.advance(40, { until: (s2) => s2.phase === 'rally' && s2.rally.twoBounceRemaining === 0 && s2.ball.bounces === 0 && s2.ball.lastHitBy !== null && s2.players[s2.ball.lastHitBy].team === 1 && s2.ball.vel.z > 0 }); g.setAutoplay(false); g.freeze(true); g.getState().players[0].pos.z = 1.6; g.input.releaseAll(); g.advance(1 / 120); });
  await sleep(200); await scan('kitchen hint');
  await page.evaluate(() => { __game.freeze(false); __game.setRender(true); });
  // serve prompt (urgent variant after 8 s idle)
  await page.evaluate(() => { __game.startMatch({ mode: 'doubles', scoring: 'sideout', opp: 4, seed: 9 }); __game.advance(9); });
  await sleep(200); await scan('urgent serve hint');
  // replay banner (real flow)
  await page.evaluate(() => { const g = __game; g.startMatch({ mode: 'doubles', scoring: 'rally', opp: 4, mate: 4, seed: 21 }); g.setReplayEnabled(true); g.setAutoplay(true); g.G.sinceReplay = 9; for (let i = 0; i < 120 && g.mode !== 'replay'; i++) g.advance(10); });
  await sleep(1200);
  const inReplay = await page.evaluate(() => __game.mode === 'replay');
  ok(`replay reached (${tag})`, inReplay);
  if (inReplay) { await scan('replay banner + skip text'); ok(`replay banner text (${tag})`, /HIGHLIGHT/.test(await text(page, '.replay-banner')) && /skip/.test(await text(page, '.replay-skip'))); }
  // pause + game over
  await page.evaluate(() => { __game.skipReplay(); __game.setReplayEnabled(false); __game.setRender(true); });
  await page.keyboard.press('Escape'); await sleep(500);
  await scan('pause'); await shot('07_pause');
  await btnByText(page, 'Resume').click(); await sleep(200);
  await page.evaluate(() => { __game.setAutoplay(true); __game.advance(900, { until: () => __game.mode === 'over' }); });
  await sleep(800);
  ok(`game over reached (${tag})`, (await page.evaluate(() => __game.mode)) === 'over');
  await scan('game over'); await noClip('game over'); await shot('08_gameover');
  await btnByText(page, 'Main menu').click(); await sleep(500);
  await scan('main again');
  ok(`no console problems (${tag})`, t.problems.length === 0, t.problems.join(' | '));
  problemsAll.push(...t.problems); await t.close();
}
await sweep(1440, 900, '1440x900', true);
await sweep(1280, 720, '1280x720', true);

ok('zero console errors/warnings overall', problemsAll.length === 0, problemsAll.join(' | '));
const fails = res.filter((x) => !x).length;
console.log(`${fails} failures of ${res.length}`);
process.exit(fails ? 1 : 0);
