// Ein Raum = ein laufendes Match auf einer Map. Fester Tick, serverautoritär.
import { World, simulate } from '../shared/physics.js';
import { getMap, inRect } from '../shared/maps.js';
import { TICK_DT, TICK_RATE, MODES, KEY, MOVE, RECONNECT_GRACE } from '../shared/constants.js';
import { WEAPONS, GEAR, moveMult, applyArmor } from '../shared/weapons.js';
import { clamp } from '../shared/util.js';
import { Player } from './player.js';
import { handleWeapon, stepGrenades } from './combat.js';
import { createMode } from './modes/index.js';
import { Bot } from './bot.js';
import { Nav } from './nav.js';
import { log } from './security.js';
import { commitMatch } from './progress.js';
import { isAdmin } from './roles.js';
import { modeConfig, CONFIG } from './config.js';

const BOT_NAMES = ['Kantig', 'Blocki', 'Quader', 'Pixel', 'Würfel', 'Ziegel', 'Bolzen', 'Funke', 'Schotter', 'Nebel', 'Raster', 'Splitter', 'Kiesel', 'Sturm', 'Kobalt', 'Granit'];

export class Room {
  constructor(hub, { id, mode, map, name, isPrivate = false, password = '', ranked = false, host = null, bots = true, botDifficulty, overrides = {}, startNow = true }) {
    this.hub = hub;
    this.id = id;
    this.modeId = mode;
    this.mapId = map;
    this.map = getMap(map);
    this.world = new World(this.map);
    this.nav = new Nav(this.map, this.world);
    this.name = name || `${MODES[mode].name} · ${this.map.name}`;
    this.isPrivate = isPrivate;
    this.password = password || '';
    this.ranked = ranked;
    this.hostUserId = host;
    this.fillBots = bots;
    this.botDifficulty = botDifficulty ?? CONFIG.matchmaking.botDifficulty;
    this.max = MODES[mode].max;
    this.overrides = overrides;
    this.players = new Map();
    this.nextId = 1;
    this.time = 0;
    this.tickNo = 0;
    this.events = [];
    this.nades = []; this.nextNade = 1; this.smokes = [];
    this.drops = []; this.nextDrop = 1;
    this.chat = [];
    this.started = false;
    this.ended = false;
    this.createdAt = Date.now();
    this.matchStart = null;
    this.rosterDirty = true;
    this.mode = createMode(startNow ? mode : 'warmup', this, modeConfig(mode, overrides));
    if (startNow) this.startMatch();
    this.timer = setInterval(() => this.safeTick(), 1000 / TICK_RATE);
    log('room', `Raum ${id} erstellt`, { mode, map, ranked, isPrivate });
  }

  get status() { return this.ended ? 'beendet' : this.started ? 'läuft' : 'Aufwärmen'; }
  humans() { return [...this.players.values()].filter((p) => p.human); }

  info() {
    return {
      id: this.id, name: this.name, mode: this.modeId, map: this.mapId, players: this.humans().length, bots: this.players.size - this.humans().length,
      max: this.max, botDiff: this.botDifficulty, region: CONFIG.server.region, locked: !!this.password, status: this.status, ranked: this.ranked, private: this.isPrivate,
    };
  }

  startMatch() {
    this.started = true;
    this.matchStart = Date.now();
    const cfg = modeConfig(this.modeId, this.overrides);
    this.mode = createMode(this.modeId, this, cfg);
    for (const p of this.players.values()) { p.team = 'N'; p.stats = new Player(0, { name: '' }).stats; p.alive = false; p.money = 0; p.zombie = false; }
    // Teams (ausgeglichen nach Rating) bilden
    this.mode.assignTeams([...this.players.values()]);
    this.mode.start();
    this.rosterDirty = true;
    this.broadcast({ t: 'matchStart', mode: this.modeId, cfg: this.mode.clientConfig() });
  }

  // ---------------------------------------------------------------- Spieler
  addHuman(conn, user) {
    let p = [...this.players.values()].find((x) => x.userId === user.id);
    if (p) { this.attach(p, conn); return p; }
    if (this.humans().length >= this.max) return null;
    // Platz für Menschen machen: einen Bot entfernen
    if (this.players.size >= this.max) {
      const bot = [...this.players.values()].reverse().find((x) => x.bot);
      if (bot) this.removePlayer(bot, 'Platz für Spieler');
    }
    p = new Player(this.nextId++, { user, name: user.name, conn });
    p.level = user.levelCache || 1;
    p.admin = isAdmin(user);
    p.rating = user.ratings?.[this.modeId]?.r ?? 1000;
    this.players.set(p.id, p);
    p.team = this.mode.chooseTeam(p);
    this.attach(p, conn);
    this.mode.onJoin(p);
    this.rosterDirty = true;
    this.system(`${p.name} ist beigetreten.`);
    return p;
  }

  attach(p, conn) {
    p.conn = conn;
    p.disconnectedAt = null;
    p.inputs = []; p.credit = 2;
    conn.room = this; conn.player = p;
    conn.send({
      t: 'welcome', room: this.info(), you: p.id, map: this.mapId, mode: this.modeId, time: this.time,
      cfg: this.mode.clientConfig(), host: this.hostUserId === p.userId, started: this.started,
    });
    this.sendRoster(true);
  }

  addBot() {
    if (this.players.size >= this.max) return null;
    const used = new Set([...this.players.values()].map((p) => p.name));
    const name = (BOT_NAMES.find((n) => !used.has('BOT ' + n)) || 'Bot' + this.nextId);
    const p = new Player(this.nextId++, { name: 'BOT ' + name, bot: null });
    p.bot = new Bot(p, this, this.botDifficulty);
    p.loadout = randomLoadout();
    this.players.set(p.id, p);
    p.team = this.mode.chooseTeam(p);
    this.mode.onJoin(p);
    this.rosterDirty = true;
    return p;
  }

  setBotDifficulty(v) {
    this.botDifficulty = Math.max(0.05, Math.min(1, Number(v) || 0.4));
    for (const p of this.players.values()) if (p.bot) p.bot.diff = this.botDifficulty;
    this.rosterDirty = true;
  }

  fillWithBots() {
    if (!this.fillBots) return;
    while (this.players.size < this.max) if (!this.addBot()) break;
  }

  removePlayer(p, reason = 'verlassen') {
    if (!this.players.has(p.id)) return;
    if (p.human && this.started && !p.committed) commitMatch(this, p, { left: true });
    this.dropAll(p);
    this.players.delete(p.id);
    this.mode.onLeave(p);
    if (p.conn) { p.conn.room = null; p.conn.player = null; }
    this.rosterDirty = true;
    if (p.human) this.system(`${p.name} hat das Spiel verlassen.`);
    log('room', `${p.name} verlässt ${this.id} (${reason})`);
    // Matchmaking-Räume halten Bots als Ersatz bereit
    if (p.human && this.started && !this.ended && this.fillBots && this.humans().length > 0) this.addBot();
  }

  disconnect(p) {
    p.conn = null;
    p.disconnectedAt = Date.now();
    this.rosterDirty = true;
  }

  // ---------------------------------------------------------------- Eingaben
  pushInput(p, inp) {
    if (typeof inp.s !== 'number' || inp.s <= p.lastSeq) return;
    if (p.inputs.length > 30) { this.suspect(p, 'input-flood', { q: p.inputs.length }); p.inputs.length = 0; return; }
    p.inputs.push(inp);
  }

  applyInput(p, inp) {
    p.simTime += TICK_DT;
    p.lastSeq = inp.s;
    p.lastRt = inp.rt;
    if (!p.alive) { p.prevKeys = inp.k | 0; return; }
    p.lastYaw = p.yaw;
    p.yaw = Number.isFinite(inp.y) ? inp.y : p.yaw;
    p.pitch = clamp(Number.isFinite(inp.p) ? inp.p : p.pitch, -1.56, 1.56);
    // Waffenwechsel
    if (Number.isInteger(inp.w) && inp.w >= 0 && inp.w <= 4) {
      if (inp.w === 3 && Number.isInteger(inp.g) && p.slots[3][inp.g]) {
        if (p.cur !== 3 || p.gi !== inp.g) { p.gi = inp.g; p.cur = -1; p.equip(3); }
      } else if (inp.w !== p.cur) p.equip(inp.w);
    }
    const w = p.activeWeapon();
    const frozen = this.mode.frozen(p) || (p.action && (inp.k & KEY.USE));
    const s = p.st;
    simulate(s, inp, TICK_DT, this.world, { speedMult: moveMult(w, p.zoom, p.speedMult), frozen, noSprint: p.zoom > 0 });
    if (this.map.killFloor && s.y < MOVE.killY && p.alive) this.damage(p, null, 999, 'body', 'fall', {});
    // Benutzen (Bombe, Aufheben)
    this.mode.onUse?.(p, !!(inp.k & KEY.USE), !(p.prevKeys & KEY.USE) && !!(inp.k & KEY.USE));
    if ((inp.k & KEY.USE) && !(p.prevKeys & KEY.USE)) this.tryPickup(p, true);
    if ((inp.k & KEY.DROP) && !(p.prevKeys & KEY.DROP)) this.dropCurrent(p);
    handleWeapon(this, p, inp);
    p.prevKeys = inp.k | 0;
  }

  // ---------------------------------------------------------------- Tick
  safeTick() {
    try { this.tick(); } catch (e) { log('error', `Tick-Fehler in ${this.id}: ${e.stack}`); }
  }

  tick() {
    this.time += TICK_DT;
    this.tickNo++;
    const now = Date.now();
    for (const p of [...this.players.values()]) {
      if (p.bot) {
        const inp = p.bot.think();
        this.applyInput(p, inp);
      } else {
        // Input-Guthaben: max. ein Input pro Tick im Mittel (verhindert Speedhacks durch Input-Flut)
        p.credit = Math.min(p.credit + 1, 6);
        let n = 0;
        while (p.inputs.length && p.credit >= 1 && n < 4) { this.applyInput(p, p.inputs.shift()); p.credit--; n++; }
        if (!n) {
          p.starve++;
          // Kein Input mehr (Lag/Abbruch): mit neutraler Eingabe weitersimulieren, damit niemand in der Luft "hängt"
          if (p.starve > 4 && p.alive) { simulate(p.st, { k: 0, y: p.yaw }, TICK_DT, this.world, { speedMult: 1, frozen: this.mode.frozen(p) }); p.simTime += TICK_DT; }
        } else p.starve = 0;
        if (p.disconnectedAt && now - p.disconnectedAt > RECONNECT_GRACE * 1000) this.removePlayer(p, 'Zeitüberschreitung');
      }
      if (p.alive && p.human) this.tryPickup(p, false);
    }
    for (const p of this.players.values()) p.record(this.time);
    stepGrenades(this, TICK_DT);
    this.mode.tick(TICK_DT);
    this.sendSnapshots();
    if (this.tickNo % TICK_RATE === 0) {
      this.sendRoster(false);
      if (!this.humans().length && (this.started || Date.now() - this.createdAt > 60000)) this.close('leer');
    }
  }

  sendSnapshots() {
    const ps = [];
    for (const p of this.players.values()) {
      const s = p.st;
      let f = 0;
      if (p.alive) f |= 1; if (s.c) f |= 2; if (s.g) f |= 4; if (p.zoom) f |= 8; if (p.zombie) f |= 16;
      if (p.protectUntil > this.time) f |= 32; if (p.action?.type === 'plant') f |= 64; if (p.action?.type === 'defuse') f |= 128;
      if (p.prevKeys & KEY.WALK) f |= 256; if (p.reloadEnd > p.simTime) f |= 512;
      const inst = p.activeInst();
      ps.push([p.id, r3(s.x), r3(s.y), r3(s.z), r3(p.yaw), r3(p.pitch), f, inst ? inst.id : '', p.team]);
    }
    const g = this.mode.state();
    const nades = this.nades.map((n) => [n.id, n.type, r2(n.x), r2(n.y), r2(n.z)]);
    const drops = this.drops.map((d) => [d.id, d.wid, r2(d.x), r2(d.y), r2(d.z)]);
    const evs = this.events;
    this.events = [];
    for (const p of this.players.values()) {
      if (!p.conn) continue;
      const ev = evs.filter((e) => (e._to == null || e._to === p.id) && (e._team == null || e._team === p.team)).map(stripPriv);
      p.conn.send({ t: 's', st: r3(this.time), a: p.lastSeq, me: p.selfState(this), ps, g, n: nades, d: drops, ev });
    }
  }

  sendRoster(force) {
    if (!force && !this.rosterDirty && this.tickNo % (TICK_RATE * 2) !== 0) return;
    this.rosterDirty = false;
    const list = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, team: p.team, bot: !!p.bot, lo: p.loadout, lvl: p.level, uid: p.userId, adm: !!p.admin,
      k: p.stats.kills, d: p.stats.deaths, a: p.stats.assists, sc: p.stats.score, hs: p.stats.hs, mvp: p.stats.mvps,
      ping: p.conn?.ping ?? 0, dc: !!p.disconnectedAt, gl: p.gunLevel, z: p.zombie,
    }));
    for (const p of this.players.values()) {
      if (!p.conn) continue;
      // Geld nur für eigenes Team sichtbar
      p.conn.send({ t: 'roster', list: list.map((x) => (this.players.get(x.id)?.team === p.team && this.mode.teamBased ? { ...x, $: this.players.get(x.id).money } : x)), host: this.hostUserId === p.userId, started: this.started });
    }
  }

  broadcast(msg) { for (const p of this.players.values()) p.conn?.send(msg); }
  emit(ev, to = null, team = null) { if (to != null) ev._to = to; if (team != null) ev._team = team; this.events.push(ev); }
  system(text) { this.broadcast({ t: 'chat', sys: true, text }); }

  suspect(p, kind, data) {
    log('cheat', `Verdacht ${kind} bei ${p.name} (${p.userId}) in ${this.id}`, data);
  }

  // ---------------------------------------------------------------- Kampf
  damage(v, att, amount, zone, wid, opts = {}) {
    if (!v.alive || this.ended) return;
    if (v.protectUntil > this.time && wid !== 'fall') return;
    if (att && att !== v && !this.mode.canDamage(att, v, wid)) return;
    amount = this.mode.modifyDamage ? this.mode.modifyDamage(att, v, amount, zone, wid, opts) : amount;
    if (amount <= 0) return;
    const w = WEAPONS[wid];
    let hp = Math.round(amount), ar = 0;
    if (this.mode.armorEnabled && v.armor > 0 && w) ({ hp, armor: ar } = applyArmor(amount, zone, v.armor, v.helmet, w.pen));
    v.armor = Math.max(0, v.armor - ar);
    const dealt = Math.min(v.hp, hp);
    v.hp -= hp;
    if (att && att !== v) {
      v.dmgBy.set(att.id, (v.dmgBy.get(att.id) || 0) + dealt);
      att.stats.damage += dealt;
      this.emit({ e: 'hit', v: v.id, dmg: Math.round(dealt), z: zone, kill: v.hp <= 0 ? 1 : 0, x: r2(v.st.x), y: r2(v.st.y + (zone === 'head' ? 1.65 : 1.1)), zz: r2(v.st.z) }, att.id);
    }
    const ad = att ? [att.st.x - v.st.x, att.st.z - v.st.z] : null;
    this.emit({ e: 'hurt', dmg: Math.round(dealt), from: ad ? Math.atan2(-ad[0], -ad[1]) : null }, v.id);
    this.emit({ e: 'blood', x: r2(v.st.x), y: r2(v.st.y + (zone === 'head' ? 1.6 : zone === 'legs' ? 0.5 : 1.1)), z: r2(v.st.z), h: zone === 'head' ? 1 : 0 });
    if (v.hp <= 0) this.kill(v, att, wid, zone === 'head');
  }

  kill(v, att, wid, hs) {
    v.alive = false; v.hp = 0; v.action = null; v.zoom = 0;
    v.stats.deaths++;
    const teamKill = att && att !== v && att.team === v.team && this.mode.teamBased;
    if (att && att !== v && !teamKill) {
      att.stats.kills++;
      if (hs) att.stats.hs++;
      att.stats.weaponKills[wid] = (att.stats.weaponKills[wid] || 0) + 1;
      if (WEAPONS[wid]?.cat === 'sniper' || wid === 'lynx') att.stats.sniperKills++;
    }
    let assister = null;
    for (const [aid, dmg] of v.dmgBy) {
      const a = this.players.get(aid);
      if (a && a !== att && dmg >= 40 && a.team !== v.team) { a.stats.assists++; assister = a; }
    }
    v.dmgBy.clear();
    this.emit({ e: 'kill', k: att?.id ?? null, v: v.id, w: wid, hs: hs ? 1 : 0, a: assister?.id ?? null, tk: teamKill ? 1 : 0 });
    this.dropAll(v, true);
    this.mode.onKill(v, att, wid, hs, teamKill);
    this.rosterDirty = true;
  }

  // ---------------------------------------------------------------- Waffen am Boden
  dropAll(p, onDeath = false) {
    if (!this.mode.allowDrops) return;
    if (onDeath && (p.slots[0] || p.slots[1])) this.spawnDrop(p, p.slots[0] || p.slots[1]);
    if (p.slots[4]) { this.mode.onBombDrop?.(p); p.slots[4] = null; }
  }
  spawnDrop(p, inst) {
    this.drops.push({ id: this.nextDrop++, wid: inst.id, mag: inst.mag, res: inst.res, x: p.st.x, y: p.st.y + 0.1, z: p.st.z, t: this.time });
    if (this.drops.length > 30) this.drops.shift();
  }
  dropCurrent(p) {
    if (!this.mode.allowDrops || !p.alive) return;
    if (p.cur === 4 && p.slots[4]) { this.mode.onBombDrop?.(p, true); p.slots[4] = null; p.equip(p.bestSlot()); return; }
    if (p.cur !== 0 && p.cur !== 1) return;
    const inst = p.slots[p.cur];
    if (!inst) return;
    const d = { id: this.nextDrop++, wid: inst.id, mag: inst.mag, res: inst.res, x: p.st.x - Math.sin(p.yaw) * 1.2, y: p.st.y + 0.1, z: p.st.z - Math.cos(p.yaw) * 1.2, t: this.time, by: p.id };
    this.drops.push(d);
    p.slots[p.cur] = null;
    p.equip(p.bestSlot());
  }
  tryPickup(p, pressed) {
    if (!this.mode.allowDrops || !p.alive) return;
    for (const d of this.drops) {
      if (Math.hypot(d.x - p.st.x, d.z - p.st.z) > 1.3 || Math.abs(d.y - p.st.y) > 1.5) continue;
      if (d.by === p.id && this.time - d.t < 1.5) continue;
      const w = WEAPONS[d.wid];
      const slot = w.slot;
      if (p.slots[slot] && !pressed) continue;
      if (p.slots[slot]) { // tauschen
        const old = p.slots[slot];
        this.drops.push({ id: this.nextDrop++, wid: old.id, mag: old.mag, res: old.res, x: p.st.x, y: p.st.y + 0.1, z: p.st.z, t: this.time, by: p.id });
      }
      p.slots[slot] = { id: d.wid, mag: d.mag, res: d.res };
      this.drops = this.drops.filter((x) => x !== d);
      if (pressed || p.cur === 2) p.equip(slot);
      this.emit({ e: 'pickup', w: d.wid }, p.id);
      return;
    }
  }

  // ---------------------------------------------------------------- Kaufen
  buy(p, item) {
    if (!this.mode.canBuy(p)) return this.toast(p, 'Kaufen ist gerade nicht möglich.');
    const w = WEAPONS[item], g = GEAR[item];
    const def = w || g;
    if (!def || !def.price) return;
    if (g?.team && g.team !== p.team) return this.toast(p, 'Nur für Verteidiger.');
    let price = def.price;
    if (item === 'vesthelm' && p.armor >= 100) price = 350; // nur Helm nachkaufen
    if (p.money < price) return this.toast(p, 'Nicht genug Geld.');
    if (w) {
      if (w.slot === 3) {
        if (p.slots[3].some((x) => x.id === item)) return this.toast(p, 'Bereits vorhanden.');
        if (p.slots[3].length >= 3) return this.toast(p, 'Maximal 3 Granaten.');
      }
      if (w.slot !== 3 && p.slots[w.slot]?.id === item) return this.toast(p, 'Bereits ausgerüstet.');
      if (w.slot !== 3 && p.slots[w.slot]) this.spawnDrop(p, p.slots[w.slot]);
      p.give(item);
      if (w.slot !== 3) p.equip(w.slot);
    } else if (item === 'vest') {
      if (p.armor >= 100) return this.toast(p, 'Weste bereits voll.');
      p.armor = 100;
    } else if (item === 'vesthelm') {
      if (p.armor >= 100 && p.helmet) return this.toast(p, 'Bereits vorhanden.');
      p.armor = 100; p.helmet = true;
    } else if (item === 'kit') {
      if (p.kit) return this.toast(p, 'Bereits vorhanden.');
      p.kit = true;
    }
    p.money -= price;
    this.emit({ e: 'bought', item }, p.id);
  }

  toast(p, text) { p.conn?.send({ t: 'toast', text }); }

  emote(p) {
    if (!p.alive || p.zombie) return;
    if (this.time - (p.lastEmote || -9) < 3) return;
    p.lastEmote = this.time;
    this.emit({ e: 'emote', id: p.id, em: p.loadout.emote || 'e_wave' });
  }

  chatMsg(p, text, team) {
    const now = Date.now();
    p.chatTimes = p.chatTimes.filter((t) => now - t < 5000);
    if (p.chatTimes.length >= 5) return this.toast(p, 'Zu viele Nachrichten.');
    p.chatTimes.push(now);
    const msg = { t: 'chat', from: p.name, adm: !!p.admin, uid: p.userId, team: team ? p.team : null, alive: p.alive, text };
    for (const q of this.players.values()) {
      if (!q.conn) continue;
      if (team && q.team !== p.team) continue;
      if (q.userId && this.hub.isBlocked(q.userId, p.userId)) continue;
      q.conn.send(msg);
    }
  }

  // ---------------------------------------------------------------- Spawns
  // Zufällige Auswahl unter den sicheren Punkten (weit weg von Gegnern, nicht belegt, nicht der letzte Punkt)
  pickSpawn(p, list) {
    if (!list?.length) return [0, 0, 0];
    const enemies = [...this.players.values()].filter((q) => q !== p && q.alive && (!this.mode.teamBased || q.team !== p.team));
    const others = [...this.players.values()].filter((q) => q !== p && q.alive);
    const scored = list.map((s) => {
      let minE = 999;
      for (const e of enemies) minE = Math.min(minE, Math.hypot(e.st.x - s[0], e.st.z - s[2]));
      const occupied = others.some((o) => Math.hypot(o.st.x - s[0], o.st.z - s[2]) < 1.6);
      const same = p.lastSpawn && Math.hypot(p.lastSpawn[0] - s[0], p.lastSpawn[2] - s[2]) < 3;
      return { s, minE, bad: occupied || same };
    }).filter((x) => !x.bad);
    const pool = scored.length ? scored : list.map((s) => ({ s, minE: 999 }));
    pool.sort((a, b) => b.minE - a.minE);
    // sichere Hälfte (mind. 12 m zum nächsten Gegner, wenn möglich), daraus zufällig
    const safe = pool.filter((x) => x.minE >= 12);
    const cand = (safe.length ? safe : pool).slice(0, Math.max(3, Math.ceil((safe.length || pool.length) * 0.6)));
    const pick = cand[Math.floor(Math.random() * cand.length)].s;
    p.lastSpawn = pick;
    return pick;
  }

  place(p, pos, yawToward) {
    const gy = this.world.groundHeight(pos[0], pos[2], pos[1] + 1.5) ?? pos[1];
    Object.assign(p.st, { x: pos[0] + (Math.random() - 0.5) * 0.3, y: gy + 0.01, z: pos[2] + (Math.random() - 0.5) * 0.3, vx: 0, vy: 0, vz: 0, g: true, c: false });
    p.yaw = yawToward != null ? yawToward : Math.atan2(p.st.x, p.st.z);
    p.history.length = 0;
    p.conn?.send({ t: 'spawn', x: p.st.x, y: p.st.y, z: p.st.z, yaw: p.yaw });
  }

  inBuyZone(p) {
    const z = this.map.buyZones[p.team];
    return z ? inRect(z, p.st.x, p.st.z) : true;
  }

  // ---------------------------------------------------------------- Ende
  endMatch(result) {
    if (this.ended) return;
    this.ended = true;
    const summary = commitMatch(this, null, { result });
    this.broadcast({ t: 'end', result, summary });
    log('room', `Match ${this.id} beendet`, result);
    setTimeout(() => this.close('Matchende'), 20000);
  }

  close(reason) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    for (const p of this.players.values()) if (p.conn) { p.conn.send({ t: 'roomClosed', reason }); p.conn.room = null; p.conn.player = null; }
    this.hub.rooms.delete(this.id);
    log('room', `Raum ${this.id} geschlossen (${reason})`);
  }
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
function stripPriv(e) { if (e._to == null && e._team == null) return e; const { _to, _team, ...rest } = e; return rest; }

function randomLoadout() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return { outfit: pick(['o_basic', 'o_urban', 'o_desert', 'o_forest', 'o_night']), face: pick(['h_smile', 'h_serious', 'h_cool', 'h_angry']), hat: pick(['a_none', 'a_cap', 'a_beanie', 'a_headset', 'a_helmet']), gloves: pick(['g_black', 'g_tan', 'g_red']), finishes: {} };
}
