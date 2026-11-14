// Shared helpers for the Playwright playtests: tiny static server + browser launcher + console capture.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

export function startServer(port = 0) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

export async function launch({ width = 1440, height = 900, query = '', log = true, locale = 'zh-TW' } = {}) {
  const { srv, url } = await startServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') { problems.push(`[${t}] ${m.text()}`); if (log) console.log(`[console.${t}]`, m.text()); } });
  page.on('pageerror', (e) => { problems.push(`[pageerror] ${e.message}`); if (log) console.log('[pageerror]', e.message); });
  page.on('requestfailed', (r) => { problems.push(`[requestfailed] ${r.url()}`); if (log) console.log('[requestfailed]', r.url()); });
  await page.goto(url + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.sim, null, { timeout: 30000 });
  return { page, browser, srv, url, problems, close: async () => { await browser.close(); srv.close(); } };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
