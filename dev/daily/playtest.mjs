// Playwright playtest of the daily challenge at phone size, with real pointer drags.
//   node dev/daily/playtest.mjs [--shots=<dir>] [--url=<page url>]
// 1. opens each of the 20 challenges in practice and plays the solver's shot with a real drag (expects a high score)
// 2. plays a full day (5 stages), checks the result sheet, share text, and that a reload cannot retry
// 3. checks English, the list screen and that there are no console errors
import { startServer } from '../playtest/lib.mjs';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const shots = arg('shots'); if (shots) fs.mkdirSync(shots, { recursive: true });
const { srv, url } = await startServer();
const base = arg('url') || `${url}daily/`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'zh-TW', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall|ReadPixels|swiftshader|Automatic fallback to software WebGL/i.test(t)) problems.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()}`));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const ready = () => page.waitForFunction(() => window.__daily && window.__daily.cur, null, { timeout: 30000 });
const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
const sep = base.includes('?') ? '&' : '?';

/** Play one ball of the current stage with the solver's shot, through real pointer events. Returns the recorded ball. */
async function playSolved(snapName) {
  const plan = await page.evaluate(() => {
    const d = window.__daily, st = d.cur.st, used = d.run.state.shots[d.run.state.stage].length;
    const ti = st.agg === 'avg' ? Math.min(used, st.targets.length - 1) : 0, sol = st.sols[ti];
    return { si: sol.si, drag: d.solveDrag(sol.power, sol.ang), inc: st.inc ? { ideal: st.inc.ideal } : null, used, key: st.shots[sol.si].key };
  });
  await page.locator('.dc-shots button').nth(plan.si).click();
  // incoming ball: slow the game down so the scripted release lands on the ideal contact (software GL runs at a few frames a second)
  if (plan.inc) await page.evaluate(() => window.__daily.setTimeScale(0.12));
  const sx = 195, sy = 430;
  await page.mouse.move(sx, sy); await page.mouse.down();
  await page.mouse.move(sx + plan.drag.dx / 2, sy + plan.drag.dy / 2, { steps: 3 });
  await page.mouse.move(sx + plan.drag.dx, sy + plan.drag.dy, { steps: 3 });
  await page.waitForTimeout(120);
  if (snapName) await shot(snapName);
  if (plan.inc) await page.waitForFunction((ideal) => { const i = window.__daily.inc; return i && i.tick >= ideal - 1 && i.tick <= ideal + 1; }, plan.inc.ideal, { timeout: 60000, polling: 'raf' });
  await page.mouse.up();
  if (plan.inc) await page.evaluate(() => window.__daily.setTimeScale(1));
  await page.waitForFunction((n) => { const d = window.__daily; return d.run.state.shots[d.run.state.stage].length > n && (d.mode === 'aim' || d.mode === 'wait'); }, plan.used, { timeout: 20000 });
  return page.evaluate((n) => { const d = window.__daily; return d.run.state.shots[d.run.state.stage][n]; }, plan.used);
}

// ---- 1. every challenge in practice
const ids = await (async () => { await page.goto(base, { waitUntil: 'load' }); await ready(); return page.evaluate(() => [...document.querySelectorAll('.dc-item')].map((e) => e.dataset.id)); })();
await page.evaluate(() => window.__daily.openList());
const listIds = await page.evaluate(() => [...document.querySelectorAll('.dc-item')].map((e) => e.dataset.id));
check(listIds.length === 20, `list screen shows ${listIds.length} challenges`);
await shot('list');
void ids;
for (const id of listIds) {
  await page.goto(`${base}${sep}practice=${id}&seed=pt1&pdb=1`, { waitUntil: 'load' }); await ready();
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => { const d = window.__daily; return { solved: d.cur.st.solved, balls: d.cur.st.balls, agg: d.cur.st.agg, n: d.cur.st.targets.length }; });
  const first = await playSolved(`c-${String(listIds.indexOf(id) + 1).padStart(2, '0')}-${id}`);
  let ok = first.s >= 80, detail = `first ball ${first.s} (${first.k})`;
  if (info.agg === 'avg') { const b2 = await playSolved(), b3 = await playSolved(); detail += `, then ${b2.s}, ${b3.s}`; ok = ok && b2.s >= 80 && b3.s >= 80; }
  check(ok && info.solved >= 95, `${id}: solver ${info.solved}, ${detail}`);
}

// ---- 2. a full day
await page.goto(`${base}${sep}pdb=1`, { waitUntil: 'load' }); await ready();
await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
await page.reload({ waitUntil: 'load' }); await ready();
check(await page.locator('[data-sheet="help"]').count() === 1, 'first visit shows the how-to');
await shot('d-0-howto');
await page.locator('#dc-help-go').click();
const t0 = Date.now();
for (let i = 0; i < 5; i++) {
  await page.waitForFunction((k) => window.__daily.run.state.stage === k && window.__daily.mode === 'aim', i, { timeout: 20000 });
  await page.waitForTimeout(700);
  if (i === 0) {
    // a weak first ball on stage 1, then reload: the ball must still be spent
    await page.mouse.move(195, 430); await page.mouse.down(); await page.mouse.move(195, 470, { steps: 4 }); await page.mouse.up();
    await page.waitForFunction(() => window.__daily.run.state.shots[0].length === 1, null, { timeout: 15000 });
    await page.reload({ waitUntil: 'load' }); await ready();
    const kept = await page.evaluate(() => window.__daily.run.state.shots[0].length);
    check(kept === 1, `reload keeps the spent ball (balls used on stage 1 after reload: ${kept})`);
    check(await page.locator('[data-sheet="help"]').count() === 0, 'how-to is not shown again');
    await page.waitForTimeout(700);
  }
  await shot(`d-${i + 1}-stage`);
  const info = await page.evaluate(() => ({ agg: window.__daily.cur.st.agg, balls: window.__daily.cur.st.balls, id: window.__daily.cur.def.id }));
  let b = await playSolved(`d-${i + 1}-aim`);
  if (info.agg === 'avg') { await playSolved(); await playSolved(); }
  console.log(`     stage ${i + 1} ${info.id}: ${b.s} (${b.k})`);
  const over = await page.evaluate(() => window.__daily.mode === 'wait');
  if (!over) await page.locator('.dc-next').click();
}
await page.waitForSelector('[data-sheet="result"]', { timeout: 20000 });
console.log(`     day played in ${((Date.now() - t0) / 1000).toFixed(0)} s (scripted)`);
await page.waitForTimeout(500);
await shot('d-6-result');
const share = await page.locator('#dc-share').inputValue();
console.log(share.split('\n').map((l) => `     | ${l}`).join('\n'));
check(/#\d+\s+\d+\/500/.test(share) && /[🟢🟡🟠⚫]{5}/u.test(share) && /\d/.test(share.split('\n')[1]), 'share text has day number, total, emoji row and balls used');
const total = await page.evaluate(() => Number(document.querySelector('.dc-big').firstChild.textContent));
check(total >= 350, `scripted day total ${total}/500`);
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
await page.locator('#dc-copy').click(); await page.waitForTimeout(300);
const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
check(clip === share || clip === null, `copy button ${clip === null ? 'ran (clipboard not readable here)' : 'put the share text on the clipboard'}`);
await page.reload({ waitUntil: 'load' }); await ready();
check(await page.locator('[data-sheet="result"]').count() === 1, 'after a reload the finished day shows the result again (no replay)');
const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('pbd-daily.stats')));
check(stats && stats.streak === 1 && stats.best === total, `stats saved: ${JSON.stringify(stats)}`);
// practice does not touch the daily save
const before = await page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('pbd-daily.day.'))));
await page.locator('#dc-to-list').click(); await page.locator('.dc-item').nth(0).click();
await page.waitForFunction(() => window.__daily.run.kind === 'practice' && window.__daily.mode === 'aim'); await page.waitForTimeout(600);
await playSolved();
const after = await page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('pbd-daily.day.'))));
check(before === after, 'practice leaves the daily save unchanged');

// ---- 3. English + list
await page.locator('.dc-top .dc-ib').nth(1).click(); await page.waitForTimeout(200);
const en = await page.evaluate(() => document.querySelector('.dc-card-h b').textContent);
check(/[A-Za-z]/.test(en) && !/[一-鿿]/.test(en), `language toggle: challenge name is "${en}"`);
await page.evaluate(() => window.__daily.openList()); await page.waitForTimeout(300);
await shot('list-en');
check(problems.length === 0, `no console errors or failed requests (${problems.length})`);
for (const p of problems.slice(0, 12)) console.log('    ', p);
await browser.close(); srv.close();
console.log(fails ? `FAILED: ${fails}` : 'ALL OK');
process.exit(fails ? 1 : 0);
