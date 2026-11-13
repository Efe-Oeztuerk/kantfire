// Team Deathmatch: zwei Teams, schnelle Respawns, freie Loadout-Wahl, Team mit den meisten Kills gewinnt.
import { RespawnMode } from './base.js';
import { WEAPONS } from '../../shared/weapons.js';

export class TeamDeathmatch extends RespawnMode {
  constructor(room, cfg) {
    super(room, cfg);
    this.teamBased = true;
    this.kills = { T: 0, C: 0 };
    this.winner = undefined;
  }
  clientConfig() { return { primaries: this.cfg.primaries, secondaries: this.cfg.secondaries, killLimit: this.cfg.killLimit }; }
  assignTeams(list) {
    const t = list.filter((p) => p.team === 'T').length, c = list.filter((p) => p.team === 'C').length;
    if (this.room.hostUserId && t + c === list.length && Math.abs(t - c) <= 1 && t && c) return;
    this.balancedTeams(list);
  }
  chooseTeam(p) { return this.smallerTeam('T', 'C', p); }

  pick(p, wid) {
    const w = WEAPONS[wid];
    if (!w) return;
    if (this.cfg.primaries.includes(wid)) p.pickPrimary = wid;
    else if (this.cfg.secondaries.includes(wid)) p.pickSecondary = wid;
    else return;
    if (p.alive && p.protectUntil > this.time) this.loadout(p);
    else this.room.toast(p, `${w.name} ab dem nächsten Respawn.`);
  }

  loadout(p) {
    if (p.bot && !p.pickPrimary) p.pickPrimary = this.cfg.primaries[Math.floor(Math.random() * this.cfg.primaries.length)];
    p.clearWeapons(false);
    p.give(p.pickPrimary && this.cfg.primaries.includes(p.pickPrimary) ? p.pickPrimary : this.cfg.defaultPrimary);
    p.give(p.pickSecondary && this.cfg.secondaries.includes(p.pickSecondary) ? p.pickSecondary : this.cfg.defaultSecondary);
    p.give('klinge');
    if (this.cfg.grenade) p.give('he');
    p.cur = -1;
    p.equip(0, false);
  }

  onKill(v, k, wid, hs, tk) {
    super.onKill(v);
    if (!k || k === v || tk || this.winner !== undefined) return;
    this.kills[k.team]++;
    k.stats.score += hs ? 3 : 2;
    if (this.kills[k.team] >= this.cfg.killLimit) this.finish('limit');
  }

  finish(reason) {
    if (this.room.ended) return;
    const { T, C } = this.kills;
    this.winner = T === C ? null : T > C ? 'T' : 'C';
    this.room.endMatch({ winnerTeam: this.winner, draw: !this.winner, score: { T, C }, reason });
  }
  didWin(p) { return !!this.winner && this.winner === p.team; }
  isDraw() { return this.winner === null; }
  state() { return { ph: this.phase, te: this.timeLeft(), ts: this.kills, lim: this.cfg.killLimit }; }
}
