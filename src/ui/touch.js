// On-screen touch controls: a floating analog joystick (left ~45 % of the screen) and four thumb buttons (right).
// They only talk to src/input.js (stick = analog mx/mz + aim, Drive = Space, Drop/Dink/Lob = J/K/L), so the sim receives
// exactly the Input objects the keyboard path produces.
//
// Robustness rules (multi-touch, lost events):
//   - every control owns at most ONE finger, tracked by Touch.identifier; extra fingers on a busy control are ignored
//   - touchmove / touchend go to the element the touch started on, so a finger sliding outside its control keeps working
//   - touchcancel aborts (a Drive charge is dropped without swinging; the stick snaps back)
//   - every touch event also reconciles against `event.touches`: a finger that vanished without a touchend is released
//   - input.releaseAll() (pause, blur, page hide, orientation change ...) resets everything via input.onReleaseAll
import { h } from './dom.js';
import { t } from './i18n.js';

export const ZONE_FRAC = 0.45;      // the stick may start anywhere in the left 45 % of the screen
export const DEAD_ZONE = 0.12;      // fraction of the stick radius that reads as "centred"
const SHOTS = [['lob', 'touch.lob'], ['drop', 'touch.drop'], ['dink', 'touch.dink'], ['drive', 'touch.drive']];

/** pure helper (also used by tests): finger offset (dx, dy px) from the stick origin -> {x, z, mag} with dead zone, clamped to unit length */
export function stickVector(dx, dy, radius) {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, z: 0, mag: 0 };
  const m = Math.min(1, len / radius);
  if (m < DEAD_ZONE) return { x: 0, z: 0, mag: 0 };
  const k = (m - DEAD_ZONE) / (1 - DEAD_ZONE);        // 0..1 after the dead zone: smooth start, full speed at the rim
  return { x: (dx / len) * k, z: (dy / len) * k, mag: k };
}

/** Block page scroll / rubber-banding / pinch zoom / long-press menus everywhere except inside scrollable menu panels. */
export function installPageGuards() {
  const scrollable = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.classList && n.classList.contains('panel') && n.scrollHeight > n.clientHeight + 1) return true;
    }
    return false;
  };
  document.addEventListener('touchmove', (e) => {
    const tg = e.target;
    if (tg && tg.closest && tg.closest('input[type="range"]')) return;   // let the volume slider drag
    if (scrollable(tg)) return;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });   // iOS pinch
  document.addEventListener('contextmenu', (e) => { if (!(e.target && e.target.closest && e.target.closest('a[href]'))) e.preventDefault(); });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
}

export function createTouch(root, input) {
  const upd = [];
  const L = (el, key) => { upd.push(() => { el.textContent = t(key); }); el.textContent = t(key); return el; };

  // ---- stick
  const knob = h('div', { class: 'tc-knob' });
  const aimL = h('i', { class: 'tc-aim l' }), aimR = h('i', { class: 'tc-aim r' });
  const base = h('div', { class: 'tc-base' }, aimL, aimR, knob);
  const idle = h('div', { class: 'tc-idle' }, h('div', { class: 'tc-idle-ring' }), L(h('span'), 'touch.move'));
  const zone = h('div', { class: 'tc-zone' }, idle, base);

  // ---- buttons
  const btnEls = {};
  const ring = (cls) => {
    const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('class', cls);
    for (const c of ['track', 'fill']) { const e = document.createElementNS(NS, 'circle'); e.setAttribute('cx', '50'); e.setAttribute('cy', '50'); e.setAttribute('r', '46'); e.setAttribute('pathLength', '100'); e.setAttribute('class', c); s.append(e); }
    return s;
  };
  for (const [shot, key] of SHOTS) {
    const kids = [L(h('b'), key)];
    if (shot === 'drive') { kids.push(L(h('small'), 'touch.drive.sub')); kids.unshift(ring('tc-ring')); }
    btnEls[shot] = h('button', { class: `tc-btn tc-${shot}`, type: 'button', tabindex: '-1', 'data-shot': shot, 'aria-label': t(key) }, ...kids);
    upd.push(() => btnEls[shot].setAttribute('aria-label', t(key)));
  }
  const btns = h('div', { class: 'tc-btns' }, SHOTS.map(([s]) => btnEls[s]));
  const el = h('div', { class: 'touch hidden', 'data-cue': '0' }, zone, btns);
  root.append(el);

  const api = { el, visible: false };
  const stick = { id: null, ox: 0, oy: 0, R: 56, aim: 0 };
  const held = {};    // shot -> touch id
  let shown = false;

  function setKnob(dx, dy) { knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`; }
  function stickUpdate(tt) {
    let dx = tt.clientX - stick.ox, dy = tt.clientY - stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > stick.R) { dx *= stick.R / len; dy *= stick.R / len; }
    setKnob(dx, dy);
    const v = stickVector(dx, dy, stick.R);
    input.touchStick(v.x, v.z);
    const aim = v.x < -0.45 ? -1 : v.x > 0.45 ? 1 : 0;
    if (aim !== stick.aim) { stick.aim = aim; aimL.classList.toggle('on', aim < 0); aimR.classList.toggle('on', aim > 0); }
  }
  function stickEnd() {
    if (stick.id === null && !el.classList.contains('stick-on')) return;
    stick.id = null; stick.aim = 0;
    el.classList.remove('stick-on'); aimL.classList.remove('on'); aimR.classList.remove('on');
    setKnob(0, 0);
    input.touchStickEnd();
  }

  function press(shot, id) {
    held[shot] = id;
    btnEls[shot].classList.add('down');
    if (shot === 'drive') { btnEls.drive.classList.add('charging'); input.touchDriveDown(); }
    else { input.touchSwing(shot); const b = btnEls[shot]; b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); }
  }
  function release(shot, cancel) {
    if (held[shot] === undefined) return;
    delete held[shot];
    btnEls[shot].classList.remove('down');
    if (shot === 'drive') {
      btnEls.drive.classList.remove('charging', 'full'); btnEls.drive.style.setProperty('--p', '0');
      if (cancel) input.touchDriveCancel(); else input.touchDriveUp();
    }
  }
  function releaseAllLocal() {
    stickEnd();
    for (const s of Object.keys(held)) release(s, true);
  }

  // ---- stick events (target = zone for the whole life of the touch)
  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!shown) return;
    for (const tt of e.changedTouches) {
      if (stick.id !== null) break;                          // a third finger (or a 2nd one on the left) is ignored
      const r = zone.getBoundingClientRect();
      stick.R = Math.max(44, Math.min(68, Math.min(window.innerWidth, window.innerHeight) * 0.15));
      el.style.setProperty('--sr', `${stick.R}px`);
      // keep the whole base on screen (the finger may start at the very edge)
      stick.ox = Math.max(r.left + stick.R * 0.6, Math.min(r.right - stick.R * 0.6, tt.clientX));
      stick.oy = Math.max(r.top + stick.R * 0.6, Math.min(r.bottom - stick.R * 0.6, tt.clientY));
      base.style.left = `${stick.ox - r.left}px`; base.style.top = `${stick.oy - r.top}px`;
      stick.id = tt.identifier;
      el.classList.add('stick-on');
      stickUpdate(tt);
    }
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault();
    if (stick.id === null) return;
    for (const tt of e.changedTouches) if (tt.identifier === stick.id) { stickUpdate(tt); break; }
  }, { passive: false });
  const zoneEnd = (e) => {
    if (e.cancelable) e.preventDefault();
    for (const tt of e.changedTouches) if (tt.identifier === stick.id) { stickEnd(); break; }
  };
  zone.addEventListener('touchend', zoneEnd, { passive: false });
  zone.addEventListener('touchcancel', zoneEnd, { passive: false });

  // ---- button events
  for (const [shot] of SHOTS) {
    const b = btnEls[shot];
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (!shown || held[shot] !== undefined) return;
      for (const tt of e.changedTouches) {
        if (tt.target !== b && !b.contains(tt.target)) continue;
        press(shot, tt.identifier); break;
      }
    }, { passive: false });
    b.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    b.addEventListener('touchend', (e) => {
      if (e.cancelable) e.preventDefault();
      for (const tt of e.changedTouches) if (tt.identifier === held[shot]) { release(shot, false); break; }
    }, { passive: false });
    b.addEventListener('touchcancel', (e) => {
      for (const tt of e.changedTouches) if (tt.identifier === held[shot]) { release(shot, true); break; }
    }, { passive: false });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---- lost-event safety net: any touch event lists every finger still down; a finger we track that is not there is gone
  const reconcile = (e) => {
    if (!shown || (stick.id === null && !Object.keys(held).length)) return;
    const ids = new Set(); for (const tt of e.touches) ids.add(tt.identifier);
    if (e.type === 'touchcancel') return;                 // the element handler aborts it properly
    if (stick.id !== null && !ids.has(stick.id)) stickEnd();
    for (const s of Object.keys(held)) if (!ids.has(held[s])) release(s, false);
  };
  for (const ev of ['touchstart', 'touchmove', 'touchend']) window.addEventListener(ev, reconcile, { capture: true, passive: true });

  // ---- public API
  api.show = (on) => {
    on = !!on;
    if (on === shown) return;
    shown = on; api.visible = on;
    el.classList.toggle('hidden', !on);
    if (!on) releaseAllLocal();
  };
  api.reset = releaseAllLocal;
  /** per frame: charge ring on the Drive button (0..1) and the foot-ring cue (0..4) mirrored as a glow on the buttons */
  api.update = (charge, charging, cue) => {
    if (!shown) return;
    const d = btnEls.drive;
    if (held.drive !== undefined) {
      const p = charging ? Math.max(0, Math.min(1, charge)) : 0;
      const q = Math.round(p * 100);
      if (d._q !== q) { d._q = q; d.style.setProperty('--p', String(q)); d.classList.toggle('full', p >= 0.98); }
    }
    const c = String(cue | 0);
    if (el.dataset.cue !== c) el.dataset.cue = c;
  };
  api.relang = () => { for (const f of upd) f(); };
  input.onReleaseAll = () => { releaseAllLocal(); };
  api.state = () => ({ stickId: stick.id, held: { ...held }, shown });
  return api;
}
