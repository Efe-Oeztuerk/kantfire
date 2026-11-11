// Bewegung, Kollision und Raycasts. Läuft identisch auf Server (Autorität) und Client (Vorhersage).
import { PLAYER, MOVE, KEY } from './constants.js';

export class World {
  constructor(map) {
    this.map = map;
    this.boxes = map.boxes;
    this.cs = 4; // Größe der Rasterzellen für die Kandidatensuche
    this.grid = new Map();
    this.boxes.forEach((b, i) => {
      for (let x = Math.floor(b.min[0] / this.cs); x <= Math.floor(b.max[0] / this.cs); x++)
        for (let z = Math.floor(b.min[2] / this.cs); z <= Math.floor(b.max[2] / this.cs); z++) {
          const k = x * 73856093 ^ z * 19349663;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(i);
        }
    });
    this.extra = []; // dynamische Hindernisse (nicht genutzt, Erweiterungspunkt)
  }

  candidates(minx, minz, maxx, maxz) {
    const out = new Set();
    for (let x = Math.floor(minx / this.cs); x <= Math.floor(maxx / this.cs); x++)
      for (let z = Math.floor(minz / this.cs); z <= Math.floor(maxz / this.cs); z++) {
        const l = this.grid.get(x * 73856093 ^ z * 19349663);
        if (l) for (const i of l) out.add(i);
      }
    return out;
  }

  // Überlappt eine Spieler-AABB mit der Welt? Gibt die höchste überlappende Box-Oberkante zurück oder null
  overlap(x, y, z, h, r = PLAYER.radius) {
    let top = null;
    for (const i of this.candidates(x - r, z - r, x + r, z + r)) {
      const b = this.boxes[i];
      if (x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2] && y + h > b.min[1] && y < b.max[1]) {
        if (top === null || b.max[1] > top) top = b.max[1];
      }
    }
    return top;
  }

  // Strahl gegen Welt. Liefert Distanz bis zum ersten Treffer (oder maxDist) und Normale.
  raycast(o, d, maxDist = 500) {
    let best = maxDist, normal = null, mat = null;
    const ex = o[0] + d[0] * maxDist, ez = o[2] + d[2] * maxDist;
    const cand = maxDist > 120 ? this.boxes.map((_, i) => i) : this.candidates(Math.min(o[0], ex), Math.min(o[2], ez), Math.max(o[0], ex), Math.max(o[2], ez));
    for (const i of cand) {
      const b = this.boxes[i];
      const t = rayBox(o, d, b.min, b.max, best);
      if (t !== null && t < best) { best = t; normal = lastNormal.slice(); mat = b.m; }
    }
    return { dist: best, hit: normal !== null, normal, mat };
  }

  groundHeight(x, z, fromY = 50) {
    let best = null;
    for (const i of this.candidates(x - 0.01, z - 0.01, x + 0.01, z + 0.01)) {
      const b = this.boxes[i];
      if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] <= fromY) {
        if (best === null || b.max[1] > best) best = b.max[1];
      }
    }
    return best;
  }
}

const lastNormal = [0, 0, 0];
// Slab-Test. Gibt t oder null zurück, setzt lastNormal.
export function rayBox(o, d, min, max, maxT = Infinity) {
  let tmin = 0, tmax = maxT, axis = -1, sign = 0;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
    } else {
      const inv = 1 / d[a];
      let t1 = (min[a] - o[a]) * inv, t2 = (max[a] - o[a]) * inv;
      let s = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (axis === -1) return null; // Start innerhalb der Box
  lastNormal[0] = lastNormal[1] = lastNormal[2] = 0;
  lastNormal[axis] = sign;
  return tmin;
}

export function newMoveState(x = 0, y = 0, z = 0) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, g: false, c: false };
}

// Ein Simulationsschritt. s wird verändert. opts: { speedMult, frozen }
export function simulate(s, inp, dt, world, opts = {}) {
  const k = inp.k | 0;
  const mult = opts.speedMult ?? 1;
  // Ducken
  const wantCrouch = !!(k & KEY.CROUCH);
  if (wantCrouch) s.c = true;
  else if (s.c && world.overlap(s.x, s.y + 0.02, s.z, PLAYER.height - 0.02) === null) s.c = false;
  const h = s.c ? PLAYER.crouchHeight : PLAYER.height;

  let fx = 0, fz = 0;
  if (!opts.frozen) {
    const sy = Math.sin(inp.y), cy = Math.cos(inp.y);
    if (k & KEY.F) { fx -= sy; fz -= cy; }
    if (k & KEY.B) { fx += sy; fz += cy; }
    if (k & KEY.L) { fx -= cy; fz += sy; }
    if (k & KEY.R) { fx += cy; fz -= sy; }
  }
  const len = Math.hypot(fx, fz);
  if (len > 0) { fx /= len; fz /= len; }
  let wish = len > 0 ? MOVE.speed * mult : 0;
  if (s.c) wish *= MOVE.crouchMult; else if (k & KEY.WALK) wish *= MOVE.walkMult;

  if (s.g) {
    // Reibung
    const sp = Math.hypot(s.vx, s.vz);
    if (sp > 0) {
      const drop = Math.max(sp, MOVE.stopSpeed) * MOVE.friction * dt;
      const ns = Math.max(sp - drop, 0) / sp;
      s.vx *= ns; s.vz *= ns;
    }
    accelerate(s, fx, fz, wish, MOVE.accel, dt);
    if ((k & KEY.JUMP) && !opts.frozen && !s.c) { s.vy = MOVE.jump * Math.min(1, 0.85 + mult * 0.15); s.g = false; }
  } else {
    accelerate(s, fx, fz, Math.min(wish, MOVE.airCap * mult), MOVE.airAccel * 10, dt);
  }
  s.vy -= MOVE.gravity * dt;
  if (opts.frozen) { s.vx = 0; s.vz = 0; }

  // Achsenweise bewegen, mit Stufen-Hochsteigen
  moveAxis(s, 0, s.vx * dt, h, world);
  moveAxis(s, 2, s.vz * dt, h, world);
  const ny = s.y + s.vy * dt;
  const top = world.overlap(s.x, ny, s.z, h);
  if (top !== null) {
    if (s.vy <= 0) { s.y = top; s.g = true; }
    else { s.y = ny; s.y = findCeiling(s, h, world); }
    s.vy = 0;
  } else {
    s.y = ny;
    s.g = world.overlap(s.x, s.y - 0.05, s.z, h) !== null && s.vy <= 0;
  }
  return s;
}

function accelerate(s, fx, fz, wish, accel, dt) {
  if (wish <= 0) return;
  const cur = s.vx * fx + s.vz * fz;
  const add = wish - cur;
  if (add <= 0) return;
  const a = Math.min(accel * wish * dt, add);
  s.vx += a * fx; s.vz += a * fz;
}

function moveAxis(s, axis, delta, h, world) {
  if (delta === 0) return;
  const key = axis === 0 ? 'x' : 'z';
  const old = s[key];
  s[key] = old + delta;
  const top = world.overlap(s.x, s.y, s.z, h);
  if (top === null) return;
  // Stufe hochsteigen, wenn am Boden und niedrig genug
  const lift = top - s.y;
  if (s.g && lift > 0 && lift <= PLAYER.stepHeight && world.overlap(s.x, top + 0.001, s.z, h) === null) {
    s.y = top + 0.001;
    return;
  }
  s[key] = old;
  if (axis === 0) s.vx = 0; else s.vz = 0;
}

function findCeiling(s, h, world) {
  // beim Kopfstoß zurück unter die Decke schieben
  let y = s.y;
  for (let i = 0; i < 10 && world.overlap(s.x, y, s.z, h) !== null; i++) y -= 0.05;
  return y;
}

export function eyeHeight(c) { return c ? PLAYER.crouchEye : PLAYER.eye; }

// Trefferzonen eines Spielers an Position p (Fußpunkt)
export function hitboxes(x, y, z, crouch) {
  const h = crouch ? PLAYER.crouchHeight : PLAYER.height;
  const legTop = y + h * 0.45;
  const headBot = y + h - 0.38;
  return [
    { zone: 'head', min: [x - 0.2, headBot, z - 0.2], max: [x + 0.2, y + h, z + 0.2] },
    { zone: 'body', min: [x - 0.32, legTop, z - 0.22], max: [x + 0.32, headBot, z + 0.22] },
    { zone: 'legs', min: [x - 0.28, y, z - 0.2], max: [x + 0.28, legTop, z + 0.2] },
  ];
}

export function rayPlayer(o, d, x, y, z, crouch, maxT) {
  let best = null;
  for (const hb of hitboxes(x, y, z, crouch)) {
    const t = rayBox(o, d, hb.min, hb.max, maxT);
    if (t !== null && (best === null || t < best.t)) best = { t, zone: hb.zone };
  }
  return best;
}
