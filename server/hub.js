// WebSocket-Hub: Verbindungen, Online-Status, Räume, Matchmaking, Lobbys, Einladungen.
import { WebSocketServer } from 'ws';
import * as db from './db.js';
import { Room } from './room.js';
import { MODES, MODE_MAPS } from '../shared/constants.js';
import { MAP_DEFS } from '../shared/maps.js';
import { randomCode } from '../shared/util.js';
import { CONFIG } from './config.js';
import { log, rateLimit, cleanText } from './security.js';
import { levelInfo } from '../shared/progression.js';

class Conn {
  constructor(ws, ip) { this.ws = ws; this.ip = ip; this.user = null; this.room = null; this.player = null; this.ping = 0; this.pingSent = 0; this.alive = true; }
  send(msg) {
    if (this.ws.readyState !== 1) return;
    if (msg.t === 's' && this.ws.bufferedAmount > 512 * 1024) return; // überlastete Verbindung: Snapshot auslassen
    this.ws.send(JSON.stringify(msg));
  }
}

export class Hub {
  constructor(server) {
    this.rooms = new Map();
    this.byUser = new Map();
    this.queue = new Map(Object.keys(MODES).map((m) => [m, []]));
    this.wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
    setInterval(() => this.matchmake(), 1000).unref();
    setInterval(() => this.heartbeat(), 2000).unref();
  }

  isOnline(uid) { return this.byUser.has(uid); }
  presence(uid) {
    const c = this.byUser.get(uid);
    if (!c) return { online: false };
    if (c.room) return { online: true, status: 'Im Spiel', room: c.room.isPrivate ? null : c.room.id, mode: c.room.modeId };
    if (this.inQueue(c)) return { online: true, status: 'Sucht Match' };
    return { online: true, status: 'Im Menü' };
  }
  notify(uid, msg) { this.byUser.get(uid)?.send(msg); }
  isBlocked(viewer, sender) { const u = db.getUser(viewer); return !!(u && sender && u.blocked.includes(sender)); }

  onConnection(ws, req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const c = new Conn(ws, ip);
    ws._conn = c;
    ws.on('pong', () => { c.alive = true; if (c.pingSent) c.ping = Date.now() - c.pingSent; });
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      // grobes Rate Limit für alles außer Eingaben
      if (msg.t !== 'i' && msg.t !== 'ping' && !rateLimit('ws:' + ip, 600)) return;
      try { this.handle(c, msg); } catch (e) { log('error', `WS-Fehler: ${e.stack}`); }
    });
    ws.on('close', () => this.onClose(c));
    ws.on('error', () => {});
  }

  heartbeat() {
    for (const c of this.allConns()) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false; c.pingSent = Date.now();
      try { c.ws.ping(); } catch {}
    }
  }
  *allConns() { for (const ws of this.wss.clients) if (ws._conn) yield ws._conn; }

  onClose(c) {
    this.leaveQueue(c);
    if (c.room && c.player) c.room.disconnect(c.player);
    if (c.user && this.byUser.get(c.user.id) === c) { this.byUser.delete(c.user.id); this.pushPresence(c.user.id); }
  }

  pushPresence(uid) {
    const u = db.getUser(uid);
    if (!u) return;
    const p = this.presence(uid);
    for (const f of u.friends) this.notify(f, { t: 'presence', id: uid, ...p });
  }

  handle(c, m) {
    if (m.t === 'ping') return c.send({ t: 'pong', c: m.c, st: c.room ? c.room.time : 0, ping: c.ping });
    if (m.t === 'auth') {
      const u = db.sessionUser(m.token);
      if (!u) return c.send({ t: 'authFail' });
      const old = this.byUser.get(u.id);
      if (old && old !== c) { old.send({ t: 'kicked', reason: 'Anmeldung an anderem Ort' }); old.user = null; old.ws.close(); }
      c.user = u;
      u.levelCache = levelInfo(u.xp).level;
      this.byUser.set(u.id, c);
      c.send({ t: 'authed', id: u.id, name: u.name });
      this.pushPresence(u.id);
      // Reconnect: noch laufendes Match wieder aufnehmen
      for (const r of this.rooms.values()) {
        const p = [...r.players.values()].find((x) => x.userId === u.id);
        if (p && !r.ended) { c.send({ t: 'rejoin', room: r.info() }); r.attach(p, c); break; }
      }
      return;
    }
    if (!c.user) return;
    const u = c.user;
    switch (m.t) {
      case 'i': if (c.room && c.player) c.room.pushInput(c.player, m); break;
      case 'queue': this.enqueue(c, m.mode); break;
      case 'unqueue': this.leaveQueue(c); c.send({ t: 'queue', state: 'idle' }); break;
      case 'create': this.createCustom(c, m); break;
      case 'join': this.joinRoom(c, m.id, m.password); break;
      case 'leave': if (c.room && c.player) c.room.removePlayer(c.player, 'verlassen'); c.room = null; c.player = null; c.send({ t: 'left' }); this.pushPresence(u.id); break;
      case 'start': if (c.room && c.room.hostUserId === u.id && !c.room.started) { c.room.fillWithBots(); c.room.startMatch(); } break;
      case 'team': if (c.room?.mode.switchTeam) c.room.mode.switchTeam(c.player, m.team); break;
      case 'botAdd': if (c.room && c.room.hostUserId === u.id) c.room.addBot(); break;
      case 'botKick': if (c.room && c.room.hostUserId === u.id) { const b = [...c.room.players.values()].reverse().find((p) => p.bot); if (b) c.room.removePlayer(b, 'gekickt'); } break;
      case 'buy': if (c.room && c.player) c.room.buy(c.player, String(m.item)); break;
      case 'pick': if (c.room?.mode.pick && c.player) c.room.mode.pick(c.player, String(m.w)); break;
      case 'chat': { const text = cleanText(m.text, 140); if (text && c.room && c.player) c.room.chatMsg(c.player, text, !!m.team); break; }
      case 'invite': this.invite(c, String(m.to)); break;
    }
  }

  // ------------------------------------------------------------ Matchmaking
  inQueue(c) { for (const q of this.queue.values()) if (q.some((e) => e.conn === c)) return true; return false; }
  leaveQueue(c) { for (const [k, q] of this.queue) this.queue.set(k, q.filter((e) => e.conn !== c)); }
  enqueue(c, mode) {
    if (!MODES[mode]) return;
    if (c.room) return c.send({ t: 'toast', text: 'Du bist bereits in einem Spiel.' });
    this.leaveQueue(c);
    const rating = c.user.ratings?.[mode]?.r ?? 1000;
    this.queue.get(mode).push({ conn: c, user: c.user, since: Date.now(), rating });
    c.send({ t: 'queue', state: 'searching', mode });
    this.pushPresence(c.user.id);
  }

  matchmake() {
    const wait = CONFIG.matchmaking.waitBeforeBots * 1000;
    for (const [mode, q] of this.queue) {
      const alive = q.filter((e) => e.conn.ws.readyState === 1 && !e.conn.room);
      this.queue.set(mode, alive);
      if (!alive.length) continue;
      const def = MODES[mode];
      // Laufende öffentliche Matchmaking-Räume mit freien Plätzen bevorzugen (FFA-Modi)
      if (!def.teams || mode === 'zombie') {
        for (const r of this.rooms.values()) {
          if (r.modeId !== mode || r.isPrivate || r.password || r.ended || !r.ranked && r.hostUserId) continue;
          while (alive.length && r.humans().length < r.max) { const e = alive.shift(); this.putInRoom(e.conn, r); }
        }
      }
      for (const e of alive) e.conn.send({ t: 'queue', state: 'searching', mode, waited: Math.round((Date.now() - e.since) / 1000), count: alive.length, need: def.max });
      if (!alive.length) { this.queue.set(mode, []); continue; }
      const oldest = Math.min(...alive.map((e) => e.since));
      if (alive.length >= def.max || Date.now() - oldest >= wait) {
        // ähnliche Spielstärke zusammen: nach Rating sortieren und das Fenster um den am längsten Wartenden nehmen
        const sorted = alive.slice().sort((a, b) => a.rating - b.rating);
        const anchor = sorted.findIndex((e) => e.since === oldest);
        const start = Math.max(0, Math.min(anchor - Math.floor(def.max / 2), sorted.length - def.max));
        const group = sorted.slice(start, start + def.max);
        const room = this.createRoom({ mode, ranked: def.ranked, bots: CONFIG.matchmaking.fillWithBots });
        for (const e of group) this.putInRoom(e.conn, room, false);
        room.fillWithBots();
        room.startMatch();
        this.queue.set(mode, alive.filter((e) => !group.includes(e)));
      } else this.queue.set(mode, alive);
    }
  }

  createRoom(opts) {
    if (this.rooms.size >= CONFIG.server.maxRooms) return null;
    let id;
    do id = randomCode(6); while (this.rooms.has(id));
    const maps = MODE_MAPS[opts.mode];
    const map = opts.map && maps.includes(opts.map) ? opts.map : maps[Math.floor(Math.random() * maps.length)];
    const room = new Room(this, { id, startNow: false, ...opts, map });
    this.rooms.set(id, room);
    return room;
  }

  putInRoom(c, room, notifyQueue = true) {
    this.leaveQueue(c);
    if (c.room && c.room !== room && c.player) c.room.removePlayer(c.player, 'Raumwechsel');
    const p = room.addHuman(c, c.user);
    if (!p) return c.send({ t: 'toast', text: 'Der Server ist voll.' });
    if (notifyQueue) c.send({ t: 'queue', state: 'found' });
    this.pushPresence(c.user.id);
  }

  createCustom(c, m) {
    if (!MODES[m.mode]) return;
    if (!rateLimit('create:' + c.user.id, 6)) return c.send({ t: 'toast', text: 'Bitte kurz warten.' });
    const room = this.createRoom({
      mode: m.mode, map: MAP_DEFS[m.map] ? m.map : undefined, name: cleanText(m.name, 40) || `${c.user.name}s ${m.private ? 'Lobby' : 'Server'}`,
      isPrivate: !!m.private, password: cleanText(m.password, 30), ranked: false, host: c.user.id, bots: m.bots !== false,
      botDifficulty: Number.isFinite(m.diff) ? m.diff : undefined, overrides: sanitizeOverrides(m.mode, m.rules),
    });
    if (!room) return c.send({ t: 'toast', text: 'Keine freien Server-Slots.' });
    this.putInRoom(c, room, false);
  }

  joinRoom(c, id, password) {
    const r = this.rooms.get(String(id || '').toUpperCase());
    if (!r || r.ended) return c.send({ t: 'toast', text: 'Lobby/Server nicht gefunden.' });
    if (r.password && r.password !== password && !r.players.has(c.player?.id)) return c.send({ t: 'needPassword', id: r.id });
    this.putInRoom(c, r, false);
  }

  invite(c, toId) {
    const u = c.user;
    if (!u.friends.includes(toId)) return c.send({ t: 'toast', text: 'Nur Freunde können eingeladen werden.' });
    if (!c.room) return c.send({ t: 'toast', text: 'Erstelle zuerst eine Lobby oder tritt einem Spiel bei.' });
    if (!rateLimit('invite:' + u.id, 20)) return;
    this.notify(toId, { t: 'invite', from: u.name, room: c.room.id, mode: c.room.modeId, password: c.room.password || '' });
    c.send({ t: 'toast', text: 'Einladung gesendet.' });
  }

  list() { return [...this.rooms.values()].filter((r) => !r.isPrivate && !r.closed).map((r) => r.info()); }
}

// Nur bekannte Zahlenregeln aus der Lobby übernehmen
function sanitizeOverrides(mode, rules) {
  if (!rules || typeof rules !== 'object') return {};
  const out = {};
  const allow = {
    sniper: { teams: 'bool', oneShot: 'bool', scoreLimit: [500, 20000], timeLimit: [60, 3600] },
    gungame: { timeLimit: [60, 3600] },
    zombie: { rounds: [1, 9], roundTime: [60, 600] },
    comp5: { maxRounds: [2, 30], winRounds: [2, 16], roundTime: [30, 300], startMoney: [0, 16000] },
    comp2: { maxRounds: [2, 30], winRounds: [2, 16], roundTime: [30, 300], startMoney: [0, 16000] },
  }[mode] || {};
  for (const [k, v] of Object.entries(allow)) {
    if (rules[k] === undefined) continue;
    if (v === 'bool') out[k] = !!rules[k];
    else { const n = Number(rules[k]); if (Number.isFinite(n)) out[k] = Math.max(v[0], Math.min(v[1], Math.round(n))); }
  }
  return out;
}
