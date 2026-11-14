// Alle Matchregeln zentral und überschreibbar über config.json im Projektordner (Backend-Konfiguration).
import fs from 'fs';
import path from 'path';

const DEFAULTS = {
  server: { name: process.env.SERVER_NAME || 'KANTFIRE Server', region: process.env.REGION || 'EU', maxRooms: 40 },
  matchmaking: { waitBeforeBots: 12, fillWithBots: true, botDifficulty: 0.4 }, // 0.4 = Stufe „Normal“
  comp5: {
    freezeTime: 10, buyTime: 30, roundTime: 105, bombTimer: 40, plantTime: 3, defuseTime: 10, kitDefuseTime: 5,
    maxRounds: 24, winRounds: 13, overtime: true, overtimeRounds: 6, overtimeMoney: 10000, roundEndTime: 5,
    startMoney: 800, maxMoney: 16000, winElim: 3250, winBomb: 3500, winDefuse: 3500, winTime: 3250,
    lossBase: 1400, lossStep: 500, lossMax: 3400, plantBonus: 300, plantTeamBonus: 800, friendlyFire: false,
  },
  comp2: {
    freezeTime: 8, buyTime: 25, roundTime: 90, bombTimer: 40, plantTime: 3, defuseTime: 10, kitDefuseTime: 5,
    maxRounds: 16, winRounds: 9, overtime: true, overtimeRounds: 6, overtimeMoney: 10000, roundEndTime: 4,
    startMoney: 800, maxMoney: 16000, winElim: 3250, winBomb: 3500, winDefuse: 3500, winTime: 3250,
    lossBase: 1400, lossStep: 500, lossMax: 3400, plantBonus: 300, plantTeamBonus: 800, friendlyFire: false,
  },
  gungame: {
    ladder: ['viper', 'hammer', 'mk5', 'rift', 'breacher', 'falke', 'kr47', 'saber', 'aurus', 'sparrow', 'longbow', 'juggernaut', 'thunder', 'klinge'],
    respawnTime: 2, spawnProtect: 2, timeLimit: 600, knifeSteal: true,
  },
  zombie: {
    infectDelay: 15, roundTime: 180, rounds: 3, roundEndTime: 6, zombieRespawn: 3,
    classes: {
      runner: { name: 'Läufer', hp: 600, speed: 1.22, jump: 1.1 },
      tank: { name: 'Panzer', hp: 1600, speed: 0.95, jump: 1.0 },
    },
    motherHpMult: 2, knockback: 2.2,
  },
  sniper: {
    teams: false, timeLimit: 480, scoreLimit: 3000, killPoints: 100, headshotBonus: 50,
    respawnTime: 2, spawnProtect: 2, oneShot: false, defaultWeapon: 'sparrow', allowed: ['longbow', 'sparrow', 'tempest', 'lynx'],
  },
  tdm: {
    killLimit: 50, timeLimit: 600, respawnTime: 3, spawnProtect: 2, grenade: true,
    primaries: ['kr47', 'saber', 'aurus', 'falke', 'mk5', 'u45', 'rift', 'vektor', 'breacher', 'lynx', 'sparrow', 'longbow', 'juggernaut'],
    secondaries: ['viper', 'warden', 'hammer', 'thunder'], defaultPrimary: 'kr47', defaultSecondary: 'viper',
  },
  warmup: { respawnTime: 1.5 },
};

function deepMerge(a, b) {
  for (const k in b) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && typeof a[k] === 'object') deepMerge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}

export const CONFIG = structuredClone(DEFAULTS);
const file = path.resolve(process.env.CONFIG_FILE || 'config.json');
if (fs.existsSync(file)) deepMerge(CONFIG, JSON.parse(fs.readFileSync(file, 'utf8')));

export function modeConfig(mode, overrides = {}) {
  return deepMerge(structuredClone(CONFIG[mode]), overrides || {});
}
