// Visuelle Effekte mit Objekt-Pools: Tracer, Einschläge, Partikel, Explosionen, Rauch, Mündungslicht.
import * as THREE from 'three';
import { flashTexture } from './models.js';

let smokeTex = null;
function smokeTexture() {
  if (smokeTex) return smokeTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, '#ffffffff'); gr.addColorStop(0.6, '#ffffffaa'); gr.addColorStop(1, '#ffffff00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(cv);
  return smokeTex;
}

export class Effects {
  constructor(scene, quality = 'hoch') {
    this.scene = scene;
    this.q = quality === 'hoch' ? 1 : 0.5;
    // Tracer
    this.tracers = [];
    const tMat = new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 40; i++) {
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const l = new THREE.Line(g, tMat.clone()); l.visible = false; l.frustumCulled = false;
      scene.add(l); this.tracers.push({ l, t: 0 });
    }
    // Partikel (instanziert)
    this.maxP = Math.round(400 * this.q);
    this.pmesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ vertexColors: false }), this.maxP);
    this.pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pmesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxP * 3), 3);
    this.pmesh.frustumCulled = false;
    scene.add(this.pmesh);
    this.parts = [];
    // Einschlagslöcher
    this.decals = [];
    const dMat = new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const dGeo = new THREE.PlaneGeometry(0.09, 0.09);
    for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(dGeo, dMat); m.visible = false; scene.add(m); this.decals.push(m); }
    this.di = 0;
    // Mündungslicht (ein wiederverwendetes Licht, damit keine Shader neu kompiliert werden)
    this.light = new THREE.PointLight(0xffc070, 0, 8, 2);
    scene.add(this.light);
    this.lightT = 0;
    // Weltmündungsfeuer anderer Spieler
    this.flashes = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: 0xffd28a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false; s.scale.set(0.5, 0.5, 1); scene.add(s); this.flashes.push({ s, t: 0 });
    }
    this.booms = [];
    this.smokes = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  tracer(a, b) {
    const tr = this.tracers.find((x) => x.t <= 0) || this.tracers[0];
    const pos = tr.l.geometry.attributes.position;
    pos.setXYZ(0, a[0], a[1], a[2]); pos.setXYZ(1, b[0], b[1], b[2]); pos.needsUpdate = true;
    tr.l.geometry.computeBoundingSphere();
    tr.t = 0.07; tr.l.visible = true; tr.l.material.opacity = 0.8;
  }

  muzzle(pos) {
    const f = this.flashes.find((x) => x.t <= 0) || this.flashes[0];
    f.s.position.set(pos[0], pos[1], pos[2]); f.t = 0.05; f.s.visible = true; f.s.material.rotation = Math.random() * 6;
    this.flashLight(pos);
  }
  flashLight(pos, intensity = 6) { this.light.position.set(pos[0], pos[1], pos[2]); this.light.intensity = intensity; this.lightT = 0.05; }

  burst(pos, color, n, speed = 3, size = 0.06, life = 0.5, grav = 9) {
    n = Math.max(1, Math.round(n * this.q));
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.maxP) this.parts.shift();
      this.parts.push({
        x: pos[0], y: pos[1], z: pos[2],
        vx: (Math.random() - 0.5) * speed * 2, vy: Math.random() * speed * 1.2, vz: (Math.random() - 0.5) * speed * 2,
        s: size * (0.6 + Math.random() * 0.8), life, t: life, c: new THREE.Color(color), g: grav,
      });
    }
  }

  impact(pos, normal) {
    if (normal) {
      const d = this.decals[this.di++ % this.decals.length];
      d.position.set(pos[0] + normal[0] * 0.01, pos[1] + normal[1] * 0.01, pos[2] + normal[2] * 0.01);
      d.lookAt(pos[0] + normal[0], pos[1] + normal[1], pos[2] + normal[2]);
      d.visible = true;
    }
    this.burst(pos, 0x8a8478, 5, 2, 0.05, 0.45);
  }
  blood(pos, head) { this.burst(pos, head ? 0xd01818 : 0xa01010, head ? 14 : 8, 2.5, 0.07, 0.6); }

  explosion(pos, r) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9 }));
    m.position.set(pos[0], pos[1] + 0.5, pos[2]);
    this.scene.add(m);
    this.booms.push({ m, t: 0, r: Math.min(r, 6) });
    this.burst(pos, 0xff7a20, 40, 8, 0.15, 0.8, 6);
    this.burst(pos, 0x333333, 25, 4, 0.25, 1.4, 1);
    this.flashLight([pos[0], pos[1] + 1, pos[2]], 40);
    this.lightT = 0.25;
  }

  smoke(pos, r, dur) {
    const group = new THREE.Group();
    const n = Math.round(22 * (this.q > 0.5 ? 1 : 0.7));
    const tex = smokeTexture();
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xb8bcc2, transparent: true, opacity: 0, depthWrite: false }));
      const a = Math.random() * Math.PI * 2, rr = Math.random() * r * 0.8;
      s.position.set(Math.cos(a) * rr, 0.6 + Math.random() * r * 0.7, Math.sin(a) * rr);
      const sc = r * (0.9 + Math.random() * 0.6);
      s.scale.set(sc, sc, 1);
      s.userData.base = 0.85 + Math.random() * 0.15;
      group.add(s);
    }
    group.position.set(pos[0], pos[1], pos[2]);
    this.scene.add(group);
    this.smokes.push({ group, t: 0, dur });
  }

  update(dt) {
    for (const tr of this.tracers) if (tr.t > 0) { tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / 0.07) * 0.8; if (tr.t <= 0) tr.l.visible = false; }
    for (const f of this.flashes) if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.s.visible = false; }
    if (this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) this.light.intensity = 0; }
    // Partikel
    let i = 0;
    this.parts = this.parts.filter((p) => (p.t -= dt) > 0);
    for (const p of this.parts) {
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02 && p.vy < 0 && p.g > 2) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const sc = p.s * Math.min(1, p.t / p.life * 2);
      this._m.compose(this._p.set(p.x, p.y, p.z), this._q, this._s.set(sc, sc, sc));
      this.pmesh.setMatrixAt(i, this._m);
      this.pmesh.setColorAt(i, p.c);
      i++;
    }
    this.pmesh.count = i;
    this.pmesh.instanceMatrix.needsUpdate = true;
    if (this.pmesh.instanceColor) this.pmesh.instanceColor.needsUpdate = true;
    // Explosionen
    this.booms = this.booms.filter((b) => {
      b.t += dt;
      const k = b.t / 0.35;
      b.m.scale.setScalar(0.5 + k * b.r);
      b.m.material.opacity = Math.max(0, 0.9 - k);
      if (k >= 1) { this.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); return false; }
      return true;
    });
    // Rauch
    this.smokes = this.smokes.filter((s) => {
      s.t += dt;
      const fadeIn = Math.min(1, s.t / 1.2), fadeOut = Math.min(1, (s.dur - s.t) / 2);
      for (const sp of s.group.children) { sp.material.opacity = sp.userData.base * Math.max(0, Math.min(fadeIn, fadeOut)); sp.material.rotation += dt * 0.05; }
      if (s.t >= s.dur) { this.scene.remove(s.group); s.group.children.forEach((c) => c.material.dispose()); return false; }
      return true;
    });
  }
  clearSmokes() { for (const s of this.smokes) this.scene.remove(s.group); this.smokes = []; }
}
