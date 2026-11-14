import { launch, sleep, ROOT } from './lib.mjs';
for (const [w, h] of [[1000, 800], [700, 900], [1280, 720]]) {
  const t = await launch({ width: w, height: h, query: '?pdb=1' });
  const { page } = t;
  await page.evaluate(() => { __game.startMatch({ mode: 'doubles', scoring: 'sideout', opp: 4, handed: 'R', quality: 'medium', seed: 7 }); __game.freeze(true); __game.settleView(30, 0.1); });
  await page.screenshot({ path: `${ROOT}/dev/shots/shell/_narrow_${w}x${h}.png` });
  console.log(w, h, t.problems);
  await t.close();
}
