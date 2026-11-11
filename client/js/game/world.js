// Baut die Map-Geometrie aus den Kollisionsboxen. Gleiche Materialien werden zusammengeführt (wenige Draw Calls).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const texCache = new Map();

function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
function shade(c, f) {
  const r = Math.min(255, Math.max(0, ((c >> 16) & 255) * f)), g = Math.min(255, Math.max(0, ((c >> 8) & 255) * f)), b = Math.min(255, Math.max(0, (c & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function makeTexture(kind, color, size = 256) {
  const key = kind + color + size;
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const R = rnd(color % 9973 + kind.length * 31 + 7);
  g.fillStyle = hex(color);
  g.fillRect(0, 0, size, size);
  const speckle = (n, a, s = 2) => { for (let i = 0; i < n; i++) { g.fillStyle = shade(color, 1 + (R() - 0.5) * a); g.fillRect(R() * size, R() * size, s, s); } };
  const u = size / 64;
  switch (kind) {
    case 'concrete':
    case 'roof':
      speckle(size * 6, 0.25, u);
      g.strokeStyle = shade(color, 0.82); g.lineWidth = u;
      g.strokeRect(0, 0, size, size);
      if (kind === 'roof') { g.beginPath(); g.moveTo(size / 2, 0); g.lineTo(size / 2, size); g.moveTo(0, size / 2); g.lineTo(size, size / 2); g.stroke(); }
      break;
    case 'sand':
      speckle(size * 10, 0.18, u);
      for (let i = 0; i < 6; i++) { g.strokeStyle = shade(color, 0.93); g.lineWidth = u * 2; g.beginPath(); const y = R() * size; g.moveTo(0, y); g.bezierCurveTo(size * 0.3, y - 10 * u, size * 0.6, y + 10 * u, size, y); g.stroke(); }
      break;
    case 'brick': {
      const bh = size / 8, bw = size / 4;
      for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0);
        g.fillStyle = shade(color, 0.85 + R() * 0.3);
        g.fillRect(x + u, row * bh + u, bw - 2 * u, bh - 2 * u);
      }
      speckle(size * 2, 0.2, u);
      break;
    }
    case 'block': // Sandstein / Fassade
      for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
        g.fillStyle = shade(color, 0.9 + R() * 0.2);
        g.fillRect(col * size / 2 + (row % 2) * size / 4 + u, row * size / 4 + u, size / 2 - 2 * u, size / 4 - 2 * u);
      }
      speckle(size * 4, 0.2, u);
      break;
    case 'metal': // gewellte Containerwand
      for (let x = 0; x < size; x += 8 * u) { g.fillStyle = shade(color, 0.78); g.fillRect(x, 0, 3 * u, size); g.fillStyle = shade(color, 1.12); g.fillRect(x + 4 * u, 0, u, size); }
      speckle(size * 2, 0.3, u);
      g.fillStyle = shade(color, 0.6); g.fillRect(0, 0, size, 3 * u); g.fillRect(0, size - 3 * u, size, 3 * u);
      break;
    case 'wood':
      for (let y = 0; y < size; y += size / 4) { g.fillStyle = shade(color, 0.85 + R() * 0.25); g.fillRect(0, y + u, size, size / 4 - 2 * u); }
      g.strokeStyle = shade(color, 0.6); g.lineWidth = 3 * u; g.strokeRect(2 * u, 2 * u, size - 4 * u, size - 4 * u);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(size, size); g.stroke();
      break;
    case 'shelf':
      g.fillStyle = shade(color, 0.5); g.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y += size / 3) { g.fillStyle = shade(0xa77b47, 0.9 + R() * 0.2); g.fillRect(4 * u, y + 6 * u, size - 8 * u, size / 3 - 10 * u); g.fillStyle = hex(color); g.fillRect(0, y, size, 5 * u); }
      g.fillStyle = hex(color); g.fillRect(0, 0, 4 * u, size); g.fillRect(size - 4 * u, 0, 4 * u, size);
      break;
    case 'plate':
      speckle(size * 3, 0.15, u);
      g.strokeStyle = shade(color, 0.7); g.lineWidth = 2 * u; g.strokeRect(u, u, size - 2 * u, size - 2 * u);
      for (let i = 0; i < 20; i++) { g.fillStyle = shade(color, 1.2); g.fillRect(R() * size, R() * size, 2 * u, 2 * u); }
      break;
    case 'facade': {
      speckle(size * 3, 0.15, u);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = R() < 0.3 ? '#f2e6a0' : '#2a3442'; g.fillRect(x * size / 4 + 5 * u, y * size / 4 + 5 * u, size / 4 - 10 * u, size / 4 - 12 * u); }
      break;
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

const KIND = { floor: null, wall: 'brick', outer: 'concrete', build: 'block', cont: 'metal', crate: 'wood', crate2: 'wood', shelf: 'shelf', plat: 'plate' };

// Box-Geometrie mit weltskalierten UVs (Textur wiederholt sich alle 2 m)
function boxGeo(b, tile = 2) {
  const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const idx = f * 4 + i;
    uv.setXY(idx, uv.getX(idx) * dims[f][0] / tile, uv.getY(idx) * dims[f][1] / tile);
  }
  geo.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  return geo;
}

export function buildWorld(map, gfx) {
  const group = new THREE.Group();
  const th = map.theme;
  const size = gfx.textures === 'niedrig' ? 128 : 256;
  const buckets = new Map();
  map.boxes.forEach((b, i) => {
    let key = b.m, color = th[b.m], kind = KIND[b.m];
    if (b.m === 'floor') { kind = th.ground === 'sand' ? 'sand' : th.ground === 'roof' ? 'roof' : 'concrete'; color = th.floor; }
    if (b.m === 'cont') { color = th.cont[i % th.cont.length]; key = 'cont' + color; }
    if (b.m === 'build' && th.city) kind = 'facade';
    if (b.m === 'wall' && th.ground === 'sand') kind = 'block';
    if (!buckets.has(key)) buckets.set(key, { kind, color, geos: [] });
    buckets.get(key).geos.push(boxGeo(b));
  });
  for (const { kind, color, geos } of buckets.values()) {
    const geo = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    const mat = new THREE.MeshLambertMaterial({ map: makeTexture(kind, color, size) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  // Bombenplätze markieren
  for (const s of map.sites) {
    const w = s.max[0] - s.min[0], d = s.max[1] - s.min[1];
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    g.strokeStyle = '#ff6a2acc'; g.lineWidth = 10; g.setLineDash([24, 14]); g.strokeRect(8, 8, 240, 240);
    g.fillStyle = '#ff6a2a99'; g.font = 'bold 150px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.name, 128, 138);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, d) * 0.6, Math.min(w, d) * 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((s.min[0] + s.max[0]) / 2, 0.02, (s.min[1] + s.max[1]) / 2);
    group.add(m);
  }
  // Stadt unter den Dächern (nur Optik)
  if (th.city) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ map: makeTexture('facade', 0x55606e, 128) });
    const n = 140;
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const m4 = new THREE.Matrix4();
    const R = rnd(42);
    const W = map.w * 2;
    for (let i = 0; i < n; i++) {
      const x = (R() - 0.5) * W * 3, z = (R() - 0.5) * W * 3;
      const inside = Math.abs(x) < W / 2 && Math.abs(z) < W / 2;
      const h = inside ? 5 + R() * 20 : 20 + R() * 70;
      const top = inside ? -6 - R() * 10 : -40 + h * 0.6;
      m4.makeScale(6 + R() * 10, h, 6 + R() * 10);
      m4.setPosition(x, top - h / 2, z);
      inst.setMatrixAt(i, m4);
    }
    group.add(inst);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: 0x3a4048 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -60;
    group.add(ground);
    // Dachkanten-Rand an den Gebäuden (Optik: Gebäudekörper unter den Dächern)
    const bodyMat = new THREE.MeshLambertMaterial({ map: makeTexture('facade', 0x6a7480, 128) });
    for (const b of map.boxes) if (b.m === 'floor') {
      const w = b.max[0] - b.min[0], d = b.max[2] - b.min[2];
      if (w < 6 && d < 6) continue; // Brücken
      const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 60, d - 0.1), bodyMat);
      body.position.set((b.min[0] + b.max[0]) / 2, -1 - 30, (b.min[2] + b.max[2]) / 2);
      group.add(body);
    }
  } else {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: th.floor }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
    group.add(ground);
  }
  if (th.indoor) {
    const W = map.w * 2, D = map.h * 2;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, D), new THREE.MeshLambertMaterial({ map: makeTexture('metal', 0x3e444b, 128) }));
    roof.material.map.repeat.set(W / 4, D / 4);
    roof.position.y = 12.25;
    group.add(roof);
    // Hallenlampen
    for (let x = -W / 2 + 8; x < W / 2; x += 12) for (let z = -D / 2 + 8; z < D / 2; z += 12) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
      lamp.position.set(x, 11.8, z);
      group.add(lamp);
    }
  }
  return group;
}

export function setupLights(scene, map, gfx) {
  const th = map.theme;
  scene.background = new THREE.Color(th.sky);
  scene.fog = new THREE.Fog(th.fog, gfx.viewDist * 0.45, gfx.viewDist);
  const hemi = new THREE.HemisphereLight(th.indoor ? 0xcfd8e6 : 0xdbe8ff, th.indoor ? 0x3a3a3a : 0x6b5f4f, th.indoor ? 1.6 : 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(th.sun, th.indoor ? 0.9 : 2.0);
  sun.position.set(40, 80, 25);
  const W = Math.max(map.w, map.h) * 1.1;
  if (gfx.shadows !== 'aus' && !th.indoor) {
    sun.castShadow = true;
    const s = { niedrig: 1024, mittel: 2048, hoch: 4096 }[gfx.shadows] || 2048;
    sun.shadow.mapSize.set(s, s);
    Object.assign(sun.shadow.camera, { left: -W, right: W, top: W, bottom: -W, near: 10, far: 220 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
  }
  scene.add(sun);
  scene.add(sun.target);
  if (th.indoor) {
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-20, 40, -30);
    scene.add(fill);
  }
  return { hemi, sun };
}
