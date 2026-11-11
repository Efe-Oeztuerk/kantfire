// Einstellungen: Standardwerte, lokale + serverseitige Speicherung, Tastenbelegung.
import { api } from './api.js';

export const ACTIONS = {
  forward: 'Vorwärts', back: 'Rückwärts', left: 'Links', right: 'Rechts', jump: 'Springen', crouch: 'Ducken', walk: 'Gehen (leise)',
  fire: 'Schießen', alt: 'Zielen / Zielfernrohr', reload: 'Nachladen', use: 'Interagieren (Bombe, Aufheben)', drop: 'Waffe fallen lassen',
  slot1: 'Primärwaffe', slot2: 'Sekundärwaffe', slot3: 'Nahkampf', slot4: 'Granaten', slot5: 'Bombe',
  buy: 'Kaufmenü / Waffenwahl', score: 'Punktestand', chat: 'Chat (alle)', teamchat: 'Chat (Team)',
};

export const DEFAULTS = {
  graphics: { renderScale: 1, shadows: 'mittel', aa: true, fov: 90, viewDist: 160, fpsLimit: 0, effects: 'hoch', textures: 'hoch' },
  audio: { master: 0.8, music: 0.35, weapons: 0.9, steps: 1, ambient: 0.5, ui: 0.7, voice: 0.8 },
  controls: {
    sens: 1.0, adsSens: 0.8, scopeSens: 0.7, invert: false,
    keys: {
      forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'KeyC', walk: 'ShiftLeft',
      fire: 'Mouse0', alt: 'Mouse2', reload: 'KeyR', use: 'KeyE', drop: 'KeyG',
      slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'Digit5',
      buy: 'KeyB', score: 'Tab', chat: 'KeyY', teamchat: 'KeyU',
    },
  },
  gameplay: {
    crosshair: { color: '#3cff6e', size: 7, thick: 2, gap: 4, dot: false, outline: true },
    hitmarker: true, dmgNumbers: true, killfeed: true, hudScale: 1, showFps: true, showNet: true, radar: true,
  },
};

function merge(def, val) {
  if (val === undefined || val === null) return structuredClone(def);
  if (typeof def !== 'object' || Array.isArray(def)) return typeof val === typeof def ? val : def;
  const out = {};
  for (const k of Object.keys(def)) out[k] = merge(def[k], val[k]);
  return out;
}

export const settings = merge(DEFAULTS, JSON.parse(localStorage.getItem('kf_settings') || 'null'));
const listeners = [];
export function onSettings(fn) { listeners.push(fn); }

export function applyServerSettings(s) {
  if (!s || !Object.keys(s).length) return;
  Object.assign(settings, merge(DEFAULTS, s));
  localStorage.setItem('kf_settings', JSON.stringify(settings));
  listeners.forEach((f) => f(settings));
}

let saveTimer = null;
export function saveSettings() {
  localStorage.setItem('kf_settings', JSON.stringify(settings));
  listeners.forEach((f) => f(settings));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api('/settings', { method: 'PUT', body: { settings } }).catch(() => {}), 600);
}
export function resetSettings(section) {
  settings[section] = structuredClone(DEFAULTS[section]);
  saveSettings();
}

export function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Mouse')) return ['Linke Maustaste', 'Mittlere Maustaste', 'Rechte Maustaste', 'Maustaste 4', 'Maustaste 5'][+code.slice(5)] || code;
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' links').replace('Right', ' rechts').replace('Space', 'Leertaste').replace('Control', 'Strg').replace('Shift', 'Umschalt');
}
