// Gun Game: jede Eliminierung bringt die nächste Waffe der (serverseitig verwalteten) Reihenfolge.
import { RespawnMode } from './base.js';
import { WEAPONS } from '../../shared/weapons.js';

export class GunGame extends RespawnMode {
  constructor(room, cfg) {
    super(room, cfg);
    this.ladder = cfg.ladder.filter((id) => WEAPONS[id]);
    this.winner = null;
  }
  clientConfig() { return { ladder: this.ladder }; }
  chooseTeam() { return 'N'; }
  start() { for (const p of this.players()) p.gunLevel = 0; super.start(); }
  onJoin(p) { p.gunLevel = Math.max(0, Math.min(...this.players().filter((q) => q !== p).map((q) => q.gunLevel), 0)); super.onJoin(p); }

  loadout(p) {
    p.clearWeapons(false);
    const id = this.ladder[Math.min(p.gunLevel, this.ladder.length - 1)];
    if (id !== 'klinge') { p.give(id); const s = p.slots[WEAPONS[id].slot]; s.res = 999; }
    p.give('klinge');
    p.cur = -1;
    p.equip(id === 'klinge' ? 2 : WEAPONS[id].slot, false);
  }

  onKill(v, k, wid, hs, tk) {
    super.onKill(v);
    if (!k || k === v || this.winner) return;
    if (wid === 'klinge' && this.cfg.knifeSteal && v.gunLevel > 0) {
      v.gunLevel--;
      this.room.toast(v, 'Ein Level wurde dir mit der Klinge abgenommen!');
    }
    k.gunLevel++;
    k.stats.score = k.gunLevel;
    if (k.gunLevel >= this.ladder.length) {
      this.winner = k;
      this.room.system(`${k.name} gewinnt Gun Game!`);
      this.room.endMatch({ winnerId: k.id, winnerName: k.name });
      return;
    }
    // automatischer Waffenwechsel
    const keep = { alive: k.alive };
    if (keep.alive) {
      this.loadout(k);
      this.room.emit({ e: 'levelUp', lvl: k.gunLevel, w: this.ladder[k.gunLevel] }, k.id);
    }
    this.room.rosterDirty = true;
  }

  finish() {
    if (this.room.ended) return;
    const best = this.players().sort((a, b) => b.gunLevel - a.gunLevel || b.stats.kills - a.stats.kills)[0];
    this.winner = best;
    this.room.endMatch({ winnerId: best?.id, winnerName: best?.name, reason: 'Zeit abgelaufen' });
  }
  didWin(p) { return this.winner === p; }

  state() {
    const top = this.players().sort((a, b) => b.gunLevel - a.gunLevel).slice(0, 3).map((p) => [p.id, p.gunLevel]);
    return { ph: this.phase, te: this.timeLeft(), top };
  }
}
