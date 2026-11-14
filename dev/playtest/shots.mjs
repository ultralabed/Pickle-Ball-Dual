// Keyboard-path shot test: for each key/aim combination, creates many "incoming ball" scenarios (singles vs 3.0 AI), lets a
// keyboard-only agent run to the ball and press the forced key at the cue, then records which shot came out and where it landed.
import { launch, sleep } from './lib.mjs';
import fs from 'node:fs';
const REPS = +(process.argv[2] || 6);
const t = await launch({ width: 480, height: 300, log: false });
const { page } = t;
const held = new Set();
async function setKeys(want) {
  for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
const COMBOS = [];
for (const aim of [-1, 0, 1]) COMBOS.push({ key: 'Space', aim, hold: 50, name: 'drive(tap)' });
COMBOS.push({ key: 'Space', aim: 0, hold: 650, name: 'drive(charged)' });
for (const aim of [-1, 0, 1]) COMBOS.push({ key: 'KeyJ', aim, hold: 0, name: 'drop' });
for (const aim of [-1, 0, 1]) COMBOS.push({ key: 'KeyK', aim, hold: 0, name: 'dink' });
for (const aim of [-1, 0, 1]) COMBOS.push({ key: 'KeyL', aim, hold: 0, name: 'lob' });
const rows = [];

async function scenario(seed, combo, kind) {
  await page.evaluate(({ seed, kind }) => {
    const g = __game; g.setRender(false); g.setReplayEnabled(false);
    g.startMatch({ mode: 'singles', scoring: 'rally', opp: 3, handed: 'R', quality: 'low', seed, autoplay: true });
    g.advance(40, { until: (s) => s.phase === 'rally' && s.ball.lastHitBy === 1 && s.ball.bounces === 0 && s.ball.vel.z > 0 && s.ball.pos.z < -0.5 && s.ball.pos.z > -6 && s.rally.hits >= 2 });
    const s = g.getState();
    if (kind === 'smash') {   // a floaty ball dropping near the human, two-bounce rule satisfied
      s.internal.sp = 0; s.rally.twoBounceRemaining = 0; s.ball.bounces = 0; s.ball.lastHitBy = 1;
      s.players[0].pos.x = 0.2; s.players[0].pos.z = 5.2;
      s.ball.pos.x = 0.6; s.ball.pos.y = 3.0; s.ball.pos.z = 4.4; s.ball.vel.x = 0; s.ball.vel.y = 1.0; s.ball.vel.z = 0.6;
    }
    if (kind === 'atp') {
      s.rally.twoBounceRemaining = 0; s.ball.lastHitBy = 1; s.internal.sp = 0;
      s.players[0].pos.x = 3.9; s.players[0].pos.z = 1.0;
      s.ball.pos.x = 4.1; s.ball.pos.y = 1.0; s.ball.pos.z = 0.2; s.ball.vel.x = 0; s.ball.vel.y = 0.4; s.ball.vel.z = 1.2; s.ball.bounces = 1;
    }
    g.setAutoplay(false); g.G.evlog.length = 0;
  }, { seed, kind });
  const t0 = Date.now();
  let result = null, swung = false;
  while (Date.now() - t0 < 7000) {
    const info = await page.evaluate(() => {
      const g = __game, s = g.getState(), p = s.players[0];
      return { phase: s.phase, me: { x: p.pos.x, z: p.pos.z, anim: p.anim.name }, ball: s.ball.pos, bb: s.ball.bounces, cueI: g.swingCueInfo(), cue: g.swingCue(), ev: g.drainLog(),
        pred: (s.phase === 'rally') ? g.predict(2.0).samples.map((m) => [m.t, m.x, m.y, m.z, m.b, m.vy]) : [] };
    });
    for (const e of info.ev) {
      if (e.type === 'hit' && e.playerId === 0) result = { shot: e.atp ? 'atp' : e.shot, power: e.power, speed: e.speed, hitY: e.pos.y, hitX: e.pos.x, volley: e.isVolley, land: null };
      else if (e.type === 'hit' && result && !result.land) { result = null; }   // another hit before the first bounce: not this shot's landing
      else if (e.type === 'bounce' && result && !result.land) { result.land = e.pos; result.inB = e.inBounds; }
      else if (e.type === 'fault' && result && !result.land) { result.fault = e.reason; }
    }
    if (result && (result.land || result.fault)) break;
    if (info.phase !== 'rally' && info.phase !== 'serve') { if (result) break; if (info.phase === 'pointOver') break; }
    const want = new Set();
    const me = info.me;
    if (!swung && !result) {
      let tx = info.ball.x - 0.45, tz = info.ball.z + 0.5;
      const pick = kind === 'normal' ? info.pred.find((m) => m[4] >= 1 && m[2] <= 1.25 && m[5] <= 0.6 && m[3] > 0) : null;
      if (pick) { tx = pick[1] - 0.5; tz = pick[3] + 0.5; }
      else if (kind !== 'normal') { tx = me.x; tz = me.z; }
      const dx = tx - me.x, dz = tz - me.z;
      if (dx > 0.12) want.add('KeyD'); else if (dx < -0.12) want.add('KeyA');
      if (dz > 0.12) want.add('KeyS'); else if (dz < -0.12) want.add('KeyW');
      const tc = info.cueI.tc;
      const okVol = kind !== 'normal';
      if (tc !== null && info.cueI.level !== 3 && tc >= 0.2 && tc <= 0.34 && (info.bb >= 1 || okVol)) {
        want.clear();
        if (combo.aim) want.add(combo.aim < 0 ? 'KeyA' : 'KeyD');
        await setKeys(want);
        if (combo.key === 'Space') { await page.keyboard.down('Space'); await sleep(combo.hold); await page.keyboard.up('Space'); } else await page.keyboard.press(combo.key);
        swung = true;
      }
    }
    await setKeys(swung ? new Set() : want);
    await sleep(25);
  }
  await setKeys(new Set());
  return result;
}

let seed = 500;
for (const combo of COMBOS) {
  const rs = [];
  for (let i = 0; i < REPS; i++) { const r = await scenario(seed++, combo, 'normal'); if (r) rs.push(r); }
  rows.push({ combo: `${combo.name} aim${combo.aim}`, rs });
  const ls = rs.filter((r) => r.land);
  const m = (f) => ls.length ? +(ls.reduce((a, r) => a + f(r), 0) / ls.length).toFixed(2) : null;
  console.log(`${combo.name.padEnd(15)} aim${String(combo.aim).padStart(2)}  hits ${rs.length}/${REPS}  shots ${[...new Set(rs.map((r) => r.shot))].join('/')}  landX ${m((r) => r.land.x)}  landZ ${m((r) => r.land.z)}  in ${ls.filter((r) => r.inB).length}/${ls.length}  faults ${rs.filter((r) => r.fault).map((r) => r.fault).join(',')}  speed ${m((r) => r.speed)}`);
}
for (const [kind, combo] of [['smash', { key: 'Space', aim: 0, hold: 60, name: 'smash(tap)' }], ['smash', { key: 'Space', aim: 1, hold: 60, name: 'smash(aim+1)' }], ['smash', { key: 'Space', aim: -1, hold: 60, name: 'smash(aim-1)' }], ['atp', { key: 'KeyJ', aim: 0, hold: 0, name: 'atp(J)' }], ['atp', { key: 'Space', aim: 0, hold: 60, name: 'atp(Space)' }]]) {
  const rs = [];
  for (let i = 0; i < Math.max(3, REPS - 2); i++) { const r = await scenario(seed++, combo, kind); if (r) rs.push(r); }
  const ls = rs.filter((r) => r.land);
  const m = (f) => ls.length ? +(ls.reduce((a, r) => a + f(r), 0) / ls.length).toFixed(2) : null;
  console.log(`${combo.name.padEnd(15)}  hits ${rs.length}  shots ${[...new Set(rs.map((r) => r.shot))].join('/')}  landX ${m((r) => r.land.x)} landZ ${m((r) => r.land.z)}  in ${ls.filter((r) => r.inB).length}/${ls.length} speed ${m((r) => r.speed)} hitY ${m((r) => r.hitY)}  faults ${rs.filter((r) => r.fault).map((r) => r.fault).join(',')}`);
  rows.push({ combo: combo.name, rs });
}
fs.writeFileSync('results/shots.json', JSON.stringify(rows, null, 1));
console.log('problems', t.problems);
await t.close();
