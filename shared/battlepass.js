// Kostenloser Battlepass: 30 Stufen, Fortschritt durch Match-XP. Belohnungen werden automatisch gutgeschrieben.
export const SEASON = { id: 1, name: 'Saison 1 · Kantenbruch', tiers: 30, xpPerTier: 700 };

const R = (type, a, b) => (type === 'item' ? { type, id: a } : type === 'coins' ? { type, n: a } : { type, crate: a, n: b || 1 });
export const REWARDS = [
  null,
  R('item', 'e_salute'), R('coins', 150), R('crate', 'standard'), R('item', 's_olive'), R('item', 'f_rose'),
  R('coins', 200), R('item', 'a_headset'), R('crate', 'waffen'), R('item', 'o_hazard'), R('item', 'f_tiger'),
  R('coins', 250), R('item', 'e_facepalm'), R('crate', 'standard'), R('item', 'g_camo'), R('item', 's_alien'),
  R('coins', 300), R('item', 'f_carbon'), R('crate', 'waffen'), R('item', 'e_flex'), R('item', 'f_toxic'),
  R('coins', 350), R('item', 'h_robot'), R('crate', 'standard', 2), R('item', 'e_dance'), R('item', 'o_royal'),
  R('coins', 500), R('crate', 'waffen', 2), R('item', 's_gold'), R('item', 'e_robot'), R('item', 'f_lava'),
];

export function bpTier(xp) { return Math.min(SEASON.tiers, Math.floor(xp / SEASON.xpPerTier)); }
