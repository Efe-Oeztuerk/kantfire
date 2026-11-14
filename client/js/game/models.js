// Kantige, stilisierte Charaktere und Waffenmodelle aus Boxen. Skins sind reine Farben/Texturen.
import * as THREE from 'three';
import { ITEM_BY_ID } from '/shared/cosmetics.js';
import { WEAPONS } from '/shared/weapons.js';

const boxCache = new Map();
function geo(w, h, d) { const k = `${w},${h},${d}`; if (!boxCache.has(k)) boxCache.set(k, new THREE.BoxGeometry(w, h, d)); return boxCache.get(k); }
const matCache = new Map();
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(k);
}
function box(w, h, d, m, x = 0, y = 0, z = 0) { const b = new THREE.Mesh(geo(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; return b; }

// ---------------------------------------------------------------- Gesichter
const faceCache = new Map();
function faceTexture(kind, skin) {
  const key = kind + skin;
  if (faceCache.has(key)) return faceCache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#' + skin.toString(16).padStart(6, '0'); g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#111'; g.strokeStyle = '#111'; g.lineWidth = 3;
  const eyes = (y = 24) => { g.fillRect(16, y, 8, 9); g.fillRect(40, y, 8, 9); };
  switch (kind) {
    case 'smile': eyes(); g.beginPath(); g.arc(32, 38, 12, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); break;
    case 'serious': eyes(); g.fillRect(22, 46, 20, 3); break;
    case 'shades': g.fillRect(10, 22, 44, 11); g.fillStyle = '#334'; g.fillRect(14, 24, 14, 6); g.fillRect(36, 24, 14, 6); g.fillStyle = '#111'; g.fillRect(24, 46, 16, 3); break;
    case 'angry': g.beginPath(); g.moveTo(12, 18); g.lineTo(26, 24); g.moveTo(52, 18); g.lineTo(38, 24); g.stroke(); eyes(26); g.beginPath(); g.arc(32, 52, 10, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); break;
    case 'mask': g.fillStyle = '#e8b48a'; g.fillRect(10, 20, 44, 16); g.fillStyle = '#111'; g.fillRect(16, 24, 8, 8); g.fillRect(40, 24, 8, 8); break;
    case 'robot': g.fillStyle = '#14e0ff'; g.fillRect(12, 22, 16, 8); g.fillRect(36, 22, 16, 8); g.fillStyle = '#334'; for (let i = 0; i < 5; i++) g.fillRect(18 + i * 6, 44, 3, 8); break;
    case 'skull': g.fillStyle = '#111'; g.beginPath(); g.arc(21, 28, 7, 0, 7); g.arc(43, 28, 7, 0, 7); g.fill(); g.fillRect(29, 36, 6, 6); for (let i = 0; i < 5; i++) g.fillRect(19 + i * 6, 48, 3, 7); break;
    case 'zombie': g.fillStyle = '#ff2a2a'; g.fillRect(14, 24, 10, 6); g.fillRect(40, 24, 10, 6); g.fillStyle = '#2a120f'; g.fillRect(20, 44, 24, 8); g.fillStyle = '#ddd'; g.fillRect(22, 44, 4, 4); g.fillRect(34, 44, 4, 4); break;
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(key, t);
  return t;
}

const TEAM_COLOR = { T: 0xe8a33c, C: 0x5aa7ff, N: 0xdddddd };

// ---------------------------------------------------------------- Charakter
export function makeCharacter(loadout = {}, team = 'N', zombie = false) {
  const outfit = ITEM_BY_ID[loadout.outfit] || ITEM_BY_ID.o_basic;
  const face = ITEM_BY_ID[loadout.face] || ITEM_BY_ID.h_smile;
  const hat = ITEM_BY_ID[loadout.hat] || ITEM_BY_ID.a_none;
  const gloves = ITEM_BY_ID[loadout.gloves] || ITEM_BY_ID.g_black;
  const skin = zombie ? 0x6f9a52 : (ITEM_BY_ID[loadout.skin]?.color ?? face.skin);
  const torsoC = zombie ? 0x4a5a3a : outfit.torso, legsC = zombie ? 0x33402a : outfit.legs;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const legMat = mat(legsC), torsoMat = mat(torsoC), skinMat = mat(skin), gloveMat = mat(gloves.color);
  const hipY = 0.8;
  const mkLimb = (w, h, m, x, y) => { const pivot = new THREE.Group(); pivot.position.set(x, y, 0); pivot.add(box(w, h, w, m, 0, -h / 2, 0)); return pivot; };
  const kit = !zombie && outfit.kit;
  let legL, legR, torso;
  if (kit) {
    // Fußballtrikot: Hose, gestreifte Stutzen, Schuhe; Trikot halb/halb mit Rückennummer
    const mkLeg = (x) => {
      const pivot = new THREE.Group(); pivot.position.set(x, hipY, 0);
      pivot.add(box(0.29, 0.3, 0.29, mat(kit.shorts), 0, -0.15, 0));
      pivot.add(box(0.27, 0.06, 0.27, skinMat, 0, -0.33, 0));
      for (let i = 0; i < 4; i++) pivot.add(box(0.275, 0.09, 0.275, mat(i % 2 ? kit.sockB : kit.sock), 0, -0.41 - i * 0.09, 0));
      pivot.add(box(0.29, 0.1, 0.36, mat(kit.boot), 0, -0.75, -0.04));
      return pivot;
    };
    legL = mkLeg(-0.15); legR = mkLeg(0.15);
    body.add(legL, legR);
    torso = new THREE.Group(); torso.position.set(0, hipY + 0.33, 0);
    torso.add(box(0.31, 0.66, 0.32, mat(kit.a), -0.155, 0, 0), box(0.31, 0.66, 0.32, mat(kit.b), 0.155, 0, 0));
    torso.add(box(0.3, 0.05, 0.33, mat(0xffffff), 0, 0.31, 0)); // Kragen
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshLambertMaterial({ map: kitNumber(kit.num), transparent: true }));
    num.position.set(0, 0.04, 0.162); torso.add(num); // Rücken (+z)
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshLambertMaterial({ map: kitNumber(kit.num), transparent: true }));
    front.position.set(0.15, 0.16, -0.162); front.rotation.y = Math.PI; torso.add(front);
  } else {
    legL = mkLimb(0.27, 0.8, legMat, -0.15, hipY); legR = mkLimb(0.27, 0.8, legMat, 0.15, hipY);
    body.add(legL, legR);
    torso = box(0.62, 0.66, 0.32, torsoMat, 0, hipY + 0.33, 0);
  }
  body.add(torso);
  // Teamband
  const band = box(0.25, 0.08, 0.25, mat(TEAM_COLOR[team] || 0xdddddd, { emissive: TEAM_COLOR[team] || 0, emissiveIntensity: 0.35 }), 0, -0.12, 0);
  const mkArm = (x, sleeve) => {
    if (!kit) return mkLimb(0.24, 0.62, torsoMat, x, hipY + 0.62);
    const pivot = new THREE.Group(); pivot.position.set(x, hipY + 0.62, 0);
    pivot.add(box(0.25, 0.26, 0.25, mat(sleeve), 0, -0.13, 0)); // kurzer Ärmel
    pivot.add(box(0.22, 0.36, 0.22, skinMat, 0, -0.44, 0));
    return pivot;
  };
  const armL = mkArm(-0.43, kit?.a), armR = mkArm(0.43, kit?.b);
  armL.children[0].add(band);
  armL.add(box(0.25, 0.14, 0.25, gloveMat, 0, -0.62, 0)); armR.add(box(0.25, 0.14, 0.25, gloveMat, 0, -0.62, 0));
  body.add(armL, armR);
  const head = new THREE.Group(); head.position.set(0, hipY + 0.66 + 0.2, 0);
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(zombie ? 'zombie' : face.face, skin) });
  const mats = [skinMat, skinMat, skinMat, skinMat, skinMat, faceMat];
  // Box-Seiten: +x, -x, +y, -y, +z, -z  -> Gesicht zeigt nach -z (Blickrichtung)
  const headMesh = new THREE.Mesh(geo(0.4, 0.4, 0.4), mats); headMesh.castShadow = true;
  head.add(headMesh);
  if (!zombie) addHat(head, hat);
  body.add(head);
  const gunHolder = new THREE.Group(); gunHolder.position.set(0, -0.6, -0.12);
  armR.add(gunHolder);
  root.userData = { body, legL, legR, armL, armR, head, torso, gunHolder, phase: 0, gunId: null, deadT: 0, zombie };
  return root;
}

const numCache = new Map();
function kitNumber(n) {
  if (numCache.has(n)) return numCache.get(n);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#7a0020'; g.strokeText(n, 32, 34);
  g.fillStyle = '#ffffff'; g.fillText(n, 32, 34);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  numCache.set(n, t);
  return t;
}

function addHat(head, hat) {
  const c = mat(hat.color || 0x333333);
  switch (hat.hat) {
    case 'cap': head.add(box(0.44, 0.12, 0.44, c, 0, 0.24, 0)); head.add(box(0.36, 0.04, 0.2, c, 0, 0.2, -0.3)); break;
    case 'beanie': head.add(box(0.44, 0.2, 0.44, c, 0, 0.22, 0)); head.add(box(0.12, 0.08, 0.12, mat(0xeeeeee), 0, 0.36, 0)); break;
    case 'headset': head.add(box(0.48, 0.05, 0.08, c, 0, 0.24, 0)); head.add(box(0.06, 0.16, 0.14, c, -0.23, 0.02, 0)); head.add(box(0.06, 0.16, 0.14, c, 0.23, 0.02, 0)); break;
    case 'helmet': head.add(box(0.48, 0.18, 0.48, c, 0, 0.2, 0.01)); break;
    case 'horns': head.add(box(0.07, 0.2, 0.07, c, -0.15, 0.3, 0)); head.add(box(0.07, 0.2, 0.07, c, 0.15, 0.3, 0)); break;
    case 'crown': { const g = mat(0xf2c14e, { emissive: 0x664400, emissiveIntensity: 0.4 }); head.add(box(0.42, 0.1, 0.42, g, 0, 0.25, 0)); for (const [x, z] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) head.add(box(0.08, 0.12, 0.08, g, x, 0.35, z)); break; }
  }
}

// Animation pro Frame. s: { speed, crouch, pitch, alive, ground, dt, zombie, firing, action, emote: {anim, t} }
export function animateCharacter(root, s) {
  const u = root.userData;
  for (const part of [u.armL, u.armR, u.legL, u.legR, u.head, u.body]) { part.rotation.z = 0; part.rotation.y = 0; }
  if (s.alive && s.emote) return animateEmote(u, s.emote.anim, s.emote.t);
  if (!s.alive) {
    u.deadT = Math.min(1, u.deadT + s.dt * 4);
    u.body.rotation.x = -u.deadT * Math.PI / 2;
    u.body.position.y = u.deadT * 0.2;
    return;
  }
  u.deadT = 0; u.body.rotation.set(0, 0, 0); u.body.position.y = 0; u.gunHolder.visible = true;
  u.phase += s.dt * Math.min(s.speed, 7) * 2.2;
  const swing = Math.sin(u.phase) * Math.min(1, s.speed / 4) * 0.7;
  const air = !s.ground;
  u.legL.rotation.x = air ? -0.4 : swing;
  u.legR.rotation.x = air ? 0.3 : -swing;
  const cr = s.crouch ? 1 : 0;
  u.body.position.y = -cr * 0.42;
  if (cr) { u.legL.rotation.x = -1.1; u.legR.rotation.x = -0.4; u.body.position.z = 0.1; } else u.body.position.z = 0;
  u.head.rotation.x = s.pitch * 0.5;
  if (u.zombie) {
    u.armL.rotation.x = Math.PI / 2 + Math.sin(u.phase * 0.5) * 0.15;
    u.armR.rotation.x = Math.PI / 2 - Math.sin(u.phase * 0.5) * 0.15;
  } else if (s.action) {
    u.armL.rotation.x = 0.9; u.armR.rotation.x = 0.9;
  } else {
    // Waffe in Anschlag, folgt dem Blick
    u.armR.rotation.x = Math.PI / 2 + s.pitch;
    u.armL.rotation.x = Math.PI / 2 + s.pitch - 0.1;
    u.armL.rotation.y = -0.6; u.armL.position.z = -0.05;
  }
}

function animateEmote(u, anim, t) {
  const b = u.body;
  b.position.set(0, 0, 0); b.rotation.set(0, 0, 0);
  u.legL.rotation.x = 0; u.legR.rotation.x = 0; u.armL.rotation.x = 0; u.armR.rotation.x = 0; u.head.rotation.x = 0;
  u.gunHolder.visible = false;
  const sin = Math.sin;
  switch (anim) {
    case 'wave': u.armR.rotation.z = 2.7 + sin(t * 10) * 0.35; break;
    case 'salute': u.armR.rotation.x = 2.2; u.armR.rotation.z = 0.9; u.head.rotation.x = -0.1; break;
    case 'facepalm': u.armR.rotation.x = 2.5; u.armR.rotation.z = 0.5; u.head.rotation.x = 0.45; break;
    case 'flex': { const k = 0.5 + 0.5 * sin(t * 6); u.armL.rotation.z = -1.6 - k * 0.6; u.armR.rotation.z = 1.6 + k * 0.6; u.armL.rotation.x = 0.4 * k; u.armR.rotation.x = 0.4 * k; break; }
    case 'jacks': { const k = 0.5 + 0.5 * sin(t * 9); u.armL.rotation.z = -k * 2.9; u.armR.rotation.z = k * 2.9; u.legL.rotation.z = -k * 0.4; u.legR.rotation.z = k * 0.4; b.position.y = Math.abs(sin(t * 9)) * 0.15; break; }
    case 'dance': b.rotation.y = sin(t * 4) * 0.5; b.position.y = Math.abs(sin(t * 8)) * 0.12; u.armL.rotation.z = -1.2 + sin(t * 8) * 0.8; u.armR.rotation.z = 1.2 + sin(t * 8 + 1.5) * 0.8; u.legL.rotation.x = sin(t * 8) * 0.5; u.legR.rotation.x = -sin(t * 8) * 0.5; u.head.rotation.z = sin(t * 8) * 0.2; break;
    case 'spin': b.rotation.y = t * 9; u.armL.rotation.z = -1.5; u.armR.rotation.z = 1.5; break;
    case 'robot': { const step = Math.floor(t * 4) % 4; u.armL.rotation.x = [1.5, 0, 1.5, 0.7][step]; u.armR.rotation.x = [0, 1.5, 0.7, 1.5][step]; u.head.rotation.y = [0.4, -0.4, 0, 0.4][step]; b.rotation.y = [0, 0.3, -0.3, 0][step]; break; }
  }
}

export function setCharacterGun(root, wid, finishId) {
  const u = root.userData;
  if (u.gunId === wid + finishId) return;
  u.gunId = wid + finishId;
  u.gunHolder.clear();
  if (!wid || wid === 'klaue') return;
  const g = makeGun(wid, finishId, false);
  g.rotation.x = -Math.PI / 2;
  g.scale.setScalar(0.85);
  u.gunHolder.add(g);
}

// ---------------------------------------------------------------- Waffen
const GUN_SHAPES = {
  pistol: { len: 0.26, h: 0.12, w: 0.05, barrel: 0.04, grip: 0.14, mag: 0, stock: 0 },
  smg: { len: 0.42, h: 0.12, w: 0.07, barrel: 0.1, grip: 0.14, mag: 0.18, stock: 0.12 },
  rifle: { len: 0.62, h: 0.12, w: 0.07, barrel: 0.2, grip: 0.14, mag: 0.2, stock: 0.22 },
  shotgun: { len: 0.66, h: 0.11, w: 0.08, barrel: 0.25, grip: 0.14, mag: 0, stock: 0.24, pump: true },
  dmr: { len: 0.72, h: 0.11, w: 0.07, barrel: 0.25, grip: 0.14, mag: 0.14, stock: 0.24 },
  sniper: { len: 0.82, h: 0.11, w: 0.07, barrel: 0.35, grip: 0.14, mag: 0.1, stock: 0.26 },
  heavy: { len: 0.78, h: 0.18, w: 0.12, barrel: 0.25, grip: 0.14, mag: 0.22, stock: 0.2, box: true },
};

const finishTexCache = new Map();
function finishMaterial(finishId, part) {
  const f = ITEM_BY_ID[finishId] || ITEM_BY_ID.f_stock;
  const key = finishId + part;
  if (finishTexCache.has(key)) return finishTexCache.get(key);
  const base = part === 'a' ? f.a : f.b;
  let m;
  if (f.pattern === 'camo' || f.pattern === 'stripes') {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = '#' + f.a.toString(16).padStart(6, '0'); g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#' + f.b.toString(16).padStart(6, '0');
    if (f.pattern === 'camo') for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(Math.random() * 64, Math.random() * 64, 6 + Math.random() * 8, 4 + Math.random() * 6, Math.random() * 3, 0, 7); g.fill(); }
    else for (let i = -64; i < 64; i += 14) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 7, 0); g.lineTo(i + 71, 64); g.lineTo(i + 64, 64); g.fill(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshLambertMaterial({ map: part === 'a' ? t : null, color: part === 'a' ? 0xffffff : f.b });
  } else if (f.pattern === 'glow') {
    m = new THREE.MeshLambertMaterial({ color: base, emissive: part === 'a' ? f.a : 0x000000, emissiveIntensity: part === 'a' ? 0.45 : 0 });
  } else m = new THREE.MeshLambertMaterial({ color: base });
  finishTexCache.set(key, m);
  return m;
}

export function makeGun(wid, finishId = 'f_stock', viewmodel = true) {
  const w = WEAPONS[wid];
  const g = new THREE.Group();
  if (!w) return g;
  const A = finishMaterial(finishId, 'a'), B = finishMaterial(finishId, 'b');
  const dark = mat(0x1a1c20);
  const sh = (geoW, geoH, geoD, m, x, y, z) => { const b = box(geoW, geoH, geoD, m, x, y, z); b.castShadow = !viewmodel; return b; };
  if (w.cat === 'melee') {
    if (wid === 'klaue') return g;
    g.add(sh(0.03, 0.03, 0.28, mat(0xd8dde3), 0, 0, -0.18));
    g.add(sh(0.04, 0.05, 0.12, B, 0, 0, 0.02));
    g.userData.muzzle = new THREE.Vector3(0, 0, -0.3);
    return g;
  }
  if (w.cat === 'grenade') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(wid === 'he' ? 0x3f5a2a : 0x9aa4b0));
    g.add(s); g.add(sh(0.03, 0.04, 0.03, dark, 0, 0.07, 0));
    return g;
  }
  if (w.cat === 'bomb') {
    g.add(sh(0.22, 0.14, 0.3, mat(0x4a3a2a), 0, 0, 0));
    g.add(sh(0.12, 0.02, 0.1, mat(0x111111), 0, 0.08, -0.04));
    const led = sh(0.03, 0.02, 0.03, new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0.06, 0.09, 0.08);
    g.add(led); g.userData.led = led;
    return g;
  }
  const s = GUN_SHAPES[w.cat] || GUN_SHAPES.rifle;
  // Gehäuse
  g.add(sh(s.w, s.h, s.len, A, 0, 0, -s.len / 2 + 0.1));
  // Lauf
  g.add(sh(0.035, 0.035, s.barrel, dark, 0, 0.02, -s.len + 0.1 - s.barrel / 2));
  // Griff
  g.add(sh(s.w * 0.8, s.grip, 0.06, B, 0, -s.h / 2 - s.grip / 2 + 0.02, 0.04).rotateX(0.25));
  if (s.mag) g.add(sh(s.w * 0.75, s.mag, 0.08, dark, 0, -s.h / 2 - s.mag / 2, -s.len * 0.35).rotateX(-0.12));
  if (s.stock) g.add(sh(s.w * 0.9, s.h * 0.9, s.stock, B, 0, -0.01, 0.1 + s.stock / 2));
  if (s.pump) g.add(sh(s.w * 1.1, 0.06, 0.16, B, 0, -0.06, -s.len * 0.6));
  if (s.box) g.add(sh(0.14, 0.16, 0.16, B, 0.06, -0.08, -0.15));
  if (w.scope) {
    g.add(sh(0.05, 0.05, 0.26, dark, 0, s.h / 2 + 0.05, -s.len * 0.35));
    g.add(sh(0.03, 0.04, 0.03, dark, 0, s.h / 2 + 0.01, -s.len * 0.25));
  } else if (w.cat !== 'pistol') g.add(sh(0.02, 0.03, 0.03, dark, 0, s.h / 2 + 0.015, -s.len + 0.15));
  // Akzentstreifen
  g.add(sh(s.w + 0.004, 0.02, s.len * 0.5, B, 0, s.h * 0.15, -s.len * 0.35));
  g.userData.muzzle = new THREE.Vector3(0, 0.02, -s.len + 0.1 - s.barrel);
  g.userData.len = s.len;
  return g;
}

// ---------------------------------------------------------------- Viewmodel (Arme + Waffe)
export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.2); d.position.set(1, 2, 1); this.scene.add(d);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.gun = null; this.key = null;
    this.kick = 0; this.bobT = 0; this.swayX = 0; this.swayY = 0; this.drawT = 1; this.swing = 0; this.reloadT = 0; this.reloadDur = 1; this.inspectT = 0; this.sprintK = 0;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: 0xffd28a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.scale.set(0.25, 0.25, 1); this.flash.visible = false;
    this.flashT = 0;
  }
  set(wid, finishId, gloves) {
    const key = wid + finishId + gloves;
    if (key === this.key) return;
    this.key = key;
    this.root.clear();
    if (!wid) return;
    const gl = mat((ITEM_BY_ID[gloves] || ITEM_BY_ID.g_black).color);
    const sleeve = mat(0x3a414b);
    const w = WEAPONS[wid];
    this.gun = makeGun(wid, finishId, true);
    this.root.add(this.gun);
    // Hände
    const rh = new THREE.Group();
    rh.add(box(0.08, 0.09, 0.1, gl, 0, -0.05, 0.03)); rh.add(box(0.09, 0.09, 0.3, sleeve, 0.02, -0.08, 0.24));
    this.gun.add(rh);
    if (w.cat !== 'pistol' && w.cat !== 'melee' && w.cat !== 'grenade') {
      const lh = new THREE.Group();
      lh.add(box(0.08, 0.08, 0.1, gl, 0, -0.07, 0)); lh.add(box(0.09, 0.09, 0.32, sleeve, -0.1, -0.1, 0.18).rotateY(0.5));
      lh.position.set(-0.01, 0, -(this.gun.userData.len || 0.5) * 0.55);
      this.gun.add(lh);
    } else if (wid === 'klaue') {
      const zg = mat(0x6f9a52);
      this.gun.add(box(0.12, 0.12, 0.5, zg, 0.02, -0.05, -0.05)); this.gun.add(box(0.12, 0.12, 0.5, zg, -0.25, -0.05, -0.05));
    }
    if (this.gun.userData.muzzle) { this.flash.position.copy(this.gun.userData.muzzle); this.gun.add(this.flash); }
    this.drawT = 0;
  }
  fire() { this.kick = 1; this.flashT = 0.05; this.flash.visible = true; this.flash.material.rotation = Math.random() * 6; }
  melee() { this.swing = 1; }
  reload(d) { this.reloadT = d; this.reloadDur = d; this.inspectT = 0; }
  inspect() { if (this.reloadT <= 0) this.inspectT = 3.2; }
  update(dt, s) {
    this.camera.aspect = s.aspect; this.camera.updateProjectionMatrix();
    this.kick = Math.max(0, this.kick - dt * 9);
    this.drawT = Math.min(1, this.drawT + dt * 3.5);
    this.swing = Math.max(0, this.swing - dt * 4);
    this.reloadT = Math.max(0, this.reloadT - dt);
    this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false;
    this.bobT += dt * Math.min(s.speed, 7) * 1.6;
    const bob = s.ground ? Math.min(1, s.speed / 6) : 0;
    this.swayX += (-s.mouseX * 0.0015 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (s.mouseY * 0.0015 - this.swayY) * Math.min(1, dt * 10);
    const r = this.reloadT > 0 ? Math.sin(Math.PI * (1 - this.reloadT / this.reloadDur)) : 0;
    if (this.kick > 0.5 || s.moving) this.inspectT = Math.min(this.inspectT, 0.4);
    this.inspectT = Math.max(0, this.inspectT - dt);
    this.sprintK += ((s.sprint ? 1 : 0) - this.sprintK) * Math.min(1, dt * 8);
    // Betrachten: Waffe zur Seite drehen, kippen, zurück (weich ein- und ausgeblendet)
    const it = this.inspectT, phase = 3.2 - it;
    const ease = it > 0 ? Math.min(1, phase * 3, it * 3) : 0;
    const iy = ease * (phase < 1.7 ? 0.95 : 0.95 - (phase - 1.7) * 1.2);
    const iz = ease * (phase > 1.2 && phase < 2.6 ? Math.sin((phase - 1.2) / 1.4 * Math.PI) * 0.9 : 0);
    const p = this.root.position, rot = this.root.rotation;
    p.set(0.24 + Math.cos(this.bobT) * 0.012 * bob + this.swayX - ease * 0.06 + this.sprintK * 0.04, -0.24 + Math.abs(Math.sin(this.bobT)) * 0.012 * bob * (1 + this.sprintK) - (1 - this.drawT) * 0.3 - r * 0.08 + this.swayY - ease * 0.03 - this.sprintK * 0.06, -0.46 + this.kick * 0.05 - ease * 0.16);
    rot.set(this.kick * 0.12 - r * 0.6 + this.swing * -0.9 - this.sprintK * 0.45, this.swing * 0.6 + iy + this.sprintK * 0.6, r * 0.35 + this.swing * 0.4 + iz + this.sprintK * 0.25);
    this.root.visible = !s.scoped;
  }
}

let flashTex = null;
export function flashTexture() {
  if (flashTex) return flashTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#ffd28a'); gr.addColorStop(1, '#ff800000');
  g.fillStyle = gr;
  for (let i = 0; i < 6; i++) { g.save(); g.translate(32, 32); g.rotate(i * Math.PI / 3); g.beginPath(); g.moveTo(0, -4); g.lineTo(30, 0); g.lineTo(0, 4); g.fill(); g.restore(); }
  g.beginPath(); g.arc(32, 32, 14, 0, 7); g.fill();
  flashTex = new THREE.CanvasTexture(cv);
  return flashTex;
}

// Name über dem Kopf (nur Teammitglieder)
export function nameSprite(text, color = '#5aa7ff') {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48;
  const g = cv.getContext('2d');
  g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = '#000a'; g.strokeText(text, 128, 24);
  g.fillStyle = color; g.fillText(text, 128, 24);
  const t = new THREE.CanvasTexture(cv);
  // feste Bildschirmgröße statt mitwachsender Weltgröße
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }));
  s.scale.set(0.11, 0.0206, 1);
  s.renderOrder = 10;
  return s;
}
