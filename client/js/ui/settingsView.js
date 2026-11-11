// Einstellungsmenü (im Hauptmenü und im Spiel nutzbar).
import { settings, saveSettings, resetSettings, ACTIONS, keyName } from '../settings.js';
import { audio } from '../game/audio.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export function renderSettings(el, tab = 'graphics') {
  el.innerHTML = '';
  const tabs = h(`<div class="tabs">
    <button data-t="graphics">Grafik</button><button data-t="audio">Audio</button><button data-t="controls">Steuerung</button><button data-t="gameplay">Gameplay</button>
  </div>`);
  const body = h('<div></div>');
  el.append(tabs, body);
  tabs.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.t === tab);
    b.onclick = () => renderSettings(el, b.dataset.t);
  });

  const row = (label, control, value = '') => { const r = h(`<div class="set-row"><div>${label}</div><div class="ctl"></div><div class="muted val">${value}</div></div>`); r.querySelector('.ctl').append(control); body.append(r); return r; };
  const slider = (sec, key, label, min, max, step, fmt = (v) => v) => {
    const i = h(`<input type="range" min="${min}" max="${max}" step="${step}" value="${settings[sec][key]}">`);
    const r = row(label, i, fmt(settings[sec][key]));
    i.oninput = () => { settings[sec][key] = Number(i.value); r.querySelector('.val').textContent = fmt(Number(i.value)); saveSettings(); };
  };
  const select = (sec, key, label, opts) => {
    const s = h(`<select>${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`);
    s.value = String(settings[sec][key]);
    s.onchange = () => { const n = Number(s.value); settings[sec][key] = Number.isNaN(n) ? s.value : n; saveSettings(); };
    row(label, s);
  };
  const check = (obj, key, label, after) => {
    const c = h(`<input type="checkbox" ${obj[key] ? 'checked' : ''}>`);
    c.onchange = () => { obj[key] = c.checked; saveSettings(); after?.(); };
    row(label, c);
  };

  if (tab === 'graphics') {
    const fs = h(`<button>${document.fullscreenElement ? 'Fenstermodus' : 'Vollbild'}</button>`);
    fs.onclick = async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen().catch(() => {}); fs.textContent = document.fullscreenElement ? 'Fenstermodus' : 'Vollbild'; };
    row('Anzeigemodus', fs);
    slider('graphics', 'renderScale', 'Auflösung (Renderskalierung)', 0.5, 1.5, 0.05, (v) => `${Math.round(v * 100)} % · ${Math.round(innerWidth * devicePixelRatio * v)}×${Math.round(innerHeight * devicePixelRatio * v)}`);
    select('graphics', 'fpsLimit', 'FPS-Limit', [[0, 'Bildschirmrate (V-Sync)'], [30, '30'], [60, '60'], [90, '90'], [120, '120'], [144, '144'], [240, '240']]);
    row('V-Sync', h('<span class="muted">Im Browser immer aktiv (bildschirmsynchron). Über das FPS-Limit lässt sich die Last senken.</span>'));
    select('graphics', 'textures', 'Texturqualität', [['niedrig', 'Niedrig'], ['hoch', 'Hoch']]);
    select('graphics', 'shadows', 'Schattenqualität', [['aus', 'Aus'], ['niedrig', 'Niedrig'], ['mittel', 'Mittel'], ['hoch', 'Hoch']]);
    select('graphics', 'effects', 'Effektqualität', [['niedrig', 'Niedrig'], ['hoch', 'Hoch']]);
    check(settings.graphics, 'aa', 'Anti-Aliasing (nach Neustart des Spiels)');
    slider('graphics', 'viewDist', 'Sichtweite', 60, 300, 10, (v) => v + ' m');
    slider('graphics', 'fov', 'Sichtfeld (horizontal)', 70, 120, 1, (v) => v + '°');
    body.append(h('<p class="muted">Textur- und Effektänderungen greifen ab der nächsten Map.</p>'));
  }
  if (tab === 'audio') {
    for (const [k, l] of [['master', 'Gesamtlautstärke'], ['music', 'Musik'], ['weapons', 'Waffen'], ['steps', 'Schritte'], ['ambient', 'Umgebungsgeräusche'], ['ui', 'UI-Sounds']])
      slider('audio', k, l, 0, 1, 0.05, (v) => Math.round(v * 100) + ' %');
    row('Sprachchat', h('<span class="muted">Noch nicht verfügbar (siehe README „Nicht fertiggestellt“).</span>'));
    const t = h('<button>Testton</button>'); t.onclick = () => { audio.init(); audio.gun('rifle', null); }; row('Test', t);
  }
  if (tab === 'controls') {
    slider('controls', 'sens', 'Maus-Sensitivität', 0.1, 4, 0.05, (v) => v.toFixed(2));
    slider('controls', 'adsSens', 'ADS-Sensitivität (Zielen)', 0.2, 2, 0.05, (v) => v.toFixed(2));
    slider('controls', 'scopeSens', 'Zielfernrohr-Sensitivität', 0.2, 2, 0.05, (v) => v.toFixed(2));
    check(settings.controls, 'invert', 'Maus invertieren');
    body.append(h('<h4 style="margin:18px 0 4px">Tastenbelegung</h4>'));
    for (const [act, label] of Object.entries(ACTIONS)) {
      const b = h(`<button class="keybind">${keyName(settings.controls.keys[act])}</button>`);
      b.onclick = () => {
        b.classList.add('wait'); b.textContent = 'Taste drücken …';
        const done = (code) => {
          window.removeEventListener('keydown', kd, true); window.removeEventListener('mousedown', md, true);
          if (code !== 'Escape') {
            // doppelte Belegung auflösen
            for (const [a, c] of Object.entries(settings.controls.keys)) if (c === code && a !== act) settings.controls.keys[a] = '';
            settings.controls.keys[act] = code; saveSettings();
          }
          renderSettings(el, 'controls');
        };
        const kd = (e) => { e.preventDefault(); e.stopPropagation(); done(e.code); };
        const md = (e) => { e.preventDefault(); e.stopPropagation(); done('Mouse' + e.button); };
        setTimeout(() => { window.addEventListener('keydown', kd, true); window.addEventListener('mousedown', md, true); }, 50);
      };
      row(label, b);
    }
  }
  if (tab === 'gameplay') {
    const ch = settings.gameplay.crosshair;
    const prev = h('<canvas width="80" height="80" style="background:#445;border-radius:8px"></canvas>');
    const draw = () => drawCrosshair(prev, ch);
    row('Vorschau', prev);
    const color = h(`<input type="color" value="${ch.color}">`); color.oninput = () => { ch.color = color.value; saveSettings(); draw(); }; row('Fadenkreuzfarbe', color);
    for (const [k, l, min, max] of [['size', 'Fadenkreuzgröße', 2, 20], ['thick', 'Fadenkreuzdicke', 1, 6], ['gap', 'Abstand', 0, 12]]) {
      const i = h(`<input type="range" min="${min}" max="${max}" step="1" value="${ch[k]}">`);
      const r = row(l, i, ch[k]);
      i.oninput = () => { ch[k] = Number(i.value); r.querySelector('.val').textContent = i.value; saveSettings(); draw(); };
    }
    check(ch, 'dot', 'Mittelpunkt', draw);
    check(ch, 'outline', 'Umrandung', draw);
    check(settings.gameplay, 'hitmarker', 'Trefferanzeige');
    check(settings.gameplay, 'dmgNumbers', 'Schadensanzeige (Zahlen)');
    check(settings.gameplay, 'killfeed', 'Kill-Feed');
    check(settings.gameplay, 'radar', 'Radar');
    check(settings.gameplay, 'showFps', 'FPS anzeigen');
    check(settings.gameplay, 'showNet', 'Ping & Paketverlust anzeigen');
    slider('gameplay', 'hudScale', 'HUD-Skalierung', 0.6, 1.4, 0.05, (v) => Math.round(v * 100) + ' %');
    draw();
  }
  const reset = h('<button class="danger" style="margin-top:16px">Diesen Bereich zurücksetzen</button>');
  reset.onclick = () => { resetSettings(tab); renderSettings(el, tab); };
  body.append(reset);
}

export function drawCrosshair(cv, ch) {
  const g = cv.getContext('2d');
  const W = cv.width, c = W / 2;
  g.clearRect(0, 0, W, W);
  const lines = [[c - ch.gap - ch.size, c - ch.thick / 2, ch.size, ch.thick], [c + ch.gap, c - ch.thick / 2, ch.size, ch.thick], [c - ch.thick / 2, c - ch.gap - ch.size, ch.thick, ch.size], [c - ch.thick / 2, c + ch.gap, ch.thick, ch.size]];
  if (ch.dot) lines.push([c - ch.thick / 2, c - ch.thick / 2, ch.thick, ch.thick]);
  if (ch.outline) { g.fillStyle = '#000'; for (const [x, y, w, hh] of lines) g.fillRect(x - 1, y - 1, w + 2, hh + 2); }
  g.fillStyle = ch.color;
  for (const [x, y, w, hh] of lines) g.fillRect(x, y, w, hh);
}
