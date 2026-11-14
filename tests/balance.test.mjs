import test from 'node:test';
import assert from 'node:assert/strict';
import { aiSim } from './lib/util.mjs';

const CAP = 900000;

// Play a full AI-vs-AI game and collect statistics.
function play(mode, scoring, seed, dTeam0, dTeam1, stats) {
  const sim = aiSim(mode, scoring, seed, dTeam0, dTeam1);
  const s = sim.state;
  const duprOf = s.players.map((p) => p.dupr);
  while (s.phase !== 'gameOver') {
    sim.step({});
    assert.ok(s.tick < CAP, 'game did not finish');
    for (const e of sim.drainEvents()) {
      if (e.type === 'hit') {
        const L = duprOf[e.playerId];
        const row = (stats.shots[L] ??= {});
        const k = e.isServe ? 'serve' : e.shot;
        row[k] = (row[k] || 0) + 1;
        if (e.atp) row.atp = (row.atp || 0) + 1;
        if (e.isVolley) row.volley = (row.volley || 0) + 1;
        (stats.speeds[k] ??= []).push(e.speed);
      }
      if (e.type === 'rallyEnd') {
        stats.rallies++;
        stats.hits += e.hits;
        stats.longest = Math.max(stats.longest, e.hits);
        if (e.hits === 1) { if (e.reason === 'doubleBounce' || e.reason === 'bodyHit') stats.aces++; else stats.serveFaults++; }
        stats.reasons[e.reason] = (stats.reasons[e.reason] || 0) + 1;
        stats.len.push(e.hits);
      }
    }
  }
  return s.score.winner;
}

const newStats = () => ({ shots: {}, speeds: {}, rallies: 0, hits: 0, longest: 0, aces: 0, serveFaults: 0, reasons: {}, len: [] });
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };

function matchup(hi, lo, n, mode = 'doubles', scoring = 'sideout', baseSeed = 100) {
  const stats = newStats();
  let hiWins = 0;
  for (let i = 0; i < n; i++) {
    const hiTeam = i % 2; // alternate which side the stronger team plays
    const w = play(mode, scoring, baseSeed + i, hiTeam === 0 ? hi : lo, hiTeam === 0 ? lo : hi, stats);
    if (w === hiTeam) hiWins++;
  }
  return { hiWins, n, stats };
}

const report = [];
function sumShots(all) {
  const out = {};
  for (const st of all) for (const L of Object.keys(st.shots)) {
    out[L] ??= {};
    for (const k of Object.keys(st.shots[L])) out[L][k] = (out[L][k] || 0) + st.shots[L][k];
  }
  return out;
}

test('balance: 6.0 crushes 3.0, 5.0 clearly beats 4.0, 6.0 beats 5.0', () => {
  const r63 = matchup(6, 3, 30);
  const r54 = matchup(5, 4, 30);
  const r65 = matchup(6, 5, 24);
  const r43 = matchup(4, 3, 24);
  console.log(`# win rates: 6.0>3.0 ${r63.hiWins}/${r63.n}, 5.0>4.0 ${r54.hiWins}/${r54.n}, 6.0>5.0 ${r65.hiWins}/${r65.n}, 4.0>3.0 ${r43.hiWins}/${r43.n}`);
  assert.ok(r63.hiWins / r63.n >= 0.9, `6.0 vs 3.0: ${r63.hiWins}/${r63.n}`);
  assert.ok(r54.hiWins / r54.n >= 0.65, `5.0 vs 4.0: ${r54.hiWins}/${r54.n}`);
  assert.ok(r65.hiWins / r65.n >= 0.65, `6.0 vs 5.0: ${r65.hiWins}/${r65.n}`);
  assert.ok(r43.hiWins / r43.n >= 0.65, `4.0 vs 3.0: ${r43.hiWins}/${r43.n}`);
});

test('balance: singles and rally scoring also separate skill levels', () => {
  const a = matchup(6, 3, 12, 'singles', 'sideout', 500);
  const b = matchup(5, 4, 12, 'singles', 'rally', 600);
  const c = matchup(6, 4, 12, 'doubles', 'rally', 700);
  console.log(`# singles/sideout 6>3 ${a.hiWins}/12, singles/rally 5>4 ${b.hiWins}/12, doubles/rally 6>4 ${c.hiWins}/12`);
  assert.ok(a.hiWins >= 10);
  assert.ok(b.hiWins >= 7);
  assert.ok(c.hiWins >= 10);
});

test('balance: rally lengths are sensible and all shot types occur', () => {
  const sets = [];
  const labels = { '3v3': [3, 3], '4v4': [4, 4], '5v5': [5, 5], '6v6': [6, 6], '6v3': [6, 3], '5v4': [5, 4], '6v5': [6, 5] };
  const lenByPair = {};
  for (const [name, [a, b]] of Object.entries(labels)) {
    const st = newStats();
    const n = name === '6v6' || name === '5v5' ? 14 : 12;
    for (let i = 0; i < n; i++) play('doubles', 'sideout', 2000 + i, a, b, st);
    sets.push(st);
    const avg = st.hits / st.rallies;
    lenByPair[name] = { avg: +avg.toFixed(2), median: median(st.len), longest: st.longest, aces: +(100 * st.aces / st.rallies).toFixed(1), serveFault: +(100 * st.serveFaults / st.rallies).toFixed(1) };
    assert.ok(avg >= 2.5 && avg <= 20, `${name} avg rally ${avg}`);
    assert.ok(st.aces / st.rallies < 0.25, `${name} too many aces`);
    assert.ok(st.serveFaults / st.rallies < 0.3, `${name} too many serve faults`);
    assert.ok(st.longest < 160, `${name} endless rally ${st.longest}`);
  }
  console.log('# rally stats (hits per rally incl. serve): ' + JSON.stringify(lenByPair));
  const shots = sumShots(sets);
  console.log('# shot distribution by DUPR: ' + JSON.stringify(shots));
  const total = {};
  for (const L of Object.keys(shots)) for (const k of Object.keys(shots[L])) total[k] = (total[k] || 0) + shots[L][k];
  for (const k of ['drive', 'drop', 'dink', 'lob', 'smash', 'serve', 'atp']) assert.ok(total[k] > 0, `shot type ${k} never occurs`);
  assert.ok(shots[6].atp > 0, '6.0 attempts ATP');
  assert.ok(!shots[3].atp, '3.0 does not hit ATPs deliberately');
  // 3.0 is a hard-hitter / lobber who rarely dinks, 5.0+ dink a lot
  const dinkShare = (L) => shots[L].dink / (shots[L].drive + shots[L].drop + shots[L].dink + shots[L].lob + shots[L].smash);
  assert.ok(dinkShare(5) > dinkShare(3) + 0.15, `dink share 5.0 ${dinkShare(5)} vs 3.0 ${dinkShare(3)}`);
  assert.ok(shots[3].drive > shots[3].drop, '3.0 drives more than it drops');
  // ball speeds feel like (slowed) pickleball
  const med = (k) => median(sets.flatMap((s) => s.speeds[k] || []));
  console.log(`# median ball speed m/s: drive ${med('drive').toFixed(1)}, drop ${med('drop').toFixed(1)}, dink ${med('dink').toFixed(1)}, lob ${med('lob').toFixed(1)}, smash ${med('smash').toFixed(1)}, serve ${med('serve').toFixed(1)}`);
  assert.ok(med('drive') >= 12 && med('drive') <= 19);
  assert.ok(med('dink') >= 3.5 && med('dink') <= 7.5);
  assert.ok(med('smash') > med('drive'));
});

test('balance: ATP actually lands (6.0 vs 6.0 produces ATP winners sometimes)', () => {
  let atp = 0, atpWinners = 0;
  for (let i = 0; i < 12; i++) {
    const sim = aiSim('doubles', 'sideout', 3000 + i, 6, 6);
    const s = sim.state;
    while (s.phase !== 'gameOver') {
      sim.step({});
      for (const e of sim.drainEvents()) {
        if (e.type === 'hit' && e.atp) atp++;
        if (e.type === 'rallyEnd' && e.highlightReason === 'atp') atpWinners++;
      }
    }
  }
  console.log(`# 6.0v6.0: ${atp} ATP shots, ${atpWinners} ATP winners in 12 games`);
  assert.ok(atp >= 3);
});
