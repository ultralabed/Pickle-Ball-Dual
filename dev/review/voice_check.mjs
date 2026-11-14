import { launch, sleep } from '../playtest/lib.mjs';
const t = await launch({ width: 400, height: 300, log: false });
const r = await t.page.evaluate(async () => {
  const s = window.speechSynthesis; if (!s) return 'no speechSynthesis';
  const out = { voices: s.getVoices().length, p0: s.paused };
  s.pause(); out.afterPause = s.paused; s.cancel(); out.afterCancel = s.paused;
  return out;
});
console.log(JSON.stringify(r));
await t.close();
