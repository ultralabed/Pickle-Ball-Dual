// Ball, trail, shadows, landing ring, particles, floating text.
import * as THREE from 'three';
import { canvasTexture, makeCanvas, clamp, lerp, smoothstep } from './util.js';

const BALL_R = 0.037, BALL_VIS = 1.5;

function ballTexture() {
  const c = makeCanvas(256, 128), g = c.getContext('2d');
  g.fillStyle = '#d5e83c'; g.fillRect(0, 0, 256, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#8c9a16';
  for (let j = 0; j < 7; j++) {
    const v = (j + 0.5) / 7, y = v * 128, n = Math.max(3, Math.round(14 * Math.sin(v * Math.PI)));
    for (let i = 0; i < n; i++) { const x = ((i + (j % 2) * 0.5) / n) * 256; g.beginPath(); g.ellipse(x, y, 6.5, 6.5, 0, 0, 7); g.fill(); }
  }
  return canvasTexture(c);
}
function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(0.5, inner.replace(/[\d.]+\)$/, '0.45)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return canvasTexture(c);
}
function ringTexture() {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 9; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 32, 0, 7); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 7, 0, 7); g.fill();
  return canvasTexture(c);
}

const textCache = new Map();
function textTexture(text, color) {
  const key = text + color;
  if (textCache.has(key)) return textCache.get(key);
  const c = makeCanvas(512, 128), g = c.getContext('2d');
  g.font = '900 78px system-ui, "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#1b1530'; g.strokeText(text, 256, 68);
  g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.strokeText(text, 256, 68);
  g.fillStyle = color; g.fillText(text, 256, 68);
  const t = canvasTexture(c); textCache.set(key, t); return t;
}

export function createEffects(scene, quality) {
  const root = new THREE.Group(); scene.add(root);
  const fx = { root };

  // ---- ball
  const ballMat = new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.45, emissive: '#6a7a10', emissiveIntensity: 0.45 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * BALL_VIS, 20, 14), ballMat);
  ball.castShadow = true; root.add(ball);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,255,170,0.9)'), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.34); ball.add(glow);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.75)'), transparent: true, depthWrite: false, opacity: 0.6 }));
  blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1; root.add(blob);

  // ---- trail ribbon
  const TN = 18;
  const tgeo = new THREE.BufferGeometry();
  const tpos = new Float32Array(TN * 2 * 3), tcol = new Float32Array(TN * 2 * 4);
  tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3).setUsage(THREE.DynamicDrawUsage));
  tgeo.setAttribute('color', new THREE.BufferAttribute(tcol, 4).setUsage(THREE.DynamicDrawUsage));
  const idx = []; for (let i = 0; i < TN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  tgeo.setIndex(idx);
  const trail = new THREE.Mesh(tgeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  trail.frustumCulled = false; trail.renderOrder = 3; root.add(trail);
  const hist = [], histPool = []; let lastSampleT = 0, simT = 0, vis = BALL_VIS;
  fx.viewH = 900;

  // ---- landing ring
  const lring = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: ringTexture(), color: '#fff36b', transparent: true, depthWrite: false, opacity: 0.9, blending: THREE.AdditiveBlending }));
  lring.rotation.x = -Math.PI / 2; lring.position.y = 0.02; lring.renderOrder = 2; lring.visible = false; root.add(lring);

  // ---- sprite pool
  const dotTex = radialTexture('rgba(255,255,255,1)');
  const POOL = quality === 'low' ? 70 : 140;
  const parts = [];
  for (let i = 0; i < POOL; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthWrite: false }));
    s.visible = false; root.add(s);
    parts.push({ s, live: false, v: new THREE.Vector3(), life: 0, max: 1, g: 0, grow: 0, size: 0.1, a0: 1, drag: 0 });
  }
  let pcur = 0;
  function spawn(pos, vel, o) {
    const p = parts[pcur]; pcur = (pcur + 1) % POOL;
    p.live = true; p.s.visible = true; p.s.position.copy(pos); p.v.copy(vel);
    p.life = p.max = o.life; p.g = o.g ?? 0; p.grow = o.grow ?? 0; p.size = o.size; p.a0 = o.a ?? 1; p.drag = o.drag ?? 0;
    p.s.material.color.set(o.color); p.s.material.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.material.opacity = p.a0; p.s.scale.setScalar(o.size); p.s.material.rotation = o.rot ?? 0;
    return p;
  }
  // text sprites
  const texts = [];
  function floatText(text, pos, color = '#ffe14a', scale = 1) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(text, color), transparent: true, depthWrite: false, depthTest: false }));
    sp.renderOrder = 10; sp.position.copy(pos); root.add(sp);
    texts.push({ sp, t: 0, life: 1.3, y0: pos.y, scale });
  }

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _side = new THREE.Vector3();
  let lastBall = new THREE.Vector3(0, 1, 0), ballSpeed = 0, spinAcc = new THREE.Vector3();

  fx.setBall = (b, dt, camera, humanSide = true) => {
    simT += dt;
    if (!b || b.visible === false) { ball.visible = false; blob.visible = false; trail.visible = false; lring.visible = false; hist.length = 0; return; }
    const p = b.pos;
    ball.visible = true; blob.visible = true;
    _a.set(p.x, p.y, p.z);
    // trail history (reset on teleport)
    const jump = hist.length && _a.distanceTo(hist[hist.length - 1].p) > 3.5;
    if (jump) hist.length = 0;
    const v = b.vel; const sp = Math.hypot(v.x, v.y, v.z); ballSpeed = sp;
    if (!hist.length || simT - lastSampleT > 1 / 120) { const o = histPool.pop() || { p: new THREE.Vector3(), t: 0 }; o.p.copy(_a); o.t = simT; hist.push(o); lastSampleT = simT; }
    while (hist.length > TN || (hist.length && simT - hist[0].t > 0.16)) histPool.push(hist.shift());
    ball.position.copy(_a);
    // legibility: keep the ball at least ~6.5 px in radius on screen whatever the camera distance
    const dCam = camera ? camera.position.distanceTo(_a) : 12;
    const wpp = camera ? (2 * dCam * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(200, fx.viewH) : 0.012;
    vis = Math.max(BALL_VIS, Math.min(3.2, (6.5 * wpp) / BALL_R));
    ball.scale.setScalar(vis / BALL_VIS);
    // spin (cosmetic)
    if (b.spin) { ball.rotation.x += b.spin.x * dt * 0.3 + v.z * dt * 2; ball.rotation.z += b.spin.z * dt * 0.3 - v.x * dt * 2; ball.rotation.y += b.spin.y * dt * 0.3; }
    // shadow blob
    const h = Math.max(0, p.y);
    blob.position.set(p.x, 0.014, p.z);
    const s = 0.16 + h * 0.07; blob.scale.set(s, s, 1);
    blob.material.opacity = clamp(0.7 - h * 0.18, 0.15, 0.7);
    // trail mesh
    const speedFade = smoothstep(2, 10, sp);
    trail.visible = hist.length > 2 && speedFade > 0.02;
    if (trail.visible) {
      _b.copy(camera.position);
      const n = hist.length;
      for (let i = 0; i < TN; i++) {
        const k = Math.min(i, n - 1);
        // i = 0 oldest
        const idxH = Math.max(0, n - TN + i);
        const hp = hist[Math.min(n - 1, idxH)].p;
        const prev = hist[Math.max(0, Math.min(n - 1, idxH) - 1)].p, nxt = hist[Math.min(n - 1, Math.min(n - 1, idxH) + 1)].p;
        _c.copy(nxt).sub(prev); if (_c.lengthSq() < 1e-8) _c.set(0, 1, 0);
        _c.normalize();
        _a.copy(_b).sub(hp).normalize();
        const side = _side.crossVectors(_c, _a).normalize();
        const f = n > 1 ? Math.min(i, n - 1) / (TN - 1) : 1;
        const age = Math.min(1, (simT - hist[Math.min(n - 1, idxH)].t) / 0.16);
        const w = BALL_R * vis * (1 - age) * 0.95;
        const o = i * 2;
        tpos[o * 3] = hp.x + side.x * w; tpos[o * 3 + 1] = hp.y + side.y * w; tpos[o * 3 + 2] = hp.z + side.z * w;
        tpos[o * 3 + 3] = hp.x - side.x * w; tpos[o * 3 + 4] = hp.y - side.y * w; tpos[o * 3 + 5] = hp.z - side.z * w;
        const al = (1 - age) * 0.7 * speedFade;
        for (let q = 0; q < 2; q++) { const c = (o + q) * 4; tcol[c] = 0.9; tcol[c + 1] = 1.0; tcol[c + 2] = 0.35; tcol[c + 3] = al; }
      }
      tgeo.attributes.position.needsUpdate = true; tgeo.attributes.color.needsUpdate = true;
    }
    // landing ring only when heading to the human's side
    const L = b.landing;
    if (L && v.z > 0.05 && L.z > 0 && b.bounces === 0) {
      lring.visible = true;
      lring.position.set(L.x, 0.02, L.z);
      const pulse = 1 + 0.12 * Math.sin(simT * 9);
      lring.scale.setScalar(pulse);
      lring.material.opacity = 0.55 + 0.35 * Math.sin(simT * 9 + 1);
    } else lring.visible = false;
    lastBall.copy(ball.position);
  };

  fx.lastBall = lastBall;

  fx.dust = (x, z, speed = 5) => {
    const n = quality === 'low' ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, sp = 0.5 + Math.random() * 0.6 + speed * 0.04;
      spawn(_a.set(x, 0.03, z), _b.set(Math.cos(a) * sp, 0.25 + Math.random() * 0.35, Math.sin(a) * sp), { life: 0.55 + Math.random() * 0.2, size: 0.12, grow: 0.5, color: '#e9dcc4', a: 0.5, drag: 3, g: -0.3 });
    }
  };
  fx.spark = (pos, power = 0.5, big = false) => {
    const n = big ? 22 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.2) * 1.4, sp = (big ? 4.5 : 2.5) * (0.5 + Math.random());
      spawn(pos, _b.set(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp), { life: 0.28 + Math.random() * 0.2, size: big ? 0.11 : 0.075, color: i % 3 ? '#fff6b0' : '#ffd23f', a: 1, add: true, drag: 4 });
    }
    spawn(pos, _b.set(0, 0, 0), { life: 0.18, size: 0.12, grow: big ? 5 : 3, color: '#ffffff', a: 0.9, add: true });
  };
  fx.confetti = (center, n = 40) => {
    const cols = ['#ff5d73', '#ffd23f', '#5ee7ff', '#8cff6a', '#c28bff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3.5;
      spawn(_a.set(center.x, center.y, center.z), _b.set(Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp), { life: 1.6 + Math.random() * 0.8, size: 0.09, color: cols[i % cols.length], a: 1, g: 6.5, drag: 0.8, rot: Math.random() * 6 });
    }
  };
  fx.text = floatText;

  fx.update = (dt, camera) => {
    for (const p of parts) {
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) { p.live = false; p.s.visible = false; continue; }
      const k = p.life / p.max;
      p.v.y -= p.g * dt; if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.position.addScaledVector(p.v, dt);
      if (p.s.position.y < 0.02 && p.g > 0) { p.s.position.y = 0.02; p.v.y *= -0.3; p.v.x *= 0.7; p.v.z *= 0.7; }
      p.s.material.opacity = p.a0 * Math.min(1, k * 1.8);
      p.s.scale.setScalar(p.size + p.grow * (1 - k) * p.size);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i]; t.t += dt;
      const u = t.t / t.life;
      if (u >= 1) { root.remove(t.sp); t.sp.material.dispose(); texts.splice(i, 1); continue; }
      const pop = u < 0.15 ? lerp(0.4, 1.12, u / 0.15) : u < 0.25 ? lerp(1.12, 1, (u - 0.15) / 0.1) : 1;
      t.sp.position.y = t.y0 + 0.9 * (1 - Math.pow(1 - u, 2));
      const d = camera ? camera.position.distanceTo(t.sp.position) : 12;
      const base = 0.062 * d * t.scale * pop;
      t.sp.scale.set(base * 4, base, 1);
      t.sp.material.opacity = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    }
  };
  fx.clear = () => { for (const p of parts) { p.live = false; p.s.visible = false; } hist.length = 0; };
  return fx;
}
