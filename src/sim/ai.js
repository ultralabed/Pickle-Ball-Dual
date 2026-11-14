// AI players: they produce Inputs through exactly the same path as a human (mx/mz/swing/power/aim).
// AI-only extra: optional Input.tx (target x) so skilled AIs can aim precisely.
import { COURT } from './constants.js';
import { predictPath } from './physics.js';
import { nextRand, nextGauss } from './rng.js';
import { clamp, sideSign, level, maxSpeed } from './util.js';

export const PROF = {
  3: { react: 0.45, timeSD: 0.05, volleyNear: 0.2, volleyFar: 0.04, smash: 0.45, kMistake: 0.12, third: 0.15,
       lob3: 0.15, dropVsNet: 0.2, lobP: 0.15, driveBack: 0.65, dinkP: 0.45, speedUp: 0.5, serveDrive: 0.1, atp: 0 },
  4: { react: 0.30, timeSD: 0.03, volleyNear: 0.5, volleyFar: 0.1, smash: 0.7, kMistake: 0.03, third: 0.5,
       lob3: 0.08, dropVsNet: 0.55, lobP: 0.08, driveBack: 0.45, dinkP: 0.75, speedUp: 0.2, serveDrive: 0.2, atp: 0 },
  5: { react: 0.20, timeSD: 0.018, volleyNear: 0.65, volleyFar: 0.15, smash: 0.85, kMistake: 0, third: 0.85,
       lob3: 0.03, dropVsNet: 0.8, lobP: 0.1, driveBack: 0.3, dinkP: 0.78, speedUp: 0.45, serveDrive: 0.4, atp: 0.35 },
  6: { react: 0.12, timeSD: 0.008, volleyNear: 0.8, volleyFar: 0.25, smash: 0.95, kMistake: 0, third: 0.88,
       lob3: 0.02, dropVsNet: 0.85, lobP: 0.1, driveBack: 0.25, dinkP: 0.8, speedUp: 0.55, serveDrive: 0.55, atp: 1 },
};

const DEPTH = { up: 3.05, mid: 4.5, back: 6.0 };
const SDEPTH = { up: 3.7, mid: 5.0, back: 6.2 };
const K = COURT.kitchen;

function moveToward(p, t, inp) {
  const dx = t.x - p.pos.x, dz = t.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.1) return;
  const mag = Math.min(1, d / 0.5);
  inp.mx = dx / d * mag;
  inp.mz = dz / d * mag;
}

export function aiOnHit(sim, p, shot, atp) {
  const s = sim.state, I = s.internal;
  const L = level(p.dupr), T = p.team;
  const own = Math.abs(p.pos.z);
  if (shot === 'serve') { I.teamDepth[0] = 'back'; I.teamDepth[1] = 'back'; return; }
  if (shot === 'lob') I.teamDepth[1 - T] = 'back';
  if (s.rally.hits === 2 && T !== s.score.servingTeam) { I.teamDepth[T] = L >= 4 ? 'up' : 'mid'; return; }
  if (shot === 'drop' || shot === 'dink' || shot === 'smash') {
    I.teamDepth[T] = L >= 4 ? 'up' : (nextRand(I) < 0.5 ? 'mid' : 'back');
  } else if (shot === 'drive' && own > 4.5) {
    I.teamDepth[T] = L >= 4 ? 'mid' : 'back';
  }
}

function idleDepthMode(s, p) {
  const I = s.internal;
  if (s.config.mode === 'singles') return I.teamDepth[p.team];
  if (s.rally.hits <= 1) {
    if (p.team === s.score.servingTeam) return 'back';
    return p.id === s.score.receiverId ? 'back' : (level(p.dupr) >= 4 ? 'up' : 'back');
  }
  return I.teamDepth[p.team];
}

function idleTarget(s, p) {
  const I = s.internal, ball = s.ball.pos;
  const sg = sideSign(p.team);
  const mate = s.players.find((q) => q.team === p.team && q.id !== p.id);
  const mode = idleDepthMode(s, p);
  let z, x;
  if (!mate) {
    z = sg * SDEPTH[mode];
    x = clamp(ball.x * 0.35, -1.2, 1.2);
  } else {
    z = sg * DEPTH[mode];
    const cl = I.claim[p.team];
    const mateRuns = cl && cl.seq === I.hitSeq && cl.pid === mate.id;
    if (mate.controller !== 'ai' || mateRuns) {
      x = mate.pos.x >= 0 ? mate.pos.x - 3.0 : mate.pos.x + 3.0;
      x = clamp(x, -2.4, 2.4);
    } else {
      const c = clamp(ball.x * 0.4, -0.8, 0.8);
      const left = p.pos.x < mate.pos.x || (p.pos.x === mate.pos.x && p.id < mate.id);
      x = left ? c - 1.5 : c + 1.5;
    }
  }
  // momentum rule: stay out of the kitchen right after a volley
  const lv = I.lastVolley[p.id];
  if (lv !== undefined && s.time - lv < 0.8 && Math.abs(z) < K + 0.25) z = sg * (K + 0.25);
  return { x, z };
}

// ------------------------------------------------------------------ planning
function decideClaim(s, p, pick, stand) {
  const I = s.internal;
  const cl = I.claim[p.team];
  if (cl && cl.seq === I.hitSeq) return cl.pid;
  const mates = s.players.filter((q) => q.team === p.team);
  let best = -1, bc = 1e9;
  const human = mates.find((q) => q.controller !== 'ai');
  for (const q of mates) {
    const pr = PROF[level(q.dupr)];
    const dist = Math.hypot(q.pos.x - stand.x, q.pos.z - stand.z);
    let cost = dist / maxSpeed(q) + (q.controller === 'ai' ? pr.react : 0.25);
    const rightness = (pick.x - q.pos.x) * (q.team === 0 ? 1 : -1);
    const fh = q.handed === 'R' ? rightness >= 0 : rightness <= 0;
    if (fh) cost -= 0.12;
    if (s.rally.hits === 1 && mates.length > 1 && q.id !== s.score.receiverId) cost += 5;
    if (q.controller !== 'ai') cost -= 0.35;
    else if (human) {
      const mid = (human.pos.x + q.pos.x) / 2;
      if ((pick.x - mid) * (human.pos.x - mid) > 0) cost += 0.4; // clearly on the human's half
    }
    if (cost < bc - 1e-9 || (Math.abs(cost - bc) < 1e-9 && q.id < best)) { bc = cost; best = q.id; }
  }
  I.claim[p.team] = { seq: I.hitSeq, pid: best };
  return best;
}

function plan(sim, p, mem, prof) {
  const s = sim.state, I = s.internal, b = s.ball;
  const sg = sideSign(p.team);
  mem.planned = true;
  mem.claim = false;
  mem.alt = null;
  const pp = predictPath(b.pos, b.vel, b.bounces, I.sp, 3.2);
  mem.dodge = null;
  {
    let bestD = 0.65, bs = null;
    for (const sm of pp.samples) {
      if (sm.b >= 2) break;
      if (sm.y < 0.25 || sm.y > 1.7) continue;
      const d = Math.hypot(sm.x - p.pos.x, sm.z - p.pos.z);
      if (d < bestD) { bestD = d; bs = sm; }
    }
    if (bs) mem.dodge = { x: p.pos.x + ((p.pos.x - bs.x) >= 0 ? 1 : -1) * 0.9, z: p.pos.z };
  }
  if (pp.netBlocked) return;
  if (b.bounces === 0 && pp.firstBounce) {
    const fb = pp.firstBounce;
    const outBy = Math.max(Math.abs(fb.x) - COURT.halfW, Math.abs(fb.z) - COURT.halfL);
    if (fb.z * sg > 0 && outBy > 0.15) return; // will land out on our side: let it go
  }
  const volleyLegal = s.rally.twoBounceRemaining === 0;
  const myOwn = Math.abs(p.pos.z);
  const wantVolley = nextRand(I) < (myOwn <= 4.6 ? prof.volleyNear : prof.volleyFar);
  const wantSmash = nextRand(I) < prof.smash;
  mem.kIgnore = nextRand(I) < prof.kMistake;
  let pick = null;
  for (const sm of pp.samples) {
    const own = sm.z * sg;
    if (own < 0.25) continue;
    if (sm.b >= 2 || own > 9.2) break;
    if (sm.b === 0) {
      if (!volleyLegal) continue;
      const inK = own + 0.45 <= K + 0.12 && !mem.kIgnore;
      if (inK) continue;
      if (sm.y > 1.6 && sm.y < 2.15) { if (wantSmash) { pick = sm; break; } continue; }
      if (sm.y >= 0.55 && sm.y <= 1.5 && wantVolley) { pick = sm; break; }
      continue;
    }
    if (sm.vy > 0.4) continue;
    if (sm.y > 1.25 || sm.y < 0.1) continue;
    pick = sm;
    break;
  }
  if (!pick) return;
  const wide = Math.abs(pick.x) > 3.25;
  if (wide && !(nextRand(I) < prof.atp)) return;
  const rightWorld = p.team === 0 ? 1 : -1;
  const handSign = p.handed === 'R' ? 1 : -1;
  const stand = { x: pick.x - 0.4 * rightWorld * handSign, z: pick.z + sg * 0.45 };
  if (wide) stand.x = pick.x + Math.sign(pick.x) * 0.55;
  if (Math.abs(stand.z) < 0.5) stand.z = sg * 0.5;
  const pid = decideClaim(s, p, pick, stand);
  if (pid !== p.id) {
    // The human teammate was given the ball. Remember the contact so we can re-check shortly before it arrives.
    const hm = s.players[pid];
    if (hm && hm.controller !== 'ai') {
      mem.alt = { tc: s.time + pick.t, cy: pick.y, cx: pick.x, cz: pick.z, bounced: pick.b >= 1, stand, jit: nextGauss(I) * prof.timeSD, pid };
    }
    return;
  }
  mem.claim = true;
  mem.tc = s.time + pick.t;
  mem.cy = pick.y;
  mem.cx = pick.x;
  mem.cz = pick.z;
  mem.bounced = pick.b >= 1;
  mem.stand = stand;
  mem.jit = nextGauss(I) * prof.timeSD;
}

// Is the human-controlled teammate going for this contact point (swinging, standing on it, or running at it)?
function humanGoing(s, h, cx, cz) {
  if (I_sw(s, h)) return true;
  const dx = cx - h.pos.x, dz = cz - h.pos.z, d = Math.hypot(dx, dz);
  if (d < 0.9) return true;
  const sp = Math.hypot(h.vel.x, h.vel.z);
  if (sp < 0.6) return false;
  return (dx * h.vel.x + dz * h.vel.z) / (d * sp) > 0.5;
}
const I_sw = (s, h) => !!s.internal.sw[h.id];

// ~0.25-0.35 s before contact: if the human the ball was assigned to is neither moving toward it nor swinging, and we can
// get there, the AI partner takes it.
function reconsiderClaim(s, p, mem) {
  const a = mem.alt, I = s.internal;
  const rem = a.tc - s.time;
  if (rem > 0.36 || rem < 0.2) return;
  const h = s.players[a.pid];
  if (!h || humanGoing(s, h, a.cx, a.cz)) return;
  if (Math.hypot(p.pos.x - a.stand.x, p.pos.z - a.stand.z) > maxSpeed(p) * rem + 0.4) return;
  mem.claim = true; mem.tc = a.tc; mem.cy = a.cy; mem.cx = a.cx; mem.cz = a.cz; mem.bounced = a.bounced;
  mem.stand = a.stand; mem.jit = a.jit; mem.alt = null;
  I.claim[p.team] = { seq: I.hitSeq, pid: p.id };
}

// ------------------------------------------------------------------ shot choice
function pickTx(s, I, p, L, swing, ownZ) {
  const opps = s.players.filter((q) => q.team !== p.team);
  const avg = opps.reduce((a, q) => a + q.pos.x, 0) / opps.length;
  if (L === 3) return (nextRand(I) - 0.5) * 2.4;
  let open = clamp(-avg * 1.2, -2.2, 2.2);
  if (Math.abs(avg) < 0.3) open = (nextRand(I) < 0.5 ? -1 : 1) * 1.4;
  if (L === 4) return open * 0.8 + nextGauss(I) * 0.3;
  const tgt = opps.reduce((a, q) => (Math.abs(q.pos.x - s.ball.pos.x) < Math.abs(a.pos.x - s.ball.pos.x) ? q : a), opps[0]);
  const r = nextRand(I);
  if (L === 6 && (swing === 'dink' || swing === 'drop') && nextRand(I) < 0.35) {
    return (avg > 0 ? -1 : 1) * 2.9;
  }
  if (L === 6 && swing === 'drive' && ownZ <= 4.3 && r < 0.2) return tgt.pos.x; // speed-up at the body
  if (r < 0.45) {
    const bh = (tgt.team === 0 ? -1 : 1) * (tgt.handed === 'R' ? 1 : -1);
    return bh * 2.0;
  }
  return open;
}

function chooseShot(sim, p, mem, prof) {
  const s = sim.state, I = s.internal, b = s.ball;
  const L = level(p.dupr);
  const r = nextRand(I), r2 = nextRand(I);
  const hits = s.rally.hits;
  const y = mem.cy;
  const volley = !mem.bounced;
  const ownZ = Math.abs(mem.stand.z);
  const opps = s.players.filter((q) => q.team !== p.team);
  const oppUp = opps.some((q) => Math.abs(q.pos.z) < 3.9);
  const ballSpeed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  let swing = 'drive', power = 0.5;
  if (y > 1.6 && volley) { swing = 'drive'; power = 0.85; }
  else if (hits === 1) { swing = 'drive'; power = L === 3 ? 0.5 : 0.45; }
  else if (hits === 2 && p.team === s.score.servingTeam) {
    if (r < prof.third) swing = 'drop';
    else if (r2 < prof.lob3 / Math.max(0.01, 1 - prof.third)) swing = 'lob';
    else { swing = 'drive'; power = 0.6; }
  } else if (ownZ > 4.3) {
    if (oppUp) {
      if (r < prof.dropVsNet) swing = 'drop';
      else if (r2 < prof.lobP * 2) swing = 'lob';
      else { swing = 'drive'; power = 0.55; }
    } else if (r < prof.driveBack) { swing = 'drive'; power = L === 3 ? 0.4 + 0.4 * r2 : 0.6; }
    else if (r2 < prof.lobP * 2) swing = 'lob';
    else swing = 'drop';
  } else if (y < 0.8 || ballSpeed < 6) {
    if (r < prof.dinkP) swing = ownZ > 3.6 && r2 < 0.5 ? 'drop' : 'dink';
    else if (r2 < 0.5) swing = 'drop';
    else { swing = 'drive'; power = 0.5; }
  } else if (r < prof.speedUp) { swing = 'drive'; power = L >= 5 ? 0.8 : 0.7; }
  else swing = ownZ > 3.5 ? 'drop' : 'dink';
  // jammed by a fast ball: reset it softly (skilled players)
  if (L >= 5 && ballSpeed > 13 && swing === 'drive' && y < 1.6 && ownZ <= 4.3 && r2 < 0.5) swing = 'drop';
  const tx = pickTx(s, I, p, L, swing, ownZ);
  return { swing, power, tx, aim: tx > 0.5 ? 1 : tx < -0.5 ? -1 : 0 };
}

// ------------------------------------------------------------------ main entry
export function aiInput(sim, p) {
  const s = sim.state, I = s.internal;
  let mem = I.ai[p.id];
  if (!mem) mem = I.ai[p.id] = { seq: -1 };
  const prof = PROF[level(p.dupr)];
  const L = level(p.dupr);
  const inp = { mx: 0, mz: 0, swing: null, power: 0.5, aim: 0 };
  const phase = s.phase;

  if (phase === 'preServe') {
    if (p.isServer && s.phaseTime >= I.serveDelay) {
      const r = nextRand(I);
      inp.swing = r < prof.serveDrive ? 'drive' : (L >= 5 && r > 0.95 ? 'lob' : 'drop');
      inp.aim = L === 3 ? 0 : (nextRand(I) < 0.33 ? -1 : nextRand(I) < 0.5 ? 0 : 1);
    }
    return inp;
  }
  if (phase === 'serve' && I.held) return inp;
  if (phase !== 'serve' && phase !== 'rally') return inp;

  const lh = s.ball.lastHitBy;
  const incoming = lh !== null && I.live && s.players[lh].team !== p.team;
  if (incoming) {
    if (mem.seq !== I.hitSeq) {
      mem.seq = I.hitSeq; mem.planned = false; mem.claim = false; mem.swung = false;
      mem.noticeAt = s.time + prof.react * (0.85 + 0.3 * nextRand(I));
    }
    if (!mem.planned && s.time >= mem.noticeAt) plan(sim, p, mem, prof);
    if (mem.planned && !mem.claim && mem.alt) reconsiderClaim(s, p, mem);
    if (mem.planned && mem.claim) {
      moveToward(p, mem.stand, inp);
      const dtc = mem.tc - s.time;
      if (!mem.swung && dtc <= 0.17 + mem.jit) {
        const d = Math.hypot(p.pos.x - mem.cx, p.pos.z - mem.cz);
        // never steal from a human teammate who is already on the ball
        const h = s.players.find((q) => q.team === p.team && q.id !== p.id && q.controller !== 'ai');
        if (d < 2.4 && !(h && humanGoing(s, h, mem.cx, mem.cz))) {
          const ch = chooseShot(sim, p, mem, prof);
          inp.swing = ch.swing; inp.power = ch.power; inp.aim = ch.aim; inp.tx = ch.tx;
        }
        mem.swung = true;
      }
      return inp;
    }
  }
  const t = (incoming && mem.planned && mem.dodge) ? mem.dodge : idleTarget(s, p);
  moveToward(p, t, inp);
  return inp;
}
