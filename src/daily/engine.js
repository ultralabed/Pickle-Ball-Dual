// Daily challenge engine: pure and deterministic (no DOM), so the same code runs in the browser, in the solver and in node tests.
// It reuses the game's own integrator (stepFlight), net model and bounce model, and adds wind, defenders, a bucket and scoring.
// World: x across the court, y up, z along it. The player stands on z > 0 and hits toward z < 0. Metres and seconds.
import { COURT, DT } from '../sim/constants.js';
import { stepFlight, netCrossing, bounceVel, netTop, trace } from '../sim/physics.js';

export { COURT, DT };
const R = COURT.ballR;
const DEG = Math.PI / 180;
const ZERO = Object.freeze({ x: 0, z: 0 });

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- rng
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function makeRng(seed) {
  let s = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const U = (r, a, b) => a + (b - a) * r();
export const sgn = (r) => (r() < 0.5 ? -1 : 1);
export const pick = (r, arr) => arr[Math.min(arr.length - 1, Math.floor(r() * arr.length))];

// ---------------------------------------------------------------- shot types (launch elevation + speed range)
// The player picks one of a stage's shot types, then pull length sets the speed inside [v0, v1].
const S = (key, elev, v0, v1, anim) => Object.freeze({ key, elev: elev * DEG, v0, v1, anim: anim || key });
export const SHOT = Object.freeze({
  drive: S('drive', 10, 9, 22),
  drop: S('drop', 32, 4.5, 14),
  lob: S('lob', 56, 6, 17),
  dink: S('dink', 38, 2.5, 9.5),
  push: S('push', 18, 3.5, 12.5, 'dink'),
  serve: S('serve', 16, 8, 21),
  serveHi: S('serveHi', 38, 6.5, 13, 'serve'),
  flat: S('flat', 5, 7, 20, 'drive'),
  roll: S('roll', 11, 6, 17, 'drive'),
  smash: S('smash', -9, 11, 26),
  steep: S('steep', -19, 11, 26, 'smash'),
  punch: S('punch', 5, 6, 18, 'volley'),
  blockV: S('blockV', 20, 3.5, 10, 'volley'),
  block: S('block', 24, 3, 11, 'volley'),
  lift: S('lift', 42, 3, 10.5, 'drop'),
});

/** ang: 0 = straight at the far baseline, positive = toward +x. power 0..1. */
export function launchVel(shot, power, ang) {
  const s = shot.v0 + clamp(power, 0, 1) * (shot.v1 - shot.v0), c = Math.cos(shot.elev);
  return { x: s * c * Math.sin(ang), y: s * Math.sin(shot.elev), z: -s * c * Math.cos(ang) };
}

// ---------------------------------------------------------------- flight of the player's ball
/**
 * Fly the ball from P with velocity V through the stage (wind, net, defenders, bucket) until the first ground contact.
 * Returns { kind, x, y, z, t, apex, rimDist, v, pts }.
 * kind: 'in' | 'bucket' | 'net' | 'block' | 'out' | 'short' | 'fault' (serve outside the service box).
 */
export function flight(st, P, V, rec = false) {
  const p = { x: P.x, y: P.y, z: P.z }, v = { x: V.x, y: V.y, z: V.z };
  const w = st.wind || ZERO, defs = st.defs || [], bk = st.bucket || null;
  const pts = rec ? [] : null;
  let apex = p.y, rimDist = null;
  const end = (kind, x, y, z, i) => ({ kind, x, y, z, t: i * DT, apex, rimDist, v, pts });
  for (let i = 1; i <= 1500; i++) {
    const px = p.x, py = p.y, pz = p.z;
    stepFlight(p, v);
    v.x += w.x * DT; v.z += w.z * DT;
    if (p.y > apex) apex = p.y;
    const nc = netCrossing(px, py, pz, p.x, p.y, p.z);
    if (nc && nc.blocked) { if (rec) pts.push(nc.x, nc.y, 0); return end('net', nc.x, nc.y, 0, i); }
    if (rec) pts.push(p.x, p.y, p.z);
    for (const d of defs) {
      if (p.y < d.h && Math.hypot(p.x - d.x, p.z - d.z) < d.r) return end('block', p.x, p.y, p.z, i);
    }
    if (bk) {
      const dh = Math.hypot(p.x - bk.x, p.z - bk.z);
      if (py > bk.h && p.y <= bk.h && v.y < 0) {
        rimDist = dh;
        if (dh <= bk.r - R) return end('bucket', p.x, p.y, p.z, i);
      } else if (p.y < bk.h && dh < bk.r + R) {
        return end(classify(st, p.x, p.z), p.x, p.y, p.z, i);   // hit the outside of the bucket
      }
    }
    if (p.y <= R && v.y < 0) {
      const f = (py - R) / (py - p.y);
      const x = px + (p.x - px) * f, z = pz + (p.z - pz) * f;
      if (rec) { pts[pts.length - 3] = x; pts[pts.length - 2] = R; pts[pts.length - 1] = z; }
      return end(classify(st, x, z), x, R, z, i);
    }
  }
  return end('out', p.x, p.y, p.z, 1500);
}

function classify(st, x, z) {
  if (z > 0) return 'short';
  if (Math.abs(x) > COURT.halfW + R || z < -COURT.halfL - R) return 'out';
  if (st.serve) {
    // a serve must clear the kitchen line and land in the diagonal box (centre line is in)
    if (z > -COURT.kitchen - R || x * st.serve.box < -R) return 'fault';
  }
  return 'in';
}

export const isGood = (res) => res.kind === 'in' || res.kind === 'bucket';

// ---------------------------------------------------------------- scoring helpers
/** 100 inside `full` metres, falling in a straight line to 0 at `zero` metres. Defaults: 0.75 ft and 8 ft. */
export function ringScore(d, full = 0.23, zero = 2.44) {
  if (d <= full) return 100;
  return Math.max(0, Math.round(100 * (1 - (d - full) / (zero - full))));
}
export const distTo = (res, t) => Math.hypot(res.x - t.x, res.z - t.z);
export const inKitchenFar = (res) => res.z <= 0 && res.z >= -COURT.kitchen - R;

/** Where a (possibly moving) target is at absolute stage time t. */
export function targetAt(tg, t) {
  if (!tg.move) return tg;
  return { ...tg, x: tg.x + tg.move.A * Math.sin((2 * Math.PI * t) / tg.move.T) };
}
/** Best case for the solver: the closest point the target can be at. */
function targetNear(tg, res) {
  if (!tg.move) return tg;
  return { ...tg, x: clamp(res.x, tg.x - tg.move.A, tg.x + tg.move.A) };
}

// ---------------------------------------------------------------- feeder helpers (incoming balls)
/** Launch velocity from F that lands on L with the given elevation (degrees). */
export function feedToLand(F, L, elevDeg) {
  const dx = L.x - F.x, dz = L.z - F.z, D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D, e = elevDeg * DEG;
  const vel = (s) => ({ x: s * Math.cos(e) * ux, y: s * Math.sin(e), z: s * Math.cos(e) * uz });
  const dist = (s) => { const r = trace(F, vel(s)); return r ? Math.hypot(r.x - F.x, r.z - F.z) : 1e9; };
  if (dist(45) < D) return null;
  let lo = 1, hi = 45;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (dist(m) < D) lo = m; else hi = m; }
  return vel((lo + hi) / 2);
}
/** Launch velocity from F with the given speed that passes through point C (low, flat branch). */
export function feedThrough(F, C, speed) {
  const dx = C.x - F.x, dz = C.z - F.z, D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D;
  const vel = (e) => ({ x: speed * Math.cos(e) * ux, y: speed * Math.sin(e), z: speed * Math.cos(e) * uz });
  const yAt = (e) => {
    const p = { x: F.x, y: F.y, z: F.z }, v = vel(e);
    for (let i = 0; i < 900; i++) {
      const px = p.x, py = p.y, pz = p.z;
      stepFlight(p, v);
      const d = Math.hypot(p.x - F.x, p.z - F.z);
      if (d >= D) { const d0 = Math.hypot(px - F.x, pz - F.z); return py + (p.y - py) * ((D - d0) / (d - d0)); }
      if (p.y < 0) return -1;
    }
    return -1;
  };
  let lo = -0.35, hi = 0.7;
  if (yAt(hi) < C.y) return null;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (yAt(m) < C.y) lo = m; else hi = m; }
  return vel((lo + hi) / 2);
}

/**
 * Path of an incoming ball: positions per tick with the bounce count, the ideal contact tick and the hittable window.
 * choose(samples) returns the index of the ideal contact. Returns null when the feed is not clean (net, lands out, no contact).
 */
export function buildIncoming(F, V, choose, reach = 0.7) {
  const p = { x: F.x, y: F.y, z: F.z }, v = { x: V.x, y: V.y, z: V.z };
  const pts = [];
  let b = 0;
  for (let i = 1; i <= 600; i++) {
    const px = p.x, py = p.y, pz = p.z;
    stepFlight(p, v);
    const nc = netCrossing(px, py, pz, p.x, p.y, p.z);
    if (nc && (nc.blocked || nc.y < netTop(nc.x) + 0.12)) return null;
    if (p.y <= R && v.y < 0) {
      p.y = R; b++;
      if (b === 1 && (Math.abs(p.x) > COURT.halfW || p.z > COURT.halfL || p.z < 0)) return null;
      bounceVel(v, 0);
      if (b >= 2) { pts.push({ x: p.x, y: p.y, z: p.z, b, vy: v.y }); break; }
    }
    pts.push({ x: p.x, y: p.y, z: p.z, b, vy: v.y });
  }
  const ideal = choose(pts);
  if (ideal == null || ideal < 12) return null;
  const C = pts[ideal];
  let w0 = ideal, w1 = ideal;
  const ok = (q) => q.b === C.b && Math.hypot(q.x - C.x, q.y - C.y, q.z - C.z) <= reach;
  while (w0 > 0 && ok(pts[w0 - 1])) w0--;
  while (w1 < pts.length - 1 && ok(pts[w1 + 1])) w1++;
  return { from: { x: F.x, y: F.y, z: F.z }, vel: { x: V.x, y: V.y, z: V.z }, pts, ideal, w0, w1 };
}

// ---------------------------------------------------------------- stage defaults
/** Fill in the fields every stage has. `hitY` is the contact height of a self-fed ball. */
export function finishStage(st) {
  st.wind = st.wind || { x: 0, z: 0 };
  st.defs = (st.defs || []).map((d) => ({ r: 0.85, h: 2.3, ...d }));
  st.balls = st.balls || 3;
  st.agg = st.agg || 'best';
  if (st.inc) {
    const C = st.inc.pts[st.inc.ideal];
    st.hit = { x: C.x, y: C.y, z: C.z };
    if (!st.player) st.player = { x: C.x - 0.42, z: C.z + (st.inc.above ? 0.12 : 0.3) };
  } else if (!st.hit) {
    st.hit = { x: st.player.x + 0.4, y: st.hitY || 0.9, z: st.player.z - 0.35 };
  }
  return st;
}

/** Seconds before the ball is in reach during which a release still counts (the swing meets the ball as it arrives). */
export const EARLY = 0.25;

/** Where a ball struck at `tick` of the incoming path starts from (null = cannot be hit then). */
export function contactAt(st, tick) {
  const inc = st.inc;
  if (!inc) return { tick: 0, P: st.hit };
  const early = Math.round(EARLY / DT);   // a swing started a little early still meets the ball as it arrives
  if (tick >= inc.w0 && tick <= inc.w1) return { tick, P: inc.pts[tick] };
  if (tick < inc.w0 && inc.w0 - tick <= early) return { tick: inc.w0, P: inc.pts[inc.w0] };
  return null;
}

// ---------------------------------------------------------------- playing one ball
/**
 * def: the challenge definition, ti: target index, tLand0: absolute stage time of the launch (for moving targets),
 * P: contact point (defaults to the stage's ideal one).
 */
export function playBall(st, def, shotIdx, power, ang, ti = 0, tLaunch = 0, P = null, rec = false) {
  const shot = st.shots[shotIdx];
  const res = flight(st, P || st.hit, launchVel(shot, power, ang), rec);
  const tg = targetAt(st.targets[ti], tLaunch + res.t);
  const score = isGood(res) ? clamp(Math.round(def.score(st, res, tg)), 0, 100) : 0;
  return { res, score, tg };
}

// ---------------------------------------------------------------- solver
function evalSolve(st, def, shot, power, ang, tg0) {
  const res = flight(st, st.hit, launchVel(shot, power, ang));
  const tg = targetNear(tg0, res);
  let err, score = 0;
  if (isGood(res)) {
    score = clamp(Math.round(def.score(st, res, tg)), 0, 100);
    err = st.bucket ? (res.kind === 'bucket' ? 0 : (res.rimDist ?? distTo(res, tg) + 1)) : distTo(res, tg);
  } else err = 50 + distTo(res, tg);
  return { score, err };
}
const better = (a, b) => a.score > b.score || (a.score === b.score && a.err < b.err - 1e-9);

/** Best possible score for one target: coarse grid over shot type, power and direction, then a pattern-search refinement. */
export function solveTarget(st, def, ti = 0) {
  const tg = st.targets[ti], P = st.hit;
  const base = Math.atan2(tg.x - P.x, -(tg.z - P.z));
  let best = { score: -1, err: 1e9 };
  for (let si = 0; si < st.shots.length; si++) {
    const shot = st.shots[si];
    let b = { score: -1, err: 1e9 };
    for (let p = 0; p <= 1.0001; p += 0.04) {
      for (let a = -0.48; a <= 0.4801; a += 0.04) {
        const e = evalSolve(st, def, shot, p, base + a, tg);
        if (better(e, b)) b = { ...e, si, power: p, ang: base + a };
      }
    }
    let dp = 0.02, da = 0.02;
    for (let it = 0; it < 40 && b.score < 100 && dp > 2e-4; it++) {
      let moved = false;
      for (const [mp, ma] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const p = clamp(b.power + mp * dp, 0, 1), a = b.ang + ma * da;
        const e = evalSolve(st, def, shot, p, a, tg);
        if (better(e, b)) { b = { ...e, si, power: p, ang: a }; moved = true; }
      }
      if (!moved) { dp /= 2; da /= 2; }
    }
    if (better(b, best)) best = b;
    if (best.score >= 100) break;
  }
  return best;
}

/** Best possible stage score (what a perfect player would get) and the shots that get it. */
export function solveStage(st, def) {
  const n = st.agg === 'avg' ? st.targets.length : 1;
  const sols = [];
  let sum = 0, min = 100;
  for (let ti = 0; ti < n; ti++) { const s = solveTarget(st, def, ti); sols.push(s); sum += Math.max(0, s.score); min = Math.min(min, s.score); }
  return { score: Math.round(sum / n), min, sols };
}

export const SOLVE_MIN = 95;
/** A setup is only kept when shots a little off the perfect one (2 % power, about 1 degree) still score at least this. */
export const ROBUST_MIN = 60;

/** Worst score among shots slightly off the solver's shot: knife-edge setups (perfect shot skims the net or a defender) score low. */
export function robustness(st, def) {
  let worst = 100;
  st.sols.forEach((s, ti) => {
    const tg = st.targets[ti];
    for (const dp of [-0.02, 0, 0.02]) for (const da of [-0.018, 0, 0.018]) {
      const e = evalSolve(st, def, st.shots[s.si], clamp(s.power + dp, 0, 1), s.ang + da, tg);
      if (e.score < worst) worst = e.score;
    }
  });
  return worst;
}

/** Generate a stage for a challenge from a seed; reroll until a perfect player can score at least SOLVE_MIN. */
export function genStage(def, seed) {
  const r = makeRng(typeof seed === 'string' ? `${seed}|${def.id}` : seed);
  let fallback = null;
  for (let tries = 0; tries < 80; tries++) {
    const raw = def.gen(r);
    if (!raw) continue;
    const st = finishStage(raw);
    st.id = def.id;
    const sol = solveStage(st, def);
    st.solved = sol.min; st.tries = tries + 1; st.sols = sol.sols;
    if (sol.min >= SOLVE_MIN) {
      st.robust = robustness(st, def);
      if (st.robust >= ROBUST_MIN) return st;
      if (!fallback || fallback.solved < SOLVE_MIN || st.robust > fallback.robust) fallback = st;
    } else if (!fallback || (fallback.solved < SOLVE_MIN && sol.min > fallback.solved)) fallback = st;
  }
  return fallback;
}

/** Score of a stage from its balls: best ball, or the average over the targets for "in order" stages. */
export function stageScore(st, balls) {
  if (!balls.length) return 0;
  if (st.agg === 'avg') { let s = 0; for (const b of balls) s += b.s; return Math.round(s / st.targets.length); }
  let m = 0; for (const b of balls) if (b.s > m) m = b.s;
  return m;
}
