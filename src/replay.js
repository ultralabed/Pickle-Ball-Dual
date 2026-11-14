// Highlight replay: ring buffer of compact snapshots (every 2nd sim tick) + the events of the same period.
import { DT } from './sim/index.js';

const STRIDE = 2;                         // sample every 2nd tick (60 Hz)
const CAPACITY = Math.ceil(9 / (DT * STRIDE));   // ~9 s
export const REPLAY_SLOWMO = 0.4;
export const REPLAY_SECONDS = 5;

const v2 = (o) => ({ x: o.x, z: o.z });
const v3 = (o) => ({ x: o.x, y: o.y, z: o.z });

function compact(s) {
  return {
    tick: s.tick, time: s.time, phase: s.phase,
    ball: { pos: v3(s.ball.pos), vel: v3(s.ball.vel), spin: v3(s.ball.spin), visible: s.ball.visible, bounces: s.ball.bounces,
      lastHitBy: s.ball.lastHitBy, landing: s.ball.landing ? { x: s.ball.landing.x, z: s.ball.landing.z, t: s.ball.landing.t } : null },
    players: s.players.map((p) => ({
      id: p.id, team: p.team, name: p.name, handed: p.handed, dupr: p.dupr, controller: p.controller,
      pos: v2(p.pos), vel: v2(p.vel), facing: p.facing,
      anim: { name: p.anim.name, t: p.anim.t, side: p.anim.side, shot: p.anim.shot, tc: p.anim.tc, hit: p.anim.hit },
      isServer: p.isServer, isReceiver: p.isReceiver, emotion: p.emotion,
    })),
    score: { points: s.score.points.slice(), servingTeam: s.score.servingTeam, winner: s.score.winner },
    rally: { hits: s.rally.hits },
  };
}

const lerp = (a, b, k) => a + (b - a) * k;
function lerpAngle(a, b, k) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; }

export function createReplayBuffer() {
  const frames = [];
  let events = [];
  const api = { get length() { return frames.length; } };

  api.record = (state, evs) => {
    if (state.tick % STRIDE === 0) {
      frames.push(compact(state));
      if (frames.length > CAPACITY) frames.shift();
    }
    for (const e of evs) events.push(e);
    if (frames.length && events.length > 400) { const t0 = frames[0].tick; events = events.filter((e) => e.tick >= t0); }
  };
  api.clear = () => { frames.length = 0; events = []; };

  /** Build a playback of the last `seconds` of recorded play (not reaching back before the last serve). */
  api.makePlayback = (seconds = REPLAY_SECONDS) => {
    if (frames.length < 20) return null;
    const endTick = frames[frames.length - 1].tick;
    let startTick = endTick - Math.round(seconds / DT);
    // do not start before the serve that opened this rally (minus a lead-in)
    let serveTick = null;
    for (let i = events.length - 1; i >= 0; i--) { const e = events[i]; if (e.type === 'hit' && e.isServe) { serveTick = e.tick; break; } }
    if (serveTick !== null) startTick = Math.max(startTick, serveTick - Math.round(0.6 / DT));
    const fr = frames.filter((f) => f.tick >= startTick);
    if (fr.length < 20) return null;
    const evs = events.filter((e) => e.tick >= fr[0].tick);
    return makePlayback(fr, evs);
  };
  return api;
}

function makePlayback(fr, evs) {
  let clock = 0;                       // in sim-seconds of recorded time
  const total = (fr[fr.length - 1].tick - fr[0].tick) * DT;
  let lastTick = fr[0].tick - 1;
  const pb = { total, get progress() { return Math.min(1, clock / total); }, done: false };

  function frameAt(c) {
    const f = c / (STRIDE * DT);
    const i = Math.max(0, Math.min(fr.length - 1, Math.floor(f)));
    const j = Math.min(fr.length - 1, i + 1);
    const k = Math.max(0, Math.min(1, f - i));
    const A = fr[i], B = fr[j];
    if (i === j) return { s: A, tick: A.tick };
    const s = {
      tick: A.tick, time: lerp(A.time, B.time, k), phase: A.phase, score: A.score, rally: A.rally,
      ball: {
        pos: { x: lerp(A.ball.pos.x, B.ball.pos.x, k), y: lerp(A.ball.pos.y, B.ball.pos.y, k), z: lerp(A.ball.pos.z, B.ball.pos.z, k) },
        vel: A.ball.vel, spin: A.ball.spin, visible: A.ball.visible, bounces: A.ball.bounces, lastHitBy: A.ball.lastHitBy, landing: A.ball.landing,
      },
      players: A.players.map((p, n) => {
        const q = B.players[n];
        return { ...p,
          pos: { x: lerp(p.pos.x, q.pos.x, k), z: lerp(p.pos.z, q.pos.z, k) },
          vel: { x: lerp(p.vel.x, q.vel.x, k), z: lerp(p.vel.z, q.vel.z, k) },
          facing: lerpAngle(p.facing, q.facing, k),
          anim: { ...p.anim, t: p.anim.t + (p.anim.name === q.anim.name ? k * STRIDE * DT : 0) } };
      }),
    };
    return { s, tick: A.tick + Math.round(k * STRIDE) };
  }

  /** advance by real dt (seconds); returns { state, events } */
  pb.advance = (dtReal) => {
    clock = Math.min(total, clock + dtReal * REPLAY_SLOWMO);
    const { s, tick } = frameAt(clock);
    const out = [];
    for (const e of evs) if (e.tick > lastTick && e.tick <= tick) out.push(e);
    lastTick = tick;
    if (clock >= total - 1e-6) pb.done = true;
    return { state: s, events: out };
  };
  pb.firstState = () => frameAt(0).s;
  return pb;
}
