// Basisklassen für Spielmodi.
export class Mode {
  constructor(room, cfg) {
    this.room = room;
    this.cfg = cfg;
    this.teamBased = false;
    this.armorEnabled = false;
    this.allowDrops = false;
  }
  get time() { return this.room.time; }
  players() { return [...this.room.players.values()]; }
  clientConfig() { return {}; }
  assignTeams(list) { for (const p of list) p.team = this.chooseTeam(p); }
  chooseTeam() { return 'N'; }
  start() {}
  onJoin() {}
  onLeave() {}
  frozen() { return false; }
  canBuy() { return false; }
  canDamage(a, v) { return !this.teamBased || a.team !== v.team || this.cfg.friendlyFire; }
  onKill() {}
  tick() {}
  state() { return {}; }
  didWin() { return false; }
  isDraw() { return false; }

  balancedTeams(list, a = 'T', b = 'C') {
    const sorted = list.slice().sort((x, y) => (y.bot ? 0 : y.rating) - (x.bot ? 0 : x.rating));
    // Schlangen-Verteilung: A B B A A B ...
    sorted.forEach((p, i) => { p.team = (i % 4 === 0 || i % 4 === 3) ? a : b; });
    // Größen angleichen
    const ca = sorted.filter((p) => p.team === a), cb = sorted.filter((p) => p.team === b);
    while (ca.length - cb.length > 1) { const p = ca.pop(); p.team = b; cb.push(p); }
    while (cb.length - ca.length > 1) { const p = cb.pop(); p.team = a; ca.push(p); }
  }
  smallerTeam(a = 'T', b = 'C', except = null) {
    const ps = this.players().filter((p) => p !== except);
    const na = ps.filter((p) => p.team === a).length, nb = ps.filter((p) => p.team === b).length;
    return na <= nb ? a : b;
  }
}

// Modi mit Respawn (Aufwärmen, Gun Game, Only Sniper, Zombie-Respawn)
export class RespawnMode extends Mode {
  constructor(room, cfg) {
    super(room, cfg);
    this.respawnTime = cfg.respawnTime ?? 2;
    this.protect = cfg.spawnProtect ?? 2;
    this.countdownEnd = 0;
    this.phase = 'live';
  }
  start() {
    this.countdownEnd = this.time + 5;
    this.phase = 'countdown';
    this.endAt = this.time + 5 + (this.cfg.timeLimit ?? 600);
    for (const p of this.players()) this.spawn(p);
  }
  onJoin(p) { p.respawnAt = this.time + 0.5; }
  frozen() { return this.phase === 'countdown'; }
  blockFire() { return this.phase === 'countdown'; }
  onKill(v) { v.respawnAt = this.time + this.respawnTime; }
  spawnList(p) {
    const s = this.room.map.spawns;
    if (this.teamBased && s[p.team + 'S']?.length) return s[p.team + 'S'];
    if (this.teamBased && s[p.team]?.length) return s[p.team];
    return s.P.length ? s.P : [...s.T, ...s.C];
  }
  spawn(p) {
    p.alive = true; p.hp = 100; p.armor = 0; p.helmet = false; p.kit = false; p.action = null;
    p.respawnAt = null; p.dmgBy.clear(); p.zoom = 0; p.reloadEnd = 0; p.shotIdx = 0;
    p.speedMult = 1; p.jumpMult = 1;
    p.protectUntil = this.time + this.protect;
    this.loadout(p);
    this.room.place(p, this.room.pickSpawn(p, this.spawnList(p)));
    this.room.rosterDirty = true;
  }
  loadout() {}
  tick() {
    if (this.phase === 'countdown' && this.time >= this.countdownEnd) this.phase = 'live';
    for (const p of this.players()) if (!p.alive && p.respawnAt != null && this.time >= p.respawnAt) this.spawn(p);
    if (this.phase === 'live' && this.endAt && this.time >= this.endAt) this.finish('time');
  }
  finish() {}
  timeLeft() { return Math.max(0, Math.round(((this.phase === 'countdown' ? this.countdownEnd : this.endAt) - this.time) * 10) / 10); }
}
