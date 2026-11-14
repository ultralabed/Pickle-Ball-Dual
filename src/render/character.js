// Procedural stylised pickleball player with a real joint hierarchy.
import * as THREE from 'three';
import { C, NCH } from './pose.js';
import { clamp, damp, canvasTexture, makeCanvas } from './util.js';

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler(), _u = new THREE.Vector3(), _d = new THREE.Vector3(), _zz = new THREE.Vector3(0, 0, 1);

export const L1 = 0.36, L2 = 0.36, ANK = 0.08, HIP_H = L1 + L2 + ANK;
const HIP_X = 0.1, SH_X = 0.215, SH_Y = 0.43, UA = 0.3, FA = 0.27;

const LOOKS = [
  { skin: '#f0bf94', hair: '#3a2417', hairStyle: 'short', head: 'visor', shirt: '#ff7a1f', trim: '#ffffff', shorts: '#23324d', shoe: '#f4f4f4', paddle: '#ff4a3d', paddle2: '#ffd23f', height: 1.0, build: 1.0 },
  { skin: '#8a5a3b', hair: '#17110d', hairStyle: 'puff', head: 'band', shirt: '#ff4f6e', trim: '#ffe3ea', shorts: '#ffffff', shoe: '#ffd23f', paddle: '#ffd23f', paddle2: '#ff4f6e', height: 0.96, build: 1.08 },
  { skin: '#fbd5c0', hair: '#e5b648', hairStyle: 'bun', head: 'none', shirt: '#7c4dff', trim: '#d9ccff', shorts: '#2a2350', shoe: '#8fe3ff', paddle: '#7cf0c9', paddle2: '#7c4dff', height: 0.94, build: 0.96 },
  { skin: '#c68a5e', hair: '#241a14', hairStyle: 'short', head: 'cap', shirt: '#f4f1ea', trim: '#7c4dff', shorts: '#4a3a8a', shoe: '#7c4dff', paddle: '#2ec4b6', paddle2: '#f4f1ea', height: 1.04, build: 1.12 },
];

function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 14), mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  return m;
}
function sphere(r, mat, sx = 1, sy = 1, sz = 1, seg = 20) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 6)), mat);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

function numberTexture(num, shirt, trim, text) {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = trim; g.font = '900 86px system-ui, "Arial Black", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 6;
  g.strokeText(num, 64, 68); g.fillText(num, 64, 68);
  return canvasTexture(c);
}
function paddleTexture(c1, c2) {
  const c = makeCanvas(128, 160), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 160);
  gr.addColorStop(0, c1); gr.addColorStop(1, c1);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 160);
  g.fillStyle = c2;
  g.beginPath(); g.arc(64, 62, 40, 0, Math.PI * 2); g.fill();
  g.fillStyle = c1; g.beginPath(); g.arc(64, 62, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 3; i++) g.fillRect(0, 118 + i * 12, 128, 5);
  return canvasTexture(c);
}

function buildPaddle(look) {
  const g = new THREE.Group();
  const W = 0.21, H = 0.27, R = 0.07, TH = 0.024;
  const sh = new THREE.Shape();
  const x0 = -W / 2, x1 = W / 2, y0 = -H, y1 = 0;
  sh.moveTo(x0 + 0.045, y0);
  sh.lineTo(x1 - 0.045, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + 0.05);
  sh.lineTo(x1, y1 - R); sh.quadraticCurveTo(x1, y1, x1 - R, y1);
  sh.lineTo(x0 + R, y1); sh.quadraticCurveTo(x0, y1, x0, y1 - R);
  sh.lineTo(x0, y0 + 0.05); sh.quadraticCurveTo(x0, y0, x0 + 0.045, y0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: TH, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -TH / 2);
  // remap UVs to 0..1 across the face
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / W + 0.5, (pos.getY(i) + H) / H);
  const faceMat = new THREE.MeshStandardMaterial({ map: paddleTexture(look.paddle, look.paddle2), roughness: 0.45, metalness: 0.05 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#202225', roughness: 0.6 });
  const face = new THREE.Mesh(geo, [faceMat, edgeMat]);
  face.castShadow = true;
  face.position.y = -0.12;
  g.add(face);
  const handleMat = new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.8 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.023, 0.15, 10), handleMat);
  handle.position.y = -0.065; handle.castShadow = true;
  g.add(handle);
  return { group: g, mats: [faceMat, edgeMat, handleMat] };
}

function buildHair(look, mats) {
  const g = new THREE.Group();
  const hm = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.55 });
  mats.push(hm);
  const cap = (r, thetaLen, tilt) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, thetaLen), hm);
    m.rotation.x = tilt; m.castShadow = true; return m;
  };
  switch (look.hairStyle) {
    case 'short': { g.add(cap(0.212, 1.75, 0.38)); break; }
    case 'spiky': {
      g.add(cap(0.212, 1.7, 0.35));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, rr = i === 8 ? 0 : 0.12;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 7), hm);
        cone.position.set(Math.cos(a) * rr, 0.2 - rr * 0.35, Math.sin(a) * rr + 0.02);
        cone.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); cone.castShadow = true; g.add(cone);
      }
      break;
    }
    case 'bun': {
      g.add(cap(0.212, 1.75, 0.72));
      const bun = sphere(0.085, hm); bun.position.set(0, 0.2, 0.1); g.add(bun);
      const tail = sphere(0.05, hm, 1, 1.5, 1); tail.position.set(0, 0.05, 0.215); g.add(tail);
      break;
    }
    case 'puff': {
      const puff = sphere(0.25, hm, 1.0, 0.92, 0.95, 20); puff.position.set(0, 0.1, 0.075); g.add(puff);
      break;
    }
  }
  return g;
}

function buildHeadwear(look, mats) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: look.shirt, roughness: 0.6 });
  const m2 = new THREE.MeshStandardMaterial({ color: look.trim, roughness: 0.6 });
  mats.push(m, m2);
  if (look.head === 'visor') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.022, 8, 28), m2);
    band.rotation.x = Math.PI / 2 - 0.12; band.position.y = 0.075; band.castShadow = true; g.add(band);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.015, 24, 1, false, Math.PI * 0.64, Math.PI * 0.72), m);
    brim.position.set(0, 0.085, -0.02); brim.scale.set(1, 1, 1.05); brim.castShadow = true;
    g.add(brim);
  } else if (look.head === 'cap') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.222, 24, 12, 0, Math.PI * 2, 0, 1.45), m2);
    dome.rotation.x = 0.28; dome.castShadow = true; g.add(dome);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.016, 24, 1, false, Math.PI * 0.64, Math.PI * 0.72), m);
    brim.position.set(0, 0.075, -0.03); brim.castShadow = true; g.add(brim);
    const btn = sphere(0.02, m2); btn.position.set(0, 0.22, 0.03); g.add(btn);
  } else if (look.head === 'band') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.026, 8, 28), m2);
    band.rotation.x = Math.PI / 2 - 0.1; band.position.y = 0.06; band.castShadow = true; g.add(band);
  }
  return g;
}

export function createCharacter(def) {
  const look = LOOKS[(def.look != null ? def.look : def.id) % LOOKS.length];
  const mats = [];
  const M = (color, o = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...o }); mats.push(m); return m; };
  const skin = M(look.skin, { roughness: 0.55 });
  const shirt = M(look.shirt, { roughness: 0.7 });
  const trim = M(look.trim, { roughness: 0.7 });
  const shorts = M(look.shorts, { roughness: 0.75 });
  const shoe = M(look.shoe, { roughness: 0.5 });
  const sole = M('#2a2d33', { roughness: 0.8 });
  const sock = M('#ffffff', { roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1b1411', roughness: 0.3 });
  const mouthIn = new THREE.MeshStandardMaterial({ color: '#5a1b1f', roughness: 0.6 });
  const blush = new THREE.MeshStandardMaterial({ color: '#ff7f8a', roughness: 0.9, transparent: true, opacity: 0.35 });
  const hairBrow = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.6 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: '#7a2a2a', roughness: 0.5 });
  mats.push(mouthIn, blush, hairBrow, mouthMat);

  const root = new THREE.Group();
  const body = new THREE.Group(); // mirror + size
  const sc = look.height;
  body.scale.set(def.handed === 'L' ? -sc : sc, sc, sc);
  root.add(body);
  const J = {};
  const hips = J.hips = new THREE.Group(); body.add(hips);
  hips.rotation.order = 'YXZ';

  // pelvis / shorts
  const pelvis = sphere(0.2, shorts, 1.0 * look.build, 0.72, 0.8); pelvis.position.y = -0.02; hips.add(pelvis);

  const spine = J.spine = new THREE.Group(); spine.position.y = 0.05; spine.rotation.order = 'YXZ'; hips.add(spine);
  const torso = sphere(0.19, shirt, 1.05 * look.build, 1.3, 0.78, 24); torso.position.y = 0.2; spine.add(torso);
  const belly = sphere(0.17, shirt, 1.05 * look.build, 0.9, 0.8); belly.position.set(0, 0.06, -0.01); spine.add(belly);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 8, 24), trim);
  hem.rotation.x = Math.PI / 2; hem.scale.set(1.1 * look.build, 0.82, 1); hem.position.y = 0.0; spine.add(hem);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 16), trim);
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.425; collar.scale.set(1, 0.9, 1); spine.add(collar);
  const numTex = numberTexture(String(def.id + 1), look.shirt, look.trim);
  const numMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false });
  mats.push(numMat);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), numMat);
  back.position.set(0, 0.24, 0.147); back.scale.x = def.handed === 'L' ? -1 : 1; spine.add(back);
  const chestDot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: look.trim }));
  chestDot.position.set(0.075, 0.3, -0.152); chestDot.rotation.y = Math.PI; spine.add(chestDot);

  const neck = J.neck = new THREE.Group(); neck.position.set(0, 0.45, 0); neck.rotation.order = 'YXZ'; spine.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12), skin); neckMesh.position.y = 0.0; neckMesh.castShadow = true; neck.add(neckMesh);
  const head = J.head = new THREE.Group(); head.position.y = 0.2; head.rotation.order = 'YXZ'; neck.add(head);
  const skull = sphere(0.205, skin, 1.0, 0.96, 0.98, 28); head.add(skull);
  for (const sx of [-1, 1]) {
    const ear = sphere(0.04, skin, 0.6, 1, 0.9); ear.position.set(sx * 0.2, -0.01, 0.01); head.add(ear);
  }
  const nose = sphere(0.027, skin, 1, 0.9, 1.05); nose.position.set(0, -0.03, -0.2); head.add(nose);
  nose.material = M(new THREE.Color(look.skin).multiplyScalar(0.93).getStyle());
  // eyes
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(sx * 0.076, 0.018, -0.17); eg.rotation.order = 'YXZ'; head.add(eg);
    const ball = sphere(0.05, white, 1, 1.15, 0.62, 16); eg.add(ball);
    const pupil = sphere(0.03, dark, 1, 1, 0.6, 12); pupil.position.z = -0.02; eg.add(pupil);
    const glint = sphere(0.0095, white, 1, 1, 0.6, 8); glint.position.set(0.012, 0.014, -0.034); eg.add(glint);
    eg.userData.px = pupil; eyes.push(eg);
  }
  const brows = [];
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.0125, 0.07, 4, 8), hairBrow);
    b.rotation.z = Math.PI / 2; b.castShadow = false;
    const bg = new THREE.Group(); bg.position.set(sx * 0.078, 0.095, -0.17); bg.add(b); head.add(bg);
    bg.userData.sx = sx; brows.push(bg);
  }
  const mouthG = new THREE.Group(); mouthG.position.set(0, -0.085, -0.178); head.add(mouthG);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.0085, 6, 16, Math.PI), mouthMat); mouthG.add(smile);
  const open = sphere(0.04, mouthIn, 1, 1, 0.35, 14); open.position.z = 0.002; mouthG.add(open);
  for (const sx of [-1, 1]) { const ch = sphere(0.032, blush, 1, 0.7, 0.3, 10); ch.position.set(sx * 0.13, -0.05, -0.145); ch.rotation.y = sx * 0.7; head.add(ch); }
  head.traverse((o) => { o.castShadow = false; });   // tiny face parts don't need to cast shadows
  skull.castShadow = true;
  const hairG = buildHair(look, mats), wearG = buildHeadwear(look, mats);
  head.add(hairG); head.add(wearG);
  const ponyTail = null;

  // arms
  const arms = {};
  for (const [name, sx] of [['r', 1], ['l', -1]]) {
    const sh = new THREE.Group(); sh.position.set(sx * SH_X * look.build, SH_Y, 0); sh.rotation.order = 'YXZ'; spine.add(sh);
    sh.add(sphere(0.085, shirt, 1, 1, 1, 16));
    const ua = capsule(0.07 * look.build, UA + 0.04, shirt); ua.position.y = -(UA + 0.04) / 2; sh.add(ua);
    const sleeve = new THREE.Mesh(new THREE.TorusGeometry(0.068 * look.build, 0.012, 8, 16), trim); sleeve.rotation.x = Math.PI / 2; sleeve.position.y = -0.17; sh.add(sleeve);
    const el = new THREE.Group(); el.position.y = -UA; el.rotation.order = 'XYZ'; sh.add(el);
    el.add(sphere(0.062, skin, 1, 1, 1, 12));
    const fa = capsule(0.058 * look.build, FA + 0.03, skin); fa.position.y = -(FA + 0.03) / 2; el.add(fa);
    const wr = new THREE.Group(); wr.position.y = -FA; wr.rotation.order = 'XYZ'; el.add(wr);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), trim); band.position.y = 0.02; wr.add(band);
    const hand = sphere(0.068, skin, 1, 1, 1, 14); hand.position.y = -0.045; wr.add(hand);
    arms[name] = { sh, el, wr, sx };
  }
  const pad = buildPaddle(look);
  pad.group.position.y = -0.065; arms.r.wr.add(pad.group);
  const paddleFace = new THREE.Object3D(); paddleFace.position.y = -0.255; pad.group.add(paddleFace);   // sweet spot (contact point)
  // ball in left hand when serving
  const holdBall = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshStandardMaterial({ color: '#d7e83a', roughness: 0.5 }));
  holdBall.visible = false; holdBall.position.set(0, -0.11, -0.01); arms.l.wr.add(holdBall);

  // legs
  const legs = {};
  for (const [name, sx] of [['r', 1], ['l', -1]]) {
    const th = new THREE.Group(); th.position.set(sx * HIP_X * look.build, -0.04, 0); th.rotation.order = 'ZXY'; hips.add(th);
    const thighSkin = capsule(0.082 * look.build, L1 + 0.02, skin); thighSkin.position.y = -(L1 + 0.02) / 2; th.add(thighSkin);
    const shortLeg = capsule(0.105 * look.build, 0.24, shorts); shortLeg.position.y = -0.12; th.add(shortLeg);
    const kn = new THREE.Group(); kn.position.y = -L1; kn.rotation.order = 'XYZ'; th.add(kn);
    kn.add(sphere(0.07, skin, 1, 1, 1, 12));
    const shin = capsule(0.068 * look.build, L2 + 0.02, skin); shin.position.y = -(L2 + 0.02) / 2; kn.add(shin);
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.077, 0.13, 12), sock); sk.position.y = -L2 + 0.075; sk.castShadow = true; kn.add(sk);
    const an = new THREE.Group(); an.position.y = -L2; an.rotation.order = 'XYZ'; kn.add(an);
    const sh2 = sphere(0.07, shoe, 1.0, 0.7, 1.9, 14); sh2.position.set(0, -0.045, -0.055); an.add(sh2);
    const so = sphere(0.074, sole, 1.0, 0.25, 1.95, 14); so.position.set(0, -0.075, -0.052); an.add(so);
    legs[name] = { th, kn, an, sx };
  }

  // human ring
  let ring = null;
  if (def.human) {
    ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.renderOrder = 2; root.add(ring);
    const ring2 = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.16, depthWrite: false }));
    ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.018; root.add(ring2);
    ring.userData.fill = ring2;
  }
  // blob shadow under feet (helps ground contact when real shadow is soft)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; blob.scale.set(1, 0.8, 1); root.add(blob);

  const allMats = [...mats, ...pad.mats];

  // runtime face state
  const face = { browH: 0, browT: 0, curve: 0.3, open: 0, squint: 0, blink: 0, gyaw: 0, gpitch: 0, hyaw: 0, hpitch: 0 };
  const _v = new THREE.Vector3();
  const spineBase = new THREE.Vector3();

  function applyLeg(L, P, f, lift, out, mirrorSign) {
    const hipY = HIP_H - P[C.hipsDY];
    const hh = Math.max(0.15, hipY - ANK - lift);       // vertical hip -> ankle distance
    const hh3 = Math.hypot(hh, out);
    let d = Math.hypot(f, hh3);
    d = Math.min(d, L1 + L2 - 0.002);
    const beta = Math.atan2(f, hh3);
    const gam = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const kap = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const thigh = beta + gam;
    const knee = -(Math.PI - kap);
    L.th.rotation.set(thigh, -P[C.hipsYaw] * 0.5, mirrorSign * Math.atan2(out, hh));
    L.kn.rotation.set(knee, 0, 0);
    L.an.rotation.set(-(thigh + knee) - Math.min(0.5, lift * 3.2), 0, 0);
  }

  function setArm(A, side, P, sg) {
    // side prefix r/l; left arm channels are mirrored (yaw / abd / twist / wristZ)
    const p = side === 'r' ? ['rShYaw', 'rShPitch', 'rShAbd', 'rElFlex', 'rElTwist', 'rWrX', 'rWrZ'] : ['lShYaw', 'lShPitch', 'lShAbd', 'lElFlex', 'lElTwist', 'lWrX', 'lWrZ'];
    A.sh.rotation.set(P[C[p[1]]], sg * P[C[p[0]]], sg * P[C[p[2]]]);
    A.el.rotation.set(P[C[p[3]]], sg * P[C[p[4]]], 0);
    A.wr.rotation.set(P[C[p[5]]], 0, sg * P[C[p[6]]]);
  }

  // Paddle face auto-aim: roll the paddle about its own handle axis so the face normal points where the
  // shot is going (body forward, tilted up for open-face shots). Closed form, solved mod PI (symmetric paddle).
  let rollPrev = 0;
  function solvePaddle(P) {
    const A = arms.r;
    _q1.setFromEuler(A.sh.rotation);
    _e.set(P[C.rElFlex], P[C.rElTwist], 0, 'XYZ'); _q2.setFromEuler(_e); _q1.multiply(_q2);
    _q3.setFromEuler(A.wr.rotation); _q1.multiply(_q3);       // spine -> wrist frame
    const yaw = -P[C.spYaw] * 0.6 + P[C.padAim], pit = P[C.padOpen];
    _d.set(-Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit));
    _q1.invert(); _d.applyQuaternion(_q1);
    const phi = Math.atan2(_d.x, _d.z);
    let dd = phi - rollPrev;
    dd = ((dd + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
    rollPrev += dd;
    pad.group.rotation.y = rollPrev;
  }

  /**
   * P: final pose (Float32Array NCH), env: {lookAt: Vector3|null (world), time, dt, emotion, animName, animT, ghost}
   */
  function apply(P, env) {
    const dt = env.dt;
    body.position.set(P[C.rootX], P[C.rootY], -P[C.rootF]);
    hips.position.y = HIP_H - P[C.hipsDY];
    hips.rotation.set(P[C.hipsPitch], P[C.hipsYaw], P[C.hipsRoll]);
    spine.rotation.set(P[C.spPitch], P[C.spYaw], P[C.spRoll]);
    setArm(arms.r, 'r', P, 1);
    setArm(arms.l, 'l', P, -1);
    solvePaddle(P);
    applyLeg(legs.r, P, P[C.rFootF], P[C.rFootL], P[C.rFootOut], 1);
    applyLeg(legs.l, P, P[C.lFootF], P[C.lFootL], P[C.lFootOut], -1);
    holdBall.visible = false;   // the sim ball is drawn at the server's hand until contact

    // --- head & gaze
    neck.rotation.set(P[C.hdPitch] * 0.45, P[C.hdYaw] * 0.5, P[C.hdRoll] * 0.5);
    head.rotation.set(P[C.hdPitch] * 0.55, P[C.hdYaw] * 0.5, P[C.hdRoll] * 0.5);
    let yawT = 0, pitT = 0;
    if (env.lookAt) {
      root.updateMatrixWorld(true);
      _v.copy(env.lookAt);
      head.worldToLocal(_v);
      yawT = Math.atan2(-_v.x, -_v.z);
      pitT = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      if (_v.z > 0.3) { yawT = clamp(yawT, -2, 2); } // behind: don't twist head fully
    }
    const k = damp(14, dt);
    const hyT = clamp(yawT * 0.62, -0.95, 0.95), hpT = clamp(pitT * 0.5, -0.5, 0.45);
    face.hyaw += (hyT - face.hyaw) * k; face.hpitch += (hpT - face.hpitch) * k;
    head.rotation.y += face.hyaw; head.rotation.x += face.hpitch;
    const gyT = clamp(yawT - face.hyaw - P[C.hdYaw] * 0.5, -0.55, 0.55), gpT = clamp(pitT - face.hpitch, -0.35, 0.35);
    face.gyaw += (gyT - face.gyaw) * damp(25, dt); face.gpitch += (gpT - face.gpitch) * damp(25, dt);

    // --- face expression targets
    let browH = 0, browT = 0, curve = 0.25, openT = 0, squint = 0;
    const em = env.emotion;
    if (em === 'happy') { browH = 0.6; curve = 1.0; openT = 0.25; }
    else if (em === 'sad') { browT = 0.7; browH = -0.1; curve = -0.9; squint = 0.1; }
    else if (em === 'focused') { browT = -0.8; browH = -0.4; curve = 0.0; squint = 0.35; }
    const an = env.animName;
    if (an === 'celebrate') { curve = 1.1; openT = 0.9; browH = 0.8; browT = 0; }
    else if (an === 'dejected') { curve = -1.0; browT = 0.9; openT = 0; squint = 0.15; }
    else if (an === 'smash' || an === 'serve' || an === 'drive' || an === 'lob') {
      const x = env.animT;
      if (x > 0.05 && x < 0.34) { openT = Math.max(openT, an === 'smash' ? 0.9 : 0.5); curve = 0; browT = -0.6; squint = 0.4; }
    }
    const kf = damp(12, dt);
    face.browH += (browH - face.browH) * kf; face.browT += (browT - face.browT) * kf;
    face.curve += (curve - face.curve) * kf; face.open += (openT - face.open) * kf; face.squint += (squint - face.squint) * kf;
    // blink (deterministic from time)
    const per = 3.1 + (def.id % 4) * 0.55, ph = ((env.time + def.id * 1.37) % per);
    const bl = ph < 0.13 ? Math.sin((ph / 0.13) * Math.PI) : 0;
    face.blink = bl;
    for (const eg of eyes) {
      eg.rotation.set(face.gpitch, face.gyaw, 0);
      const sy = (1 - face.squint * 0.45) * (1 - bl * 0.93);
      eg.scale.set(1, Math.max(0.07, sy), 1);
    }
    for (const bg of brows) {
      bg.position.y = 0.095 + face.browH * 0.022 - face.squint * 0.012;
      bg.rotation.z = -bg.userData.sx * face.browT * 0.45;
    }
    const sgn = smile;
    sgn.scale.y = Math.abs(face.curve) < 0.08 ? 0.08 : -face.curve;
    mouthG.position.y = -0.085 + (face.curve > 0 ? -0.0 : 0.0);
    sgn.position.y = face.curve * 0.012;
    open.visible = face.open > 0.08;
    open.scale.set(0.6 + 0.4 * face.open, 0.15 + 0.85 * face.open, 0.35);
    sgn.visible = face.open < 0.5;

    // ghost transparency
    if (env.ghost !== undefined && Math.abs(env.ghost - ghostNow) > 0.002) { setGhost(env.ghost); }
  }
  let ghostNow = 1;
  function setGhost(g) {
    ghostNow = g;
    const tr = g < 0.999;
    for (const m of allMats) {
      if (m === blush) continue;
      if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
      const wantT = tr || m.userData.baseTransparent === true;
      if (m.transparent !== wantT) { m.transparent = wantT; m.needsUpdate = true; }
      m.opacity = m.userData.baseOpacity * g;
    }
  }

  function dispose() {
    root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of allMats) { if (m.map) m.map.dispose(); m.dispose(); }
  }

  root.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
  return { root, body, J, arms, legs, apply, setGhost, dispose, ring, look, headObj: head, paddle: pad.group, paddleFace, blob };
}
