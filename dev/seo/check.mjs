// Re-runnable SEO / AEO checker.  node dev/seo/check.mjs [--shots=DIR] [--full] [--base=URL]
//  - serves the repo under the sub-path of the canonical base URL (default /Pickle-Ball-Dual/), like GitHub Pages does
//    (missing files -> 404.html with status 404), and maps every absolute canonical/hreflang/sitemap URL onto that server
//  - loads every public page in Chromium: HTTP 200, zero console errors/warnings, every local link/asset exists,
//    metadata (title, description, canonical, hreflang reciprocity, Open Graph/Twitter), JSON-LD parses and only uses
//    real schema.org names, FAQPage JSON-LD == visible Q&A, no hidden text, relative-URL hygiene
//  - sitemap.xml / manifest / robots.txt / llms.txt / images; guide pages readable with JavaScript disabled
//  - the game still boots from index.html and a match can be started; language links switch with the UI language
//  --shots=DIR  also screenshots every page at 1440x900 and 390x844 (full page) and the og-image into DIR
//  --full       also runs npm test, dev/playtest/menus.mjs and dev/playtest/i18n.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BASE_URL, SITE, PAGES, HOME_EN } from './site.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
let BASE = arg('base') || BASE_URL; if (!BASE.endsWith('/')) BASE += '/';
const PREFIX = new URL(BASE).pathname;
const SHOTS = arg('shots');
const FULL = process.argv.includes('--full');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let nPass = 0, nFail = 0;
const failures = [];
const ok = (name, cond, extra = '') => { if (cond) nPass++; else { nFail++; failures.push(name); } console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra); return !!cond; };

// ------------------------------------------------------------------------------------------------ server
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const served = [];                       // { url, status }
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const send = (status, f) => { served.push({ url: u, status }); res.writeHead(status, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(res); };
  const notFound = () => (fs.existsSync(path.join(ROOT, '404.html')) ? send(404, path.join(ROOT, '404.html')) : (served.push({ url: u, status: 404 }), res.writeHead(404), res.end('nf')));
  if (!u.startsWith(PREFIX)) { served.push({ url: u, status: 404 }); res.writeHead(404, { 'content-type': 'text/plain' }); res.end('outside prefix'); return; }
  let rel = u.slice(PREFIX.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  let f = path.join(ROOT, rel);
  if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isDirectory()) { res.writeHead(301, { location: u + '/' }); res.end(); return; }
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || /(^|\/)(\.git|node_modules)\//.test(rel)) return notFound();
  send(200, f);
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const LOCAL = `http://127.0.0.1:${srv.address().port}`;
const LOCAL_BASE = LOCAL + PREFIX;
const toLocal = (u) => (u.startsWith(BASE) ? LOCAL_BASE + u.slice(BASE.length) : u);
const toAbs = (u) => (u.startsWith(LOCAL_BASE) ? BASE + u.slice(LOCAL_BASE.length) : u);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const apiCtx = await browser.newContext();
const get = (u) => apiCtx.request.get(toLocal(u), { maxRedirects: 0 }).catch((e) => ({ status: () => 0, text: async () => String(e), body: async () => Buffer.alloc(0) }));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const pngSize = (rel) => { const b = fs.readFileSync(path.join(ROOT, rel)); return b.readUInt32BE(1) === 0x504e47 || b.slice(1, 4).toString() === 'PNG' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length } : null; };

// ------------------------------------------------------------------------------------------------ expected page list (from PAGES, cross-checked with sitemap.xml)
const pageUrl = (p) => BASE + p;
const expected = [];
for (const p of PAGES) for (const lang of ['en', 'zh']) expected.push({ id: p.id, lang, path: p[lang], url: pageUrl(p[lang]) });
const schema = JSON.parse(read('dev/seo/schemaorg-names.json'));
const SCHEMA_PROPS = new Set(schema.properties), SCHEMA_TYPES = new Set(schema.types);

// ------------------------------------------------------------------------------------------------ sitemap.xml
console.log('\n== sitemap.xml / manifest / robots / llms / images ==');
const sitemapXml = read('sitemap.xml');
{
  const xmlPage = await apiCtx.newPage();
  const parsed = await xmlPage.evaluate((x) => {
    const d = new DOMParser().parseFromString(x, 'application/xml');
    if (d.querySelector('parsererror')) return { error: d.querySelector('parsererror').textContent };
    return { urls: [...d.getElementsByTagName('url')].map((u) => ({ loc: u.getElementsByTagName('loc')[0]?.textContent, lastmod: u.getElementsByTagName('lastmod')[0]?.textContent, alts: [...u.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'link')].map((l) => [l.getAttribute('hreflang'), l.getAttribute('href'), l.getAttribute('rel')]) })) };
  }, sitemapXml);
  await xmlPage.close();
  ok('sitemap.xml is well-formed XML', !parsed.error, parsed.error);
  const urls = parsed.urls || [];
  ok(`sitemap has ${expected.length} urls`, urls.length === expected.length, String(urls.length));
  ok('sitemap locs match the page list exactly', JSON.stringify(urls.map((u) => u.loc).sort()) === JSON.stringify(expected.map((e) => e.url).sort()));
  ok('sitemap lastmod = 2026-11-14 on every url', urls.every((u) => u.lastmod === SITE.lastmod));
  ok('every sitemap url has en + zh-Hant + x-default alternates that are themselves in the sitemap', urls.every((u) => ['en', 'zh-Hant', 'x-default'].every((h) => { const a = u.alts.find((x) => x[0] === h); return a && a[2] === 'alternate' && urls.some((v) => v.loc === a[1]); })));
  let all200 = true; for (const u of urls) { const r = await get(u.loc); if (r.status() !== 200) { all200 = false; console.log('  non-200', u.loc, r.status()); } }
  ok('every sitemap url returns 200 (mapped to the local server)', all200);
  ok('sitemap does not list 404.html or dev/tests paths', !/404\.html|\/dev\/|\/tests\//.test(sitemapXml));
}
{
  let m; try { m = JSON.parse(read('manifest.webmanifest')); } catch (e) { m = null; }
  ok('manifest.webmanifest parses as JSON', !!m);
  if (m) {
    ok('manifest has name/short_name/start_url/display/icons/theme_color/background_color', ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color'].every((k) => m[k]));
    ok('manifest start_url and scope are relative', !/^(https?:)?\/\//.test(m.start_url) && !m.start_url.startsWith('/') && !(m.scope || '').startsWith('/'));
    let iconsOk = true;
    for (const ic of m.icons) { const r = await get(LOCAL_BASE + ic.src); const sz = ic.src.endsWith('.png') ? pngSize(ic.src) : null; const want = ic.sizes === 'any' ? null : Number(ic.sizes.split('x')[0]); if (r.status() !== 200 || (sz && (sz.w !== want || sz.h !== want))) { iconsOk = false; console.log('  bad icon', ic.src, r.status(), sz); } }
    ok('manifest icons exist and have the declared size', iconsOk);
    ok('manifest has 192 and 512 icons and a maskable one', [192, 512].every((n) => m.icons.some((i) => i.sizes === `${n}x${n}` && /any/.test(i.purpose))) && m.icons.some((i) => /maskable/.test(i.purpose)));
  }
  const og = pngSize(SITE.ogImage);
  ok('og-image.png is exactly 1200x630', og && og.w === 1200 && og.h === 630, JSON.stringify(og));
  ok('og-image.png < 400 KB', og && og.bytes < 400 * 1024, String(og && og.bytes));
  for (const [f, n] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['favicon-32.png', 32]]) { const s = pngSize(f); ok(`${f} is ${n}x${n}`, s && s.w === n && s.h === n, JSON.stringify(s)); }
  ok('favicon.svg is valid SVG', /^<svg[\s\S]*<\/svg>\s*$/.test(read('favicon.svg').trim()));
}
{
  const robots = read('robots.txt');
  const bots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot'];
  ok('robots.txt lists every AI crawler explicitly', bots.every((b) => new RegExp(`^User-agent: ${b}$`, 'm').test(robots)), bots.filter((b) => !robots.includes(b)).join(','));
  ok('robots.txt allows all and disallows /dev/ /tests/ /node_modules/', /^Allow: \/$/m.test(robots) && ['/dev/', '/tests/', '/node_modules/'].every((d) => new RegExp(`^Disallow: ${d}$`, 'm').test(robots)));
  ok('robots.txt points at the sitemap', robots.includes(`Sitemap: ${BASE}sitemap.xml`));
  ok('robots.txt never disallows the whole site or the guide pages', !/^Disallow: \/\s*$/m.test(robots) && !/^Disallow: .*(how-to-play|rules|faq|zh-tw)/m.test(robots));
  const llms = read('llms.txt');
  ok('llms.txt is markdown: H1, blockquote summary, H2 sections', /^# Pickle Ball Dual/.test(llms) && /^> .+/m.test(llms) && (llms.match(/^## /gm) || []).length >= 3);
  const links = [...llms.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => m[1]);
  let l200 = true; for (const l of links) { if (l.startsWith(BASE)) { const r = await get(l); if (r.status() !== 200) { l200 = false; console.log('  llms link', l, r.status()); } } }
  ok(`llms.txt links (${links.length}) resolve`, l200 && links.some((l) => l.endsWith('how-to-play/')) && links.some((l) => l.endsWith('zh-tw/rules/')));
}

// ------------------------------------------------------------------------------------------------ per-page checks
console.log('\n== pages ==');
const seen = { titles: new Map(), descs: new Map() };
const pageInfo = {};
const visibleText = (s) => s.replace(/\s+/g, ' ').trim();

async function collect(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const meta = (n) => (q(`meta[name="${n}"]`) || {}).content || null;
    const prop = (n) => (q(`meta[property="${n}"]`) || {}).content || null;
    const refs = [];
    for (const el of document.querySelectorAll('a[href],link[href],script[src],img[src],source[src]')) {
      const attr = el.hasAttribute('href') ? 'href' : 'src';
      refs.push({ tag: el.tagName.toLowerCase(), rel: el.getAttribute('rel') || '', hreflang: el.getAttribute('hreflang') || '', raw: el.getAttribute(attr), abs: el[attr], text: (el.textContent || '').trim() });
    }
    return {
      lang: document.documentElement.lang, title: document.title, description: meta('description'), robots: meta('robots'), themeColor: meta('theme-color'), viewport: meta('viewport'),
      canonical: (q('link[rel=canonical]') || {}).href || null,
      alternates: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')]),
      og: Object.fromEntries(['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name', 'og:image:width', 'og:image:height', 'og:locale', 'og:image:alt'].map((k) => [k, prop(k)])),
      tw: Object.fromEntries(['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'].map((k) => [k, meta(k)])),
      icons: [...document.querySelectorAll('link[rel~=icon],link[rel=apple-touch-icon],link[rel=manifest]')].map((l) => [l.rel, l.getAttribute('href')]),
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
      h2: [...document.querySelectorAll('main h2, .content h2')].map((h) => ({ id: h.id, text: h.textContent.trim(), cls: h.closest('.toc,.cta') ? 'chrome' : 'content', next: h.nextElementSibling ? { tag: h.nextElementSibling.tagName, len: h.nextElementSibling.textContent.trim().length } : null })),
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
      refs,
      ids: [...document.querySelectorAll('[id]')].map((e) => e.id),
      qa: [...document.querySelectorAll('.qa')].map((s) => [s.querySelector('h2').textContent.trim(), s.querySelector('p.a').textContent.trim()]),
      steps: [...document.querySelectorAll('.steps li')].map((li) => li.textContent.trim()),
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      mainText: ((q('main') || q('#intro') || document.body).innerText || '').replace(/\s+/g, ' ').trim(),
    };
  });
}

function walkLd(node, out, where = '$') {
  if (Array.isArray(node)) { node.forEach((n, i) => walkLd(n, out, `${where}[${i}]`)); return; }
  if (node && typeof node === 'object') {
    if (node['@type']) for (const t of [].concat(node['@type'])) if (!SCHEMA_TYPES.has(t)) out.push(`unknown type ${t} at ${where}`);
    for (const [k, v] of Object.entries(node)) { if (!k.startsWith('@') && !SCHEMA_PROPS.has(k)) out.push(`unknown property ${k} at ${where}`); walkLd(v, out, `${where}.${k}`); }
  }
}

async function checkPage(e, { game }) {
  const label = `${e.lang}:${e.path || '(home)'}`;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: e.lang === 'zh' ? 'zh-TW' : 'en-US' });
  const page = await ctx.newPage();
  const problems = [], bad = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (er) => problems.push(`[pageerror] ${er.message}`));
  page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  const resp = await page.goto(toLocal(e.url), { waitUntil: 'load' });
  ok(`${label}: HTTP 200`, resp.status() === 200, String(resp.status()));
  if (game) await page.waitForFunction(() => window.__game && window.__game.sim, null, { timeout: 30000 });
  await page.waitForTimeout(game ? 800 : 100);
  const d = await collect(page);
  pageInfo[label] = d;

  // metadata
  const expectLang = game ? 'en' : e.lang === 'zh' ? 'zh-Hant-TW' : 'en';
  ok(`${label}: <html lang> = ${expectLang}`, d.lang === expectLang, d.lang);
  ok(`${label}: title present, <= 66 chars`, d.title && d.title.length <= 66, `${d.title} (${d.title && d.title.length})`);
  ok(`${label}: title unique`, !seen.titles.has(d.title), `dup of ${seen.titles.get(d.title)}`); seen.titles.set(d.title, label);
  ok(`${label}: description 50-170 chars`, d.description && d.description.length >= 50 && d.description.length <= 170, `${d.description && d.description.length}`);
  ok(`${label}: description unique`, !seen.descs.has(d.description)); seen.descs.set(d.description, label);
  if (!game) ok(`${label}: title/description in the static HTML (no JS needed)`, read(`${e.path}index.html`).includes(`<title>${d.title.replace(/&/g, '&amp;')}</title>`));
  ok(`${label}: canonical = its own absolute URL`, d.canonical === e.url, d.canonical);
  const altSet = Object.fromEntries(d.alternates);
  const pair = PAGES.find((p) => p.id === e.id);
  ok(`${label}: hreflang en / zh-Hant / x-default to the real pair`, altSet.en === BASE + pair.en && altSet['zh-Hant'] === BASE + pair.zh && altSet['x-default'] === BASE + pair.en, JSON.stringify(altSet));
  ok(`${label}: robots meta allows indexing`, /index/.test(d.robots || '') && !/noindex/.test(d.robots || ''), d.robots);
  ok(`${label}: viewport + theme-color`, /width=device-width/.test(d.viewport || '') && d.themeColor === SITE.themeColor);
  ok(`${label}: Open Graph complete`, d.og['og:title'] && d.og['og:description'] && d.og['og:url'] === e.url && d.og['og:image'] === BASE + SITE.ogImage && d.og['og:type'] === 'website' && d.og['og:image:width'] === '1200' && d.og['og:image:height'] === '630' && d.og['og:image:alt'] && d.og['og:locale'], JSON.stringify(d.og));
  ok(`${label}: Twitter card complete`, d.tw['twitter:card'] === 'summary_large_image' && d.tw['twitter:title'] && d.tw['twitter:description'] && d.tw['twitter:image'] === BASE + SITE.ogImage, JSON.stringify(d.tw));
  ok(`${label}: favicon svg + png, apple-touch-icon, manifest linked`, ['icon', 'apple-touch-icon', 'manifest'].every((r) => d.icons.some(([rel]) => rel.split(' ').includes(r))) && d.icons.filter(([r]) => r === 'icon').length >= 2, JSON.stringify(d.icons));

  // headings
  ok(`${label}: exactly one <h1>`, d.h1.length === 1 && d.h1[0].length > 8, JSON.stringify(d.h1));
  if (!game && e.id !== 'home') {
    const qs = d.h2.filter((h) => h.cls === 'content');
    const isQ = (t) => /[?？]$/.test(t);
    ok(`${label}: every content <h2> is question-shaped (${qs.length})`, qs.length >= 5 && qs.every((h) => isQ(h.text)), qs.filter((h) => !isQ(h.text)).map((h) => h.text).join(' | '));
    ok(`${label}: every <h2> has an id and is followed by an answer`, qs.every((h) => h.id && h.next && h.next.len > 20), qs.filter((h) => !h.id || !h.next).map((h) => h.text).join(' | '));
    const long = qs.filter((h) => h.next && h.next.tag === 'P' && h.next.len > (e.lang === 'zh' ? 260 : 480));
    ok(`${label}: answers lead with a short paragraph`, long.length === 0, long.map((h) => h.text).join(' | '));
  }
  // console + network
  ok(`${label}: zero console errors/warnings`, problems.length === 0, problems.join(' ; '));
  ok(`${label}: no 4xx/5xx responses while loading`, bad.length === 0, bad.join(' ; '));

  // links, assets, relative-URL hygiene
  const hygiene = [], missing = [], anchorBad = [];
  const checked = new Set();
  for (const r of d.refs) {
    const isMeta = r.tag === 'link' && /canonical|alternate/.test(r.rel);
    const raw = r.raw || '';
    if (/^(javascript|mailto|tel):/i.test(raw)) continue;
    if (raw.startsWith('#')) { if (raw.length > 1 && !d.ids.includes(raw.slice(1))) anchorBad.push(raw); continue; }
    if (raw.startsWith('/')) hygiene.push(`root-relative ${raw}`);
    if (/localhost|127\.0\.0\.1/.test(raw)) hygiene.push(`local url ${raw}`);
    if (/^https?:/i.test(raw) && !isMeta && !raw.startsWith('https://github.com/')) hygiene.push(`absolute ${raw}`);
    if (/^https?:/i.test(raw) && !raw.startsWith(BASE) && !raw.startsWith(LOCAL) && !raw.startsWith('https://github.com/')) hygiene.push(`foreign ${raw}`);
    if (raw.startsWith('https://github.com/')) continue;
    const u = toLocal(r.abs.split('#')[0]);
    if (checked.has(u)) continue; checked.add(u);
    const res = await apiCtx.request.get(u, { maxRedirects: 0 });
    if (res.status() !== 200) missing.push(`${res.status()} ${raw}`);
    if (r.tag === 'a' && !r.text && !r.abs.includes('#')) hygiene.push(`empty link text ${raw}`);
  }
  ok(`${label}: all ${checked.size} local links/assets/alternates resolve with 200`, missing.length === 0, missing.join(' ; '));
  ok(`${label}: in-page anchors exist`, anchorBad.length === 0, anchorBad.join(' '));
  ok(`${label}: URLs relative (absolute only for canonical/hreflang/GitHub)`, hygiene.length === 0, hygiene.join(' ; '));

  // JSON-LD
  const blocks = []; let parseOk = true;
  for (const t of d.ld) { try { blocks.push(JSON.parse(t)); } catch (er) { parseOk = false; console.log('  JSON-LD parse error', er.message); } }
  ok(`${label}: ${d.ld.length} JSON-LD block(s) all parse`, parseOk && d.ld.length > 0);
  const issues = []; for (const b of blocks) { if (b['@context'] !== 'https://schema.org') issues.push('bad @context'); walkLd(b, issues); }
  ok(`${label}: JSON-LD uses only real schema.org types/properties`, issues.length === 0, issues.join(' ; '));
  const types = blocks.flatMap((b) => [].concat(b['@type']));
  if (e.id !== 'home' || e.lang === 'en') {
    // game home page: VideoGame + WebApplication + WebSite
  }
  if (game) {
    const g = blocks.find((b) => [].concat(b['@type']).includes('VideoGame')), w = blocks.find((b) => b['@type'] === 'WebSite');
    ok(`${label}: VideoGame+WebApplication JSON-LD has the required fields`, g && [].concat(g['@type']).includes('WebApplication') && g.name === 'Pickle Ball Dual' && g.url === BASE && g.operatingSystem === 'Any (web browser)' && g.applicationCategory === 'GameApplication' && g.offers && g.offers.price === '0' && JSON.stringify(g.inLanguage) === '["en","zh-Hant"]' && /SinglePlayer/.test(g.playMode) && g.image === BASE + SITE.ogImage && g.author && g.author.url === SITE.author.url && g.publisher && g.publisher.url === SITE.author.url && g.genre && g.gamePlatform && g.description, JSON.stringify(g && Object.keys(g)));
    ok(`${label}: no invented ratings/reviews in JSON-LD`, !/aggregateRating|"review"|ratingValue/.test(d.ld.join('')));
    ok(`${label}: WebSite JSON-LD`, w && w.url === BASE && w.name === 'Pickle Ball Dual');
    ok(`${label}: static <title>/description equal the shared HOME_EN copy`, d.title === HOME_EN.title && d.description === HOME_EN.description);
  } else if (e.id !== 'home') {
    ok(`${label}: BreadcrumbList JSON-LD (Home > page, absolute items)`, blocks.some((b) => b['@type'] === 'BreadcrumbList' && b.itemListElement.length === 2 && b.itemListElement[1].item === e.url && b.itemListElement.every((i, n) => i.position === n + 1 && /^https:/.test(i.item))));
  }
  if (e.id === 'faq') {
    const f = blocks.find((b) => b['@type'] === 'FAQPage');
    const jq = f ? f.mainEntity.map((m) => [m.name, m.acceptedAnswer.text]) : [];
    ok(`${label}: FAQPage JSON-LD present (${jq.length} questions)`, jq.length >= 12);
    ok(`${label}: FAQPage JSON-LD text == visible Q&A, in order`, JSON.stringify(jq.map(([q, a]) => [visibleText(q), visibleText(a)])) === JSON.stringify(d.qa.map(([q, a]) => [visibleText(q), visibleText(a)])), `json ${jq.length} vs visible ${d.qa.length}`);
  }
  if (e.id === 'how') {
    const h = blocks.find((b) => b['@type'] === 'HowTo');
    const norm = (x) => x.replace(/[\s「」:：.,，。'"’]/g, '');
    ok(`${label}: HowTo JSON-LD steps match the visible numbered steps`, h && h.step.length === d.steps.length && h.step.every((st, i) => norm(d.steps[i]).includes(norm(st.name).slice(0, 6))), h ? `${h.step.length} vs ${d.steps.length}` : 'missing');
  }

  // layout: no horizontal overflow at 1440 / 390 / 360
  for (const w of [1440, 390, 360]) {
    await page.setViewportSize({ width: w, height: 844 });
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (!game) ok(`${label}: no horizontal scroll at ${w}px`, sw[0] <= sw[1], `${sw}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  if (game) {
    // the game boots and a match can be started
    ok(`${label}: #intro (static copy) replaced by the live menu; one <h1> remains`, (await page.evaluate(() => !document.getElementById('intro') && document.querySelectorAll('h1').length === 1 && !!document.querySelector('.screen[data-screen=main]:not(.hidden) h1'))));
    const links = await page.evaluate(() => [...document.querySelectorAll('.screen[data-screen=main] .guide-links a')].map((a) => [a.textContent, a.getAttribute('href')]));
    ok(`${label}: main menu shows How to play / Rules / FAQ links (en)`, JSON.stringify(links) === JSON.stringify([['How to play', 'how-to-play/'], ['Rules', 'rules/'], ['FAQ', 'faq/']]), JSON.stringify(links));
    ok(`${label}: visible <meta description> at runtime still equals the static one (en)`, (await page.evaluate(() => document.querySelector('meta[name=description]').content)) === d.description);
    await page.evaluate(() => __game.startMatch({ quality: 'low', autoplay: true })); await page.waitForTimeout(700);
    await page.evaluate(() => __game.advance(3));
    ok(`${label}: game boots and a match can be started`, (await page.evaluate(() => __game.mode)) === 'play' && (await page.evaluate(() => __game.getState().tick)) > 100);
    if (SHOTS) { await page.evaluate(() => __game.toMenu()); await page.waitForTimeout(700); await page.screenshot({ path: path.join(SHOTS, 'home-menu-en-1440.png') }); }
    // language switch -> zh links
    await page.evaluate(() => __game.toMenu()); await page.waitForTimeout(400);
    await page.locator('.screen[data-screen=main] .segbtn', { hasText: '繁體中文' }).click(); await page.waitForTimeout(300);
    const zl = await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, links: [...document.querySelectorAll('.screen[data-screen=main] .guide-links a')].map((a) => [a.textContent, a.getAttribute('href'), a.href]) }));
    ok(`${label}: switching to 繁體中文 retargets the guide links to zh-tw/ and updates <html lang>/<title>`, zl.lang === 'zh-Hant-TW' && /匹克球/.test(zl.title) && zl.links.map((l) => l[1]).join() === 'zh-tw/how-to-play/,zh-tw/rules/,zh-tw/faq/' && zl.links.map((l) => l[0]).join() === '操作說明,規則,常見問題', JSON.stringify(zl));
    let zl200 = true; for (const l of zl.links) if ((await apiCtx.request.get(l[2], { maxRedirects: 0 })).status() !== 200) zl200 = false;
    ok(`${label}: zh menu links resolve`, zl200);
    if (SHOTS) { await page.screenshot({ path: path.join(SHOTS, 'home-menu-zh-1440.png') }); }
    ok(`${label}: still zero console errors/warnings after play + language switch`, problems.length === 0, problems.join(' ; '));
  }
  await ctx.close();
  return d;
}

for (const e of expected) await checkPage(e, { game: e.id === 'home' && e.lang === 'en' });

// ------------------------------------------------------------------------------------------------ home raw HTML + deep links
console.log('\n== home page raw HTML / ?lang / 404 ==');
{
  const raw = read('index.html');
  ok('index.html: static <h1> + intro + links to the guides + zh-tw link in the raw HTML', /<h1>Pickle Ball Dual/.test(raw) && ['how-to-play/', 'rules/', 'faq/', 'zh-tw/'].every((h) => raw.includes(`href="${h}"`)));
  ok('index.html: <noscript> has the description and the guide links', (() => { const n = raw.match(/<noscript>([\s\S]*?)<\/noscript>/); return n && /free 3D pickleball game/.test(n[1]) && /DUPR/.test(n[1]) && /how-to-play\//.test(n[1]) && /rules\//.test(n[1]) && /faq\//.test(n[1]); })());
  ok('index.html: modulepreload for main modules + three.js, importmap before them', (() => { const i = raw.indexOf('type="importmap"'), m = raw.indexOf('rel="modulepreload"'); return i > 0 && m > i && raw.includes('rel="modulepreload" href="./vendor/three.module.js"') && raw.includes('href="./src/main.js"'); })());
  ok('index.html: <html lang="en">, aria-label on the canvas, module script last', /<html lang="en">/.test(raw) && /<canvas id="game"[^>]*aria-label="[^"]{15,}"/.test(raw) && /<script type="module" src="\.\/src\/main\.js"><\/script>\s*<\/body>/.test(raw));
  const i18n = await import(pathToFileURL(path.join(ROOT, 'src/ui/i18n.js')).href);
  i18n.setLang('en', { silent: true });
  ok('i18n en app.docTitle / app.desc mirror the static head (site.mjs HOME_EN)', i18n.t('meta.title') === HOME_EN.title && i18n.t('meta.description') === HOME_EN.description);
  const zhGuide = ['how', 'rules', 'faq'].every((k) => { i18n.setLang('zh-TW', { silent: true }); const href = i18n.t(`guide.${k}.href`); return fs.existsSync(path.join(ROOT, href, 'index.html')); });
  i18n.setLang('en', { silent: true });
  ok('i18n guide hrefs point at existing zh-tw pages', zhGuide);

  // ?lang= deep links used by the guide pages' Play now buttons
  for (const [q, want, re] of [['?lang=zh-TW', 'zh-Hant-TW', /開始比賽/], ['?lang=en', 'en', /Play/]]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: q === '?lang=en' ? 'zh-TW' : 'en-US' });
    const page = await ctx.newPage(); const probs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) probs.push(m.text()); }); page.on('pageerror', (er) => probs.push(er.message));
    await page.goto(`${LOCAL_BASE}${q}`); await page.waitForFunction(() => window.__game && window.__game.sim, null, { timeout: 30000 }); await page.waitForTimeout(500);
    ok(`home${q}: UI language follows the link regardless of browser locale`, (await page.evaluate(() => document.documentElement.lang)) === want && re.test(await page.evaluate(() => document.querySelector('.screen[data-screen=main]').innerText)), '');
    ok(`home${q}: no console errors`, probs.length === 0, probs.join(';'));
    await ctx.close();
  }
  // HTML tags follow the UI language at runtime (initial detection, stored choice, runtime switch)
  {
    const i18nM = await import(pathToFileURL(path.join(ROOT, 'src/ui/i18n.js')).href);
    const tags = (page) => page.evaluate(() => { const m = (s) => (document.querySelector(s) || {}).content; return { lang: document.documentElement.lang, title: document.title, desc: m('meta[name=description]'), ogt: m('meta[property="og:title"]'), ogd: m('meta[property="og:description"]'), ogl: m('meta[property="og:locale"]'), twt: m('meta[name="twitter:title"]'), twd: m('meta[name="twitter:description"]'), apple: m('meta[name="apple-mobile-web-app-title"]'), aria: document.getElementById('game').getAttribute('aria-label'), h1: document.querySelector('h1').innerText.replace(/\s+/g, ' ') }; });
    const expectTags = (code) => { i18nM.setLang(code, { silent: true }); const t = i18nM.t; return { lang: code === 'en' ? 'en' : 'zh-Hant-TW', title: t('meta.title'), desc: t('meta.description'), ogt: t('meta.title'), ogd: t('meta.description'), ogl: t('meta.ogLocale'), twt: t('meta.title'), twd: t('meta.description'), apple: t('app.title'), aria: t('canvas.aria') }; };
    const eq = (got, want) => Object.keys(want).filter((k) => got[k] !== want[k]).map((k) => `${k}: ${got[k]} != ${want[k]}`);
    const wantEn = expectTags('en'), wantZh = expectTags('zh-TW'); i18nM.setLang('en', { silent: true });
    ok('i18n: zh-TW meta strings are Chinese, en are English', /[\u4e00-\u9fff]/.test(wantZh.title + wantZh.desc) && !/[\u4e00-\u9fff]/.test(wantEn.title + wantEn.desc) && wantZh.ogl === 'zh_TW' && wantEn.ogl === 'en_US');
    for (const [locale, want, other, label] of [['zh-TW', wantZh, wantEn, 'zh-TW'], ['en-US', wantEn, wantZh, 'en-US']]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale });
      const page = await ctx.newPage(); const probs = [];
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) probs.push(m.text()); }); page.on('pageerror', (er) => probs.push(er.message));
      await page.goto(LOCAL_BASE); await page.waitForFunction(() => window.__game && window.__game.sim, null, { timeout: 30000 }); await page.waitForTimeout(500);
      let d1 = await tags(page);
      ok(`${label} browser: html lang/title/description/og/twitter/apple title/canvas aria/h1 all in ${label === 'zh-TW' ? 'Chinese' : 'English'} at load`, eq(d1, want).length === 0 && /Pickle Ball Dual/.test(d1.h1), eq(d1, want).join(' | '));
      await page.locator('.screen[data-screen=main] .segbtn', { hasText: label === 'zh-TW' ? 'English' : '繁體中文' }).click(); await page.waitForTimeout(300);
      d1 = await tags(page);
      ok(`${label} browser: main-menu language toggle updates every tag immediately`, eq(d1, other).length === 0, eq(d1, other).join(' | '));
      await page.evaluate(() => __game.menus.openSettings('main', __game.settings)); await page.waitForTimeout(200);
      await page.locator('.screen[data-screen=settings] .segbtn', { hasText: label === 'zh-TW' ? '繁體中文' : 'English' }).click(); await page.waitForTimeout(300);
      d1 = await tags(page);
      ok(`${label} browser: Settings language switch updates every tag back`, eq(d1, want).length === 0, eq(d1, want).join(' | '));
      await page.reload(); await page.waitForFunction(() => window.__game && window.__game.sim, null, { timeout: 30000 }); await page.waitForTimeout(400);
      ok(`${label} browser: stored choice restores the tags after reload`, eq(await tags(page), want).length === 0);
      ok(`${label} browser: no console errors`, probs.length === 0, probs.join(';'));
      await ctx.close();
    }
    i18nM.setLang('en', { silent: true });
    // static (no-JS) tags: English home stays English; zh-tw pages fully Chinese; en guides English
    const staticOk = expected.every((e) => { const h = read(`${e.path}index.html`.replace(/^index\.html$/, 'index.html')); const zhPage = e.lang === 'zh' ; const cjkTitle = /[\u4e00-\u9fff]/.test(h.match(/<title>(.*?)<\/title>/)[1]); const cjkDesc = /[\u4e00-\u9fff]/.test(h.match(/<meta name="description" content="(.*?)"/)[1]); const lang = h.match(/<html lang="([^"]+)"/)[1]; const ogl = h.match(/og:locale" content="([^"]+)"/)[1]; return zhPage ? cjkTitle && cjkDesc && lang === 'zh-Hant-TW' && ogl === 'zh_TW' : !cjkTitle && !cjkDesc && lang === 'en' && ogl === 'en_US'; });
    ok('static HTML: zh-tw pages have Chinese lang/title/description/og:locale, English pages and index.html are English', staticOk);
  }

  // Play-now links on guide pages point at the game with the right language
  const playLinks = [['how-to-play/index.html', '../?lang=en'], ['zh-tw/rules/index.html', '../../?lang=zh-TW'], ['zh-tw/index.html', '../?lang=zh-TW']];
  ok('guide pages: "Play now" links are relative and carry ?lang=', playLinks.every(([f, h]) => read(f).includes(`class="btn" href="${h}"`)));

  // JavaScript disabled: content must be readable
  for (const e of expected) {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(toLocal(e.url), { waitUntil: 'load' });
    const t = await page.evaluate(() => ({ h1: (document.querySelector('h1') || {}).innerText, vis: !!document.querySelector('h1') && document.querySelector('h1').getBoundingClientRect().height > 10, len: ((document.querySelector('main') || document.querySelector('#intro')).innerText || '').length, table: document.querySelectorAll('table').length, nojs: !!document.querySelector('.nojs') && document.querySelector('.nojs').getBoundingClientRect().height > 0 }));
    const isHome = e.id === 'home' && e.lang === 'en';
    ok(`no-JS ${e.lang}:${e.path || '(home)'}: h1 visible and ${isHome ? 'intro + noscript block rendered' : 'content rendered'} (${t.len} chars)`, t.vis && t.len > (isHome ? 250 : e.id === 'home' ? 600 : 900) && (!isHome || t.nojs), JSON.stringify(t));
    await ctx.close();
  }

  // 404.html under the sub-path, served for a missing deep URL
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
  const r404 = await page.goto(`${LOCAL_BASE}no/such/deep/page`);
  ok('missing deep URL -> HTTP 404 with the friendly 404.html', r404.status() === 404 && /Out! That page is not on the court/.test(await page.content()));
  const l404 = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => [a.textContent, a.href]));
  ok('404.html links are absolute to the base (work at any depth) and resolve', l404.length >= 4 && l404.every((l) => l[1].startsWith(BASE) || l[1].startsWith(LOCAL_BASE)) && (await Promise.all(l404.map(async (l) => (await get(l[1])).status()))).every((s) => s === 200), JSON.stringify(l404));
  ok('404.html is noindex and styled (inline CSS)', /noindex/.test(read('404.html')) && (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(10, 22, 38)');
  ok('404.html "Play" link goes to the game (absolute base URL)', (await page.evaluate(() => document.querySelector('a.btn').href)) === BASE);
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------ screenshots
if (SHOTS) {
  console.log('\n== screenshots ->', SHOTS, '==');
  for (const e of expected) {
    if (e.id === 'home' && e.lang === 'en') continue;
    for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, javaScriptEnabled: false });
      const page = await ctx.newPage(); await page.goto(toLocal(e.url), { waitUntil: 'load' });
      await page.screenshot({ path: path.join(SHOTS, `${e.lang}-${(e.path || 'home').replace(/\/$/, '').replace(/\//g, '_')}-${tag}.png`), fullPage: true });
      await ctx.close();
    }
  }
  fs.copyFileSync(path.join(ROOT, SITE.ogImage), path.join(SHOTS, 'og-image.png'));
}

await browser.close(); srv.close();

// ------------------------------------------------------------------------------------------------ repo tests
if (FULL) {
  console.log('\n== repo tests ==');
  for (const [name, cmd, args] of [['npm test (58 tests)', 'npm', ['test']], ['dev/playtest/menus.mjs', 'node', ['dev/playtest/menus.mjs']], ['dev/playtest/i18n.mjs', 'node', ['dev/playtest/i18n.mjs']]]) {
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const fails = (out.match(/^FAIL/gm) || []).length;
    const good = r.status === 0 && fails === 0 && (name.startsWith('npm') ? /# pass 58\b/.test(out) && /# fail 0\b/.test(out) : true);
    ok(name, good, out.split('\n').filter((l) => /FAIL|fail|Error/.test(l)).slice(0, 8).join(' | '));
  }
}

console.log(`\n${nPass} passed, ${nFail} failed`);
if (nFail) { console.log('FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
