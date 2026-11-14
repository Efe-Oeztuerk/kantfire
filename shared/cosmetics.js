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
  I('finish', 'f_rose', 'Rosé', 'uncommon', { a: 0xf08cb4, b: 0x6a2a44 }),
  I('finish', 'f_carbon', 'Carbon', 'rare', { a: 0x2a2c30, b: 0x111214, pattern: 'stripes' }),
  I('finish', 'f_tiger', 'Tiger', 'rare', { a: 0xf08a1c, b: 0x1a1208, pattern: 'stripes', src: 'bp' }),
  I('finish', 'f_ice', 'Eiskristall', 'epic', { a: 0xa8e8ff, b: 0x2a6a9a, pattern: 'camo', src: 'crate' }),
  I('finish', 'f_toxic', 'Toxisch', 'epic', { a: 0xb4ff2a, b: 0x2a3a10, pattern: 'camo', src: 'bp' }),
  I('finish', 'f_galaxy', 'Galaxie', 'legendary', { a: 0x5a2cff, b: 0x0a0420, pattern: 'camo', src: 'crate' }),
  I('finish', 'f_lava', 'Lava', 'legendary', { a: 0xff4a10, b: 0x2a0800, pattern: 'glow', src: 'bp' }),
  // Outfits (Oberkörper/Beine)
  I('outfit', 'o_basic', 'Standard', 'common', { torso: 0x55606e, legs: 0x2e333b }),
  I('outfit', 'o_urban', 'Urban', 'common', { torso: 0x7a7f86, legs: 0x3b3f45 }),
  I('outfit', 'o_desert', 'Wüste', 'uncommon', { torso: 0xb59a6b, legs: 0x6b5a3e }),
  I('outfit', 'o_forest', 'Förster', 'uncommon', { torso: 0x4e6b3d, legs: 0x2f3d24 }),
  I('outfit', 'o_hazard', 'Gefahrgut', 'rare', { torso: 0xf2c81f, legs: 0x333333 }),
  I('outfit', 'o_night', 'Nachtschicht', 'rare', { torso: 0x1c2233, legs: 0x0d1018 }),
  I('outfit', 'o_royal', 'Königlich', 'epic', { torso: 0x6a1fb5, legs: 0x221040 }),
  I('outfit', 'o_chrome', 'Chrom', 'legendary', { torso: 0xd8dde3, legs: 0x8a9099 }),
  // Nur für Admins: Fußballtrikot in Rot-Gelb (geteilt), Nummer 10, Stutzen und Fußballschuhe
  I('outfit', 'o_admin', 'Löwen-Trikot (Admin)', 'legendary', { torso: 0xa90432, legs: 0xa90432, src: 'admin', kit: { a: 0xa90432, b: 0xfdb912, shorts: 0xa90432, sock: 0xa90432, sockB: 0xfdb912, boot: 0x111111, num: '10' } }),
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
  // Hautfarben
  I('skin', 's_pale', 'Hell', 'common', { color: 0xf6d7b8 }),
  I('skin', 's_light', 'Pfirsich', 'common', { color: 0xf2c79b }),
  I('skin', 's_tan', 'Gebräunt', 'common', { color: 0xd9a77a }),
  I('skin', 's_brown', 'Braun', 'common', { color: 0xa8714a }),
  I('skin', 's_dark', 'Dunkel', 'common', { color: 0x6e4630 }),
  I('skin', 's_olive', 'Oliv', 'uncommon', { color: 0xb89a6a }),
  I('skin', 's_alien', 'Alien', 'epic', { color: 0x7ad05a, src: 'bp' }),
  I('skin', 's_ocean', 'Ozean', 'epic', { color: 0x4aa0e0, src: 'crate' }),
  I('skin', 's_gold', 'Goldhaut', 'legendary', { color: 0xf2c14e, src: 'bp' }),
  // Emotes
  I('emote', 'e_wave', 'Winken', 'common', { anim: 'wave' }),
  I('emote', 'e_salute', 'Salutieren', 'common', { anim: 'salute' }),
  I('emote', 'e_facepalm', 'Facepalm', 'uncommon', { anim: 'facepalm' }),
  I('emote', 'e_flex', 'Muskeln', 'rare', { anim: 'flex' }),
  I('emote', 'e_jacks', 'Hampelmann', 'rare', { anim: 'jacks' }),
  I('emote', 'e_dance', 'Tanzen', 'epic', { anim: 'dance', src: 'bp' }),
  I('emote', 'e_spin', 'Pirouette', 'epic', { anim: 'spin' }),
  I('emote', 'e_robot', 'Roboter-Tanz', 'legendary', { anim: 'robot', src: 'bp' }),
  // Handschuhe
  I('gloves', 'g_black', 'Schwarz', 'common', { color: 0x1d1f22 }),
  I('gloves', 'g_tan', 'Leder', 'common', { color: 0x8a6a45 }),
  I('gloves', 'g_red', 'Rot', 'uncommon', { color: 0xb02a2a }),
  I('gloves', 'g_camo', 'Tarnmuster', 'rare', { color: 0x4e6b3d }),
  I('gloves', 'g_neon', 'Neon', 'epic', { color: 0x14e0ff }),
  I('gloves', 'g_gold', 'Gold', 'legendary', { color: 0xf2c14e }),
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const DEFAULT_OWNED = ['f_stock', 'o_basic', 'o_urban', 'h_smile', 'h_serious', 'a_none', 'a_cap', 'g_black', 'g_tan', 's_pale', 's_light', 's_tan', 's_brown', 's_dark', 'e_wave'];
export const DEFAULT_LOADOUT = { outfit: 'o_basic', face: 'h_smile', hat: 'a_none', gloves: 'g_black', skin: 's_light', emote: 'e_wave', finishes: {} };
export const SLOT_TYPES = { outfit: 'outfit', face: 'face', hat: 'hat', gloves: 'gloves', skin: 'skin', emote: 'emote' };
export const TYPE_NAMES = { finish: 'Waffen-Skin', outfit: 'Outfit', face: 'Gesicht', hat: 'Accessoire', gloves: 'Handschuhe', skin: 'Hautfarbe', emote: 'Emote' };

// Freischaltungen durch Levelaufstieg
export const LEVEL_UNLOCKS = {
  2: 'f_sand', 3: 'a_beanie', 4: 'o_desert', 5: 'f_forest', 6: 'h_cool', 7: 'g_red', 8: 'f_arctic', 10: 'o_forest',
  12: 'a_headset', 14: 'f_cobalt', 16: 'h_angry', 18: 'o_hazard', 20: 'f_ember', 23: 'g_camo', 26: 'a_helmet',
  30: 'f_mint', 35: 'h_mask', 40: 'o_night', 45: 'f_neon', 50: 'a_horns',
};

export function shopPrice(item) { return RARITIES[item.rarity].price; }
export const inShop = (i) => !i.src;
export const inCrates = (i) => !i.src || i.src === 'crate';

// Truhen: Gewichte je Seltenheit (in %). Werden im Menü offen angezeigt.
export const CRATES = {
  standard: { id: 'standard', name: 'Standard-Truhe', price: 300, color: '#ff6a2a', types: ['finish', 'outfit', 'face', 'hat', 'gloves', 'skin', 'emote'], weights: { common: 50, uncommon: 28, rare: 14, epic: 6, legendary: 2 } },
  waffen: { id: 'waffen', name: 'Waffen-Truhe', price: 400, color: '#4b8df0', types: ['finish'], weights: { common: 40, uncommon: 30, rare: 18, epic: 9, legendary: 3 } },
};
export const DUPLICATE_REFUND = 0.4; // Anteil des Shop-Preises bei Duplikaten
