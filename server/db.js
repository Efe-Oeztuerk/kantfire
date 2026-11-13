// Dauerhafte Speicherung. Zwei Varianten mit derselben Schnittstelle:
//  1) Supabase/PostgreSQL (wenn SUPABASE_URL und SUPABASE_SERVICE_KEY gesetzt sind) – empfohlen für Hosting ohne Festplatte
//  2) JSON-Datei mit atomarem Schreiben (Standard, lokal)
// Gespeichert wird zeilenweise: je Benutzer eine Zeile, dazu "meta" (Namen, Matches, Meldungen) und "sessions".
// Es werden nur geänderte Zeilen geschrieben.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DEFAULT_OWNED, DEFAULT_LOADOUT } from '../shared/cosmetics.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DATA_DIR, 'db.json');
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SB_TABLE = process.env.SUPABASE_TABLE || 'kf_data';
export const backend = SB_URL && SB_KEY ? 'supabase' : 'file';

let data = { users: {}, names: {}, sessions: {}, matches: [], reports: [], nextId: 1 };
let dirty = false;
const saved = new Map(); // Zeilen-ID -> zuletzt gespeicherter Inhalt
let flushing = false;

function rows() {
  const out = [];
  for (const u of Object.values(data.users)) out.push(['u:' + u.id, u]);
  out.push(['meta', { names: data.names, matches: data.matches, reports: data.reports, nextId: data.nextId }]);
  out.push(['sessions', data.sessions]);
  return out;
}

async function sb(pathAndQuery, opts = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${pathAndQuery}`, {
    ...opts,
    // alte JWT-Schlüssel (eyJ…) zusätzlich als Bearer, neue sb_secret_…-Schlüssel nur als apikey
    headers: { apikey: SB_KEY, ...(SB_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}), 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

export async function load() {
  if (backend === 'supabase') {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const res = await sb(`${SB_TABLE}?select=id,data&order=id`, { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
      const batch = await res.json();
      all.push(...batch);
      if (batch.length < 1000) break;
    }
    for (const r of all) {
      saved.set(r.id, JSON.stringify(r.data));
      if (r.id.startsWith('u:')) data.users[r.data.id] = r.data;
      else if (r.id === 'meta') Object.assign(data, r.data);
      else if (r.id === 'sessions') data.sessions = r.data;
    }
    console.log(`[db] Supabase verbunden – ${Object.keys(data.users).length} Accounts geladen`);
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(FILE)) data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  }
  for (const u of Object.values(data.users)) migrateUser(u);
  setInterval(() => flush().catch((e) => console.error('[db] Speichern fehlgeschlagen:', e.message)), 2000).unref();
  if (backend === 'file') process.on('exit', () => { dirty = true; flushFileSync(); });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { dirty = true; try { await flush(); } catch {} process.exit(0); });
}

function flushFileSync() {
  if (!dirty) return;
  dirty = false;
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

export async function flush() {
  if (!dirty || flushing) return;
  if (backend === 'file') return flushFileSync();
  dirty = false;
  flushing = true;
  try {
    const changed = [];
    for (const [id, obj] of rows()) {
      const json = JSON.stringify(obj);
      if (saved.get(id) !== json) changed.push({ id, data: obj, json });
    }
    for (let i = 0; i < changed.length; i += 200) {
      const chunk = changed.slice(i, i + 200);
      await sb(`${SB_TABLE}?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(chunk.map((c) => ({ id: c.id, data: c.data }))) });
      for (const c of chunk) saved.set(c.id, c.json);
    }
  } catch (e) { dirty = true; throw e; } finally { flushing = false; }
}
export function markDirty() { dirty = true; }

export const defaultSettings = () => ({});

function newStats() {
  return { kills: 0, deaths: 0, hs: 0, assists: 0, wins: 0, losses: 0, matches: 0, playtime: 0, shots: 0, hits: 0, weaponKills: {}, plants: 0, defuses: 0, infections: 0, sniperKills: 0 };
}

function migrateUser(u) {
  u.stats ||= newStats();
  for (const [k, v] of Object.entries(newStats())) if (u.stats[k] === undefined) u.stats[k] = v;
  u.modeStats ||= {};
  u.ratings ||= {};
  u.inventory ||= [...DEFAULT_OWNED];
  for (const id of DEFAULT_OWNED) if (!u.inventory.includes(id)) u.inventory.push(id);
  u.loadout ||= structuredClone(DEFAULT_LOADOUT);
  for (const [k, v] of Object.entries(DEFAULT_LOADOUT)) if (u.loadout[k] === undefined) u.loadout[k] = structuredClone(v);
  u.loadout.finishes ||= {};
  u.crates ||= {};
  if (!u.bp || u.bp.season !== 1) u.bp = { season: 1, xp: 0, claimed: [] };
  u.friends ||= [];
  u.requests ||= [];
  u.blocked ||= [];
  u.history ||= [];
  u.challenges ||= {};
  u.settings ||= {};
  u.coins ??= 300;
  u.xp ??= 0;
  u.avatar ||= 0;
}

export function createUser(name, passHash) {
  const id = String(data.nextId++);
  const u = { id, name, pass: passHash, created: Date.now() };
  migrateUser(u);
  data.users[id] = u;
  data.names[name.toLowerCase()] = id;
  markDirty();
  return u;
}

export const getUser = (id) => data.users[id] || null;
export const getUserByName = (name) => data.users[data.names[String(name).toLowerCase()]] || null;
export const allUsers = () => Object.values(data.users);

export function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  data.sessions[token] = { userId, created: Date.now() };
  markDirty();
  return token;
}
export function sessionUser(token) {
  const s = token && data.sessions[token];
  if (!s) return null;
  if (Date.now() - s.created > 1000 * 60 * 60 * 24 * 30) { delete data.sessions[token]; markDirty(); return null; }
  return getUser(s.userId);
}
export function dropSession(token) { delete data.sessions[token]; markDirty(); }

export function addMatch(m) {
  data.matches.push(m);
  if (data.matches.length > 1000) data.matches.splice(0, data.matches.length - 1000);
  markDirty();
}
export function addReport(r) { data.reports.push(r); markDirty(); }
