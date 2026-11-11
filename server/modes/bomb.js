// Competitive 5v5 / 2v2: Runden, Kaufphase, Wirtschaft, Bombe legen/entschärfen, Seitenwechsel, Verlängerung.
import { Mode } from './base.js';
import { WEAPONS } from '../../shared/weapons.js';
import { inRect } from '../../shared/maps.js';
import { explode } from '../combat.js';

export class BombMode extends Mode {
  constructor(room, cfg) {
    super(room, cfg);
    this.teamBased = true;
    this.armorEnabled = true;
    this.allowDrops = true;
    this.round = 0;
    this.score = { A: 0, B: 0 };
    this.side = { A: 'T', B: 'C' };
    this.loss = { A: 0, B: 0 };
    this.phase = 'freeze';
    this.phaseEnd = 0;
    this.buyEnd = 0;
    this.bomb = null;
    this.history = [];
    this.roundKills = new Map();
  }

  clientConfig() { return { maxRounds: this.cfg.maxRounds, winRounds: this.cfg.winRounds, bombTimer: this.cfg.bombTimer, sites: this.room.map.sites.map((s) => s.name) }; }
  groupOf(team) { return this.side.A === team ? 'A' : 'B'; }

  assignTeams(list) {
    const t = list.filter((p) => p.team === 'T').length, c = list.filter((p) => p.team === 'C').length;
    if (this.room.hostUserId && t + c === list.length && Math.abs(t - c) <= 1 && t > 0 && c > 0) return; // Teamwahl aus der Lobby behalten
    this.balancedTeams(list);
  }
  chooseTeam(p) { return this.smallerTeam('T', 'C', p); }

  start() {
    for (const p of this.players()) { p.money = this.cfg.startMoney; this.resetLoadout(p); }
    this.newRound();
  }

  onJoin(p) {
    p.money = this.cfg.startMoney;
    p.alive = false;
    this.resetLoadout(p);
    if (this.phase === 'freeze') this.spawnPlayer(p, true);
  }
  onLeave() {}

  resetLoadout(p) {
    p.clearWeapons(false);
    p.give('klinge');
    p.give(p.team === 'T' ? 'viper' : 'warden');
    p.armor = 0; p.helmet = false; p.kit = false;
    p.cur = 1;
  }

  spawnPlayer(p, fresh) {
    if (fresh) this.resetLoadout(p);
    p.alive = true; p.hp = 100; p.action = null; p.zoom = 0; p.reloadEnd = 0; p.drawEnd = 0; p.shotIdx = 0;
    p.dmgBy.clear(); p.speedMult = 1; p.protectUntil = 0; p.respawnAt = null;
    // Munition auffüllen
    for (const i of [0, 1]) if (p.slots[i]) { const w = WEAPONS[p.slots[i].id]; p.slots[i].mag = w.mag; p.slots[i].res = w.reserve; }
    p.cur = p.bestSlot();
    const list = this.room.map.spawns[p.team];
    const used = this.players().filter((q) => q !== p && q.alive && q.team === p.team).map((q) => [q.st.x, q.st.z]);
    const free = list.filter((s) => !used.some((u) => Math.hypot(u[0] - s[0], u[1] - s[2]) < 1.5));
    const pos = (free.length ? free : list)[Math.floor(Math.random() * (free.length || list.length))];
    // Blickrichtung zur Kartenmitte
    this.room.place(p, pos, Math.atan2(pos[0], pos[2]));
  }

  newRound() {
    const c = this.cfg;
    const prevRound = this.round;
    this.round++;
    // Seitenwechsel zur Halbzeit bzw. in der Verlängerung
    const half = c.maxRounds / 2;
    let swap = prevRound === half;
    let moneyReset = swap ? c.startMoney : null;
    if (prevRound >= c.maxRounds && c.overtime) {
      const into = prevRound - c.maxRounds;
      if (into % c.overtimeRounds === 0) moneyReset = c.overtimeMoney;
      if (into % c.overtimeRounds === c.overtimeRounds / 2) { swap = true; moneyReset = c.overtimeMoney; }
    }
    if (swap) {
      this.side = { A: this.side.B, B: this.side.A };
      for (const p of this.players()) p.team = p.team === 'T' ? 'C' : 'T';
      this.loss = { A: 0, B: 0 };
      this.room.system('Seitenwechsel!');
    }
    for (const p of this.players()) {
      if (moneyReset != null) { p.money = moneyReset; this.resetLoadout(p); }
      this.spawnPlayer(p, !p.alive || moneyReset != null);
    }
    this.room.drops = []; this.room.nades = []; this.room.smokes = [];
    this.bomb = { s: 'carried', carrier: null };
    const ts = this.players().filter((p) => p.team === 'T');
    const carrier = ts.find((p) => p.bot) && Math.random() < 0.3 ? ts.find((p) => p.bot) : ts[Math.floor(Math.random() * ts.length)];
    if (carrier) { carrier.slots[4] = { id: 'bomb', mag: 0, res: 0 }; this.bomb.carrier = carrier.id; }
    this.phase = 'freeze';
    this.phaseEnd = this.time + c.freezeTime;
    this.buyEnd = this.time + c.buyTime;
    this.roundKills.clear();
    this.botSites = {};
    const sites = this.room.map.sites;
    this.attackSite = sites[Math.floor(Math.random() * sites.length)];
    for (const p of this.players()) {
      if (p.bot) p.bot.roundStart(this);
    }
    this.room.rosterDirty = true;
    this.room.emit({ e: 'roundStart', r: this.round });
  }

  frozen(p) { return this.phase === 'freeze'; }
  blockFire() { return this.phase === 'freeze'; }
  canBuy(p) {
    return p.alive && (this.phase === 'freeze' || (this.phase === 'live' && this.time < this.buyEnd)) && this.room.inBuyZone(p);
  }

  alive(team) { return this.players().filter((p) => p.team === team && p.alive).length; }

  tick() {
    const c = this.cfg;
    // laufende Aktionen (Legen/Entschärfen) abschließen
    for (const p of this.players()) {
      if (!p.action) continue;
      if (!p.alive) { p.action = null; continue; }
      if (this.time >= p.action.end) {
        if (p.action.type === 'plant') this.completePlant(p);
        else this.completeDefuse(p);
        p.action = null;
      }
    }
    // Bombe aufheben
    if (this.bomb?.s === 'dropped') {
      for (const p of this.players()) {
        if (p.alive && p.team === 'T' && Math.hypot(p.st.x - this.bomb.x, p.st.z - this.bomb.z) < 1.3) {
          p.slots[4] = { id: 'bomb', mag: 0, res: 0 }; this.bomb = { s: 'carried', carrier: p.id };
          this.room.emit({ e: 'bombPick', id: p.id }, null, 'T');
          break;
        }
      }
    }
    if (this.phase === 'freeze' && this.time >= this.phaseEnd) {
      this.phase = 'live'; this.phaseEnd = this.time + c.roundTime;
      this.room.emit({ e: 'go' });
    } else if (this.phase === 'live') {
      if (this.alive('T') === 0 && this.players().some((p) => p.team === 'T')) this.roundWin('C', 'elim');
      else if (this.alive('C') === 0 && this.players().some((p) => p.team === 'C')) this.roundWin('T', 'elim');
      else if (this.time >= this.phaseEnd) this.roundWin('C', 'time');
    } else if (this.phase === 'planted') {
      if (this.time >= this.bomb.explodeAt) {
        this.bomb.s = 'exploded';
        explode(this.room, this.bomb.x, this.bomb.y + 0.3, this.bomb.z, 22, 500, this.players().find((p) => p.id === this.bomb.planter) || null, 'bomb');
        this.roundWin('T', 'bomb');
      } else if (this.alive('C') === 0) this.roundWin('T', 'elim');
    } else if (this.phase === 'end' && this.time >= this.phaseEnd) {
      if (this.over) this.room.endMatch(this.result());
      else this.newRound();
    }
  }

  onUse(p, held) {
    if (!held || !p.alive) { if (p.action) { p.action = null; } return; }
    if (p.action) {
      // Aktion bleibt nur gültig, solange die Bedingungen erfüllt sind
      if (p.action.type === 'defuse' && (this.phase !== 'planted' || dist2(p, this.bomb) > 2.2)) p.action = null;
      return;
    }
    if (this.phase === 'live' && p.team === 'T' && p.slots[4] && p.st.g) {
      const site = this.room.map.sites.find((s) => inRect(s, p.st.x, p.st.z));
      if (site) {
        p.action = { type: 'plant', start: this.time, end: this.time + this.cfg.plantTime, site: site.name };
        this.room.emit({ e: 'planting', x: r2(p.st.x), y: r2(p.st.y), z: r2(p.st.z) });
      }
    } else if (this.phase === 'planted' && p.team === 'C' && dist2(p, this.bomb) < 2 && !this.bomb.defuser) {
      p.action = { type: 'defuse', start: this.time, end: this.time + (p.kit ? this.cfg.kitDefuseTime : this.cfg.defuseTime) };
      this.room.emit({ e: 'defusing', kit: p.kit ? 1 : 0, x: r2(this.bomb.x), y: r2(this.bomb.y), z: r2(this.bomb.z) });
    }
  }

  completePlant(p) {
    if (this.phase !== 'live') return;
    p.slots[4] = null;
    if (p.cur === 4) p.equip(p.bestSlot());
    this.bomb = { s: 'planted', x: p.st.x, y: p.st.y, z: p.st.z, site: p.action.site, explodeAt: this.time + this.cfg.bombTimer, planter: p.id };
    this.phase = 'planted';
    p.money = Math.min(this.cfg.maxMoney, p.money + this.cfg.plantBonus);
    p.stats.plants++;
    p.stats.score += 2;
    this.room.emit({ e: 'planted', site: this.bomb.site, x: r2(p.st.x), y: r2(p.st.y), z: r2(p.st.z) });
    this.room.system(`Die Bombe wurde an Platz ${this.bomb.site} platziert.`);
  }

  completeDefuse(p) {
    if (this.phase !== 'planted') return;
    this.bomb.s = 'defused';
    p.stats.defuses++;
    p.stats.score += 2;
    this.room.emit({ e: 'defused' });
    this.roundWin('C', 'defuse');
  }

  onBombDrop(p) {
    this.bomb = { s: 'dropped', x: p.st.x - Math.sin(p.yaw) * (p.alive ? 1.2 : 0), y: p.st.y, z: p.st.z - Math.cos(p.yaw) * (p.alive ? 1.2 : 0) };
    const gy = this.room.world.groundHeight(this.bomb.x, this.bomb.z, p.st.y + 1);
    if (gy != null) this.bomb.y = gy;
    this.room.emit({ e: 'bombDrop' }, null, 'T');
  }

  onKill(v, k, wid, hs, tk) {
    if (k && k !== v) {
      if (tk) k.money = Math.max(0, k.money - 300);
      else {
        k.money = Math.min(this.cfg.maxMoney, k.money + (WEAPONS[wid]?.reward ?? 300));
        k.stats.score += 2;
        this.roundKills.set(k.id, (this.roundKills.get(k.id) || 0) + 1);
      }
    }
    v.slots[0] = null; v.slots[3] = []; v.kit = false;
    v.armor = 0; v.helmet = false;
  }

  roundWin(team, reason) {
    if (this.phase === 'end') return;
    const c = this.cfg;
    for (const p of this.players()) p.action = null;
    this.phase = 'end';
    this.phaseEnd = this.time + c.roundEndTime;
    const g = this.groupOf(team), lg = g === 'A' ? 'B' : 'A';
    this.score[g]++;
    const reward = { elim: c.winElim, bomb: c.winBomb, defuse: c.winDefuse, time: c.winTime }[reason] ?? c.winElim;
    const lossBonus = Math.min(c.lossMax, c.lossBase + c.lossStep * this.loss[lg]);
    this.loss[lg]++; this.loss[g] = Math.max(0, this.loss[g] - 1);
    const planted = this.bomb?.s === 'planted' || this.bomb?.s === 'defused';
    for (const p of this.players()) {
      let add = p.team === team ? reward : lossBonus;
      if (p.team !== team && p.team === 'T' && planted) add += c.plantTeamBonus;
      // Verlierer, die bei Zeitablauf noch leben, bekommen keinen Verlustbonus (CS-Regel)
      if (p.team !== team && p.team === 'T' && reason === 'time' && p.alive) add = 0;
      p.money = Math.min(c.maxMoney, p.money + add);
    }
    // MVP
    let mvp = null, best = 0;
    for (const [id, n] of this.roundKills) { const p = this.room.players.get(id); if (p && p.team === team && n > best) { best = n; mvp = p; } }
    if (mvp) { mvp.stats.mvps++; mvp.stats.score += 1; }
    this.history.push({ w: team, r: reason });
    this.room.emit({ e: 'round', w: team, r: reason, mvp: mvp?.id ?? null });
    this.room.rosterDirty = true;
    this.checkOver(g);
  }

  checkOver(g) {
    const c = this.cfg, r = this.round, s = this.score;
    const tie = s.A === s.B;
    if (r <= c.maxRounds) {
      if (s[g] >= c.winRounds) { this.over = { winner: g }; return; }
      if (r === c.maxRounds && tie) { if (!c.overtime) this.over = { draw: true }; return; }
      if (r === c.maxRounds) { this.over = { winner: s.A > s.B ? 'A' : 'B' }; }
      return;
    }
    const into = r - c.maxRounds;
    const k = Math.ceil(into / c.overtimeRounds);
    const need = c.maxRounds / 2 + k * (c.overtimeRounds / 2) + 1;
    if (s[g] >= need) this.over = { winner: g };
    if (r >= c.maxRounds + c.overtimeRounds * 5 && !this.over) this.over = { draw: true }; // Sicherheitsgrenze
  }

  result() {
    const o = this.over || {};
    const winTeam = o.winner ? this.side[o.winner] : null;
    return { winnerTeam: winTeam, draw: !!o.draw, score: { T: this.score[this.groupOf('T')], C: this.score[this.groupOf('C')] }, rounds: this.round };
  }
  didWin(p) { return this.over?.winner && this.groupOf(p.team) === this.over.winner; }
  isDraw() { return !!this.over?.draw; }

  state() {
    const b = this.bomb || {};
    const bs = b.s === 'planted' || b.s === 'dropped' ? [b.s, r2(b.x), r2(b.y), r2(b.z), b.site || '', b.explodeAt ? r2(b.explodeAt - this.time) : 0] : [b.s || 'none', 0, 0, 0, '', 0, b.carrier ?? null];
    return {
      ph: this.phase, r: this.round, mr: this.cfg.maxRounds,
      sc: { T: this.score[this.groupOf('T')], C: this.score[this.groupOf('C')] },
      te: r2(Math.max(0, (this.phase === 'planted' ? b.explodeAt : this.phaseEnd) - this.time)),
      be: r2(Math.max(0, this.buyEnd - this.time)), b: bs,
      al: { T: this.alive('T'), C: this.alive('C') },
      hist: this.history.slice(-30).map((h) => h.w),
    };
  }
}
const r2 = (v) => Math.round(v * 100) / 100;
const dist2 = (p, b) => Math.hypot(p.st.x - b.x, p.st.z - b.z) + Math.abs(p.st.y - b.y) * 0.5;
