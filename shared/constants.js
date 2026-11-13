// Gemeinsame Konstanten für Server und Client.
export const GAME_NAME = 'KANTFIRE';
export const TICK_RATE = 30;               // Server-Simulation und Client-Input pro Sekunde
export const TICK_DT = 1 / TICK_RATE;
export const INTERP_DELAY = 0.1;           // Sekunden, um die andere Spieler verzögert dargestellt werden
export const LAG_COMP_MAX = 0.3;           // max. Zurückspulen für Lag Compensation (Sekunden)
export const RECONNECT_GRACE = 60;         // Sekunden, die ein Platz nach Verbindungsabbruch frei gehalten wird

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  crouchHeight: 1.25,
  eye: 1.62,
  crouchEye: 1.1,
  maxHp: 100,
  maxArmor: 100,
  stepHeight: 0.55,
};

export const MOVE = {
  speed: 5.6,
  walkMult: 0.48,
  sprintMult: 1.28,   // leichter Sprint
  sprintSpread: 6.0,  // ab dieser Geschwindigkeit gilt man als sprintend (Streuung)
  crouchMult: 0.36,
  accel: 11,
  airAccel: 2.2,
  airCap: 1.0,
  friction: 7.5,
  stopSpeed: 1.6,
  gravity: 20,
  jump: 7.4,
  killY: -15,
};

// Bit-Belegung der Eingabe (Client -> Server)
export const KEY = {
  F: 1, B: 2, L: 4, R: 8,
  JUMP: 16, CROUCH: 32, WALK: 64,
  FIRE: 128, ALT: 256, RELOAD: 512, USE: 1024, DROP: 2048, SPRINT: 4096,
};

export const TEAMS = { T: 'T', C: 'C', NONE: 'N' };
export const TEAM_NAMES = { T: 'Angreifer', C: 'Verteidiger', N: 'Alle' };

export const MODES = {
  comp5: { id: 'comp5', name: 'Competitive 5v5', short: '5v5', desc: 'Bombenmodus, Kaufphase, Wirtschaft. 24 Runden, 13 gewinnt.', max: 10, teams: true, ranked: true },
  comp2: { id: 'comp2', name: 'Competitive 2v2', short: '2v2', desc: 'Schnelle Runden auf kleinen Maps mit einem Bombenplatz.', max: 4, teams: true, ranked: true },
  tdm: { id: 'tdm', name: 'Team Deathmatch', short: 'TDM', desc: 'Zwei Teams, schnelle Respawns, freie Waffenwahl. 50 Kills gewinnen.', max: 12, teams: true, ranked: false },
  gungame: { id: 'gungame', name: 'Gun Game', short: 'GG', desc: 'Jede Eliminierung bringt die nächste Waffe. Wer zuerst durch ist, gewinnt.', max: 12, teams: false, ranked: false },
  zombie: { id: 'zombie', name: 'Zombie-Modus', short: 'ZM', desc: 'Überlebe bis der Timer abläuft – oder infiziere alle als Zombie.', max: 12, teams: true, ranked: false },
  sniper: { id: 'sniper', name: 'Only Sniper', short: 'SN', desc: 'Nur Scharfschützengewehre, schnelle Respawns, Headshots zählen extra.', max: 10, teams: false, ranked: true },
};

export const MODE_MAPS = {
  comp5: ['kraftwerk'],
  comp2: ['basar'],
  tdm: ['siedlung', 'kraftwerk', 'lagerhalle'],
  gungame: ['siedlung', 'lagerhalle', 'kraftwerk', 'basar'],
  zombie: ['lagerhalle', 'siedlung'],
  sniper: ['skyline', 'siedlung'],
};
