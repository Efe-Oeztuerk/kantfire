// Hauptmenü und alle Menüseiten.
import * as THREE from 'three';
import { api, setToken } from '../api.js';
import { MODES, MODE_MAPS, GAME_NAME } from '/shared/constants.js';
import { MAP_LIST } from '/shared/maps.js';
import { WEAPONS } from '/shared/weapons.js';
import { ITEMS, ITEM_BY_ID, RARITIES } from '/shared/cosmetics.js';
import { rankFor, RANKED_MODES } from '/shared/progression.js';
import { renderSettings } from './settingsView.js';
import { makeCharacter, makeGun } from '../game/models.js';
import { audio } from '../game/audio.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const fmtTime = (s) => `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
const avatarColor = (name) => `hsl(${[...name].reduce((a, c) => a + c.charCodeAt(0), 0) * 37 % 360} 70% 60%)`;
const LOGO = `<span class="logo">${GAME_NAME.slice(0, 4)}<b>${GAME_NAME.slice(4)}</b></span>`;

export function toast(text, actions = [], ms = 4500) {
  const t = h(`<div class="toast"><span>${esc(text)}</span></div>`);
  for (const [label, fn] of actions) { const b = h(`<button style="margin-left:10px">${esc(label)}</button>`); b.onclick = () => { fn(); t.remove(); }; t.append(b); }
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

function modal(html) {
  const bg = h(`<div class="modal-bg"><div class="modal">${html}</div></div>`);
  document.getElementById('overlay').append(bg);
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) bg.remove(); });
  return bg;
}

export class Menu {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('menu');
    this.page = 'play';
    this.queue = null;
    this.el.addEventListener('click', (e) => { if (e.target.closest('button')) { audio.init(); audio.ui('click'); audio.startMusic(); } });
  }

  // -------------------------------------------------------------- Login
  showAuth() {
    this.el.classList.remove('hidden');
    this.el.innerHTML = `<div class="auth col">
      ${LOGO}<div class="muted">Kompetitiver Multiplayer-Shooter im Browser</div>
      <div class="tabs"><button class="active" data-m="login">Anmelden</button><button data-m="register">Registrieren</button></div>
      <input class="n" placeholder="Spielername" maxlength="16" autocomplete="username">
      <input class="p" type="password" placeholder="Passwort" autocomplete="current-password">
      <div class="err"></div>
      <button class="primary go">Anmelden</button>
      <div class="muted" style="font-size:12px">Dein Fortschritt, deine Skins und Einstellungen werden in deinem Konto gespeichert.</div></div>`;
    let mode = 'login';
    const $ = (s) => this.el.querySelector(s);
    this.el.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => {
      mode = b.dataset.m;
      this.el.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
      $('.go').textContent = mode === 'login' ? 'Anmelden' : 'Konto erstellen';
    }));
    const submit = async () => {
      $('.err').textContent = '';
      try {
        const r = await api('/' + mode, { method: 'POST', body: { name: $('.n').value.trim(), password: $('.p').value } });
        setToken(r.token);
        await this.app.afterLogin();
      } catch (e) { $('.err').textContent = e.message; }
    };
    $('.go').onclick = submit;
    $('.p').onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    $('.n').focus();
  }

  // -------------------------------------------------------------- Gerüst
  show(page = this.page) {
    this.page = page;
    this.el.classList.remove('hidden');
    const p = this.app.profile;
    const lvl = p.level;
    const pages = [['play', 'Spielen'], ['inventory', 'Inventar'], ['shop', 'Shop'], ['profile', 'Profil'], ['leaderboard', 'Rangliste'], ['stats', 'Statistiken'], ['settings', 'Einstellungen'], ['friends', 'Freunde'], ['servers', 'Server-Browser']];
    this.el.innerHTML = `<div class="topbar">${LOGO}<div class="nav">${pages.map(([id, n]) => `<button data-p="${id}" class="${id === page ? 'active' : ''}">${n}${id === 'friends' && p.requests.length ? ` <span class="tag" style="background:#ff6a2a;color:#111">${p.requests.length}</span>` : ''}</button>`).join('')}</div>
      <div class="userbox"><span title="Münzen">🪙 ${p.coins}</span><div><div style="font-size:13px">${esc(p.name)} · Level ${lvl.level}</div><div class="xpbar"><div style="width:${Math.round(lvl.into / lvl.need * 100)}%"></div></div></div>
      <div class="avatar" style="background:${avatarColor(p.name)}">${esc(p.name[0].toUpperCase())}</div><button class="lo" title="Abmelden">⎋</button></div></div><div class="page"></div>`;
    this.el.querySelectorAll('.nav button').forEach((b) => (b.onclick = () => this.show(b.dataset.p)));
    this.el.querySelector('.lo').onclick = () => this.app.logout();
    this.body = this.el.querySelector('.page');
    this.disposePreview();
    this['page_' + page]?.();
    this.renderQueue();
  }
  hide() { this.el.classList.add('hidden'); this.disposePreview(); }

  // -------------------------------------------------------------- Spielen
  page_play() {
    const p = this.app.profile;
    const ch = p.challenges || {};
    const chal = (c) => !c ? '' : c.list.map((x) => { const v = Math.min(x.goal, c.progress[x.id] || 0); return `<div class="chal"><div class="row"><span class="grow">${esc(x.text)}</span><span class="muted">${c.done[x.id] ? '✓' : `${v}/${x.goal}`}</span></div><div class="bar"><div style="width:${v / x.goal * 100}%"></div></div><div class="muted" style="font-size:12px">+${x.xp} XP · +${x.coins} Münzen</div></div>`; }).join('');
    this.body.innerHTML = `<h2>Spielmodus wählen</h2>
      <div class="cards">${Object.values(MODES).map((m) => {
        const r = p.ranks[m.id];
        return `<div class="card mode-card" data-m="${m.id}"><h3>${m.name}</h3><div class="muted">${m.desc}</div>
          <div class="muted">${m.teams && m.id !== 'zombie' ? `${m.max / 2} gegen ${m.max / 2}` : `bis zu ${m.max} Spieler`} · ${MODE_MAPS[m.id].map((id) => MAP_LIST.find((x) => x.id === id).name).join(', ')}</div>
          ${r ? `<div><span class="tag" style="color:${r.rank.color}">${r.rank.name}${r.rank.placement ? ` (noch ${r.rank.placement} Platzierungsspiele)` : ` · ${r.rating}`}</span></div>` : `<div><span class="tag">Ohne Rangliste</span></div>`}
          <div class="grow"></div><button class="primary">Match suchen</button><span class="big">${m.short}</span></div>`;
      }).join('')}</div>
      <div class="cards" style="margin-top:18px">
        <div class="card col"><h3 style="margin:0">Private Lobby</h3><div class="muted">Eigenes Match mit Freunden. Andere treten über den Lobby-Code bei.</div><button class="cl">Lobby erstellen</button>
          <div class="row"><input class="code grow" placeholder="Lobby-Code" maxlength="6" style="text-transform:uppercase"><button class="jc">Beitreten</button></div></div>
        <div class="card col"><h3 style="margin:0">Server-Browser</h3><div class="muted">Öffentliche Server durchsuchen, filtern und direkt betreten – oder einen eigenen Server erstellen.</div><button class="sb">Server-Browser öffnen</button></div>
        <div class="card col"><h3 style="margin:0">Tägliche Aufgaben</h3>${chal(ch.daily)}</div>
        <div class="card col"><h3 style="margin:0">Wöchentliche Aufgaben</h3>${chal(ch.weekly)}</div>
      </div>
      <div class="panel" style="margin-top:18px"><b>Steuerung:</b> <span class="muted">WASD bewegen · Maus zielen/schießen · Rechtsklick Zielfernrohr · R nachladen · E Bombe/Aufheben · B Kaufmenü · 1–5 Waffen · C ducken · Umschalt gehen · Tab Punktestand · Y/U Chat · Esc Menü. Alles änderbar unter Einstellungen.</span></div>`;
    this.body.querySelectorAll('.mode-card').forEach((c) => (c.onclick = () => this.app.net.send({ t: 'queue', mode: c.dataset.m })));
    this.body.querySelector('.cl').onclick = () => this.createDialog(true);
    this.body.querySelector('.sb').onclick = () => this.show('servers');
    const join = () => { const code = this.body.querySelector('.code').value.trim().toUpperCase(); if (code) this.app.net.send({ t: 'join', id: code }); };
    this.body.querySelector('.jc').onclick = join;
    this.body.querySelector('.code').onkeydown = (e) => { if (e.key === 'Enter') join(); };
  }

  setQueue(m) {
    this.queue = m.state === 'searching' ? m : null;
    this.renderQueue();
  }
  renderQueue() {
    document.querySelector('.queue-box')?.remove();
    if (!this.queue || this.el.classList.contains('hidden')) return;
    const q = this.queue;
    const box = h(`<div class="queue-box"><div class="spinner"></div><div><b>Suche ${esc(MODES[q.mode]?.name)} …</b><div class="muted" style="font-size:13px">${q.waited ?? 0} s · ${q.count ?? 1}/${q.need ?? '?'} Spieler in der Warteschlange · fehlende Plätze werden mit Bots gefüllt</div></div><button>Abbrechen</button></div>`);
    box.querySelector('button').onclick = () => { this.app.net.send({ t: 'unqueue' }); this.queue = null; box.remove(); };
    document.body.append(box);
  }

  createDialog(isPrivate) {
    const modes = Object.values(MODES);
    const bg = modal(`<h2 style="margin-top:0">${isPrivate ? 'Private Lobby erstellen' : 'Server erstellen'}</h2><div class="col">
      <label>Name <input class="nm" maxlength="40" placeholder="${esc(this.app.profile.name)}s ${isPrivate ? 'Lobby' : 'Server'}"></label>
      <label>Spielmodus <select class="md">${modes.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}</select></label>
      <label>Map <select class="mp"></select></label>
      <label>Passwort (optional) <input class="pw" maxlength="30"></label>
      <label class="row"><input type="checkbox" class="bt" checked> Freie Plätze mit Bots füllen</label>
      <label>Bot-Stärke <input type="range" class="df" min="0.1" max="1" step="0.05" value="0.55"></label>
      <div class="rules"></div>
      <div class="muted" style="font-size:12px">Ihr startet in einer Aufwärmphase. Als Host startest du das Match über Esc → „Match starten“.</div>
      <button class="primary go">Erstellen</button></div>`);
    const $ = (s) => bg.querySelector(s);
    const fillMaps = () => {
      $('.mp').innerHTML = MODE_MAPS[$('.md').value].map((id) => `<option value="${id}">${MAP_LIST.find((x) => x.id === id).name}</option>`).join('');
      $('.rules').innerHTML = $('.md').value === 'sniper' ? `<label class="row"><input type="checkbox" class="r-teams"> 5 gegen 5 statt Jeder gegen Jeden</label><label class="row"><input type="checkbox" class="r-one"> One-Shot-Modus (jeder Treffer tödlich)</label><label>Punktelimit <input type="number" class="r-lim" value="3000" min="500" step="500"></label>` : '';
    };
    $('.md').onchange = fillMaps; fillMaps();
    $('.go').onclick = () => {
      const rules = $('.md').value === 'sniper' ? { teams: $('.r-teams').checked, oneShot: $('.r-one').checked, scoreLimit: Number($('.r-lim').value) } : {};
      this.app.net.send({ t: 'create', private: isPrivate, mode: $('.md').value, map: $('.mp').value, name: $('.nm').value, password: $('.pw').value, bots: $('.bt').checked, diff: Number($('.df').value), rules });
      bg.remove();
    };
  }

  // -------------------------------------------------------------- Server-Browser
  async page_servers() {
    this.body.innerHTML = `<div class="row"><h2 class="grow">Server-Browser</h2><button class="cr primary">Server erstellen</button><button class="rf">Aktualisieren</button></div>
      <div class="row" style="margin-bottom:12px"><input class="q grow" placeholder="Suchen …"><select class="fm"><option value="">Alle Modi</option>${Object.values(MODES).map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}</select>
      <select class="fmap"><option value="">Alle Maps</option>${MAP_LIST.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}</select>
      <label class="row"><input type="checkbox" class="nf"> Nicht voll</label><label class="row"><input type="checkbox" class="nl"> Ohne Passwort</label></div>
      <div class="panel"><table><thead><tr><th>Servername</th><th>Modus</th><th>Map</th><th>Spieler</th><th>Ping</th><th>Region</th><th>🔒</th><th>Status</th><th></th></tr></thead><tbody></tbody></table></div>`;
    const $ = (s) => this.body.querySelector(s);
    $('.cr').onclick = () => this.createDialog(false);
    let data = { rooms: [] }, ping = 0;
    const draw = () => {
      const q = $('.q').value.toLowerCase();
      const rows = data.rooms.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!$('.fm').value || r.mode === $('.fm').value) && (!$('.fmap').value || r.map === $('.fmap').value) && (!$('.nf').checked || r.players < r.max) && (!$('.nl').checked || !r.locked));
      $('tbody').innerHTML = rows.length ? rows.map((r) => `<tr><td>${esc(r.name)} ${r.ranked ? '<span class="tag">Matchmaking</span>' : ''}</td><td>${MODES[r.mode].name}</td><td>${esc(MAP_LIST.find((m) => m.id === r.map)?.name)}</td><td>${r.players}${r.bots ? ` <span class="muted">+${r.bots} Bots</span>` : ''} / ${r.max}</td><td>${ping} ms</td><td>${esc(r.region)}</td><td>${r.locked ? '🔒' : ''}</td><td>${esc(r.status)}</td><td><button data-id="${r.id}" data-l="${r.locked ? 1 : 0}" ${r.players >= r.max ? 'disabled' : ''}>Beitreten</button></td></tr>`).join('') : '<tr><td colspan="9" class="muted">Keine passenden Server. Erstelle einen eigenen oder nutze das Matchmaking unter „Spielen“.</td></tr>';
      $('tbody').querySelectorAll('button').forEach((b) => (b.onclick = () => {
        if (b.dataset.l === '1') this.passwordPrompt(b.dataset.id); else this.app.net.send({ t: 'join', id: b.dataset.id });
      }));
    };
    const load = async () => {
      const t0 = performance.now();
      try { await api('/ping'); ping = Math.round(performance.now() - t0); data = await api('/servers'); } catch (e) { toast(e.message); }
      draw();
    };
    ['.q', '.fm', '.fmap', '.nf', '.nl'].forEach((s) => ($(s).oninput = draw));
    $('.rf').onclick = load;
    await load();
  }
  passwordPrompt(id) {
    const bg = modal(`<h3 style="margin-top:0">Passwort erforderlich</h3><input class="pw" type="password" style="width:100%"><div class="row" style="margin-top:12px"><button class="primary go grow">Beitreten</button></div>`);
    const go = () => { this.app.net.send({ t: 'join', id, password: bg.querySelector('.pw').value }); bg.remove(); };
    bg.querySelector('.go').onclick = go;
    bg.querySelector('.pw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    bg.querySelector('.pw').focus();
  }

  // -------------------------------------------------------------- Inventar
  page_inventory(tab = 'outfit', weapon = 'kr47') {
    const p = this.app.profile;
    const tabs = [['outfit', 'Outfits'], ['face', 'Köpfe'], ['hat', 'Accessoires'], ['gloves', 'Handschuhe'], ['finish', 'Waffen-Skins']];
    this.body.innerHTML = `<h2>Inventar</h2><div class="row" style="align-items:flex-start;gap:20px">
      <div style="width:360px"><div class="preview3d"></div><div class="muted" style="margin-top:8px;font-size:13px">Skins sind rein kosmetisch und verändern keine Spielwerte.</div></div>
      <div class="grow"><div class="tabs">${tabs.map(([t, n]) => `<button data-t="${t}" class="${t === tab ? 'active' : ''}">${n}</button>`).join('')}</div>
      ${tab === 'finish' ? `<div class="row" style="margin-bottom:10px">Waffe: <select class="wsel">${Object.values(WEAPONS).filter((w) => w.price > 0 && w.cat !== 'grenade').map((w) => `<option value="${w.id}" ${w.id === weapon ? 'selected' : ''}>${w.name}</option>`).join('')}</select></div>` : ''}
      <div class="items"></div></div></div>`;
    this.body.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => this.page_inventory(b.dataset.t, weapon)));
    const items = ITEMS.filter((i) => i.type === tab);
    const equipped = tab === 'finish' ? (p.loadout.finishes[weapon] || 'f_stock') : p.loadout[tab];
    const grid = this.body.querySelector('.items');
    grid.innerHTML = items.map((i) => {
      const owned = p.inventory.includes(i.id);
      const r = RARITIES[i.rarity];
      const sw = i.type === 'finish' ? `linear-gradient(135deg, ${hex(i.a)} 50%, ${hex(i.b)} 50%)` : i.type === 'outfit' ? `linear-gradient(${hex(i.torso)} 55%, ${hex(i.legs)} 55%)` : i.type === 'face' ? hex(i.skin) : hex(i.color ?? 0x444444);
      return `<div class="item ${owned ? '' : 'locked'} ${equipped === i.id ? 'eq' : ''}" data-id="${i.id}" style="border-color:${r.color}55"><div class="sw" style="background:${sw}"></div>${esc(i.name)}<div class="r" style="color:${r.color}">${r.name}</div>${owned ? '' : '<div class="muted" style="font-size:11px">🔒 Shop/Level</div>'}</div>`;
    }).join('');
    grid.querySelectorAll('.item').forEach((el) => (el.onclick = async () => {
      const id = el.dataset.id;
      if (!p.inventory.includes(id)) return toast('Noch nicht freigeschaltet – im Shop kaufen oder durch Levelaufstieg erhalten.');
      const body = tab === 'finish' ? { loadout: { finishes: { [weapon]: id === 'f_stock' ? null : id } } } : { loadout: { [tab]: id } };
      try { const r = await api('/loadout', { method: 'PUT', body }); p.loadout = r.loadout; this.page_inventory(tab, weapon); } catch (e) { toast(e.message); }
    }));
    this.body.querySelector('.wsel')?.addEventListener('change', (e) => this.page_inventory('finish', e.target.value));
    this.preview(this.body.querySelector('.preview3d'), tab === 'finish' ? weapon : null);
  }

  preview(el, weapon) {
    this.disposePreview();
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio));
    r.setSize(el.clientWidth, el.clientHeight);
    el.append(r.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
    const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(2, 3, 2); scene.add(d);
    const cam = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.1, 50);
    const lo = this.app.profile.loadout;
    let obj;
    if (weapon) { obj = makeGun(weapon, lo.finishes[weapon] || 'f_stock', true); obj.scale.setScalar(2.4); cam.position.set(0, 0.3, 3.2); }
    else { obj = makeCharacter(lo, 'N'); cam.position.set(0, 1.2, 4.6); obj.userData.armR.rotation.x = 0.2; }
    cam.lookAt(0, weapon ? 0 : 1, 0);
    scene.add(obj);
    let alive = true;
    const loop = (t) => { if (!alive) return; obj.rotation.y = t / 1600; r.render(scene, cam); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    this.previewDispose = () => { alive = false; r.dispose(); r.forceContextLoss(); r.domElement.remove(); };
  }
  disposePreview() { this.previewDispose?.(); this.previewDispose = null; }

  // -------------------------------------------------------------- Shop
  async page_shop() {
    this.body.innerHTML = '<h2>Shop</h2><p class="muted">Münzen verdienst du durch Matches, Herausforderungen und Levelaufstiege. Kein Echtgeld, kein Pay-to-Win: alle Gegenstände sind rein kosmetisch.</p><div class="items"></div>';
    try {
      const data = await api('/shop');
      const grid = this.body.querySelector('.items');
      const byR = Object.keys(RARITIES);
      data.items.sort((a, b) => byR.indexOf(a.rarity) - byR.indexOf(b.rarity));
      grid.innerHTML = data.items.length ? data.items.map((i) => {
        const r = RARITIES[i.rarity];
        const sw = i.type === 'finish' ? `linear-gradient(135deg, ${hex(i.a)} 50%, ${hex(i.b)} 50%)` : i.type === 'outfit' ? `linear-gradient(${hex(i.torso)} 55%, ${hex(i.legs)} 55%)` : i.type === 'face' ? hex(i.skin) : hex(i.color ?? 0x444444);
        const typeName = { finish: 'Waffen-Skin', outfit: 'Outfit', face: 'Kopf', hat: 'Accessoire', gloves: 'Handschuhe' }[i.type];
        return `<div class="item" style="border-color:${r.color}88"><div class="sw" style="background:${sw}"></div>${esc(i.name)}<div class="muted" style="font-size:11px">${typeName}</div><div class="r" style="color:${r.color}">${r.name}</div><button data-id="${i.id}" style="margin-top:6px;width:100%" ${data.coins < i.price ? 'disabled' : ''}>🪙 ${i.price}</button></div>`;
      }).join('') : '<p>Du besitzt bereits alles!</p>';
      grid.querySelectorAll('button').forEach((b) => (b.onclick = async () => {
        try { const r = await api('/shop/buy', { method: 'POST', body: { item: b.dataset.id } }); this.app.profile.coins = r.coins; this.app.profile.inventory = r.inventory; audio.ui('buy'); toast(`${ITEM_BY_ID[b.dataset.id].name} gekauft – im Inventar ausrüsten.`); this.show('shop'); }
        catch (e) { toast(e.message); }
      }));
    } catch (e) { toast(e.message); }
  }

  // -------------------------------------------------------------- Profil
  async page_profile(name) {
    let p = { ...this.app.profile, online: true, status: 'Im Menü' };
    if (name && name !== p.name) { try { p = await api('/profile/' + encodeURIComponent(name)); } catch (e) { return toast(e.message); } }
    const s = p.stats, kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills;
    const lo = p.loadout;
    this.body.innerHTML = `<div class="row" style="gap:16px;margin-bottom:16px"><div class="avatar" style="width:72px;height:72px;font-size:34px;background:${avatarColor(p.name)}">${esc(p.name[0].toUpperCase())}</div>
      <div><h2 style="margin:0">${esc(p.name)}</h2><div class="muted">Level ${p.level.level} · ${p.xp} XP gesamt · ${p.online ? `<span class="dot on"></span> ${esc(p.status)}` : 'offline'}</div>
      <div class="xpbar" style="width:240px;margin-top:6px"><div style="width:${Math.round(p.level.into / p.level.need * 100)}%"></div></div><div class="muted" style="font-size:12px">${p.level.into}/${p.level.need} XP bis Level ${p.level.level + 1}</div></div></div>
      <div class="stat-grid">
        <div class="stat"><div class="v">${fmtTime(s.playtime)}</div><div class="l">Spielzeit</div></div>
        <div class="stat"><div class="v">${s.wins}</div><div class="l">Gewonnene Matches</div></div>
        <div class="stat"><div class="v">${s.losses}</div><div class="l">Verlorene Matches</div></div>
        <div class="stat"><div class="v">${s.kills}</div><div class="l">Kills</div></div>
        <div class="stat"><div class="v">${s.deaths}</div><div class="l">Tode</div></div>
        <div class="stat"><div class="v">${kd}</div><div class="l">K/D</div></div>
        <div class="stat"><div class="v">${s.kills ? Math.round(s.hs / s.kills * 100) : 0}%</div><div class="l">Kopfschussquote</div></div>
        <div class="stat"><div class="v">${p.favorite ? esc(p.favorite.name) : '–'}</div><div class="l">Lieblingswaffe${p.favorite ? ` (${p.favorite.kills} Kills)` : ''}</div></div>
      </div>
      <h3>Ränge</h3><div class="stat-grid">${RANKED_MODES.map((m) => { const r = p.ranks[m]; return `<div class="stat"><div class="v" style="color:${r.rank.color}">${r.rank.name}</div><div class="l">${MODES[m].name} · ${r.games} Spiele${r.games >= 3 ? ` · ${r.rating}` : ''}</div></div>`; }).join('')}</div>
      <h3>Ausgerüstete Skins</h3><div class="row" style="flex-wrap:wrap">${['outfit', 'face', 'hat', 'gloves'].map((k) => `<span class="tag" style="color:${RARITIES[ITEM_BY_ID[lo[k]]?.rarity]?.color}">${esc(ITEM_BY_ID[lo[k]]?.name)}</span>`).join('')}${Object.entries(lo.finishes || {}).map(([w, f]) => `<span class="tag" style="color:${RARITIES[ITEM_BY_ID[f]?.rarity]?.color}">${esc(WEAPONS[w]?.name)}: ${esc(ITEM_BY_ID[f]?.name)}</span>`).join('')}</div>
      <h3>Matchhistorie</h3><div class="panel"><table><tr><th>Wann</th><th>Modus</th><th>Map</th><th>Ergebnis</th><th>K/T/A</th><th>HS</th><th>Rang</th></tr>
      ${(p.history || []).map((m) => `<tr><td>${new Date(m.t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${MODES[m.mode]?.name}</td><td>${esc(MAP_LIST.find((x) => x.id === m.map)?.name)}</td><td style="color:${m.won ? '#7dff9a' : m.draw ? '#ddd' : '#ff8a8a'}">${m.left ? 'Verlassen' : m.won ? 'Sieg' : m.draw ? 'Unentschieden' : 'Niederlage'} ${m.res ? `<span class="muted">${esc(m.res)}</span>` : ''}</td><td>${m.k}/${m.d}/${m.a}</td><td>${m.hs}</td><td>${m.rd != null ? (m.rd >= 0 ? '+' : '') + m.rd : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Noch keine Matches.</td></tr>'}</table></div>`;
  }

  // -------------------------------------------------------------- Rangliste
  async page_leaderboard(mode = 'comp5') {
    const tabs = [...RANKED_MODES.map((m) => [m, MODES[m].name]), ['level', 'Level']];
    this.body.innerHTML = `<h2>Rangliste</h2><div class="tabs">${tabs.map(([m, n]) => `<button data-m="${m}" class="${m === mode ? 'active' : ''}">${n}</button>`).join('')}</div><div class="panel"><p class="muted">Lade …</p></div>`;
    this.body.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => this.page_leaderboard(b.dataset.m)));
    try {
      const d = await api('/leaderboard?mode=' + mode);
      const me = this.app.profile.name;
      this.body.querySelector('.panel').innerHTML = `${mode !== 'level' ? '<p class="muted">Sichtbar ab 3 gewerteten Matches (Matchmaking). 5v5, 2v2 und Only Sniper werden getrennt geführt.</p>' : ''}
        <table><tr><th>#</th><th>Spieler</th><th>Level</th><th>${mode === 'level' ? 'XP' : 'Rang'}</th>${mode === 'level' ? '' : '<th>Punkte</th><th>Spiele</th>'}</tr>
        ${d.rows.map((r, i) => `<tr class="${r.name === me ? 'me' : ''}"><td>${i + 1}</td><td><a href="#" data-n="${esc(r.name)}" style="color:inherit">${esc(r.name)}</a></td><td>${r.level}</td><td>${mode === 'level' ? r.value : `<span style="color:${r.rank.color}">${r.rank.name}</span>`}</td>${mode === 'level' ? '' : `<td>${r.value}</td><td>${r.games}</td>`}</tr>`).join('') || '<tr><td colspan="6" class="muted">Noch niemand platziert.</td></tr>'}</table>
        ${d.me ? `<p>Dein Platz: <b>${d.me.pos}</b></p>` : ''}`;
      this.body.querySelectorAll('a[data-n]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); this.page = 'profile'; this.show('profile'); this.page_profile(a.dataset.n); }));
    } catch (e) { toast(e.message); }
  }

  // -------------------------------------------------------------- Statistiken
  page_stats() {
    const p = this.app.profile, s = p.stats;
    const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
    const wk = Object.entries(s.weaponKills || {}).filter(([w]) => WEAPONS[w]).sort((a, b) => b[1] - a[1]);
    this.body.innerHTML = `<h2>Statistiken</h2><div class="stat-grid">
      <div class="stat"><div class="v">${s.matches}</div><div class="l">Matches</div></div>
      <div class="stat"><div class="v">${s.matches ? Math.round(s.wins / s.matches * 100) : 0}%</div><div class="l">Siegquote</div></div>
      <div class="stat"><div class="v">${acc}%</div><div class="l">Trefferquote (${s.hits}/${s.shots})</div></div>
      <div class="stat"><div class="v">${s.assists}</div><div class="l">Assists</div></div>
      <div class="stat"><div class="v">${s.plants}</div><div class="l">Bomben gelegt</div></div>
      <div class="stat"><div class="v">${s.defuses}</div><div class="l">Bomben entschärft</div></div>
      <div class="stat"><div class="v">${s.infections}</div><div class="l">Infektionen</div></div>
      <div class="stat"><div class="v">${s.sniperKills}</div><div class="l">Sniper-Kills</div></div></div>
      <h3>Nach Modus</h3><div class="panel"><table><tr><th>Modus</th><th>Matches</th><th>Siege</th><th>Niederlagen</th><th>Kills</th><th>Tode</th><th>K/D</th><th>HS %</th></tr>
      ${Object.values(MODES).map((m) => { const x = p.modeStats[m.id] || { matches: 0, wins: 0, losses: 0, kills: 0, deaths: 0, hs: 0 }; return `<tr><td>${m.name}</td><td>${x.matches}</td><td>${x.wins}</td><td>${x.losses}</td><td>${x.kills}</td><td>${x.deaths}</td><td>${x.deaths ? (x.kills / x.deaths).toFixed(2) : x.kills}</td><td>${x.kills ? Math.round(x.hs / x.kills * 100) : 0}</td></tr>`; }).join('')}</table></div>
      <h3>Waffen</h3><div class="panel"><table><tr><th>Waffe</th><th>Kategorie</th><th>Kills</th></tr>${wk.map(([w, k]) => `<tr><td>${WEAPONS[w].name}</td><td>${WEAPONS[w].cat}</td><td>${k}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Noch keine Kills.</td></tr>'}</table></div>`;
  }

  // -------------------------------------------------------------- Einstellungen
  page_settings() {
    this.body.innerHTML = '<h2>Einstellungen</h2><div class="panel"></div><p class="muted">Einstellungen werden automatisch in deinem Konto gespeichert.</p>';
    renderSettings(this.body.querySelector('.panel'));
  }

  // -------------------------------------------------------------- Freunde
  async page_friends() {
    await this.app.refreshProfile();
    const p = this.app.profile;
    this.body.innerHTML = `<h2>Freunde</h2><div class="row" style="align-items:flex-start;gap:16px">
      <div class="panel grow"><h3 style="margin-top:0">Freundesliste</h3>${p.friends.map((f) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="dot ${f.online ? 'on' : ''}"></span><a href="#" data-n="${esc(f.name)}" class="grow" style="color:inherit">${esc(f.name)} <span class="muted">Lvl ${f.level} · ${f.online ? esc(f.status) : 'offline'}</span></a>
        ${f.online ? `<button data-inv="${f.id}">Einladen</button>` : ''}<button data-rm="${f.id}">Entfernen</button><button data-bl="${f.id}" class="danger">Blockieren</button></div>`).join('') || '<p class="muted">Noch keine Freunde. Suche rechts nach Spielern.</p>'}</div>
      <div class="col" style="width:360px">
        <div class="panel"><h3 style="margin-top:0">Spieler suchen</h3><input class="sq" placeholder="Name …" style="width:100%"><div class="sr"></div></div>
        <div class="panel"><h3 style="margin-top:0">Anfragen</h3>${p.requests.map((f) => `<div class="row"><span class="grow">${esc(f.name)}</span><button data-acc="${f.id}" class="primary">Annehmen</button><button data-dec="${f.id}">Ablehnen</button></div>`).join('') || '<p class="muted">Keine offenen Anfragen.</p>'}</div>
        <div class="panel"><h3 style="margin-top:0">Blockiert</h3>${p.blocked.map((f) => `<div class="row"><span class="grow">${esc(f.name)}</span><button data-ub="${f.id}">Freigeben</button></div>`).join('') || '<p class="muted">Niemand blockiert.</p>'}</div>
        <div class="panel"><h3 style="margin-top:0">Spieler melden</h3><input class="rn" placeholder="Spielername" style="width:100%"><select class="rr" style="width:100%;margin-top:6px"><option>Cheaten</option><option>Beleidigung</option><option>Unangemessener Name</option><option>Sonstiges</option></select><button class="rs" style="margin-top:6px">Melden</button></div>
      </div></div>`;
    const act = async (path, body, msg) => { try { await api(path, { method: 'POST', body }); if (msg) toast(msg); this.page_friends(); } catch (e) { toast(e.message); } };
    const B = this.body;
    B.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => act('/friends/accept', { id: b.dataset.acc }, 'Freund hinzugefügt.')));
    B.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = () => act('/friends/decline', { id: b.dataset.dec })));
    B.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => act('/friends/remove', { id: b.dataset.rm })));
    B.querySelectorAll('[data-bl]').forEach((b) => (b.onclick = () => act('/block', { id: b.dataset.bl }, 'Spieler blockiert.')));
    B.querySelectorAll('[data-ub]').forEach((b) => (b.onclick = () => act('/block', { id: b.dataset.ub, unblock: true })));
    B.querySelectorAll('[data-inv]').forEach((b) => (b.onclick = () => toast('Erstelle zuerst eine private Lobby (Spielen → Lobby erstellen) und lade dann im Spiel über Esc → „Freunde einladen“ ein.')));
    B.querySelectorAll('a[data-n]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); this.show('profile'); this.page_profile(a.dataset.n); }));
    B.querySelector('.rs').onclick = async () => { try { await api('/report', { method: 'POST', body: { name: B.querySelector('.rn').value, reason: B.querySelector('.rr').value } }); toast('Meldung gespeichert.'); } catch (e) { toast(e.message); } };
    let timer;
    B.querySelector('.sq').oninput = (e) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const d = await api('/search?q=' + encodeURIComponent(e.target.value)).catch(() => ({ rows: [] }));
        const sr = B.querySelector('.sr');
        sr.innerHTML = d.rows.map((r) => `<div class="row" style="padding:4px 0"><span class="dot ${r.online ? 'on' : ''}"></span><span class="grow">${esc(r.name)} <span class="muted">Lvl ${r.level}</span></span><button data-add="${esc(r.name)}">Anfrage</button></div>`).join('');
        sr.querySelectorAll('[data-add]').forEach((b) => (b.onclick = async () => { try { const r = await api('/friends/request', { method: 'POST', body: { name: b.dataset.add } }); toast(r.accepted ? 'Ihr seid jetzt befreundet.' : 'Anfrage gesendet.'); b.disabled = true; } catch (er) { toast(er.message); } }));
      }, 250);
    };
  }
}

export { rankFor };
