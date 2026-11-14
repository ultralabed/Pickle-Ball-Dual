// Plays the game like a person: only page.keyboard presses (WASD / Space / J K L), reading window.__game.getState()
// the way a player reads the screen. Usage:
//   node human.mjs --opp 4 --mode doubles --scoring sideout --secs 300 --scale 1 --seed 5 --skill cue|naive --out result.json
import { launch, sleep } from './lib.mjs';
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OPP = +arg('opp', 4), MODE = arg('mode', 'doubles'), SCORING = arg('scoring', 'sideout'), SECS = +arg('secs', 240);
const SCALE = +arg('scale', 1), SEED = +arg('seed', 5), SKILL = arg('skill', 'cue'), OUT = arg('out', ''), SERVE = arg('serve', 'mix');
const W = +arg('w', 480), H = +arg('h', 300), QUALITY = arg('quality', 'low');
const FORCE = arg('force', '') ? JSON.parse(arg('force', '')) : null;   // e.g. [["Space",0,40],["Space",-1,40],["KeyJ",1,0]]
let forceIdx = 0; const forced = [];
const RENDER = arg('render', '0') === '1';
const REACT = +arg('react', 120);   // human reaction delay in ms (real time)

const t = await launch({ width: W, height: H, log: false });
const { page } = t;
await page.evaluate(({ MODE, SCORING, OPP, SEED, QUALITY, SCALE, RENDER }) => {
  __game.setReplayEnabled(false);
  __game.startMatch({ mode: MODE, scoring: SCORING, opp: OPP, mate: 4, handed: 'R', quality: QUALITY, seed: SEED });
  __game.setTimeScale(SCALE);
  if (!RENDER) __game.setRender(false);
}, { MODE, SCORING, OPP, SEED, QUALITY, SCALE, RENDER });

const held = new Set();
async function setKeys(want) {
  for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
const me0 = (i) => i.me;
const rnd = (a, b) => a + Math.random() * (b - a);
const stats = { rallies: [], humanHits: 0, shots: {}, serves: 0, serveFaults: 0, aimTests: [], faultsBy: {}, points: [0, 0], winner: null, elapsed: 0 };
let aimPref = 1, pendingHit = null;

const t0 = Date.now();
let lastPhase = null, serveAt = null, swingCooldown = 0, lastSwingKey = null, tickAcc = 0;
let pendingSwing = null;
while ((Date.now() - t0) / 1000 < SECS) {
  const info = await page.evaluate(() => {
    const g = __game, s = g.getState();
    const p = s.players[0];
    return { phase: s.phase, time: s.time, hits: s.rally.hits, tb: s.rally.twoBounceRemaining,
      ball: s.ball.pos, bv: s.ball.vel, bb: s.ball.bounces, land: s.ball.landing, lastBy: s.ball.lastHitBy,
      me: { x: p.pos.x, z: p.pos.z, isServer: p.isServer, isReceiver: p.isReceiver, anim: p.anim.name, at: p.anim.t },
      mate: s.players[1] ? { x: s.players[1].pos.x, z: s.players[1].pos.z } : null,
      opps: s.players.filter((q) => q.team === 1).map((q) => ({ x: q.pos.x, z: q.pos.z })),
      pred: (s.phase === 'rally' || s.phase === 'serve') ? g.predict(2.5).samples.map((m) => [m.t, m.x, m.y, m.z, m.b, m.vy]) : [], cue: g.swingCue(), cueI: g.swingCueInfo(), mode: g.mode, score: s.score.points.slice(), winner: s.score.winner, ev: g.drainLog() };
  });
  for (const e of info.ev) {
    if (e.type === 'hit' && e.playerId === 0 && !e.isServe && FORCE) pendingHit = { shot: e.shot, atp: e.atp, power: e.power, speed: e.speed, pos: e.pos, tick: e.tick, f: forced[forced.length - 1] };
    else if (e.type === 'bounce' && pendingHit && e.tick > pendingHit.tick) { stats.landings = stats.landings || []; stats.landings.push({ ...pendingHit, land: e.pos, inB: e.inBounds }); pendingHit = null; }
    else if (e.type === 'hit' && pendingHit && e.playerId !== 0) pendingHit = null;
    if (process.env.EV && ['hit','fault','bounce','rallyEnd'].includes(e.type)) console.log('EV', e.type, JSON.stringify({ t: +(e.tick/120).toFixed(2), p: e.playerId, shot: e.shot, reason: e.reason, pos: e.pos && { x: +(e.pos.x||0).toFixed(1), y: +(e.pos.y||0).toFixed(2), z: +(e.pos.z||0).toFixed(1) }, spd: e.speed && +e.speed.toFixed(1), inB: e.inBounds, team: e.team, vol: e.isVolley, hits: e.hits }));
    if (e.type === 'hit' && e.playerId === 0) { stats.humanHits++; const k = e.isServe ? 'serve' : e.atp ? 'atp' : e.shot; stats.shots[k] = (stats.shots[k] || 0) + 1; }
    if (e.type === 'fault') stats.faultsBy[`${e.team === 0 ? 'us' : 'them'}:${e.reason}`] = (stats.faultsBy[`${e.team === 0 ? 'us' : 'them'}:${e.reason}`] || 0) + 1;
    if (e.type === 'rallyEnd') stats.rallies.push({ hits: e.hits, winner: e.winnerTeam, reason: e.reason });
    if (e.type === 'hit' && e.playerId === 0 && e.isServe) stats.serves++;
  }
  stats.points = info.score;
  if (process.env.TRACE && (info.phase==='rally'||info.phase==='serve')) console.log(`${info.time.toFixed(2)} ph=${info.phase} h=${info.hits} me=(${me0(info).x.toFixed(1)},${me0(info).z.toFixed(1)}) ball=(${info.ball.x.toFixed(1)},${info.ball.y.toFixed(2)},${info.ball.z.toFixed(1)}) b=${info.bb} land=${info.land?info.land.x.toFixed(1)+','+info.land.z.toFixed(1)+' t'+info.land.t.toFixed(2):'-'} cue=${info.cue} anim=${info.me.anim}`);
  if (info.mode === 'over' || info.winner !== null && info.phase === 'gameOver') { stats.winner = info.winner; break; }
  const me = info.me;
  const want = new Set();
  const goto = (tx, tz, tol = 0.12) => {
    const dx = tx - me.x, dz = tz - me.z;
    if (dx > tol) want.add('KeyD'); else if (dx < -tol) want.add('KeyA');
    if (dz > tol) want.add('KeyS'); else if (dz < -tol) want.add('KeyW');
  };
  const swing = async (key, aim, holdMs = null) => {
    // aim: -1 / 0 / 1 -> hold A / D while pressing
    const ak = aim < 0 ? 'KeyA' : aim > 0 ? 'KeyD' : null;
    if (ak) { want.delete('KeyA'); want.delete('KeyD'); want.add(ak); }
    await setKeys(want);
    await sleep(25);
    if (key === 'Space') { const hold = holdMs !== null ? holdMs : (Math.random() < 0.35 ? rnd(300, 600) : rnd(40, 90)); await page.keyboard.down('Space'); await sleep(hold); await page.keyboard.up('Space'); }
    else await page.keyboard.press(key);
    swingCooldown = Date.now() + 450;
  };

  if (info.phase === 'preServe') {
    if (me.isServer) {
      goto(me.x > 0 ? 1.8 : -1.8, 7.1, 0.2);
      if (serveAt === null) serveAt = Date.now() + rnd(900, 1500);
      if (Date.now() >= serveAt) {
        const keys = SERVE === 'mix' ? ['Space', 'KeyJ', 'KeyK', 'KeyL'] : [SERVE];
        const k = keys[Math.floor(Math.random() * keys.length)];
        await swing(k === 'KeyK' || k === 'KeyJ' ? k : k, 0);
        serveAt = null;
      }
    } else {
      serveAt = null;
      goto(me.x > 0 ? 1.6 : -1.6, me.isReceiver ? 6.9 : 6.4, 0.25);
    }
  } else if (info.phase === 'rally' || info.phase === 'serve') {
    const incoming = info.lastBy !== null && info.lastBy >= (MODE === 'doubles' ? 2 : 1);
    if (incoming) {
      // chase: where will the ball be playable (after its bounce, below ~1.2 m, past its apex)? stand beside it, forehand side
      let pick = null;
      for (const m of info.pred) { if (m[4] >= 1 && m[2] <= 1.25 && m[5] <= 0.6 && m[3] > 0) { pick = m; break; } }
      let tx = info.ball.x - 0.5, tz = info.ball.z + 0.5;
      if (pick) { tx = pick[1] - 0.5; tz = pick[3] + 0.5; }
      else if (info.land && info.land.z > 0) { tx = info.land.x - 0.5; tz = info.land.z + 0.8; }
      goto(tx, Math.min(tz, 8.5), 0.12);
      const dist = Math.hypot(info.ball.x - me.x, info.ball.z - me.z);
      const ready = SKILL === 'cue' ? (info.cueI.tc !== null && info.cueI.level !== 3 && info.cueI.tc >= 0.2 && info.cueI.tc <= 0.34) : dist < 1.5 && info.ball.y < 2.0 && info.bb >= 1;
      const canvol = info.tb === 0 && Math.abs(me.z) > 2.4;
      if (ready && Date.now() > swingCooldown && me.anim !== 'drive' && (info.bb >= 1 || canvol) && !pendingSwing) {
        // choose shot like a player (safe aim most of the time)
        let key = 'Space', aim = Math.random() < 0.7 ? 0 : (Math.random() < 0.5 ? -1 : 1);
        const deep = me.z > 5.2, kitchenZone = me.z < 3.8;
        if (info.ball.y > 1.6) key = 'Space';
        else if (kitchenZone) key = Math.random() < 0.8 ? 'KeyK' : 'Space';
        else if (info.hits <= 2 && !deep) key = 'KeyJ';
        else if (info.hits <= 2) key = Math.random() < 0.55 ? 'KeyJ' : 'Space';        // 3rd shot: drop or drive from the baseline
        else if (deep) key = Math.random() < 0.6 ? 'Space' : Math.random() < 0.5 ? 'KeyJ' : 'KeyL';
        else key = Math.random() < 0.6 ? 'KeyK' : 'KeyJ';
        want.delete('KeyW'); want.delete('KeyA'); want.delete('KeyS'); want.delete('KeyD');   // plant the feet before swinging
        let hold = null;
        if (FORCE) { const f = FORCE[forceIdx++ % FORCE.length]; key = f[0]; aim = f[1]; hold = f[2]; forced.push({ key, aim, hold, t: info.time }); }
        await sleep(rnd(REACT * 0.5, REACT));
        await swing(key, aim, hold);
      }
    } else {
      // recover: serving side drops back for the 3rd shot then closes to the kitchen line
      const ourHits = info.hits;
      const tz = (ourHits <= 2 && info.lastBy !== null && info.lastBy < (MODE === 'doubles' ? 2 : 1)) ? 6.2 : 3.5;
      let tx = Math.max(-2.0, Math.min(2.0, info.ball.x * 0.5));
      if (info.mate && MODE === 'doubles') tx = info.mate.x > 0 ? -1.5 : 1.5;
      goto(tx, incoming ? me.z : tz, 0.3);
    }
  } else {
    serveAt = null;
    // pointOver: idle
  }
  await setKeys(want);
  await sleep(35);
  lastPhase = info.phase;
}
await setKeys(new Set());
stats.elapsed = (Date.now() - t0) / 1000;
const rl = stats.rallies.map((r) => r.hits);
stats.summary = {
  opp: OPP, mode: MODE, scoring: SCORING, skill: SKILL, rallies: rl.length, avgRally: +(rl.reduce((a, b) => a + b, 0) / Math.max(1, rl.length)).toFixed(2),
  longest: Math.max(0, ...rl), medianRally: rl.slice().sort((a, b) => a - b)[Math.floor(rl.length / 2)] || 0, rallies5plus: rl.filter((x) => x >= 5).length,
  rallyWins: stats.rallies.filter((r) => r.winner === 0).length, finalScore: stats.points, winner: stats.winner, humanHits: stats.humanHits, shots: stats.shots,
  faultsBy: stats.faultsBy, simSeconds: Math.round(stats.elapsed * SCALE),
};
console.log(JSON.stringify(stats.summary));
if (stats.landings) {
  const groups = {};
  for (const l of stats.landings) { const k = `${l.f.key}${l.f.hold > 200 ? '(hold)' : ''} aim${l.f.aim}`; (groups[k] ||= []).push(l); }
  stats.landingSummary = Object.fromEntries(Object.entries(groups).map(([k, a]) => [k, { n: a.length, shots: [...new Set(a.map((l) => l.atp ? 'atp' : l.shot))].join('/'), meanX: +(a.reduce((x, l) => x + l.land.x, 0) / a.length).toFixed(2), meanZ: +(a.reduce((x, l) => x + l.land.z, 0) / a.length).toFixed(2), inPct: Math.round(100 * a.filter((l) => l.inB).length / a.length), power: +(a.reduce((x, l) => x + (l.power || 0), 0) / a.length).toFixed(2), speed: +(a.reduce((x, l) => x + l.speed, 0) / a.length).toFixed(1) }]));
  console.log(JSON.stringify(stats.landingSummary, null, 1));
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(stats, null, 1));
await t.close();
