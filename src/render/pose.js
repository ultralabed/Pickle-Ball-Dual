// Pose channels + keyframed animation tables. Everything is written for a RIGHT-handed player;
// left-handers are rendered by mirroring the whole model (scale.x = -1), so the same poses apply.
//
// Conventions (character faces -z, its right hand is +x):
//   spPitch/hipsPitch/hdPitch : + = lean back / look up,  - = lean forward / look down
//   *ShYaw   : rotation about vertical (R arm: - = toward the right/out, + = across the body)
//   *ShPitch : 0 = arm hanging, ~1.57 = horizontal forward, ~3.1 = straight up
//   *ShAbd   : sideways abduction (+ = outward), applied before pitch
//   *ElFlex  : elbow bend (forearm swings forward/up),  *ElTwist: forearm roll
//   *WrX     : wrist flex in the swing plane (adds to arm pitch for the paddle axis)
//   *FootF/L/Out : foot target offsets (m): forward, lift, extra lateral spread — solved by leg IK
import { clamp, lerp, smoothstep } from './util.js';

export const CHANNELS = [
  'hipsDY', 'hipsPitch', 'hipsYaw', 'hipsRoll',
  'spPitch', 'spYaw', 'spRoll',
  'hdPitch', 'hdYaw', 'hdRoll',
  'rShYaw', 'rShPitch', 'rShAbd', 'rElFlex', 'rElTwist', 'rWrX', 'rWrZ',
  'lShYaw', 'lShPitch', 'lShAbd', 'lElFlex', 'lElTwist', 'lWrX', 'lWrZ',
  'rFootF', 'lFootF', 'rFootL', 'lFootL', 'rFootOut', 'lFootOut',
  'rootY', 'rootF', 'rootX', 'padOpen', 'padAim',
];
export const C = {};
CHANNELS.forEach((n, i) => { C[n] = i; });
export const NCH = CHANNELS.length;

const mk = (o, base) => { const a = new Float32Array(NCH); if (base) a.set(base); for (const k in o) { if (!(k in C)) throw new Error('bad channel ' + k); a[C[k]] = o[k]; } return a; };

export const READY = mk({
  hipsDY: 0.14, hipsPitch: -0.10, spPitch: -0.12, hdPitch: 0.2,
  rShYaw: -0.15, rShPitch: 0.7, rShAbd: 0.22, rElFlex: 1.3, rWrX: 1.0,
  lShYaw: -0.1, lShPitch: 0.7, lShAbd: 0.3, lElFlex: 1.25, lWrX: 0,
  rFootF: -0.06, lFootF: 0.1, rFootOut: 0.1, lFootOut: 0.1,
});
const IDLE = mk({
  hipsDY: 0.03, hipsPitch: -0.02, spPitch: -0.03, hdPitch: 0.04,
  rShYaw: 0, rShPitch: 0.22, rShAbd: 0.18, rElFlex: 0.5, rWrX: 0.25,
  lShYaw: 0, lShPitch: 0.05, lShAbd: 0.16, lElFlex: 0.25,
  rFootF: 0, lFootF: 0, rFootOut: 0.06, lFootOut: 0.06,
});

const EASE = {
  smooth: (u) => u * u * (3 - 2 * u),
  in: (u) => u * u * (1.6 - 0.6 * u),
  out: (u) => 1 - (1 - u) * (1 - u),
  lin: (u) => u,
};
/** keys: [[time, overrides, ease?], ...] each key = base + overrides */
function keys(base, list) {
  return list.map(([t, o, e]) => ({ t, p: mk(o, base), ease: EASE[e || 'smooth'] }));
}
function evalKeys(out, ks, t) {
  if (t <= ks[0].t) { out.set(ks[0].p); return; }
  const last = ks[ks.length - 1];
  if (t >= last.t) { out.set(last.p); return; }
  let i = 0;
  while (t > ks[i + 1].t) i++;
  const a = ks[i], b = ks[i + 1];
  const u = b.ease((t - a.t) / (b.t - a.t));
  for (let j = 0; j < NCH; j++) out[j] = a.p[j] + (b.p[j] - a.p[j]) * u;
}

// ---------------------------------------------------------------- ground strokes
const PRESET = {
  drive:  { tot0: 2.6, tot: 2.85, totF: 2.9, tw: 0.11, tc: 0.18, tf: 0.30, te: 0.52, wind: 1.0, fol: 1.0, dy: 0.22, ep0: 1.35, el0: 1.1, wr0: 0.7, ep: 1.45, el: 0.35, wr: 0.35, epF: 1.7, elF: 1.2, wrF: 0.2, dyF: 0.12, step: 1, open: -0.05 },
  drop:   { tot0: 2.5, tot: 2.9, totF: 3.1, tw: 0.12, tc: 0.19, tf: 0.34, te: 0.55, wind: 0.5, fol: 0.5, dy: 0.32, ep0: 1.0, el0: 1.25, wr0: 0.9, ep: 1.15, el: 0.8, wr: 0.7, epF: 1.65, elF: 1.0, wrF: 0.8, dyF: 0.2, step: 0.8, open: 0.35 },
  dink:   { tot0: 2.5, tot: 2.9, totF: 3.2, tw: 0.11, tc: 0.18, tf: 0.32, te: 0.52, wind: 0.2, fol: 0.22, dy: 0.46, ep0: 0.95, el0: 1.3, wr0: 0.9, ep: 1.0, el: 0.95, wr: 0.8, epF: 1.3, elF: 0.9, wrF: 1.1, dyF: 0.36, step: 0.6, open: 0.4 },
  lob:    { tot0: 1.5, tot: 2.3, totF: 3.1, tw: 0.12, tc: 0.18, tf: 0.34, te: 0.56, wind: 0.5, fol: 0.5, dy: 0.38, ep0: -0.25, el0: 0.5, wr0: 0.5, ep: 0.9, el: 0.45, wr: 0.7, epF: 2.75, elF: 0.4, wrF: 0.3, dyF: -0.02, step: 0.9, open: 0.95 },
  volley: { tot0: 2.6, tot: 2.9, totF: 2.9, tw: 0.07, tc: 0.13, tf: 0.22, te: 0.38, wind: 0.18, fol: 0.3, dy: 0.08, ep0: 1.1, el0: 1.5, wr0: 0.8, ep: 1.3, el: 0.9, wr: 0.6, epF: 1.45, elF: 0.6, wrF: 0.5, dyF: 0.15, step: 0.5, open: 0.1 },
};
function stroke(side, o) {
  const w = o.wind, f = o.fol, st = o.step;
  if (side !== 'backhand') {
    return keys(READY, [
      [0, {}],
      [o.tw, {
        spYaw: -0.8 * w, hipsYaw: -0.35 * w, hipsDY: o.dy - 0.02, spPitch: -0.18, hdPitch: 0.25,
        rShYaw: -0.95 * w - 0.1, rShPitch: o.ep0, rShAbd: 0, rElFlex: o.el0, rWrX: o.tot0 - o.ep0 - o.el0,
        lShYaw: -0.5, lShPitch: 0.9, lShAbd: 0.3, lElFlex: 0.9, lWrX: 0,
        rFootF: -0.14 * st, lFootF: 0.14 * st, rootF: -0.03 * st,
      }],
      [o.tc, {
        spYaw: 0.15 * w, hipsYaw: 0.3 * w, hipsDY: o.dy, spPitch: -0.2, hdPitch: 0.25,
        rShYaw: -0.4 * w - 0.05, rShPitch: o.ep, rShAbd: 0, rElFlex: o.el, rWrX: o.tot - o.ep - o.el,
        lShYaw: -0.7, lShPitch: 1.0, lShAbd: 0.3, lElFlex: 0.9,
        rFootF: -0.2 * st, lFootF: 0.28 * st, rootF: 0.1 * st, padOpen: o.open,
      }, 'in'],
      [o.tf, {
        spYaw: 1.0 * f, hipsYaw: 0.55 * f, hipsDY: o.dyF, spPitch: -0.12, hdPitch: 0.2,
        rShYaw: 0.55 * f - 0.15, rShPitch: o.epF, rShAbd: 0, rElFlex: o.elF, rWrX: o.totF - o.epF - o.elF,
        lShYaw: -0.9, lShPitch: 1.0, lShAbd: 0.35, lElFlex: 0.7,
        rFootF: -0.1 * st, lFootF: 0.25 * st, rootF: 0.12 * st, padOpen: o.open * 0.6,
      }, 'out'],
      [o.te, {}],
    ]);
  }
  return keys(READY, [
    [0, {}],
    [o.tw, {
      spYaw: 0.75 * w, hipsYaw: 0.3 * w, hipsDY: o.dy - 0.02, spPitch: -0.2, hdPitch: 0.25,
      rShYaw: 0.6 * w + 0.15, rShPitch: o.ep0 - 0.1, rShAbd: 0, rElFlex: o.el0 + 0.7, rWrX: o.tot0 - (o.ep0 - 0.1) - (o.el0 + 0.7),
      lShYaw: -0.8, lShPitch: 1.0, lShAbd: 0.3, lElFlex: 0.8,
      rFootF: 0.12 * st, lFootF: -0.1 * st, rootF: -0.03 * st,
    }],
    [o.tc, {
      spYaw: -0.12 * w, hipsYaw: -0.25 * w, hipsDY: o.dy, spPitch: -0.22, hdPitch: 0.25,
      rShYaw: 0.4 * w + 0.05, rShPitch: o.ep, rShAbd: 0, rElFlex: o.el * 0.7, rWrX: o.tot - o.ep - o.el * 0.7,
      lShYaw: -0.9, lShPitch: 1.2, lShAbd: 0.3, lElFlex: 0.8,
      rFootF: 0.28 * st, lFootF: -0.16 * st, rootF: 0.1 * st, padOpen: o.open,
    }, 'in'],
    [o.tf, {
      spYaw: -0.8 * f, hipsYaw: -0.45 * f, hipsDY: o.dyF, spPitch: -0.12, hdPitch: 0.2,
      rShYaw: 0.1 * f - 0.15, rShPitch: o.epF + 0.1, rShAbd: 0, rElFlex: o.elF * 0.35, rWrX: o.totF - (o.epF + 0.1) - o.elF * 0.35,
      lShYaw: -0.9, lShPitch: 1.3, lShAbd: 0.35, lElFlex: 0.7,
      rFootF: 0.25 * st, lFootF: -0.2 * st, rootF: 0.12 * st, padOpen: o.open * 0.6,
    }, 'out'],
    [o.te, {}],
  ]);
}

const T = {};
for (const n of ['drive', 'drop', 'dink', 'lob', 'volley']) {
  T[n] = { forehand: stroke('forehand', PRESET[n]), backhand: stroke('backhand', PRESET[n]) };
}
// volley is held up in front, so its base pose is a punch-ready position
// ---------------------------------------------------------------- smash (overhead + jump)
const smashKeys = keys(READY, [
  [0, {}],
  [0.07, { // load: left arm points at ball, racket cocked behind head, deep knee bend
    hipsDY: 0.30, spPitch: 0.1, hipsPitch: -0.05, hdPitch: 0.7, spYaw: -0.3, hipsYaw: -0.15,
    rShYaw: -0.15, rShPitch: 2.15, rShAbd: 0.25, rElFlex: 2.4, rWrX: 0.3,
    lShYaw: 0.1, lShPitch: 2.7, lShAbd: 0.2, lElFlex: 0.2, rFootF: -0.12, lFootF: 0.12,
  }],
  [0.13, { // launch
    hipsDY: 0.0, rootY: 0.2, spPitch: 0.22, hipsPitch: 0.04, hdPitch: 0.8, spYaw: -0.45, hipsYaw: -0.25,
    rShYaw: -0.1, rShPitch: 2.45, rShAbd: 0.3, rElFlex: 2.3, rWrX: 0.2,
    lShYaw: 0.1, lShPitch: 2.9, lShAbd: 0.2, lElFlex: 0.1, rFootF: -0.18, lFootF: 0.18, rFootL: 0.05, lFootL: 0.08,
  }, 'out'],
  [0.20, { // contact: full extension overhead, peak of jump
    hipsDY: -0.01, rootY: 0.34, padOpen: -0.9, spPitch: -0.02, hipsPitch: -0.05, hdPitch: 0.6, spYaw: 0.1, hipsYaw: 0.1,
    rShYaw: -0.05, rShPitch: 3.0, rShAbd: 0.12, rElFlex: 0.15, rWrX: 0.3,
    lShYaw: -0.4, lShPitch: 1.2, lShAbd: 0.5, lElFlex: 1.2, rFootF: -0.12, lFootF: 0.12, rFootL: 0.12, lFootL: 0.1,
  }, 'in'],
  [0.32, { // whip down across the body
    hipsDY: 0.12, rootY: 0.2, spPitch: -0.5, hipsPitch: -0.2, hdPitch: 0.1, spYaw: 0.75, hipsYaw: 0.4,
    rShYaw: 0.55, rShPitch: 1.1, rShAbd: 0, rElFlex: 0.9, rWrX: 0.3,
    lShYaw: -0.8, lShPitch: 0.9, lShAbd: 0.4, lElFlex: 0.8, rFootF: 0.05, lFootF: 0.12, rFootL: 0.08, lFootL: 0.06,
  }, 'out'],
  [0.46, { // landing absorb
    hipsDY: 0.3, rootY: 0, spPitch: -0.3, spYaw: 0.3, hipsYaw: 0.15, rShYaw: 0.2, rShPitch: 0.9, rElFlex: 1.0, rWrX: 0.6,
  }],
  [0.68, {}],
]);
T.smash = { forehand: smashKeys, backhand: smashKeys };

// ---------------------------------------------------------------- serve (underhand)
const SERVE_READY = {
  hipsDY: 0.1, hipsPitch: -0.06, spPitch: -0.08, hdPitch: 0.12, spYaw: -0.12,
  rShYaw: -0.1, rShPitch: 0.5, rShAbd: 0.14, rElFlex: 0.55, rWrX: 1.5,
  lShYaw: -0.05, lShPitch: 1.3, lShAbd: 0.15, lElFlex: 0.35, lWrX: 0.2,
  rFootF: -0.1, lFootF: 0.14, rFootOut: 0.1, lFootOut: 0.1,
};
const serveReadyBase = mk(SERVE_READY);
const serveKeys = keys(serveReadyBase, [
  [0, {}],
  [0.1, { hipsDY: 0.18, spYaw: -0.3, spPitch: -0.1, rShYaw: 0, rShPitch: -0.75, rShAbd: 0.1, rElFlex: 0.15, rWrX: 1.4, lShPitch: 1.1, lShAbd: 0.3, rootF: -0.04 }],
  [0.2, { hipsDY: 0.2, spYaw: 0.18, spPitch: -0.18, hipsYaw: 0.15, rShYaw: -0.05, rShPitch: 0.8, rShAbd: 0.1, rElFlex: 0.2, rWrX: 1.5, padOpen: 0.3, lShPitch: 0.8, lShAbd: 0.4, lElFlex: 0.5, lFootF: 0.24, rFootF: -0.14, rootF: 0.08 }, 'in'],
  [0.36, { hipsDY: 0.1, spYaw: 0.2, spPitch: -0.1, rShYaw: 0.2, rShPitch: 1.75, rShAbd: 0.1, rElFlex: 0.45, rWrX: 0.8, lShPitch: 0.6, lShAbd: 0.4, lElFlex: 0.6, lFootF: 0.22, rootF: 0.1 }, 'out'],
  [0.62, SERVE_READY],
]);
T.serve = { forehand: serveKeys, backhand: serveKeys };
T.serveReady = { forehand: keys(serveReadyBase, [[0, {}]]), backhand: keys(serveReadyBase, [[0, {}]]) };

const mkAnim = (base) => ({ forehand: keys(base, [[0, {}]]), backhand: keys(base, [[0, {}]]) });
T.ready = mkAnim(READY);
T.idle = mkAnim(IDLE);
T.run = mkAnim(mk({ hipsDY: 0.1, hipsPitch: -0.08, spPitch: -0.1, hdPitch: 0.15, rShPitch: 0.95, rShAbd: 0.25, rElFlex: 1.5, rWrX: 0.8, lShPitch: 0.75, lShAbd: 0.2, lElFlex: 1.3 }, READY));
T.celebrate = mkAnim(mk({ hipsDY: 0.08, hipsPitch: 0.02, spPitch: 0.08, hdPitch: 0.35, rShYaw: -0.1, rShPitch: 2.9, rShAbd: 0.3, rElFlex: 0.4, rWrX: 0.2, lShYaw: 0, lShPitch: 1.9, lShAbd: 0.35, lElFlex: 1.9, lWrX: 0, rFootOut: 0.12, lFootOut: 0.12, rFootF: 0, lFootF: 0 }, READY));
T.dejected = mkAnim(mk({
  hipsDY: 0.05, hipsPitch: -0.14, spPitch: -0.4, hdPitch: -0.45,
  rShYaw: 0.05, rShPitch: 0.18, rShAbd: 0.12, rElFlex: 0.35, rWrX: 0.1,
  lShYaw: 0, lShPitch: 0.12, lShAbd: 0.14, lElFlex: 0.3, rFootF: 0, lFootF: 0.02, rFootOut: 0.05, lFootOut: 0.05,
}, READY));

/** time in each keyframed swing at which the paddle meets the ball */
export const POSE_CONTACT = { drive: 0.18, drop: 0.19, dink: 0.18, lob: 0.18, volley: 0.13, smash: 0.20, serve: 0.20 };

/** Map sim swing time `t` to pose time so that the pose's contact key lands on the sim's contact time `tc`
 *  (predicted before the hit, actual afterwards). Wind-up is stretched/compressed, follow-through is untouched. */
export function warpSwingTime(name, t, tc) {
  const pc = POSE_CONTACT[name];
  if (pc === undefined || tc === undefined || tc === null || tc < 0.04) return t;
  return t < tc ? t * (pc / tc) : pc + (t - tc);
}

export const ANIM_DURATION = { drive: 0.52, drop: 0.55, dink: 0.52, lob: 0.56, volley: 0.38, smash: 0.68, serve: 0.62 };

const tmp = new Float32Array(NCH);

/** Evaluate the upper-body/stance pose for an animation. ctx: {phase (run cycle rad), speed} */
export function evalAnim(out, name, t, side, ctx) {
  const tab = T[name] || T.ready;
  const ks = (tab[side === 'backhand' ? 'backhand' : 'forehand']);
  evalKeys(out, ks, Math.max(0, t));
  const sn = Math.sin, cs = Math.cos;
  if (name === 'ready' || !T[name]) {
    out[C.hipsDY] += 0.018 + 0.022 * sn(t * 6.0);
    out[C.rootY] += 0.012 * Math.max(0, sn(t * 3.0 + 1));
    out[C.rShPitch] += 0.03 * sn(t * 2.3);
    out[C.lShPitch] += 0.03 * sn(t * 2.0 + 1);
    out[C.spYaw] += 0.04 * sn(t * 1.3);
  } else if (name === 'idle') {
    out[C.hipsDY] += 0.006 * sn(t * 1.8);
    out[C.spPitch] += 0.012 * sn(t * 1.8);
    out[C.rShPitch] += 0.02 * sn(t * 1.8 + 0.5);
    out[C.lShPitch] += 0.02 * sn(t * 1.8 + 0.7);
    out[C.spYaw] += 0.03 * sn(t * 0.7);
  } else if (name === 'run') {
    const ph = ctx.phase, k = clamp(ctx.speed / 4, 0.2, 1);
    out[C.rShPitch] += 0.18 * k * sn(ph + Math.PI);
    out[C.lShPitch] += 0.9 * k * sn(ph);
    out[C.lShAbd] += 0.05;
    out[C.spYaw] += 0.22 * k * sn(ph);
    out[C.hipsYaw] -= 0.12 * k * sn(ph);
  } else if (name === 'serveReady') {
    out[C.hipsDY] += 0.01 * sn(t * 2.5);
    out[C.lShPitch] += 0.03 * sn(t * 2.2);
  } else if (name === 'celebrate') {
    const w = 8.2, s = sn(t * w), a = Math.abs(s);
    const settle = smoothstep(0, 0.12, t);
    out[C.rootY] += 0.2 * a * settle;
    out[C.hipsDY] += 0.1 * (1 - a) * settle;
    out[C.rShPitch] += 0.28 * s * settle;
    out[C.lShPitch] += 0.35 * sn(t * w + 1.6) * settle;
    out[C.lElFlex] += 0.5 * sn(t * w + 1.6);
    out[C.spYaw] += 0.18 * sn(t * w * 0.5);
    out[C.hdYaw] += 0.2 * sn(t * w * 0.5);
    out[C.lFootL] += 0.08 * a * settle;
    out[C.rFootL] += 0.08 * a * settle;
  } else if (name === 'dejected') {
    const s = smoothstep(0, 0.45, t);
    out[C.hdYaw] += 0.3 * s * sn(t * 3.0) * Math.exp(-t * 0.35);
    out[C.spPitch] += 0.03 * sn(t * 1.4);
    out[C.hipsDY] += 0.01 * sn(t * 1.4);
    out[C.rShPitch] += 0.04 * sn(t * 1.4);
    // slump in smoothly (start from ready)
    const r = 1 - s;
    for (const k of [C.spPitch, C.hdPitch, C.rShPitch, C.rElFlex, C.rWrX, C.lShPitch, C.lElFlex]) out[k] = lerp(out[k], READY[k], r * 0.7);
  } else if (name === 'serve' || name === 'smash') {
    /* keyframed only */
  }
}

/** Replace legs by a run/shuffle cycle. weight 0..1 blends over the pose's own stance. */
export function applyLegCycle(P, ctx, weight) {
  if (weight <= 0.001) return;
  const sp = ctx.speed;
  const S = Math.min(0.46, 0.05 + 0.08 * sp);
  const Sl = Math.min(0.3, 0.04 + 0.06 * sp);
  const L = Math.min(0.2, 0.04 + 0.035 * sp);
  const fc = ctx.fc, lc = ctx.lc;
  const w = weight;
  const ph = ctx.phase;
  const calc = (p) => ({ f: -Math.cos(p), lift: Math.max(0, Math.sin(p)) });
  const r = calc(ph), l = calc(ph + Math.PI);
  P[C.rFootF] = lerp(P[C.rFootF], S * r.f * fc, w);
  P[C.lFootF] = lerp(P[C.lFootF], S * l.f * fc, w);
  P[C.rFootL] = lerp(P[C.rFootL], L * r.lift, w);
  P[C.lFootL] = lerp(P[C.lFootL], L * l.lift, w);
  P[C.rFootOut] = lerp(P[C.rFootOut], Math.max(-0.04, 0.08 + Sl * r.f * lc), w);
  P[C.lFootOut] = lerp(P[C.lFootOut], Math.max(-0.04, 0.08 - Sl * l.f * lc), w);
  P[C.hipsDY] += w * (0.05 + 0.02 * sp) * (0.5 + 0.5 * Math.abs(Math.cos(ph)));
  P[C.hipsPitch] -= w * Math.min(0.3, 0.05 * sp) * Math.max(0, fc);
  P[C.spPitch] -= w * Math.min(0.25, 0.04 * sp) * Math.max(0, fc);
  P[C.hipsRoll] += w * 0.05 * Math.sin(ph) * Math.min(1, sp / 3);
}
