// Aufwärmphase in privaten Lobbys und eigenen Servern, bis der Host das Match startet.
import { RespawnMode } from './base.js';
import { MODES } from '../../shared/constants.js';

export class Warmup extends RespawnMode {
  constructor(room, cfg) {
    super(room, { respawnTime: 1.5, spawnProtect: 1.5 });
    this.realMode = room.modeId;
    this.teamBased = MODES[room.modeId].teams;
    this.phase = 'live';
  }
  chooseTeam(p) { return this.teamBased ? this.smallerTeam('T', 'C', p) : 'N'; }
  canDamage(a) { return true; }
  onJoin(p) { p.respawnAt = this.time + 0.5; }
  loadout(p) {
    p.clearWeapons(false);
    if (this.realMode === 'sniper') { p.give('sparrow'); p.equip(0, false); return; }
    p.give('kr47'); p.give('viper'); p.give('klinge');
    p.slots[0].res = 999;
    p.equip(0, false);
  }
  spawnList(p) {
    const s = this.room.map.spawns;
    return s.P.length ? s.P : [...s.T, ...s.C];
  }
  tick() {
    for (const p of this.players()) if (!p.alive && p.respawnAt != null && this.time >= p.respawnAt) this.spawn(p);
  }
  state() { return { ph: 'warmup' }; }
  switchTeam(p, team) {
    if (!this.teamBased || !['T', 'C'].includes(team)) return;
    const size = MODES[this.realMode].max / 2;
    if (this.players().filter((q) => q.team === team).length >= size) return;
    p.team = team; this.room.rosterDirty = true;
  }
}
