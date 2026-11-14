import { COURT, DT, PHY } from './constants.js';

const R = COURT.ballR;

// One flight step (semi-implicit Euler with quadratic drag). The ONLY integrator used by the
// sim, the shot solver and the AI predictor, so predictions are exact.
export function stepFlight(p, v) {
  const sp = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  const k = PHY.drag * sp;
  v.x -= k * v.x * DT;
  v.y -= (PHY.g + k * v.y) * DT;
  v.z -= k * v.z * DT;
  p.x += v.x * DT;
  p.y += v.y * DT;
  p.z += v.z * DT;
}

export function netTop(x) {
  const a = Math.min(1, Math.abs(x) / COURT.postX);
  return COURT.netHC + (COURT.netH - COURT.netHC) * a;
}

// True when a ball moving prev -> cur gets stopped by the net. Returns crossing info.
export function netCrossing(px, py, pz, cx, cy, cz) {
  if (!((pz > 0 && cz <= 0) || (pz < 0 && cz >= 0))) return null;
  const f = pz / (pz - cz);
  const x = px + (cx - px) * f;
  const y = py + (cy - py) * f;
  return { x, y, f, blocked: Math.abs(x) <= COURT.postX && y < netTop(x) + R * 0.4,
           clip: Math.abs(x) <= COURT.postX && y >= netTop(x) + R * 0.4 && y < netTop(x) + R };
}

// Simulate until the next ground contact. Ignores the net (reports crossing height instead).
export function trace(P, V, maxSteps = 1100) {
  const p = { x: P.x, y: P.y, z: P.z };
  const v = { x: V.x, y: V.y, z: V.z };
  let crossX = null, crossY = null;
  for (let i = 1; i <= maxSteps; i++) {
    const px = p.x, py = p.y, pz = p.z;
    stepFlight(p, v);
    if (crossY === null && ((pz > 0 && p.z <= 0) || (pz < 0 && p.z >= 0))) {
      const f = pz / (pz - p.z);
      crossX = px + (p.x - px) * f;
      crossY = py + (p.y - py) * f;
    }
    if (p.y <= R && v.y < 0) {
      const f = (py - R) / (py - p.y);
      return { x: px + (p.x - px) * f, z: pz + (p.z - pz) * f, t: (i - 1 + f) * DT, crossX, crossY };
    }
  }
  return null;
}

export function bounceVel(v, sp) {
  let f = PHY.friction + 0.4 * sp;
  f = f < 0.4 ? 0.4 : f > 1 ? 1 : f;
  v.x *= f;
  v.z *= f;
  v.y = -v.y * PHY.restitution;
}

// Full path prediction with bounces (for the AI). stride = ticks between samples.
export function predictPath(pos0, vel0, bounces0, sp0, maxT, stride = 4) {
  const p = { x: pos0.x, y: pos0.y, z: pos0.z };
  const v = { x: vel0.x, y: vel0.y, z: vel0.z };
  let b = bounces0, sp = sp0;
  const samples = [];
  let netBlocked = false, firstBounce = null;
  const n = Math.ceil(maxT / DT);
  for (let i = 1; i <= n; i++) {
    const px = p.x, py = p.y, pz = p.z;
    stepFlight(p, v);
    const nc = netCrossing(px, py, pz, p.x, p.y, p.z);
    if (nc && nc.blocked) { if (b === 0) netBlocked = true; break; }
    if (p.y <= R && v.y < 0) {
      const f = (py - R) / (py - p.y);
      p.x = px + (p.x - px) * f;
      p.z = pz + (p.z - pz) * f;
      p.y = R;
      b++;
      if (!firstBounce) firstBounce = { x: p.x, z: p.z, t: (i - 1 + f) * DT };
      bounceVel(v, sp);
      sp *= 0.5;
      if (v.y < 0.8) { v.y = 0; samples.push({ t: i * DT, x: p.x, y: p.y, z: p.z, vy: 0, b }); break; }
      samples.push({ t: i * DT, x: p.x, y: p.y, z: p.z, vy: v.y, b });
      if (b >= 2) break;
      continue;
    }
    if (i % stride === 0) samples.push({ t: i * DT, x: p.x, y: p.y, z: p.z, vy: v.y, b });
  }
  return { samples, netBlocked, firstBounce };
}
