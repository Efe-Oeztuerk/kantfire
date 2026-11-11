// Kosmetik: Waffen-Lackierungen, Outfits, Köpfe/Gesichter, Hüte, Handschuhe.
// Alles rein optisch – kein Gegenstand verändert Spielwerte.

export const RARITIES = {
  common: { name: 'Common', color: '#b0b8c2', price: 100 },
  uncommon: { name: 'Uncommon', color: '#5fbf6a', price: 250 },
  rare: { name: 'Rare', color: '#4b8df0', price: 600 },
  epic: { name: 'Epic', color: '#a45cf0', price: 1500 },
  legendary: { name: 'Legendary', color: '#f0a020', price: 4000 },
};

const I = (type, id, name, rarity, data) => ({ type, id, name, rarity, ...data });

export const ITEMS = [
  // Waffen-Lackierungen (pro Waffe ausrüstbar)
  I('finish', 'f_stock', 'Werkszustand', 'common', { a: 0x3a3d42, b: 0x23252a }),
  I('finish', 'f_sand', 'Sandsturm', 'common', { a: 0xc9ad7a, b: 0x8a7550 }),
  I('finish', 'f_forest', 'Waldtarn', 'common', { a: 0x4e6b3d, b: 0x2f3d24, pattern: 'camo' }),
  I('finish', 'f_arctic', 'Arktis', 'uncommon', { a: 0xe6edf2, b: 0x9fb2c2, pattern: 'camo' }),
  I('finish', 'f_cobalt', 'Kobalt', 'uncommon', { a: 0x2457c5, b: 0x0f2a66 }),
  I('finish', 'f_ember', 'Glut', 'rare', { a: 0xd2421f, b: 0x2a1410, pattern: 'stripes' }),
  I('finish', 'f_mint', 'Minze', 'rare', { a: 0x63e0b5, b: 0x1d5747, pattern: 'stripes' }),
  I('finish', 'f_neon', 'Neonpuls', 'epic', { a: 0x14e0ff, b: 0x101826, pattern: 'glow' }),
  I('finish', 'f_venom', 'Gift', 'epic', { a: 0x8cff1a, b: 0x1b240f, pattern: 'glow' }),
  I('finish', 'f_gold', 'Blattgold', 'legendary', { a: 0xf2c14e, b: 0x8a5a12, pattern: 'glow' }),
  I('finish', 'f_void', 'Leere', 'legendary', { a: 0x8e2cff, b: 0x05030a, pattern: 'glow' }),
  // Outfits (Oberkörper/Beine)
  I('outfit', 'o_basic', 'Standard', 'common', { torso: 0x55606e, legs: 0x2e333b }),
  I('outfit', 'o_urban', 'Urban', 'common', { torso: 0x7a7f86, legs: 0x3b3f45 }),
  I('outfit', 'o_desert', 'Wüste', 'uncommon', { torso: 0xb59a6b, legs: 0x6b5a3e }),
  I('outfit', 'o_forest', 'Förster', 'uncommon', { torso: 0x4e6b3d, legs: 0x2f3d24 }),
  I('outfit', 'o_hazard', 'Gefahrgut', 'rare', { torso: 0xf2c81f, legs: 0x333333 }),
  I('outfit', 'o_night', 'Nachtschicht', 'rare', { torso: 0x1c2233, legs: 0x0d1018 }),
  I('outfit', 'o_royal', 'Königlich', 'epic', { torso: 0x6a1fb5, legs: 0x221040 }),
  I('outfit', 'o_chrome', 'Chrom', 'legendary', { torso: 0xd8dde3, legs: 0x8a9099 }),
  // Gesichter/Köpfe
  I('face', 'h_smile', 'Lächeln', 'common', { skin: 0xf2c79b, face: 'smile' }),
  I('face', 'h_serious', 'Ernst', 'common', { skin: 0xd9a77a, face: 'serious' }),
  I('face', 'h_cool', 'Sonnenbrille', 'uncommon', { skin: 0xb07d55, face: 'shades' }),
  I('face', 'h_angry', 'Wütend', 'uncommon', { skin: 0x8a5a3b, face: 'angry' }),
  I('face', 'h_mask', 'Sturmhaube', 'rare', { skin: 0x2a2a2a, face: 'mask' }),
  I('face', 'h_robot', 'Roboter', 'epic', { skin: 0x9aa4b0, face: 'robot' }),
  I('face', 'h_skull', 'Schädel', 'legendary', { skin: 0xeeeeee, face: 'skull' }),
  // Hüte/Accessoires
  I('hat', 'a_none', 'Keine', 'common', { hat: 'none' }),
  I('hat', 'a_cap', 'Kappe', 'common', { hat: 'cap', color: 0x2f5f8f }),
  I('hat', 'a_beanie', 'Mütze', 'uncommon', { hat: 'beanie', color: 0xa4472f }),
  I('hat', 'a_headset', 'Headset', 'uncommon', { hat: 'headset', color: 0x222222 }),
  I('hat', 'a_helmet', 'Gefechtshelm', 'rare', { hat: 'helmet', color: 0x4e5a3d }),
  I('hat', 'a_horns', 'Hörner', 'epic', { hat: 'horns', color: 0xd9d0c0 }),
  I('hat', 'a_crown', 'Krone', 'legendary', { hat: 'crown', color: 0xf2c14e }),
  // Handschuhe
  I('gloves', 'g_black', 'Schwarz', 'common', { color: 0x1d1f22 }),
  I('gloves', 'g_tan', 'Leder', 'common', { color: 0x8a6a45 }),
  I('gloves', 'g_red', 'Rot', 'uncommon', { color: 0xb02a2a }),
  I('gloves', 'g_camo', 'Tarnmuster', 'rare', { color: 0x4e6b3d }),
  I('gloves', 'g_neon', 'Neon', 'epic', { color: 0x14e0ff }),
  I('gloves', 'g_gold', 'Gold', 'legendary', { color: 0xf2c14e }),
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const DEFAULT_OWNED = ['f_stock', 'o_basic', 'o_urban', 'h_smile', 'h_serious', 'a_none', 'a_cap', 'g_black', 'g_tan'];
export const DEFAULT_LOADOUT = { outfit: 'o_basic', face: 'h_smile', hat: 'a_none', gloves: 'g_black', finishes: {} };

// Freischaltungen durch Levelaufstieg
export const LEVEL_UNLOCKS = {
  2: 'f_sand', 3: 'a_beanie', 4: 'o_desert', 5: 'f_forest', 6: 'h_cool', 7: 'g_red', 8: 'f_arctic', 10: 'o_forest',
  12: 'a_headset', 14: 'f_cobalt', 16: 'h_angry', 18: 'o_hazard', 20: 'f_ember', 23: 'g_camo', 26: 'a_helmet',
  30: 'f_mint', 35: 'h_mask', 40: 'o_night', 45: 'f_neon', 50: 'a_horns',
};

export function shopPrice(item) { return RARITIES[item.rarity].price; }
