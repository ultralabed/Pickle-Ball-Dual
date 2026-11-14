// Constants shared by the whole headless simulation.
export const DT = 1 / 120;

export const COURT = Object.freeze({
  width: 6.10,
  length: 13.41,
  halfW: 3.05,
  halfL: 6.705,
  kitchen: 2.134,
  netH: 0.914,      // at the posts
  netHC: 0.864,     // at the center
  postX: 3.355,
  ballR: 0.037,
});

// Swing types a player can request through Input.swing.
export const SHOTS = Object.freeze(['drive', 'drop', 'dink', 'lob']);
// Every value that can appear in a `hit` event's `shot` field.
export const ALL_SHOTS = Object.freeze(['drive', 'drop', 'dink', 'lob', 'smash', 'serve']);
export const DUPR_LEVELS = Object.freeze([3.0, 4.0, 5.0, 6.0]);

export const PHY = Object.freeze({
  g: 9.81,
  drag: 0.03,          // quadratic drag: a = -drag*|v|*v
  restitution: 0.62,   // vertical
  friction: 0.80,      // horizontal speed kept on bounce (before spin modifier)
});

export const TIMING = Object.freeze({
  swingDur: 0.40,
  winStart: 0.08,
  winEnd: 0.28,
  winCenter: 0.17,
  serveContact: 0.22,
  pointOver: 2.5,
  kitchenMomentum: 0.6,
});

export const REACH = 1.3;
export const SMASH_Y = 1.6;
