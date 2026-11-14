import { launch, sleep, ROOT } from './lib.mjs';
const t = await launch({ width: 1440, height: 900 });
await sleep(2500);
await t.page.screenshot({ path: `${ROOT}/dev/shots/shell/01_main_menu.png` });
console.log(t.problems);
await t.close();
