// Shot planning: choose a target, perturb it with the error model, then solve a launch velocity
// with the same integrator the sim uses so the landing point is exact.
import { COURT } from './constants.js';
import { trace, netTop } from './physics.js';
import { clamp } from './util.js';

const R = COURT.ballR;
const DEG = Math.PI / 180;

// Skill -> overall error multiplier (tuned by tests/tools).
export const SKILL = { 3: 1.9, 4: 1.15, 5: 0.72, 6: 0.46 };
export const HUMAN_EASE = 0.85;

export function skillScale(dupr) {
  const d = clamp(dupr, 3, 6);
  const lo = Math.floor(d), hi = Math.min(6, lo + 1);
  return SKILL[lo] + (SKILL[hi] - SKILL[lo]) * (d - lo);
}

const BASE = {
  drive:  { x: 0.45, z: 0.55, c: 0.10 },
  smash:  { x: 0.40, z: 0.50, c: 0.08 },
  drop:   { x: 0.30, z: 0.35, c: 0.10 },
  dink:   { x: 0.25, z: 0.22, c: 0.08 },
  lob:    { x: 0.50, z: 0.60, c: 0.25 },
  serve:  { x: 0.30, z: 0.35, c: 0.07 },
  serveDrive: { x: 0.35, z: 0.45, c: 0.09 },
  atp:    { x: 0.35, z: 0.45, c: 0.10 },
};

function sigmas(c, kind, farF = 0) {
  const sk = skillScale(c.dupr) * (c.human ? HUMAN_EASE : 1);
  const b = BASE[kind];
  const q = (1 + 1.6 * c.stretch * c.stretch) * (1 + 1.2 * (1 - c.tq)) *
            (1 + 0.025 * Math.max(0, c.inSpeed - 8)) * (1 + 0.05 * c.moveSpeed) * (1 + farF) * (1 + 0.06 * Math.max(0, (c.fatigue || 0) - 12));
  const planQ = 1.15;
  return {
    x: b.x * sk * q, z: b.z * sk * q, c: b.c * sk * q,
    x0: b.x * sk * planQ, z0: b.z * sk * planQ,
  };
}

// ---------- solvers ----------
function landDist(P, ux, uz, s, th) {
  const cs = Math.cos(th);
  const r = trace(P, { x: s * cs * ux, y: s * Math.sin(th), z: s * cs * uz });
  return r ? Math.hypot(r.x - P.x, r.z - P.z) : 1e9;
}
function evalAt(P, ux, uz, s, th) {
  const cs = Math.cos(th);
  return trace(P, { x: s * cs * ux, y: s * Math.sin(th), z: s * cs * uz });
}
function velOf(ux, uz, s, th) {
  const cs = Math.cos(th);
  return { x: s * cs * ux, y: s * Math.sin(th), z: s * cs * uz };
}
function clearOf(res, mode) {
  if (!res || res.crossY === null) return -Infinity;
  if (mode === 'atp') {
    return Math.abs(res.crossX) > COURT.postX + 0.08 ? res.crossY - R - 0.1 : -Infinity;
  }
  return res.crossY - netTop(res.crossX) - R;
}

function solveLow(P, ux, uz, D, s) {
  let lo = -80 * DEG, hi = 44 * DEG;
  if (landDist(P, ux, uz, s, hi) < D) return null;
  if (landDist(P, ux, uz, s, lo) > D) return lo;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (landDist(P, ux, uz, s, mid) < D) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function solveFlat(P, ux, uz, D, s0, clear, mode) {
  let s = s0;
  let th = solveLow(P, ux, uz, D, s);
  while (th === null && s < 45) { s *= 1.12; th = solveLow(P, ux, uz, D, s); }
  if (th === null) return null;
  for (let k = 0; k < 18; k++) {
    const res = evalAt(P, ux, uz, s, th);
    if (clearOf(res, mode) >= clear) return { v: velOf(ux, uz, s, th), res };
    s *= 0.93;
    th = solveLow(P, ux, uz, D, s);
    if (th === null) break;
  }
  return null;
}

function solveArc(P, ux, uz, D, th0, thMax, clear, mode) {
  let last = null;
  for (let thd = th0; thd <= thMax; thd += 3) {
    const th = thd * DEG;
    if (landDist(P, ux, uz, 45, th) < D) continue;
    let lo = 1, hi = 45;
    for (let i = 0; i < 15; i++) {
      const mid = (lo + hi) / 2;
      if (landDist(P, ux, uz, mid, th) < D) lo = mid; else hi = mid;
    }
    const s = (lo + hi) / 2;
    const res = evalAt(P, ux, uz, s, th);
    last = { v: velOf(ux, uz, s, th), res };
    if (clearOf(res, mode) >= clear) return last;
  }
  return last;
}

function solve(P, tx, tz, spec) {
  const dx = tx - P.x, dz = tz - P.z;
  const D = Math.max(0.4, Math.hypot(dx, dz));
  const ux = dx / D, uz = dz / D;
  let sol = null;
  if (spec.flat) sol = solveFlat(P, ux, uz, D, spec.s0, spec.clear, spec.mode);
  if (!sol) sol = solveArc(P, ux, uz, D, spec.th0 ?? 35, spec.thMax ?? 72, spec.clear, spec.mode);
  if (!sol) {
    // last resort: lob it over at 50 degrees at a speed that roughly reaches
    const s = clamp(Math.sqrt(D * 9.81) * 1.25, 3, 40);
    sol = { v: velOf(ux, uz, s, 50 * DEG), res: null };
  }
  return sol;
}

// Human players get a little more safety margin on every aimed shot (keyboard aim is binary: left / middle / right).
export const HUMAN_MARGIN = 1.35;
// Extra inset for human keyboard aim (-1/+1): the aimed target sits this fraction of the way to the safe limit.
export const HUMAN_AIM_SCALE = 0.72;
function targetX(c, margin) {
  const lim = (COURT.halfW - margin * (c.human ? HUMAN_MARGIN : 1)) * (c.human && !Number.isFinite(c.tx) ? HUMAN_AIM_SCALE : 1);
  if (Number.isFinite(c.tx)) return clamp(c.tx, -lim, lim);
  return c.aim * lim;
}

/**
 * ctx: { P:{x,y,z}, team, shot, serveType, boxSign, aim, tx, power, dupr, human, stretch, tq,
 *        inSpeed, moveSpeed }
 * rnd: { g: ()=>gaussian }
 * returns { v, sp, shot, power, res } (res = trace result of the final trajectory)
 */
export function planShot(c, rnd) {
  const P = { x: c.P.x, y: Math.max(c.P.y, 0.1), z: c.P.z };
  const dir = c.team === 0 ? -1 : 1; // z direction of the shot
  const ownDist = Math.abs(P.z);
  let kind = c.shot, sp = 0, spec, tx, depth, sg, farF = 0;

  if (c.shot === 'serve') {
    kind = c.serveType === 'drive' ? 'serveDrive' : 'serve';
    sg = sigmas(c, kind);
    const mz = clamp(1.3 * sg.z0, c.serveType === 'drive' ? 0.35 : 0.55, 1.7);
    depth = COURT.halfL - mz;
    if (c.serveType === 'lob') depth = COURT.halfL - clamp(1.3 * sg.z0, 0.7, 1.9);
    const boxMargin = clamp(1.2 * sg.x0, 0.3, 0.9);
    const bs = c.boxSign;
    let x = bs * 1.6 + (Number.isFinite(c.tx) ? 0 : c.aim * 0.9);
    if (Number.isFinite(c.tx)) x = c.tx;
    x = clamp(x * bs, boxMargin, COURT.halfW - boxMargin) * bs;
    tx = x;
    if (c.serveType === 'drive') { spec = { flat: true, s0: 13.5, clear: 0.2 }; sp = 0.3; }
    else if (c.serveType === 'lob') { spec = { th0: 58, thMax: 72, clear: 1.2 }; sp = -0.2; }
    else { spec = { th0: 36, thMax: 70, clear: 0.55 }; sp = -0.4; }
  } else if (c.shot === 'drive') {
    sg = sigmas(c, 'drive');
    depth = COURT.halfL - clamp(1.3 * sg.z0, 0.9, 1.9) * (c.human ? 1.2 : 1);
    tx = targetX(c, clamp(1.3 * sg.x0, 0.35, 1.3));
    const pw = clamp(c.power, 0, 1);
    spec = { flat: true, s0: 11.5 + 7 * pw, clear: 0.2 };
    sp = 0.1;
  } else if (c.shot === 'smash') {
    sg = sigmas(c, 'smash');
    depth = clamp(3.4 + (0.5 - c.power) * 0.6, 2.8, 4.4);
    tx = targetX(c, clamp(1.2 * sg.x0, 0.35, 1.2));
    spec = { flat: true, s0: 20 + 3 * clamp(c.power, 0, 1), clear: 0.05 };
    sp = -0.1;
  } else if (c.shot === 'drop') {
    sg = sigmas(c, 'drop');
    depth = 1.15;
    tx = targetX(c, clamp(1.0 * sg.x0, 0.35, 1.0));
    spec = { th0: 33, thMax: 72, clear: 0.55 };
    sp = -0.8;
  } else if (c.shot === 'dink') {
    farF = clamp((ownDist - 3.4) / 2.5, 0, 1);
    sg = sigmas(c, 'dink', farF);
    depth = 0.9 + 1.0 * farF;
    tx = targetX(c, clamp(0.9 * sg.x0, 0.3, 0.9));
    spec = { th0: 28, thMax: 72, clear: 0.22 + 0.4 * farF };
    sp = -1.0 + 0.4 * farF;
  } else if (c.shot === 'lob') {
    sg = sigmas(c, 'lob');
    depth = COURT.halfL - clamp(1.3 * sg.z0, 0.5, 1.7) * (c.human ? 1.35 : 1);
    tx = targetX(c, clamp(1.2 * sg.x0, 0.4, 1.3));
    spec = { th0: 58, thMax: 74, clear: 1.5 };
    sp = -0.3;
  } else if (c.shot === 'atp') {
    return planATP(c, rnd, P);
  } else {
    throw new Error('unknown shot ' + c.shot);
  }

  // error model
  const ex = rnd.g() * sg.x, ez = rnd.g() * sg.z, ec = rnd.g() * sg.c;
  let tz = dir * clamp(depth + ez, 0.3, 12);
  const txe = tx + ex;
  spec.clear += ec;
  const sol = solve(P, txe, tz, spec);
  const speed = Math.hypot(sol.v.x, sol.v.y, sol.v.z);
  return {
    v: sol.v, sp, shot: c.shot, res: sol.res,
    power: c.shot === 'drive' ? clamp(c.power, 0, 1) : clamp(speed / 20, 0, 1),
    target: { x: txe, z: tz },
  };
}

// Around-the-post shot from a player standing wide. Returns null if geometry prevents it.
function planATP(c, rnd, P) {
  const dir = c.team === 0 ? -1 : 1;
  const own = Math.abs(P.z);
  const ps = P.x >= 0 ? 1 : -1;
  const ax = Math.abs(P.x);
  if (ax < COURT.postX + 0.05 || P.z * dir > 0.05) return null;
  const sg = sigmas(c, 'atp');
  const desired = Number.isFinite(c.tx) ? c.tx * ps : (c.aim !== 0 ? c.aim * ps * 1.8 : 1.4);
  const need = COURT.postX + 0.2;
  for (const depth of [4.0, 3.2, 5.0, 2.5]) {
    const f = own / (own + depth);
    if (f < 0.02) continue;
    const minPs = ax - (ax - need) / f; // ps*tx must be >= this
    const maxPs = 2.8;
    if (minPs > maxPs) continue;
    const psTx = clamp(desired, minPs + 0.1, maxPs);
    const ex = rnd.g() * sg.x * 0.6;
    const ez = rnd.g() * sg.z * 0.8;
    const tx = ps * psTx + ex;
    const tz = dir * clamp(depth + ez, 1.5, 6.4);
    const sol = solve(P, tx, tz, { th0: 5, thMax: 45, clear: 0, mode: 'atp' });
    if (!sol.res || clearOf(sol.res, 'atp') < 0) continue;
    const speed = Math.hypot(sol.v.x, sol.v.y, sol.v.z);
    return { v: sol.v, sp: 0, shot: 'atp', res: sol.res, power: clamp(speed / 20, 0, 1), target: { x: tx, z: tz } };
  }
  return null;
}
