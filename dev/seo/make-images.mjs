// Generates the raster images of the site with Playwright:
//   favicon-32.png, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png  (screenshots of favicon.svg)
//   og-image.png (1200x630): a real mid-rally frame from the game + title/tagline overlay
// Usage: node dev/seo/make-images.mjs [icons|og|all]   (needs: playwright with Chromium; no network)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WHAT = process.argv[2] || 'all';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const TMP = process.env.SEO_TMP || fs.mkdtempSync('/tmp/pbd-seo-');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = await new Promise((r) => { const s = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); let f = path.join(u.startsWith('/__tmp/') ? TMP : ROOT, u.replace('/__tmp/', '/'));
  if (f.endsWith('/')) f += 'index.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1', () => r(s)); });
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ARGS });

/** quantise a PNG to <=256 colours (Pillow if present) to keep the OG image small; falls back to the raw PNG */
function shrink(file, colors = 192) {
  try {
    execFileSync('python3', ['-I', '-c', `
from PIL import Image
import sys
im = Image.open(sys.argv[1]).convert('RGB')
im = im.quantize(colors=int(sys.argv[2]), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
im.save(sys.argv[1], optimize=True)
`, file, String(colors)]);
  } catch (e) { console.log('(no Pillow, left', path.basename(file), 'unquantised)'); }
}

if (WHAT === 'icons' || WHAT === 'all') {
  const svg = fs.readFileSync(path.join(ROOT, 'favicon.svg'), 'utf8');
  const maskable = svg.replace(/<rect width="64" height="64" rx="14"/, '<rect width="64" height="64"').replace('<circle cx="32" cy="32" r="22"', '<circle cx="32" cy="32" r="17"')
    .replace(/<g fill="#6a7d0c" opacity=".7">[\s\S]*?<\/g>/, '<g fill="#6a7d0c" opacity=".7" transform="translate(32 32) scale(.77) translate(-32 -32)"><circle cx="24" cy="24" r="3"/><circle cx="37" cy="21" r="3"/><circle cx="31" cy="33" r="3"/><circle cx="43" cy="34" r="3"/><circle cx="22" cy="40" r="3"/><circle cx="34" cy="45" r="3"/></g>');
  const apple = svg.replace(/<rect width="64" height="64" rx="14"/, '<rect width="64" height="64"');
  const jobs = [['favicon-32.png', 32, svg], ['icon-192.png', 192, svg], ['icon-512.png', 512, svg], ['icon-maskable-512.png', 512, maskable], ['apple-touch-icon.png', 180, apple]];
  for (const [name, size, src] of jobs) {
    const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace(/<svg /, `<svg style="display:block;width:${size}px;height:${size}px" `)}</body></html>`);
    await page.screenshot({ path: path.join(ROOT, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await ctx.close();
    console.log('wrote', name, fs.statSync(path.join(ROOT, name)).size, 'bytes');
  }
}

if (WHAT === 'og' || WHAT === 'all') {
  // 1. a real mid-rally frame at exactly 1200x630, HUD and menu hidden
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto(`${origin}/?pdb=1&lang=en`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.sim, null, { timeout: 30000 });
  await page.evaluate(() => __game.startMatch({ mode: 'doubles', scoring: 'sideout', opp: 5, mate: 5, quality: 'high', seed: Number(new URLSearchParams(location.search).get('seed')) || 7, autoplay: true }));
  const want = Number(process.env.OG_RALLY_HITS || 3);
  // fast-forward to a rally in progress, let it play in real time for ~2 s so floating texts from earlier rallies expire, then freeze
  await page.evaluate((want) => { __game.setReplayEnabled(false); __game.advance(60, { until: (s) => s.phase === 'rally' && s.rally.hits >= want && s.ball.pos.y > 0.5 }); }, want);
  await page.waitForTimeout(Number(process.env.OG_WAIT || 2200));
  // frame the court on the right-hand side so the title fits on the left (override = [px,py,pz, tx,ty,tz, fov])
  const cam = (process.env.OG_CAM || '-3.4,5.2,11.4,-3.1,0.4,-1.5,40').split(',').map(Number);
  await page.evaluate((c) => {
    __game.view.setCameraOverride({ position: [c[0], c[1], c[2]], target: [c[3], c[4], c[5]], fov: c[6] });
    document.querySelector('#ui').style.visibility = 'hidden';
  }, cam);
  // freeze the moment the ball is low enough and near the net so it is visible in the frame
  await page.evaluate(() => new Promise((res) => {
    const t0 = performance.now();
    const tick = () => { const s = __game.getState(), b = s.ball.pos; if ((s.phase === 'rally' && b.y > 0.5 && b.y < 1.8 && Math.abs(b.z) < 4.5 && b.z < 1) || performance.now() - t0 > 12000) { __game.freeze(true); res(); } else requestAnimationFrame(tick); };
    tick();
  }));
  await page.waitForTimeout(300);
  const raw = path.join(TMP, 'og-frame.png');
  await page.screenshot({ path: raw });
  console.log('state', await page.evaluate(() => { const s = __game.getState(); return { phase: s.phase, hits: s.rally.hits, ball: s.ball.pos }; }));
  await ctx.close();

  // 2. overlay page (HTML) -> screenshot
  fs.writeFileSync(path.join(TMP, 'og.html'), `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0a1626;font-family:"PingFang TC","SF Pro Display","Noto Sans TC","Helvetica Neue",Arial,sans-serif}
.bg{position:absolute;inset:0;background:url(frame.png) center/cover}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,12,24,.92) 0%,rgba(5,12,24,.78) 34%,rgba(5,12,24,.15) 62%,rgba(5,12,24,0) 78%),linear-gradient(0deg,rgba(5,12,24,.55),rgba(5,12,24,0) 28%)}
.card{position:absolute;left:64px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;color:#f2f7ff}
.logo{display:flex;align-items:center;gap:18px;margin-bottom:14px}
.ball{width:78px;height:78px;border-radius:50%;background:radial-gradient(circle at 34% 30%,#f3ff7a,#d9f23a 45%,#98b81c 100%);box-shadow:0 8px 30px rgba(217,242,58,.5),inset -5px -6px 10px rgba(80,100,0,.35)}
.kicker{font-weight:800;letter-spacing:.34em;font-size:20px;color:#d9f23a}
h1{margin:0;font-size:96px;line-height:.98;font-weight:900;letter-spacing:.01em;text-shadow:0 4px 0 rgba(0,0,0,.35)}
h1 span{color:#d9f23a}
.tag{margin:22px 0 26px;font-size:34px;line-height:1.25;font-weight:700;color:#e6eefb}
.chips{display:flex;gap:12px;flex-wrap:wrap}
.chip{padding:8px 18px;border-radius:999px;border:2px solid rgba(255,255,255,.35);background:rgba(10,22,38,.55);font-size:23px;font-weight:800;color:#f2f7ff}
.chip.l{background:#d9f23a;border-color:#fff;color:#1a2a00}
</style><div class="bg"></div><div class="shade"></div>
<div class="card"><div class="logo"><div class="ball"></div><div class="kicker">3D PICKLEBALL</div></div>
<h1>Pickle Ball<br><span>Dual</span></h1>
<div class="tag">Free in your browser.<br>Singles or doubles vs AI.</div>
<div class="chips"><div class="chip l">No install</div><div class="chip">DUPR 3.0–6.0</div><div class="chip">Real rules</div></div></div>`);
  fs.copyFileSync(raw, path.join(TMP, 'frame.png'));
  const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const p2 = await ctx2.newPage();
  await p2.goto(`${origin}/__tmp/og.html`); await p2.waitForTimeout(300);
  const out = path.join(ROOT, 'og-image.png');
  await p2.screenshot({ path: out });
  await ctx2.close();
  shrink(out);
  console.log('wrote og-image.png', fs.statSync(out).size, 'bytes');
}
await browser.close(); server.close();
