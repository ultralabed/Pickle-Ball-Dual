# Pickle Ball Dual

A free 3D pickleball game that runs in your browser: singles or doubles against AI opponents at DUPR levels 3.0 to 6.0, with real pickleball rules. No install, no sign-up.

**Play: https://ultralabed.github.io/Pickle-Ball-Dual/**

![Pickle Ball Dual](og-image.png)

Guides (static pages, readable without JavaScript): [How to play](https://ultralabed.github.io/Pickle-Ball-Dual/how-to-play/) · [Rules](https://ultralabed.github.io/Pickle-Ball-Dual/rules/) · [FAQ](https://ultralabed.github.io/Pickle-Ball-Dual/faq/) · [繁體中文](https://ultralabed.github.io/Pickle-Ball-Dual/zh-tw/)

## Features

- Doubles (you + AI partner vs two AI) or singles
- AI opponents at DUPR 3.0, 4.0, 5.0 and 6.0 (partner level selectable in doubles)
- Traditional side-out scoring to 11 (doubles start at 0-0-2, server 1 and 2) and rally scoring to 15, win by 2
- Real rules: diagonal serve, two-bounce rule, kitchen (non-volley zone), faults, lines are in
- Shots: drive, drop, dink, lob, automatic smash on high balls, automatic around-the-post (ATP)
- Foot-ring timing colours, slow-motion instant replays, English referee score calls
- English and Traditional Chinese (繁體中文) interface
- Plain ES modules, three.js vendored, no build step

## Controls

| Action | Keys |
|---|---|
| Move | `W` `A` `S` `D` or arrow keys |
| Drive (hold to charge) | `Space` |
| Drop / Dink / Lob | `J` / `K` / `L` |
| Aim left / right (hold as you hit) | `A` `D` or `←` `→` |
| Serve | any hit key (`Space` fast, `L` lob, `J`/`K` soft) |
| Pause / Mute / Hide hints / Skip replay | `Esc` / `M` / `H` / `R` |

Keyboard only; there are no touch controls.

## Run locally

```sh
python3 -m http.server 8000     # then open http://localhost:8000/
```

Any static server works. Every URL in the site is relative, so it also works under a sub-path.

## Tests

```sh
npm test                         # 58 simulation tests (node --test)
node dev/playtest/menus.mjs      # Playwright UI playtests (need Playwright + Chromium)
node dev/playtest/i18n.mjs
node dev/seo/check.mjs --shots=/tmp/seo-shots   # SEO/AEO checker (add --full to run all of the above too)
```

## Project layout

```
index.html           game page (generated SEO head block between seo:begin / seo:end)
src/sim/             pure deterministic simulation (rules, scoring, AI)
src/render/          three.js view         src/ui/   menus, HUD, i18n, audio, voice
src/main.js          shell: loop, input, replay
vendor/              three.js (r170)
how-to-play/ rules/ faq/ zh-tw/   static guide pages (generated)
guide.css            shared stylesheet of the guide pages
sitemap.xml robots.txt llms.txt manifest.webmanifest 404.html og-image.png favicon.svg icon-*.png
dev/seo/             generators and checker for all of the above
dev/playtest/        Playwright playtests
SPEC.md              build spec
```

## SEO / AEO files and how to change the site URL

The guide pages, `sitemap.xml`, `robots.txt`, `llms.txt`, `404.html`, `manifest.webmanifest` and the SEO `<head>` block of `index.html` are generated:

```sh
node dev/seo/build.mjs                                  # regenerate everything
node dev/seo/build.mjs --base=https://example.com/      # build for a custom domain
node dev/seo/make-images.mjs [icons|og|all]             # regenerate og-image.png and the PNG icons (Playwright)
```

The canonical base URL is defined in one place: `BASE_URL` in `dev/seo/site.mjs` (the `--base` flag overrides it). To move to a custom domain: change `BASE_URL` (and the `--base` default of `dev/seo/check.mjs` follows it), add a `CNAME` file, rebuild, and run the checker. Absolute URLs only appear in generated canonical / hreflang / Open Graph / JSON-LD / sitemap / robots / llms.txt / 404.html output; everything else stays relative. Edit the copy in `dev/seo/content-en.mjs` and `dev/seo/content-zh.mjs` (guide pages) and the `meta.*` strings in `src/ui/i18n.js` (the home page tags that follow the UI language; keep the English ones equal to `HOME_EN` in `dev/seo/site.mjs`).

Note: crawlers only read `robots.txt` at the host root; on a project sub-path rely on the sitemap and meta robots tags, or serve the site from a custom domain.

## License and credit

[MIT](LICENSE) © 2026 [Edward Shih](https://www.linkedin.com/in/edward-shih-43942786). You may use, copy, modify and redistribute this project, including commercially, as long as the copyright notice and license text stay with it. A link back to this repository or to [Edward's LinkedIn](https://www.linkedin.com/in/edward-shih-43942786) is appreciated.

three.js (vendored in `vendor/`) is © Three.js Authors, also MIT.
