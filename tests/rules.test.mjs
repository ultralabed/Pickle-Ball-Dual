import test from 'node:test';
import assert from 'node:assert/strict';
import { manual, liveBall, place, run, ofType, DT, COURT } from './lib/util.mjs';
import { trace, netTop } from '../src/sim/physics.js';

const faultOf = (evs) => ofType(evs, 'fault')[0];

// A ball falling straight down onto (x, z), "hit" by player `hitter` (so landing side is the far side).
function dropAt(x, z, hitter = 0, extra = {}) {
  const sim = manual('doubles', 'sideout');
  liveBall(sim, { hitter, pos: { x, y: 0.5, z }, vel: { x: 0, y: -3, z: 0 }, hits: 3, ...extra });
  const evs = run(sim, 60, () => ({}), (s, e) => ofType(e, 'bounce').length > 0 && (s.state.phase !== 'rally' || e.length > 3));
  return { sim, evs };
}

test('line calls: sideline, baseline, kitchen line are IN (rally); beyond is OUT', () => {
  for (const [x, z, inB] of [
    [3.05, -3.0, true], [3.07, -3.0, true], [3.09, -3.0, false], [3.15, -3.0, false], [-3.05, -3.0, true], [-3.2, -3.0, false],
    [0.0, -6.705, true], [1.0, -6.72, true], [1.0, -6.74, false], [1.0, -6.85, false],
    [1.0, -2.134, true], [1.0, -2.0, true], [0.0, -4.0, true],
  ]) {
    const { sim, evs } = dropAt(x, z, 0);
    const b = ofType(evs, 'bounce')[0];
    assert.ok(b, `bounce at ${x},${z}`);
    assert.equal(b.inBounds, inB, `inBounds at ${x},${z}`);
    const f = faultOf(evs);
    if (inB) assert.equal(f, undefined, `no fault at ${x},${z}`);
    else {
      assert.equal(f.reason, 'out');
      assert.equal(f.team, 0);
      assert.equal(ofType(evs, 'rallyEnd')[0].winnerTeam, 1);
    }
  }
});

test('ball landing on hitter\'s own side counts as not crossing (net fault)', () => {
  const { evs } = dropAt(1.0, 3.0, 0);
  assert.equal(faultOf(evs).reason, 'net');
  assert.equal(faultOf(evs).team, 0);
});

test('serve legality: diagonal court, kitchen line is a fault, other lines are in', () => {
  // server id 0 serves from +x so the target box is x<0, z<0.
  const cases = [
    [-1.5, -4.0, null], [-0.0, -4.0, null], [-3.05, -4.0, null], [-1.0, -6.705, null], [-1.5, -2.2, null],
    [-1.5, -2.134, 'serveShort'], [-1.5, -1.0, 'serveShort'], [-1.5, -2.15, 'serveShort'],
    [1.5, -4.0, 'serveWrongCourt'], [0.3, -4.0, 'serveWrongCourt'],
    [-3.3, -4.0, 'out'], [-1.5, -6.9, 'out'],
    [-1.5, 4.0, 'net'],
  ];
  for (const [x, z, reason] of cases) {
    const sim = manual('doubles', 'sideout');
    place(sim, 2, 3, -9); place(sim, 3, 3, -9.5); place(sim, 1, 3, 9);
    liveBall(sim, { hitter: 0, pos: { x, y: 0.5, z }, vel: { x: 0, y: -3, z: 0 }, hits: 1, twoBounce: 2, serve: true });
    const evs = run(sim, 60, () => ({}), (s, e) => ofType(e, 'bounce').length > 0);
    const f = faultOf(evs);
    if (reason === null) {
      assert.equal(f, undefined, `legal serve at ${x},${z}`);
      assert.equal(sim.state.phase, 'rally', 'serve phase ends after the legal bounce');
      assert.equal(sim.state.internal.serveActive, false);
    } else {
      assert.equal(f.reason, reason, `serve at ${x},${z}`);
      assert.equal(f.team, 0);
      assert.equal(ofType(evs, 'rallyEnd')[0].winnerTeam, 1);
    }
  }
});

test('serve that clips the net cord and lands in the right court is live (no let)', () => {
  const sim = manual('doubles', 'sideout');
  const y = netTop(0) + COURT.ballR * 0.7;
  liveBall(sim, { hitter: 0, pos: { x: 0, y, z: 0.1 }, vel: { x: -0.5, y: 0.0, z: -7 }, hits: 1, twoBounce: 2, serve: true, crossed: false });
  const evs = run(sim, 120, () => ({}), (s, e) => ofType(e, 'bounce').length > 0);
  assert.equal(ofType(evs, 'netTouch').length, 1, 'clipped the cord');
  const b = ofType(evs, 'bounce')[0];
  assert.ok(b.pos.z < -2.2 && b.inBounds, `landed at ${b.pos.z}`);
  assert.equal(faultOf(evs), undefined);
  assert.equal(sim.state.phase, 'rally');
});

test('net collision: ball below the net does not cross and the hitter faults', () => {
  const sim = manual('doubles', 'sideout');
  liveBall(sim, { hitter: 0, pos: { x: 0.5, y: 0.5, z: 1.0 }, vel: { x: 0, y: 1.0, z: -9 }, hits: 3, crossed: false });
  const evs = run(sim, 80, () => ({}), () => sim.state.phase === 'pointOver');
  assert.equal(ofType(evs, 'netTouch').length, 1);
  const f = faultOf(evs);
  assert.equal(f.reason, 'net');
  assert.equal(f.team, 0);
  assert.ok(sim.state.ball.pos.z > -0.1, 'ball stays on the hitter side');
  // team 1 hitter into the net
  const sim2 = manual('doubles', 'sideout');
  liveBall(sim2, { hitter: 2, pos: { x: -2, y: 0.4, z: -1.0 }, vel: { x: 0, y: 0.5, z: 9 }, hits: 3, crossed: false });
  const evs2 = run(sim2, 80, () => ({}), () => sim2.state.phase === 'pointOver');
  assert.equal(faultOf(evs2).reason, 'net');
  assert.equal(faultOf(evs2).team, 1);
});

test('ball clearing the net is fine', () => {
  const sim = manual('doubles', 'sideout');
  liveBall(sim, { hitter: 0, pos: { x: 0.5, y: 1.3, z: 1.0 }, vel: { x: 0, y: 1.0, z: -8 }, hits: 3, crossed: false });
  const evs = run(sim, 100, () => ({}), (s, e) => ofType(e, 'bounce').length > 0);
  assert.equal(ofType(evs, 'netTouch').length, 0);
  assert.equal(faultOf(evs), undefined);
  assert.equal(ofType(evs, 'bounce')[0].inBounds, true);
});

test('ATP: net only blocks |x| <= 3.355; low ball outside the post is legal', () => {
  // outside the post, below net height, lands inside the opponent court
  const P = { x: 3.8, y: 0.45, z: 1.0 };
  const V = { x: -2.0, y: 1.6, z: -8 };
  const tr = trace(P, V);
  assert.ok(Math.abs(tr.crossX) > 3.355, `crosses outside the post (${tr.crossX})`);
  assert.ok(tr.crossY < netTop(tr.crossX), 'below net height');
  assert.ok(Math.abs(tr.x) < 3.05 && tr.z < -2.2, `lands in court (${tr.x}, ${tr.z})`);
  const sim = manual('doubles', 'sideout');
  liveBall(sim, { hitter: 0, pos: P, vel: V, hits: 3, crossed: false });
  const evs = run(sim, 200, () => ({}), (s, e) => ofType(e, 'bounce').length > 0);
  assert.equal(ofType(evs, 'netTouch').length, 0);
  assert.equal(faultOf(evs), undefined);
  const b = ofType(evs, 'bounce')[0];
  assert.equal(b.inBounds, true);
  assert.ok(Math.abs(b.pos.x - tr.x) < 1e-6 && Math.abs(b.pos.z - tr.z) < 1e-6);
  // same height but crossing inside the post -> net
  const sim2 = manual('doubles', 'sideout');
  liveBall(sim2, { hitter: 0, pos: { x: 3.2, y: 0.45, z: 1.0 }, vel: { x: -0.2, y: 1.6, z: -8 }, hits: 3, crossed: false });
  const evs2 = run(sim2, 200, () => ({}), () => sim2.state.phase === 'pointOver');
  assert.equal(faultOf(evs2).reason, 'net');
});

test('a human wide of the post hits an ATP (low, around the post, lands in)', () => {
  const sim = manual('doubles', 'sideout');
  place(sim, 0, 4.1, 1.0);
  place(sim, 1, -1.5, 5);
  liveBall(sim, { hitter: 2, pos: { x: 4.1, y: 0.9, z: 1.3 }, vel: { x: 0, y: 0, z: 0 }, hits: 4, bounces: 1 });
  const evs = run(sim, 200, (i) => (i === 0 ? { 0: { swing: 'drive' } } : {}), (s, e) => ofType(e, 'bounce').length > 0 && ofType(e, 'hit').length > 0);
  const h = ofType(evs, 'hit')[0];
  assert.ok(h, 'hit happened');
  assert.equal(h.atp, true);
  const b = ofType(evs, 'bounce').find((x) => x.pos.z < 0);
  assert.ok(b, 'bounced on the far side');
  assert.equal(ofType(evs, 'netTouch').length, 0);
  assert.equal(faultOf(evs), undefined);
  assert.equal(b.inBounds, true);
});

test('two-bounce rule: volleying the serve return or the 3rd shot is a fault', () => {
  // receiver (team 1, id 2) volleys the serve
  let sim = manual('doubles', 'sideout');
  place(sim, 2, -1.5, -6.0);
  liveBall(sim, { hitter: 0, pos: { x: -1.5, y: 1.1, z: -5.6 }, vel: { x: 0, y: 0, z: -0.3 }, hits: 1, twoBounce: 2, serve: true });
  let evs = run(sim, 60, (i) => (i === 0 ? { 2: { swing: 'drive' } } : {}), () => sim.state.phase === 'pointOver');
  assert.equal(ofType(evs, 'hit')[0].isVolley, true);
  assert.equal(faultOf(evs).reason, 'twoBounceRule');
  assert.equal(faultOf(evs).team, 1);
  assert.equal(ofType(evs, 'rallyEnd')[0].winnerTeam, 0);
  // server's team volleys the return (3rd shot)
  sim = manual('doubles', 'sideout');
  place(sim, 0, 1.5, 6.0);
  liveBall(sim, { hitter: 2, pos: { x: 1.5, y: 1.1, z: 5.6 }, vel: { x: 0, y: 0, z: 0.3 }, hits: 2, twoBounce: 1 });
  evs = run(sim, 60, (i) => (i === 0 ? { 0: { swing: 'drive' } } : {}), () => sim.state.phase === 'pointOver');
  assert.equal(faultOf(evs).reason, 'twoBounceRule');
  assert.equal(faultOf(evs).team, 0);
  // after the bounce it is legal
  sim = manual('doubles', 'sideout');
  place(sim, 0, 1.5, 6.0);
  liveBall(sim, { hitter: 2, pos: { x: 1.5, y: 1.1, z: 5.6 }, vel: { x: 0, y: 0, z: 0.3 }, hits: 2, twoBounce: 1, bounces: 1 });
  evs = run(sim, 40, (i) => (i === 0 ? { 0: { swing: 'drive' } } : {}));
  assert.equal(ofType(evs, 'hit').length, 1);
  assert.equal(faultOf(evs), undefined);
  // 4th shot volley is legal
  sim = manual('doubles', 'sideout');
  place(sim, 2, -1.5, -4.0);
  liveBall(sim, { hitter: 0, pos: { x: -1.5, y: 1.1, z: -3.6 }, vel: { x: 0, y: 0, z: -0.3 }, hits: 3, twoBounce: 0 });
  evs = run(sim, 40, (i) => (i === 0 ? { 2: { swing: 'drive' } } : {}));
  assert.equal(ofType(evs, 'hit')[0].isVolley, true);
  assert.equal(faultOf(evs), undefined);
});

test('kitchen: volley from inside the kitchen or on its line is a fault; bounced ball is fine', () => {
  for (const z of [-1.5, -2.0, -2.134]) {
    const sim = manual('doubles', 'sideout');
    place(sim, 2, -1.5, z);
    liveBall(sim, { hitter: 0, pos: { x: -1.5, y: 1.0, z: z - 0.3 }, vel: { x: 0, y: 0, z: 0.0 }, hits: 4, twoBounce: 0 });
    // keep ball on team 1 side
    sim.state.ball.pos.z = Math.min(sim.state.ball.pos.z, -0.5);
    const evs = run(sim, 60, (i) => (i === 0 ? { 2: { swing: 'dink' } } : {}), () => sim.state.phase === 'pointOver');
    assert.equal(ofType(evs, 'hit')[0].isVolley, true);
    assert.equal(faultOf(evs).reason, 'kitchen', `z=${z}`);
    assert.equal(faultOf(evs).team, 1);
  }
  // legal volley just behind the line
  let sim = manual('doubles', 'sideout');
  place(sim, 2, -1.5, -2.4);
  liveBall(sim, { hitter: 0, pos: { x: -1.5, y: 1.0, z: -2.7 }, vel: { x: 0, y: 0, z: 0 }, hits: 4, twoBounce: 0 });
  let evs = run(sim, 40, (i) => (i === 0 ? { 2: { swing: 'dink' } } : {}));
  assert.equal(ofType(evs, 'hit').length, 1);
  assert.equal(faultOf(evs), undefined);
  // bounced ball in the kitchen: fine
  sim = manual('doubles', 'sideout');
  place(sim, 2, -1.5, -1.5);
  liveBall(sim, { hitter: 0, pos: { x: -1.5, y: 0.7, z: -1.8 }, vel: { x: 0, y: 0, z: 0 }, hits: 4, twoBounce: 0, bounces: 1 });
  evs = run(sim, 40, (i) => (i === 0 ? { 2: { swing: 'dink' } } : {}));
  assert.equal(ofType(evs, 'hit')[0].isVolley, false);
  assert.equal(faultOf(evs), undefined);
});

test('kitchen momentum: entering the kitchen within 0.6s after a volley is a fault', () => {
  const mk = () => {
    const sim = manual('doubles', 'sideout');
    place(sim, 2, -1.5, -3.0);
    place(sim, 3, 1.5, -4.0);
    liveBall(sim, { hitter: 0, pos: { x: -1.5, y: 1.0, z: -3.4 }, vel: { x: 0, y: 0, z: 0 }, hits: 4, twoBounce: 0 });
    return sim;
  };
  let sim = mk();
  let evs = run(sim, 120, (i) => ({ 2: { swing: i === 0 ? 'dink' : null, mz: 1 } }), () => sim.state.phase === 'pointOver');
  assert.equal(ofType(evs, 'hit')[0].isVolley, true);
  assert.equal(faultOf(evs).reason, 'kitchen');
  // staying out for > 0.6 s is fine
  sim = mk();
  const t0 = 0;
  evs = run(sim, 120, (i) => ({ 2: { swing: i === 0 ? 'dink' : null, mz: i > 0.9 * 120 ? 1 : 0 } }));
  assert.equal(faultOf(evs), undefined);
  // walking into the kitchen without having volleyed is fine
  sim = manual('doubles', 'sideout');
  place(sim, 2, -1.5, -3.0);
  liveBall(sim, { hitter: 2, pos: { x: 1, y: 3, z: 5 }, vel: { x: 0, y: 8, z: 0 }, hits: 4 });
  evs = run(sim, 60, () => ({ 2: { mz: 1 } }));
  assert.equal(faultOf(evs), undefined);
  assert.ok(Math.abs(sim.state.players[2].pos.z) < 2.134);
});

test('double bounce on the receiving side loses the rally for that side', () => {
  const sim = manual('doubles', 'sideout');
  liveBall(sim, { hitter: 0, pos: { x: 2, y: 0.5, z: -4 }, vel: { x: 0, y: -3, z: 0 }, hits: 3 });
  place(sim, 2, -3, -6); place(sim, 3, -3, -2.5);
  const evs = run(sim, 240, () => ({}), () => sim.state.phase === 'pointOver');
  const f = faultOf(evs);
  assert.equal(f.reason, 'doubleBounce');
  assert.equal(f.team, 1);
  const re = ofType(evs, 'rallyEnd')[0];
  assert.equal(re.winnerTeam, 0);
  assert.equal(ofType(evs, 'bounce').length, 2);
});

test('ball hitting a player\'s body: that player\'s team loses', () => {
  const sim = manual('doubles', 'sideout');
  place(sim, 2, -1.0, -3.0);
  place(sim, 3, 2.5, -6.0);
  liveBall(sim, { hitter: 0, pos: { x: -1.0, y: 1.0, z: -1.0 }, vel: { x: 0, y: 0, z: -4 }, hits: 3 });
  const evs = run(sim, 120, () => ({}), () => sim.state.phase === 'pointOver');
  const f = faultOf(evs);
  assert.equal(f.reason, 'bodyHit');
  assert.equal(f.team, 1);
  assert.equal(f.playerId, 2);
  assert.equal(ofType(evs, 'rallyEnd')[0].winnerTeam, 0);
});

test('players cannot cross the net', () => {
  const sim = manual('doubles', 'sideout');
  liveBall(sim, { hitter: 1, pos: { x: 0, y: 12, z: 5 }, vel: { x: 0, y: 0, z: 0 }, hits: 4 });
  sim.state.ball.pos.y = 13;
  run(sim, 600, () => ({ 0: { mz: -1 }, 2: { mz: 1 } }));
  assert.ok(sim.state.players[0].pos.z >= 0.29);
  assert.ok(sim.state.players[2].pos.z <= -0.29);
});

test('forehand/backhand from handedness and ball side', () => {
  const sideFor = (team, handed, ballDx) => {
    const sim = manual('doubles', 'sideout', 1, { hands: [handed, 'R', handed, 'R'] });
    const id = team === 0 ? 0 : 2;
    const sg = team === 0 ? 1 : -1;
    place(sim, id, 0, 4 * sg);
    liveBall(sim, { hitter: team === 0 ? 2 : 0, pos: { x: ballDx, y: 1.0, z: 4 * sg }, vel: { x: 0, y: 0, z: 0 }, hits: 4, bounces: 1 });
    const evs = run(sim, 40, (i) => (i === 0 ? { [id]: { swing: 'drive' } } : {}));
    return ofType(evs, 'hit')[0];
  };
  // team 0 faces -z: its right is +x
  assert.equal(sideFor(0, 'R', 0.7).side, 'forehand');
  assert.equal(sideFor(0, 'R', -0.7).side, 'backhand');
  assert.equal(sideFor(0, 'L', 0.7).side, 'backhand');
  assert.equal(sideFor(0, 'L', -0.7).side, 'forehand');
  // team 1 faces +z: its right is -x
  assert.equal(sideFor(1, 'R', -0.7).side, 'forehand');
  assert.equal(sideFor(1, 'R', 0.7).side, 'backhand');
  assert.equal(sideFor(1, 'L', 0.7).side, 'forehand');
  assert.equal(sideFor(1, 'L', -0.7).side, 'backhand');
});

test('swing mechanics: reach, window, smash, whiff, anim state', () => {
  // in reach -> hit; anim reflects swing and side
  let sim = manual('doubles', 'sideout');
  place(sim, 0, 1.0, 4.0);
  liveBall(sim, { hitter: 2, pos: { x: 1.9, y: 1.0, z: 4.0 }, vel: { x: 0, y: 0, z: 0 }, hits: 4, bounces: 1 });
  sim.state.ball.pos.y = 1.0;
  let evs = run(sim, 3, () => ({ 0: { swing: 'drive' } }));
  assert.equal(sim.state.players[0].anim.name, 'drive');
  assert.equal(sim.state.players[0].anim.shot, 'drive');
  evs = evs.concat(run(sim, 45));
  assert.equal(ofType(evs, 'hit').length, 1);
  // out of reach (2.2 m away) -> whiff
  sim = manual('doubles', 'sideout');
  place(sim, 0, 1.0, 4.0);
  liveBall(sim, { hitter: 2, pos: { x: 3.4, y: 1.0, z: 4.0 }, vel: { x: 0, y: 0, z: 0 }, hits: 4, bounces: 1 });
  evs = run(sim, 60, (i) => (i === 0 ? { 0: { swing: 'drive' } } : {}));
  assert.equal(ofType(evs, 'hit').length, 0);
  // high ball + drive = smash
  sim = manual('doubles', 'sideout');
  place(sim, 0, 1.0, 3.5);
  liveBall(sim, { hitter: 2, pos: { x: 1.0, y: 1.95, z: 3.5 }, vel: { x: 0, y: 0.0, z: 0 }, hits: 4, twoBounce: 0 });
  evs = run(sim, 40, (i) => (i === 0 ? { 0: { swing: 'drive', power: 1 } } : {}));
  const h = ofType(evs, 'hit')[0];
  assert.ok(h, 'smash hit');
  assert.equal(h.shot, 'smash');
  assert.ok(h.speed > 15, `smash speed ${h.speed}`);
  assert.equal(sim.state.players[0].anim.name === 'smash' || sim.state.players[0].anim.name === 'volley', true);
  // can't hit your own team's ball
  sim = manual('doubles', 'sideout');
  place(sim, 0, 1.0, 4.0);
  liveBall(sim, { hitter: 1, pos: { x: 1.0, y: 1.0, z: 4.0 }, vel: { x: 0, y: 0, z: 0 }, hits: 4, bounces: 1 });
  evs = run(sim, 40, (i) => (i === 0 ? { 0: { swing: 'drive' } } : {}));
  assert.equal(ofType(evs, 'hit').length, 0);
});

test('shot types produce sensible trajectories and exact landing predictions', () => {
  const speeds = {};
  for (const shot of ['drive', 'drop', 'dink', 'lob']) {
    const sim = manual('doubles', 'sideout', 5);
    const z = shot === 'dink' ? 2.6 : 5.5;
    place(sim, 0, 0.5, z);
    liveBall(sim, { hitter: 2, pos: { x: 1.0, y: 0.9, z }, vel: { x: 0, y: 0, z: 0 }, hits: 4, bounces: 1 });
    const evs = run(sim, 30, (i) => (i === 0 ? { 0: { swing: shot, power: 0.5 } } : {}), (s, e) => ofType(e, 'hit').length > 0);
    const h = ofType(evs, 'hit')[0];
    assert.ok(h, shot);
    speeds[shot] = h.speed;
    const L = sim.state.ball.landing;
    assert.ok(L && L.z < 0, `${shot} lands on far side`);
    const evs2 = run(sim, 400, () => ({}), (s, e) => ofType(e, 'bounce').length > 0);
    const b = ofType(evs2, 'bounce')[0];
    assert.ok(b, shot);
    if (ofType(evs, 'netTouch').length + ofType(evs2, 'netTouch').length === 0) {
      assert.ok(Math.abs(b.pos.x - L.x) < 1e-6 && Math.abs(b.pos.z - L.z) < 1e-6, `${shot} landing exact`);
    }
  }
  assert.ok(speeds.drive > 11 && speeds.drive < 20, `drive ${speeds.drive}`);
  assert.ok(speeds.dink < 8, `dink ${speeds.dink}`);
  assert.ok(speeds.drop < 13, `drop ${speeds.drop}`);
  assert.ok(speeds.lob > speeds.dink);
});

test('net cord: a ball whose centre is more than one radius above the tape is not a touch', () => {
  const sim = manual('doubles', 'sideout');
  const y = netTop(0) + COURT.ballR * 1.5;
  liveBall(sim, { hitter: 0, pos: { x: 0, y, z: 0.1 }, vel: { x: -0.5, y: 0.0, z: -7 }, hits: 3, crossed: false });
  const evs = run(sim, 40);
  assert.equal(ofType(evs, 'netTouch').length, 0);
});

test('serve: landing on the kitchen line is short, 3 cm beyond it is good (line centre + half line width only)', () => {
  for (const [z, reason] of [[-2.15, 'serveShort'], [-2.134, 'serveShort'], [-2.17, undefined]]) {
    const sim = manual('doubles', 'sideout');
    const srv = sim.state.players[sim.state.score.serverId];
    const bs = sim.state.score.receiverId;
    const rx = sim.state.players[bs].pos.x;
    liveBall(sim, { hitter: srv.id, pos: { x: rx, y: 0.5, z }, vel: { x: 0, y: -3, z: 0 }, hits: 1, twoBounce: 2, serve: true });
    const evs = run(sim, 40, () => ({}), (s, e) => ofType(e, 'bounce').length > 0 && (s.state.phase !== 'serve' || e.length > 2));
    assert.equal(faultOf(evs)?.reason, reason, `z=${z}`);
  }
});
