import test from 'node:test';
import assert from 'node:assert/strict';
import { manual, winPoint, nextPoint, ofType, run } from './lib/util.mjs';

const sx = (s, id) => {
  const p = s.players[id];
  const r = s.internal.half[id] === 'R' ? 1 : -1;
  return p.team === 0 ? r : -r;
};

test('initial serveReady event and 0-0-2 start (doubles sideout)', () => {
  const sim = manual('doubles', 'sideout');
  const evs = sim.drainEvents();
  const e = ofType(evs, 'serveReady')[0];
  assert.ok(e);
  assert.equal(e.callText, '0 - 0 - 2');
  assert.deepEqual(e.callWords, ['zero', 'zero', 'two']);
  const s = sim.state;
  assert.equal(s.phase, 'preServe');
  assert.equal(s.score.servingTeam, 0);
  assert.equal(s.score.serverNumber, 2);
  assert.equal(s.score.serverId, 0);
  assert.equal(s.players[0].isServer, true);
  assert.equal(s.players[0].pos.x > 0, true, 'team 0 right court is +x');
  assert.equal(s.players[0].pos.z > 6.705, true, 'server behind the baseline');
  // receiver is diagonally opposite
  assert.equal(s.score.receiverId, 2);
  assert.equal(Math.sign(s.players[2].pos.x), -1);
  assert.equal(s.players[2].isReceiver, true);
});

test('sideout doubles: full server rotation', () => {
  const sim = manual('doubles', 'sideout');
  const s = sim.state;
  // first service turn starts on server 2: a lost rally is an immediate side out
  let evs = winPoint(sim, 1);
  let re = ofType(evs, 'rallyEnd')[0];
  assert.equal(re.sideOut, true);
  assert.equal(re.pointScored, false);
  assert.equal(s.score.servingTeam, 1);
  assert.equal(s.score.serverNumber, 1);
  assert.equal(s.score.serverId, 2, 'right-court player of team 1 serves first');
  assert.equal(s.score.callText, '0 - 0 - 1');
  assert.equal(s.score.points[0] + s.score.points[1], 0);

  // serving team wins: +1, swap halves, same server
  evs = winPoint(sim, 1);
  re = ofType(evs, 'rallyEnd')[0];
  assert.equal(re.pointScored, true);
  assert.deepEqual(s.score.points, [0, 1]);
  assert.equal(s.score.serverId, 2);
  assert.equal(s.internal.half[2], 'L');
  assert.equal(s.internal.half[3], 'R');
  assert.equal(s.score.callText, '1 - 0 - 1');
  assert.equal(sx(s, 2) > 0, true, 'team1 left court is +x');
  assert.equal(Math.sign(s.players[2].pos.x), 1);
  // receiver diagonal: server at +x -> receiver at -x
  assert.equal(Math.sign(s.players[s.score.receiverId].pos.x), -1);
  // receiving team never swaps
  assert.equal(s.internal.half[0], 'R');
  assert.equal(s.internal.half[1], 'L');

  // lose rally as server 1 -> server 2 = partner, no swap
  evs = winPoint(sim, 0);
  re = ofType(evs, 'rallyEnd')[0];
  assert.equal(re.secondServer, true);
  assert.equal(re.sideOut, false);
  assert.equal(s.score.serverNumber, 2);
  assert.equal(s.score.serverId, 3);
  assert.equal(s.internal.half[3], 'R');
  assert.equal(s.score.callText, '1 - 0 - 2');
  assert.deepEqual(s.score.points, [0, 1], 'receivers score nothing in sideout');

  // lose again as server 2 -> side out, new server = right-court player of the other team
  evs = winPoint(sim, 0);
  re = ofType(evs, 'rallyEnd')[0];
  assert.equal(re.sideOut, true);
  assert.equal(s.score.servingTeam, 0);
  assert.equal(s.score.serverNumber, 1);
  assert.equal(s.score.serverId, 0);
  assert.equal(s.score.callText, '0 - 1 - 1');
});

test('sideout doubles: server serves from alternating halves while scoring', () => {
  const sim = manual('doubles', 'sideout');
  const s = sim.state;
  winPoint(sim, 1); // side out to team 1
  const server = s.score.serverId;
  const xs = [];
  for (let i = 0; i < 4; i++) {
    xs.push(Math.sign(s.players[server].pos.x));
    assert.equal(s.score.serverId, server);
    winPoint(sim, 1);
  }
  assert.deepEqual(xs, [-1, 1, -1, 1]);
  assert.deepEqual(s.score.points, [0, 4]);
  assert.equal(s.score.callText, '4 - 0 - 1');
});

test('sideout game to 11 win by 2', () => {
  const sim = manual('doubles', 'sideout');
  const s = sim.state;
  s.score.servingTeam = 0; s.score.serverNumber = 1; s.score.points = [10, 10];
  sim.debug.setupServe();
  winPoint(sim, 0);
  assert.deepEqual(s.score.points, [11, 10]);
  assert.equal(s.score.winner, null);
  assert.equal(s.phase, 'preServe');
  const evs = winPoint(sim, 0);
  assert.deepEqual(s.score.points, [12, 10]);
  assert.equal(s.score.winner, 0);
  assert.equal(s.phase, 'gameOver');
  assert.equal(ofType(evs, 'gameOver').length, 1);
});

test('sideout: 11-0 style win, game point flag', () => {
  const sim = manual('doubles', 'sideout');
  const s = sim.state;
  s.score.servingTeam = 0; s.score.serverNumber = 1; s.score.points = [10, 3];
  sim.debug.setupServe();
  assert.equal(s.score.gamePoint, true);
  s.score.points = [9, 3]; sim.debug.setupServe();
  assert.equal(s.score.gamePoint, false);
  s.score.points = [10, 3]; sim.debug.setupServe();
  sim.debug.endRally(1, 'out');
  const evs = sim.drainEvents();
  const re = ofType(evs, 'rallyEnd')[0];
  assert.equal(re.highlight, true);
  assert.equal(re.highlightReason, 'gamePoint');
  assert.equal(s.score.winner, 0);
  assert.deepEqual(s.score.points, [11, 3]);
});

test('sideout singles: serve half by own score parity, call "server - receiver"', () => {
  const sim = manual('singles', 'sideout');
  const s = sim.state;
  assert.equal(s.score.callText, '0 - 0');
  assert.equal(s.score.serverNumber, 1);
  assert.equal(Math.sign(s.players[0].pos.x), 1, 'even score: right court');
  assert.equal(Math.sign(s.players[1].pos.x), -1, 'receiver diagonal');
  winPoint(sim, 0);
  assert.equal(s.score.callText, '1 - 0');
  assert.equal(Math.sign(s.players[0].pos.x), -1, 'odd score: left court');
  assert.equal(Math.sign(s.players[1].pos.x), 1);
  winPoint(sim, 0);
  assert.equal(Math.sign(s.players[0].pos.x), 1);
  // lose -> side out immediately (singles has one server)
  const evs = winPoint(sim, 1);
  assert.equal(ofType(evs, 'rallyEnd')[0].sideOut, true);
  assert.equal(s.score.servingTeam, 1);
  assert.equal(s.score.serverId, 1);
  assert.equal(s.score.callText, '0 - 2');
  assert.deepEqual(s.score.points, [2, 0]);
  assert.equal(Math.sign(s.players[1].pos.z), -1);
  assert.equal(Math.sign(s.players[1].pos.x), -1, 'team 1 even score -> its right court = -x');
});

test('rally doubles: every rally scores, server by parity, no half swap, side out to winner', () => {
  const sim = manual('doubles', 'rally');
  const s = sim.state;
  assert.equal(s.score.callText, '0 - 0');
  assert.equal(s.score.serverNumber, 1);
  assert.equal(s.score.serverId, 0);
  // receiving team wins: they score AND serve
  let evs = winPoint(sim, 1);
  let re = ofType(evs, 'rallyEnd')[0];
  assert.equal(re.pointScored, true);
  assert.equal(re.sideOut, true);
  assert.deepEqual(s.score.points, [0, 1]);
  assert.equal(s.score.servingTeam, 1);
  assert.equal(s.score.callText, '1 - 0');
  assert.equal(s.internal.half[s.score.serverId], 'L', 'odd score serves from left half');
  assert.equal(s.score.serverId, 3);
  // server's team wins: they score, serving player switches because parity changes, no swapping
  evs = winPoint(sim, 1);
  assert.deepEqual(s.score.points, [0, 2]);
  assert.equal(s.score.servingTeam, 1);
  assert.equal(s.internal.half[2], 'R');
  assert.equal(s.internal.half[3], 'L');
  assert.equal(s.score.serverId, 2);
  assert.equal(s.score.callText, '2 - 0');
  assert.equal(s.score.serverNumber, 1);
  // side-out back
  winPoint(sim, 0);
  assert.deepEqual(s.score.points, [1, 2]);
  assert.equal(s.score.servingTeam, 0);
  assert.equal(s.score.callText, '1 - 2');
  assert.equal(s.score.serverId, 1, 'odd score: the left-half player serves');
  assert.equal(Math.sign(s.players[1].pos.x), -1);
});

test('rally game to 15 win by 2 (doubles + singles)', () => {
  for (const mode of ['doubles', 'singles']) {
    const sim = manual(mode, 'rally');
    const s = sim.state;
    s.score.points = [14, 14]; sim.debug.setupServe();
    winPoint(sim, 1);
    assert.deepEqual(s.score.points, [14, 15]);
    assert.equal(s.score.winner, null);
    winPoint(sim, 0);
    assert.deepEqual(s.score.points, [15, 15]);
    assert.equal(s.score.winner, null);
    winPoint(sim, 0);
    assert.equal(s.score.winner, null);
    winPoint(sim, 0);
    assert.deepEqual(s.score.points, [17, 15]);
    assert.equal(s.score.winner, 0);
    assert.equal(s.phase, 'gameOver');
  }
  const sim = manual('doubles', 'rally');
  sim.state.score.points = [14, 3]; sim.debug.setupServe();
  assert.equal(sim.state.score.gamePoint, true);
  winPoint(sim, 0);
  assert.deepEqual(sim.state.score.points, [15, 3]);
  assert.equal(sim.state.score.winner, 0);
});

test('rally singles: server side by parity', () => {
  const sim = manual('singles', 'rally');
  const s = sim.state;
  assert.equal(Math.sign(s.players[0].pos.x), 1);
  winPoint(sim, 0);
  assert.equal(Math.sign(s.players[0].pos.x), -1);
  winPoint(sim, 1); // side out: team 1 scores 1 and serves; odd -> left court (+x for team 1)
  assert.equal(s.score.servingTeam, 1);
  assert.equal(s.score.callText, '1 - 1');
  assert.equal(Math.sign(s.players[1].pos.x), 1);
});

test('pointOver lasts ~2.5s with celebrate/dejected anims then returns to preServe', () => {
  const sim = manual('doubles', 'sideout');
  const s = sim.state;
  sim.debug.endRally(1, 'out');
  assert.equal(s.phase, 'pointOver');
  run(sim, 120); // 1 s
  assert.equal(s.phase, 'pointOver');
  assert.equal(s.players[0].anim.name, 'celebrate');
  assert.equal(s.players[0].emotion, 'happy');
  assert.equal(s.players[2].anim.name, 'dejected');
  assert.equal(s.players[2].emotion, 'sad');
  run(sim, 200);
  assert.equal(s.phase, 'preServe');
  assert.equal(s.players[s.score.serverId].anim.name, 'serveReady');
});

test('state is plain JSON (snapshot/restore round trip)', () => {
  const sim = manual('doubles', 'sideout');
  run(sim, 50);
  const snap = sim.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(sim.state)), sim.state);
  run(sim, 100);
  sim.restore(snap);
  assert.deepEqual(sim.snapshot(), snap);
});
