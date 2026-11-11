// Zombie-Modus: Überlebende (Team C) gegen Zombies (Team T). Zombies infizieren mit der Klaue.
import { Mode } from './base.js';

export class ZombieMode extends Mode {
  constructor(room, cfg) {
    super(room, cfg);
    this.teamBased = true;
    this.round = 0;
    this.phase = 'wait';
    this.phaseEnd = 0;
    this.wins = { humans: 0, zombies: 0 };
    this.roundsWon = new Map();
  }
  clientConfig() { return { rounds: this.cfg.rounds, classes: this.cfg.classes }; }
  assignTeams(list) { for (const p of list) p.team = 'C'; }
  chooseTeam() { return this.phase === 'wait' ? 'C' : 'T'; }
  start() { this.newRound(); }

  onJoin(p) {
    if (this.phase === 'wait') this.spawnHuman(p);
    else { p.team = 'T'; p.respawnAt = this.time + 1; p.alive = false; }
  }

  newRound() {
    this.round++;
    this.phase = 'wait';
    this.phaseEnd = this.time + this.cfg.infectDelay;
    for (const p of this.players()) { p.team = 'C'; this.spawnHuman(p); }
    this.room.nades = []; this.room.smokes = [];
    this.room.emit({ e: 'roundStart', r: this.round });
    this.room.rosterDirty = true;
  }

  spawnHuman(p) {
    p.team = 'C'; p.zombie = false; p.zclass = null;
    p.alive = true; p.hp = 100; p.armor = 0; p.speedMult = 1; p.jumpMult = 1; p.respawnAt = null; p.protectUntil = 0;
    p.clearWeapons(false);
    p.give('saber'); p.give('warden'); p.give('klinge'); p.give('he');
    p.slots[0].res = 999; p.slots[1].res = 999;
    p.cur = -1; p.equip(0, false);
    const sp = this.room.map.spawns;
    this.room.place(p, this.room.pickSpawn(p, sp.P.length ? sp.P : [...sp.T, ...sp.C]));
  }

  makeZombie(p, mother = false, keepPos = true) {
    const keys = Object.keys(this.cfg.classes);
    const cls = p.zclass || keys[Math.floor(Math.random() * keys.length)];
    const c = this.cfg.classes[cls];
    p.zombie = true; p.zclass = cls; p.team = 'T';
    p.alive = true; p.hp = c.hp * (mother ? this.cfg.motherHpMult : 1); p.armor = 0;
    p.speedMult = c.speed; p.jumpMult = c.jump;
    p.clearWeapons(false); p.give('klaue'); p.cur = -1; p.equip(2, false);
    p.zoom = 0; p.reloadEnd = 0; p.action = null;
    if (!keepPos) {
      const humans = this.players().filter((q) => q.alive && !q.zombie);
      const sp = this.room.map.spawns.P;
      let best = sp[0], bd = -1;
      for (const s of sp) { const d = Math.min(...humans.map((h) => Math.hypot(h.st.x - s[0], h.st.z - s[2])), 999); if (d > bd) { bd = d; best = s; } }
      this.room.place(p, best);
    }
    p.conn?.send({ t: 'toast', text: `Du bist ein Zombie (${c.name})! Infiziere die Überlebenden.` });
    this.room.rosterDirty = true;
  }

  frozen() { return false; }
  canDamage(a, v) { return a.team !== v.team && this.phase === 'live'; }

  modifyDamage(a, v, dmg, zone, wid, opts) {
    if (a && a.zombie && !v.zombie) {
      // Infektion statt Schaden
      a.stats.infections++; a.stats.kills++; a.stats.score += 1;
      this.room.emit({ e: 'kill', k: a.id, v: v.id, w: 'klaue', hs: 0, inf: 1 });
      this.room.emit({ e: 'infect', x: r2(v.st.x), y: r2(v.st.y), z: r2(v.st.z) });
      v.stats.deaths++;
      this.makeZombie(v, false, true);
      this.checkEnd();
      return 0;
    }
    if (v.zombie && opts.dir && !opts.blast) {
      const kb = this.cfg.knockback * (dmg / 30);
      v.st.vx += opts.dir[0] * kb; v.st.vz += opts.dir[2] * kb;
    }
    return dmg;
  }

  onKill(v, k) {
    if (v.zombie) { v.respawnAt = this.time + this.cfg.zombieRespawn; if (k) k.stats.score += 1; }
    else { v.team = 'T'; v.respawnAt = this.time + this.cfg.zombieRespawn; this.checkEnd(); }
  }

  humansAlive() { return this.players().filter((p) => p.alive && !p.zombie && p.team === 'C').length; }

  tick() {
    if (this.phase === 'wait' && this.time >= this.phaseEnd) {
      const humans = this.players().filter((p) => p.alive);
      if (humans.length >= 2) {
        const n = Math.max(1, Math.floor(humans.length / 6));
        for (let i = 0; i < n; i++) {
          const pool = humans.filter((p) => !p.zombie);
          const p = pool[Math.floor(Math.random() * pool.length)];
          this.makeZombie(p, true, true);
          this.room.system(`${p.name} ist der erste Zombie!`);
        }
        this.phase = 'live';
        this.phaseEnd = this.time + this.cfg.roundTime;
        this.room.emit({ e: 'outbreak' });
      } else this.phaseEnd = this.time + 3;
    } else if (this.phase === 'live') {
      for (const p of this.players()) if (!p.alive && p.respawnAt != null && this.time >= p.respawnAt) { p.respawnAt = null; this.makeZombie(p, false, false); }
      if (this.time >= this.phaseEnd) this.roundEnd('humans');
    } else if (this.phase === 'end' && this.time >= this.phaseEnd) {
      if (this.round >= this.cfg.rounds) this.finish();
      else this.newRound();
    }
  }

  checkEnd() { if (this.phase === 'live' && this.humansAlive() === 0) this.roundEnd('zombies'); }

  roundEnd(who) {
    this.phase = 'end';
    this.phaseEnd = this.time + this.cfg.roundEndTime;
    this.wins[who]++;
    for (const p of this.players()) {
      const won = who === 'humans' ? p.alive && !p.zombie : p.zombie;
      if (won) { this.roundsWon.set(p.id, (this.roundsWon.get(p.id) || 0) + 1); p.stats.score += who === 'humans' ? 3 : 1; }
    }
    this.room.emit({ e: 'zround', w: who });
    this.room.system(who === 'humans' ? 'Die Überlebenden haben durchgehalten!' : 'Alle wurden infiziert – die Zombies gewinnen!');
  }

  finish() {
    this.room.endMatch({ wins: this.wins });
  }
  didWin(p) { return (this.roundsWon.get(p.id) || 0) * 2 >= this.round; }

  state() {
    return {
      ph: this.phase, r: this.round, rounds: this.cfg.rounds, te: r2(Math.max(0, this.phaseEnd - this.time)),
      hum: this.humansAlive(), zom: this.players().filter((p) => p.zombie && p.alive).length, w: this.wins,
    };
  }
}
const r2 = (v) => Math.round(v * 100) / 100;
