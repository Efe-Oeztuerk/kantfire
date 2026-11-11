// Waffenlogik, Treffer- und Schadensberechnung – ausschließlich serverseitig.
import { WEAPONS, sprayOffset, currentSpread, spreadSample, damageAt, applyArmor, BOLT_ACTION } from '../shared/weapons.js';
import { rayPlayer } from '../shared/physics.js';
import { dirFromAngles, clamp } from '../shared/util.js';
import { KEY, LAG_COMP_MAX } from '../shared/constants.js';

export function handleWeapon(room, p, inp) {
  const k = inp.k | 0, prev = p.prevKeys;
  const inst = p.activeInst();
  const w = inst ? WEAPONS[inst.id] : null;
  if (!w || !p.alive) return;
  const t = p.simTime;

  // Nachladen abschließen
  if (p.reloadEnd && t >= p.reloadEnd) {
    const need = w.mag - inst.mag, take = Math.min(need, inst.res);
    inst.mag += take; inst.res -= take; p.reloadEnd = 0;
  }
  // Zielfernrohr (Flanke)
  if ((k & KEY.ALT) && !(prev & KEY.ALT) && w.scope && t >= p.drawEnd && !p.reloadEnd) {
    p.zoom = (p.zoom + 1) % (w.scope.length + 1);
  }
  // Nachladen starten
  if ((k & KEY.RELOAD) && !(prev & KEY.RELOAD)) startReload(p, inst, w);

  if (!(k & KEY.FIRE)) return;
  if (!w.auto && (prev & KEY.FIRE) && !w.melee) return; // Halbautomatik: neuer Klick nötig
  if (t < p.nextFire || t < p.drawEnd) return;
  if (room.mode.blockFire?.(p)) return;

  if (w.melee) return melee(room, p, w, inp);
  if (w.cat === 'grenade') return throwGrenade(room, p, inst, w);
  if (w.cat === 'bomb') return;
  if (p.reloadEnd) return;
  if (inst.mag <= 0) {
    if (!(prev & KEY.FIRE)) room.emit({ e: 'dry', id: p.id }, p.id);
    if (inst.res > 0) startReload(p, inst, w);
    return;
  }
  inst.mag--;
  p.nextFire = t + 60 / w.rpm;
  p.stats.shots++;
  // Rückstoß-Erholung
  const gap = t - p.lastShot;
  if (gap > w.recover) p.shotIdx = 0;
  else p.shotIdx = Math.max(0, p.shotIdx - Math.floor(gap / 0.12));
  const [sp, sy] = sprayOffset(w, p.shotIdx);
  p.shotIdx++; p.lastShot = t;
  if (p.protectUntil > room.time) p.protectUntil = 0; // Schießen beendet Spawnschutz

  const spread = currentSpread(w, { speed: Math.hypot(p.st.vx, p.st.vz), air: !p.st.g, crouch: p.st.c, scoped: p.zoom > 0 });
  const origin = p.eye();
  const rt = clamp(Number(inp.rt) || room.time, room.time - LAG_COMP_MAX, room.time);
  const hits = [];
  for (let i = 0; i < w.pellets; i++) {
    const [ox, oy] = spreadSample(spread, p.id, inp.s, i);
    const dir = dirFromAngles(p.yaw + sy + ox, clamp(p.pitch + sp + oy, -1.56, 1.56));
    hits.push(trace(room, p, origin, dir, w, rt));
  }
  // Schaden je Opfer zusammenfassen (Schrot)
  const byVictim = new Map();
  for (const h of hits) if (h.victim) {
    const prevH = byVictim.get(h.victim) || { dmg: 0, head: false };
    prevH.dmg += h.dmg; prevH.head ||= h.zone === 'head'; prevH.zone = prevH.head ? 'head' : h.zone;
    byVictim.set(h.victim, prevH);
  }
  for (const [v, h] of byVictim) { p.stats.hits++; room.damage(v, p, h.dmg, h.zone, w.id, { dir: h.dir }); }
  room.emit({ e: 'shot', id: p.id, w: w.id, o: origin.map(r2), h: hits.map((h) => [...h.end.map(r2), h.victim ? 1 : 0, h.n ? h.n.join('') : '']) });
  if (BOLT_ACTION.has(w.id)) p.zoom = 0;
  if (inst.mag === 0 && inst.res > 0) startReload(p, inst, w, 0.25);
  // Verdacht: extreme Blicksprünge direkt vor einem Kopftreffer
  if (p.human && Math.abs(p.yaw - p.lastYaw) > 2.4 && [...byVictim.values()].some((h) => h.head)) room.suspect(p, 'snap-headshot', { d: Math.abs(p.yaw - p.lastYaw) });
}

const r2 = (v) => Math.round(v * 100) / 100;

function startReload(p, inst, w, delay = 0) {
  if (!inst || w.melee || w.cat === 'grenade' || w.cat === 'bomb') return;
  if (p.reloadEnd || inst.mag >= w.mag || inst.res <= 0) return;
  p.reloadEnd = p.simTime + w.reload + delay;
  p.zoom = 0;
}

function trace(room, shooter, o, d, w, rt) {
  const wr = room.world.raycast(o, d, w.range);
  let best = null;
  for (const v of room.players.values()) {
    if (v === shooter || !v.alive) continue;
    const pos = v.posAt(rt);
    if (!pos.alive) continue;
    const r = rayPlayer(o, d, pos.x, pos.y, pos.z, pos.c, wr.dist);
    if (r && (!best || r.t < best.t)) best = { ...r, v };
  }
  const dist = best ? best.t : wr.dist;
  const end = [o[0] + d[0] * dist, o[1] + d[1] * dist, o[2] + d[2] * dist];
  if (!best) return { end, n: wr.hit ? wr.normal : null };
  let dmg = damageAt(w, best.t);
  if (best.zone === 'head') dmg *= w.hs; else if (best.zone === 'legs') dmg *= 0.75;
  return { end, victim: best.v, zone: best.zone, dmg, dir: d };
}

function melee(room, p, w, inp) {
  p.nextFire = p.simTime + 60 / w.rpm;
  const o = p.eye();
  const d = dirFromAngles(p.yaw, p.pitch);
  let best = null;
  for (const v of room.players.values()) {
    if (v === p || !v.alive) continue;
    const pos = v.posAt(clamp(Number(inp.rt) || room.time, room.time - LAG_COMP_MAX, room.time));
    const r = rayPlayer(o, d, pos.x, pos.y, pos.z, pos.c, w.melee);
    let hit = r;
    if (!hit) {
      // etwas großzügiger: Kegel um den Blick
      const tx = pos.x - o[0], ty = pos.y + 1.1 - o[1], tz = pos.z - o[2];
      const dist = Math.hypot(tx, ty, tz);
      if (dist < w.melee + 0.4 && (tx * d[0] + ty * d[1] + tz * d[2]) / dist > 0.88) hit = { t: dist, zone: 'body' };
    }
    if (hit && room.world.raycast(o, d, hit.t).dist >= hit.t - 0.05 && (!best || hit.t < best.t)) best = { ...hit, v };
  }
  room.emit({ e: 'swing', id: p.id, w: w.id });
  if (!best) return;
  let dmg = w.dmg * (best.zone === 'head' ? w.hs : 1);
  // Rückenstich
  const fx = -Math.sin(best.v.yaw), fz = -Math.cos(best.v.yaw);
  if (w.id === 'klinge' && fx * d[0] + fz * d[2] > 0.5) dmg = 180;
  p.stats.hits++;
  room.damage(best.v, p, dmg, best.zone, w.id, { dir: d, melee: true });
}

function throwGrenade(room, p, inst, w) {
  p.nextFire = p.simTime + 1;
  const o = p.eye();
  const d = dirFromAngles(p.yaw, Math.min(1.4, p.pitch + 0.12));
  const sp = 17;
  room.nades.push({
    id: room.nextNade++, owner: p.id, type: w.id, x: o[0] + d[0] * 0.4, y: o[1] + d[1] * 0.4, z: o[2] + d[2] * 0.4,
    vx: d[0] * sp + p.st.vx * 0.5, vy: d[1] * sp + 1.5, vz: d[2] * sp + p.st.vz * 0.5, fuseAt: room.time + w.fuse, until: 0, popped: false,
  });
  room.emit({ e: 'throw', id: p.id, w: w.id });
  p.slots[3].splice(p.gi, 1);
  if (p.slots[3].length) p.gi = Math.min(p.gi, p.slots[3].length - 1);
  else p.equip(p.bestSlot());
}

export function stepGrenades(room, dt) {
  const world = room.world;
  for (const n of room.nades) {
    if (n.popped) continue;
    n.vy -= 20 * dt;
    for (const [axis, v] of [['x', 'vx'], ['y', 'vy'], ['z', 'vz']]) {
      const old = n[axis];
      n[axis] += n[v] * dt;
      if (world.overlap(n.x, n.y - 0.08, n.z, 0.16, 0.08) !== null) {
        n[axis] = old;
        n[v] *= -0.42;
        if (axis === 'y') { n.vx *= 0.75; n.vz *= 0.75; }
        if (Math.abs(n[v]) > 2) room.emit({ e: 'bounce', x: r2(n.x), y: r2(n.y), z: r2(n.z) });
      }
    }
    if (n.y < -20) { n.popped = true; n.dead = true; continue; }
    if (room.time >= n.fuseAt) {
      const w = WEAPONS[n.type];
      n.popped = true;
      if (n.type === 'he') {
        explode(room, n.x, n.y, n.z, w.radius, w.dmg, room.players.get(n.owner), 'he');
        n.dead = true;
      } else if (n.type === 'smoke') {
        n.until = room.time + w.duration;
        room.smokes.push({ x: n.x, y: n.y + 1, z: n.z, r: w.radius, until: n.until });
        room.emit({ e: 'smoke', x: r2(n.x), y: r2(n.y), z: r2(n.z), r: w.radius, d: w.duration });
        n.dead = true;
      }
    }
  }
  room.nades = room.nades.filter((n) => !n.dead);
  room.smokes = room.smokes.filter((s) => s.until > room.time);
}

export function explode(room, x, y, z, radius, maxDmg, attacker, wid) {
  room.emit({ e: 'boom', x: r2(x), y: r2(y), z: r2(z), r: radius, w: wid });
  for (const v of room.players.values()) {
    if (!v.alive) continue;
    const c = [v.st.x, v.st.y + 1, v.st.z];
    const dx = c[0] - x, dy = c[1] - y, dz = c[2] - z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > radius) continue;
    const dir = [dx / (dist || 1), dy / (dist || 1), dz / (dist || 1)];
    const block = room.world.raycast([x, y + 0.2, z], dir, dist);
    if (block.hit && block.dist < dist - 0.4) continue;
    const dmg = maxDmg * Math.pow(1 - dist / radius, 1.4);
    if (dmg < 1) continue;
    room.damage(v, attacker || null, dmg, 'body', wid, { dir, blast: true });
  }
}

// Sichtlinie, die auch Rauch berücksichtigt (für Bots)
export function lineOfSight(room, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const dist = Math.hypot(dx, dy, dz);
  const d = [dx / dist, dy / dist, dz / dist];
  if (room.world.raycast(a, d, dist).dist < dist - 0.1) return false;
  for (const s of room.smokes) {
    // Abstand Rauchzentrum zum Segment
    const t = clamp((s.x - a[0]) * d[0] + (s.y - a[1]) * d[1] + (s.z - a[2]) * d[2], 0, dist);
    const px = a[0] + d[0] * t - s.x, py = a[1] + d[1] * t - s.y, pz = a[2] + d[2] * t - s.z;
    if (px * px + py * py + pz * pz < s.r * s.r * 0.8) return false;
  }
  return true;
}

export { applyArmor };
