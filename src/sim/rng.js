// Seeded RNG whose state lives inside sim.state.internal.rng (uint32) so it snapshots with the sim.
export function seedToState(seed) {
  let s = (Number(seed) || 0) >>> 0;
  s = (Math.imul(s ^ 0x9e3779b9, 0x85ebca6b) >>> 0) ^ 0xc2b2ae35;
  return s >>> 0;
}
export function nextRand(I) {
  I.rng = (I.rng + 0x6D2B79F5) >>> 0;
  let t = I.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function nextGauss(I) {
  const u1 = Math.max(1e-9, nextRand(I));
  const u2 = nextRand(I);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
