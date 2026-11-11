// Level, Ränge und Herausforderungen.
export function xpForLevel(level) { return 400 + (level - 1) * 120; } // XP von Level -> Level+1

export function levelInfo(totalXp) {
  let level = 1, xp = totalXp;
  while (xp >= xpForLevel(level) && level < 200) { xp -= xpForLevel(level); level++; }
  return { level, into: xp, need: xpForLevel(level) };
}

export const RANKS = [
  { name: 'Bronze', min: 0, color: '#b0773f' },
  { name: 'Silber', min: 900, color: '#c0c6cf' },
  { name: 'Gold', min: 1050, color: '#f0c040' },
  { name: 'Platin', min: 1200, color: '#4fd1c5' },
  { name: 'Diamant', min: 1350, color: '#6aa8ff' },
  { name: 'Master', min: 1500, color: '#c070ff' },
  { name: 'Elite', min: 1700, color: '#ff5050' },
];

export function rankFor(rating, games) {
  if (!games || games < 3) return { name: 'Unplatziert', color: '#888', placement: 3 - (games || 0) };
  let r = RANKS[0];
  for (const x of RANKS) if (rating >= x.min) r = x;
  return r;
}

export const RANKED_MODES = ['comp5', 'comp2', 'sniper'];

// Herausforderungen: Vorlagen; tägliche und wöchentliche Sets werden aus dem Datum abgeleitet.
const TEMPLATES = [
  { id: 'kills', text: 'Erziele {n} Eliminierungen', daily: 15, weekly: 120 },
  { id: 'hs', text: 'Erziele {n} Kopfschüsse', daily: 6, weekly: 50 },
  { id: 'wins', text: 'Gewinne {n} Matches', daily: 2, weekly: 10 },
  { id: 'matches', text: 'Spiele {n} Matches', daily: 3, weekly: 15 },
  { id: 'sniperKills', text: 'Erziele {n} Eliminierungen mit Scharfschützengewehren', daily: 8, weekly: 60 },
  { id: 'plants', text: 'Platziere oder entschärfe {n} Bomben', daily: 2, weekly: 10 },
  { id: 'infections', text: 'Infiziere {n} Überlebende als Zombie', daily: 5, weekly: 30 },
];

function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function dayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - y) / 86400000 + 1) / 7)}`;
}

export function challengeSet(kind, key) {
  const h = hashStr(kind + key);
  const pool = TEMPLATES.slice();
  const out = [];
  for (let i = 0; i < 3; i++) {
    const idx = (h >>> (i * 5)) % pool.length;
    const t = pool.splice(idx, 1)[0];
    const n = t[kind];
    out.push({ id: t.id, text: t.text.replace('{n}', n), goal: n, xp: kind === 'daily' ? 250 : 1200, coins: kind === 'daily' ? 50 : 300 });
  }
  return out;
}
