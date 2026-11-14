// Plays complete autoplay matches to the game-over screen in all mode x scoring combinations, checking the scoreboard
// against state.score, the referee voice log, the game-over screen, and the replay trigger/skip flow.
import { launch, sleep, ROOT } from './lib.mjs';
const SH = `${ROOT}/dev/shots/shell`;
const t = await launch({ width: 1440, height: 900, log: true });
const { page } = t;
const res = []; const ok = (name, cond, extra = '') => { res.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };

const combos = [['doubles', 'sideout', 4], ['doubles', 'rally', 5], ['singles', 'sideout', 3], ['singles', 'rally', 6]];
let replayShots = 0;
for (const [mode, scoring, opp] of combos) {
  await page.evaluate(({ mode, scoring, opp }) => { __game.startMatch({ mode, scoring, opp, mate: 4, handed: 'R', quality: 'low', seed: 100 + opp, autoplay: true }); __game.setRender(false); }, { mode, scoring, opp });
  const firstCall = await page.evaluate(() => __game.voiceLog().slice());
  const expectFirst = mode === 'doubles' && scoring === 'sideout' ? 'zero, zero, two' : 'zero, zero';
  ok(`${mode}/${scoring}: opening score call is "${expectFirst}"`, firstCall[0] === expectFirst, JSON.stringify(firstCall));
  let mismatches = 0, chunks = 0, replays = 0, calls = 0;
  const t0 = Date.now();
  for (let guard = 0; guard < 4000; guard++) {
    const r = await page.evaluate(() => {
      const g = __game; g.advance(8);
      const s = g.getState();
      const pts = [...document.querySelectorAll('.scoreboard .pts')].map((e) => +e.textContent);
      const call = document.querySelector('.scoreboard .call').textContent;
      return { mode: g.mode, pts, call, sp: s.score.points.slice(), sc: s.score.callText, phase: s.phase, winner: s.score.winner };
    });
    chunks++;
    if (r.pts[0] !== r.sp[0] || r.pts[1] !== r.sp[1] || r.call !== r.sc) { mismatches++; console.log('  mismatch', JSON.stringify(r)); }
    if (r.mode === 'replay') {
      replays++;
      if (replays === 1 && mode === 'doubles' && scoring === 'sideout') {
        await page.evaluate(() => __game.setRender(true));
        await sleep(2500);
        await page.screenshot({ path: `${SH}/05_replay.png` });
        const pb = await page.evaluate(() => ({ mode: __game.mode, prog: __game.G.replay && __game.G.replay.progress, body: document.body.classList.contains('replay'), banner: !document.querySelector('.replay-banner').classList.contains('hidden') }));
        ok('replay is playing with banner/letterbox', pb.mode === 'replay' && pb.body && pb.banner && pb.prog > 0, JSON.stringify(pb));
        // skip with R and verify resume
        const before = await page.evaluate(() => ({ tick: __game.getState().tick, phase: __game.getState().phase }));
        await page.keyboard.press('KeyR');
        for (let k = 0; k < 40; k++) { await sleep(150); if ((await page.evaluate(() => __game.getState().tick)) > before.tick) break; }
        const after = await page.evaluate(() => ({ mode: __game.mode, tick: __game.getState().tick, phase: __game.getState().phase, body: document.body.classList.contains('replay') }));
        ok('R skips replay and game resumes', after.mode === 'play' && !after.body && after.tick > before.tick, JSON.stringify({ before, after }));
        await page.evaluate(() => __game.setRender(false));
      } else if (replays === 2 && mode === 'doubles' && scoring === 'sideout') {
        // click to skip
        await page.mouse.click(700, 450); await sleep(300);
        const m = await page.evaluate(() => __game.mode); ok('click skips replay', m === 'play', m);
      } else { await page.evaluate(() => __game.skipReplay()); }
      continue;
    }
    if (r.mode === 'over') break;
  }
  const fin = await page.evaluate(() => {
    const s = __game.getState();
    const go = document.querySelector('.screen[data-screen=gameover]');
    return { mode: __game.mode, phase: s.phase, pts: s.score.points, winner: s.score.winner, goVisible: !go.classList.contains('hidden'), goScore: [...go.querySelectorAll('.gs-pts b')].map((e) => +e.textContent), stats: __game.getStats(), voice: __game.voiceLog(), tick: s.tick };
  });
  const T = scoring === 'rally' ? 15 : 11;
  const [a, b] = fin.pts;
  ok(`${mode}/${scoring}: reached game over screen`, fin.mode === 'over' && fin.goVisible, `${fin.pts} winner=${fin.winner} sim ${Math.round(fin.tick / 120)}s real ${(Date.now() - t0) / 1000}s`);
  ok(`${mode}/${scoring}: valid final score (to ${T}, win by 2)`, Math.max(a, b) >= T && Math.abs(a - b) >= 2 && (a > b ? 0 : 1) === fin.winner, `${a}-${b}`);
  ok(`${mode}/${scoring}: game-over screen shows state score`, fin.goScore[0] === a && fin.goScore[1] === b, JSON.stringify(fin.goScore));
  ok(`${mode}/${scoring}: scoreboard matched state.score in every chunk`, mismatches === 0, `${chunks} chunks, ${replays} replays`);
  const callRe = mode === 'doubles' && scoring === 'sideout' ? /^[a-z-]+, [a-z-]+, (one|two)$/ : /^[a-z-]+, [a-z-]+$/;
  const callLines = fin.voice.filter((l) => /^[a-z-]+(, [a-z-]+)+$/.test(l));
  ok(`${mode}/${scoring}: every score call has the right shape`, callLines.length > 10 && callLines.every((l) => callRe.test(l)), `${callLines.length} calls, e.g. ${callLines.slice(1, 4).join(' | ')}`);
  const other = new Set(fin.voice.filter((l) => !/^[a-z-]+(, [a-z-]+)+$/.test(l)));
  console.log('  other referee lines:', [...other].slice(0, 14).join(' | '));
  console.log('  stats', JSON.stringify(fin.stats));
  if (mode === 'doubles' && scoring === 'sideout') { await page.evaluate(() => __game.setRender(true)); await sleep(1200); await page.screenshot({ path: `${SH}/08_game_over.png` }); await page.evaluate(() => __game.setRender(false)); }
}
console.log('console problems:', t.problems);
ok('no console errors/warnings', t.problems.length === 0, t.problems.join(' | '));
console.log(res.filter((r) => r[0] === 'FAIL').length, 'failures of', res.length);
await t.close();
