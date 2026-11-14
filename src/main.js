// Game shell: fixed-timestep loop, input, HUD, menus, audio, voice, replay, debug hook.
import { createSim, DT, pressOutcome } from './sim/index.js';
import { predictPath } from './sim/physics.js';
import { reachDist } from './sim/util.js';
import { REACH } from './sim/constants.js';
import { createView } from './render/index.js';
import { createInput } from './input.js';
import { createReplayBuffer } from './replay.js';
import { createHud } from './ui/hud.js';
import { createMenus } from './ui/menu.js';
import { createAudio } from './ui/audio.js';
import { createVoice } from './ui/voice.js';
import { loadSettings, saveSettings } from './ui/store.js';
import { teamLabel } from './ui/text.js';
import { createTouch, installPageGuards } from './ui/touch.js';
import { createWakeLock } from './ui/wake.js';
import { initDevice, isTouchUI, isCoarse, onUIModeChange, toggleFullscreen, isFullscreen, buzz } from './ui/device.js';
import { t, has, playerName, setLang, getLang, detectLang, isLang, onLangChange, applyStatic } from './ui/i18n.js';

const $ = (s) => document.querySelector(s);
const MAX_STEPS = 40;            // never simulate more than this per rendered frame (no spiral of death)
const MAX_FRAME_DT = 0.25;       // clamp big gaps (tab switch, breakpoint)
const SWING_ANIMS = new Set(['drive', 'drop', 'dink', 'lob', 'smash', 'volley', 'serve']);
const HUMAN = 0;
const FAULT_KEYS = { out: 1, net: 1, doubleBounce: 1, kitchen: 1, twoBounceRule: 1, serveShort: 1, serveWrongCourt: 1, bodyHit: 1 };
const DETAIL_KEYS = new Set(['kitchen', 'twoBounceRule', 'serveShort', 'serveWrongCourt']);   // faults with an extra rule line

// ------------------------------------------------------------------ setup
initDevice();          // touch UI vs keyboard UI: starts from (pointer: coarse), then follows the last input type used
installPageGuards();   // no scroll / rubber-band / pinch / long-press menus outside scrollable panels
const settings = loadSettings();
// language: stored choice, else zh-* browsers get Traditional Chinese and everything else English
// (a ?lang=en / ?lang=zh-TW link, used by the guide pages' "Play now" buttons, wins over both for this visit)
const urlLang = (() => { try { const v = new URLSearchParams(location.search).get('lang') || ''; return /^zh/i.test(v) ? 'zh-TW' : /^en/i.test(v) ? 'en' : null; } catch (e) { return null; } })();
setLang(urlLang || (isLang(settings.lang) ? settings.lang : detectLang()), { silent: true });
applyStatic();
const canvas = $('#game');
const hud = createHud($('#hudroot'));
const audio = createAudio();
const voice = createVoice();
const wake = createWakeLock();
const replayBuf = createReplayBuffer();
let view = null, viewQuality = settings.quality;
try {
  // multisampling is fixed at context creation: skip it for the low preset on touch devices (phones are fill-rate bound)
  view = createView(canvas, { quality: settings.quality, antialias: !(settings.quality === 'low' && isCoarse()), preserveDrawingBuffer: /[?&]pdb=1/.test(location.search) });
} catch (err) {
  console.error('WebGL init failed', err);
  document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#fff;font:18px system-ui;text-align:center;padding:24px">${t('app.noWebgl')}</div>`);
  throw err;
}

const G = {
  mode: 'menu',          // menu | play | replay | over
  paused: false,
  sim: null, demo: true,
  config: null, lastSettings: null,
  acc: 0, timeScale: 1, frozen: false, autoplay: false,
  replay: null, replayAt: null, replayEnabled: true,
  hitStop: 0, overTimer: 0, sinceReplay: 3,
  stats: null, lastFault: null, lastHumanVolley: -99,
  evlog: [],              // debug: recent sim events (for automated playtests)
};

// WebGL context loss (mobile browsers drop it under memory pressure / when backgrounded): say so instead of a frozen canvas
function showContextLost(on) {
  let box = document.getElementById('ctxlost');
  if (!on) { if (box) box.remove(); return; }
  if (box) return;
  box = document.createElement('div');
  box.id = 'ctxlost'; box.setAttribute('role', 'alert');
  const p = document.createElement('p'); p.textContent = t('app.ctxLost');
  const b = document.createElement('button'); b.type = 'button'; b.textContent = t('app.reload');
  box.append(p, b);
  box.addEventListener('click', () => { try { location.reload(); } catch (e) { /* ignore */ } });
  document.body.append(box);
}
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.ctxLost = true; try { pause(); } catch (err) { /* ignore */ } showContextLost(true); });
canvas.addEventListener('webglcontextrestored', () => { G.ctxLost = false; showContextLost(false); idleRender = 2; });

const input = createInput({
  onEscape: () => onEscape(),
  onToggleLegend: () => setSetting('legend', !settings.legend),
  onToggleMute: () => setSetting('muted', !settings.muted),
  onSkipReplay: () => skipReplay(),
});
const touch = createTouch($('#touchroot'), input);

voice.onLine = (t) => { if (!G.demo) hud.ref(t); };
hud.pauseBtn.addEventListener('click', (e) => { e.currentTarget.blur(); audio.unlock(); pause(); });
hud.muteBtn.addEventListener('click', (e) => { e.currentTarget.blur(); setSetting('muted', !settings.muted); });
hud.legendBtn.addEventListener('click', (e) => { e.currentTarget.blur(); setSetting('legend', !settings.legend); });
if (hud.fsBtn) hud.fsBtn.addEventListener('click', (e) => { e.currentTarget.blur(); audio.unlock(); toggleFullscreen(); });
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => { hud.fsSync(); scheduleResize(); });

// ------------------------------------------------------------------ settings
function applySettings() {
  audio.setMuted(settings.muted); audio.setVolume(settings.volume);
  voice.setMuted(settings.muted); voice.setEnabled(settings.voice);
  hud.setMuteIcon(settings.muted); hud.setLegend(settings.legend);
}
function setSetting(k, v) {
  if (k === 'lang') { setLang(v); return; }   // persisted + re-rendered by the onLangChange handler below
  settings[k] = v; saveSettings(settings);
  if (k === 'quality' && v !== viewQuality) { view.setQuality(v); viewQuality = v; idleRender = 2; }
  applySettings();
  menus.syncSettings(settings);
  if (k === 'muted' || k === 'legend') audio.click();
}

// ------------------------------------------------------------------ menus
// the sim keeps stable name keys ('you', 'mate', ...); they are translated at display time
const menus = createMenus($('#screens'), {
  click: () => { audio.unlock(); audio.click(); },
  openSetup: () => menus.openSetup(settings),
  toMain: () => toMenu(),
  openHelp: (from) => menus.openHelp(from),
  closeHelp: (from) => menus.show(from === 'pause' ? 'pause' : 'main'),
  openSettings: (from) => menus.openSettings(from, settings),
  closeSettings: (from) => menus.show(from === 'pause' ? 'pause' : 'main'),
  setSetting,
  persist: (c) => { for (const k of ['mode', 'scoring', 'opp', 'mate', 'handed']) settings[k] = c[k]; saveSettings(settings); },
  quality: (v) => setSetting('quality', v),
  start: (cfg) => { for (const k of ['mode', 'scoring', 'opp', 'mate', 'handed', 'quality']) settings[k] = cfg[k]; saveSettings(settings); startMatch(cfg); },
  resume: () => resume(),
  restart: () => { startMatch(G.lastSettings || settings); },
});

// the static no-JS copy of the main menu (index.html #intro) has done its job: the live, translated menu replaces it
document.getElementById('intro')?.remove();

// ------------------------------------------------------------------ match construction
function buildConfig(o) {
  const dbl = o.mode !== 'singles';
  const humanDupr = o.humanDupr ?? 4.5;
  const players = dbl ? [
    { id: 0, team: 0, controller: 'human', dupr: humanDupr, handed: o.handed === 'L' ? 'L' : 'R', name: 'you' },
    { id: 1, team: 0, controller: 'ai', dupr: o.mate, handed: 'R', name: 'mate' },
    { id: 2, team: 1, controller: 'ai', dupr: o.opp, handed: 'R', name: 'oppA' },
    { id: 3, team: 1, controller: 'ai', dupr: o.opp, handed: 'L', name: 'oppB' },
  ] : [
    { id: 0, team: 0, controller: 'human', dupr: humanDupr, handed: o.handed === 'L' ? 'L' : 'R', name: 'you' },
    { id: 1, team: 1, controller: 'ai', dupr: o.opp, handed: 'R', name: 'opp' },
  ];
  return { mode: dbl ? 'doubles' : 'singles', scoring: o.scoring === 'rally' ? 'rally' : 'sideout', seed: o.seed ?? ((Math.random() * 2 ** 31) | 0), players };
}
function buildDemoConfig() {
  const rnd = () => (Math.random() * 2 ** 31) | 0;
  return { mode: 'doubles', scoring: 'rally', seed: rnd(), players: [
    { id: 0, team: 0, controller: 'ai', dupr: 4, handed: 'R', name: 'A' }, { id: 1, team: 0, controller: 'ai', dupr: 4, handed: 'R', name: 'B' },
    { id: 2, team: 1, controller: 'ai', dupr: 4, handed: 'R', name: 'C' }, { id: 3, team: 1, controller: 'ai', dupr: 4, handed: 'L', name: 'D' } ] };
}

function resetStats() {
  G.stats = { aces: [0, 0], winners: [0, 0], faults: [0, 0], longest: 0, rallies: 0 };
  G.lastFault = null; G.lastHumanVolley = -99;
}

function attachSim(sim, demo) {
  G.sim = sim; G.demo = demo; G.acc = 0; G.hitStop = 0; G.overTimer = 0; G.replayAt = null; G.replay = null;
  G.autoplay = false; G.sinceReplay = 3;
  replayBuf.clear(); resetStats(); G.evlog.length = 0;
  view.setup(sim.state.config);
  view.setCue && view.setCue(0);
  endReplayVisuals();
}

function startMatch(o = {}) {
  const s = { ...settings, ...o };
  G.lastSettings = { mode: s.mode, scoring: s.scoring, opp: s.opp, mate: s.mate, handed: s.handed, quality: s.quality };
  if (s.quality !== viewQuality) { view.setQuality(s.quality); viewQuality = s.quality; }
  const cfg = buildConfig({ ...s, seed: o.seed, humanDupr: o.humanDupr });
  G.config = cfg;
  voice.stop(); voice.log.length = 0;
  const sim = createSim(cfg);
  attachSim(sim, false);
  G.mode = 'play'; G.paused = false;
  wake.set(true);
  menus.hide();
  hud.setup(sim.state); hud.updateScore(sim.state); hud.show(true); hud.setLegend(settings.legend);
  input.releaseAll(); input.setEnabled(true);
  view.setCamera('play');
  if (o.autoplay) setAutoplay(true);
  hud.banner(() => [t('hud.start'), `${teamLabel(sim.state, 0)}  vs  ${teamLabel(sim.state, 1)}`], 'info', 2.4);
  handleEvents(sim.drainEvents());   // first serveReady -> score call
  document.body.classList.remove('menu');
  return sim;
}

function startDemo() {
  voice.stop();
  const sim = createSim(buildDemoConfig());
  attachSim(sim, true);
  sim.drainEvents();
  view.setCamera('menu');
}

function toMenu() {
  G.mode = 'menu'; G.paused = false; wake.set(false);
  input.setEnabled(false); input.releaseAll();
  hud.show(false); hud.clearTransient();
  startDemo();
  menus.show('main');
  document.body.classList.add('menu');
}

// ------------------------------------------------------------------ pause
function pause() {
  if (G.demo || G.paused || (G.mode !== 'play' && G.mode !== 'replay')) return;
  G.paused = true; input.releaseAll(); voice.pause(); audio.setCrowd(false); wake.set(false); menus.show('pause');
  idleRender = 2;
}
function resume() {
  if (!G.paused) return;
  G.paused = false; menus.hide(); voice.resume(); audio.setCrowd(true); input.releaseAll(); wake.set(true);
}
function onEscape() {
  const cur = menus.current;
  if (G.mode === 'menu') { if (cur && cur !== 'main') menus.show('main'); return; }
  if (G.paused) {
    if (cur === 'help' || cur === 'settings') menus.show('pause'); else resume();
    return;
  }
  if (G.mode === 'over') return;
  pause();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); audio.suspend(); } else { audio.resume(); }
});
// any key / pointer press wakes a suspended / interrupted AudioContext (not only menu clicks)
// (iOS Safari only unlocks WebAudio / speechSynthesis from touchend / pointerup / click, never from touchstart / pointerdown)
const unlockMedia = () => { audio.unlock(); voice.unlock(); };
for (const ev of ['keydown', 'pointerdown', 'pointerup', 'touchend', 'click']) window.addEventListener(ev, unlockMedia, { capture: true, passive: true });
window.addEventListener('blur', () => pause());
window.addEventListener('pagehide', () => { input.releaseAll(); pause(); });

// ------------------------------------------------------------------ helpers
function humanSwinging(state) {
  const a = state.players[HUMAN].anim;
  return SWING_ANIMS.has(a.name) && a.t < 0.4;
}

/**
 * Ring colour for the human's feet. Everything comes from the sim's own contact rule (`pressOutcome`), so the colours are honest:
 * 1 amber  = ball is coming (a press now would not reach it yet)
 * 2 green  = press NOW and you will hit it
 * 4 lime   = press NOW and the timing is perfect (paddle meets the ball ~0.17 s after the press)
 * 3 red    = swinging now would be a fault (illegal volley: two-bounce rule or standing in the kitchen)
 */
function swingCue(state) { return swingCueInfo(state).level; }
function swingCueInfo(state) {
  const none = { level: 0, tc: null };
  const p = state.players[HUMAN], b = state.ball;
  if (state.phase !== 'rally' && state.phase !== 'serve') return none;
  if (b.lastHitBy === null || state.players[b.lastHitBy].team === p.team) return none;
  if (humanSwinging(state)) return none;
  const out = pressOutcome(state, p);
  if (out) return { level: out.illegal ? 3 : (Math.abs(out.tc - 0.17) <= 0.05 ? 4 : 2), tc: out.tc };
  const pp = predictPath(b.pos, b.vel, b.bounces, state.internal.sp, 1.0, 2);
  let near = false;
  for (const m of pp.samples) {
    if (m.z < -0.05) continue;
    if (reachDist(p.pos, m) <= REACH) { near = true; break; }
  }
  return { level: near ? 1 : 0, tc: null };
}

function contextHint(state) {
  const p = state.players[HUMAN], b = state.ball, sc = state.score;
  if (state.phase === 'preServe') {
    if (p.isServer) {
      // still not served after ~8 s: pulse the hint (never auto-serve)
      if (state.phaseTime >= 8) return ['hint.serveUrge', 'urge'];
      return ['hint.serve', ''];
    }
    if (p.isReceiver) return ['hint.receive', ''];
    return [null, ''];
  }
  if (state.phase !== 'rally' && state.phase !== 'serve') return [null, ''];
  const incoming = b.lastHitBy !== null && state.players[b.lastHitBy].team !== p.team;
  const hum = b.bounces === 0;
  if (incoming && hum && state.rally.twoBounceRemaining > 0 && b.vel.z > 0) {
    return [state.rally.hits === 1 ? 'hint.twoBounce1' : 'hint.twoBounce2', 'warn'];
  }
  const inK = Math.abs(p.pos.x) <= 3.05 && Math.abs(p.pos.z) <= 2.134 + 0.15;
  if (incoming && hum && inK && state.rally.twoBounceRemaining === 0 && b.vel.z > 0) return ['hint.kitchen', 'warn'];
  if (state.time - G.lastHumanVolley < 0.6 && Math.abs(p.pos.x) <= 3.05 && Math.abs(p.pos.z) < 3.0) return ['hint.postVolley', 'warn'];
  return [null, ''];
}

// ------------------------------------------------------------------ events
function handleEvents(evs) {
  if (!evs.length) return;
  const s = G.sim.state;
  const demo = G.demo;
  if (!demo) { for (const e of evs) G.evlog.push(e); if (G.evlog.length > 3000) G.evlog.splice(0, 1000); }
  if (!demo) {
    audio.onEvents(evs);
    voice.onEvents(evs, s);
  }
  view.onEvents(evs);
  for (const e of evs) {
    if (demo) continue;
    switch (e.type) {
      case 'hit':
        if (e.playerId === HUMAN) {
          if (isTouchUI()) buzz(e.shot === 'smash' ? 28 : 12);
          hud.toast(e.isServe ? 'serve' : e.atp ? 'atp' : e.shot, e.power);
          if (e.isVolley && !e.isServe) G.lastHumanVolley = s.time;
        }
        if (e.shot === 'smash') G.hitStop = Math.max(G.hitStop, 0.07);
        break;
      case 'fault': G.lastFault = e; break;
      case 'rallyEnd': onRallyEnd(e); break;
      case 'gameOver': onGameOver(e); break;
      default: break;
    }
  }
  if (!demo) hud.updateScore(s);
}

function onRallyEnd(e) {
  const s = G.sim.state, st = G.stats, f = G.lastFault;
  st.rallies++; st.longest = Math.max(st.longest, e.hits);
  const w = e.winnerTeam;
  if (f) {
    if (f.reason === 'doubleBounce') {
      if (e.hits <= 1) st.aces[w]++; else st.winners[w]++;
    } else st.faults[f.team]++;
  }
  // banner
  const reason = f && f.reason;
  const reasonText = () => (f ? (reason in FAULT_KEYS ? t(`fault.${reason}`) : t('fault.generic')) : t('fault.point'));
  const who = f && f.playerId !== null && f.playerId !== undefined ? s.players[f.playerId].name : '';
  const hl = e.highlight && ['smash', 'atp', 'lob', 'longRally'].includes(e.highlightReason) ? e.highlightReason : null;
  const hlText = () => (hl === 'longRally' ? t('hl.longRally', { n: e.hits }) : hl ? t(`hl.${hl}`) : '');
  const detailKey = f && DETAIL_KEYS.has(reason) ? `fault.${reason}.d` : null;
  const sideOut = e.sideOut, secondServer = !e.sideOut && e.secondServer;
  const subText = () => {
    const bits = [];
    if (detailKey) bits.push(t(detailKey));
    else if (who && reason !== 'doubleBounce') bits.push(playerName(who));
    bits.push(w === 0 ? (e.pointScored ? t('point.us') : '') : (e.pointScored ? t('point.them') : ''));
    if (sideOut) bits.push(t('point.sideOut')); else if (secondServer) bits.push(t('point.secondServer'));
    if (hl) bits.unshift(hlText());
    return bits.filter(Boolean).join(' · ');
  };
  const kind = e.winnerTeam === 0 ? 'good' : 'fault';
  hud.banner(() => [reason === 'doubleBounce' && e.winnerTeam === 0 && hl ? hlText() : reasonText(), subText()], kind, 2.3);
  G.lastFault = null;
  // replays are a treat, not a chore: at most one per 3 rallies unless it is a standout moment
  G.sinceReplay++;
  const standout = e.highlightReason === 'atp' || e.highlightReason === 'gamePoint' || e.highlightReason === 'smash';
  if (e.highlight && G.replayEnabled && (G.sinceReplay >= 3 || standout)) { G.replayAt = s.time + 0.8; G.sinceReplay = 0; }
  else G.replayAt = null;
}

function onGameOver() {
  G.overTimer = 1.7;
  G.replayAt = null;
}

function showGameOver() {
  const s = G.sim.state;
  G.mode = 'over'; wake.set(false);
  input.setEnabled(false); input.releaseAll();
  hud.clearTransient();
  menus.gameOver({ winner: s.score.winner, points: s.score.points.slice(), names: () => [teamLabel(s, 0), teamLabel(s, 1)], stats: G.stats });
}

// ------------------------------------------------------------------ replay
function startReplay() {
  G.replayAt = null;
  const pb = replayBuf.makePlayback();
  if (!pb) return false;
  G.replay = pb; G.mode = 'replay';
  input.setEnabled(false); input.releaseAll();
  document.body.classList.add('replay');
  $('.replay-banner').classList.remove('hidden'); $('.replay-skip').classList.remove('hidden');
  hud.clearTransient();
  view.setCamera('replay');
  return true;
}
function endReplayVisuals() {
  document.body.classList.remove('replay');
  $('.replay-banner').classList.add('hidden'); $('.replay-skip').classList.add('hidden');
}
function skipReplay() {
  if (G.mode !== 'replay') return;
  G.replay = null; G.mode = 'play';
  endReplayVisuals();
  view.setCamera('play');
  input.setEnabled(true);
  G.sim.skipPointOver();
  G.acc = 0;
}
// only a click on the bare game area skips the replay (not buttons / menu panels, so "Resume" resumes the replay)
$('#ui').addEventListener('click', (e) => {
  if (G.mode !== 'replay' || G.paused) return;
  if (e.target.closest && e.target.closest('button, a, input, .screen, #screens, .hud')) return;
  skipReplay();
});

// ------------------------------------------------------------------ stepping
function stepOnce() {
  const sim = G.sim, s = sim.state;
  let inputs = {};
  if (!G.demo && !G.autoplay) inputs = { [HUMAN]: input.poll(!humanSwinging(s)) };
  sim.step(inputs);
  const evs = sim.drainEvents();
  replayBuf.record(sim.state, evs);
  if (evs.length) handleEvents(evs);
  if (G.replayAt !== null && sim.state.time >= G.replayAt && G.mode === 'play') startReplay();
}

function updateHud(state, dt) {
  hud.tick(dt);
  if (G.demo) return;
  hud.updateScore(state);
  hud.showRally(state.phase === 'rally' || state.phase === 'serve' ? state.rally.hits : 0);
  input.tick();
  touch.update(input.charge, input.charging, G.cue);
  hud.charge(input.charge, input.charging && G.mode === 'play');
  if (G.mode === 'play' && !G.autoplay) {
    const [text, kind] = contextHint(state);
    hud.hint(text && isTouchUI() && has(`${text}.touch`) ? `${text}.touch` : text, kind);
  } else hud.hint(null);
}

function viewStateOf(state) {
  if (!G.autoplay) return state;
  return { ...state, players: state.players.map((p) => (p.id === HUMAN ? { ...p, controller: 'human' } : p)) };
}

let last = performance.now();
let idleRender = 0;           // extra frames to draw while paused (the pause screen covers a frozen scene: render once, then idle)
function syncTouch() { touch.show(isTouchUI() && G.mode === 'play' && !G.paused && !G.demo && !!G.sim); }
function frame(now) {
  requestAnimationFrame(frame);
  syncTouch();
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) dt = 1 / 60;
  dt = Math.min(dt, MAX_FRAME_DT);
  const sim = G.sim;
  if (!sim) return;
  if (G.paused && !G.frozen) { if (idleRender <= 0) return; idleRender--; }
  let vdt = dt;
  if (G.paused || G.frozen) vdt = 0;
  if (G.mode === 'replay' && G.replay) {
    if (!G.paused && !G.frozen) {
      const { state, events } = G.replay.advance(dt);
      G.replayState = state;
      view.update(state, dt, { replay: true });
      const ev2 = events.filter((e) => e.type !== 'rallyEnd' && e.type !== 'gameOver' && e.type !== 'serveReady');
      view.onEvents(ev2);
      audio.onEvents(ev2.filter((e) => e.type === 'hit' || e.type === 'bounce' || e.type === 'netTouch'));
      if (G.replay.done) skipReplay();
    } else view.update(G.replayState || G.replay.firstState(), 0, { replay: true });
  } else {
    if (!G.paused && !G.frozen) {
      if (G.hitStop > 0) { G.hitStop -= dt; }
      else {
        G.acc += dt * G.timeScale;
        let n = 0;
        while (G.acc >= DT && n < MAX_STEPS && G.mode !== 'replay') { stepOnce(); G.acc -= DT; n++; if (G.hitStop > 0) break; }
        if (n >= MAX_STEPS) G.acc = 0;
      }
      if (G.overTimer > 0) { G.overTimer -= dt; if (G.overTimer <= 0 && G.mode === 'play') showGameOver(); }
    }
    if (G.mode !== 'replay') {
      const st = sim.state;
      G.cue = G.demo || G.autoplay || G.mode !== 'play' ? 0 : swingCue(st);
      if (view.setCue) view.setCue(G.cue);
      view.update(viewStateOf(st), vdt, { replay: false });
      updateHud(st, vdt);
    } else view.update(viewStateOf(sim.state), 0);
  }
  if (!G.noRender) view.render();
}

// size handling: iOS URL-bar show/hide, rotation (iOS reports stale sizes for a moment after `orientationchange`), split view, fullscreen
function syncViewport() {
  try { document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`); } catch (e) { /* ignore */ }
}
let resizeTimer = 0, resizeRaf = 0;
function applyResize() { syncViewport(); view.resize(); idleRender = 2; }
function scheduleResize() {
  if (!resizeRaf) resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; applyResize(); });
  clearTimeout(resizeTimer); resizeTimer = setTimeout(applyResize, 300);
}
window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', () => { input.releaseAll(); scheduleResize(); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize);
syncViewport();

// ------------------------------------------------------------------ debug / test hook
function setAutoplay(on) {
  G.autoplay = !!on;
  const p = G.sim.state.players[HUMAN];
  p.controller = on ? 'ai' : 'human';
  input.releaseAll();
}
function advance(seconds, opts = {}) {
  // synchronous fast-forward (no rendering): used by automated tests. Stops when a replay starts (unless disabled).
  const n = Math.round(seconds / DT);
  let i = 0;
  for (; i < n; i++) {
    if (G.mode === 'replay' || G.mode === 'over') break;
    if (G.paused) break;
    stepOnce();
    if (G.overTimer > 0) { G.overTimer -= DT; if (G.overTimer <= 0 && G.mode === 'play') { showGameOver(); break; } }
    if (opts.until && opts.until(G.sim.state)) break;
  }
  updateHud(G.sim.state, 0);
  return i * DT;
}
function stepTicks(n, render = true) {
  for (let i = 0; i < n; i++) stepOnce();
  if (render) { view.update(viewStateOf(G.sim.state), 1 / 60); view.render(); }
}

window.__game = {
  get sim() { return G.sim; }, get view() { return view; }, get mode() { return G.mode; }, get paused() { return G.paused; },
  get G() { return G; }, settings, voice, audio, hud, input, menus, replayBuf, touch, wake, isTouchUI,
  getState: () => G.sim.state,
  startMatch, setAutoplay, advance, stepTicks, skipReplay, pause, resume, toMenu,
  settleView: (n = 12, dt = 0.1) => { for (let i = 0; i < n; i++) view.update(viewStateOf(G.sim.state), dt); view.setCue(G.autoplay || G.demo ? 0 : swingCue(G.sim.state)); view.update(viewStateOf(G.sim.state), 0.001); view.render(); },
  get autoplay() { return G.autoplay; },
  setTimeScale: (v) => { G.timeScale = v; },
  freeze: (v) => { G.frozen = !!v; },
  setRender: (v) => { G.noRender = !v; },
  setReplayEnabled: (v) => { G.replayEnabled = !!v; },
  getStats: () => G.stats,
  drainLog: () => G.evlog.splice(0, G.evlog.length),
  voiceLog: () => voice.log.slice(),
  swingCue: () => swingCue(G.sim.state),
  swingCueInfo: () => swingCueInfo(G.sim.state),
  predict: (maxT = 2.5) => { const st = G.sim.state; return predictPath(st.ball.pos, st.ball.vel, st.ball.bounces, st.internal.sp, maxT, 3); },
};

// ------------------------------------------------------------------ touch <-> keyboard UI
function syncModeText() {
  const sk = $('.replay-skip');
  if (sk) { sk.dataset.i18n = isTouchUI() ? 'replay.skip.touch' : 'replay.skip'; sk.textContent = t(sk.dataset.i18n); }
}
onUIModeChange(() => {
  input.releaseAll();                 // never carry held keys / fingers over to the other input type
  syncModeText();
  menus.relang(settings);             // main footer, help (touch list vs key table), pause footer, settings rows
  hud.relang(G.sim ? G.sim.state : null);
});
syncModeText();

// ------------------------------------------------------------------ language
onLangChange((code) => {
  settings.lang = code; saveSettings(settings);
  applyStatic();
  menus.relang(settings);
  hud.relang(G.sim ? G.sim.state : null);
  touch.relang();
});

// ------------------------------------------------------------------ boot
applySettings();
startDemo();
menus.show('main');
document.body.classList.add('menu');
requestAnimationFrame((t) => { last = t; frame(t); });
