// In-game HUD: broadcast scoreboard, call text, hints, toasts, charge meter, rally counter, key legend.
import { h } from './dom.js';
import { teamLabel, TEAM_COLOR } from './text.js';
import { CUES } from './menu.js';
import { t } from './i18n.js';

const KEYS = [
  [['W', 'A', 'S', 'D'], 'legend.move'],
  [['Space'], 'legend.drive'],
  [['J'], 'legend.drop'], [['K'], 'legend.dink'], [['L'], 'legend.lob'],
  [['A', 'D'], 'legend.aim'],
  [['Esc'], 'legend.pause'], [['M'], 'legend.mute'], [['H'], 'legend.hide'],
];

export function createHud(root) {
  const tr = [];   // static-text updaters, re-run on every language change
  const L = (el, key) => { tr.push(() => { el.textContent = t(key); }); el.textContent = t(key); return el; };
  const A = (el, attr, key) => { tr.push(() => el.setAttribute(attr, t(key))); el.setAttribute(attr, t(key)); return el; };
  const ptsEl = [h('span', { class: 'pts', text: '0' }), h('span', { class: 'pts', text: '0' })];
  const dotEl = [h('span', { class: 'srv' }), h('span', { class: 'srv' })];
  const srvNo = [h('span', { class: 'srvno' }), h('span', { class: 'srvno' })];
  const nameEl = [h('span', { class: 'names' }), h('span', { class: 'names' })];
  const row = (i) => h('div', { class: `sb-row t${i}` }, dotEl[i], h('span', { class: 'chip', style: `background:${TEAM_COLOR[i]}` }), nameEl[i], srvNo[i], ptsEl[i]);
  const callEl = h('span', { class: 'call', text: '0 - 0' });
  const modeEl = h('span', { class: 'modeinfo' });
  const gpEl = L(h('span', { class: 'gp hidden' }), 'hud.gamePoint');
  const sb = h('div', { class: 'scoreboard' }, row(0), row(1), h('div', { class: 'sb-foot' }, L(h('span', { class: 'calllbl' }), 'hud.callLabel'), callEl, modeEl), gpEl);

  const rallyB = h('b', { text: '0' });
  const rallyEl = h('div', { class: 'rally hidden' }, L(h('span', { class: 'rl' }), 'hud.rally'), rallyB);
  const hintEl = h('div', { class: 'hint hidden' });
  const bannerEl = h('div', { class: 'banner hidden' }, h('div', { class: 'bn-main' }), h('div', { class: 'bn-sub' }));
  const toastEl = h('div', { class: 'shot-toast hidden' });
  const chargeI = h('i');
  const chargeEl = h('div', { class: 'charge hidden' }, h('div', { class: 'charge-bar' }, chargeI), L(h('span'), 'hud.charge'));
  const legendEl = h('div', { class: 'legend' }, L(h('div', { class: 'lg-title' }), 'legend.title'),
    KEYS.map(([ks, key]) => h('div', { class: 'lg-row' }, h('span', { class: 'keys' }, ks.map((k) => h('kbd', { text: k }))), L(h('span'), key))),
    L(h('div', { class: 'lg-title lg2' }), 'legend.rings'),
    CUES.map(([c, k]) => h('div', { class: 'lg-row' }, h('span', { class: 'keys' }, h('i', { class: 'lgdot', style: `background:${c}` })),
      L(h('span'), `legend.ring.${k}`))));
  const refEl = h('div', { class: 'refcall hidden' });
  const topRight = h('div', { class: 'topright' });
  const pauseBtn = h('button', { class: 'iconbtn', tabindex: '-1', html: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>' });
  const muteBtn = h('button', { class: 'iconbtn', tabindex: '-1' });
  const legendBtn = h('button', { class: 'iconbtn', tabindex: '-1', html: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 10h2M11 10h2M15 10h2M8 14h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' });
  A(pauseBtn, 'title', 'hud.pauseTitle'); A(pauseBtn, 'aria-label', 'hud.pause');
  A(muteBtn, 'title', 'hud.muteTitle'); A(muteBtn, 'aria-label', 'hud.mute');
  A(legendBtn, 'title', 'hud.legendTitle'); A(legendBtn, 'aria-label', 'hud.legendAria');
  topRight.append(rallyEl, legendBtn, muteBtn, pauseBtn);

  const el = h('div', { class: 'hud hidden' }, sb, topRight, refEl, bannerEl, toastEl, hintEl, chargeEl, legendEl);
  root.append(el);

  const api = { el, pauseBtn, muteBtn, legendBtn };
  let toastT = 0, bannerT = 0, hintLock = 0, lastHint = '', refT = 0;
  let toastSpec = null, bannerSpec = null, hintSpec = null;
  let cfgSig = '';
  // only touch the DOM when a value really changed (updateScore / showRally / charge run every frame)
  const setText = (el, v) => { v = String(v); if (el._t !== v) { el._t = v; el.textContent = v; } };
  const setHidden = (el, hid) => { if (el._h !== hid) { el._h = hid; el.classList.toggle('hidden', hid); } };
  const setOn = (el, cls, on) => { const k = '_c' + cls; if (el[k] !== on) { el[k] = on; el.classList.toggle(cls, on); } };

  api.setMuteIcon = (m) => {
    muteBtn.innerHTML = m
      ? '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    muteBtn.classList.toggle('off', !!m);
  };
  api.setLegend = (on) => { legendEl.classList.toggle('hidden', !on); legendBtn.classList.toggle('off', !on); };
  api.show = (v) => el.classList.toggle('hidden', !v);

  /** mode line + team names (translated at display time; sim names are stable keys) */
  function labels(state) {
    const cfg = state.config;
    modeEl.textContent = `${t(`mode.${cfg.mode}`)} · ${t(`scoring.${cfg.scoring}`)}`;
    for (let i = 0; i < 2; i++) nameEl[i].textContent = teamLabel(state, i);
  }
  api.setup = (state) => {
    const cfg = state.config;
    labels(state);
    cfgSig = '';
    sb.classList.toggle('sideout-dbl', cfg.mode === 'doubles' && cfg.scoring === 'sideout');
    api.clearTransient();
  };
  api.clearTransient = () => {
    bannerEl.classList.add('hidden'); toastEl.classList.add('hidden'); hintEl.classList.add('hidden'); setHidden(rallyEl, true);
    setHidden(chargeEl, true); refEl.classList.add('hidden'); toastT = bannerT = hintLock = refT = 0; lastHint = ''; toastSpec = bannerSpec = hintSpec = null;
  };

  api.updateScore = (state) => {
    const sc = state.score, cfg = state.config;
    for (let i = 0; i < 2; i++) {
      const p = String(sc.points[i]);
      if (ptsEl[i]._t !== p) { ptsEl[i]._t = p; ptsEl[i].textContent = p; ptsEl[i].classList.remove('bump'); void ptsEl[i].offsetWidth; ptsEl[i].classList.add('bump'); }
      setOn(dotEl[i], 'on', sc.servingTeam === i);
      setText(srvNo[i], sc.servingTeam === i && cfg.mode === 'doubles' && cfg.scoring === 'sideout' ? t('hud.server', { n: sc.serverNumber }) : '');
    }
    setText(callEl, sc.callText);
    setHidden(gpEl, !sc.gamePoint || sc.winner !== null);
    setOn(sb, 'gp-on', sc.gamePoint && sc.winner === null);
  };

  api.showRally = (hits) => {
    if (hits >= 3) { setHidden(rallyEl, false); setText(rallyB, hits); }
    else setHidden(rallyEl, true);
  };
  function fillToast() {
    const { shot, power } = toastSpec;
    toastEl.innerHTML = '';
    const sub = t(`shot.${shot}.sub`);
    toastEl.append(h('b', { text: t(`shot.${shot}`) }));
    if (sub) toastEl.append(h('span', { text: sub }));
    if (power !== undefined && power > 0.55 && shot === 'drive') toastEl.append(h('em', { text: t('hud.power', { n: Math.round(power * 100) }) }));
  }
  api.toast = (shot, power) => {
    toastSpec = { shot, power };
    toastEl.className = `shot-toast s-${shot}`;
    fillToast();
    void toastEl.offsetWidth; toastEl.classList.add('pop');
    toastT = 0.9;
  };
  /** `spec` is a function returning [main, sub] so the visible banner can be re-worded on a language change */
  function fillBanner() { const [main, sub] = bannerSpec(); bannerEl.firstChild.textContent = main; bannerEl.lastChild.textContent = sub || ''; }
  api.banner = (spec, kind = 'info', dur = 2.6) => {
    bannerEl.className = `banner k-${kind}`;
    bannerSpec = spec; fillBanner();
    void bannerEl.offsetWidth; bannerEl.classList.add('pop');
    bannerT = dur;
  };
  api.hideBanner = () => { bannerEl.classList.add('hidden'); bannerT = 0; };
  api.ref = (text) => { refEl.textContent = text; refEl.classList.remove('hidden'); refT = 3.0; };
  /** persistent contextual hint; `prio` hints replace lower ones; pass null to clear */
  api.hint = (key, kind = '') => {
    setOn(hintEl, 'warn', kind === 'warn');
    setOn(hintEl, 'urge', kind === 'urge');
    if ((key || '') === lastHint) return;
    lastHint = key || ''; hintSpec = key || null;
    if (!key) hintEl.classList.add('hidden');
    else { hintEl.textContent = t(key); hintEl.classList.remove('hidden'); }
  };
  /** language changed: re-word everything that is on screen right now */
  api.relang = (state) => {
    for (const f of tr) f();
    if (state) labels(state);
    if (toastSpec && !toastEl.classList.contains('hidden')) fillToast();
    if (bannerSpec && !bannerEl.classList.contains('hidden')) fillBanner();
    if (hintSpec) hintEl.textContent = t(hintSpec);
    if (state) { for (const e of [srvNo[0], srvNo[1], callEl]) e._t = undefined; api.updateScore(state); }
  };
  api.charge = (v, on) => {
    setHidden(chargeEl, !on);
    if (on) {
      const w = Math.round(v * 100);
      if (chargeEl._w !== w) { chargeEl._w = w; chargeI.style.width = `${w}%`; }
      setOn(chargeEl, 'full', v >= 0.98);
    }
  };
  api.tick = (dt) => {
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.add('hidden'); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.classList.add('hidden'); }
    if (refT > 0) { refT -= dt; if (refT <= 0) refEl.classList.add('hidden'); }
  };
  return api;
}
