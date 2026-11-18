// 3D props of a daily-challenge stage: targets, defender reach, bucket, aim preview and landing marks.
// Added to the game's own scene (view.scene); nothing here touches the sim or the court.
import * as THREE from 'three';
import { targetAt } from './engine.js';
import { makeCanvas, canvasTexture } from '../render/util.js';

const flat = (color, opacity, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, ...extra });
function onGround(mesh, y, order = 1) { mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; mesh.renderOrder = order; return mesh; }

function numberSprite(n) {
  const c = makeCanvas(96, 96), g = c.getContext('2d');
  g.fillStyle = '#ff5a3c'; g.beginPath(); g.arc(48, 48, 42, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = '#ffffff'; g.font = '900 60px system-ui, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 48, 52);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), transparent: true, depthTest: false, depthWrite: false }));
  sp.renderOrder = 9; sp.scale.setScalar(0.55);
  return sp;
}

export function createProps(view) {
  const root = new THREE.Group(); view.scene.add(root);
  let stageGroup = null, targets = [], st = null;

  // ---- aim preview: dots along the first part of the flight + a short line on the ground
  const DOTS = 14;
  const dotGeo = new THREE.SphereGeometry(0.05, 10, 8);
  const dots = [];
  for (let i = 0; i < DOTS; i++) {
    const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: '#e8ff55', transparent: true, opacity: 0.95 - i * 0.045, depthTest: false }));
    m.renderOrder = 8; m.visible = false; root.add(m); dots.push(m);
  }
  const aimLine = onGround(new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1), flat('#e8ff55', 0.7, { depthTest: false })), 0.03, 7);
  aimLine.visible = false; root.add(aimLine);

  // ---- landing marks of the balls already played on this stage
  const marks = [];
  for (let i = 0; i < 3; i++) {
    const m = onGround(new THREE.Mesh(new THREE.RingGeometry(0.07, 0.13, 20), flat('#ffffff', 0.95)), 0.028, 4);
    m.visible = false; root.add(m); marks.push(m);
  }

  function disposeGroup(g) {
    g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    root.remove(g);
  }

  function buildTarget(tg, index, numbered) {
    const g = new THREE.Group();
    const span = tg.zero - tg.full, r60 = tg.full + 0.4 * span, r30 = tg.full + 0.7 * span;
    if (tg.strip) {
      const plane = onGround(new THREE.Mesh(new THREE.PlaneGeometry(tg.strip.w, tg.strip.d), flat('#ff5a3c', 0.72)), 0.016, 2);
      const edge = onGround(new THREE.Mesh(new THREE.PlaneGeometry(tg.strip.w, 0.05), flat('#ffffff', 0.9)), 0.02, 3);
      edge.position.z = tg.strip.d / 2;
      g.add(plane, edge);
      g.userData.pulse = plane;
    } else {
      const outer = onGround(new THREE.Mesh(new THREE.CircleGeometry(r30, 48), flat('#ff5a3c', 0.16)), 0.014, 2);
      const mid = onGround(new THREE.Mesh(new THREE.CircleGeometry(r60, 48), flat('#ff5a3c', 0.26)), 0.016, 2);
      const rim = onGround(new THREE.Mesh(new THREE.RingGeometry(r30 - 0.035, r30, 64), flat('#ffffff', 0.7)), 0.018, 3);
      const bull = onGround(new THREE.Mesh(new THREE.CircleGeometry(Math.max(tg.full, 0.1), 32), flat('#ff3b1f', 0.95)), 0.02, 3);
      const bullRim = onGround(new THREE.Mesh(new THREE.RingGeometry(Math.max(tg.full, 0.1), Math.max(tg.full, 0.1) + 0.04, 32), flat('#ffffff', 0.95)), 0.022, 3);
      g.add(outer, mid, rim, bull, bullRim);
      g.userData.pulse = bull;
    }
    // a thin pole so the target reads from a low camera angle
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
    pole.position.y = 0.55; g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), flat('#ff3b1f', 0.95)); flag.position.set(0.17, 1.0, 0); g.add(flag);
    if (numbered) { const n = numberSprite(index + 1); n.position.y = 1.45; g.add(n); g.userData.num = n; }
    if (st.bucket) { pole.visible = false; flag.visible = false; }
    g.position.set(tg.x, 0, tg.z);
    return g;
  }

  const api = {
    setStage(stage) {
      if (stageGroup) disposeGroup(stageGroup);
      st = stage; targets = [];
      stageGroup = new THREE.Group(); root.add(stageGroup);
      const numbered = st.agg === 'avg';
      st.targets.forEach((tg, i) => { const g = buildTarget(tg, i, numbered); stageGroup.add(g); targets.push(g); });
      for (const d of st.defs) {
        const ring = onGround(new THREE.Mesh(new THREE.RingGeometry(d.r - 0.05, d.r, 48), flat('#ff4d6a', 0.9)), 0.02, 3);
        const disc = onGround(new THREE.Mesh(new THREE.CircleGeometry(d.r, 48), flat('#ff4d6a', 0.16)), 0.015, 2);
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.h, 40, 1, true), flat('#ff4d6a', 0.1));
        wall.position.y = d.h / 2; wall.renderOrder = 5;
        const top = new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.015, 6, 48), new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0.7 }));
        top.rotation.x = Math.PI / 2; top.position.y = d.h;
        const g = new THREE.Group(); g.add(ring, disc, wall, top); g.position.set(d.x, 0, d.z); stageGroup.add(g);
      }
      if (st.bucket) {
        const b = st.bucket, g = new THREE.Group();
        const side = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 0.82, b.h, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#2f7bff', roughness: 0.5, side: THREE.DoubleSide }));
        side.position.y = b.h / 2; side.castShadow = true;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(b.r, 0.022, 8, 32), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
        rim.rotation.x = Math.PI / 2; rim.position.y = b.h;
        const floor = onGround(new THREE.Mesh(new THREE.CircleGeometry(b.r * 0.82, 24), new THREE.MeshStandardMaterial({ color: '#1c4fb0' })), 0.01, 0);
        g.add(side, rim, floor); g.position.set(b.x, 0, b.z); stageGroup.add(g);
      }
      api.setPreview(null); api.setMarks([]);
    },
    /** clock: stage time (moving targets); active: index of the target the next ball counts for */
    update(clock, active, tPulse) {
      if (!st) return;
      st.targets.forEach((tg, i) => {
        const g = targets[i], now = targetAt(tg, clock);
        g.position.x = now.x;
        const on = st.agg !== 'avg' || i === active;
        g.visible = st.agg !== 'avg' || i >= active;
        const k = on ? 1 + 0.08 * Math.sin(tPulse * 5) : 1;
        if (g.userData.pulse && !tg.strip) g.userData.pulse.scale.setScalar(k);
        if (g.userData.pulse && tg.strip) g.userData.pulse.material.opacity = 0.62 + 0.16 * Math.sin(tPulse * 5);
        if (g.userData.num) g.userData.num.material.opacity = on ? 1 : 0.45;
      });
    },
    /** pts: flat [x, y, z, ...] samples of the preview arc, or null; dir: {x, z, len} ground direction from `from` */
    setPreview(pts, from, ang, len) {
      const n = pts ? Math.min(DOTS, pts.length / 3) : 0;
      for (let i = 0; i < DOTS; i++) {
        dots[i].visible = i < n;
        if (i < n) dots[i].position.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      }
      aimLine.visible = !!pts;
      if (pts) {
        aimLine.scale.set(1, len, 1);
        aimLine.position.set(from.x + Math.sin(ang) * len / 2, 0.03, from.z - Math.cos(ang) * len / 2);
        aimLine.rotation.set(-Math.PI / 2, 0, -ang);
      }
    },
    setMarks(list) {
      for (let i = 0; i < marks.length; i++) {
        const m = list[i];
        marks[i].visible = !!m;
        if (m) marks[i].position.set(m.x, 0.028, m.z);
      }
    },
  };
  return api;
}
