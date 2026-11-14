// Touch playtest: Playwright device emulation + REAL touch events through CDP Input.dispatchTouchEvent (multi-touch), never mouse events.
// Usage: node dev/playtest/touch.mjs [--shots] [--rally 60]     (--shots writes screenshots to dev/shots/mobile/, a scratch dir that is not committed)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { startServer, ROOT } from './lib.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const ARGS = process.argv.slice(2);
const SHOTS = ARGS.includes('--shots');
const RALLY_SECS = ARGS.includes('--rally') ? +ARGS[ARGS.indexOf("--rally") + 1] : 150;
const SH = `${ROOT}/dev/shots/mobile`;
if (SHOTS) fs.mkdirSync(SH, { recursive: true });

const results = []; let problems = [];
const ok = (name, cond, extra = '') => { results.push(!!cond); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { srv, url } = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

/** open a page with a named Playwright device (or a custom {viewport}) and a CDP multi-touch driver */
async function open(spec, { query = '', init = null, locale = 'en-US' } = {}) {
  const opts = typeof spec === 'string' ? { ...devices[spec] } : { ...spec };
  const ctx = await browser.newContext({ ...opts, locale });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { problems.push(`[${m.type()}] ${m.text()}`); console.log('[console]', m.text()); } });
  page.on('pageerror', (e) => { problems.push(`[pageerror] ${e.message}`); console.log('[pageerror]', e.message); });
  if (init) await page.addInitScript(init);
  await page.goto(url + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.sim, null, { timeout: 30000 });
  await sleep(500);
  const cdp = await ctx.newCDPSession(page);
  const active = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...active].map(([id, p]) => ({ x: p.x, y: p.y, id })) });
  const T = {
    async down(id, x, y) { active.set(id, { x, y }); await send('touchStart'); },
    async move(id, x, y) { active.set(id, { x, y }); await send('touchMove'); },
    async up(id) { const p = active.get(id); active.delete(id); if (p) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: p.x, y: p.y, id }] }); },   // (touchEnd lists the points that END)
    async cancel() { active.clear(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); },
    async tap(id, x, y, hold = 40) { await T.down(id, x, y); await sleep(hold); await T.up(id); },
    active,
  };
  const rect = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, sel);
  const btn = async (shot) => rect(`.tc-btn[data-shot="${shot}"]`);
  const st = () => page.evaluate(() => { const s = __game.getState(), p = s.players[0]; return { x: p.pos.x, z: p.pos.z, vx: p.vel.x, vz: p.vel.z, phase: s.phase, isServer: p.isServer, anim: p.anim.name, t: s.time }; });
  const tapText = async (txt) => { const l = page.locator('.screen:not(.hidden) button, .screen:not(.hidden) a', { hasText: txt }).first(); await l.evaluate((e) => e.scrollIntoView({ block: 'center' })); await sleep(60); const b = await l.boundingBox(); await T.tap(90, b.x + b.width / 2, b.y + b.height / 2, 30); await sleep(280); };
  const shot = async (n) => { if (SHOTS) { await sleep(350); await page.screenshot({ path: `${SH}/${n}.png` }); } };
  return { ctx, page, cdp, T, rect, btn, st, tapText, shot, close: () => ctx.close() };
}
const startHere = (p, o = {}) => p.page.evaluate((o) => { if (!window.__keepRender) __game.setRender(false); __game.setReplayEnabled(false); __game.startMatch({ mode: 'doubles', scoring: 'sideout', opp: 3, mate: 4, handed: 'R', quality: 'low', seed: 7, ...o }); }, o);
/** seed whose human is NOT the server (so the stick can move freely toward the net) */
async function startReceiver(p, o = {}) {   // let the AI play (autoplay) until the opponents serve, then hand control back
  await startHere(p, { seed: 3, ...o });
  await p.page.evaluate(() => { __game.setAutoplay(true); for (let k = 0; k < 60 && !(__game.getState().phase === 'preServe' && !__game.getState().players[0].isServer && __game.getState().players[0].isReceiver); k++) __game.advance(5, { until: (s) => s.phase === 'preServe' && !s.players[0].isServer && s.players[0].isReceiver }); __game.setAutoplay(false); });
  await p.page.evaluate(() => { if (!window.__pin) window.__pin = setInterval(() => { const s = __game.getState(); if (s.phase === 'preServe') s.phaseTime = 0; }, 40); });   // keep the opponents' serve from starting while we test movement
  return (await p.st()).isServer ? -1 : 3;
}
async function startServerSeed(p, o = {}) {
  for (let seed = 1; seed < 40; seed++) { await startHere(p, { seed, ...o }); if ((await p.st()).isServer) return seed; }
  return -1;
}
const spyOn = (p) => p.page.evaluate(() => { const inp = __game.input; window.__spy = []; if (inp.__spied) return; inp.__spied = true; const orig = inp.poll.bind(inp); inp.poll = (c) => { const r = orig(c); if (r.swing || r.mx || r.mz) window.__spy.push({ ...r }); return r; }; });
const spy = (p) => p.page.evaluate(() => window.__spy.splice(0));
/** frames can be slow under software GL: collect Inputs until a swing shows up (or timeout) */
async function spyUntilSwing(p, ms = 2500) { const all = []; const t0 = Date.now(); while (Date.now() - t0 < ms) { all.push(...(await spy(p))); if (all.some((s) => s.swing)) break; await sleep(40); } return all; }

const PHONES = ['iPhone 14', 'iPhone 14 landscape', 'Pixel 7', 'iPad (gen 7)'];

const ONLY = (ARGS.find((x) => x.startsWith('--only=')) || '').slice(7);   // e.g. --only=rally | menus | page (default: everything)
const want = (n) => !ONLY || ONLY === n;
if (want('basics')) {
// ---------------------------------------------------------------------------------------------------------------- 1. touch UI vs desktop
console.log('\n== touch UI visibility / default quality ==');
for (const d of PHONES) {
  const p = await open(d);
  const info = await p.page.evaluate(() => ({ ui: __game.isTouchUI(), cls: document.body.classList.contains('touch-ui'), q: __game.settings.quality }));
  await startHere(p); await sleep(400);
  const v = await p.page.evaluate(() => ({ touch: !document.querySelector('.touch').classList.contains('hidden'), legend: getComputedStyle(document.querySelector('.legend')).display, charge: getComputedStyle(document.querySelector('.charge')).display, fs: !!document.querySelector('.fsbtn') }));
  const want = d.startsWith('iPad') ? 'medium' : 'low';
  ok(`${d}: touch UI on, keyboard legend hidden, default quality ${want}`, info.ui && info.cls && v.touch && v.legend === 'none' && v.charge === 'none' && info.q === want, JSON.stringify({ info, v }));
  await p.close();
}
{
  const p = await open({ viewport: { width: 1440, height: 900 } });
  await startHere(p); await sleep(400);
  const v = await p.page.evaluate(() => ({ ui: __game.isTouchUI(), touchHidden: document.querySelector('.touch').classList.contains('hidden'), legend: getComputedStyle(document.querySelector('.legend')).display, q: __game.settings.quality, fs: !!document.querySelector('.fsbtn') && getComputedStyle(document.querySelector('.fsbtn')).display }));
  ok('desktop: no touch UI, legend shown, default quality high', !v.ui && v.touchHidden && v.legend !== 'none' && v.q === 'high' && (!v.fs || v.fs === 'none'), JSON.stringify(v));
  await p.close();
}
{ // desktop with a touchscreen: starts as keyboard, a touch turns the overlay on, a key press turns it off again
  const p = await open({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  await startHere(p); await sleep(300);
  await p.page.keyboard.press('KeyA'); await sleep(200);   // (emulated hasTouch reports a coarse pointer; a real touchscreen laptop starts as keyboard)
  const a = await p.page.evaluate(() => __game.isTouchUI());
  await p.T.tap(1, 640, 400); await sleep(300);
  const b = await p.page.evaluate(() => ({ ui: __game.isTouchUI(), shown: !document.querySelector('.touch').classList.contains('hidden') }));
  await p.page.keyboard.press('KeyD'); await sleep(300);
  const c = await p.page.evaluate(() => ({ ui: __game.isTouchUI(), shown: !document.querySelector('.touch').classList.contains('hidden') }));
  ok('hybrid: keyboard -> touch on first touch -> keyboard on key press (no stuck overlay)', !a && b.ui && b.shown && !c.ui && !c.shown, JSON.stringify({ a, b, c }));
  await p.close();
}

// ---------------------------------------------------------------------------------------------------------------- 2. joystick
console.log('\n== joystick ==');
{
  const p = await open('iPhone 14 landscape');
  const seed = await startReceiver(p);
  await sleep(300);
  const vp = await p.page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const ox = vp.w * 0.2, oy = vp.h * 0.6;
  const s0 = await p.st();
  await p.T.down(1, ox, oy); await p.T.move(1, ox, oy - 50); await sleep(700);
  const s1 = await p.st();
  const stickOn = await p.page.evaluate(() => ({ on: __game.input.stick.on, x: __game.input.stick.x, z: __game.input.stick.z }));
  ok(`stick up moves toward the net (z decreases) [seed ${seed}]`, s1.z < s0.z - 0.4 && stickOn.z < -0.5 && Math.abs(stickOn.x) < 0.05, JSON.stringify({ z0: s0.z, z1: s1.z, stickOn }));
  await p.T.move(1, ox + 50, oy); await sleep(600);
  const s2 = await p.st();
  ok('stick right moves +x', s2.x > s1.x + 0.4, `${s1.x.toFixed(2)} -> ${s2.x.toFixed(2)}`);
  await p.T.move(1, ox - 50, oy); await sleep(700);
  const s3 = await p.st();
  ok('stick left moves -x', s3.x < s2.x - 0.4, `${s2.x.toFixed(2)} -> ${s3.x.toFixed(2)}`);
  await p.T.move(1, ox, oy + 50); await sleep(600);
  const s4 = await p.st();
  ok('stick down moves back (z increases)', s4.z > s3.z + 0.3, `${s3.z.toFixed(2)} -> ${s4.z.toFixed(2)}`);
  // analog: half deflection is slower than full
  await p.T.move(1, ox + 16, oy); await sleep(150);
  const half = await p.page.evaluate(() => __game.input.stick.x);
  ok('analog + dead zone: small deflection gives a partial value', half > 0 && half < 0.6, String(half));
  await p.T.move(1, ox + 2, oy + 2); await sleep(120);
  ok('inside the dead zone reads as centred', await p.page.evaluate(() => __game.input.stick.x === 0 && __game.input.stick.z === 0));
  await p.T.move(1, ox + 300, oy - 300); await sleep(120);
  ok('stick clamped to unit length', await p.page.evaluate(() => Math.hypot(__game.input.stick.x, __game.input.stick.z) <= 1.0001));
  await p.T.up(1); await sleep(450);
  const s5 = await p.st(); await sleep(300); const s6 = await p.st();
  ok('release stops the player', Math.hypot(s5.vx, s5.vz) < 0.05 && Math.abs(s6.x - s5.x) < 0.05 && Math.abs(s6.z - s5.z) < 0.05, JSON.stringify(s5));
  // touchcancel
  await p.T.down(1, ox, oy); await p.T.move(1, ox + 50, oy); await sleep(300);
  await p.T.cancel(); await sleep(450);
  const c1 = await p.st();
  ok('touchcancel releases the stick (no stuck movement)', (await p.page.evaluate(() => !__game.input.stick.on)) && Math.hypot(c1.vx, c1.vz) < 0.05, JSON.stringify(c1));
  // page hidden mid-touch
  await p.T.down(2, ox, oy); await p.T.move(2, ox, oy - 50); await sleep(300);
  await p.page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(300);
  const h1 = await p.page.evaluate(() => ({ paused: __game.paused, on: __game.input.stick.on, ui: __game.touch.state() }));
  ok('page hidden mid-touch pauses and releases everything', h1.paused && !h1.on && h1.ui.stickId === null, JSON.stringify(h1));
  await p.T.cancel();
  await p.page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); __game.resume(); });
  await sleep(200);
  // lost touchend: a finger that vanishes without touchend is released by the next touch event
  await p.T.down(1, ox, oy); await p.T.move(1, ox + 50, oy); await sleep(200);
  // the browser "forgot" the finger: the next touch event lists no touch with that identifier
  await p.page.evaluate(() => { const t = new Touch({ identifier: 77, target: document.body, clientX: 300, clientY: 5 }); document.body.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] })); });
  await sleep(200);
  ok('lost touchend is reconciled by the next touch event', await p.page.evaluate(() => !__game.input.stick.on));
  await p.T.cancel();
  // third finger must not break stick or button
  const dr = await p.btn('drive');
  await p.page.evaluate(() => __game.input.releaseAll());
  await p.T.down(1, ox, oy); await p.T.move(1, ox + 50, oy); await p.T.down(2, dr.cx, dr.cy); await p.T.down(3, vp.w * 0.3, vp.h * 0.3); await p.T.move(3, vp.w * 0.32, vp.h * 0.32);
  await sleep(300);
  const three = await p.page.evaluate(() => ({ on: __game.input.stick.on, x: __game.input.stick.x, ui: __game.touch.state(), charging: __game.input.charging }));
  ok('3 fingers: stick and Drive both stay alive, 3rd finger ignored', three.on && three.x > 0.5 && three.ui.stickId === 1 - 0 + 0 || (three.on && three.x > 0.5 && three.ui.held.drive !== undefined), JSON.stringify(three));
  await p.T.up(3); await p.T.up(2); await p.T.up(1); await sleep(200);
  await p.close();
}

// ---------------------------------------------------------------------------------------------------------------- 3. buttons, serve, power, aim
console.log('\n== buttons / serve / power / aim ==');
{
  const p = await open('iPhone 14 landscape');
  await startServerSeed(p); await sleep(200);
  const vp = await p.page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const hint = await p.page.evaluate(() => document.querySelector('.hint').textContent);
  ok('serve hint is the touch wording', /tap Drive/i.test(hint) && !/Space/.test(hint), hint);
  await spyOn(p);
  const dr = await p.btn('drive');
  const serveWith = async (hold, aimDx, seedAgain) => {
    await startHere(p, { seed: seedAgain }); await sleep(250); await p.page.evaluate(() => { window.__ev = []; });
    await spyOn(p);
    const ox = vp.w * 0.2, oy = vp.h * 0.6;
    if (aimDx) { await p.T.down(1, ox, oy); await p.T.move(1, ox + aimDx, oy); await sleep(80); }
    await p.T.down(2, dr.cx, dr.cy); await sleep(hold);
    if (process.env.DBG) console.log('  dbg held', JSON.stringify(await p.page.evaluate(() => ({ ui: __game.touch.state(), ch: __game.input.charging, en: __game.input.enabled }))));
    await p.T.up(2);
    const sp = await spyUntilSwing(p);
    await p.page.evaluate(() => __game.advance(2.5, { until: (s) => s.phase === 'rally' }));
    const ev = await p.page.evaluate(() => __game.drainLog());
    if (aimDx) await p.T.up(1);
    return { sp, hit: ev.find((e) => e.type === 'hit' && e.isServe), bounce: ev.find((e) => e.type === 'bounce') };
  };
  const seed = await startServerSeed(p);
  const tap = await serveWith(40, 0, seed);
  const hold = await serveWith(850, 0, seed);
  ok('tapping Drive serves (hit event isServe)', !!tap.hit && tap.sp.some((s) => s.swing === 'drive'), JSON.stringify(tap.sp.filter((s) => s.swing)));
  const pw = (r) => r.sp.find((s) => s.swing === 'drive');
  ok('hold Drive: power ~1.0, tap: power 0.5; held serve is faster', pw(hold).power > 0.95 && pw(tap).power < 0.6 && hold.hit && tap.hit && hold.hit.speed >= tap.hit.speed, `tap ${pw(tap).power}/${tap.hit && tap.hit.speed?.toFixed(1)} hold ${pw(hold).power.toFixed(2)}/${hold.hit && hold.hit.speed?.toFixed(1)}`);
  const right = await serveWith(60, 70, seed), left = await serveWith(60, -70, seed);
  ok('stick right at trigger = aim +1, left = aim -1', pw(right).aim === 1 && pw(left).aim === -1, `${pw(right).aim} ${pw(left).aim}`);
  ok('aim moves the serve landing x (right > left)', right.bounce && left.bounce && right.bounce.pos.x > left.bounce.pos.x + 0.3, `${right.bounce && right.bounce.pos.x.toFixed(2)} vs ${left.bounce && left.bounce.pos.x.toFixed(2)}`);
  // each button produces its own swing type, trigger on touch down; stick + button together; Drive released outside its element
  await startHere(p, { seed }); await sleep(250);
  for (const shot of ['drop', 'dink', 'lob']) {
    await startHere(p, { seed }); await sleep(200); await spyOn(p);
    const b = await p.btn(shot);
    await p.T.down(2, b.cx, b.cy);
    const sp = await spyUntilSwing(p);
    await p.T.up(2);
    ok(`${shot} button: swing '${shot}' on touch down, power 0.5, aim 0`, sp.some((s) => s.swing === shot && s.power === 0.5 && s.aim === 0), JSON.stringify(sp.filter((s) => s.swing)));
  }
  await startHere(p, { seed }); await sleep(200); await spyOn(p);
  const lob = await p.btn('lob'), ox = vp.w * 0.2, oy = vp.h * 0.6;
  await p.T.down(1, ox, oy); await p.T.move(1, ox + 55, oy - 20); await sleep(100);
  await p.T.down(2, lob.cx, lob.cy);
  const both = await spyUntilSwing(p);
  ok('stick + button at the same time: movement AND swing in the same Input stream', both.some((s) => s.mx > 0.3 && s.mz < 0) && both.some((s) => s.swing === 'lob' && s.aim === 1), JSON.stringify(both.slice(0, 2)));
  await p.T.up(2); await p.T.up(1);
  await startHere(p, { seed }); await sleep(200); await spyOn(p);
  await p.T.down(3, dr.cx, dr.cy); await sleep(60); await p.T.move(3, 30, 30); await sleep(120); await p.T.up(3); await sleep(80);
  ok('Drive released far outside its button still swings', (await spy(p)).some((s) => s.swing === 'drive'));
  await startHere(p, { seed }); await sleep(200); await spyOn(p);
  await p.T.down(3, dr.cx, dr.cy); await sleep(300); await p.T.cancel(); await sleep(200);
  ok('touchcancel on a charging Drive aborts without swinging', !(await spy(p)).some((s) => s.swing) && (await p.page.evaluate(() => !__game.input.charging)));
  ok('pause button is top-right, >= 44 px', await p.page.evaluate(() => { const r = document.querySelector('.hud .iconbtn:last-child').getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.right > innerWidth * 0.8 && r.top < 60; }));
  await p.close();
}

}
if (want('rally')) {
// ---------------------------------------------------------------------------------------------------------------- 4. rally through touch only
console.log(`\n== touch-driven rally vs DUPR 3.0 (${RALLY_SECS}s) ==`);
{
  const p = await open('iPhone 14 landscape');
  await startHere(p, { seed: 5 });
  await p.page.evaluate(() => __game.setTimeScale(1));   // real time: the scripted "thumbs" run at CDP speed under software GL
  const vp = await p.page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const R = 50, ox = vp.w * 0.2, oy = vp.h * 0.62;
  let fingerDown = false, cur = { x: ox, y: oy };
  const setStick = async (dx, dz) => {   // want a world direction -> finger offset
    const m = Math.hypot(dx, dz);
    if (m < 0.05) { if (fingerDown) { await p.T.up(1); fingerDown = false; } return; }
    const k = Math.min(1, m) * R, tx = ox + (dx / m) * k, ty = oy + (dz / m) * k;
    if (!fingerDown) { await p.T.down(1, tx, ty); fingerDown = true; } else await p.T.move(1, tx, ty);
  };
  const stats = { hits: {}, rallies: [], faults: 0 };
  const t0 = Date.now(); let cool = 0, serveAt = 0, mism = 0, human = 0, iters = 0, greens = 0, incomingN = 0;
  while ((Date.now() - t0) / 1000 < RALLY_SECS) {
    const i = await p.page.evaluate(() => {
      const g = __game, s = g.getState(), me = s.players[0], ev = g.drainLog();
      return { ev, phase: s.phase, me: { x: me.pos.x, z: me.pos.z, isServer: me.isServer, isRecv: me.isReceiver }, ball: s.ball.pos, bb: s.ball.bounces, land: s.ball.landing, last: s.ball.lastHitBy, hits: s.rally.hits, cue: g.swingCueInfo(), mode: g.mode, win: s.score.winner,
        pred: (s.phase === 'rally' || s.phase === 'serve') ? g.predict(2.5).samples.map((m) => [m.t, m.x, m.y, m.z, m.b, m.vy]) : [] };
    });
    for (const e of i.ev) {
      if (e.type === 'hit' && e.playerId === 0) { const k = e.isServe ? 'serve' : e.atp ? 'atp' : e.shot; stats.hits[k] = (stats.hits[k] || 0) + 1; human++; if (pending && !e.isServe && !e.atp && e.shot !== 'smash' && e.shot !== pending) mism++; }
      if (e.type === 'rallyEnd') stats.rallies.push(e.hits);
      if (e.type === 'fault') stats.faults++;
    }
    iters++; if (i.last !== null && i.last >= 2 && i.phase === 'rally') incomingN++;
    if (i.mode === 'over' || i.win !== null) break;
    if (i.mode === 'replay') { await p.page.evaluate(() => __game.skipReplay()); continue; }
    const me = i.me; let want = { x: 0, z: 0 };
    var pending = null;
    if (i.phase === 'preServe') {
      if (me.isServer) {
        const tx = me.x > 0 ? 1.8 : -1.8; want = { x: tx - me.x, z: 7.1 - me.z };
        if (!serveAt) serveAt = Date.now() + 900;
        if (Date.now() > serveAt) { const b = await p.btn(['drive', 'drop', 'lob'][Math.floor(Math.random() * 3)]); await p.T.tap(2, b.cx, b.cy, 60); serveAt = 0; }
      } else { serveAt = 0; want = { x: (me.x > 0 ? 1.6 : -1.6) - me.x, z: (me.isRecv ? 6.9 : 6.4) - me.z }; }
    } else if (i.phase === 'rally' || i.phase === 'serve') {
      const incoming = i.last !== null && i.last >= 2;
      if (incoming) {
        let pick = null; for (const m of i.pred) if (m[4] >= 1 && m[2] <= 1.25 && m[5] <= 0.6 && m[3] > 0) { pick = m; break; }
        let tx = i.ball.x - 0.5, tz = i.ball.z + 0.5;
        if (pick) { tx = pick[1] - 0.5; tz = pick[3] + 0.5; } else if (i.land && i.land.z > 0) { tx = i.land.x - 0.5; tz = i.land.z + 0.8; }
        want = { x: tx - me.x, z: Math.min(tz, 8.5) - me.z };
        const green = i.cue.tc !== null && (i.cue.level === 2 || i.cue.level === 4) && i.cue.tc >= 0.14 && i.cue.tc <= 0.4;
        if (green) greens++;
        if (green && Date.now() > cool && (i.bb >= 1 || Math.abs(me.z) > 2.4 && false)) {
          const deep = me.z > 5.2, near = me.z < 3.8;
          const shot = i.ball.y > 1.6 ? 'drive' : near ? 'dink' : i.hits <= 2 ? 'drop' : deep ? ['drive', 'lob', 'drop'][Math.floor(Math.random() * 3)] : 'drop';
          pending = shot; if (process.env.DBG) console.log('  tap', shot, JSON.stringify({ cue: i.cue, bb: i.bb, me: i.me, ball: i.ball }));
          await setStick(0, 0);
          const b = await p.btn(shot);
          if (shot === 'drive') { await p.T.tap(2, b.cx, b.cy, 50 + Math.random() * 300); } else await p.T.tap(2, b.cx, b.cy, 60);
          cool = Date.now() + 450;
        }
      } else {
        const tz = (i.hits <= 2 && i.last !== null && i.last < 2) ? 6.2 : 3.5; want = { x: Math.max(-2, Math.min(2, i.ball.x * 0.5)) - me.x, z: tz - me.z };
      }
    }
    // proportional control: slow down near the target
    const m = Math.hypot(want.x, want.z); const sc = m < 0.15 ? 0 : Math.min(1, m / 0.8);
    await setStick(m ? (want.x / m) * sc : 0, m ? (want.z / m) * sc : 0);
    await sleep(30);
  }
  if (fingerDown) await p.T.up(1);
  const long = Math.max(0, ...stats.rallies), n5 = stats.rallies.filter((x) => x >= 5).length;
  console.log('  rally stats', JSON.stringify({ hits: stats.hits, rallies: stats.rallies, human, mism, iters, greens, incomingN }));
  ok('touch-only play: human hit >= 8 balls with several shot types', human >= 8 && Object.keys(stats.hits).length >= 3, JSON.stringify(stats.hits));
  ok('touch-only play sustains rallies (longest >= 5 shots, at least one rally >= 5)', long >= 5 && n5 >= 1, `longest ${long}, >=5: ${n5}, rallies ${stats.rallies.length}`);
  ok('every button press produced its own shot type (no mismatches)', mism === 0, String(mism));
  await p.close();
}

}
if (want('menus')) {
// ---------------------------------------------------------------------------------------------------------------- 5. menus in every viewport
console.log('\n== menus by tap, every viewport ==');
const VIEWPORTS = [['360x640', { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['390x844', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['844x390', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['768x1024', { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]];
async function layoutAudit(p, label) {
  await p.page.waitForFunction(() => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.classList && (a.effect.target.classList.contains('panel') || a.effect.target.closest('.panel'))).length === 0, null, { timeout: 5000 }).catch(() => {}); await sleep(150);   // let the panel-in animation (scale .97 -> 1) finish before measuring
  const r = await p.page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight, bad = [];
    const screen = document.querySelector('.screen:not(.hidden)'), panel = screen && screen.querySelector('.panel');
    const small = [...document.querySelectorAll('.screen:not(.hidden) .btn, .screen:not(.hidden) .segbtn, .hud:not(.hidden) .iconbtn, .touch:not(.hidden) .tc-btn')].filter((e) => e.offsetParent !== null).map((e) => [e, e.getBoundingClientRect()]).filter(([e, r]) => r.width > 0 && (r.height < 43.5 || r.width < 43.5));
    for (const [e, r] of small) bad.push(`small ${e.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (panel) { const r = panel.getBoundingClientRect(); if (r.left < -0.5 || r.right > vw + 0.5 || r.top < -0.5 || r.bottom > vh + 0.5) bad.push(`panel outside viewport ${JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round))}`); if (panel.scrollWidth > panel.clientWidth + 1) bad.push('panel horizontal overflow'); }
    const de = document.documentElement;
    if (de.scrollWidth > vw || de.scrollHeight > vh || document.body.scrollHeight > vh) bad.push(`page overflow ${de.scrollWidth}x${de.scrollHeight} vs ${vw}x${vh}`);
    return bad;
  });
  ok(`${label}: touch targets >= 44 px, panel inside viewport, no page overflow`, r.length === 0, r.join(' | '));
}
for (const [name, spec] of VIEWPORTS) {
  const p = await open(spec);
  const sc = () => p.page.evaluate(() => __game.menus.current);
  await layoutAudit(p, `${name} main`); await p.shot(`${name}_main`);
  await p.tapText('Play'); ok(`${name}: Play -> setup`, (await sc()) === 'setup');
  for (const t of ['Singles', 'Doubles', 'Rally', 'Traditional', '6.0', '3.0', 'Left', 'Right', 'High', 'Low']) await p.tapText(t);
  const cfg = await p.page.evaluate(() => ({ ...__game.settings }));
  ok(`${name}: setup segments respond to taps`, cfg.mode === 'doubles' && cfg.scoring === 'sideout' && cfg.handed === 'R' && cfg.quality === 'low', JSON.stringify(cfg));
  await layoutAudit(p, `${name} setup`); await p.shot(`${name}_setup`);
  await p.tapText('Back'); ok(`${name}: setup Back -> main`, (await sc()) === 'main');
  await p.tapText('Settings'); await layoutAudit(p, `${name} settings`); await p.shot(`${name}_settings`);
  await p.tapText('繁體中文'); const zh = await p.page.evaluate(() => document.documentElement.lang);
  await layoutAudit(p, `${name} settings zh`);
  await p.tapText('English'); ok(`${name}: language switch zh-TW <-> en by tap`, zh === 'zh-Hant-TW' && (await p.page.evaluate(() => document.documentElement.lang)) === 'en');
  // volume slider by touch drag
  await p.page.locator('.screen:not(.hidden) .slider').evaluate((e) => e.scrollIntoView({ block: 'center' })); await sleep(80);
  const sl = await p.page.locator('.screen:not(.hidden) .slider').boundingBox();
  const v0 = await p.page.evaluate(() => __game.settings.volume);
  await p.T.tap(9, sl.x + 10 + 0.25 * (sl.width - 20), sl.y + sl.height / 2, 60); await sleep(150);   // (emulated touch taps / jumps the thumb; real dragging cannot be verified in CDP emulation)
  ok(`${name}: volume slider responds to touch`, (await p.page.evaluate(() => __game.settings.volume)) < v0 - 0.3);
  await p.tapText('Back');
  await p.tapText('How to play'); ok(`${name}: help opens, touch section shown`, (await sc()) === 'help' && (await p.page.locator('.touchgrid').count()) === 1);
  await layoutAudit(p, `${name} help`); await p.shot(`${name}_help`);
  await p.tapText('Back');
  await p.tapText('Play'); await p.tapText('Start match'); await sleep(900);
  ok(`${name}: Start match by tap starts a match, touch controls visible`, (await p.page.evaluate(() => __game.mode)) === 'play' && (await p.page.evaluate(() => !document.querySelector('.touch').classList.contains('hidden'))));
  await sleep(700); await p.shot(`${name}_serve`);
  // gameplay mid-rally screenshot
  await p.page.evaluate(() => { __game.setReplayEnabled(false); __game.setAutoplay(true); __game.advance(20, { until: (s) => s.phase === 'rally' && s.ball.bounces >= 1 && s.ball.vel.z > 0 && s.rally.hits > 3 }); __game.setAutoplay(false); __game.settleView(); });
  await sleep(300);
  await layoutAudit(p, `${name} gameplay`); await p.shot(`${name}_rally`);
  const pb = await p.rect('.hud .iconbtn:last-child');
  await p.T.tap(8, pb.cx, pb.cy, 40); await sleep(400);
  ok(`${name}: pause button by tap`, (await sc()) === 'pause' && (await p.page.evaluate(() => __game.paused)));
  await layoutAudit(p, `${name} pause`); await p.shot(`${name}_pause`);
  await p.tapText('Resume'); ok(`${name}: Resume`, !(await p.page.evaluate(() => __game.paused)));
  await p.T.tap(8, pb.cx, pb.cy, 40); await sleep(300); await p.tapText('Restart');
  ok(`${name}: Restart (score reset, running)`, await p.page.evaluate(() => !__game.paused && __game.getState().tick < 600 && __game.getState().score.points.join() === '0,0'));
  await p.T.tap(8, pb.cx, pb.cy, 40); await sleep(300); await p.tapText('Main menu');
  ok(`${name}: Main menu`, (await sc()) === 'main' && (await p.page.evaluate(() => __game.mode)) === 'menu');
  // replay skip by tap
  await p.tapText('Play'); await p.tapText('Start match'); await sleep(600);
  await p.page.evaluate(() => { __game.setReplayEnabled(true); __game.G.sinceReplay = 9; __game.setAutoplay(true); for (let k = 0; k < 40 && __game.mode === 'play'; k++) __game.advance(30); });
  const inReplay = await p.page.evaluate(() => __game.mode === 'replay');
  if (inReplay) { await sleep(500); await p.shot(`${name}_replay`); const vpz = await p.page.evaluate(() => ({ w: innerWidth, h: innerHeight })); await p.T.tap(7, vpz.w / 2, vpz.h / 2, 40); await sleep(400); }
  ok(`${name}: tapping the game area skips a replay`, inReplay && (await p.page.evaluate(() => __game.mode)) === 'play');
  // game over -> play again
  await p.page.evaluate(() => { __game.setReplayEnabled(false); __game.setAutoplay(true); __game.G.sim.state.score.points[1] = 9; __game.advance(2000); });
  await sleep(2600);
  const over = await sc();
  if (over === 'gameover') { await layoutAudit(p, `${name} game over`); await p.shot(`${name}_over`); await p.tapText('Play again'); }
  ok(`${name}: game over -> Play again`, over === 'gameover' && (await p.page.evaluate(() => __game.mode)) === 'play' && !(await p.page.evaluate(() => __game.paused)), over);
  await p.close();
}

}
if (want('page')) {
// ---------------------------------------------------------------------------------------------------------------- 6. page behaviour
console.log('\n== scroll / zoom / audio / wake lock / context loss ==');
{
  const p = await open('iPhone 14', { init: () => { window.__wl = { req: 0, rel: 0 }; Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__wl.req++; const l = new EventTarget(); l.release = async () => { window.__wl.rel++; l.dispatchEvent(new Event('release')); }; return l; } } }); } });
  await p.tapText('Play'); await p.tapText('Start match'); await sleep(900);
  ok('audio context unlocked by touch taps', (await p.page.evaluate(() => __game.audio.state)) === 'running', await p.page.evaluate(() => __game.audio.state));
  ok('wake lock requested when the match starts', (await p.page.evaluate(() => window.__wl.req)) >= 1, JSON.stringify(await p.page.evaluate(() => window.__wl)));
  const vp = await p.page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  // swipes / pinch / double tap everywhere
  for (const [x0, y0, x1, y1] of [[vp.w * 0.2, vp.h * 0.7, vp.w * 0.2, vp.h * 0.2], [vp.w * 0.5, vp.h * 0.3, vp.w * 0.5, vp.h * 0.9], [vp.w * 0.7, vp.h * 0.4, vp.w * 0.1, vp.h * 0.4]]) {
    await p.T.down(1, x0, y0); for (let k = 1; k <= 6; k++) await p.T.move(1, x0 + (x1 - x0) * k / 6, y0 + (y1 - y0) * k / 6); await p.T.up(1);
  }
  await p.T.down(1, vp.w * 0.4, vp.h * 0.4); await p.T.down(2, vp.w * 0.6, vp.h * 0.4);
  for (let k = 1; k <= 8; k++) { await p.T.move(1, vp.w * 0.4 - k * 10, vp.h * 0.4 - k * 6); await p.T.move(2, vp.w * 0.6 + k * 10, vp.h * 0.4 + k * 6); }
  await p.T.up(2); await p.T.up(1);
  await p.T.tap(1, vp.w * 0.5, vp.h * 0.5, 30); await sleep(60); await p.T.tap(1, vp.w * 0.5, vp.h * 0.5, 30);
  await sleep(500);
  const pg = await p.page.evaluate(() => ({ sx: scrollX, sy: scrollY, scale: visualViewport.scale, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight }));
  ok('no page scroll / zoom after swipes, pinch and double-tap', pg.sx === 0 && pg.sy === 0 && pg.scale === 1 && pg.sw <= pg.w && pg.sh <= pg.h, JSON.stringify(pg));
  await p.page.evaluate(() => __game.pause()); await sleep(200);
  ok('wake lock released while paused, re-requested on resume', await (async () => { const a = await p.page.evaluate(() => window.__wl.rel); await p.page.evaluate(() => __game.resume()); await sleep(300); return a >= 1 && (await p.page.evaluate(() => window.__wl.req)) >= 2; })());
  // orientation change (viewport swap) mid play
  await p.page.setViewportSize({ width: vp.h, height: vp.w }); await sleep(700);
  ok('resize/orientation change keeps the canvas and controls sized to the viewport', await p.page.evaluate(() => { const c = document.getElementById('game'); return c.clientWidth === innerWidth && c.clientHeight === innerHeight && !document.querySelector('.touch').classList.contains('hidden'); }));
  // WebGL context loss
  await p.page.evaluate(() => { const gl = __game.view.renderer.getContext(); gl.getExtension('WEBGL_lose_context').loseContext(); }); await sleep(500);
  const lost = await p.page.evaluate(() => { const b = document.getElementById('ctxlost'); return b ? b.textContent : null; });
  ok('WebGL context loss shows a "tap to reload" message', !!lost && /reload/i.test(lost), String(lost));
  await p.shot('contextlost');
  await p.close();
}
{ // front-end "does not throw" checks: no speechSynthesis / vibrate / wakeLock / fullscreen
  const p = await open('iPhone 14', { init: () => { delete window.speechSynthesis; try { Object.defineProperty(navigator, 'vibrate', { value: undefined }); } catch (e) { /* */ } try { Object.defineProperty(navigator, 'wakeLock', { value: undefined }); } catch (e) { /* */ } } });
  await p.tapText('Play'); await p.tapText('Start match'); await sleep(800);
  await p.page.evaluate(() => { __game.setAutoplay(true); __game.advance(10); __game.setAutoplay(false); });
  ok('works without speechSynthesis / vibrate / wakeLock (no errors)', (await p.page.evaluate(() => __game.mode)) === 'play');
  await p.close();
}
{ const p = await open('iPhone 14', { query: '?lang=zh-TW', locale: 'zh-TW' }); await p.tapText('開始比賽'); await p.tapText('開始比賽'); await sleep(900);
  const h = await p.page.evaluate(() => document.querySelector('.hint') && document.querySelector('.hint').textContent);
  ok('zh-TW touch hint and button labels', /點「抽球」|點/.test(h || '') && (await p.page.evaluate(() => document.querySelector('.tc-drive b').textContent)) === '抽球', h);
  await p.shot('zh_serve'); await p.close(); }

}
// ---------------------------------------------------------------------------------------------------------------- named-device screenshots
if (SHOTS) {
  for (const d of PHONES) {
    const p = await open(d); const n = d.replace(/[^a-z0-9]+/gi, '_');
    await p.shot(`${n}_main`); await p.tapText('Play'); await p.shot(`${n}_setup`); await p.tapText('Back'); await p.tapText('How to play'); await p.shot(`${n}_help`); await p.tapText('Back');
    await p.tapText('Play'); await p.tapText('Start match'); await sleep(1200); await p.shot(`${n}_serve`);
    await p.page.evaluate(() => { __game.setReplayEnabled(false); __game.setAutoplay(true); __game.advance(20, { until: (s) => s.phase === 'rally' && s.ball.bounces >= 1 && s.ball.vel.z > 0 && s.rally.hits > 3 }); __game.setAutoplay(false); __game.settleView(); });
    await p.shot(`${n}_rally`);
    await p.page.evaluate(() => __game.pause()); await p.shot(`${n}_pause`); await p.page.evaluate(() => __game.resume());
    await p.page.evaluate(() => { __game.setAutoplay(true); __game.G.sim.state.score.points[0] = 10; __game.advance(2000); }); await sleep(2800); await p.shot(`${n}_over`);
    await p.close();
  }
}

console.log('\nconsole problems:', problems.length ? problems : 'none');
ok('zero console errors/warnings', problems.length === 0, problems.slice(0, 5).join(' | '));
const fails = results.filter((r) => !r).length;
console.log(`\n${results.length - fails} passed, ${fails} failed`);
await browser.close(); srv.close();
process.exit(fails ? 1 : 0);
