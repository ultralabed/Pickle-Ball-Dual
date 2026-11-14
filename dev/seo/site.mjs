// Single source of truth for the site-wide SEO constants. `node dev/seo/build.mjs` regenerates every file that must
// contain an absolute URL (canonical / hreflang / Open Graph / JSON-LD / sitemap / robots / llms.txt / 404.html /
// the SEO block of index.html) from BASE_URL below. Change it here (or pass --base=https://example.com/) and rebuild.
export const BASE_URL = 'https://ultralabed.github.io/Pickle-Ball-Dual/';

export const SITE = {
  name: 'Pickle Ball Dual',
  lastmod: '2026-11-14',
  themeColor: '#0b1a2c',
  author: { name: 'Edward Shih', url: 'https://www.linkedin.com/in/edward-shih-43942786', github: 'https://github.com/ultralabed' },
  repo: 'https://github.com/ultralabed/pickle-ball-dual',
  ogImage: 'og-image.png',
  ogImageAlt: 'Pickle Ball Dual: a 3D pickleball rally in the browser',
};

/** home page title/description: also mirrored by src/ui/i18n.js (en app.docTitle / app.desc); check.mjs verifies they match */
export const HOME_EN = {
  title: 'Pickle Ball Dual — Free 3D Pickleball Game in Your Browser',
  description: 'Play Pickle Ball Dual, a free 3D pickleball game in your browser. Singles or doubles vs AI from DUPR 3.0 to 6.0, real rules, no install or sign-up.',
};

/** every public page: path relative to the site root, and its language pair */
export const PAGES = [
  { id: 'home',  en: '',                  zh: 'zh-tw/' },
  { id: 'how',   en: 'how-to-play/',      zh: 'zh-tw/how-to-play/' },
  { id: 'rules', en: 'rules/',            zh: 'zh-tw/rules/' },
  { id: 'faq',   en: 'faq/',              zh: 'zh-tw/faq/' },
];

export const abs = (base, p = '') => new URL(p, base).href;
