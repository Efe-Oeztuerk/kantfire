import { BombMode } from './bomb.js';
import { GunGame } from './gungame.js';
import { ZombieMode } from './zombie.js';
import { SniperMode } from './sniper.js';
import { Warmup } from './warmup.js';
import { TeamDeathmatch } from './tdm.js';

export function createMode(id, room, cfg) {
  switch (id) {
    case 'comp5':
    case 'comp2': return new BombMode(room, cfg);
    case 'gungame': return new GunGame(room, cfg);
    case 'zombie': return new ZombieMode(room, cfg);
    case 'sniper': return new SniperMode(room, cfg);
    case 'warmup': return new Warmup(room, cfg);
    case 'tdm': return new TeamDeathmatch(room, cfg);
    default: throw new Error('Unbekannter Modus ' + id);
  }
}
