// Serverseitiger Spielerzustand. Alles, was spielentscheidend ist, liegt hier – nicht beim Client.
import { newMoveState } from '../shared/physics.js';
import { PLAYER } from '../shared/constants.js';
import { WEAPONS } from '../shared/weapons.js';
import { DEFAULT_LOADOUT } from '../shared/cosmetics.js';

export class Player {
  constructor(id, { user = null, bot = null, name, conn = null }) {
    this.id = id;
    this.userId = user?.id ?? null;
    this.name = name;
    this.bot = bot;
    this.conn = conn;
    this.team = 'N';
    this.loadout = user?.loadout ? structuredClone(user.loadout) : structuredClone(DEFAULT_LOADOUT);
    this.level = 1;
    this.rating = 1000;
    this.st = newMoveState();
    this.yaw = 0; this.pitch = 0;
    this.alive = false;
    this.hp = 0; this.armor = 0; this.helmet = false; this.kit = false;
    this.slots = [null, null, null, [], null]; // 0 primär, 1 sekundär, 2 Nahkampf, 3 Granaten, 4 Bombe
    this.cur = 2; this.gi = 0;
    this.simTime = 0; this.nextFire = 0; this.reloadEnd = 0; this.drawEnd = 0;
    this.shotIdx = 0; this.lastShot = -10; this.zoom = 0; this.prevKeys = 0;
    this.money = 0;
    this.stats = { kills: 0, deaths: 0, assists: 0, hs: 0, damage: 0, score: 0, shots: 0, hits: 0, weaponKills: {}, plants: 0, defuses: 0, infections: 0, sniperKills: 0, mvps: 0 };
    this.inputs = []; this.credit = 2; this.lastSeq = 0; this.lastRt = 0; this.starve = 0;
    this.history = [];
    this.protectUntil = 0;
    this.respawnAt = null;
    this.disconnectedAt = null;
    this.speedMult = 1; this.jumpMult = 1;
    this.dmgBy = new Map();
    this.action = null; // laufende Aktion: Bombe legen/entschärfen
    this.zombie = false; this.zclass = null;
    this.gunLevel = 0;
    this.pick = null; // gewählte Sniper-Waffe
    this.joinedAt = Date.now();
    this.committed = false;
    this.lastYaw = 0;
    this.chatTimes = [];
  }

  get human() { return !this.bot; }
  get connected() { return this.bot || !!this.conn; }

  inst(id, full = true) {
    const w = WEAPONS[id];
    return { id, mag: full ? w.mag : 0, res: full ? w.reserve : 0 };
  }
  give(id) {
    const w = WEAPONS[id];
    if (w.slot === 3) {
      if (!this.slots[3].some((g) => g.id === id)) this.slots[3].push(this.inst(id));
      return;
    }
    this.slots[w.slot] = this.inst(id);
  }
  clearWeapons(keepMelee = true) {
    this.slots = [null, null, keepMelee ? this.slots[2] : null, [], null];
  }
  activeInst() {
    if (this.cur === 3) return this.slots[3][this.gi] || null;
    return this.slots[this.cur];
  }
  activeWeapon() { const i = this.activeInst(); return i ? WEAPONS[i.id] : null; }
  bestSlot() {
    if (this.slots[0]) return 0;
    if (this.slots[1]) return 1;
    return 2;
  }
  equip(slot, draw = true) {
    if (slot === 3 && !this.slots[3].length) return;
    if (slot !== 3 && !this.slots[slot]) return;
    if (this.cur === slot && slot !== 3) return;
    this.cur = slot;
    if (slot === 3) this.gi = Math.min(this.gi, this.slots[3].length - 1);
    this.reloadEnd = 0; this.zoom = 0;
    const w = this.activeWeapon();
    if (draw && w) this.drawEnd = this.simTime + w.draw;
  }

  eye() { return [this.st.x, this.st.y + (this.st.c ? PLAYER.crouchEye : PLAYER.eye), this.st.z]; }

  record(t) {
    this.history.push([t, this.st.x, this.st.y, this.st.z, this.st.c ? 1 : 0, this.alive ? 1 : 0]);
    while (this.history.length > 40) this.history.shift();
  }
  // Position zu einem früheren Zeitpunkt (Lag Compensation)
  posAt(t) {
    const h = this.history;
    if (!h.length) return { x: this.st.x, y: this.st.y, z: this.st.z, c: this.st.c, alive: this.alive };
    if (t >= h[h.length - 1][0]) { const e = h[h.length - 1]; return { x: e[1], y: e[2], z: e[3], c: !!e[4], alive: !!e[5] }; }
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (t >= a[0]) {
        const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
        return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k, z: a[3] + (b[3] - a[3]) * k, c: !!(k < 0.5 ? a[4] : b[4]), alive: !!(a[5] && b[5]) };
      }
    }
    const e = h[0];
    return { x: e[1], y: e[2], z: e[3], c: !!e[4], alive: !!e[5] };
  }

  selfState(room) {
    const s = this.st;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const w = [];
    for (let i = 0; i < 5; i++) {
      if (i === 3) continue;
      const it = this.slots[i];
      if (it) w.push([i, it.id, it.mag, it.res]);
    }
    return {
      x: r3(s.x), y: r3(s.y), z: r3(s.z), vx: r3(s.vx), vy: r3(s.vy), vz: r3(s.vz), g: s.g ? 1 : 0, c: s.c ? 1 : 0,
      hp: Math.max(0, Math.ceil(this.hp)), ar: Math.ceil(this.armor), hm: this.helmet ? 1 : 0, kit: this.kit ? 1 : 0,
      $: this.money, cur: this.cur, gi: this.gi, w, gr: this.slots[3].map((g) => g.id), zoom: this.zoom,
      al: this.alive ? 1 : 0, team: this.team,
      rl: this.reloadEnd > this.simTime ? Math.round((this.reloadEnd - this.simTime) * 100) / 100 : 0,
      act: this.action ? { t: this.action.type, p: Math.min(1, (room.time - this.action.start) / (this.action.end - this.action.start)) } : null,
      ra: this.respawnAt ? Math.max(0, Math.round((this.respawnAt - room.time) * 10) / 10) : null,
      sm: Math.round(this.speedMult * 100) / 100, jm: this.jumpMult,
    };
  }
}
