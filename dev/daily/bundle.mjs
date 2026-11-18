// Build the daily challenge as ONE self-contained HTML fragment, for hosts that take a single file (e.g. a claude.ai artifact).
//   node dev/daily/bundle.mjs <out.html>
// Needs esbuild (npx fetches it). The repo itself stays build-free: daily/index.html runs straight from the ES modules.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2];
if (!out) { console.error('usage: node dev/daily/bundle.mjs <out.html>'); process.exit(1); }

const js = execFileSync('npx', ['--yes', 'esbuild@0.24.0', 'src/daily/main.js', '--bundle', '--format=esm', '--minify', '--target=es2020',
  '--alias:three=./vendor/three.module.js', '--log-level=warning'], { cwd: ROOT, maxBuffer: 64 << 20 }).toString();
const css = `${fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8')}\n${fs.readFileSync(path.join(ROOT, 'src/daily/daily.css'), 'utf8')}`;
// a closing script tag inside the bundled code would end the inline script early
const safeJs = js.split('</script').join('<\\/script');
const html = `<title>每日匹克球挑戰</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
</style>
<canvas id="game" role="img" aria-label="Pickleball court"></canvas>
<div id="dc"></div>
<script type="module">
document.body.classList.add('daily');
${safeJs}
</script>
`;
fs.writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
