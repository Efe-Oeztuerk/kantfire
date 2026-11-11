// Only Sniper: nur Scharfschützengewehre, schnelle Respawns, Spawnschutz, Kopfschuss-Bonus, optional One-Shot.
import { RespawnMode } from './base.js';
import { WEAPONS } from '../../shared/weapons.js';

export class SniperMode extends RespawnMode {
  constructor(room, cfg) {
    super(room, cfg);
    this.teamBased = !!cfg.teams;
    this.teamScore = { T: 0, C: 0 };
    this.winner = null;
  }
  clientConfig() { return { allowed: this.cfg.allowed, teams: this.teamBased, scoreLimit: this.cfg.scoreLimit, oneShot: this.cfg.oneShot, killPoints: this.cfg.killPoints, hsBonus: this.cfg.headshotBonus }; }
  assignTeams(list) { if (this.teamBased) this.balancedTeams(list); else for (const p of list) p.team = 'N'; }
  chooseTeam(p) { return this.teamBased ? this.smallerTeam('T', 'C', p) : 'N'; }

  pick(p, wid) {
    if (!this.cfg.allowed.includes(wid)) return;
    p.pick = wid;
    // Innerhalb des Spawnschutzes sofort tauschen
    if (p.alive && p.protectUntil > this.time) this.loadout(p);
    else this.room.toast(p, `${WEAPONS[wid].name} beim nächsten Respawn.`);
  }

  loadout(p) {
    p.clearWeapons(false);
    const id = this.cfg.allowed.includes(p.pick) ? p.pick : this.cfg.defaultWeapon;
    p.give(id);
    p.slots[0].res = 999;
    p.cur = -1;
    p.equip(0, false);
  }

  modifyDamage(a, v, dmg) { return this.cfg.oneShot && a && a !== v ? 999 : dmg; }

  onKill(v, k, wid, hs, tk) {
    super.onKill(v);
    if (!k || k === v || tk || this.winner) return;
    const pts = this.cfg.killPoints + (hs ? this.cfg.headshotBonus : 0);
    k.stats.score += pts;
    if (this.teamBased) this.teamScore[k.team] += pts;
    this.room.emit({ e: 'points', n: pts, hs: hs ? 1 : 0 }, k.id);
    const lead = this.teamBased ? Math.max(this.teamScore.T, this.teamScore.C) : k.stats.score;
    if (lead >= this.cfg.scoreLimit) this.finish('score');
  }

  finish(reason) {
    if (this.room.ended) return;
    if (this.teamBased) {
      const w = this.teamScore.T === this.teamScore.C ? null : this.teamScore.T > this.teamScore.C ? 'T' : 'C';
      this.winner = w;
      this.room.endMatch({ winnerTeam: w, draw: !w, score: this.teamScore, reason });
    } else {
      const best = this.players().sort((a, b) => b.stats.score - a.stats.score)[0];
      this.winner = best;
      this.room.endMatch({ winnerId: best?.id, winnerName: best?.name, reason });
    }
  }
  didWin(p) { return this.teamBased ? this.winner === p.team : this.winner === p; }
  isDraw() { return this.teamBased && this.winner === null; }

  state() {
    const top = this.players().sort((a, b) => b.stats.score - a.stats.score).slice(0, 3).map((p) => [p.id, p.stats.score]);
    return { ph: this.phase, te: this.timeLeft(), top, ts: this.teamBased ? this.teamScore : null, lim: this.cfg.scoreLimit };
  }
}
