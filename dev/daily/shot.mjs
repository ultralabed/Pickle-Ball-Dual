// Quick look: node dev/daily/shot.mjs <outdir> [practice-id ...]   (phone-size screenshots)
import { startServer } from '../playtest/lib.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2], ids = process.argv.slice(3);
const { srv, url } = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'zh-TW', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (const id of ids.length ? ids : ['']) {
  await page.goto(`${url}daily/?pdb=1${id ? `&practice=${id}&seed=shot` : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__daily && window.__daily.cur, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${id || 'daily'}.png` });
  console.log('shot', id || 'daily');
}
await browser.close(); srv.close();
