// Keyboard (and on-screen touch controls) -> sim Input. WASD / arrows move, Space drive (hold to charge, release to swing),
// J drop, K dink, L lob. Aim = left/right held at the moment the swing is triggered.
// Touch (src/ui/touch.js) feeds the very same state machine through api.touch*: the virtual stick is an analog mx/mz and its
// x beyond +-AIM_STICK means "A" / "D" held; the Drive button is Space, Drop / Dink / Lob are J / K / L.
export const CHARGE_TIME = 0.7;   // seconds to reach full power
export const TAP_TIME = 0.14;     // holds shorter than this are a normal drive (power 0.5)
export const AIM_STICK = 0.45;    // virtual stick |x| beyond this at the moment of the swing = aim -1 / +1

const MOVE_KEYS = {
  KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
};
const SWING_KEYS = { KeyJ: 'drop', KeyK: 'dink', KeyL: 'lob' };
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createInput(handlers = {}) {
  const held = { u: false, d: false, l: false, r: false };
  const sticky = { u: false, d: false, l: false, r: false };   // pressed (even briefly) since the last sim poll
  const down = new Set();
  let pending = null;           // { swing, power, aim }
  let chargeStart = null;       // performance time when Space went down
  let enabled = false;          // gameplay input enabled
  const stick = { x: 0, z: 0, on: false };   // virtual joystick (analog, already dead-zoned / clamped to unit length)
  const api = { enabled: false, charge: 0, held, onReleaseAll: null };

  const now = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000);
  function aimNow() {
    const l = held.l || sticky.l || (stick.on && stick.x < -AIM_STICK), r = held.r || sticky.r || (stick.on && stick.x > AIM_STICK);
    return l && !r ? -1 : r && !l ? 1 : 0;
  }
  function startCharge() { if (chargeStart === null) chargeStart = now(); }
  function finishCharge() {
    if (chargeStart === null) return;
    const dur = now() - chargeStart; chargeStart = null; api.charge = 0;
    if (enabled) {
      const power = dur < TAP_TIME ? 0.5 : 0.5 + 0.5 * Math.min(1, (dur - TAP_TIME) / (CHARGE_TIME - TAP_TIME));
      pending = { swing: 'drive', power, aim: aimNow(), t: now() };
    }
  }

  function onKeyDown(e) {
    // browser / OS shortcuts (Cmd+R, Ctrl+W, Alt+Tab ...) are none of our business
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    const c = e.code;
    if (e.repeat) {
      // a key that was physically held through pause / resume / blur (state was cleared) must count as held again
      if (MOVE_KEYS[c]) held[MOVE_KEYS[c]] = true;
      return;
    }
    down.add(c);
    if (c === 'Escape') { handlers.onEscape && handlers.onEscape(); return; }
    if (c === 'KeyH') { handlers.onToggleLegend && handlers.onToggleLegend(); return; }
    if (c === 'KeyM') { handlers.onToggleMute && handlers.onToggleMute(); return; }
    if (c === 'KeyR') { handlers.onSkipReplay && handlers.onSkipReplay(); return; }
    if (MOVE_KEYS[c]) { held[MOVE_KEYS[c]] = true; sticky[MOVE_KEYS[c]] = true; return; }
    if (!enabled) return;
    // during play Space / Enter must never "click" a focused HUD / menu button
    const ae = typeof document !== 'undefined' ? document.activeElement : null;
    if (ae && ae.tagName === 'BUTTON' && (c === 'Space' || c === 'Enter' || c === 'NumpadEnter')) { ae.blur(); e.preventDefault(); }
    if (c === 'Space') { startCharge(); return; }
    if (SWING_KEYS[c]) { pending = { swing: SWING_KEYS[c], power: 0.5, aim: aimNow(), t: now() }; }
  }
  function onKeyUp(e) {
    if (PREVENT.has(e.code)) e.preventDefault();
    const c = e.code;
    // macOS never sends keyup for keys released while Meta is held
    if (c === 'MetaLeft' || c === 'MetaRight') { releaseAll(); return; }
    down.delete(c);
    if (MOVE_KEYS[c]) held[MOVE_KEYS[c]] = false;
    if (c === 'Space') finishCharge();
  }
  function releaseAll() {
    for (const k of Object.keys(held)) { held[k] = false; sticky[k] = false; }
    down.clear(); chargeStart = null; api.charge = 0; pending = null;
    stick.x = stick.z = 0; stick.on = false;
    if (api.onReleaseAll) api.onReleaseAll();
  }
  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });
  window.addEventListener('blur', releaseAll);

  api.setEnabled = (v) => { enabled = !!v; api.enabled = enabled; if (!enabled) { chargeStart = null; api.charge = 0; pending = null; stick.x = stick.z = 0; stick.on = false; } };
  api.releaseAll = releaseAll;
  // ---- on-screen touch controls (src/ui/touch.js)
  /** virtual stick: x/z in -1..1 (z < 0 = up on the stick = toward the net, like W) */
  api.touchStick = (x, z) => { stick.x = Math.max(-1, Math.min(1, x)); stick.z = Math.max(-1, Math.min(1, z)); stick.on = true; };
  api.touchStickEnd = () => { stick.x = stick.z = 0; stick.on = false; };
  /** Drive button down = Space down (starts charging); up = Space up (swing); cancel = abort without swinging */
  api.touchDriveDown = () => { if (enabled) startCharge(); };
  api.touchDriveUp = () => finishCharge();
  api.touchDriveCancel = () => { chargeStart = null; api.charge = 0; };
  /** Drop / Dink / Lob buttons (trigger on touch down, like J / K / L) */
  api.touchSwing = (shot) => { if (enabled && (shot === 'drop' || shot === 'dink' || shot === 'lob')) pending = { swing: shot, power: 0.5, aim: aimNow(), t: now() }; };
  api.stick = stick;
  /** Called once per rendered frame to update the charge meter value (0..1, 0 when not charging). */
  api.tick = () => {
    api.charge = chargeStart === null ? 0 : Math.max(0, Math.min(1, (now() - chargeStart - TAP_TIME) / (CHARGE_TIME - TAP_TIME)));
    api.charging = chargeStart !== null && now() - chargeStart > TAP_TIME;
  };
  /** One Input for ONE sim step. The queued swing is delivered once (first step after it was pressed). */
  api.poll = (canSwing = true) => {
    const inp = { mx: 0, mz: 0, swing: null, power: 0.5, aim: 0 };
    if (enabled) {
      const r = held.r || sticky.r, l = held.l || sticky.l, d = held.d || sticky.d, u = held.u || sticky.u;
      inp.mx = (r ? 1 : 0) - (l ? 1 : 0);
      inp.mz = (d ? 1 : 0) - (u ? 1 : 0);  // S = back (+z), W = toward the net (-z)
      if (stick.on) { inp.mx = Math.max(-1, Math.min(1, inp.mx + stick.x)); inp.mz = Math.max(-1, Math.min(1, inp.mz + stick.z)); }
      sticky.u = sticky.d = sticky.l = sticky.r = false;
      if (pending) {
        if (canSwing) { inp.swing = pending.swing; inp.power = pending.power; inp.aim = pending.aim; pending = null; }
        else if (now() - pending.t > 0.25) pending = null;   // buffered press expires
      }
    }
    return inp;
  };
  /** Scripted input for tests (bypasses the keyboard). */
  api.inject = (swing, power = 0.5, aim = 0) => { pending = { swing, power, aim, t: now() }; };
  api.dispose = () => {
    window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', releaseAll);
  };
  return api;
}
