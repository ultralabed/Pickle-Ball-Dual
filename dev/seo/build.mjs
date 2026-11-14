// Generates the static SEO/AEO files from dev/seo/content-*.mjs and dev/seo/site.mjs:
//   how-to-play/ rules/ faq/ zh-tw/ (guide pages), sitemap.xml, robots.txt, llms.txt, 404.html, manifest.webmanifest,
//   and the generated <head> block of index.html (between the seo:begin / seo:end markers).
// Usage: node dev/seo/build.mjs [--base=https://example.com/optional/subpath/]
// Output is committed; the game itself needs no build step.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, SITE, PAGES, HOME_EN, abs as absIn } from './site.mjs';
import { en } from './content-en.mjs';
import { zh } from './content-zh.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argBase = process.argv.find((a) => a.startsWith('--base='));
let BASE = (argBase ? argBase.slice(7) : BASE_URL);
if (!BASE.endsWith('/')) BASE += '/';
const abs = (p = '') => absIn(BASE, p);
const BASE_PATH = new URL(BASE).pathname;       // '/Pickle-Ball-Dual/' or '/'

const L = { en, zh };
const HOME = { en: HOME_EN };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const json = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');
const ld = (o) => `<script type="application/ld+json">\n${json(o)}\n</script>`;
const write = (rel, content) => { const f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); console.log('wrote', rel); };
const rel = (fromDir, toPath) => {
  const [p, q] = toPath.split('?'); const isDir = p === '' || p.endsWith('/');
  let r = path.posix.relative(fromDir || '.', p || '.') || '.';
  if (isDir && !r.endsWith('/')) r += '/';
  if (r === './' || r === '.') r = './';
  return r + (q ? `?${q}` : '');
};

const pathOf = (lang, id) => PAGES.find((p) => p.id === id)[lang];
const dirOf = (p) => p;   // pages are directories with an index.html

// ----------------------------------------------------------------------------------------------- icons / head bits
function iconLinks(up) {
  return `<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${up}favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="${up}apple-touch-icon.png">
<link rel="manifest" href="${up}manifest.webmanifest">`;
}
function hreflangs(enPath, zhPath) {
  return `<link rel="alternate" hreflang="en" href="${abs(enPath)}">
<link rel="alternate" hreflang="zh-Hant" href="${abs(zhPath)}">
<link rel="alternate" hreflang="x-default" href="${abs(enPath)}">`;
}
function socialTags({ title, description, url, locale, altLocale }) {
  const img = abs(SITE.ogImage);
  return `<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(SITE.ogImageAlt)}">
<meta property="og:locale" content="${locale}">
<meta property="og:locale:alternate" content="${altLocale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:image:alt" content="${esc(SITE.ogImageAlt)}">`;
}
const ROBOTS_META = '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">';
const AUTHOR = { '@type': 'Person', name: SITE.author.name, url: SITE.author.url, sameAs: [SITE.author.url, SITE.author.github] };

// ----------------------------------------------------------------------------------------------- guide pages
function fill(html, lang, fromDir) {
  const to = (id) => rel(fromDir, pathOf(lang, id));
  return html
    .replace(/\{\{url:how\}\}/g, to('how')).replace(/\{\{url:rules\}\}/g, to('rules')).replace(/\{\{url:faq\}\}/g, to('faq'))
    .replace(/\{\{url:home\}\}/g, lang === 'en' ? rel(fromDir, '') : rel(fromDir, pathOf('zh', 'home')))
    .replace(/\{\{url:play\}\}/g, rel(fromDir, `?lang=${L[lang].playLang}`));
}

function renderPage(lang, id) {
  const C = L[lang]; const U = C.ui; const P = C.pages[id];
  const other = lang === 'en' ? 'zh' : 'en';
  const dir = dirOf(pathOf(lang, id));
  const up = dir ? '../'.repeat(dir.split('/').filter(Boolean).length) : '';
  const url = abs(dir);
  const enPath = pathOf('en', id), zhPath = pathOf('zh', id);
  const homeUrl = lang === 'en' ? rel(dir, '') : rel(dir, pathOf('zh', 'home'));
  const isHub = id === 'home';

  // body + FAQ list
  let content = fill(P.body || '', lang, dir);
  if (P.faq) {
    content = P.faq.map(([q, a], i) => `<section class="qa"><h2 id="q${i + 1}">${esc(q)}</h2><p class="a">${esc(a)}</p></section>`).join('\n')
      + '\n' + fill(P.bodyAfter || '', lang, dir);
  }
  // table of contents from h2 headings (not for the hub page)
  const h2s = [...content.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)].map((m) => [m[1], m[2]]);
  const toc = !isHub && h2s.length > 3
    ? `<nav class="toc" aria-labelledby="toc-h"><h2 id="toc-h">${esc(U.toc)}</h2><ol>${h2s.map(([i, t]) => `<li><a href="#${i}">${t}</a></li>`).join('')}</ol></nav>` : '';

  // structured data
  const crumbs = [{ name: U.homeName, item: lang === 'en' ? abs('') : abs(pathOf('zh', 'home')) }];
  if (!isHub) crumbs.push({ name: P.name, item: url });
  const blocks = [];
  if (!isHub) blocks.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })) });
  if (P.faq) blocks.push({ '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: C.hreflang, mainEntity: P.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  if (P.howto) blocks.push({ '@context': 'https://schema.org', '@type': 'HowTo', name: P.howto.name, description: P.howto.description, inLanguage: C.hreflang, step: P.howto.steps.map(([n, t], i) => ({ '@type': 'HowToStep', position: i + 1, name: n, text: t, url: `${url}#start` })) });
  if (isHub) blocks.push({ '@context': 'https://schema.org', '@type': 'WebPage', name: P.title, description: P.description, url, inLanguage: C.hreflang, isPartOf: { '@type': 'WebSite', name: SITE.name, url: abs('') }, about: { '@type': 'VideoGame', name: SITE.name, url: abs('') } });

  const nav = ['how', 'rules', 'faq'].map((k) => `<a href="${rel(dir, pathOf(lang, k))}"${k === id ? ' aria-current="page"' : ''}>${esc(U[k])}</a>`).join('');
  const crumbHtml = isHub ? '' : `<nav class="crumbs" aria-label="${esc(U.crumbs)}"><ol><li><a href="${homeUrl}">${esc(U.homeName)}</a></li><li><span aria-current="page">${esc(P.name)}</span></li></ol></nav>`;
  const switchHref = rel(dir, pathOf(other, id));
  const related = ['how', 'rules', 'faq'].filter((k) => k !== id).map((k) => `<a href="${rel(dir, pathOf(lang, k))}">${esc(U[k])}</a>`).join('');
  const playHref = rel(dir, `?lang=${C.playLang}`);

  return `<!doctype html>
<html lang="${C.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(P.title)}</title>
<meta name="description" content="${esc(P.description)}">
${ROBOTS_META}
<link rel="canonical" href="${url}">
${hreflangs(enPath, zhPath)}
${socialTags({ title: P.title, description: P.description, url, locale: C.ogLocale, altLocale: L[other].ogLocale })}
<meta name="theme-color" content="${SITE.themeColor}">
<meta name="color-scheme" content="dark">
${iconLinks(up)}
<link rel="stylesheet" href="${up}guide.css">
${blocks.map(ld).join('\n')}
</head>
<body>
<a class="skip" href="#main">${esc(U.skip)}</a>
<header class="site-head">
<a class="brand" href="${homeUrl}"><span class="ball" aria-hidden="true"></span>${esc(SITE.name)}</a>
<nav class="site-nav" aria-label="${esc(U.navLabel)}">${nav}</nav>
<div class="head-actions"><a class="lang" href="${switchHref}" hreflang="${U.switchLang}" lang="${U.switchLang}" title="${esc(U.switchTitle)}">${esc(U.switchLabel)}</a><a class="btn" href="${playHref}">${esc(U.play)}</a></div>
</header>
<main id="main">
${crumbHtml}
<h1>${esc(P.h1)}</h1>
<p class="lede">${P.lede}</p>
${isHub ? '' : `<p class="hero-cta"><a class="btn big" href="${playHref}">${esc(U.play)}</a></p>`}
${toc}
<div class="content">
${content}
</div>
<aside class="cta" aria-labelledby="cta-h">
<h2 id="cta-h">${esc(U.ctaTitle)}</h2>
<p>${esc(U.ctaText)}</p>
<a class="btn big" href="${playHref}">${esc(U.play)}</a>
<p class="related">${esc(U.related)}: ${isHub ? ['how', 'rules', 'faq'].map((k) => `<a href="${rel(dir, pathOf(lang, k))}">${esc(U[k])}</a>`).join('') : related}</p>
</aside>
</main>
<footer class="site-foot">
<p>${U.footer}</p>
<p><a href="${playHref}">${esc(U.footerPlay)}</a> · <a href="${SITE.repo}">${esc(U.footerSource)}</a></p>
</footer>
</body>
</html>
`;
}

for (const lang of ['en', 'zh']) {
  for (const id of ['how', 'rules', 'faq']) write(`${pathOf(lang, id)}index.html`, renderPage(lang, id));
}
write('zh-tw/index.html', renderPage('zh', 'home'));

// ----------------------------------------------------------------------------------------------- sitemap
const urlEntry = (p) => {
  const e = pathOf('en', p.id), z = pathOf('zh', p.id);
  return [e, z].map((self) => `  <url>
    <loc>${abs(self)}</loc>
    <lastmod>${SITE.lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="${abs(e)}"/>
    <xhtml:link rel="alternate" hreflang="zh-Hant" href="${abs(z)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(e)}"/>
  </url>`).join('\n');
};
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.map(urlEntry).join('\n')}
</urlset>
`);

// ----------------------------------------------------------------------------------------------- robots.txt
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot'];
const DIS = ['/dev/', '/tests/', '/node_modules/'];
const disallow = [...new Set([...DIS, ...(BASE_PATH === '/' ? [] : DIS.map((d) => BASE_PATH.replace(/\/$/, '') + d))])];
write('robots.txt', `# Pickle Ball Dual: everything public is welcome, including search and AI answer engines.
# Note: crawlers only read /robots.txt at the host root; when the site lives under a sub-path (project pages),
# keep a copy at the root of the host or rely on the sitemap and the meta robots tags.
${AI_BOTS.map((b) => `User-agent: ${b}`).join('\n')}
Allow: /
${disallow.map((d) => `Disallow: ${d}`).join('\n')}

User-agent: *
Allow: /
${disallow.map((d) => `Disallow: ${d}`).join('\n')}

Sitemap: ${abs('sitemap.xml')}
`);

// ----------------------------------------------------------------------------------------------- llms.txt
const enP = en.pages;
write('llms.txt', `# ${SITE.name}

> ${en.llms.summary}

## Key facts

${en.llms.facts.map((f) => `- ${f}`).join('\n')}

## Play

- [Play ${SITE.name}](${abs('')}): the game itself (full-screen WebGL canvas; keyboard on desktop, touch controls on phones and tablets)

## Guides (English)

- [How to play](${abs(pathOf('en', 'how'))}): keyboard and touch controls, the six shots (drive, drop, dink, lob, smash, ATP), foot-ring timing colours, game modes, DUPR 3.0 to 6.0 AI levels
- [Pickleball rules](${abs(pathOf('en', 'rules'))}): court size, serve, two-bounce rule, kitchen, faults, doubles 0-0-2 scoring, singles, rally scoring, and which rules the game simplifies
- [FAQ](${abs(pathOf('en', 'faq'))}): ${enP.faq.faq.length} short answers (free to play, phone and tablet, Mac, two-bounce rule, 0-0-2, dink, ATP, DUPR, scoring)

## Guides (Traditional Chinese, 繁體中文)

- [操作說明](${abs(pathOf('zh', 'how'))}): ${zh.pages.how.description}
- [匹克球規則](${abs(pathOf('zh', 'rules'))}): ${zh.pages.rules.description}
- [常見問題](${abs(pathOf('zh', 'faq'))}): ${zh.pages.faq.description}

## Optional

- [Source code on GitHub](${SITE.repo})
- [Sitemap](${abs('sitemap.xml')})
`);

// ----------------------------------------------------------------------------------------------- 404.html
// A 404 can be served at any depth, so relative URLs would break: CSS is inline and links use the absolute base.
write('404.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page not found — ${esc(SITE.name)}</title>
<meta name="description" content="This page does not exist. Go back to Pickle Ball Dual, the free 3D pickleball game in your browser.">
<meta name="robots" content="noindex">
<meta name="theme-color" content="${SITE.themeColor}">
<link rel="icon" href="${abs('favicon.svg')}" type="image/svg+xml">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:#0a1626 radial-gradient(ellipse 90% 50% at 50% -10%,#17335a,rgba(10,22,38,0) 70%) no-repeat;color:#f2f7ff;font:17px/1.6 "PingFang TC","SF Pro Text","Noto Sans TC","Microsoft JhengHei",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;text-align:center}
main{max-width:34rem}
.ball{width:84px;height:84px;margin:0 auto 18px;border-radius:50%;background:radial-gradient(circle at 34% 30%,#f3ff7a,#d9f23a 45%,#98b81c 100%);box-shadow:0 8px 30px rgba(217,242,58,.45),inset -5px -6px 10px rgba(80,100,0,.35)}
h1{margin:0 0 8px;font-size:clamp(28px,7vw,40px);line-height:1.15}
p{margin:.5em 0;color:#d6e2f3}
.btn{display:inline-block;margin:18px 6px 6px;padding:12px 28px;border-radius:14px;border:1px solid rgba(255,255,255,.6);background:linear-gradient(180deg,#e8ff55,#d9f23a 55%,#a8d12a);color:#1a2a00;font-weight:900;text-decoration:none;box-shadow:0 4px 0 #6f8a0c}
.links a{color:#d9f23a;margin:0 8px;white-space:nowrap}
</style>
</head>
<body>
<main>
<div class="ball" aria-hidden="true"></div>
<h1>Out! That page is not on the court.</h1>
<p>We could not find the page you asked for. It may have moved, or the link may be mistyped.</p>
<p>找不到這個頁面，可能已經移動或網址輸入有誤。</p>
<a class="btn" href="${abs('')}">Play Pickle Ball Dual</a>
<p class="links"><a href="${abs(pathOf('en', 'how'))}">How to play</a><a href="${abs(pathOf('en', 'rules'))}">Rules</a><a href="${abs(pathOf('en', 'faq'))}">FAQ</a><a href="${abs(pathOf('zh', 'home'))}" lang="zh-Hant">繁體中文</a></p>
</main>
</body>
</html>
`);

// ----------------------------------------------------------------------------------------------- manifest (all URLs relative to the manifest)
write('manifest.webmanifest', JSON.stringify({
  id: './',
  name: `${SITE.name}: Free 3D Pickleball`,
  short_name: SITE.name,
  description: HOME.en.description,
  lang: 'en',
  dir: 'ltr',
  start_url: './',
  scope: './',
  display: 'standalone',
  display_override: ['fullscreen', 'standalone'],
  orientation: 'any',
  background_color: SITE.themeColor,
  theme_color: SITE.themeColor,
  categories: ['games', 'sports'],
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
}, null, 2) + '\n');

// ----------------------------------------------------------------------------------------------- index.html generated head block
const GAME_LD = {
  '@context': 'https://schema.org',
  '@type': ['VideoGame', 'WebApplication'],
  '@id': `${abs('')}#game`,
  name: SITE.name,
  alternateName: ['Pickle Ball Dual 匹克球'],
  description: 'A free 3D pickleball game that runs in your web browser. Play singles or doubles against AI opponents at DUPR levels 3.0 to 6.0 with real pickleball rules: two-bounce rule, kitchen, 0-0-2 scoring and rally scoring. No install, no sign-up.',
  url: abs(''),
  image: abs(SITE.ogImage),
  screenshot: { '@type': 'ImageObject', url: abs(SITE.ogImage), width: 1200, height: 630, caption: SITE.ogImageAlt },
  genre: ['Sports', 'Simulation'],
  gamePlatform: ['Desktop web browser', 'Mobile web browser (iOS, Android)'],
  operatingSystem: 'Any (web browser)',
  applicationCategory: 'GameApplication',
  browserRequirements: 'Requires a web browser with WebGL; keyboard on desktop, on-screen touch controls on phones and tablets',
  playMode: 'https://schema.org/SinglePlayer',
  inLanguage: ['en', 'zh-Hant'],
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
  featureList: [
    'Doubles with an AI partner or singles against AI',
    'AI opponents at DUPR levels 3.0, 4.0, 5.0 and 6.0',
    'Traditional side-out scoring to 11 and rally scoring to 15',
    'Two-bounce rule, kitchen (non-volley zone) and 0-0-2 doubles start',
    'Drive, drop, dink, lob, smash and around-the-post (ATP) shots',
    'Slow-motion instant replays and English referee score calls',
    'Touch controls for phones and tablets, landscape and portrait',
    'English and Traditional Chinese interface',
  ],
  softwareHelp: { '@type': 'WebPage', name: 'How to play Pickle Ball Dual', url: abs(pathOf('en', 'how')) },
  keywords: 'pickleball game, 3D pickleball, free browser game, play pickleball online, DUPR, dink, two-bounce rule',
  author: AUTHOR,
  publisher: AUTHOR,
};
const SITE_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${abs('')}#website`,
  name: SITE.name,
  url: abs(''),
  description: HOME.en.description,
  inLanguage: ['en', 'zh-Hant'],
  publisher: AUTHOR,
};
const headBlock = `<!-- seo:begin (generated by dev/seo/build.mjs from dev/seo/site.mjs: edit those, then rebuild) -->
<title>${esc(HOME.en.title)}</title>
<meta name="description" content="${esc(HOME.en.description)}">
${ROBOTS_META}
<link rel="canonical" href="${abs('')}">
${hreflangs('', pathOf('zh', 'home'))}
${socialTags({ title: HOME.en.title, description: HOME.en.description, url: abs(''), locale: 'en_US', altLocale: 'zh_TW' })}
<meta name="application-name" content="${esc(SITE.name)}">
<meta name="apple-mobile-web-app-title" content="${esc(SITE.name)}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="${SITE.themeColor}">
<meta name="color-scheme" content="dark">
${iconLinks('./')}
${ld(GAME_LD)}
${ld(SITE_LD)}
<!-- seo:end -->`;
const idx = path.join(ROOT, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
if (!/<!-- seo:begin[\s\S]*?<!-- seo:end -->/.test(html)) throw new Error('index.html is missing the seo:begin / seo:end markers');
html = html.replace(/<!-- seo:begin[\s\S]*?<!-- seo:end -->/, () => headBlock);
fs.writeFileSync(idx, html);
console.log('updated index.html head block; base =', BASE);
