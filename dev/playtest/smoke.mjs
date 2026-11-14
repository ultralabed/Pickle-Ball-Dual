import { launch, sleep, ROOT } from './lib.mjs';
const t = await launch();
const { page } = t;
await sleep(1500);
await page.screenshot({ path: `${ROOT}/dev/shots/shell/_smoke_menu.png` });
console.log('mode', await page.evaluate(() => __game.mode));
console.log('problems', t.problems);
await t.close();
