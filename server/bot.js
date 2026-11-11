// Einfache serverseitige Bots als Lückenfüller. Sie erzeugen ganz normale Eingaben,
// laufen also durch dieselbe Bewegungs-, Waffen- und Trefferlogik wie echte Spieler.
import { KEY, PLAYER } from '../shared/constants.js';
import { WEAPONS } from '../shared/weapons.js';
import { angleDiff, clamp } from '../shared/util.js';
import { lineOfSight } from './combat.js';
import { inRect } from '../shared/maps.js';

export class Bot {
  constructor(p, room, diff = 0.5) {
    this.p = p; this.room = room; this.diff = clamp(diff, 0.1, 1);
    this.seq = 0;
    this.target = null; this.seenAt = 0; this.acquiredAt = 0; this.err = [0, 0];
    this.path = null; this.pi = 0; this.goal = null; this.repathAt = 0;
    this.stuckPos = [0, 0]; this.stuckT = 0;
    this.strafe = 1; this.strafeUntil = 0;
    this.burst = 0; this.pauseUntil = 0; this.fireToggle = false;
    this.lastKnown = null; this.wanderGoal = null; this.scopeT = 0;
    this.site = null;
  }

  roundStart(mode) {
    this.path = null; this.goal = null; this.target = null; this.lastKnown = null;
    const sites = this.room.map.sites;
    this.site = this.p.team === 'T' ? mode.attackSite : sites[(this.p.id + mode.round) % sites.length];
    this.buy(mode);
  }

  buy(mode) {
    const p = this.p, r = this.room;
    const T = p.team === 'T';
    const m = () => p.money;
    if (m() >= 5800 && Math.random() < 0.18) r.buy(p, 'longbow');
    else if (m() >= 3800) r.buy(p, T ? 'kr47' : 'saber');
    else if (m() >= 2100 && Math.random() < 0.5) r.buy(p, T ? 'falke' : 'u45');
    else if (m() >= 1700) r.buy(p, Math.random() < 0.5 ? 'mk5' : 'u45');
    if (m() >= 1000) r.buy(p, 'vesthelm'); else if (m() >= 650) r.buy(p, 'vest');
    if (!T && m() >= 400 && Math.random() < 0.5) r.buy(p, 'kit');
    if (m() >= 300 && Math.random() < 0.5) r.buy(p, Math.random() < 0.6 ? 'he' : 'smoke');
    if (m() >= 700 && !p.slots[0]) r.buy(p, 'hammer');
  }

  enemies() { return [...this.room.players.values()].filter((q) => q !== this.p && q.alive && (!this.room.mode.teamBased || q.team !== this.p.team) && q.protectUntil <= this.room.time); }

  think() {
    const p = this.p, room = this.room, t = room.time, mode = room.mode;
    const inp = { s: ++this.seq, k: 0, y: p.yaw, p: p.pitch, w: p.cur, rt: t };
    if (!p.alive) return inp;
    const eye = p.eye();

    // Wahrnehmung (alle 5 Ticks)
    if (this.seq % 5 === 0) {
      let best = null, bd = Infinity;
      for (const e of this.enemies()) {
        const d = Math.hypot(e.st.x - p.st.x, e.st.z - p.st.z);
        if (d > 90 || d > bd) continue;
        const head = [e.st.x, e.st.y + (e.st.c ? 1.05 : 1.55), e.st.z];
        // Sichtfeld: hinter sich sehen Bots nur nahe Gegner
        const yawTo = Math.atan2(-(e.st.x - p.st.x), -(e.st.z - p.st.z));
        if (Math.abs(angleDiff(p.yaw, yawTo)) > 1.9 && d > 6) continue;
        if (lineOfSight(room, eye, head) || lineOfSight(room, eye, [e.st.x, e.st.y + 1.0, e.st.z])) { best = e; bd = d; }
      }
      if (best && best !== this.target) {
        this.acquiredAt = t;
        const e = 0.25 * (1.1 - this.diff);
        this.err = [(Math.random() - 0.5) * e, (Math.random() - 0.5) * e * 0.6];
      }
      if (best) { this.seenAt = t; this.lastKnown = [best.st.x, best.st.y, best.st.z]; }
      this.target = best || (t - this.seenAt < 1.2 ? this.target : null);
      if (this.target && !this.target.alive) this.target = null;
    }

    // Waffenwahl
    let slot = p.zombie ? 2 : p.slots[0] ? 0 : p.slots[1] ? 1 : 2;
    if (p.cur === 3 && p.slots[3].length && t - this.acquiredAt < 0.1) slot = 3;
    inp.w = slot;
    const w = WEAPONS[p.slots[slot]?.id] || null;

    // Bewegungsziel
    let moveTo = null, useHeld = false;
    const tgt = this.target;
    if (tgt) {
      const d = Math.hypot(tgt.st.x - p.st.x, tgt.st.z - p.st.z);
      if (p.zombie || w?.melee) moveTo = [tgt.st.x, tgt.st.y, tgt.st.z];
      else if (d > 35 && w && w.cat !== 'sniper') moveTo = [tgt.st.x, tgt.st.y, tgt.st.z];
    } else {
      const goal = this.chooseGoal();
      if (goal && goal.use) useHeld = true;
      if (goal && !goal.stay) moveTo = goal.pos;
    }
    if (useHeld) inp.k |= KEY.USE;

    // Zielen
    let wantYaw = p.yaw, wantPitch = 0;
    if (tgt) {
      const aimY = tgt.st.y + (this.diff > 0.6 && Math.random() < 0.6 ? (tgt.st.c ? 1.0 : 1.5) : (tgt.st.c ? 0.8 : 1.15));
      const dx = tgt.st.x - eye[0], dy = aimY - eye[1], dz = tgt.st.z - eye[2];
      wantYaw = Math.atan2(-dx, -dz) + this.err[0];
      wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) + this.err[1];
      this.err[0] *= 0.93; this.err[1] *= 0.93;
    } else if (this.path && this.path[this.pi]) {
      const n = this.path[this.pi];
      wantYaw = Math.atan2(-(n[0] - p.st.x), -(n[2] - p.st.z));
    }
    const maxTurn = (2.5 + 9 * this.diff) / 30;
    p.yaw = p.yaw + clamp(angleDiff(p.yaw, wantYaw), -maxTurn, maxTurn);
    inp.y = p.yaw;
    inp.p = p.pitch + clamp(wantPitch - p.pitch, -maxTurn, maxTurn);

    // Schießen
    if (tgt && w && t - this.acquiredAt > 0.55 - this.diff * 0.35) {
      const d = Math.hypot(tgt.st.x - p.st.x, tgt.st.z - p.st.z);
      const err = Math.abs(angleDiff(inp.y, wantYaw - this.err[0])) + Math.abs(inp.p - (wantPitch - this.err[1]));
      const tol = Math.atan(0.45 / Math.max(d, 1)) + 0.015;
      if (w.scope && (w.cat === 'sniper' || w.cat === 'dmr') && p.zoom === 0 && d > 6) {
        if (t - this.scopeT > 0.4) { inp.k |= KEY.ALT; this.scopeT = t; }
      } else if (w.cat === 'grenade') {
        if (d > 8 && d < 25 && err < 0.2) inp.k |= KEY.FIRE;
      } else if (err < tol && t >= this.pauseUntil && (!w.melee || d < 2.2)) {
        if (w.auto) {
          inp.k |= KEY.FIRE;
          if (d > 18 && ++this.burst > 4) { this.burst = 0; this.pauseUntil = t + 0.35; }
        } else {
          this.fireToggle = !this.fireToggle;
          if (this.fireToggle) inp.k |= KEY.FIRE;
        }
      }
      // Ausweichen
      if (!p.zombie && !w.melee && w.cat !== 'sniper') {
        if (t > this.strafeUntil) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeUntil = t + 0.35 + Math.random() * 0.6; }
        if (Math.random() < 0.85) inp.k |= this.strafe > 0 ? KEY.R : KEY.L;
        if (d > 20 && this.diff > 0.5 && w.cat === 'rifle' && Math.random() < 0.02) inp.k |= KEY.CROUCH;
      }
    }

    // Nachladen
    const inst = p.slots[slot];
    if (inst && w && !w.melee && w.cat !== 'grenade' && (inst.mag === 0 || (!tgt && inst.mag < w.mag * 0.4)) && inst.res > 0 && !p.reloadEnd) inp.k |= KEY.RELOAD;

    // Laufen entlang des Pfads
    if (moveTo && !(useHeld && p.action)) this.follow(inp, moveTo);
    return inp;
  }

  chooseGoal() {
    const p = this.p, room = this.room, mode = room.mode, t = room.time;
    const name = mode.constructor.name;
    if (name === 'BombMode') {
      if (mode.phase === 'freeze') return null;
      const b = mode.bomb || {};
      if (p.team === 'T') {
        if (b.s === 'dropped') return { pos: [b.x, b.y, b.z] };
        if (p.slots[4]) {
          const site = this.site || room.map.sites[0];
          const inSite = inRect(site, p.st.x, p.st.z) || room.map.sites.some((s) => inRect(s, p.st.x, p.st.z));
          if (inSite && p.st.g) return { stay: true, use: true };
          return { pos: siteCenter(site, p.id) };
        }
        if (b.s === 'planted') return { pos: this.near([b.x, b.y, b.z], 6) };
        return { pos: siteCenter(this.site || room.map.sites[0], p.id) };
      }
      if (b.s === 'planted') {
        const d = Math.hypot(p.st.x - b.x, p.st.z - b.z);
        if (d < 1.5) return { stay: true, use: true };
        return { pos: [b.x, b.y, b.z] };
      }
      return { pos: siteCenter(this.site || room.map.sites[0], p.id) };
    }
    if (name === 'ZombieMode' && p.zombie) {
      const humans = [...room.players.values()].filter((q) => q.alive && !q.zombie);
      humans.sort((a, b) => Math.hypot(a.st.x - p.st.x, a.st.z - p.st.z) - Math.hypot(b.st.x - p.st.x, b.st.z - p.st.z));
      if (humans[0]) return { pos: [humans[0].st.x, humans[0].st.y, humans[0].st.z] };
    }
    if (this.lastKnown && t - this.seenAt < 6 && !(name === 'ZombieMode')) return { pos: this.lastKnown };
    if (!this.wanderGoal || Math.hypot(this.wanderGoal[0] - p.st.x, this.wanderGoal[2] - p.st.z) < 2 || t > (this.wanderUntil || 0)) {
      this.wanderGoal = room.nav.randomPoint();
      this.wanderUntil = t + 20;
    }
    return { pos: this.wanderGoal };
  }

  near(pos, r) {
    if (!this.guard || Math.hypot(this.guard[0] - pos[0], this.guard[2] - pos[2]) > r * 1.5) {
      this.guard = [pos[0] + (Math.random() - 0.5) * r, pos[1], pos[2] + (Math.random() - 0.5) * r];
    }
    return this.guard;
  }

  follow(inp, dest) {
    const p = this.p, t = this.room.time;
    const changed = !this.goal || Math.hypot(this.goal[0] - dest[0], this.goal[2] - dest[2]) > 2;
    if (changed || !this.path || t > this.repathAt) {
      this.goal = dest;
      this.path = this.room.nav.path([p.st.x, p.st.y, p.st.z], dest);
      this.pi = Math.min(1, (this.path?.length || 1) - 1);
      this.repathAt = t + 2.5 + Math.random();
    }
    let next = this.path?.[this.pi];
    if (!next) { next = dest; }
    if (Math.hypot(next[0] - p.st.x, next[2] - p.st.z) < 0.8 && this.path && this.pi < this.path.length - 1) { this.pi++; next = this.path[this.pi]; }
    const dx = next[0] - p.st.x, dz = next[2] - p.st.z, dl = Math.hypot(dx, dz);
    if (dl < 0.3) return;
    const mx = dx / dl, mz = dz / dl;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const f = mx * fx + mz * fz, r = mx * rx + mz * rz;
    inp.k &= ~(KEY.F | KEY.B | KEY.L | KEY.R);
    if (f > 0.35) inp.k |= KEY.F; else if (f < -0.35) inp.k |= KEY.B;
    if (r > 0.35) inp.k |= KEY.R; else if (r < -0.35) inp.k |= KEY.L;
    if (next[1] - p.st.y > 0.6 && dl < 2.2) inp.k |= KEY.JUMP;
    // Festhängen erkennen
    if (Math.hypot(p.st.x - this.stuckPos[0], p.st.z - this.stuckPos[1]) > 0.6) { this.stuckPos = [p.st.x, p.st.z]; this.stuckT = t; }
    else if (t - this.stuckT > 1.2) {
      inp.k |= KEY.JUMP;
      if (t - this.stuckT > 2.5) { this.path = null; this.wanderGoal = null; this.stuckT = t; }
    }
  }
}

function siteCenter(s, seed) {
  const fx = ((seed * 37) % 10) / 10, fz = ((seed * 61) % 10) / 10;
  return [s.min[0] + (s.max[0] - s.min[0]) * (0.25 + fx * 0.5), 0, s.min[1] + (s.max[1] - s.min[1]) * (0.25 + fz * 0.5)];
}
