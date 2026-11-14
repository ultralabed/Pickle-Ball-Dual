// Serves the project under a nested URL prefix and checks the game boots (all URLs must be relative).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const PREFIX = '/some/deep/path/pickleball-3d/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (!u.startsWith(PREFIX)) { res.writeHead(404); res.end('outside prefix: ' + u); console.log('404', u); return; }
  u = u.slice(PREFIX.length); if (u === '') u = 'index.html';
  const f = path.join(ROOT, u);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end('nf'); console.log('404', u); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}${PREFIX}`);
await page.waitForFunction(() => window.__game && window.__game.sim, null, { timeout: 30000 });
await page.evaluate(() => __game.startMatch({ quality: 'low', autoplay: true })); await page.waitForTimeout(800);
console.log('boots under nested prefix:', await page.evaluate(() => __game.mode), 'problems:', problems);
await browser.close(); srv.close();
