// Takes the gameplay screenshots (1440x900, DSF 1): human serving, mid-rally with timing ring + landing marker, smash and ATP moments.
import { launch, sleep, ROOT } from './lib.mjs';
const SH = `${ROOT}/dev/shots/shell`;
const W = +process.argv[2] || 1440, H = +process.argv[3] || 900, tag = process.argv[4] || '';
const t = await launch({ width: W, height: H, query: '?pdb=1' });
const { page } = t;
// 1. human serving
await page.evaluate(() => { __game.startMatch({ mode: 'doubles', scoring: 'sideout', opp: 4, mate: 4, handed: 'R', quality: 'high', seed: 7 }); __game.freeze(true); });
await page.evaluate(() => __game.settleView(30, 0.1));
await page.screenshot({ path: `${SH}/04_human_serving${tag}.png` });
// 2. mid-rally: autoplay until the ball is incoming to the human and has not bounced, then hand control back
await page.evaluate(() => {
  const g = __game; g.freeze(false); g.setReplayEnabled(false); g.setAutoplay(true);
  g.advance(60, { until: (s) => s.phase === 'rally' && s.rally.hits >= 3 && s.ball.bounces === 0 && s.ball.lastHitBy !== null && s.players[s.ball.lastHitBy].team === 1 && s.ball.vel.z > 0 && s.ball.pos.z < -1 && s.ball.pos.z > -5 && s.ball.landing && s.ball.landing.z > 2 });
  g.setAutoplay(false); g.freeze(true);
});
await page.evaluate(() => __game.settleView(30, 0.1));
await page.evaluate(() => __game.hud.hideBanner());
await page.screenshot({ path: `${SH}/03_gameplay_rally${tag}.png` });
// ball close: the ring turns green / lime when pressing a swing key would connect
await page.evaluate(() => { const g = __game; g.freeze(false); g.advance(4, { until: () => g.swingCue() >= 2 }); g.freeze(true); g.hud.hideBanner(); g.settleView(6, 0.03); });
await page.screenshot({ path: `${SH}/03b_gameplay_ring${tag}.png` });
console.log(await page.evaluate(() => ({ cue: __game.swingCue(), info: __game.swingCueInfo(), ball: __game.getState().ball.pos })));
// 3. smash / ATP moments between strong AI
for (const want of ['smash', 'atp']) {
  await page.evaluate(() => { __game.freeze(false); __game.setReplayEnabled(false); });
  const found = await page.evaluate(async (want) => {
    const g = __game;
    g.startMatch({ mode: 'doubles', scoring: 'rally', opp: 6, mate: 6, handed: 'R', quality: 'high', seed: want === 'smash' ? 31 : 77, autoplay: true, humanDupr: 6 });
    let got = null;
    for (let i = 0; i < 240 && !got; i++) {
      g.advance(2, { until: () => false });
      g.G.evlog.length = 0;
      // step in small increments looking for the event
      for (let k = 0; k < 240 && !got; k++) {
        const before = g.getState().tick; g.advance(1 / 120);
        for (const e of g.drainLog()) if (e.type === 'hit' && (want === 'smash' ? e.shot === 'smash' : e.atp)) got = e;
      }
      if (g.mode !== 'play') g.skipReplay();
    }
    return got ? { t: got.tick, shot: got.shot, atp: got.atp, p: got.playerId } : null;
  }, want);
  console.log(want, found);
  if (found) {
    await page.evaluate(() => { __game.freeze(true); __game.advance(0.04); __game.hud.hideBanner(); __game.settleView(20, 0.1); });
    await page.screenshot({ path: `${SH}/06_${want}_moment${tag}.png` });
  }
}
console.log('problems', t.problems);
await t.close();
