import { COURT, DT, TIMING, REACH, SMASH_Y } from './constants.js';
import { nextRand, nextGauss, seedToState } from './rng.js';
import { stepFlight, netCrossing, bounceVel, trace, predictPath } from './physics.js';
import { planShot } from './shots.js';
import { initHalves, initScore, assignServe, resolveRally, callWords } from './rules.js';
import { clamp, sideSign, worldSign, maxSpeed, reachDist, angleDiff, inKitchen } from './util.js';
import { aiInput, aiOnHit } from './ai.js';

const R = COURT.ballR;
const LINE = 0.025;   // half of the 5 cm painted line: the only call tolerance (ball centre vs line centre)
const SWINGS = new Set(['drive', 'drop', 'dink', 'lob']);

export function createSim(config) {
  const sim = { state: null, _events: [] };
  sim.state = initState(config);
  setupServe(sim);

  sim.step = (inputs) => step(sim, inputs || {});
  sim.drainEvents = () => { const e = sim._events; sim._events = []; return e; };
  sim.snapshot = () => JSON.parse(JSON.stringify(sim.state));
  sim.restore = (snap) => { sim.state = JSON.parse(JSON.stringify(snap)); sim._events = []; };
  sim.skipPointOver = () => {
    if (sim.state.phase === 'pointOver') sim.state.phaseTime = Math.max(sim.state.phaseTime, TIMING.pointOver);
  };
  // Test/debug hooks (not part of the public contract).
  sim.debug = {
    endRally: (faultTeam, reason = 'out', playerId = null) => { sim.state.internal.live = true; faultEnd(sim, faultTeam, reason, playerId); },
    setupServe: () => { assignServe(sim.state); setupServe(sim); },
    nextRand: () => nextRand(sim.state.internal),
  };
  return sim;
}

function initState(config) {
  const cfg = JSON.parse(JSON.stringify(config));
  const n = cfg.mode === 'singles' ? 2 : 4;
  if (!cfg.players || cfg.players.length !== n) throw new Error(`need ${n} players`);
  const players = cfg.players.map((pc, i) => {
    if (pc.id !== i) throw new Error('player ids must equal their index');
    return {
      id: pc.id, team: pc.team, name: pc.name || `P${pc.id}`, handed: pc.handed === 'L' ? 'L' : 'R',
      dupr: pc.dupr, controller: pc.controller || 'ai',
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, facing: pc.team === 0 ? 0 : Math.PI,
      anim: { name: 'ready', t: 0, side: 'forehand', shot: null },
      isServer: false, isReceiver: false, emotion: 'neutral',
    };
  });
  const st = {
    tick: 0, time: 0, phase: 'preServe', phaseTime: 0, config: cfg,
    ball: { pos: { x: 0, y: 1, z: 7 }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 }, visible: true,
            bounces: 0, lastHitBy: null, landing: null },
    players, score: null,
    rally: { hits: 0, lastShot: null, twoBounceRemaining: 2 },
    internal: {
      rng: seedToState(cfg.seed), half: initHalves(players), sw: {}, ai: {}, claim: [null, null],
      hitSeq: 0, lastHitTime: -1, held: true, live: false, serveActive: false, crossed: false,
      resting: false, sp: 0, teamDepth: ['back', 'back'], lastVolley: {}, inK: {}, serveDelay: 1.5,
      lastShotAtp: false, lastWinner: null,
    },
  };
  initScore(st);
  return st;
}

function emit(sim, type, data) {
  sim._events.push({ type, tick: sim.state.tick, ...data });
}

// ---------------------------------------------------------------- serve setup
function handPos(server) {
  const hs = (server.handed === 'R' ? 1 : -1) * (server.team === 0 ? 1 : -1);
  return { x: server.pos.x + 0.22 * hs, y: 0.9, z: server.pos.z - sideSign(server.team) * 0.25 };
}

function setupServe(sim) {
  const s = sim.state, I = s.internal, sc = s.score;
  const server = s.players[sc.serverId], recv = s.players[sc.receiverId];
  for (const p of s.players) {
    const sx = worldSign(s, p);
    const sg = sideSign(p.team);
    let z;
    if (p === server) z = 7.05 * sg;
    else if (p === recv) z = 6.9 * sg;
    else if (p.team === sc.servingTeam) z = 6.4 * sg;
    else z = (p.dupr >= 4 ? 3.2 : 4.8) * sg;
    p.pos.x = sx * 1.6; p.pos.z = z;
    p.vel.x = 0; p.vel.z = 0;
    p.facing = p.team === 0 ? 0 : Math.PI;
    p.isServer = p === server;
    p.isReceiver = p === recv;
    p.anim = { name: p.isServer ? 'serveReady' : 'ready', t: 0, side: 'forehand', shot: null };
    p.emotion = p.isServer ? 'focused' : 'neutral';
    I.inK[p.id] = inKitchen(p.pos.x, z);
    I.sw[p.id] = null;
    I.ai[p.id] = { seq: -1 };
  }
  I.claim = [null, null];
  I.teamDepth = ['back', 'back'];
  I.lastVolley = {};
  I.held = true; I.live = false; I.serveActive = false; I.crossed = false; I.resting = false; I.sp = 0;
  I.hitSeq++;
  I.serveDelay = 1.3 + 0.6 * nextRand(I);
  I.lastShotAtp = false;
  const b = s.ball;
  const h = handPos(server);
  b.pos.x = h.x; b.pos.y = h.y; b.pos.z = h.z;
  b.vel.x = b.vel.y = b.vel.z = 0;
  b.spin.x = b.spin.y = b.spin.z = 0;
  b.visible = true; b.bounces = 0; b.lastHitBy = null; b.landing = null;
  s.rally = { hits: 0, lastShot: null, twoBounceRemaining: 2 };
  s.phase = 'preServe'; s.phaseTime = 0;
  emit(sim, 'serveReady', { serverId: server.id, callText: sc.callText, callWords: callWords(s) });
}

// ---------------------------------------------------------------- main step
function normInput(inp, allowTx = false) {
  const o = { mx: 0, mz: 0, swing: null, power: 0.5, aim: 0, tx: null };
  if (!inp) return o;
  if (Number.isFinite(inp.mx)) o.mx = clamp(inp.mx, -1, 1);
  if (Number.isFinite(inp.mz)) o.mz = clamp(inp.mz, -1, 1);
  if (typeof inp.swing === 'string' && SWINGS.has(inp.swing)) o.swing = inp.swing;
  if (Number.isFinite(inp.power)) o.power = clamp(inp.power, 0, 1);
  if (inp.aim === -1 || inp.aim === 1) o.aim = inp.aim;
  if (allowTx && Number.isFinite(inp.tx)) o.tx = inp.tx;
  return o;
}

function step(sim, inputs) {
  const s = sim.state, I = s.internal;
  s.tick++;
  s.time = s.tick * DT;
  s.phaseTime += DT;

  const inp = {};
  for (const p of s.players) {
    inp[p.id] = p.controller === 'ai' ? normInput(aiInput(sim, p), true) : normInput(inputs[p.id]);
  }

  const phase = s.phase;
  if (phase === 'preServe' || phase === 'serve' || phase === 'rally') {
    for (const p of s.players) updatePlayer(sim, p, inp[p.id]);
    if (I.held) {
      const server = s.players[s.score.serverId];
      const h = handPos(server);
      s.ball.pos.x = h.x; s.ball.pos.y = h.y; s.ball.pos.z = h.z;
    } else if (s.phase === 'serve' || s.phase === 'rally') {
      updateBall(sim);
    }
  } else if (phase === 'pointOver' || phase === 'gameOver') {
    const zero = normInput(null);
    for (const p of s.players) updatePlayer(sim, p, zero);
    updateBall(sim);
    if (phase === 'pointOver' && s.phaseTime >= TIMING.pointOver) {
      if (s.score.winner !== null) {
        s.phase = 'gameOver'; s.phaseTime = 0;
        emit(sim, 'gameOver', { winnerTeam: s.score.winner, points: s.score.points.slice() });
      } else {
        setupServe(sim);
      }
    }
  }
  if (s.ball.landing) s.ball.landing.t = Math.max(0, s.ball.landing.t - DT);
  updateAnims(sim);
}

// ---------------------------------------------------------------- players
function sideOf(p, ball) {
  const rightness = (ball.x - p.pos.x) * (p.team === 0 ? 1 : -1);
  if (p.handed === 'R') return rightness >= -0.05 ? 'forehand' : 'backhand';
  return rightness <= 0.05 ? 'forehand' : 'backhand';
}

function swingAnimName(s, p, shot) {
  const b = s.ball;
  if (shot === 'drive' && b.pos.y > 1.45 && Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < 3) return 'smash';
  if (shot !== 'lob' && b.bounces === 0 && b.lastHitBy !== null && s.players[b.lastHitBy].team !== p.team &&
      Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < 4.5) return 'volley';
  return shot;
}

function updatePlayer(sim, p, inp) {
  const s = sim.state, I = s.internal;
  const live = s.phase === 'preServe' || s.phase === 'serve' || s.phase === 'rally';
  let sw = I.sw[p.id] || null;

  if (live && inp.swing && !sw) {
    const serving = I.held;
    if (!serving || (p.isServer && s.phase === 'preServe')) {
      sw = {
        t: 0, shot: inp.swing, aim: inp.aim, power: inp.power, tx: inp.tx, serve: serving,
        contacted: false, prevD: null, minD: 99,
        side: serving ? 'forehand' : sideOf(p, s.ball.pos),
        animName: serving ? 'serve' : swingAnimName(s, p, inp.swing),
      };
      I.sw[p.id] = sw;
      if (serving) { s.phase = 'serve'; s.phaseTime = 0; }
    }
  }

  // movement
  let ms = live ? maxSpeed(p) : 0;
  if (sw) ms *= sw.serve ? 0.1 : 0.5;
  if (I.held && p.isServer && sw) ms = 0;
  let ix = inp.mx, iz = inp.mz;
  const m = Math.hypot(ix, iz);
  if (m > 1) { ix /= m; iz /= m; }
  const dvx = ix * ms - p.vel.x, dvz = iz * ms - p.vel.z;
  const dl = Math.hypot(dvx, dvz), acc = 24 * DT;
  if (dl > acc) { p.vel.x += dvx / dl * acc; p.vel.z += dvz / dl * acc; } else { p.vel.x += dvx; p.vel.z += dvz; }
  p.pos.x += p.vel.x * DT;
  p.pos.z += p.vel.z * DT;
  p.pos.x = clamp(p.pos.x, -7.5, 7.5);
  const sg = sideSign(p.team);
  let own = p.pos.z * sg;
  if (I.held && p.isServer) {
    own = clamp(own, 7.05, 9.5);
    const sx = worldSign(s, p);
    p.pos.x = sx * clamp(p.pos.x * sx, 0.3, 3.0);
  } else {
    own = clamp(own, 0.3, 10.5);
  }
  p.pos.z = own * sg;

  // facing eases toward the opponent side, slightly turned toward the ball
  const base = p.team === 0 ? 0 : Math.PI;
  let tf = base;
  if (!I.held) {
    const b = s.ball.pos;
    const toBall = Math.atan2(b.x - p.pos.x, -(b.z - p.pos.z));
    tf = base + clamp(angleDiff(toBall, base), -1.0, 1.0) * 0.4;
  }
  p.facing += angleDiff(tf, p.facing) * Math.min(1, 10 * DT);

  // kitchen momentum
  const inK = inKitchen(p.pos.x, p.pos.z);
  if (live && I.live && inK && !I.inK[p.id] &&
      s.time - (I.lastVolley[p.id] ?? -99) <= TIMING.kitchenMomentum) {
    faultEnd(sim, p.team, 'kitchen', p.id);
  }
  I.inK[p.id] = inK;

  // swing progress
  if (sw) {
    sw.t += DT;
    if (!sw.serve && sw.t < 0.1) sw.side = sideOf(p, s.ball.pos);
    if (!sw.contacted) sw.tc = predictContact(sim, p, sw);
    if (live) {
      if (sw.serve) {
        if (!sw.contacted && sw.t >= TIMING.serveContact) doServe(sim, p, sw);
      } else if (!sw.contacted && sw.t >= TIMING.winStart && sw.t <= TIMING.winEnd + DT * 0.5) {
        tryContact(sim, p, sw);
      }
    }
    if (sw.t >= TIMING.swingDur) I.sw[p.id] = null;
  }
}

function ballHittableBy(s, p) {
  const I = s.internal, b = s.ball;
  if (I.held || !I.live || b.lastHitBy === null) return false;
  if (s.players[b.lastHitBy].team === p.team) return false;
  return b.pos.z * sideSign(p.team) >= -0.05;
}

// Expected swing time of paddle/ball contact (view-only hint exposed as anim.tc). Mirrors the contact rule in
// tryContact on the ball's predicted path; falls back to the window centre when the ball will not be reached.
function predictContact(sim, p, sw) {
  if (sw.serve) return TIMING.serveContact;
  const s = sim.state, b = s.ball;
  if (s.internal.held || !s.internal.live || b.lastHitBy === null) return TIMING.winCenter;
  const horizon = TIMING.winEnd - sw.t + DT;
  if (horizon <= 0) return Math.max(sw.t, TIMING.winCenter);
  const pp = predictPath(b.pos, b.vel, b.bounces, s.internal.sp, horizon, 1);
  const illegal = volleyIllegal(s, p);
  let prevD = null, tc = null;
  for (const m of pp.samples) {
    const ts = sw.t + m.t;
    if (ts < TIMING.winStart) continue;
    if (ts > TIMING.winEnd + DT * 0.5) break;
    if (m.z * sideSign(p.team) < -0.05) { prevD = null; continue; }
    const d = reachDist(p.pos, m);
    if (d <= REACH) {
      const closing = prevD !== null && d > prevD;
      if (d <= 0.45 || ((closing || ts >= TIMING.winEnd - DT) && !(m.b === 0 && illegal))) { tc = ts; break; }
    }
    prevD = d;
  }
  return clamp(tc === null ? Math.max(sw.t + DT, TIMING.winCenter) : tc, sw.t, 0.4);
}

// A volley (ball not yet bounced) is illegal while the two-bounce rule is pending or when standing in the kitchen.
// An illegal volley is never forced by the end of the swing window: only a deliberate close contact counts.
function volleyIllegal(s, p) {
  return s.rally.twoBounceRemaining > 0 || inKitchen(p.pos.x, p.pos.z);
}

/**
 * What would happen if `p` pressed a swing key right now (for the shell's timing ring). Mirrors tryContact on the predicted
 * ball path with the player standing still. Returns null (nothing is hit) or { tc, illegal }: `tc` = swing-seconds at which the
 * paddle meets the ball (0.17 is perfect), `illegal` = that contact would be a fault (illegal volley).
 */
export function pressOutcome(state, p) {
  const b = state.ball, I = state.internal;
  if (I.held || !I.live || b.lastHitBy === null) return null;
  if (state.players[b.lastHitBy].team === p.team) return null;
  const pp = predictPath(b.pos, b.vel, b.bounces, I.sp, TIMING.winEnd + DT, 1);
  const pts = [{ t: 0, x: b.pos.x, y: b.pos.y, z: b.pos.z, b: b.bounces }].concat(pp.samples);
  const illegalV = volleyIllegal(state, p);
  let prevD = null;
  for (const m of pts) {
    const ts = m.t + DT;            // the swing is created in the tick that sees the ball at m.t = 0
    if (ts < TIMING.winStart) continue;
    if (ts > TIMING.winEnd + DT * 0.5) break;
    if (m.z * sideSign(p.team) < -0.05) { prevD = null; continue; }
    const d = reachDist(p.pos, m);
    if (d <= REACH) {
      const volley = m.b === 0;
      const closing = prevD !== null && d > prevD;
      if (d <= 0.45) return { tc: ts, illegal: volley && illegalV };
      if ((closing || ts >= TIMING.winEnd - DT) && !(volley && illegalV)) return { tc: ts, illegal: false };
    }
    prevD = d;
  }
  return null;
}

function tryContact(sim, p, sw) {
  const s = sim.state, b = s.ball;
  if (!ballHittableBy(s, p)) { sw.prevD = null; return; }
  const d = reachDist(p.pos, b.pos);
  if (d <= REACH) {
    sw.minD = Math.min(sw.minD, d);
    const closing = sw.prevD !== null && d > sw.prevD;
    const forced = (closing || sw.t >= TIMING.winEnd - DT) && !(b.bounces === 0 && volleyIllegal(s, p));
    if (d <= 0.45 || forced) {
      contactHit(sim, p, sw, sw.minD);
      return;
    }
  }
  sw.prevD = d;
}

function applyPlan(sim, p, plan, extra) {
  const s = sim.state, I = s.internal, b = s.ball;
  b.vel.x = plan.v.x; b.vel.y = plan.v.y; b.vel.z = plan.v.z;
  if (b.pos.y < 0.1) b.pos.y = 0.1;
  const hs = Math.hypot(plan.v.x, plan.v.z) || 1;
  const w = plan.sp * 110;
  b.spin.x = plan.v.z / hs * w; b.spin.y = 0; b.spin.z = -plan.v.x / hs * w;
  I.sp = plan.sp;
  b.bounces = 0;
  b.lastHitBy = p.id;
  I.crossed = false;
  I.resting = false;
  I.hitSeq++;
  I.lastHitTime = s.time;
  setLanding(sim);
}

function setLanding(sim) {
  const b = sim.state.ball;
  const r = trace(b.pos, b.vel);
  b.landing = r ? { x: r.x, z: r.z, t: r.t } : null;
}

function rnd(sim) {
  const I = sim.state.internal;
  return { g: () => nextGauss(I) };
}

function contactHit(sim, p, sw, dmin) {
  const s = sim.state, I = s.internal, b = s.ball;
  sw.contacted = true;
  sw.tc = sw.t;
  const stretch = clamp(dmin / REACH, 0, 1);
  const tq = 1 - clamp(Math.abs(sw.t - TIMING.winCenter) / 0.12, 0, 1) * 0.65;
  const isVolley = b.bounces === 0;
  const inSpeed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  const side = sw.side;
  const ctx = {
    P: { x: b.pos.x, y: b.pos.y, z: b.pos.z }, team: p.team, shot: sw.shot, aim: sw.aim, tx: sw.tx,
    power: sw.power, dupr: p.dupr, human: p.controller !== 'ai', stretch, tq, inSpeed,
    moveSpeed: Math.hypot(p.vel.x, p.vel.z), fatigue: p.controller === 'ai' ? s.rally.hits : 0,
  };
  let plan = null;
  if (Math.abs(p.pos.x) > 3.45 && Math.abs(p.pos.z) < 2.9 && Math.abs(b.pos.x) > COURT.postX + 0.05) {
    ctx.shot = 'atp';
    plan = planShot(ctx, rnd(sim));
  }
  if (!plan) {
    ctx.shot = sw.shot === 'drive' && b.pos.y > SMASH_Y ? 'smash' : sw.shot;
    plan = planShot(ctx, rnd(sim));
  }
  const atp = plan.shot === 'atp';
  const shot = atp ? sw.shot : plan.shot;
  const pos = { x: b.pos.x, y: b.pos.y, z: b.pos.z };
  applyPlan(sim, p, plan);
  I.lastShotAtp = atp;
  s.rally.hits++;
  s.rally.lastShot = atp ? 'atp' : plan.shot;
  if (plan.shot === 'smash' && sw.animName !== 'smash') sw.animName = 'smash';
  else if (plan.shot !== 'smash' && sw.animName === 'smash') sw.animName = 'drive';
  const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  emit(sim, 'hit', { playerId: p.id, shot, side, power: plan.power, atp, isVolley, isServe: false, pos, speed });

  const remaining = s.rally.twoBounceRemaining;
  s.rally.twoBounceRemaining = Math.max(0, remaining - 1);
  aiOnHit(sim, p, plan.shot, atp);
  if (isVolley) {
    if (remaining > 0) { faultEnd(sim, p.team, 'twoBounceRule', p.id); return; }
    if (inKitchen(p.pos.x, p.pos.z)) { faultEnd(sim, p.team, 'kitchen', p.id); return; }
    I.lastVolley[p.id] = s.time;
  }
}

function doServe(sim, p, sw) {
  const s = sim.state, I = s.internal, b = s.ball;
  sw.contacted = true;
  sw.tc = sw.t;
  const type = sw.shot === 'drive' ? 'drive' : sw.shot === 'lob' ? 'lob' : 'soft';
  const ctx = {
    P: { x: b.pos.x, y: b.pos.y, z: b.pos.z }, team: p.team, shot: 'serve', serveType: type,
    boxSign: -worldSign(s, p), aim: sw.aim, tx: sw.tx, power: 0.5, dupr: p.dupr,
    human: p.controller !== 'ai', stretch: 0.1, tq: 0.9, inSpeed: 0, moveSpeed: 0,
  };
  const plan = planShot(ctx, rnd(sim));
  const pos = { x: b.pos.x, y: b.pos.y, z: b.pos.z };
  applyPlan(sim, p, plan);
  I.held = false; I.live = true; I.serveActive = true;
  s.rally.hits = 1;
  s.rally.lastShot = 'serve';
  s.rally.twoBounceRemaining = 2;
  const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  emit(sim, 'hit', { playerId: p.id, shot: 'serve', side: 'forehand', power: plan.power, atp: false,
    isVolley: false, isServe: true, pos, speed });
  aiOnHit(sim, p, 'serve', false);
}

// ---------------------------------------------------------------- ball
function updateBall(sim) {
  const s = sim.state, I = s.internal, b = s.ball;
  if (I.resting) {
    b.vel.x *= 1 - 3 * DT; b.vel.z *= 1 - 3 * DT;
    if (Math.hypot(b.vel.x, b.vel.z) < 0.03) { b.vel.x = 0; b.vel.z = 0; }
    b.pos.x += b.vel.x * DT; b.pos.z += b.vel.z * DT;
    b.pos.y = R;
    fence(b);
    if (I.live && b.bounces >= 1) faultEnd(sim, b.pos.z > 0 ? 0 : 1, 'doubleBounce', nearestOnTeam(s, b.pos.z > 0 ? 0 : 1, b.pos));
    return;
  }
  const px = b.pos.x, py = b.pos.y, pz = b.pos.z;
  stepFlight(b.pos, b.vel);
  b.spin.x *= 0.9995; b.spin.z *= 0.9995;

  fence(b);

  // net
  const nc = netCrossing(px, py, pz, b.pos.x, b.pos.y, b.pos.z);
  if (nc) {
    if (nc.blocked) {
      emit(sim, 'netTouch', { pos: { x: nc.x, y: nc.y, z: 0 } });
      const back = pz > 0 ? 1 : -1;
      b.pos.x = nc.x; b.pos.y = nc.y; b.pos.z = back * 0.03;
      b.vel.z = -b.vel.z * 0.12; b.vel.x *= 0.4; b.vel.y = Math.min(b.vel.y, 0) * 0.4;
      setLanding(sim);
      if (I.live && b.bounces === 0 && b.lastHitBy !== null) {
        faultEnd(sim, s.players[b.lastHitBy].team, 'net', b.lastHitBy);
      }
      return;
    }
    if (nc.clip) {
      emit(sim, 'netTouch', { pos: { x: nc.x, y: nc.y, z: 0 } });
      b.vel.z *= 0.85; b.vel.y *= 0.7;
      setLanding(sim);
    }
    I.crossed = true;
  }

  // ground
  if (b.pos.y <= R && b.vel.y < 0) {
    const f = (py - R) / (py - b.pos.y);
    b.pos.x = px + (b.pos.x - px) * f;
    b.pos.z = pz + (b.pos.z - pz) * f;
    b.pos.y = R;
    const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    b.bounces++;
    const inB = Math.abs(b.pos.x) <= COURT.halfW + LINE && Math.abs(b.pos.z) <= COURT.halfL + LINE;
    emit(sim, 'bounce', { pos: { x: b.pos.x, z: b.pos.z }, inBounds: inB, speed });
    const landSide = b.pos.z > 0 ? 0 : 1;
    let ended = false;
    if (I.live) ended = judgeBounce(sim, inB, landSide);
    bounceVel(b.vel, I.sp);
    I.sp *= 0.5;
    b.spin.x *= 0.5; b.spin.z *= 0.5;
    if (b.vel.y < 0.8) { b.vel.y = 0; I.resting = true; }
    setLanding(sim);
    if (I.resting) b.landing = null;
    if (ended) return;
  }

  // body hits
  if (I.live && !I.held) {
    for (const p of s.players) {
      if (p.id === b.lastHitBy && s.time - I.lastHitTime < 0.25) continue;
      if (b.pos.y > 0.25 && b.pos.y < 1.6 && Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < 0.22) {
        // an active swing always takes a ball that is this close (before it counts as a body hit)
        const sw = I.sw[p.id];
        if (sw && !sw.contacted && !sw.serve && ballHittableBy(s, p) && !(b.bounces === 0 && volleyIllegal(s, p))) {
          contactHit(sim, p, sw, Math.min(sw.minD, reachDist(p.pos, b.pos)));
          if (!I.live) return;
          continue;
        }
        faultEnd(sim, p.team, 'bodyHit', p.id);
        return;
      }
    }
  }
}

function fence(b) {
  if (Math.abs(b.pos.x) > 8) { b.pos.x = Math.sign(b.pos.x) * 8; b.vel.x *= -0.4; }
  if (Math.abs(b.pos.z) > 11.5) { b.pos.z = Math.sign(b.pos.z) * 11.5; b.vel.z *= -0.4; }
  if (b.pos.y > 14) { b.pos.y = 14; b.vel.y = -Math.abs(b.vel.y) * 0.3; }
}

function nearestOnTeam(s, team, pos) {
  let best = null, bd = 1e9;
  for (const p of s.players) {
    if (p.team !== team) continue;
    const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
    if (d < bd) { bd = d; best = p.id; }
  }
  return best;
}

// returns true if the rally ended
function judgeBounce(sim, inB, landSide) {
  const s = sim.state, I = s.internal, b = s.ball;
  const hitter = s.players[b.lastHitBy];
  if (b.bounces === 1) {
    if (I.serveActive) {
      const recvSide = 1 - hitter.team;
      const bs = -worldSign(s, hitter);
      let reason = null;
      if (landSide !== recvSide) reason = 'net';
      else if (!inB) reason = 'out';
      else if (Math.abs(b.pos.z) <= COURT.kitchen + LINE) reason = 'serveShort';
      else if (b.pos.x * bs < -LINE) reason = 'serveWrongCourt';
      if (reason) { faultEnd(sim, hitter.team, reason, hitter.id); return true; }
      I.serveActive = false;
      s.phase = 'rally'; s.phaseTime = 0;
      return false;
    }
    if (landSide === hitter.team) { faultEnd(sim, hitter.team, 'net', hitter.id); return true; }
    if (!inB) { faultEnd(sim, hitter.team, 'out', hitter.id); return true; }
    return false;
  }
  if (b.bounces >= 2) {
    faultEnd(sim, landSide, 'doubleBounce', nearestOnTeam(s, landSide, b.pos));
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- rally end
function faultEnd(sim, faultTeam, reason, playerId) {
  const s = sim.state, I = s.internal;
  if (!I.live) return;
  I.live = false;
  I.serveActive = false;
  emit(sim, 'fault', { reason, team: faultTeam, playerId: playerId ?? null });
  const winnerTeam = 1 - faultTeam;
  const hits = s.rally.hits;
  const lastHitterTeam = s.ball.lastHitBy !== null ? s.players[s.ball.lastHitBy].team : null;
  const winnerShot = reason === 'doubleBounce' && lastHitterTeam === winnerTeam;
  const lastShot = s.rally.lastShot;
  const res = resolveRally(s, winnerTeam);
  let highlight = false, highlightReason = null;
  if (winnerShot && lastShot === 'smash') { highlight = true; highlightReason = 'smash'; }
  else if (winnerShot && I.lastShotAtp) { highlight = true; highlightReason = 'atp'; }
  else if (winnerShot && lastShot === 'lob') { highlight = true; highlightReason = 'lob'; }
  else if (hits >= 10) { highlight = true; highlightReason = 'longRally'; }
  if (s.score.winner !== null && !highlight) { highlight = true; highlightReason = 'gamePoint'; }
  I.lastWinner = winnerTeam;
  s.phase = 'pointOver'; s.phaseTime = 0;
  emit(sim, 'rallyEnd', { winnerTeam, reason, hits, pointScored: res.pointScored, sideOut: res.sideOut,
    secondServer: res.secondServer, highlight, highlightReason });
}

// ---------------------------------------------------------------- anim / emotion
function updateAnims(sim) {
  const s = sim.state, I = s.internal;
  const over = s.phase === 'pointOver' || s.phase === 'gameOver';
  for (const p of s.players) {
    const sw = I.sw[p.id];
    const a = p.anim;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    let name, side = a.side, shot = a.shot;
    if (sw) { name = sw.animName; side = sw.side; shot = sw.shot; }
    else if (over && (s.phase === 'gameOver' || s.phaseTime > 0.35) && I.lastWinner !== null) {
      name = p.team === I.lastWinner ? 'celebrate' : 'dejected';
    } else if (I.held && p.isServer) name = 'serveReady';
    else name = speed > 0.8 ? 'run' : 'ready';
    if (name !== a.name) { a.name = name; a.t = 0; } else a.t += DT;
    if (sw) a.t = sw.t;
    if (sw && sw.tc !== undefined) { a.tc = sw.tc; a.hit = sw.contacted; } else { delete a.tc; delete a.hit; }
    a.side = side; a.shot = shot;

    let em = 'neutral';
    if (over && I.lastWinner !== null && (s.phase === 'gameOver' || s.phaseTime > 0.2)) {
      em = p.team === I.lastWinner ? 'happy' : 'sad';
    } else if (sw || (I.held && p.isServer)) em = 'focused';
    else if (I.live && s.ball.lastHitBy !== null && s.players[s.ball.lastHitBy].team !== p.team) em = 'focused';
    p.emotion = em;
  }
}
