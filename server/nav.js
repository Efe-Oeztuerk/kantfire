// Navigationsraster für Bots, abgeleitet aus dem Map-Raster (A*).
import { heightAt, cellToWorld, worldToCell, TALL } from '../shared/maps.js';

export class Nav {
  constructor(map, world) {
    this.map = map;
    this.w = map.w; this.h = map.h;
    this.hgt = [];
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      const c = map.grid[z][x];
      this.hgt.push(c === ' ' || TALL.has(c) ? null : heightAt(map, x, z));
    }
    this.world = world;
    this.edgeCache = new Map();
    // Zellen, deren Mitte in einem hohen freien 3D-Objekt liegt (Auto, Brunnen, Treppe), sind nicht begehbar
    for (const b of map.raw || []) {
      if (b.min[1] > 0.5 || b.max[1] - b.min[1] < 1.15) continue;
      for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
        const [cx, cz] = cellToWorld(map, x, z);
        if (cx > b.min[0] && cx < b.max[0] && cz > b.min[2] && cz < b.max[2]) this.hgt[z * this.w + x] = null;
      }
    }
  }
  H(x, z) { return x < 0 || z < 0 || x >= this.w || z >= this.h ? null : this.hgt[z * this.w + x]; }
  walkable(x, z) { return this.H(x, z) !== null; }

  // Übergang erlaubt? (Stufe ≤0.6 m, Sprung ≤1.15 m, Fallen bis 3 m)
  canStep(ax, az, bx, bz) {
    const a = this.H(ax, az), b = this.H(bx, bz);
    if (a === null || b === null) return false;
    const d = b - a;
    if (!(d <= 1.15 && d >= -3)) return false;
    if (!this.map.raw?.length) return true;
    // dünne Wände zwischen zwei Zellen per Strahl prüfen (gecacht)
    const key = ((az * this.w + ax) << 16) | (bz * this.w + bx);
    let ok = this.edgeCache.get(key);
    if (ok === undefined) {
      const [x0, z0] = cellToWorld(this.map, ax, az), [x1, z1] = cellToWorld(this.map, bx, bz);
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
      const dir = [dx / len, 0, dz / len];
      ok = true;
      for (const y of [a + 0.7, a + 1.5]) if (this.world.raycast([x0, y, z0], dir, len).dist < len - 0.05) ok = false;
      this.edgeCache.set(key, ok);
    }
    return ok;
  }

  path(from, to, maxIter = 4000) {
    const [sx, sz] = worldToCell(this.map, from[0], from[2]);
    let [tx, tz] = worldToCell(this.map, to[0], to[2]);
    if (!this.walkable(tx, tz)) [tx, tz] = this.nearestWalkable(tx, tz);
    if (!this.walkable(sx, sz) || tx == null) return null;
    const key = (x, z) => z * this.w + x;
    const open = [[sx, sz, 0, this.heur(sx, sz, tx, tz)]];
    const came = new Map(), g = new Map([[key(sx, sz), 0]]);
    let it = 0;
    while (open.length && it++ < maxIter) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][3] < open[bi][3]) bi = i;
      const [x, z, gc] = open.splice(bi, 1)[0];
      if (x === tx && z === tz) {
        const out = [];
        let k = key(x, z);
        while (k !== undefined) { const cx = k % this.w, cz = Math.floor(k / this.w); out.push(this.center(cx, cz)); k = came.get(k); }
        return out.reverse();
      }
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (!this.canStep(x, z, nx, nz)) continue;
        if (dx && dz && (!this.canStep(x, z, x + dx, z) || !this.canStep(x, z, x, z + dz))) continue;
        const cost = gc + (dx && dz ? 1.414 : 1) + Math.max(0, this.H(nx, nz) - this.H(x, z)) * 0.5;
        const nk = key(nx, nz);
        if (cost < (g.get(nk) ?? Infinity)) {
          g.set(nk, cost); came.set(nk, key(x, z));
          open.push([nx, nz, cost, cost + this.heur(nx, nz, tx, tz)]);
        }
      }
    }
    return null;
  }
  heur(a, b, c, d) { return Math.hypot(a - c, b - d); }
  center(x, z) { const [wx, wz] = cellToWorld(this.map, x, z); return [wx, this.H(x, z) ?? 0, wz]; }
  nearestWalkable(x, z) {
    for (let r = 1; r < 6; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (this.walkable(x + dx, z + dz)) return [x + dx, z + dz];
    return [null, null];
  }
  randomPoint() {
    for (let i = 0; i < 200; i++) {
      const x = Math.floor(Math.random() * this.w), z = Math.floor(Math.random() * this.h);
      if (this.walkable(x, z)) return this.center(x, z);
    }
    return [0, 0, 0];
  }
}
