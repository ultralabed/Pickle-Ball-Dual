// View: Three.js renderer for the pickleball sim. Reads state + events, never mutates them.
import * as THREE from 'three';
import { buildCourt } from './court.js';
import { createCharacter } from './character.js';
import { createEffects } from './effects.js';
import { evalAnim, applyLegCycle, warpSwingTime, NCH, ANIM_DURATION, C } from './pose.js';
const C_hipsDY = C.hipsDY, C_rootY = C.rootY;
import { clamp, damp, lerp, smoothstep, angleDiff } from './util.js';

// low = genuinely cheap (phones): 512 px shadow map with plain PCF, ~15 % of the crowd (animated at a lower rate), small particle pool,
// pixel ratio 1 and (decided at context creation, see opts.antialias) no multisampling.
const QUALITY = {
  high: { shadow: 2048, pr: 1.5, crowd: 'high', shadowType: THREE.PCFSoftShadowMap },
  medium: { shadow: 1024, pr: 1.25, crowd: 'medium', shadowType: THREE.PCFSoftShadowMap },
  low: { shadow: 512, pr: 1, crowd: 'low', shadowType: THREE.PCFShadowMap },
};
const FAULT_TEXT = { out: 'OUT!', net: 'NET!', doubleBounce: '2 BOUNCES!', kitchen: 'KITCHEN!', twoBounceRule: 'TWO-BOUNCE!', serveShort: 'SHORT!', serveWrongCourt: 'WRONG COURT!', bodyHit: 'BODY HIT!' };
const SWING_LEG_MIX = { drive: 0.4, drop: 0.35, dink: 0.3, lob: 0.35, volley: 0.45, smash: 0.12, serve: 0.15, serveReady: 0.3, celebrate: 0.1, dejected: 0.25, ready: 1, run: 1, idle: 1 };

const PORTRAIT = { up: 4.2, back: 8.5, aim: 2.2, hTan: 0.27 };   // play-camera offsets at full portrait (aspect <= 0.5)

export function createView(canvas, opts = {}) {
  let quality = QUALITY[opts.quality] ? opts.quality : 'high';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.antialias !== false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = QUALITY[quality].shadowType;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#d9e9f6', 60, 190);
  const camera = new THREE.PerspectiveCamera(40, 16 / 10, 0.1, 600);

  const court = buildCourt(scene, QUALITY[quality].crowd);
  court.setLowPower(quality === 'low');
  const fx = createEffects(scene, quality);
  court.sun.shadow.mapSize.set(QUALITY[quality].shadow, QUALITY[quality].shadow);

  const players = new Map(); // id -> record
  let config = null;
  let camMode = 'play', camSwitchT = 10, camOverride = null;
  const camPos = new THREE.Vector3(0, 7, 13), camTarget = new THREE.Vector3(0, 0, -1);
  const wantPos = new THREE.Vector3(), wantTarget = new THREE.Vector3();
  let shake = 0, clockT = 0, lastState = null, lastBallPos = new THREE.Vector3(0, 1, 0);
  let camInit = false, replaySide = 1, cue = 0;

  // ------------------------------------------------------------ players
  function ensurePlayers(list) {
    const ids = new Set(list.map((p) => p.id));
    let same = players.size === list.length;
    for (const id of ids) if (!players.has(id)) same = false;
    if (same) {
      for (const p of list) { const r = players.get(p.id); if (r.handed !== p.handed || r.human !== (p.controller === 'human') || r.team !== p.team) same = false; }
    }
    if (same) return;
    for (const r of players.values()) { scene.remove(r.ch.root); r.ch.dispose(); }
    players.clear();
    for (const p of list) {
      const humanRing = p.controller === 'human';
      const ch = createCharacter({ id: p.id, team: p.team, handed: p.handed || 'R', human: humanRing, look: p.team === 1 && p.id < 2 ? 2 : p.id });
      scene.add(ch.root);
      players.set(p.id, {
        id: p.id, ch, handed: p.handed, human: humanRing, team: p.team, P: new Float32Array(NCH), last: new Float32Array(NCH), from: null,
        name: null, lastT: 0, phase: 0, speed: 0, fc: 0, lc: 0, facing: 0, ghost: 1, ghostT: 1, first: true,
      });
    }
  }

  function poseOne(r, st, dt) {
    const a = st.anim || { name: 'ready', t: 0, side: 'forehand' };
    const ch = r.ch;
    const vx = st.vel ? st.vel.x : 0, vz = st.vel ? st.vel.z : 0;
    const f = st.facing || 0;
    // smooth facing (snap when first seen / big jumps)
    const dF = angleDiff(r.facing, f);
    r.facing = r.first || Math.abs(dF) > 2.2 || dt > 0.2 ? f : r.facing + dF * damp(22, dt);
    const sp = Math.hypot(vx, vz);
    const fx_ = Math.sin(f), fz_ = -Math.cos(f), rx = Math.cos(f), rz = Math.sin(f);
    const k = r.first ? 1 : damp(16, dt);
    r.speed += (sp - r.speed) * k;
    if (sp > 0.25) {
      const fc = (vx * fx_ + vz * fz_) / sp, lc = (vx * rx + vz * rz) / sp;
      r.fc += (fc - r.fc) * k; r.lc += (lc - r.lc) * k;
    } else { r.fc *= 1 - k; r.lc *= 1 - k; }
    const freq = clamp(0.8 + r.speed * 0.55, 1, 3.4);
    r.phase += Math.PI * 2 * freq * Math.min(dt, 0.05);

    const P = r.P;
    // key the contact pose to the sim's (predicted / actual) contact time so the paddle meets the ball
    const pt = warpSwingTime(a.name, a.t, a.tc);
    evalAnim(P, a.name, pt, a.side, { phase: r.phase, speed: Math.max(r.speed, 0.5) });
    const weight = smoothstep(0.25, 1.4, r.speed) * (SWING_LEG_MIX[a.name] ?? 1);
    applyLegCycle(P, { phase: r.phase, speed: r.speed, fc: r.fc, lc: r.lc }, weight);

    // crossfade from the previous final pose when the animation changes (or restarts)
    if (r.name !== a.name || a.t < r.lastT - 1e-4) {
      if (!r.first) r.from = r.last.slice();
      r.blendDur = (a.name === 'ready' || a.name === 'run' || a.name === 'idle') ? 0.18 : (a.name === 'celebrate' || a.name === 'dejected') ? 0.22 : 0.1;
    }
    r.name = a.name; r.lastT = a.t;
    if (r.from) {
      const u = a.t / r.blendDur;
      if (u >= 1) r.from = null;
      else { const w = u * u * (3 - 2 * u); for (let i = 0; i < NCH; i++) P[i] = r.from[i] + (P[i] - r.from[i]) * w; }
    }
    r.last.set(P);
    return a;
  }

  // Contact snap: the sim lets the ball be struck anywhere inside the player's reach, the keyframed poses only know one
  // paddle position. Around the contact time, lunge the body (and crouch / rise) so the paddle face really is at the ball.
  const SNAP_ANIMS = new Set(['drive', 'drop', 'dink', 'lob', 'volley', 'smash', 'serve']);
  const _pf = new THREE.Vector3(), _tg = new THREE.Vector3();
  function snapPaddle(r, st, a, ball, state, env) {
    r.snap = 0;
    if (!SNAP_ANIMS.has(a.name) || a.tc === undefined || !ball || ball.visible === false) return;
    const x = a.t - a.tc;
    const w = x < 0 ? smoothstep(-0.13, -0.015, x) : 1 - smoothstep(0.03, 0.17, x);
    if (w <= 0.001) return;
    const tick0 = (state.tick || 0) - Math.round(a.t * 120);
    const cp = r.contactPos && r.contactTick >= tick0 - 2 ? r.contactPos : null;
    if (a.hit && !cp) _tg.set(ball.pos.x, ball.pos.y, ball.pos.z);       // contact seen but event missed (first frame / replay seek)
    else if (a.hit) _tg.copy(cp);
    else _tg.set(ball.pos.x, ball.pos.y, ball.pos.z);
    const ch = r.ch;
    ch.root.position.set(st.pos.x, 0, st.pos.z); ch.root.rotation.y = -r.facing;
    ch.root.updateMatrixWorld(true);
    ch.paddleFace.getWorldPosition(_pf);
    let dx = _tg.x - _pf.x, dz = _tg.z - _pf.z, dy = _tg.y - _pf.y;
    const hd = Math.hypot(dx, dz), cap = 1.0;
    if (hd > cap) { dx *= cap / hd; dz *= cap / hd; }
    const k = w * 0.92;
    if (dy < 0) r.P[C_hipsDY] += Math.min(0.42, -dy * 0.75) * k;
    else r.P[C_rootY] += Math.min(0.35, dy * 0.6) * k;
    ch.root.position.x += dx * k; ch.root.position.z += dz * k;
    r.snap = k;
    ch.apply(r.P, { ...env, dt: 0 });
  }

  // ------------------------------------------------------------ cameras
  // Portrait / narrow screens: `pp` (0 = landscape or desktop, 1 = tall phone) pulls the cameras back and up and lets the horizontal
  // field of view shrink, so the whole court width (and the human) stays in frame without a 100-degree vertical FOV.
  function portraitAmount() {
    const a = camera.aspect, k = clamp((1.5 - a) / (1.5 - 0.5), 0, 1);
    return k * k * (3 - 2 * k);
  }
  function fovFor(base, pp = 0, hTanPortrait = 0.27) {
    const aspect = camera.aspect, ref = 1.6;
    if (aspect >= ref) return base;
    const t0 = Math.tan(THREE.MathUtils.degToRad(base) / 2);
    const hTan = lerp(t0 * ref, hTanPortrait, pp);        // horizontal half-tangent that must stay visible
    return THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(t0, hTan / aspect)));
  }
  function computeCamera(st, dt) {
    const ball = st && st.ball && st.ball.visible !== false ? st.ball.pos : null;
    let human = null;
    if (st) for (const p of st.players) if (p.controller === 'human') human = p;
    const bx = ball ? ball.x : 0, bz = ball ? ball.z : 0;
    let fov = 40;
    const pp = portraitAmount();
    if (camMode === 'play') {
      // low, close, behind the human's team (mobile-tennis style); pulls back when the human is deep and
      // moves up when they are at the kitchen so the near baseline + a serving human always stay in frame.
      const hx = human ? human.pos.x : 0, hz = human ? human.pos.z : 5;
      const cx = clamp(hx * 0.3 + bx * 0.08, -1.7, 1.7);
      const dz = clamp((hz - 5) * 0.4, -1.4, 1.3);
      wantPos.set(cx, 5.0 + clamp((hz - 5) * 0.15, -0.4, 0.4) + PORTRAIT.up * pp, 13.8 + dz + PORTRAIT.back * pp);
      wantTarget.set(cx * 0.35 + bx * 0.05, 0.2, -0.8 - dz * 0.2 + clamp(bz, -7, 7) * 0.02 + PORTRAIT.aim * pp);
      fov = fovFor(42, pp, PORTRAIT.hTan);
    } else if (camMode === 'replay') {
      const t = clockT;
      const side = replaySide;
      const bxs = clamp(bx, -4, 4), bzs = clamp(bz, -7, 7);
      wantTarget.set(bxs * 0.5, 0.9, bzs * 0.85);
      const ang = 0.18 * Math.sin(t * 0.35);
      wantPos.set(side * (7.4 + Math.cos(ang) * 0.5), 2.6 + 0.5 * Math.sin(t * 0.3), bzs * 0.55 + 4.8 * Math.sin(ang) + 1.5);
      // Portrait: do NOT pull the camera outward (it would end up behind the side stand and show nothing); raise it a little and
      // let the narrow view follow the ball instead.
      if (pp > 0) { wantPos.y += 0.9 * pp; wantTarget.y += 0.2 * pp; }
      fov = fovFor(46, pp, 0.42);
    } else { // menu
      const a = clockT * 0.11 + 0.6;
      wantPos.set(Math.sin(a) * 15.5, 9.2 + Math.sin(clockT * 0.17) * 0.8, Math.cos(a) * 15.5);
      wantTarget.set(0, 0.6, 0);
      if (pp > 0) { wantPos.multiplyScalar(1 + 0.45 * pp); }
      fov = fovFor(46, pp, 0.3);
    }
    return fov;
  }
  let curFov = 40;
  function updateCamera(st, dt) {
    if (camOverride) {
      camera.position.fromArray(camOverride.position); camera.lookAt(new THREE.Vector3().fromArray(camOverride.target));
      curFov = camOverride.fov || 35; camera.fov = curFov; camera.updateProjectionMatrix(); return;
    }
    const fov = computeCamera(st, dt);
    court.hideFenceSide(camMode === 'replay' ? replaySide : 0);
    court.hideNearFence(camMode === 'play');
    camSwitchT += dt;
    const sw = smoothstep(0, 1.4, camSwitchT);
    const rate = lerp(1.6, camMode === 'replay' ? 3.2 : 4.2, sw);
    if (!camInit || dt > 0.5) { camPos.copy(wantPos); camTarget.copy(wantTarget); camInit = true; curFov = fov; }
    else {
      const k = damp(rate, dt);
      camPos.lerp(wantPos, k); camTarget.lerp(wantTarget, camMode === 'replay' ? damp(5, dt) : k);
      curFov += (fov - curFov) * damp(4, dt);
    }
    camera.position.copy(camPos);
    if (shake > 0.001) {
      const s = shake;
      camera.position.x += Math.sin(clockT * 71) * 0.06 * s + Math.sin(clockT * 133) * 0.03 * s;
      camera.position.y += Math.sin(clockT * 63 + 1) * 0.05 * s;
      camera.position.z += Math.sin(clockT * 97 + 2) * 0.03 * s;
    }
    camera.lookAt(camTarget);
    if (Math.abs(camera.fov - curFov) > 0.01) { camera.fov = curFov; camera.updateProjectionMatrix(); }
  }

  // ------------------------------------------------------------ API
  const _pt = new THREE.Vector3(), _look = new THREE.Vector3();
  const _hd = new THREE.Vector3(), _ft = new THREE.Vector3(), _sd = new THREE.Vector3(), _c0 = new THREE.Vector3(), _bp = new THREE.Vector3();
  const view = {
    renderer, scene, camera, _players: players,
    setup(cfg) {
      config = cfg;
      if (cfg && cfg.players) ensurePlayers(cfg.players.map((p) => ({ ...p })));
      fx.clear();
    },
    update(state, dt = 1 / 60, o = {}) {
      dt = clamp(dt || 0, 0, 0.5);
      clockT += dt;
      lastState = state;
      if (!state) return;
      ensurePlayers(state.players);
      const ball = state.ball;
      const ballVisible = ball && ball.visible !== false;
      if (ballVisible) _look.set(ball.pos.x, ball.pos.y, ball.pos.z);
      for (const st of state.players) {
        const r = players.get(st.id);
        if (!r) continue;
        const a = poseOne(r, st, dt);
        const ch = r.ch;
        ch.root.position.set(st.pos.x, 0, st.pos.z);
        ch.root.rotation.y = -r.facing;
        // ghost when this player hides the ball from the camera
        let gt = 1;
        if (ballVisible && !camOverride) {
          _pt.set(st.pos.x, 0.9, st.pos.z);
          const dP = camera.position.distanceTo(_pt), dB = camera.position.distanceTo(_look);
          if (dP < dB - 0.3) {
            const hd = _hd.set(st.pos.x, 1.85, st.pos.z).project(camera), ft = _ft.set(st.pos.x, 0, st.pos.z).project(camera);
            const sd = _sd.set(st.pos.x + 0.55, 1, st.pos.z).project(camera), c0 = _c0.set(st.pos.x, 1, st.pos.z).project(camera);
            const bp = _bp.copy(_look).project(camera);
            const hw = Math.abs(sd.x - c0.x) + 0.02;
            if (Math.abs(bp.x - c0.x) < hw && bp.y > ft.y - 0.04 && bp.y < hd.y + 0.04) gt = 0.32;
          }
        }
        r.ghostT = gt; r.ghost += (gt - r.ghost) * damp(12, dt);
        if (r.ghost > 0.995) r.ghost = 1;
        const env = { lookAt: ballVisible ? _look : null, time: state.time || 0, dt, emotion: st.emotion, animName: a.name, animT: a.t, ghost: r.ghost };
        ch.apply(r.P, env);
        snapPaddle(r, st, a, ball, state, env);
        if (ch.ring) {
          // timing cue: 0 idle (yellow) · 1 ball approaching (amber, wider) · 2 swing NOW (green, pulsing) · 3 swing would be a fault (red)
          let p = 1 + 0.06 * Math.sin(clockT * 5), col = 0xffe14a, op = 0.9, fop = 0.16;
          if (cue === 1) { p = 1.2 + 0.05 * Math.sin(clockT * 8); col = 0xffb020; fop = 0.22; }
          else if (cue === 2) { p = 1.45 + 0.12 * Math.sin(clockT * 20); col = 0x45ff7a; op = 1; fop = 0.5; }
          else if (cue === 3) { p = 1.3; col = 0xff4d4d; fop = 0.35; }
          else if (cue === 4) { p = 1.7 + 0.15 * Math.sin(clockT * 26); col = 0xc8ff3a; op = 1; fop = 0.65; }
          ch.ring.material.color.setHex(col); ch.ring.material.opacity = op; ch.ring.scale.setScalar(p);
          const f = ch.ring.userData.fill; f.material.color.setHex(col); f.material.opacity = fop; f.scale.setScalar(p);
        }
        ch.blob.visible = r.ghost > 0.5;
        r.first = false;
      }
      fx.setBall(ball, dt, camera);
      if (ballVisible) lastBallPos.copy(_look);
      court.update(dt, clockT);
      fx.update(dt, camera);
      shake *= Math.exp(-7 * dt);
      if (o.replay) replaySide = replaySide || 1;
      updateCamera(state, dt);
    },
    onEvents(events) {
      if (!events) return;
      for (const e of events) {
        switch (e.type) {
          case 'hit': {
            const p = new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z);
            const pr = players.get(e.playerId);
            if (pr) { pr.contactPos = p.clone(); pr.contactTick = e.tick; }
            const smash = e.shot === 'smash';
            fx.spark(p, e.power || 0.5, smash || (e.power || 0) > 0.8);
            if (smash) { fx.text('SMASH!', p.clone().add(new THREE.Vector3(0, 0.8, 0)), '#ff9a2e', 1.15); shake = Math.max(shake, 1.0); court.cheer(0.15); }
            else if ((e.speed || 0) > 16) shake = Math.max(shake, 0.18);
            if (e.atp) fx.text('ATP!', p.clone().add(new THREE.Vector3(0, 0.9, 0)), '#5ee7ff', 1.15);
            break;
          }
          case 'bounce':
            fx.dust(e.pos.x, e.pos.z, e.speed || 5);
            break;
          case 'netTouch':
            court.netWobble = 1;
            if (e.pos) fx.spark(new THREE.Vector3(e.pos.x, e.pos.y ?? 0.9, e.pos.z ?? 0), 0.2, false);
            break;
          case 'fault': {
            const pr = e.playerId != null ? players.get(e.playerId) : null;
            const at = pr ? pr.ch.root.position.clone().add(new THREE.Vector3(0, 2.1, 0)) : lastBallPos.clone().add(new THREE.Vector3(0, 0.6, 0));
            fx.text(FAULT_TEXT[e.reason] || 'FAULT!', at, '#ff5a5a', 1.0);
            break;
          }
          case 'rallyEnd':
            court.cheer(e.highlight ? 1.4 : 0.55);
            if (e.highlight) fx.confetti(lastBallPos.clone().setY(2.5), 46);
            break;
          case 'gameOver':
            court.cheer(1.5); fx.confetti(new THREE.Vector3(0, 3, 2), 90);
            break;
          default: break;
        }
      }
    },
    /** swing-timing cue for the human's ground ring: 0 none, 1 approaching, 2 swing now, 3 would be a fault, 4 swing NOW at the sweet spot */
    setCue(c) { cue = c | 0; },
    setCamera(mode) {
      if (mode !== 'play' && mode !== 'replay' && mode !== 'menu') return;
      if (mode !== camMode) { camMode = mode; camSwitchT = 0; }
      if (mode === 'replay' && lastState) {
        // pick the side that is not blocked: the side the human's team is nearer to
        replaySide = (lastState.ball && lastState.ball.pos.x > 0) ? -1 : 1;
      }
    },
    /** debug / demo extension: {position:[x,y,z], target:[x,y,z], fov} or null */
    setCameraOverride(o) { camOverride = o; if (!o) camInit = false; },
    setQuality(q) {
      if (!QUALITY[q]) return;
      quality = q; court.setShadowSize(QUALITY[q].shadow); court.rebuildCrowd(QUALITY[q].crowd); court.setLowPower(q === 'low');
      if (renderer.shadowMap.type !== QUALITY[q].shadowType) {
        renderer.shadowMap.type = QUALITY[q].shadowType;
        scene.traverse((o) => { const m = o.material; if (m) for (const x of [].concat(m)) x.needsUpdate = true; });   // shadow shaders differ per filter
      }
      view.resize();
    },
    resize() {
      const w = Math.max(2, canvas.clientWidth || canvas.width), h = Math.max(2, canvas.clientHeight || canvas.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[quality].pr));
      renderer.setSize(w, h, false); fx.viewH = h;
      camera.aspect = w / h; camera.updateProjectionMatrix();
    },
    render() { renderer.render(scene, camera); },
    dispose() {
      for (const r of players.values()) r.ch.dispose();
      players.clear(); renderer.dispose();
    },
  };
  view.resize();
  return view;
}
