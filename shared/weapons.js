// Waffen- und Ausrüstungsdaten. Eigene Namen, an bekannten Shootern orientierte Rollen.
// dmg = Grundschaden, rpm = Schuss/Minute, pen = Anteil Schaden, der bei Rüstung auf die Lebenspunkte geht,
// hs = Kopfschuss-Multiplikator, falloff = Schadensfaktor je 10 m, spread = Grundstreuung (rad),
// move/jump = Zusatzstreuung bei Bewegung/Sprung, mob = Bewegungsfaktor, kick = Rückstoß pro Schuss.
import { hash01 } from './util.js';

export const CATEGORIES = [
  { id: 'pistol', name: 'Pistolen' },
  { id: 'smg', name: 'Maschinenpistolen' },
  { id: 'rifle', name: 'Sturmgewehre' },
  { id: 'shotgun', name: 'Schrotflinten' },
  { id: 'dmr', name: 'Präzisionsgewehre' },
  { id: 'sniper', name: 'Scharfschützengewehre' },
  { id: 'heavy', name: 'Schwere Waffen' },
  { id: 'grenade', name: 'Granaten' },
  { id: 'gear', name: 'Ausrüstung' },
];

const W = (o) => ({ auto: false, pellets: 1, hs: 4, falloff: 0.9, move: 0.04, jump: 0.15, mob: 1, reward: 300, kick: 0.012, sway: 0.004, swayStart: 6, recover: 0.35, scope: null, scopedSpread: null, slot: 0, reload: 2.5, draw: 0.6, range: 300, ...o });

export const WEAPONS = {
  // Pistolen (Slot 1)
  viper: W({ id: 'viper', name: 'Viper-9', cat: 'pistol', slot: 1, price: 200, dmg: 28, rpm: 400, mag: 20, reserve: 120, pen: 0.47, falloff: 0.85, spread: 0.011, move: 0.03, kick: 0.012, reload: 2.2, draw: 0.4 }),
  warden: W({ id: 'warden', name: 'Warden-S', cat: 'pistol', slot: 1, price: 200, dmg: 35, rpm: 352, mag: 12, reserve: 48, pen: 0.5, falloff: 0.87, spread: 0.008, move: 0.03, kick: 0.016, reload: 2.2, draw: 0.4 }),
  hammer: W({ id: 'hammer', name: 'Hammer .50', cat: 'pistol', slot: 1, price: 700, dmg: 63, rpm: 267, mag: 7, reserve: 35, pen: 0.93, hs: 3.9, falloff: 0.81, spread: 0.012, move: 0.07, kick: 0.06, reload: 2.2, draw: 0.5 }),
  thunder: W({ id: 'thunder', name: 'Thunder-Revolver', cat: 'pistol', slot: 1, price: 600, dmg: 86, rpm: 120, mag: 8, reserve: 8, pen: 0.93, hs: 4, falloff: 0.94, spread: 0.02, move: 0.08, kick: 0.07, reload: 2.3, draw: 0.5 }),
  // Maschinenpistolen
  mk5: W({ id: 'mk5', name: 'MK-5', cat: 'smg', price: 1500, reward: 600, dmg: 27, rpm: 750, auto: true, mag: 30, reserve: 120, pen: 0.62, falloff: 0.82, spread: 0.012, move: 0.02, mob: 0.95, kick: 0.006, reload: 2.6 }),
  u45: W({ id: 'u45', name: 'U-45', cat: 'smg', price: 1200, reward: 600, dmg: 35, rpm: 666, auto: true, mag: 25, reserve: 100, pen: 0.65, falloff: 0.8, spread: 0.014, move: 0.025, mob: 0.94, kick: 0.008, reload: 3.0 }),
  rift: W({ id: 'rift', name: 'P-Rift', cat: 'smg', price: 2350, dmg: 26, rpm: 857, auto: true, mag: 50, reserve: 100, pen: 0.69, falloff: 0.84, spread: 0.014, move: 0.025, mob: 0.94, kick: 0.005, reload: 3.3 }),
  vektor: W({ id: 'vektor', name: 'Vektor X', cat: 'smg', price: 1400, reward: 600, dmg: 22, rpm: 1000, auto: true, mag: 25, reserve: 100, pen: 0.6, falloff: 0.78, spread: 0.013, move: 0.02, mob: 0.96, kick: 0.006, reload: 2.4 }),
  // Sturmgewehre
  kr47: W({ id: 'kr47', name: 'KR-47', cat: 'rifle', price: 2700, dmg: 36, rpm: 600, auto: true, mag: 30, reserve: 90, pen: 0.775, falloff: 0.98, spread: 0.0055, move: 0.08, mob: 0.86, kick: 0.016, sway: 0.006, reload: 2.5 }),
  saber: W({ id: 'saber', name: 'M-Saber', cat: 'rifle', price: 3100, dmg: 33, rpm: 666, auto: true, mag: 30, reserve: 90, pen: 0.7, falloff: 0.97, spread: 0.005, move: 0.07, mob: 0.88, kick: 0.013, sway: 0.005, reload: 3.1 }),
  aurus: W({ id: 'aurus', name: 'Aurus', cat: 'rifle', price: 3300, dmg: 28, rpm: 600, auto: true, mag: 30, reserve: 90, pen: 0.9, falloff: 0.98, spread: 0.0045, move: 0.07, mob: 0.85, kick: 0.012, sway: 0.004, scope: [42], scopedSpread: 0.002, reload: 3.8 }),
  falke: W({ id: 'falke', name: 'Falke', cat: 'rifle', price: 2050, dmg: 30, rpm: 666, auto: true, mag: 25, reserve: 90, pen: 0.7, falloff: 0.96, spread: 0.0075, move: 0.07, mob: 0.88, kick: 0.014, sway: 0.006, reload: 3.3 }),
  // Schrotflinte
  breacher: W({ id: 'breacher', name: 'Breacher', cat: 'shotgun', price: 1100, reward: 900, dmg: 26, pellets: 9, rpm: 70, mag: 7, reserve: 32, pen: 0.5, hs: 2, falloff: 0.55, spread: 0.065, move: 0.02, mob: 0.9, kick: 0.05, reload: 3.0, range: 40 }),
  // Präzisionsgewehr (halbautomatisch, leicht)
  lynx: W({ id: 'lynx', name: 'Lynx', cat: 'dmr', price: 2500, dmg: 55, rpm: 300, mag: 15, reserve: 60, pen: 0.85, hs: 4, falloff: 0.97, spread: 0.06, move: 0.08, mob: 0.94, kick: 0.025, scope: [50], scopedSpread: 0.0012, reload: 2.6, sniperClass: 'Leichter Halbautomat' }),
  // Scharfschützengewehre
  longbow: W({ id: 'longbow', name: 'Longbow', cat: 'sniper', price: 4750, reward: 100, dmg: 115, rpm: 41, mag: 5, reserve: 30, pen: 0.975, hs: 4, falloff: 0.99, spread: 0.09, move: 0.15, mob: 0.78, kick: 0.05, scope: [40, 15], scopedSpread: 0.0004, reload: 3.6, draw: 0.9, sniperClass: 'Schwerer Repetierer' }),
  sparrow: W({ id: 'sparrow', name: 'Sparrow', cat: 'sniper', price: 1700, dmg: 88, rpm: 48, mag: 10, reserve: 90, pen: 0.85, hs: 4, falloff: 0.98, spread: 0.07, move: 0.09, mob: 0.98, kick: 0.035, scope: [40, 15], scopedSpread: 0.0006, reload: 2.9, draw: 0.6, sniperClass: 'Leichter Repetierer' }),
  tempest: W({ id: 'tempest', name: 'Tempest', cat: 'sniper', price: 5000, reward: 300, dmg: 80, rpm: 240, mag: 20, reserve: 90, pen: 0.82, hs: 4, falloff: 0.98, spread: 0.08, move: 0.12, mob: 0.8, kick: 0.03, scope: [40, 15], scopedSpread: 0.0012, reload: 3.4, draw: 0.8, sniperClass: 'Schwerer Halbautomat' }),
  // Schwere Waffe
  juggernaut: W({ id: 'juggernaut', name: 'Juggernaut', cat: 'heavy', price: 5200, dmg: 32, rpm: 750, auto: true, mag: 100, reserve: 200, pen: 0.75, falloff: 0.95, spread: 0.016, move: 0.08, mob: 0.78, kick: 0.01, sway: 0.008, reload: 5.5, draw: 0.9 }),
  // Nahkampf (Slot 2)
  klinge: W({ id: 'klinge', name: 'Klinge', cat: 'melee', slot: 2, price: 0, reward: 1500, dmg: 55, rpm: 100, mag: 0, reserve: 0, pen: 0.85, hs: 1.3, spread: 0, move: 0, jump: 0, mob: 1.04, kick: 0, melee: 1.9, draw: 0.3 }),
  klaue: W({ id: 'klaue', name: 'Zombieklaue', cat: 'melee', slot: 2, price: 0, reward: 0, dmg: 50, rpm: 120, mag: 0, reserve: 0, pen: 1, hs: 1, spread: 0, move: 0, jump: 0, mob: 1, kick: 0, melee: 2.0, draw: 0.2 }),
  // Granaten (Slot 3)
  he: W({ id: 'he', name: 'Splittergranate', cat: 'grenade', slot: 3, price: 300, dmg: 98, rpm: 60, mag: 1, reserve: 0, pen: 0.5, radius: 9, fuse: 1.6, spread: 0, move: 0, kick: 0, draw: 0.5 }),
  smoke: W({ id: 'smoke', name: 'Rauchgranate', cat: 'grenade', slot: 3, price: 300, dmg: 0, rpm: 60, mag: 1, reserve: 0, pen: 0, radius: 4.5, fuse: 1.4, duration: 16, spread: 0, move: 0, kick: 0, draw: 0.5 }),
  // Bombe (Slot 4)
  bomb: W({ id: 'bomb', name: 'Bombe', cat: 'bomb', slot: 4, price: 0, dmg: 0, rpm: 60, mag: 0, reserve: 0, pen: 0, spread: 0, move: 0, kick: 0, draw: 0.5 }),
};

export const GEAR = {
  vest: { id: 'vest', name: 'Schutzweste', cat: 'gear', price: 650, desc: '100 Rüstung, schützt den Körper' },
  vesthelm: { id: 'vesthelm', name: 'Schutzweste + Helm', cat: 'gear', price: 1000, desc: '100 Rüstung, schützt Körper und Kopf' },
  kit: { id: 'kit', name: 'Entschärfungskit', cat: 'gear', price: 400, desc: 'Halbiert die Entschärfungszeit (nur Verteidiger)', team: 'C' },
};

export const SNIPERS = ['longbow', 'sparrow', 'tempest', 'lynx'];

export function shopItems() {
  const items = [];
  for (const w of Object.values(WEAPONS)) if (w.price > 0) items.push(w);
  for (const g of Object.values(GEAR)) items.push(g);
  return items;
}

// Deterministisches Spray-Pattern: Versatz (pitch, yaw) in Radiant für Schuss Nummer i
export function sprayOffset(w, i) {
  if (!w.kick) return [0, 0];
  const climb = w.kick * Math.min(i, 9) + w.kick * 0.25 * Math.max(0, i - 9);
  const yaw = i > w.swayStart ? w.sway * Math.sin((i - w.swayStart) * 0.55) * Math.min(1, (i - w.swayStart) / 3) * 3 : 0;
  return [climb, yaw];
}

// Streuung (rad) für den aktuellen Zustand
export function currentSpread(w, { speed = 0, air = false, crouch = false, scoped = false }) {
  if (w.melee || w.cat === 'grenade') return 0;
  let base = scoped && w.scopedSpread != null ? w.scopedSpread : w.spread;
  if (w.cat === 'sniper' && !scoped) base = w.spread;
  let s = base + w.move * Math.min(1, speed / 6);
  if (air) s += w.jump;
  if (crouch) s *= 0.75;
  return s;
}

// Zufallsversatz innerhalb der Streuung, deterministisch aus (Spieler, Seq, Projektil)
export function spreadSample(spread, pid, seq, pellet = 0) {
  const a = hash01(pid, seq, pellet * 2 + 1) * Math.PI * 2;
  const r = Math.sqrt(hash01(pid, seq, pellet * 2 + 2)) * spread;
  return [Math.sin(a) * r, Math.cos(a) * r];
}

export function damageAt(w, dist) {
  return w.dmg * Math.pow(w.falloff, dist / 10);
}

export const ZONE_MULT = { head: null, body: 1, legs: 0.75 };

// CS-Prinzip: Weste schützt Körper, Helm zusätzlich den Kopf. Gibt {hp, armor} Abzug zurück.
export function applyArmor(dmg, zone, armor, helmet, pen) {
  const protectedZone = zone === 'body' || (zone === 'head' && helmet);
  if (armor <= 0 || !protectedZone) return { hp: Math.round(dmg), armor: 0 };
  let hp = dmg * pen;
  let ar = (dmg - hp) * 0.5;
  if (ar > armor) { hp = dmg - armor * 2; ar = armor; }
  return { hp: Math.round(hp), armor: Math.round(ar) };
}

// Bewegungsfaktor aus Modus, Waffe und Zielfernrohr – identisch auf Client und Server
export function moveMult(w, zoom, modeMult = 1) {
  return modeMult * (w ? w.mob : 1) * (zoom > 0 ? 0.6 : 1);
}
export const BOLT_ACTION = new Set(['longbow', 'sparrow']);
