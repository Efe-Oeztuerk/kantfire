// Match-Ergebnisse dauerhaft speichern: Statistiken, XP, Level, Münzen, Herausforderungen, Rangpunkte, Matchhistorie.
import * as db from './db.js';
import { levelInfo, challengeSet, dayKey, weekKey, rankFor, RANKED_MODES } from '../shared/progression.js';
import { LEVEL_UNLOCKS } from '../shared/cosmetics.js';
import { log } from './security.js';

export function commitMatch(room, single, { left = false, result = null } = {}) {
  if (!room.started) return [];
  const mode = room.mode;
  const humans = single ? [single] : room.humans().filter((p) => !p.committed);
  const ranked = room.ranked && RANKED_MODES.includes(room.modeId) && !single;
  const deltas = ranked ? ratingDeltas(room) : new Map();
  const summary = [];
  for (const p of humans) {
    const u = db.getUser(p.userId);
    if (!u) continue;
    p.committed = true;
    const won = !left && mode.didWin(p);
    const draw = !left && mode.isDraw();
    const s = p.stats;
    const playtime = Math.round((Date.now() - Math.max(p.joinedAt, room.matchStart || p.joinedAt)) / 1000);
    // Statistiken
    const st = u.stats;
    st.kills += s.kills; st.deaths += s.deaths; st.hs += s.hs; st.assists += s.assists;
    st.shots += s.shots; st.hits += s.hits; st.playtime += playtime; st.matches++;
    st.plants += s.plants; st.defuses += s.defuses; st.infections += s.infections; st.sniperKills += s.sniperKills;
    if (won) st.wins++; else if (!draw) st.losses++;
    for (const [w, n] of Object.entries(s.weaponKills)) st.weaponKills[w] = (st.weaponKills[w] || 0) + n;
    const ms = (u.modeStats[room.modeId] ||= { kills: 0, deaths: 0, wins: 0, losses: 0, matches: 0, hs: 0 });
    ms.kills += s.kills; ms.deaths += s.deaths; ms.hs += s.hs; ms.matches++;
    if (won) ms.wins++; else if (!draw) ms.losses++;
    // XP und Münzen
    let xp = left ? 10 : 60;
    xp += s.kills * 15 + s.hs * 5 + s.assists * 5 + s.plants * 20 + s.defuses * 25 + s.infections * 10;
    if (won) xp += 150; else if (draw) xp += 75;
    xp = Math.min(xp, 1500);
    const before = levelInfo(u.xp).level;
    u.xp += xp;
    let coins = Math.floor(xp / 8);
    // Herausforderungen
    const done = progressChallenges(u, { kills: s.kills, hs: s.hs, wins: won ? 1 : 0, matches: left ? 0 : 1, sniperKills: s.sniperKills, plants: s.plants + s.defuses, infections: s.infections });
    for (const c of done) { u.xp += c.xp; coins += c.coins; }
    u.coins += coins;
    const after = levelInfo(u.xp).level;
    const unlocked = [];
    for (let l = before + 1; l <= after; l++) {
      const item = LEVEL_UNLOCKS[l];
      if (item && !u.inventory.includes(item)) { u.inventory.push(item); unlocked.push(item); }
      u.coins += 100;
    }
    // Rangpunkte
    let rd = null;
    if (ranked && deltas.has(p.id)) {
      const r = (u.ratings[room.modeId] ||= { r: 1000, games: 0 });
      rd = deltas.get(p.id);
      r.r = Math.round(r.r + rd); r.games++;
    }
    // Matchhistorie
    u.history.unshift({
      t: Date.now(), mode: room.modeId, map: room.mapId, won, draw, left, k: s.kills, d: s.deaths, a: s.assists, hs: s.hs, score: s.score,
      rd: rd !== null ? Math.round(rd) : null, res: result ? shortResult(result, p) : null,
    });
    u.history.length = Math.min(u.history.length, 30);
    db.markDirty();
    summary.push({
      id: p.id, name: p.name, won, draw, xp, coins, levelUp: after > before ? after : null, unlocked, challenges: done.map((c) => c.text),
      rating: ranked ? { delta: Math.round(rd ?? 0), now: u.ratings[room.modeId].r, rank: rankFor(u.ratings[room.modeId].r, u.ratings[room.modeId].games).name } : null,
    });
    // Auffällige Kopfschussquote protokollieren
    if (s.kills >= 15 && s.hs / s.kills > 0.85) log('cheat', `Hohe Kopfschussquote ${p.name}`, { k: s.kills, hs: s.hs });
  }
  if (!single) {
    db.addMatch({ id: room.id, t: Date.now(), mode: room.modeId, map: room.mapId, ranked, result, players: [...room.players.values()].map((p) => ({ uid: p.userId, name: p.name, bot: !!p.bot, team: p.team, ...pick(p.stats) })) });
  }
  return summary;
}

function pick(s) { return { k: s.kills, d: s.deaths, a: s.assists, hs: s.hs, sc: s.score }; }
function shortResult(r, p) {
  if (r.score) return `${r.score.T ?? ''}:${r.score.C ?? ''}`;
  if (r.winnerName) return `Sieger: ${r.winnerName}`;
  if (r.wins) return `Überlebende ${r.wins.humans} : ${r.wins.zombies} Zombies`;
  return null;
}

function ratingDeltas(room) {
  const mode = room.mode, K = 32;
  const ps = [...room.players.values()];
  const rating = (p) => (p.bot ? 950 + room.botDifficulty * 300 : p.rating);
  const out = new Map();
  if (mode.teamBased) {
    const avg = (team) => { const l = ps.filter((p) => p.team === team); return l.reduce((a, p) => a + rating(p), 0) / Math.max(1, l.length); };
    const rt = avg('T'), rc = avg('C');
    for (const p of ps) {
      const mine = p.team === 'T' ? rt : rc, other = p.team === 'T' ? rc : rt;
      const exp = 1 / (1 + Math.pow(10, (other - mine) / 400));
      const s = mode.isDraw() ? 0.5 : mode.didWin(p) ? 1 : 0;
      // leichter Leistungsbonus
      const perf = Math.max(-4, Math.min(4, (p.stats.kills - p.stats.deaths) * 0.4));
      out.set(p.id, K * (s - exp) + perf);
    }
  } else {
    const sorted = ps.slice().sort((a, b) => b.stats.score - a.stats.score);
    for (const p of ps) {
      let sum = 0;
      for (const q of ps) {
        if (q === p) continue;
        const exp = 1 / (1 + Math.pow(10, (rating(q) - rating(p)) / 400));
        const s = p.stats.score > q.stats.score ? 1 : p.stats.score === q.stats.score ? 0.5 : 0;
        sum += s - exp;
      }
      out.set(p.id, (K * sum) / Math.max(1, ps.length - 1) * 1.5);
    }
    void sorted;
  }
  return out;
}

export function ensureChallenges(u) {
  const dk = dayKey(), wk = weekKey();
  if (u.challenges.daily?.key !== dk) u.challenges.daily = { key: dk, list: challengeSet('daily', dk), progress: {}, done: {} };
  if (u.challenges.weekly?.key !== wk) u.challenges.weekly = { key: wk, list: challengeSet('weekly', wk), progress: {}, done: {} };
}

function progressChallenges(u, add) {
  ensureChallenges(u);
  const completed = [];
  for (const kind of ['daily', 'weekly']) {
    const c = u.challenges[kind];
    for (const ch of c.list) {
      if (c.done[ch.id]) continue;
      c.progress[ch.id] = (c.progress[ch.id] || 0) + (add[ch.id] || 0);
      if (c.progress[ch.id] >= ch.goal) { c.done[ch.id] = true; completed.push(ch); }
    }
  }
  return completed;
}
