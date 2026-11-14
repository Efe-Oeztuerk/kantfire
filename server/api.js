// HTTP-API: Accounts, Profil, Einstellungen, Inventar, Shop, Ranglisten, Freunde, Server-Browser.
import express from 'express';
import * as db from './db.js';
import { hashPassword, checkPassword, rateLimit, validName, cleanText, log } from './security.js';
import { ITEMS, ITEM_BY_ID, shopPrice, inShop, inCrates, CRATES, DUPLICATE_REFUND, RARITIES, SLOT_TYPES } from '../shared/cosmetics.js';
import crypto from 'crypto';
import { WEAPONS } from '../shared/weapons.js';
import { levelInfo, rankFor, RANKED_MODES } from '../shared/progression.js';
import { ensureChallenges } from './progress.js';

export function api(hub) {
  const r = express.Router();
  r.use(express.json({ limit: '64kb' }));

  const ipOf = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const auth = (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const u = db.sessionUser(token);
    if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (!rateLimit('api:' + u.id, 300)) return res.status(429).json({ error: 'Zu viele Anfragen' });
    req.user = u; req.token = token;
    next();
  };

  r.get('/ping', (req, res) => res.json({ t: Date.now() }));

  r.post('/register', (req, res) => {
    if (!rateLimit('reg:' + ipOf(req), Number(process.env.AUTH_RATE || 5))) return res.status(429).json({ error: 'Zu viele Versuche. Bitte warte eine Minute.' });
    const { name, password } = req.body || {};
    if (!validName(name)) return res.status(400).json({ error: 'Name: 3–16 Zeichen, nur Buchstaben, Zahlen, _ und -' });
    if (typeof password !== 'string' || password.length < 6 || password.length > 100) return res.status(400).json({ error: 'Passwort: mindestens 6 Zeichen' });
    if (db.getUserByName(name)) return res.status(409).json({ error: 'Name ist bereits vergeben' });
    const u = db.createUser(name, hashPassword(password));
    log('auth', `Registrierung ${name}`);
    res.json({ token: db.newSession(u.id) });
  });

  r.post('/login', (req, res) => {
    if (!rateLimit('login:' + ipOf(req), Number(process.env.AUTH_RATE || 10))) return res.status(429).json({ error: 'Zu viele Versuche. Bitte warte eine Minute.' });
    const { name, password } = req.body || {};
    const u = db.getUserByName(name);
    if (!u || typeof password !== 'string' || !checkPassword(password, u.pass)) {
      log('auth', `Fehlgeschlagener Login für ${String(name).slice(0, 20)} von ${ipOf(req)}`);
      return res.status(401).json({ error: 'Name oder Passwort falsch' });
    }
    if (u.banned) return res.status(403).json({ error: `Dieser Account ist gesperrt${u.banReason ? ': ' + u.banReason : ''}.` });
    res.json({ token: db.newSession(u.id) });
  });

  r.post('/logout', auth, (req, res) => { db.dropSession(req.token); res.json({ ok: true }); });

  r.get('/me', auth, (req, res) => {
    const u = req.user;
    ensureChallenges(u);
    res.json(privateProfile(u, hub));
  });

  r.put('/settings', auth, (req, res) => {
    const s = req.body?.settings;
    if (!s || typeof s !== 'object' || JSON.stringify(s).length > 16000) return res.status(400).json({ error: 'Ungültig' });
    req.user.settings = s;
    db.markDirty();
    res.json({ ok: true });
  });

  r.put('/loadout', auth, (req, res) => {
    const u = req.user, lo = req.body?.loadout || {};
    const owned = (id, type) => u.inventory.includes(id) && ITEM_BY_ID[id]?.type === type;
    for (const [slot, type] of Object.entries(SLOT_TYPES)) if (lo[slot] && owned(lo[slot], type)) u.loadout[slot] = lo[slot];
    if (lo.finishes && typeof lo.finishes === 'object') {
      for (const [w, f] of Object.entries(lo.finishes)) {
        if (!WEAPONS[w]) continue;
        if (f === null) delete u.loadout.finishes[w];
        else if (owned(f, 'finish')) u.loadout.finishes[w] = f;
      }
    }
    db.markDirty();
    res.json({ loadout: u.loadout });
  });

  r.get('/shop', auth, (req, res) => {
    res.json({ coins: req.user.coins, crates: Object.values(CRATES), items: ITEMS.filter((i) => inShop(i) && !req.user.inventory.includes(i.id)).map((i) => ({ ...i, price: shopPrice(i) })) });
  });
  r.post('/shop/buy', auth, (req, res) => {
    const u = req.user, item = ITEM_BY_ID[req.body?.item];
    if (!item) return res.status(404).json({ error: 'Unbekannter Gegenstand' });
    if (!inShop(item)) return res.status(400).json({ error: 'Nur über Battlepass oder Truhen erhältlich' });
    if (u.inventory.includes(item.id)) return res.status(400).json({ error: 'Bereits im Inventar' });
    const price = shopPrice(item);
    if (u.coins < price) return res.status(400).json({ error: 'Nicht genug Münzen' });
    u.coins -= price; u.inventory.push(item.id);
    db.markDirty();
    res.json({ ok: true, coins: u.coins, inventory: u.inventory });
  });

  // Truhe öffnen: Ergebnis wird ausschließlich auf dem Server ausgelost
  r.post('/crate/open', auth, (req, res) => {
    const u = req.user, c = CRATES[req.body?.crate];
    if (!c) return res.status(404).json({ error: 'Unbekannte Truhe' });
    if (!rateLimit('crate:' + u.id, 30)) return res.status(429).json({ error: 'Bitte kurz warten' });
    if ((u.crates[c.id] || 0) > 0) u.crates[c.id]--;
    else if (u.coins >= c.price) u.coins -= c.price;
    else return res.status(400).json({ error: 'Nicht genug Münzen' });
    const rarities = Object.keys(RARITIES);
    const total = Object.values(c.weights).reduce((a, b) => a + b, 0);
    let roll = crypto.randomInt(0, 1_000_000) / 1_000_000 * total, rarity = 'common';
    for (const r of rarities) { roll -= c.weights[r] || 0; if (roll < 0) { rarity = r; break; } }
    let pool = [];
    for (let i = rarities.indexOf(rarity); i >= 0 && !pool.length; i--) pool = ITEMS.filter((it) => inCrates(it) && c.types.includes(it.type) && it.rarity === rarities[i] && it.id !== 'f_stock');
    const item = pool[crypto.randomInt(0, pool.length)];
    let dup = false, refund = 0;
    if (u.inventory.includes(item.id)) { dup = true; refund = Math.round(shopPrice(item) * DUPLICATE_REFUND); u.coins += refund; }
    else u.inventory.push(item.id);
    db.markDirty();
    log('crate', `${u.name} öffnet ${c.id}: ${item.id}${dup ? ' (Duplikat)' : ''}`);
    res.json({ item, dup, refund, coins: u.coins, crates: u.crates, inventory: u.inventory });
  });

  r.get('/leaderboard', auth, (req, res) => {
    const mode = String(req.query.mode || 'comp5');
    let rows;
    if (mode === 'level') {
      rows = db.allUsers().map((u) => ({ name: u.name, value: u.xp, level: levelInfo(u.xp).level })).sort((a, b) => b.value - a.value);
    } else {
      if (!RANKED_MODES.includes(mode)) return res.status(400).json({ error: 'Modus ohne Rangliste' });
      rows = db.allUsers().filter((u) => u.ratings[mode]?.games >= 3).map((u) => {
        const r = u.ratings[mode];
        return { name: u.name, value: r.r, games: r.games, rank: rankFor(r.r, r.games), level: levelInfo(u.xp).level };
      }).sort((a, b) => b.value - a.value);
    }
    const me = rows.findIndex((x) => x.name === req.user.name);
    res.json({ rows: rows.slice(0, 100), me: me >= 0 ? { pos: me + 1, ...rows[me] } : null });
  });

  r.get('/profile/:name', auth, (req, res) => {
    const u = db.getUserByName(req.params.name);
    if (!u) return res.status(404).json({ error: 'Spieler nicht gefunden' });
    res.json(publicProfile(u, hub));
  });

  r.get('/search', auth, (req, res) => {
    const q = String(req.query.q || '').toLowerCase().slice(0, 16);
    if (q.length < 2) return res.json({ rows: [] });
    res.json({ rows: db.allUsers().filter((u) => u.name.toLowerCase().includes(q) && u.id !== req.user.id).slice(0, 20).map((u) => ({ id: u.id, name: u.name, level: levelInfo(u.xp).level, ...hub.presence(u.id) })) });
  });

  // Freunde
  r.post('/friends/request', auth, (req, res) => {
    const u = req.user, t = db.getUserByName(req.body?.name);
    if (!t || t.id === u.id) return res.status(404).json({ error: 'Spieler nicht gefunden' });
    if (u.friends.includes(t.id)) return res.status(400).json({ error: 'Ihr seid bereits befreundet' });
    if (t.blocked.includes(u.id)) return res.json({ ok: true }); // still ignorieren
    if (u.requests.includes(t.id)) { makeFriends(u, t); hub.notify(t.id, { t: 'friendUpdate' }); return res.json({ ok: true, accepted: true }); }
    if (!t.requests.includes(u.id)) t.requests.push(u.id);
    db.markDirty();
    hub.notify(t.id, { t: 'friendRequest', from: u.name });
    res.json({ ok: true });
  });
  r.post('/friends/accept', auth, (req, res) => {
    const u = req.user, t = db.getUser(String(req.body?.id));
    if (!t || !u.requests.includes(t.id)) return res.status(404).json({ error: 'Keine Anfrage' });
    makeFriends(u, t);
    hub.notify(t.id, { t: 'friendUpdate' });
    res.json({ ok: true });
  });
  r.post('/friends/decline', auth, (req, res) => { req.user.requests = req.user.requests.filter((x) => x !== String(req.body?.id)); db.markDirty(); res.json({ ok: true }); });
  r.post('/friends/remove', auth, (req, res) => {
    const u = req.user, id = String(req.body?.id), t = db.getUser(id);
    u.friends = u.friends.filter((x) => x !== id);
    if (t) t.friends = t.friends.filter((x) => x !== u.id);
    db.markDirty();
    res.json({ ok: true });
  });
  r.post('/block', auth, (req, res) => {
    const u = req.user, id = String(req.body?.id);
    if (!db.getUser(id)) return res.status(404).json({ error: 'Spieler nicht gefunden' });
    if (req.body?.unblock) u.blocked = u.blocked.filter((x) => x !== id);
    else if (!u.blocked.includes(id)) { u.blocked.push(id); u.friends = u.friends.filter((x) => x !== id); u.requests = u.requests.filter((x) => x !== id); }
    db.markDirty();
    res.json({ ok: true, blocked: u.blocked });
  });
  r.post('/report', auth, (req, res) => {
    if (!rateLimit('report:' + req.user.id, 5)) return res.status(429).json({ error: 'Zu viele Meldungen' });
    const t = db.getUserByName(req.body?.name);
    if (!t) return res.status(404).json({ error: 'Spieler nicht gefunden' });
    const reason = cleanText(req.body?.reason, 200);
    db.addReport({ t: Date.now(), from: req.user.id, target: t.id, reason });
    log('report', `${req.user.name} meldet ${t.name}: ${reason}`);
    res.json({ ok: true });
  });

  r.get('/servers', (req, res) => res.json({ region: hub.region, rooms: hub.list() }));

  return r;
}

function makeFriends(a, b) {
  if (!a.friends.includes(b.id)) a.friends.push(b.id);
  if (!b.friends.includes(a.id)) b.friends.push(a.id);
  a.requests = a.requests.filter((x) => x !== b.id);
  b.requests = b.requests.filter((x) => x !== a.id);
  db.markDirty();
}

function favWeapon(st) {
  let best = null, n = 0;
  for (const [w, k] of Object.entries(st.weaponKills || {})) if (k > n && WEAPONS[w]) { n = k; best = w; }
  return best ? { id: best, name: WEAPONS[best].name, kills: n } : null;
}

export function publicProfile(u, hub) {
  const ranks = {};
  for (const m of RANKED_MODES) { const r = u.ratings[m]; ranks[m] = { rating: r?.r ?? 1000, games: r?.games ?? 0, rank: rankFor(r?.r ?? 1000, r?.games ?? 0) }; }
  return {
    id: u.id, name: u.name, avatar: u.avatar, created: u.created, xp: u.xp, level: levelInfo(u.xp),
    stats: u.stats, modeStats: u.modeStats, ranks, favorite: favWeapon(u.stats), loadout: u.loadout, history: u.history.slice(0, 15), ...hub.presence(u.id),
  };
}

function privateProfile(u, hub) {
  const lookup = (ids) => ids.map((id) => db.getUser(id)).filter(Boolean).map((f) => ({ id: f.id, name: f.name, level: levelInfo(f.xp).level, ...hub.presence(f.id) }));
  return {
    ...publicProfile(u, hub), coins: u.coins, inventory: u.inventory, settings: u.settings, challenges: u.challenges, crates: u.crates, bp: u.bp,
    friends: lookup(u.friends), requests: lookup(u.requests), blocked: lookup(u.blocked),
  };
}
