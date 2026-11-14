// Geheimes Admin-Panel (Server-Seite). Zugriff nur für Accounts in ADMIN_USERS (Umgebungsvariable,
// kommagetrennt) bzw. config.admins. Jede Aktion wird protokolliert.
import express from 'express';
import * as db from './db.js';
import { log, cleanText } from './security.js';
import { ITEMS, ITEM_BY_ID, CRATES } from '../shared/cosmetics.js';
import { levelInfo } from '../shared/progression.js';
import { grantBattlepass } from './progress.js';
import { CONFIG } from './config.js';

const adminNames = () => new Set([
  ...String(process.env.ADMIN_USERS || '').split(','),
  ...(CONFIG.admins || []),
].map((s) => String(s).trim().toLowerCase()).filter(Boolean));

export const isAdmin = (u) => !!u && adminNames().has(u.name.toLowerCase());
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.trunc(Number(v) || 0)));

export function adminApi(hub) {
  const r = express.Router();
  r.use(express.json({ limit: '16kb' }));
  r.use((req, res, next) => {
    const u = db.sessionUser((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!isAdmin(u)) return res.status(403).json({ error: 'Kein Zugriff' });
    req.admin = u;
    next();
  });

  const summary = (u) => ({
    id: u.id, name: u.name, coins: u.coins, xp: u.xp, level: levelInfo(u.xp).level, crates: u.crates, bpXp: u.bp.xp,
    items: u.inventory.length, itemsTotal: ITEMS.length, banned: !!u.banned, banReason: u.banReason || '', created: u.created,
    matches: u.stats.matches, kills: u.stats.kills, ...hub.presence(u.id),
  });
  const target = (req, res) => {
    const u = db.getUserByName(req.body?.name ?? req.params.name);
    if (!u) { res.status(404).json({ error: 'Account nicht gefunden' }); return null; }
    return u;
  };
  const done = (req, u, what) => {
    db.markDirty();
    log('admin', `${req.admin.name} → ${u.name}: ${what}`);
    hub.notify(u.id, { t: 'profileUpdate', text: what });
    return summary(u);
  };

  r.get('/check', (req, res) => res.json({ ok: true, name: req.admin.name }));
  r.get('/items', (req, res) => res.json(ITEMS.map((i) => ({ id: i.id, name: i.name, type: i.type, rarity: i.rarity }))));
  r.get('/user/:name', (req, res) => { const u = target(req, res); if (u) res.json(summary(u)); });

  r.post('/grant', (req, res) => {
    const u = target(req, res); if (!u) return;
    const b = req.body || {}, parts = [];
    const coins = clampInt(b.coins, -10_000_000, 10_000_000);
    if (coins) { u.coins = Math.max(0, u.coins + coins); parts.push(`${coins > 0 ? '+' : ''}${coins} Münzen`); }
    const xp = clampInt(b.xp, 0, 10_000_000);
    if (xp) { u.xp += xp; parts.push(`+${xp} XP`); }
    const bpXp = clampInt(b.bpXp, 0, 1_000_000);
    if (bpXp) { const got = grantBattlepass(u, bpXp); parts.push(`+${bpXp} Battlepass-XP${got.length ? ` (${got.length} Belohnungen)` : ''}`); }
    for (const [cid, n] of Object.entries(b.crates || {})) {
      const k = clampInt(n, -1000, 1000);
      if (!CRATES[cid] || !k) continue;
      u.crates[cid] = Math.max(0, (u.crates[cid] || 0) + k);
      parts.push(`${k > 0 ? '+' : ''}${k}× ${CRATES[cid].name}`);
    }
    if (Array.isArray(b.items)) for (const id of b.items.slice(0, 200)) if (ITEM_BY_ID[id] && !u.inventory.includes(id)) { u.inventory.push(id); parts.push(ITEM_BY_ID[id].name); }
    if (b.unlockAll) { let n = 0; for (const i of ITEMS) if (!u.inventory.includes(i.id)) { u.inventory.push(i.id); n++; } parts.push(`alle Items freigeschaltet (+${n})`); }
    if (!parts.length) return res.status(400).json({ error: 'Nichts ausgewählt' });
    res.json({ user: done(req, u, parts.join(', ')) });
  });

  r.post('/reset', (req, res) => {
    const u = target(req, res); if (!u) return;
    const what = String(req.body?.what);
    if (what === 'coins') u.coins = 0;
    else if (what === 'crates') u.crates = {};
    else return res.status(400).json({ error: 'Unbekannt' });
    res.json({ user: done(req, u, what === 'coins' ? 'Münzen auf 0 gesetzt' : 'Truhen entfernt') });
  });

  r.post('/ban', (req, res) => {
    const u = target(req, res); if (!u) return;
    if (u.id === req.admin.id) return res.status(400).json({ error: 'Du kannst dich nicht selbst sperren' });
    const ban = !!req.body?.ban;
    u.banned = ban;
    u.banReason = ban ? cleanText(req.body?.reason || 'Regelverstoß', 120) : '';
    if (ban) {
      db.dropUserSessions(u.id);
      const c = hub.byUser.get(u.id);
      if (c) { if (c.room && c.player) c.room.disconnect(c.player); c.send({ t: 'kicked', reason: `Dein Account wurde gesperrt: ${u.banReason}` }); c.ws.close(); }
    }
    db.markDirty();
    log('admin', `${req.admin.name} ${ban ? 'sperrt' : 'entsperrt'} ${u.name}${ban ? ': ' + u.banReason : ''}`);
    res.json({ user: summary(u) });
  });

  r.post('/kick', (req, res) => {
    const u = target(req, res); if (!u) return;
    const c = hub.byUser.get(u.id);
    if (!c?.room || !c.player) return res.status(400).json({ error: 'Spieler ist in keinem Match' });
    c.room.disconnect(c.player);
    c.send({ t: 'kicked', reason: 'Du wurdest vom Admin aus dem Match entfernt.' });
    c.ws.close();
    log('admin', `${req.admin.name} kickt ${u.name}`);
    res.json({ ok: true });
  });

  r.post('/announce', (req, res) => {
    const text = cleanText(req.body?.text, 200);
    if (!text) return res.status(400).json({ error: 'Text fehlt' });
    let n = 0;
    for (const c of hub.allConns()) if (c.user) { c.send({ t: 'toast', text: `📢 ${text}` }); n++; }
    for (const room of hub.rooms.values()) room.system?.(`📢 ${text}`);
    log('admin', `${req.admin.name} Ansage: ${text}`);
    res.json({ ok: true, reached: n });
  });

  r.get('/reports', (req, res) => {
    const list = db.getReports().slice(-100).reverse().map((x, i) => ({
      i, t: x.t, from: db.getUser(x.from)?.name || '?', target: db.getUser(x.target)?.name || '?', reason: x.reason,
      targetBanned: !!db.getUser(x.target)?.banned,
    }));
    res.json(list);
  });
  r.post('/reports/clear', (req, res) => { db.clearReports(); log('admin', `${req.admin.name} leert Meldungen`); res.json({ ok: true }); });

  r.get('/overview', (req, res) => {
    const users = db.allUsers();
    const online = [...hub.byUser.keys()].map((id) => db.getUser(id)).filter(Boolean).map((u) => ({ name: u.name, level: levelInfo(u.xp).level, ...hub.presence(u.id) }));
    res.json({
      accounts: users.length, banned: users.filter((u) => u.banned).length, online,
      rooms: [...hub.rooms.values()].filter((r) => !r.closed).map((r) => ({ ...r.info(), private: r.isPrivate })),
      storage: db.backend, uptime: Math.round(process.uptime()),
    });
  });

  return r;
}
