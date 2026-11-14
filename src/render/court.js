// Court, net, surround, fence, stands + crowd, sky, props, lights.
import * as THREE from 'three';
import { canvasTexture, makeCanvas, rng, std, clamp } from './util.js';

export const COURT = { W: 6.10, L: 13.41, KITCHEN: 2.134, POST: 3.355, NET_POST: 0.914, NET_MID: 0.864 };
const SUR_W = 9.14, SUR_L = 18.29;

function courtTexture() {
  const PX = 110; // px per metre along x ; z gets the same
  const c = makeCanvas(Math.round(SUR_W * PX), Math.round(SUR_L * PX));
  const g = c.getContext('2d');
  g.scale(PX, PX);
  g.translate(SUR_W / 2, SUR_L / 2);
  g.fillStyle = '#2b4a78'; g.fillRect(-SUR_W / 2, -SUR_L / 2, SUR_W, SUR_L);   // surround
  const hw = COURT.W / 2, hl = COURT.L / 2, k = COURT.KITCHEN;
  g.fillStyle = '#3c7be0'; g.fillRect(-hw, -hl, COURT.W, COURT.L);               // playing area
  g.fillStyle = '#2fae7a'; g.fillRect(-hw, -k, COURT.W, 2 * k);                  // kitchen
  // grain
  const r = rng(7);
  for (let i = 0; i < 9000; i++) {
    const x = (r() - 0.5) * SUR_W, y = (r() - 0.5) * SUR_L;
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)';
    g.fillRect(x, y, 0.03 + r() * 0.05, 0.03 + r() * 0.05);
  }
  g.strokeStyle = '#f7f7f2'; g.lineWidth = 0.05; g.lineCap = 'butt';
  g.strokeRect(-hw, -hl, COURT.W, COURT.L);
  g.beginPath();
  g.moveTo(-hw, -k); g.lineTo(hw, -k); g.moveTo(-hw, k); g.lineTo(hw, k);
  g.moveTo(0, -hl); g.lineTo(0, -k); g.moveTo(0, k); g.lineTo(0, hl);
  g.stroke();
  const t = canvasTexture(c, { aniso: 8 });
  return t;
}

function netTexture() {
  const c = makeCanvas(512, 64), g = c.getContext('2d');
  g.clearRect(0, 0, 512, 64);
  g.fillStyle = 'rgba(25,30,40,0.13)'; g.fillRect(0, 0, 512, 64);
  g.strokeStyle = 'rgba(20,24,30,0.95)'; g.lineWidth = 2.4;
  const N = 8;
  for (let i = 0; i <= 512; i += N) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); }
  for (let j = 0; j <= 64; j += N) { g.beginPath(); g.moveTo(0, j); g.lineTo(512, j); g.stroke(); }
  const t = canvasTexture(c, { aniso: 8 });
  return t;
}

function fenceTexture() {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(40,52,48,0.95)'; g.lineWidth = 4;
  for (let i = -128; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke(); }
  const t = canvasTexture(c, { repeat: true, aniso: 4 });
  return t;
}

function skyMesh() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#2f78d6') }, mid: { value: new THREE.Color('#8fc4f0') }, hor: { value: new THREE.Color('#e4f1fb') }, sun: { value: new THREE.Vector3(-0.35, 0.75, 0.55).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sun;
      void main(){ float h = clamp(vD.y,0.0,1.0);
        vec3 c = mix(hor, mid, smoothstep(0.0,0.18,h)); c = mix(c, top, smoothstep(0.15,0.75,h));
        float s = max(dot(vD, sun),0.0); c += vec3(1.0,0.93,0.75)*(pow(s,600.0)*1.5 + pow(s,12.0)*0.12);
        if (vD.y<0.0) c = hor;
        gl_FragColor = vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

function cloudTexture() {
  const c = makeCanvas(256, 128), g = c.getContext('2d');
  const r = rng(3);
  for (let i = 0; i < 26; i++) {
    const x = 50 + r() * 156, y = 50 + r() * 28, rad = 16 + r() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  }
  return canvasTexture(c);
}

export function buildCourt(scene, quality) {
  const group = new THREE.Group(); scene.add(group);
  const stuff = { group, cheerT: 0, cheerAmp: 0, netWobble: 0 };
  const QD = { low: 0.3, medium: 0.65, high: 1 }[quality] ?? 1;

  // ---- ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), std('#6aa653', { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; group.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 22.4), std('#b9b6ad', { roughness: 0.95 }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.008; apron.receiveShadow = true; group.add(apron);
  // court surface
  const ct = courtTexture();
  const court = new THREE.Mesh(new THREE.PlaneGeometry(SUR_W, SUR_L), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.62, metalness: 0.0 }));
  court.rotation.x = -Math.PI / 2; court.position.y = 0; court.receiveShadow = true; group.add(court);

  // ---- net
  const net = new THREE.Group(); group.add(net); stuff.net = net;
  const nx = COURT.POST, SEG = 48;
  const topY = (x) => COURT.NET_MID + (COURT.NET_POST - COURT.NET_MID) * (x / nx) * (x / nx);
  {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= SEG; i++) {
      const x = -nx + (2 * nx * i) / SEG, ty = topY(x) - 0.03;
      pos.push(x, 0.0, 0, x, ty, 0);
      uv.push(i / SEG * 30, 0, i / SEG * 30, ty / 0.9 * 3.6);
      if (i < SEG) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const nt = netTexture(); nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.repeat.set(1, 1);
    const nm = new THREE.MeshStandardMaterial({ map: nt, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.9, depthWrite: false });
    const mesh = new THREE.Mesh(g, nm); mesh.castShadow = true; net.add(mesh);
    // tape (white band following the sag)
    const tp = [], ti = [];
    for (let i = 0; i <= SEG; i++) {
      const x = -nx + (2 * nx * i) / SEG, y = topY(x);
      tp.push(x, y - 0.06, 0, x, y + 0.005, 0);
      if (i < SEG) { const a = i * 2; ti.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tg.setIndex(ti); tg.computeVertexNormals();
    const tape = new THREE.Mesh(tg, std('#f7f7f4', { side: THREE.DoubleSide, roughness: 0.6 })); tape.castShadow = true; net.add(tape);
    // centre strap
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, COURT.NET_MID, 0.012), std('#f7f7f4')); strap.position.y = COURT.NET_MID / 2; net.add(strap);
    // bottom cable
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 2 * nx, 6), std('#222')); cable.rotation.z = Math.PI / 2; cable.position.y = 0.02; net.add(cable);
  }
  const postMat = std('#2a2f38', { roughness: 0.4, metalness: 0.6 });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 1.02, 14), postMat);
    post.position.set(sx * nx, 0.51, 0); post.castShadow = true; group.add(post);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), std('#ffd23f')); cap.position.set(sx * nx, 1.03, 0); group.add(cap);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 14), postMat); base.position.set(sx * nx, 0.02, 0); group.add(base);
  }

  // ---- fence (see-through) + posts
  const ft = fenceTexture();
  const FX = 5.9, FZ = 10.4, FH = 2.7;
  const fenceMat = new THREE.MeshBasicMaterial({ map: ft, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, fog: true });
  const fpost = std('#2d4a3c', { roughness: 0.6, metalness: 0.3 });
  const fenceSide = { '-1': new THREE.Group(), '1': new THREE.Group() };
  group.add(fenceSide['-1'], fenceSide['1']);
  const mkFence = (len, x, z, ry, parent) => {
    const t = ft.clone(); t.needsUpdate = true; t.repeat.set(len / 0.5, FH / 0.5);
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, FH), m);
    p.position.set(x, FH / 2, z); p.rotation.y = ry; parent.add(p);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), fpost); rail.position.set(x, FH, z); rail.rotation.y = ry; rail.castShadow = true; parent.add(rail);
  };
  const fenceNear = new THREE.Group(); group.add(fenceNear);   // end fence behind the human's baseline (hidden by the play camera)
  mkFence(2 * FX, 0, -FZ, 0, group); mkFence(2 * FX, 0, FZ, 0, fenceNear);
  mkFence(2 * FZ, -FX, 0, Math.PI / 2, fenceSide['-1']); mkFence(2 * FZ, FX, 0, Math.PI / 2, fenceSide['1']);
  const fpg = new THREE.CylinderGeometry(0.045, 0.05, FH, 8);
  const addPost = (x, z, parent) => { const m = new THREE.Mesh(fpg, fpost); m.position.set(x, FH / 2, z); m.castShadow = true; parent.add(m); };
  for (let x = -FX; x <= FX + 0.01; x += FX / 2) { addPost(x, -FZ, group); addPost(x, FZ, fenceNear); }
  for (let z = -FZ + FZ / 4; z < FZ - 0.1; z += FZ / 4) { addPost(-FX, z, fenceSide['-1']); addPost(FX, z, fenceSide['1']); }
  stuff.hideNearFence = (v) => { fenceNear.visible = !v; };
  stuff.hideFenceSide = (s) => { fenceSide['-1'].visible = s !== -1; fenceSide['1'].visible = s !== 1; };
  // windscreen banner on the far fence (sponsor-free solid panel)
  const wsc = new THREE.Mesh(new THREE.PlaneGeometry(2 * FX, 1.1), new THREE.MeshStandardMaterial({ color: '#1f3b57', roughness: 0.9, side: THREE.DoubleSide }));
  wsc.position.set(0, 0.55 + 0.05, -FZ + 0.03); group.add(wsc);

  // ---- stands + crowd
  const standMat = std('#8d96a3', { roughness: 0.9 });
  const seatMat = std('#e45c4c', { roughness: 0.8 });
  const tiers = [];
  const addStand = (cx, cz, w, d, n, rotY, dir) => {
    // dir: direction tiers rise towards (local -z)
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = rotY; group.add(g);
    for (let i = 0; i < n; i++) {
      const h = 0.55 * (i + 1);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d / n), i % 2 ? standMat : std('#7d8693', { roughness: 0.9 }));
      b.position.set(0, h / 2, -(i + 0.5) * (d / n)); b.receiveShadow = true; b.castShadow = true; g.add(b);
      tiers.push({ g, w, y: h, z: -(i + 0.5) * (d / n), rotY, cx, cz });
    }
    // back wall + roof
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55 * n + 2.2, 0.2), std('#59606c')); wall.position.set(0, (0.55 * n + 2.2) / 2, -d - 0.1); g.add(wall);
    return g;
  };
  addStand(0, -11.8, 20, 5.0, 5, 0);
  addStand(-8.6, 0, 18, 4.0, 4, Math.PI / 2);
  addStand(8.6, 0, 18, 4.0, 4, -Math.PI / 2);
  stuff.tiers = tiers;

  // crowd
  const crowd = { bodies: null, heads: null, data: [] };
  const mkCrowd = (dens) => {
    const r = rng(11);
    const spots = [];
    for (const t of tiers) {
      const per = Math.floor(t.w / 0.62);
      for (let i = 0; i < per; i++) {
        if (r() > dens) continue;
        const lx = -t.w / 2 + 0.31 + i * 0.62 + (r() - 0.5) * 0.12;
        const v = new THREE.Vector3(lx, t.y, t.z + 0.0);
        v.applyAxisAngle(new THREE.Vector3(0, 1, 0), t.rotY); v.x += t.cx; v.z += t.cz;
        spots.push({ x: v.x, y: v.y, z: v.z, ph: r() * 6.28, rot: t.rotY });
      }
    }
    const n = spots.length;
    const bg = new THREE.CapsuleGeometry(0.15, 0.22, 4, 8); bg.translate(0, 0.28, 0);
    const hg = new THREE.SphereGeometry(0.11, 10, 8); hg.translate(0, 0.66, 0);
    const bodies = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ roughness: 0.8 }), Math.max(1, n));
    const heads = new THREE.InstancedMesh(hg, new THREE.MeshStandardMaterial({ roughness: 0.6 }), Math.max(1, n));
    const pal = ['#ff7a1f', '#3b82f6', '#f43f5e', '#10b981', '#f5f5f4', '#a855f7', '#facc15', '#14b8a6', '#fb7185'];
    const skins = ['#f1c8a5', '#d9a273', '#8d5a3b', '#5b3a26', '#fbd5c0'];
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      bodies.setColorAt(i, col.set(pal[Math.floor(r() * pal.length)]));
      heads.setColorAt(i, col.set(skins[Math.floor(r() * skins.length)]));
    }
    bodies.count = heads.count = n;
    bodies.castShadow = false; group.add(bodies); group.add(heads);
    crowd.bodies = bodies; crowd.heads = heads; crowd.data = spots;
    writeCrowd(0, 0);
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function writeCrowd(time, cheer) {
    const d = crowd.data;
    for (let i = 0; i < d.length; i++) {
      const s = d[i];
      const hop = cheer > 0.01 ? Math.max(0, Math.sin(time * 9 + s.ph)) * 0.22 * cheer : 0.0;
      q.setFromAxisAngle(up, s.rot);
      pv.set(s.x, s.y + hop + 0.02 * Math.sin(time * 1.3 + s.ph), s.z);
      m4.compose(pv, q, sv);
      crowd.bodies.setMatrixAt(i, m4); crowd.heads.setMatrixAt(i, m4);
    }
    crowd.bodies.instanceMatrix.needsUpdate = true; crowd.heads.instanceMatrix.needsUpdate = true;
  }
  stuff.rebuildCrowd = (q2) => {
    if (crowd.bodies) { group.remove(crowd.bodies, crowd.heads); crowd.bodies.geometry.dispose(); crowd.heads.geometry.dispose(); crowd.bodies.material.dispose(); crowd.heads.material.dispose(); crowd.bodies.dispose(); crowd.heads.dispose(); }
    mkCrowd({ low: 0.3, medium: 0.65, high: 1 }[q2] ?? 1);
  };

  // ---- trees & light poles
  const trunkG = new THREE.CylinderGeometry(0.18, 0.26, 2.4, 8); trunkG.translate(0, 1.2, 0);
  const leafG = new THREE.IcosahedronGeometry(1.6, 1); leafG.translate(0, 3.6, 0);
  const treeN = 26;
  const trunks = new THREE.InstancedMesh(trunkG, std('#5b4030'), treeN);
  const leaves = new THREE.InstancedMesh(leafG, std('#3f8f45', { roughness: 0.9, flatShading: true }), treeN);
  {
    const r = rng(5); const col = new THREE.Color();
    for (let i = 0; i < treeN; i++) {
      const a = (i / treeN) * Math.PI * 2 + r() * 0.2, rad = 32 + r() * 14;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad * 0.8;
      const s = 0.9 + r() * 0.8;
      m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, m4); leaves.setMatrixAt(i, m4);
      leaves.setColorAt(i, col.setHSL(0.27 + r() * 0.06, 0.45, 0.3 + r() * 0.1));
    }
  }
  trunks.castShadow = leaves.castShadow = true; group.add(trunks, leaves);
  const poleMat = std('#444b57', { metalness: 0.5, roughness: 0.4 });
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff7dd', emissive: '#fff1c4', emissiveIntensity: 1.4 });
  for (const [px, pz] of [[-7.2, -11], [7.2, -11], [-7.2, 11], [7.2, 11]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 8.5, 8), poleMat); pole.position.set(px, 4.25, pz); pole.castShadow = true; group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.5), poleMat); head.position.set(px, 8.5, pz); group.add(head);
    for (let i = 0; i < 4; i++) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.35), lampMat); lamp.position.set(px - 0.55 + i * 0.37, 8.4, pz); group.add(lamp); }
  }
  // clouds
  const cloudTex = cloudTexture();
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    const a = i * 0.9 + 0.3;
    sp.position.set(Math.cos(a) * 160, 55 + (i % 3) * 14, Math.sin(a) * 160 - 40); sp.scale.set(130, 65, 1); group.add(sp);
  }
  group.add(skyMesh());

  // ---- lights
  const hemi = new THREE.HemisphereLight('#bfdcff', '#7a8f5a', 0.95); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.6);
  sun.position.set(-7, 15, 8); sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 13; sc.bottom = -13; sc.near = 4; sc.far = 40;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;   // (PCFSoftShadowMap ignores shadow.radius)
  scene.add(sun, sun.target);
  stuff.sun = sun; stuff.hemi = hemi;

  stuff.update = (dt, time) => {
    stuff.cheerAmp = Math.max(0, stuff.cheerAmp - dt * 0.55);
    stuff._ct = (stuff._ct || 0) + dt;
    if (stuff._ct > 1 / 24) { stuff._ct = 0; writeCrowd(time, Math.min(1, stuff.cheerAmp)); }
    stuff.netWobble = Math.max(0, stuff.netWobble - dt * 1.6);
    net.rotation.x = Math.sin(time * 38) * 0.02 * stuff.netWobble;
  };
  stuff.cheer = (a) => { stuff.cheerAmp = Math.min(1.5, stuff.cheerAmp + a); };
  stuff.setShadowSize = (s) => { sun.shadow.mapSize.set(s, s); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } };
  stuff.court = court;
  mkCrowd(QD);
  return stuff;
}
