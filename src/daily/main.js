// Daily Pickleball Challenge shell: five seeded skill shots a day on the game's real 3D court.
// Reuses the game's renderer, characters, ball physics, audio, i18n and settings store. The challenge content is in challenges.js.
import * as THREE from 'three';
import { createView } from '../render/index.js';
import { ANIM_DURATION, POSE_CONTACT } from '../render/pose.js';
import { stepFlight, bounceVel } from '../sim/physics.js';
import { createAudio } from '../ui/audio.js';
import { loadSettings, saveSettings } from '../ui/store.js';
import { isCoarse, buzz } from '../ui/device.js';
import { installPageGuards } from '../ui/touch.js';
import { t, setLang, getLang, detectLang, isLang } from '../ui/i18n.js';
import { h } from '../ui/dom.js';
import { CHALLENGES, BY_ID } from './challenges.js';
import { COURT, DT, EARLY, clamp, launchVel, playBall, contactAt, genStage, stageScore, targetAt, isGood } from './engine.js';
import { STAGES, dayInfo, genDay, pickDay, totals, shareText, lsGet, lsSet, saveKey, loadDay, updateStats, STATS_KEY, SEEN_KEY, emojiFor } from './day.js';
import { createProps } from './props.js';

const $ = (s) => document.querySelector(s);
const L = () => (getLang() === 'zh-TW' ? 'zh' : 'en');
const PRAC_KEY = 'pbd-daily.practice';
const R = COURT.ballR;

// ------------------------------------------------------------------ setup
installPageGuards();
const settings = loadSettings();
const urlLang = (() => { try { const v = new URLSearchParams(location.search).get('lang') || ''; return /^zh/i.test(v) ? 'zh-TW' : /^en/i.test(v) ? 'en' : null; } catch (e) { return null; } })();
setLang(urlLang || (isLang(settings.lang) ? settings.lang : detectLang()), { silent: true });

const canvas = $('#game');
let view;
try {
  view = createView(canvas, { quality: settings.quality, antialias: !(settings.quality === 'low' && isCoarse()), preserveDrawingBuffer: /[?&]pdb=1/.test(location.search) });
} catch (err) {
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#fff;font:18px system-ui;text-align:center;padding:24px">${t('app.noWebgl')}</div>`);
  throw err;
}
view.court.hideNearFence(true);
const props = createProps(view);
const audio = createAudio();
audio.setMuted(settings.muted); audio.setVolume(settings.volume);
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, (e) => audio.unlock(e.type), { capture: true, passive: true });

// ------------------------------------------------------------------ state
let DAY = dayInfo();
let run = null;          // { kind: 'daily' | 'practice', stages: [{def, st}], state: {stage, shots, done} }
let cur = null;          // the stage being played: { def, st }
let mode = 'aim';        // aim | swing | fly | after | wait
let shotIdx = 0, clock = 0, simTime = 0, modeT = 0;
let drag = null, aim = null;
let fl = null;           // player's ball in flight: { pts, n, i, out }
let free = null;         // ball bouncing around after the scored landing: { p, v, t, b }
let inc = null;          // incoming ball: { tick, wait, pending, whiff }
let pendingStatic = null;
let hum = { name: 'ready', t: 0, side: 'forehand' };
let humEmotion = 'neutral', humFacing = 0;
const others = [];       // defenders + feeder: { id, x, z, anim, kind }
const ball = { pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 }, visible: false, bounces: 0 };
const lastBall = { x: 0, y: 0, z: 0 };
const cam = { pos: new THREE.Vector3(0, 6, 14), tgt: new THREE.Vector3(0, 0.5, 0), fov: 44, wantPos: new THREE.Vector3(), wantTgt: new THREE.Vector3(), wantFov: 44, init: false };
let advanceTimer = 0, toastTimer = 0, sheet = null;

const stageIndex = () => run.state.stage;
const shotsNow = () => run.state.shots[stageIndex()];
const usedNow = () => shotsNow().length;
const stageOver = () => usedNow() >= cur.st.balls || (cur.st.agg === 'best' && shotsNow().some((b) => b.s === 100));
const targetIdx = () => (cur.st.agg === 'avg' ? Math.min(usedNow(), cur.st.targets.length - 1) : 0);
// the target on show: while a ball is on its way it is still the one that ball was hit at
const shownTarget = () => (cur.st.agg !== 'avg' ? 0 : clamp(usedNow() - (mode === 'swing' || mode === 'fly' || mode === 'after' ? 1 : 0), 0, cur.st.targets.length - 1));

// ------------------------------------------------------------------ UI
const ui = {};
function buildUI() {
  const root = $('#dc');
  ui.title = h('span', { class: 'dc-name' });
  ui.day = h('b', { class: 'dc-day' });
  ui.stage = h('span', { class: 'dc-stage' });
  ui.listBtn = h('button', { type: 'button', class: 'dc-ib', onclick: () => { audio.click(); openList(); } }, '☰');
  ui.langBtn = h('button', { type: 'button', class: 'dc-ib', 'aria-label': 'Language', onclick: () => { audio.click(); toggleLang(); } });
  ui.muteBtn = h('button', { type: 'button', class: 'dc-ib', onclick: () => { settings.muted = !settings.muted; saveSettings(settings); audio.setMuted(settings.muted); audio.click(); renderHud(); } });
  ui.helpBtn = h('button', { type: 'button', class: 'dc-ib', onclick: () => { audio.click(); openHelp(); } }, '?');
  ui.top = h('div', { class: 'dc-top' }, h('h1', null, ui.title, ui.day), ui.listBtn, ui.langBtn, ui.muteBtn, ui.helpBtn);

  ui.cName = h('b'); ui.cHow = h('span'); ui.cNo = h('i');
  ui.wind = h('div', { class: 'dc-wind hidden' });
  ui.card = h('div', { class: 'dc-card' }, h('div', { class: 'dc-card-h' }, ui.cNo, ui.cName, ui.stage, ui.wind), ui.cHow);
  ui.map = h('canvas', { class: 'dc-map', role: 'img' });
  ui.toast = h('div', { class: 'dc-toast', role: 'status', 'aria-live': 'polite' });
  ui.hint = h('div', { class: 'dc-hint' });
  ui.power = h('div', { class: 'dc-power hidden' }, h('i'), h('b'));
  ui.sling = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ui.sling.setAttribute('class', 'dc-sling hidden');
  ui.sling.innerHTML = '<line x1="0" y1="0" x2="0" y2="0"/><circle r="9"/><circle class="k" r="16"/>';

  ui.shots = h('div', { class: 'dc-shots', role: 'group' });
  ui.balls = h('div', { class: 'dc-balls' });
  ui.chips = h('div', { class: 'dc-chips' });
  ui.next = h('button', { type: 'button', class: 'dc-next', onclick: () => { audio.click(); advance(); } });
  ui.bottom = h('div', { class: 'dc-bottom' }, ui.shots, h('div', { class: 'dc-row' }, ui.balls, ui.chips, ui.next));
  ui.sheets = h('div', { class: 'dc-sheets' });
  root.append(ui.top, ui.card, ui.map, ui.hint, ui.toast, ui.power, ui.sling, ui.bottom, ui.sheets);
}

function renderHud() {
  if (!run || !cur) return;
  const daily = run.kind === 'daily', st = cur.st, i = stageIndex();
  document.title = t('daily.title');
  ui.title.textContent = t('daily.short');
  ui.day.textContent = daily ? `#${DAY.n}` : t('daily.practiceTag');
  ui.day.classList.toggle('prac', !daily);
  ui.stage.textContent = daily ? t('daily.stage', { n: i + 1, m: STAGES }) : '';
  ui.langBtn.textContent = getLang() === 'zh-TW' ? 'EN' : '中';
  ui.muteBtn.textContent = settings.muted ? '🔇' : '🔊';
  ui.listBtn.setAttribute('aria-label', t('daily.aria.list')); ui.helpBtn.setAttribute('aria-label', t('daily.aria.help'));
  ui.muteBtn.setAttribute('aria-label', t('daily.aria.mute')); ui.map.setAttribute('aria-label', t('daily.aria.map'));
  ui.cNo.textContent = String(CHALLENGES.indexOf(cur.def) + 1);
  ui.cName.textContent = cur.def.name[L()];
  ui.cHow.textContent = cur.def.how[L()];
  const w = st.wind, ws = Math.hypot(w.x, w.z);
  ui.wind.classList.toggle('hidden', ws < 0.3);
  if (ws >= 0.3) {
    ui.wind.innerHTML = '';
    const arrow = h('i', { style: `transform:rotate(${Math.round((Math.atan2(w.z, w.x) * 180) / Math.PI)}deg)` }, '➜');
    ui.wind.append(t('daily.wind'), arrow, h('b', null, ws.toFixed(1)));
  }
  // shot type buttons
  ui.shots.innerHTML = '';
  st.shots.forEach((s, k) => {
    ui.shots.append(h('button', { type: 'button', 'aria-pressed': k === shotIdx ? 'true' : 'false', onclick: () => { shotIdx = k; audio.click(); renderHud(); } },
      h('b', null, t(`daily.shot.${s.key}`)), h('span', null, t(`daily.shot.${s.key}.sub`))));
  });
  // balls left on this stage
  ui.balls.innerHTML = '';
  for (let k = 0; k < st.balls; k++) ui.balls.append(h('i', { class: k < usedNow() ? 'used' : '' }));
  // score chips
  ui.chips.innerHTML = '';
  run.stages.forEach((g, k) => {
    const sh = run.state.shots[k], played = sh.length > 0;
    ui.chips.append(h('div', { class: `dc-chip${k === i && !run.state.done ? ' cur' : ''}${played ? ' done' : ''}` }, played ? String(stageScore(g.st, sh)) : '–'));
  });
  const last = i >= run.stages.length - 1;
  ui.next.textContent = t(last ? (daily ? 'daily.finish' : 'daily.next') : 'daily.next');
  const busy = mode === 'swing' || mode === 'fly' || mode === 'after';
  ui.next.disabled = busy || usedNow() === 0;
  ui.next.classList.toggle('go', !busy && stageOver());
  // hint line
  let hint = '';
  if (mode === 'aim' && !drag) {
    if (st.agg === 'avg') hint = t('daily.hint.target', { n: targetIdx() + 1 });
    if (usedNow() === 0) hint = t(st.inc ? 'daily.hint.incoming' : 'daily.hint.pull');
  }
  ui.hint.textContent = hint;
}

function toast(text, cls = '') {
  ui.toast.textContent = text; ui.toast.className = `dc-toast show ${cls}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { ui.toast.className = 'dc-toast'; }, 1500);
}

function toggleLang() {
  const next = getLang() === 'zh-TW' ? 'en' : 'zh-TW';
  setLang(next); settings.lang = next; saveSettings(settings);
  renderHud();
  if (sheet) sheet.redraw();
}

// ------------------------------------------------------------------ sheets
function closeSheet() { ui.sheets.innerHTML = ''; sheet = null; }
function openSheet(name, draw) {
  const redraw = () => { ui.sheets.innerHTML = ''; ui.sheets.append(h('div', { class: 'dc-sheet', 'data-sheet': name }, draw())); };
  sheet = { name, redraw }; redraw();
}
function openHelp() {
  openSheet('help', () => h('div', { class: 'panel dc-panel' },
    h('h2', null, t('daily.how.title')),
    h('ol', { class: 'dc-how' }, [1, 2, 3, 4, 5].map((n) => h('li', null, t(`daily.how.${n}`)))),
    h('button', { type: 'button', class: 'btn primary', id: 'dc-help-go', onclick: () => { audio.click(); lsSet(SEEN_KEY, 1); closeSheet(); } }, t('daily.how.go'))));
}
function countdown() {
  const d = new Date(), m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), s = Math.max(0, Math.floor((m - d) / 1000));
  const z = (n) => String(n).padStart(2, '0');
  return `${z(Math.floor(s / 3600))}:${z(Math.floor(s / 60) % 60)}:${z(s % 60)}`;
}
function openResult() {
  openSheet('result', () => {
    const tot = totals(run.stages, run.state.shots), stats = lsGet(STATS_KEY);
    const ballsLabel = t('daily.result.balls', { n: tot.balls });
    const text = shareText(t('daily.share.name'), DAY.n, tot, ballsLabel);
    const ta = h('textarea', { id: 'dc-share', readonly: true, rows: '3' }); ta.value = text;
    const copyBtn = h('button', { type: 'button', class: 'btn primary', id: 'dc-copy' }, t('daily.result.copy'));
    copyBtn.addEventListener('click', () => {
      audio.click();
      const fallback = () => { ta.focus(); ta.select(); copyBtn.textContent = t('daily.result.select'); };
      try { navigator.clipboard.writeText(text).then(() => { copyBtn.textContent = t('daily.result.copied'); }, fallback); } catch (e) { fallback(); }
    });
    return h('div', { class: 'panel dc-panel' },
      h('h2', null, `${t('daily.result.daily')} #${DAY.n}`),
      h('div', { class: 'dc-big' }, String(tot.total), h('small', null, `/${STAGES * 100}`)),
      h('div', { class: 'dc-emoji' }, tot.emoji),
      h('ul', { class: 'dc-rows' }, run.stages.map((g, k) => h('li', null, h('span', null, emojiFor(tot.per[k])), h('b', null, g.def.name[L()]), h('i', null, String(tot.per[k]))))),
      h('div', { class: 'dc-meta' }, ballsLabel + (stats ? ` · ${t('daily.result.stats', { s: stats.streak, b: stats.best })}` : '')),
      ta,
      h('div', { class: 'dc-btns' }, copyBtn, h('button', { type: 'button', class: 'btn', id: 'dc-to-list', onclick: () => { audio.click(); openList(); } }, t('daily.result.list'))),
      h('div', { class: 'dc-meta', id: 'dc-count' }, t('daily.result.nextIn', { t: countdown() })));
  });
}
function openList() {
  openSheet('list', () => {
    const today = new Set(pickDay(DAY.key)), bests = lsGet(PRAC_KEY) || {};
    return h('div', { class: 'panel dc-panel wide' },
      h('div', { class: 'dc-list-h' }, h('h2', null, t('daily.list.title')),
        h('button', { type: 'button', class: 'btn primary', id: 'dc-back-today', onclick: () => { audio.click(); startDaily(); } }, t('daily.list.back'))),
      h('p', { class: 'dc-meta' }, t('daily.list.sub')),
      h('div', { class: 'dc-list' }, CHALLENGES.map((c, i) => h('button', { type: 'button', class: 'dc-item', 'data-id': c.id, onclick: () => { audio.click(); startPractice(c.id); } },
        h('i', null, String(i + 1)),
        h('span', null, h('b', null, c.name[L()]), h('small', null, c.how[L()])),
        h('em', { class: `t${c.tier}` }, t(`daily.list.tier${c.tier}`), today.has(c.id) ? ` · ${t('daily.list.today')}` : '', bests[c.id] != null ? h('u', null, t('daily.list.best', { n: bests[c.id] })) : null)))));
  });
}
function openPracticeDone() {
  openSheet('practice', () => {
    const score = stageScore(cur.st, shotsNow());
    return h('div', { class: 'panel dc-panel narrow' },
      h('h2', null, cur.def.name[L()]),
      h('div', { class: 'dc-big' }, String(score), h('small', null, '/100')),
      h('div', { class: 'dc-emoji' }, emojiFor(score)),
      h('div', { class: 'dc-meta' }, t('daily.result.possible', { n: cur.st.solved })),
      h('div', { class: 'dc-btns col' },
        h('button', { type: 'button', class: 'btn primary', id: 'dc-again', onclick: () => { audio.click(); startPractice(cur.def.id); } }, t('daily.prac.again')),
        h('button', { type: 'button', class: 'btn', id: 'dc-same', onclick: () => { audio.click(); startPractice(cur.def.id, run.seed); } }, t('daily.prac.same')),
        h('button', { type: 'button', class: 'btn', onclick: () => { audio.click(); openList(); } }, t('daily.prac.list')),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { audio.click(); startDaily(); } }, t('daily.list.back'))));
  });
}
setInterval(() => {
  const el = document.getElementById('dc-count');
  if (el) el.textContent = t('daily.result.nextIn', { t: countdown() });
  const d = dayInfo();
  if (d.key !== DAY.key && run && run.kind === 'daily' && (run.state.done || usedTotal() === 0)) { DAY = d; startDaily(); }   // a new day started
}, 1000);
const usedTotal = () => run.state.shots.reduce((a, b) => a + b.length, 0);

// ------------------------------------------------------------------ runs
function startDaily() {
  closeSheet();
  DAY = dayInfo();
  run = { kind: 'daily', stages: genDay(DAY.key), state: loadDay(DAY.key) };
  enterStage(Math.min(run.state.stage, STAGES - 1));
  if (run.state.done) openResult();
  else if (!lsGet(SEEN_KEY)) openHelp();
}
function startPractice(id, seed) {
  closeSheet();
  const def = BY_ID[id];
  seed = seed || `practice-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  run = { kind: 'practice', seed, stages: [{ def, st: genStage(def, seed) }], state: { stage: 0, shots: [[]], done: false } };
  enterStage(0);
}
function save() { if (run.kind === 'daily') lsSet(saveKey(DAY.key), run.state); }

function enterStage(i) {
  clearTimeout(advanceTimer);
  run.state.stage = i;
  cur = run.stages[i];
  const st = cur.st;
  shotIdx = 0; clock = 0; drag = null; aim = null; fl = null; free = null; pendingStatic = null;
  inc = st.inc ? { tick: -1, wait: 1.4, pending: null, whiff: false } : null;
  hum = { name: 'ready', t: 0, side: 'forehand' }; humEmotion = 'neutral'; humFacing = 0;
  others.length = 0;
  st.defs.forEach((d, k) => others.push({ id: 2 + k, x: d.x, z: d.z, anim: { name: 'ready', t: k * 0.7, side: 'forehand' }, kind: 'def' }));
  if (st.feeder) others.push({ id: 1, x: st.feeder.x, z: st.feeder.z, anim: { name: 'ready', t: 0, side: 'forehand' }, kind: 'feeder' });
  props.setStage(st);
  props.setMarks(shotsNow().filter((b) => b.x != null));
  view.fx.clear(); view.setCue(0);
  setMode(stageOver() || run.state.done ? 'wait' : 'aim');
  ui.sling.classList.add('hidden'); ui.power.classList.add('hidden');
  renderHud();
  fitCamera(true);
}
function setMode(m) { mode = m; modeT = 0; }

function advance() {
  clearTimeout(advanceTimer);
  if (mode === 'swing' || mode === 'fly' || mode === 'after') return;
  if (run.state.done) { if (run.kind === 'daily') openResult(); else openPracticeDone(); return; }
  if (usedNow() === 0) return;
  if (stageIndex() >= run.stages.length - 1) {
    run.state.done = true; save();
    if (run.kind === 'daily') { updateStats(DAY.n, totals(run.stages, run.state.shots).total); audio.jingle(true); openResult(); }
    else {
      const bests = lsGet(PRAC_KEY) || {}, s = stageScore(cur.st, shotsNow());
      if (bests[cur.def.id] == null || s > bests[cur.def.id]) { bests[cur.def.id] = s; lsSet(PRAC_KEY, bests); }
      openPracticeDone();
    }
    renderHud();
    return;
  }
  save();
  enterStage(stageIndex() + 1);
  save();
}

// ------------------------------------------------------------------ camera
const _v = new THREE.Vector3(), _probe = new THREE.PerspectiveCamera();
function fitPoints() {
  const st = cur.st, pts = [];
  pts.push([st.player.x, 0, st.player.z + 0.3], [st.player.x, 1.95, st.player.z], [st.hit.x, st.hit.y, st.hit.z]);
  for (const tg of st.targets) {
    const a = tg.move ? tg.move.A : 0, r = tg.strip ? tg.strip.w / 2 : Math.min(1.2, tg.full + 0.7 * (tg.zero - tg.full));
    pts.push([tg.x - a - r, 0, tg.z], [tg.x + a + r, 0, tg.z], [tg.x, 0, tg.z - Math.min(r, 0.8)], [tg.x, 1.2, tg.z]);
  }
  for (const d of st.defs) pts.push([d.x - d.r, 0, d.z], [d.x + d.r, 0, d.z], [d.x, d.h, d.z]);
  if (st.feeder) pts.push([st.feeder.x, 1.9, st.feeder.z], [st.feeder.x, 0, st.feeder.z]);
  if (st.inc) { let top = st.inc.pts[0]; for (const q of st.inc.pts) if (q.y > top.y) top = q; pts.push([top.x, Math.min(top.y, 4.2), top.z]); }
  if (st.shots[0].key === 'lob') pts.push([(st.hit.x + st.targets[0].x) / 2, 3.4, 0]);
  return pts;
}
function fitCamera(snap) {
  if (!cur) return;
  const st = cur.st, W = canvas.clientWidth || 400, H = canvas.clientHeight || 800, aspect = W / H;
  // keep the action clear of the card (portrait) and the bottom controls; on wide screens the card sits to the side
  const topPx = (aspect > 1.2 ? ui.top.getBoundingClientRect().bottom : ui.card.getBoundingClientRect().bottom) + 8, botPx = H - ui.bottom.getBoundingClientRect().top + (aspect > 1.2 ? 8 : 34);
  const yMax = 1 - (2 * clamp(topPx, 0, H * 0.4)) / H, yMin = -1 + (2 * clamp(botPx, 0, H * 0.4)) / H;
  const fov = aspect < 0.8 ? 46 : aspect < 1.3 ? 42 : 36;
  const pts = fitPoints();
  let cx = 0, cz = 0; for (const tg of st.targets) { cx += tg.x; cz += tg.z; } cx /= st.targets.length; cz /= st.targets.length;
  const yaw = clamp(Math.atan2(st.player.x - cx, st.player.z - cz), -0.42, 0.42);
  _probe.fov = fov; _probe.aspect = aspect; _probe.near = 0.1; _probe.far = 600; _probe.updateProjectionMatrix();
  let best = null;
  for (let d = 6.5; d <= 34 && !best; d += 0.35) {
    for (const lf of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const px = st.player.x + Math.sin(yaw) * d, pz = st.player.z + Math.cos(yaw) * d, py = 2.0 + (aspect > 1.2 ? 0.45 : 0.6) * d;
      const tx = st.player.x + (cx - st.player.x) * lf, tz = st.player.z + (cz - st.player.z) * lf;
      _probe.position.set(px, py, pz); _probe.lookAt(tx, 0.5, tz); _probe.updateMatrixWorld(true);
      let ok = true;
      for (const q of pts) {
        _v.set(q[0], q[1], q[2]).project(_probe);
        if (_v.z > 1 || Math.abs(_v.x) > 0.88 || _v.y > yMax || _v.y < yMin) { ok = false; break; }
      }
      if (ok) { best = { px, py, pz, tx, tz }; break; }
    }
  }
  if (!best) { const d = 26; best = { px: st.player.x * 0.5, py: 2.0 + 0.6 * d, pz: st.player.z + d, tx: 0, tz: 0 }; }
  cam.wantPos.set(best.px, best.py, best.pz); cam.wantTgt.set(best.tx, 0.5, best.tz); cam.wantFov = fov;
  if (snap && !cam.init) { cam.pos.copy(cam.wantPos); cam.tgt.copy(cam.wantTgt); cam.fov = fov; cam.init = true; }
  applyCamera(0);
}
function applyCamera(dt) {
  const k = dt > 0 ? 1 - Math.exp(-3.2 * dt) : 0;
  cam.pos.lerp(cam.wantPos, k); cam.tgt.lerp(cam.wantTgt, k); cam.fov += (cam.wantFov - cam.fov) * k;
  view.setCameraOverride({ position: [cam.pos.x, cam.pos.y, cam.pos.z], target: [cam.tgt.x, cam.tgt.y, cam.tgt.z], fov: cam.fov });
}

// ------------------------------------------------------------------ aiming (pull back and release)
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
function computeAim() {
  if (!drag) return null;
  const dx = drag.x - drag.sx, dy = drag.y - drag.sy, len = Math.hypot(dx, dy);
  const H = canvas.clientHeight, W = canvas.clientWidth;
  const maxLen = Math.min(H * 0.3, 230);
  if (len < 16) return null;
  const ux = -dx / len, uy = -dy / len;       // the ball goes opposite to the pull (screen space)
  if (uy > -0.12) return null;                // must aim up the screen
  // screen direction -> ground direction: project the contact point, step along the aim on screen, drop back onto the ground
  const st = cur.st, cam3 = view.camera;
  _v.set(st.hit.x, 0, st.hit.z).project(cam3);
  const sx = (_v.x * 0.5 + 0.5) * W + ux * 70, sy = (-_v.y * 0.5 + 0.5) * H + uy * 70;
  _ndc.set((sx / W) * 2 - 1, -((sy / H) * 2 - 1));
  _ray.setFromCamera(_ndc, cam3);
  const o = _ray.ray.origin, dir = _ray.ray.direction;
  let ang;
  if (dir.y < -1e-3) {
    const k = -o.y / dir.y, gx = o.x + dir.x * k, gz = o.z + dir.z * k;
    ang = Math.atan2(gx - st.hit.x, -(gz - st.hit.z));
  } else ang = Math.atan2(ux, -uy);
  ang = clamp(ang, -1.45, 1.45);
  return { power: clamp((len - 16) / maxLen, 0, 1), ang };
}

function previewArc(a) {
  const st = cur.st, shot = st.shots[shotIdx], v = launchVel(shot, a.power, a.ang), p = { x: st.hit.x, y: st.hit.y, z: st.hit.z };
  const raw = [];
  const stopZ = st.hit.z > 0.4 ? 0 : -1e9;
  for (let i = 0; i < 260; i++) {
    stepFlight(p, v); v.x += st.wind.x * DT; v.z += st.wind.z * DT;
    if (p.y <= R || p.z <= stopZ) break;
    raw.push(p.x, p.y, p.z);
  }
  const n = raw.length / 3, out = [], dots = Math.min(14, Math.max(3, Math.round(n / 5)));
  for (let k = 1; k <= dots; k++) { const j = Math.min(n - 1, Math.round((k / dots) * (n - 1))) * 3; out.push(raw[j], raw[j + 1], raw[j + 2]); }
  return out;
}

function pt(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
canvas.addEventListener('pointerdown', (e) => {
  if (sheet || mode !== 'aim' || run.state.done || stageOver()) return;
  const p = pt(e);
  drag = { sx: p.x, sy: p.y, x: p.x, y: p.y, id: e.pointerId };
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  e.preventDefault(); renderHud();
});
canvas.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; const p = pt(e); drag.x = p.x; drag.y = p.y; });
function endDrag(fire) {
  if (!drag) return;
  const a = computeAim();
  drag = null; aim = null;
  props.setPreview(null); ui.sling.classList.add('hidden'); ui.power.classList.add('hidden');
  if (fire && a && a.power > 0.02 && mode === 'aim' && !stageOver()) release(a);
  renderHud();
}
canvas.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) endDrag(true); });
canvas.addEventListener('pointercancel', () => endDrag(false));
window.addEventListener('blur', () => endDrag(false));

// ------------------------------------------------------------------ hitting
function record(out) {
  const res = out.res;
  shotsNow().push({ s: out.score, k: res.kind, x: +res.x.toFixed(2), z: +res.z.toFixed(2) });
  save();   // saved at release: reloading the page cannot take the ball back
}
function swingAnim(shot, delay) {
  const name = shot.anim, pc = POSE_CONTACT[name] ?? 0.18;
  hum = { name, t: delay >= pc ? 0 : pc - delay, tc: Math.max(delay, pc), hit: false, side: cur.st.hit.x >= cur.st.player.x ? 'forehand' : 'backhand', shot: name };
  if (delay < pc) hum.tc = pc;
}
function release(a) {
  const st = cur.st, shot = st.shots[shotIdx], ti = targetIdx();
  humFacing = clamp(a.ang, -0.9, 0.9);
  if (!st.inc) {
    const delay = POSE_CONTACT[shot.anim] ?? 0.18;
    const out = playBall(st, cur.def, shotIdx, a.power, a.ang, ti, clock + delay, null, true);
    record(out);
    swingAnim(shot, delay);
    pendingStatic = { out, t: delay, power: a.power, P: st.hit };
    setMode('swing');
    return;
  }
  if (inc.tick < 0 || inc.pending || inc.whiff) { toast(t('daily.hint.wait')); return; }
  const c = contactAt(st, Math.floor(inc.tick));
  if (!c) {
    // swung at nothing: the ball is used up
    shotsNow().push({ s: 0, k: 'miss' }); save();
    swingAnim(shot, 0.1); inc.whiff = true; setMode('fly');
    toast(t('daily.res.miss'), 'bad'); humEmotion = 'sad';
    return;
  }
  const delay = Math.max(0, (c.tick - inc.tick) * DT);
  const out = playBall(st, cur.def, shotIdx, a.power, a.ang, ti, clock + delay, c.P, true);
  record(out);
  swingAnim(shot, delay);
  inc.pending = { out, tick: c.tick, power: a.power, P: c.P };
  setMode('swing');
}
function launch(pd) {
  const st = cur.st, shot = st.shots[shotIdx], res = pd.out.res;
  fl = { pts: res.pts, n: res.pts.length / 3, i: 0, out: pd.out };
  hum.hit = true;
  const speed = shot.v0 + pd.power * (shot.v1 - shot.v0), smash = shot.anim === 'smash';
  const ev = [{ type: 'hit', playerId: 0, pos: { x: pd.P.x, y: pd.P.y, z: pd.P.z }, shot: shot.anim, power: clamp(speed / 20, 0.15, 1), speed, tick: Math.round(simTime * 120), atp: !!st.atp }];
  view.onEvents(ev); audio.onEvents(ev);
  if (smash) buzz(18); else buzz(8);
  setMode('fly');
}
function land() {
  const out = fl.out, res = out.res, st = cur.st;
  const pos = new THREE.Vector3(res.x, Math.max(res.y, 0.05), res.z);
  fl = null;
  // what the ball does after the scored contact (cosmetic)
  const v = { x: res.v.x, y: res.v.y, z: res.v.z };
  if (res.kind === 'net') { view.court.netWobble = 1; audio.net(); v.x *= 0.1; v.y = 0.3; v.z = 0.6; }
  else if (res.kind === 'block') {
    audio.pop(0.5, res.x); v.x *= -0.2; v.z = Math.abs(v.z) * 0.35 + 2; v.y = 1.5;
    let near = null; for (const o of others) if (o.kind === 'def' && (!near || Math.hypot(o.x - res.x, o.z - res.z) < Math.hypot(near.x - res.x, near.z - res.z))) near = o;
    if (near) near.anim = { name: 'volley', t: POSE_CONTACT.volley, side: res.x >= near.x ? 'backhand' : 'forehand' };
    view.fx.spark(pos, 0.5, false);
  } else if (res.kind === 'bucket') { audio.bounce(9, res.x); audio.jingle(true); view.fx.confetti(pos.clone().setY(1), 40); }
  else { bounceVel(v, 0); audio.bounce(Math.hypot(res.v.x, res.v.y, res.v.z), res.x); view.fx.dust(res.x, res.z, 6); }
  free = res.kind === 'bucket' ? null : { p: { x: res.x, y: Math.max(res.y, R), z: res.z }, v, t: 0 };
  // score feedback
  const good = isGood(res), s = out.score;
  let label, cls = '';
  if (!good) { label = t(`daily.res.${res.kind}`); cls = 'bad'; }
  else if (res.kind === 'bucket') { label = t('daily.res.bucket'); cls = 'top'; }
  else if (s === 100) { label = t('daily.res.bull'); cls = 'top'; }
  else label = t('daily.res.pts', { n: s });
  toast(label, cls);
  view.fx.text(good ? `+${s}` : ({ net: 'NET!', out: 'OUT!', block: 'BLOCKED!', short: 'SHORT!', fault: 'FAULT!' })[res.kind] || 'MISS', pos.clone().setY(pos.y + 0.5), good ? (s >= 90 ? '#8cff6a' : s >= 60 ? '#ffe14a' : '#ffb347') : '#ff5a5a', 1.25);
  if (good && s >= 90) { view.court.cheer(s === 100 ? 1.2 : 0.7); audio.cheer(s === 100 ? 1.1 : 0.6); if (s === 100) view.fx.confetti(pos.clone().setY(1.6), 34); }
  else if (good && s >= 60) { view.court.cheer(0.3); }
  humEmotion = good && s >= 60 ? 'happy' : s === 0 ? 'sad' : 'neutral';
  if (good && s < 100 && res.kind !== 'bucket') props.setMarks(shotsNow().filter((b) => b.x != null && b.s > 0));
  setMode('after');
  renderHud();
}
function ballDone() {
  free = null;
  if (inc) { inc.tick = -1; inc.wait = 1.0; inc.pending = null; inc.whiff = false; }
  if (stageOver()) {
    setMode('wait');
    if (cur.st.agg === 'best' && shotsNow().some((b) => b.s === 100)) hum = { name: 'celebrate', t: 0, side: 'forehand' };
    advanceTimer = setTimeout(advance, 1500);
  } else { setMode('aim'); humEmotion = 'neutral'; }
  renderHud();
}

// ------------------------------------------------------------------ frame
function setBall(x, y, z, dt) {
  if (ball.visible && dt > 0) { ball.vel.x = (x - lastBall.x) / dt; ball.vel.y = (y - lastBall.y) / dt; ball.vel.z = (z - lastBall.z) / dt; }
  else { ball.vel.x = ball.vel.y = ball.vel.z = 0; }
  ball.pos.x = x; ball.pos.y = y; ball.pos.z = z; ball.visible = true;
  lastBall.x = x; lastBall.y = y; lastBall.z = z;
}
function lerpPts(pts, n, f) {
  const i = Math.min(n - 1, Math.floor(f)), j = Math.min(n - 1, i + 1), u = clamp(f - i, 0, 1);
  return [pts[i * 3] + (pts[j * 3] - pts[i * 3]) * u, pts[i * 3 + 1] + (pts[j * 3 + 1] - pts[i * 3 + 1]) * u, pts[i * 3 + 2] + (pts[j * 3 + 2] - pts[i * 3 + 2]) * u];
}

function update(dt) {
  const st = cur.st;
  clock += dt; simTime += dt; modeT += dt;
  let shown = false;

  // the player's swing on a self-fed ball
  if (pendingStatic) {
    pendingStatic.t -= dt;
    if (pendingStatic.t <= 0) { const pd = pendingStatic; pendingStatic = null; launch(pd); }
  }
  // incoming ball
  if (inc) {
    if (inc.tick < 0) {
      if (mode === 'aim') {
        inc.wait -= dt;
        if (inc.wait <= 0) {
          inc.tick = 0;
          const fd = others.find((o) => o.kind === 'feeder'), up = st.inc.vel.y > 5;
          if (fd) fd.anim = { name: up ? 'lob' : st.id === 'deep-return' ? 'serve' : 'drive', t: 0.17, side: 'forehand' };
          audio.pop(0.5, st.inc.from.x);
        }
      }
    } else {
      inc.tick += dt / DT;
      const P = st.inc.pts;
      if (inc.pending && inc.tick >= inc.pending.tick) { const pd = inc.pending; inc.pending = null; inc.tick = -2; launch(pd); }
      else if (inc.tick >= P.length - 1) {
        // the ball went by
        const whiff = inc.whiff;
        inc.tick = -1; inc.wait = 0.9; inc.whiff = false;
        if (whiff) ballDone();
      } else {
        const i = Math.floor(inc.tick), a = P[i], b = P[Math.min(P.length - 1, i + 1)], u = inc.tick - i;
        if (i > 0 && a.b > P[i - 1].b && !inc._b) { audio.bounce(6, a.x); view.fx.dust(a.x, a.z, 5); }
        inc._b = i > 0 && a.b > P[i - 1].b;
        setBall(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u, dt); shown = true;
        // timing cue on the player's ring: amber = coming, green = swing now
        const early = Math.round(EARLY / DT);
        view.setCue(inc.pending || inc.whiff ? 0 : (i >= st.inc.w0 && i <= st.inc.w1) ? 4 : (i >= st.inc.w0 - early && i < st.inc.w0) ? 2 : i < st.inc.w0 ? 1 : 3);
      }
    }
    if (inc.tick < 0) view.setCue(0);
  }
  // player's ball
  if (fl) {
    fl.i += dt / DT;
    if (fl.i >= fl.n - 1) { const p = lerpPts(fl.pts, fl.n, fl.n - 1); setBall(p[0], p[1], p[2], dt); shown = true; land(); }
    else { const p = lerpPts(fl.pts, fl.n, fl.i); setBall(p[0], p[1], p[2], dt); shown = true; }
  } else if (free) {
    free.t += dt;
    let steps = Math.min(12, Math.round(dt / DT));
    while (steps-- > 0) {
      stepFlight(free.p, free.v);
      if (free.p.y <= R && free.v.y < 0) { free.p.y = R; bounceVel(free.v, 0); if (free.v.y < 0.6) { free.v.y = 0; free.v.x *= 0.9; free.v.z *= 0.9; } }
      if (free.p.y < R) free.p.y = R;
    }
    setBall(free.p.x, free.p.y, free.p.z, dt); shown = true;
  }
  if (mode === 'after' && modeT > (cur.st.agg === 'avg' || stageOver() ? 1.0 : 0.75)) ballDone();
  // a self-fed ball waits in front of the player
  if (!shown && !st.inc && (mode === 'aim' || mode === 'swing') && !stageOver()) {
    setBall(st.hit.x, st.hit.y + (mode === 'aim' ? 0.03 * Math.sin(simTime * 4) : 0), st.hit.z, 0); shown = true;
  }
  if (!shown) ball.visible = false;

  // aiming
  if (drag && mode === 'aim') {
    aim = computeAim();
    const W = canvas.clientWidth, H = canvas.clientHeight;
    ui.sling.classList.remove('hidden');
    ui.sling.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const [ln, c0, c1] = ui.sling.children;
    ln.setAttribute('x1', drag.sx); ln.setAttribute('y1', drag.sy); ln.setAttribute('x2', drag.x); ln.setAttribute('y2', drag.y);
    c0.setAttribute('cx', drag.sx); c0.setAttribute('cy', drag.sy); c1.setAttribute('cx', drag.x); c1.setAttribute('cy', drag.y);
    ui.sling.classList.toggle('off', !aim);
    if (aim) {
      props.setPreview(previewArc(aim), st.hit, aim.ang, 1.2 + aim.power * 1.6);
      humFacing += (clamp(aim.ang, -0.9, 0.9) - humFacing) * Math.min(1, dt * 10);
      ui.power.classList.remove('hidden');
      ui.power.firstChild.style.width = `${Math.round(aim.power * 100)}%`;
      ui.power.lastChild.textContent = `${Math.round(aim.power * 100)}%`;
    } else { props.setPreview(null); ui.power.classList.add('hidden'); }
  }

  // characters
  hum.t += dt;
  if (hum.name !== 'ready' && hum.name !== 'celebrate' && hum.t > (ANIM_DURATION[hum.name] || 0.5)) hum = { name: 'ready', t: 0, side: hum.side };
  for (const o of others) { o.anim.t += dt; if (o.anim.name !== 'ready' && o.anim.t > (ANIM_DURATION[o.anim.name] || 0.5)) o.anim = { name: 'ready', t: 0, side: 'forehand' }; }
  props.update(clock, shownTarget(), simTime);
  applyCamera(dt);
}

const state = { time: 0, tick: 0, players: [], ball };
function buildState() {
  const st = cur.st;
  state.time = simTime; state.tick = Math.round(simTime * 120);
  const list = [{ id: 0, team: 0, controller: 'human', handed: 'R', pos: { x: st.player.x, z: st.player.z }, vel: { x: 0, z: 0 }, facing: humFacing, anim: hum, emotion: humEmotion }];
  for (const o of others) list.push({ id: o.id, team: 1, controller: 'ai', handed: 'R', pos: { x: o.x, z: o.z }, vel: { x: 0, z: 0 }, facing: Math.PI, anim: o.anim, emotion: 'focused' });
  state.players = list;
  return state;
}

// ------------------------------------------------------------------ top-down map
function drawMap() {
  const c = ui.map, dpr = Math.min(2, window.devicePixelRatio || 1), cw = c.clientWidth, ch = c.clientHeight;
  if (!cw || !ch) return;
  if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
  const g = c.getContext('2d'), st = cur.st;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
  const x0 = -5.1, x1 = 5.1, z0 = -7.6, z1 = 8.0, s = Math.min(cw / (x1 - x0), ch / (z1 - z0));
  const X = (x) => cw / 2 + x * s, Z = (z) => (z - z0) * s + (ch - (z1 - z0) * s) / 2;
  const HW = COURT.halfW, HL = COURT.halfL, K = COURT.kitchen;
  g.fillStyle = '#2f6fb1'; g.fillRect(X(-HW), Z(-HL), 2 * HW * s, 2 * HL * s);
  g.fillStyle = '#255a92'; g.fillRect(X(-HW), Z(-K), 2 * HW * s, 2 * K * s);
  g.strokeStyle = '#f4f1e6'; g.lineWidth = 1;
  g.strokeRect(X(-HW), Z(-HL), 2 * HW * s, 2 * HL * s);
  const ln = (a, b, cc, d) => { g.beginPath(); g.moveTo(X(a), Z(b)); g.lineTo(X(cc), Z(d)); g.stroke(); };
  ln(-HW, -K, HW, -K); ln(-HW, K, HW, K); ln(0, -HL, 0, -K); ln(0, K, 0, HL);
  g.lineWidth = 2.5; ln(-COURT.postX, 0, COURT.postX, 0);
  // targets
  st.targets.forEach((tg0, i) => {
    if (st.agg === 'avg' && i < shownTarget()) return;
    const tg = targetAt(tg0, clock), on = st.agg !== 'avg' || i === shownTarget();
    g.globalAlpha = on ? 1 : 0.45;
    if (tg.strip) { g.fillStyle = '#ff5a3c'; g.fillRect(X(tg.x - tg.strip.w / 2), Z(tg.z - tg.strip.d / 2), tg.strip.w * s, tg.strip.d * s); }
    else {
      g.fillStyle = 'rgba(255,90,60,.35)'; g.beginPath(); g.arc(X(tg.x), Z(tg.z), Math.max(4, (tg.full + 0.7 * (tg.zero - tg.full)) * s), 0, 7); g.fill();
      g.fillStyle = '#ff3b1f'; g.beginPath(); g.arc(X(tg.x), Z(tg.z), Math.max(2.2, tg.full * s), 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  });
  for (const d of st.defs) {
    g.strokeStyle = '#ff8fa3'; g.lineWidth = 1; g.setLineDash([2, 2]); g.beginPath(); g.arc(X(d.x), Z(d.z), d.r * s, 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ff4d6a'; g.beginPath(); g.arc(X(d.x), Z(d.z), 2.6, 0, 7); g.fill();
  }
  if (st.feeder) { g.fillStyle = '#c9a8ff'; g.beginPath(); g.arc(X(st.feeder.x), Z(st.feeder.z), 2.6, 0, 7); g.fill(); }
  for (const b of shotsNow()) if (b.x != null && b.k !== 'net' && b.k !== 'block') {
    g.strokeStyle = '#fff'; g.lineWidth = 1.2; const px = X(b.x), pz = Z(b.z);
    g.beginPath(); g.moveTo(px - 2.5, pz - 2.5); g.lineTo(px + 2.5, pz + 2.5); g.moveTo(px + 2.5, pz - 2.5); g.lineTo(px - 2.5, pz + 2.5); g.stroke();
  }
  g.fillStyle = '#fff'; g.beginPath(); g.arc(X(st.player.x), Z(st.player.z), 3.2, 0, 7); g.fill();
  if (aim && drag) {
    g.strokeStyle = '#e8ff55'; g.lineWidth = 1.5; const l = 2 + aim.power * 5;
    g.beginPath(); g.moveTo(X(st.hit.x), Z(st.hit.z)); g.lineTo(X(st.hit.x + Math.sin(aim.ang) * l), Z(st.hit.z - Math.cos(aim.ang) * l)); g.stroke();
  }
  if (ball.visible) { g.fillStyle = '#e8ff55'; g.beginPath(); g.arc(X(ball.pos.x), Z(ball.pos.z), 2.4, 0, 7); g.fill(); }
  const ws = Math.hypot(st.wind.x, st.wind.z);
  if (ws > 0.3) {
    const ax = X(0), az = Z(-HL) - 0.1, ux = st.wind.x / ws, uz = st.wind.z / ws, l = 9;
    g.strokeStyle = '#e8ff55'; g.fillStyle = '#e8ff55'; g.lineWidth = 2;
    const cx = cw - 13, cy = 13;
    g.beginPath(); g.moveTo(cx - ux * l, cy - uz * l); g.lineTo(cx + ux * l, cy + uz * l); g.stroke();
    g.beginPath(); g.moveTo(cx + ux * l, cy + uz * l); g.lineTo(cx + ux * (l - 6) - uz * 4, cy + uz * (l - 6) + ux * 4); g.lineTo(cx + ux * (l - 6) + uz * 4, cy + uz * (l - 6) - ux * 4); g.fill();
    void ax; void az;
  }
}

// ------------------------------------------------------------------ loop
let lastT = 0, paused = false;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000; lastT = now;
  if (!(dt > 0)) return;
  dt = Math.min(dt, 0.05);
  if (paused || !cur) return;
  if (!sheet || sheet.name !== 'help') update(dt * timeScale);
  view.update(buildState(), dt);
  view.render();
  drawMap();
}
let timeScale = 1;
document.addEventListener('visibilitychange', () => { paused = document.hidden; if (paused) audio.suspend(); else { audio.resume(); lastT = performance.now(); } });
let rz = 0;
function onResize() { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { view.resize(); cam.init = false; fitCamera(true); }); }
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheet && sheet.name !== 'result') { if (sheet.name === 'help') lsSet(SEEN_KEY, 1); closeSheet(); }
  if (!sheet && /^[1-3]$/.test(e.key) && cur && cur.st.shots[+e.key - 1]) { shotIdx = +e.key - 1; renderHud(); }
  if (!sheet && (e.key === 'Enter' || e.key === 'n')) advance();
});

// ------------------------------------------------------------------ boot
buildUI();
view.setup({ players: [] });
const bootId = (() => { try { return new URLSearchParams(location.search).get('practice'); } catch (e) { return null; } })();
if (bootId && BY_ID[bootId]) { lsSet(SEEN_KEY, 1); startPractice(bootId, new URLSearchParams(location.search).get('seed') || undefined); }
else startDaily();
requestAnimationFrame((n) => { lastT = n; requestAnimationFrame(frame); });

// debug hook for the automated playtests (same idea as window.__game in the main shell)
window.__daily = {
  get run() { return run; }, get cur() { return cur; }, get mode() { return mode; }, get inc() { return inc; }, get day() { return DAY; },
  get cam() { return cam; }, view, startPractice, startDaily, advance, openList, openResult,
  setTimeScale(v) { timeScale = v; },
  /** screen-space drag (dx, dy from the start point) that produces the given aim, for scripted play */
  solveDrag(power, ang) {
    const H = canvas.clientHeight, maxLen = Math.min(H * 0.3, 230), len = 16 + power * maxLen;
    let bestD = null, bestErr = 9;
    for (let a = -1.4; a <= 1.4; a += 0.002) {
      drag = { sx: 200, sy: 300, x: 200 - Math.sin(a) * len, y: 300 + Math.cos(a) * len };
      const r = computeAim();
      if (r && Math.abs(r.ang - ang) < bestErr) { bestErr = Math.abs(r.ang - ang); bestD = { dx: -Math.sin(a) * len, dy: Math.cos(a) * len }; }
    }
    drag = null;
    return bestD;
  },
};
