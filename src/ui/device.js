// Device / input-mode detection shared by the shell.
//   - "touch UI" (on-screen joystick + buttons, touch hints) vs "keyboard UI" is decided by the LAST input type used:
//     it starts from `(pointer: coarse)` (the primary pointer is a finger), a touch / pen pointer switches to touch,
//     a mouse pointer or any key press switches to keyboard. So a laptop with a touchscreen that is played with the
//     keyboard never gets stuck with the overlay, and a phone with a Bluetooth keyboard gets it back on the next touch.
//   - `?controls=touch` / `?controls=keys` pins the mode (used by tests and screenshots).
//   - `defaultQuality()` is the graphics preset used when nothing is stored yet: low on phones, medium on tablets, high on desktop.
let touchUI = false;
let pinned = false;
const listeners = [];

const mq = (q) => { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } };

/** primary pointer is a finger (phones, tablets) */
export const isCoarse = () => mq('(pointer: coarse)');
/** shortest side of the physical screen in CSS px (falls back to the window) */
export function screenMin() {
  try {
    const s = window.screen;
    const m = Math.min(s.width || 0, s.height || 0);
    return m > 0 ? m : Math.min(window.innerWidth, window.innerHeight);
  } catch (e) { return 1024; }
}
/** graphics preset when nothing is stored: coarse + small screen = phone -> low, coarse + big = tablet -> medium, else high */
export function defaultQuality() {
  if (!isCoarse()) return 'high';
  return screenMin() < 600 ? 'low' : 'medium';
}

export const isTouchUI = () => touchUI;
export const isPinned = () => pinned;
export function onUIModeChange(cb) { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; }

export function setTouchUI(v) {
  v = !!v;
  if (pinned || v === touchUI) return false;
  touchUI = v;
  apply();
  for (const cb of listeners.slice()) { try { cb(v); } catch (e) { /* a listener must never break input switching */ } }
  return true;
}
function apply() {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('touch-ui', touchUI);
  document.documentElement.classList.toggle('touch-ui', touchUI);
}

export function initDevice() {
  let force = null;
  try { force = new URLSearchParams(location.search).get('controls'); } catch (e) { /* ignore */ }
  if (force === 'touch' || force === 'keys') { pinned = true; touchUI = force === 'touch'; }
  else touchUI = isCoarse();
  apply();
  if (pinned) return;
  // last input type used wins
  const opt = { capture: true, passive: true };
  window.addEventListener('touchstart', () => setTouchUI(true), opt);
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') setTouchUI(true); else if (e.pointerType === 'mouse') setTouchUI(false); }, opt);
  window.addEventListener('keydown', (e) => { if (e.key !== 'Unidentified') setTouchUI(false); }, opt);
}

/** fullscreen API available (not on iPhone Safari) and not already installed as a standalone app */
export function canFullscreen() {
  const de = document.documentElement;
  if (!(de.requestFullscreen || de.webkitRequestFullscreen)) return false;
  if (document.fullscreenEnabled === false) return false;
  if (mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || window.navigator.standalone) return false;
  return true;
}
export function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
export function toggleFullscreen() {
  try {
    if (isFullscreen()) { const x = document.exitFullscreen || document.webkitExitFullscreen; if (x) { const p = x.call(document); if (p && p.catch) p.catch(() => {}); } }
    else { const de = document.documentElement; const r = de.requestFullscreen || de.webkitRequestFullscreen; if (r) { const p = r.call(de); if (p && p.catch) p.catch(() => {}); } }
  } catch (e) { /* ignore */ }
}

/** light haptic tick; never throws, never logs (Chrome warns if vibrate is called before any tap) */
export function buzz(ms = 12) {
  try {
    if (!navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(ms);
  } catch (e) { /* ignore */ }
}
