import { COURT } from './constants.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sideSign = (team) => (team === 0 ? 1 : -1); // sign of z on a team's own side

export function level(dupr) {
  return Math.min(6, Math.max(3, Math.round(dupr)));
}

const AI_SPEED = { 3: 3.5, 4: 4.2, 5: 4.9, 6: 5.6 };
export const HUMAN_SPEED = 4.6;
export function maxSpeed(p) {
  return p.controller === 'ai' ? AI_SPEED[level(p.dupr)] : HUMAN_SPEED;
}

// world x-sign of a team's half ('R' / 'L')
export function halfWorldSign(team, half) {
  const r = half === 'R' ? 1 : -1;
  return team === 0 ? r : -r;
}
export function worldSign(s, p) {
  return halfWorldSign(p.team, s.internal.half[p.id]);
}

// distance from the paddle "hit zone" of a player to the ball. Chest height 1.0 m is free,
// above/below adds vertical stretch.
export function reachDist(pos, ball) {
  const dx = ball.x - pos.x, dz = ball.z - pos.z;
  const dh = Math.hypot(dx, dz);
  const dy = Math.max(0, Math.abs(ball.y - 1.0) - 0.25) * 0.8;
  return Math.hypot(dh, dy);
}

// The non-volley zone only spans the court width: outside the sidelines it does not exist.
export function inKitchen(x, z) {
  return Math.abs(z) <= COURT.kitchen && Math.abs(x) <= COURT.halfW;
}

export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
