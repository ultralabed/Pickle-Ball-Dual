import test from 'node:test';
import assert from 'node:assert/strict';
import { aiSim } from './lib/util.mjs';
import { COURT } from '../src/sim/index.js';

const PHASES = new Set(['preServe', 'serve', 'rally', 'pointOver', 'gameOver']);
const ANIMS = new Set(['idle', 'ready', 'run', 'serveReady', 'serve', 'drive', 'drop', 'dink', 'lob', 'smash',
  'volley', 'celebrate', 'dejected']);
const EMOS = new Set(['neutral', 'happy', 'sad', 'focused']);
const FAULTS = new Set(['out', 'net', 'doubleBounce', 'kitchen', 'twoBounceRule', 'serveShort', 'serveWrongCourt', 'bodyHit']);
const LEVELS = [[3, 3], [4, 4], [5, 5], [6, 6], [3, 6], [6, 3], [4, 5], [5, 4], [3, 4], [6, 5]];
const TICK_CAP = 900000; // 2 hours of game time
const SEEDS = 20;

function finite(...v) { return v.every((x) => Number.isFinite(x)); }

function checkState(s, ctx) {
  assert.ok(PHASES.has(s.phase), `${ctx} phase ${s.phase}`);
  const b = s.ball;
  assert.ok(finite(b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z), `${ctx} ball NaN`);
  assert.ok(Math.abs(b.pos.x) <= 8.01 && Math.abs(b.pos.z) <= 11.51 && b.pos.y >= 0 && b.pos.y <= 14.01,
    `${ctx} ball out of arena ${JSON.stringify(b.pos)}`);
  assert.ok(b.bounces >= 0 && b.bounces < 50);
  for (const p of s.players) {
    assert.ok(finite(p.pos.x, p.pos.z, p.vel.x, p.vel.z, p.facing, p.anim.t), `${ctx} player NaN`);
    assert.ok(Math.abs(p.pos.x) <= 7.51, `${ctx} player x ${p.pos.x}`);
    const side = p.team === 0 ? p.pos.z : -p.pos.z;
    assert.ok(side >= 0.29 && side <= 10.51, `${ctx} player ${p.id} crossed / left arena z=${p.pos.z}`);
    assert.ok(ANIMS.has(p.anim.name), `${ctx} anim ${p.anim.name}`);
    assert.ok(p.anim.side === 'forehand' || p.anim.side === 'backhand');
    assert.ok(EMOS.has(p.emotion));
    assert.ok(Math.hypot(p.vel.x, p.vel.z) < 8, `${ctx} speed`);
  }
  const sc = s.score;
  assert.ok(Number.isInteger(sc.points[0]) && Number.isInteger(sc.points[1]) && sc.points[0] >= 0 && sc.points[1] >= 0);
  assert.ok(sc.serverNumber === 1 || sc.serverNumber === 2);
  assert.ok(/^\d+ - \d+( - [12])?$/.test(sc.callText), `${ctx} call ${sc.callText}`);
  assert.ok(s.rally.twoBounceRemaining >= 0 && s.rally.twoBounceRemaining <= 2);
  if (s.phase === 'preServe') assert.ok(s.phaseTime < 6, `${ctx} stuck in preServe`);
  if (s.phase === 'pointOver') assert.ok(s.phaseTime < 3, `${ctx} stuck in pointOver`);
  assert.ok(s.phaseTime < 90, `${ctx} stuck in ${s.phase} (${s.phaseTime}s)`);
}

function playGame(mode, scoring, seed) {
  const [d0, d1] = LEVELS[seed % LEVELS.length];
  const sim = aiSim(mode, scoring, 9000 + seed, d0, d1);
  const s = sim.state;
  const ctx = `${mode}/${scoring}/seed${seed}(${d0}v${d1})`;
  let rallyEnds = 0, scored = 0, faults = 0, serveReadies = 0, gameOvers = 0, pendingFault = false, lastType = null;
  while (s.phase !== 'gameOver') {
    sim.step({});
    if (s.tick > TICK_CAP) assert.fail(`${ctx} did not finish within ${TICK_CAP} ticks, score ${s.score.points}`);
    if (s.tick % 20 === 0) checkState(s, ctx);
    for (const e of sim.drainEvents()) {
      if (e.type === 'fault') { faults++; assert.ok(FAULTS.has(e.reason), e.reason); pendingFault = true; }
      if (e.type === 'rallyEnd') {
        assert.ok(pendingFault, `${ctx} rallyEnd without fault`);
        pendingFault = false;
        rallyEnds++;
        if (e.pointScored) scored++;
        assert.ok(e.hits >= 1, `${ctx} rally with no hits`);
      }
      if (e.type === 'serveReady') {
        serveReadies++;
        const srv = s.players[e.serverId];
        assert.equal(srv.team, s.score.servingTeam);
        assert.equal(e.callWords.length, mode === 'doubles' && scoring === 'sideout' ? 3 : 2);
        assert.ok(srv.pos.z * (srv.team === 0 ? 1 : -1) >= 7.0, 'server behind baseline');
        const rcv = s.players[s.score.receiverId];
        assert.notEqual(rcv.team, srv.team);
        assert.ok(srv.pos.x * rcv.pos.x < 0, 'receiver diagonal');
      }
      if (e.type === 'hit') {
        assert.ok(Number.isFinite(e.speed) && e.speed > 0.5 && e.speed < 40, `${ctx} hit speed ${e.speed}`);
        assert.ok(['drive', 'drop', 'dink', 'lob', 'smash', 'serve'].includes(e.shot), e.shot);
        assert.ok(e.side === 'forehand' || e.side === 'backhand');
      }
      if (e.type === 'gameOver') gameOvers++;
      lastType = e.type;
    }
  }
  checkState(s, ctx);
  sim.drainEvents();
  // final-score rules
  const T = scoring === 'rally' ? 15 : 11;
  const [a, b] = s.score.points;
  const w = s.score.winner;
  assert.ok(w === 0 || w === 1, `${ctx} winner`);
  const win = s.score.points[w], lose = s.score.points[1 - w];
  assert.ok(win >= T, `${ctx} winner has ${win}`);
  assert.ok(win - lose >= 2, `${ctx} win by 2: ${a}-${b}`);
  if (win > T) assert.equal(win - lose, 2, `${ctx} overtime ends exactly at +2: ${a}-${b}`);
  else assert.ok(lose <= T - 2);
  assert.equal(a + b, scored, `${ctx} points == scored rallies`);
  assert.equal(rallyEnds, faults);
  assert.equal(gameOvers, 1, `${ctx} gameOver event`);
  return { rallyEnds, ticks: s.tick, score: `${a}-${b}` };
}

for (const mode of ['doubles', 'singles']) {
  for (const scoring of ['sideout', 'rally']) {
    test(`soak: ${SEEDS} AI matches ${mode}/${scoring} run to gameOver legally`, () => {
      let rallies = 0, ticks = 0;
      for (let seed = 0; seed < SEEDS; seed++) {
        const r = playGame(mode, scoring, seed);
        rallies += r.rallyEnds; ticks += r.ticks;
      }
      console.log(`# soak ${mode}/${scoring}: ${SEEDS} games, ${rallies} rallies, avg game ${(ticks / SEEDS / 120).toFixed(0)}s of sim time`);
    });
  }
}

test('gameOver event fires exactly once per game', () => {
  const sim = aiSim('singles', 'rally', 31, 3, 3);
  let n = 0;
  while (sim.state.phase !== 'gameOver' && sim.state.tick < TICK_CAP) {
    sim.step({});
    for (const e of sim.drainEvents()) if (e.type === 'gameOver') { n++; assert.equal(e.winnerTeam, sim.state.score.winner); }
  }
  for (let i = 0; i < 600; i++) { sim.step({}); for (const e of sim.drainEvents()) if (e.type === 'gameOver') n++; }
  assert.equal(n, 1);
  assert.equal(sim.state.phase, 'gameOver');
});

test('court constants match the spec', () => {
  assert.equal(COURT.halfW, 3.05);
  assert.equal(COURT.halfL, 6.705);
  assert.equal(COURT.kitchen, 2.134);
  assert.equal(COURT.postX, 3.355);
  assert.equal(COURT.netH, 0.914);
  assert.equal(COURT.netHC, 0.864);
});
