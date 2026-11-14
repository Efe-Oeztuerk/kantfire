// Geheimes Admin-Panel (Server-Seite). Zugriff nur für Accounts in ADMIN_USERS (Umgebungsvariable,
// kommagetrennt) bzw. config.admins. Jede Aktion wird protokolliert.
import express from 'express';
import * as db from './db.js';
import { log, cleanText } from './security.js';
import { ITEMS, ITEM_BY_ID, CRATES } from '../shared/cosmetics.js';
import { levelInfo } from '../shared/progression.js';
import { grantBattlepass } from './progress.js';
import { isAdmin } from './roles.js';
import { validName } from './security.js';
export { isAdmin };
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
    items: u.inventory.length, itemsTotal: ITEMS.length, banned: db.isBanned(u), banReason: u.banReason || '', bannedUntil: u.bannedUntil || 0, created: u.created,
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
    const hours = clampInt(req.body?.hours, 0, 24 * 365);
    u.banned = ban;
    u.bannedUntil = ban && hours ? Date.now() + hours * 3600_000 : 0;
    u.banReason = ban ? cleanText(req.body?.reason || 'Regelverstoß', 120) : '';
    if (ban) {
      db.dropUserSessions(u.id);
      const c = hub.byUser.get(u.id);
      if (c) { if (c.room && c.player) c.room.disconnect(c.player); c.send({ t: 'kicked', reason: `Dein Account wurde ${hours ? `für ${hours} h ` : ''}gesperrt: ${u.banReason}` }); c.ws.close(); }
    }
    db.markDirty();
    log('admin', `${req.admin.name} ${ban ? 'sperrt' : 'entsperrt'} ${u.name}${ban ? ` (${hours ? hours + ' h' : 'dauerhaft'}): ` + u.banReason : ''}`);
    res.json({ user: summary(u) });
  });

  r.post('/rename', (req, res) => {
    const u = target(req, res); if (!u) return;
    const nn = String(req.body?.newName || '');
    if (!validName(nn)) return res.status(400).json({ error: 'Name: 3–16 Zeichen, nur Buchstaben, Zahlen, _ und -' });
    const other = db.getUserByName(nn);
    if (other && other.id !== u.id) return res.status(409).json({ error: 'Name ist bereits vergeben' });
    const old = u.name;
    db.renameUser(u, nn);
    db.addNotice(u, `Dein Name wurde von einem Admin zu „${nn}“ geändert.`);
    res.json({ user: done(req, u, `umbenannt (vorher ${old})`) });
  });

  r.post('/resetAccount', (req, res) => {
    const u = target(req, res); if (!u) return;
    if (req.body?.confirm !== u.name) return res.status(400).json({ error: 'Zur Bestätigung den Accountnamen exakt eingeben' });
    db.resetUser(u);
    res.json({ user: done(req, u, 'Fortschritt komplett zurückgesetzt') });
  });

  // Doppel-XP/-Münzen für alle (z. B. Wochenende)
  r.get('/event', (req, res) => res.json({ event: db.getEvent() }));
  r.post('/event', (req, res) => {
    const hours = clampInt(req.body?.hours, 0, 24 * 14);
    if (!hours) { db.setEvent(null); log('admin', `${req.admin.name} beendet Event`); return res.json({ event: null }); }
    const xp = [1, 1.5, 2, 3].includes(+req.body?.xp) ? +req.body.xp : 2;
    const coins = [1, 1.5, 2, 3].includes(+req.body?.coins) ? +req.body.coins : 2;
    const ev = { xp, coins, until: Date.now() + hours * 3600_000, name: cleanText(req.body?.name || 'Bonus-Event', 40) };
    db.setEvent(ev);
    for (const c of hub.allConns()) if (c.user) c.send({ t: 'event', event: ev });
    log('admin', `${req.admin.name} startet Event ${ev.name}: XP ×${xp}, Münzen ×${coins}, ${hours} h`);
    res.json({ event: ev });
  });

  // Geschenk an alle Accounts (auch offline – sie sehen beim nächsten Login eine Nachricht)
  r.post('/giftAll', (req, res) => {
    const b = req.body || {};
    const coins = clampInt(b.coins, 0, 1_000_000);
    const crate = CRATES[b.crate] ? b.crate : null, crateN = crate ? clampInt(b.crateN || 1, 1, 100) : 0;
    const item = ITEM_BY_ID[b.item] ? b.item : null;
    if (!coins && !crate && !item) return res.status(400).json({ error: 'Nichts ausgewählt' });
    const parts = [];
    if (coins) parts.push(`${coins} Münzen`);
    if (crate) parts.push(`${crateN}× ${CRATES[crate].name}`);
    if (item) parts.push(ITEM_BY_ID[item].name);
    const text = `Geschenk vom Team: ${parts.join(', ')}${b.message ? ' – ' + cleanText(b.message, 100) : ''}`;
    let n = 0;
    for (const u of db.allUsers()) {
      if (coins) u.coins += coins;
      if (crate) u.crates[crate] = (u.crates[crate] || 0) + crateN;
      if (item && !u.inventory.includes(item)) u.inventory.push(item);
      if (hub.isOnline(u.id)) hub.notify(u.id, { t: 'profileUpdate', text });
      else db.addNotice(u, text);
      n++;
    }
    db.markDirty();
    log('admin', `${req.admin.name} beschenkt ${n} Accounts: ${parts.join(', ')}`);
    res.json({ ok: true, count: n });
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
