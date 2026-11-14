// Hauptmenü: Seitenleiste, Seiteninhalt und dauerhaft sichtbarer 3D-Charakter.
import * as THREE from 'three';
import { api, setToken } from '../api.js';
import { MODES, MODE_MAPS, GAME_NAME, BOT_LEVELS } from '/shared/constants.js';
import { MAP_LIST } from '/shared/maps.js';
import { WEAPONS } from '/shared/weapons.js';
import { ITEMS, ITEM_BY_ID, RARITIES, CRATES, TYPE_NAMES } from '/shared/cosmetics.js';
import { RANKED_MODES } from '/shared/progression.js';
import { SEASON, REWARDS, bpTier } from '/shared/battlepass.js';
import { renderSettings } from './settingsView.js';
import { makeCharacter, animateCharacter, setCharacterGun } from '../game/models.js';
import { weaponIcon } from '../game/icons.js';
import { audio } from '../game/audio.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const fmtTime = (s) => `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
const avatarColor = (name) => `hsl(${[...name].reduce((a, c) => a + c.charCodeAt(0), 0) * 37 % 360} 70% 60%)`;
const LOGO = `<span class="logo">${GAME_NAME.slice(0, 4)}<b>${GAME_NAME.slice(4)}</b></span>`;
const MODE_STYLE = {
  comp5: ['💣', '#ff6a2a', '#5a1d08'], comp2: ['⚔️', '#ffb02a', '#5a3a08'], tdm: ['🎯', '#4cd964', '#0f4a1c'],
  gungame: ['🔫', '#a45cf0', '#2e1050'], zombie: ['🧟', '#8fd16a', '#1f3a12'], sniper: ['🔭', '#5aa7ff', '#0e2a50'],
};
const EMOTE_ICON = { wave: '👋', salute: '🫡', facepalm: '🤦', flex: '💪', jacks: '🤸', dance: '🕺', spin: '🌀', robot: '🤖' };
const PAGES = [['play', '🎮', 'Spielen'], ['battlepass', '🎫', 'Battlepass'], ['inventory', '🎒', 'Spind'], ['shop', '🛒', 'Shop & Truhen'], ['profile', '👤', 'Profil'], ['leaderboard', '🏆', 'Rangliste'], ['stats', '📊', 'Statistiken'], ['friends', '👥', 'Freunde'], ['servers', '🌐', 'Server'], ['settings', '⚙️', 'Einstellungen']];

export function toast(text, actions = [], ms = 4500) {
  const t = h(`<div class="toast"><span>${esc(text)}</span></div>`);
  for (const [label, fn] of actions) { const b = h(`<button style="margin-left:10px">${esc(label)}</button>`); b.onclick = () => { fn(); t.remove(); }; t.append(b); }
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}
function modal(html, cls = '') {
  const bg = h(`<div class="modal-bg"><div class="modal ${cls}">${html}</div></div>`);
  document.getElementById('overlay').append(bg);
  bg.addEventListener('mousedown', (e) => { if (e.target === bg && !bg.dataset.lock) bg.remove(); });
  return bg;
}
function swatch(i, weapon = 'kr47') {
  if (i.type === 'finish') return `<img class="sw-img" src="${weaponIcon(weapon, i.id)}">`;
  if (i.type === 'outfit') return `<div class="sw" style="background:linear-gradient(${hex(i.torso)} 55%, ${hex(i.legs)} 55%)"></div>`;
  if (i.type === 'face') return `<div class="sw sw-face" style="background:${hex(i.skin)}">${{ smile: '🙂', serious: '😐', shades: '😎', angry: '😠', mask: '🥷', robot: '🤖', skull: '💀' }[i.face] || '🙂'}</div>`;
  if (i.type === 'emote') return `<div class="sw sw-emote">${EMOTE_ICON[i.anim] || '✨'}</div>`;
  if (i.type === 'skin') return `<div class="sw sw-skin"><span style="background:${hex(i.color)}"></span></div>`;
  if (i.type === 'hat') return `<div class="sw sw-face" style="background:#2a313b">${{ none: '—', cap: '🧢', beanie: '🧶', headset: '🎧', helmet: '⛑️', horns: '😈', crown: '👑' }[i.hat] || '🎩'}</div>`;
  return `<div class="sw" style="background:${hex(i.color ?? 0x444444)}"></div>`;
}
function rewardLabel(r) {
  if (r.type === 'coins') return { icon: '🪙', name: `${r.n} Münzen`, rarity: 'common' };
  if (r.type === 'crate') return { icon: '🎁', name: `${r.n > 1 ? r.n + '× ' : ''}${CRATES[r.crate].name}`, rarity: 'rare' };
  const it = ITEM_BY_ID[r.id];
  return { item: it, name: it.name, rarity: it.rarity, type: TYPE_NAMES[it.type] };
}

export class Menu {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('menu');
    this.page = 'play';
    this.queue = null;
    this.hero = null;
    this.el.addEventListener('click', (e) => { if (e.target.closest('button')) { audio.init(); audio.ui('click'); audio.startMusic(); } });
  }

  // -------------------------------------------------------------- Login
  showAuth() {
    this.disposeHero();
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
    if (!this.el.querySelector('.shell')) this.buildShell();
    this.refreshChrome();
    this.el.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.p === page));
    this.body = this.el.querySelector('.main');
    this.body.innerHTML = '';
    this.body.scrollTop = 0;
    this['page_' + page]?.();
    this.renderQueue();
    this.updateHero();
  }
  hide() { this.el.classList.add('hidden'); this.disposeHero(); this.el.innerHTML = ''; document.querySelector('.queue-box')?.remove(); }

  buildShell() {
    this.el.innerHTML = `<div class="shell">
      <aside class="side">${LOGO}<nav class="nav">${PAGES.map(([id, ic, n]) => `<button data-p="${id}"><span class="ic">${ic}</span><span class="grow">${n}</span><span class="badge" data-badge="${id}"></span></button>`).join('')}</nav>
        <div class="me-card"></div></aside>
      <main class="main"></main>
      <aside class="hero"><div class="hero-stage"></div><div class="hero-info"></div></aside></div>`;
    this.el.querySelectorAll('.nav button').forEach((b) => (b.onclick = () => this.show(b.dataset.p)));
    this.initHero(this.el.querySelector('.hero-stage'));
  }

  refreshChrome() {
    const p = this.app.profile;
    const lvl = p.level;
    const tier = bpTier(p.bp?.xp || 0);
    this.el.querySelector('.me-card').innerHTML = `<div class="row"><div class="avatar" style="background:${avatarColor(p.name)}">${esc(p.name[0].toUpperCase())}</div>
      <div class="grow"><b>${esc(p.name)}</b><div class="muted" style="font-size:12px">Level ${lvl.level}</div></div><button class="lo ghost" title="Abmelden">⎋</button></div>
      <div class="xpbar"><div style="width:${Math.round(lvl.into / lvl.need * 100)}%"></div></div>
      <div class="row coins"><span>🪙 ${p.coins}</span><span class="muted">🎫 ${tier}/${SEASON.tiers}</span></div>`;
    this.el.querySelector('.lo').onclick = () => this.app.logout();
    const badge = (id, n) => { const b = this.el.querySelector(`[data-badge=${id}]`); if (b) { b.textContent = n || ''; b.style.display = n ? 'inline-block' : 'none'; } };
    badge('friends', p.requests.length);
    badge('shop', Object.values(p.crates || {}).reduce((a, b) => a + b, 0));
    const rank = p.ranks.comp5;
    this.el.querySelector('.hero-info').innerHTML = `<div class="hero-name">${esc(p.name)}</div>
      <div class="hero-tags"><span class="tag">Level ${lvl.level}</span><span class="tag" style="color:${rank.rank.color}">${rank.rank.name}</span></div>
      <div class="hero-bp"><div class="row"><span>🎫 ${esc(SEASON.name)}</span><span class="muted">${tier}/${SEASON.tiers}</span></div><div class="xpbar"><div style="width:${tier >= SEASON.tiers ? 100 : Math.round(((p.bp?.xp || 0) % SEASON.xpPerTier) / SEASON.xpPerTier * 100)}%"></div></div></div>
      <div class="row"><button class="grow cust">Anpassen</button><button class="emo" title="Emote abspielen">${EMOTE_ICON[ITEM_BY_ID[p.loadout.emote]?.anim] || '👋'}</button></div>`;
    this.el.querySelector('.hero-info .cust').onclick = () => this.show('inventory');
    this.el.querySelector('.hero-info .emo').onclick = () => this.playEmote(ITEM_BY_ID[p.loadout.emote]?.anim);
  }

  // -------------------------------------------------------------- 3D-Charakter (dauerhaft sichtbar)
  initHero(el) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio));
    r.outputColorSpace = THREE.SRGBColorSpace;
    el.append(r.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2a20, 1.8));
    const key = new THREE.DirectionalLight(0xffe2c4, 2.2); key.position.set(2, 4, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6aa8ff, 1.5); rim.position.set(-3, 2, -3); scene.add(rim);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.18 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01; scene.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.12, 48), new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; scene.add(ring);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, 1.2, 5.0); cam.lookAt(0, 0.95, 0);
    const H = this.hero = { r, scene, cam, el, model: null, key: '', rotY: -0.35, drag: null, emote: null, alive: true, last: performance.now() };
    const resize = () => { const w = el.clientWidth, hh = el.clientHeight; if (!w || !hh) return; r.setSize(w, hh, false); cam.aspect = w / hh; cam.fov = w / hh < 0.6 ? 34 : 28; cam.updateProjectionMatrix(); };
    H.ro = new ResizeObserver(resize); H.ro.observe(el); resize();
    el.addEventListener('pointerdown', (e) => { H.drag = e.clientX; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => { if (H.drag != null) { H.rotY += (e.clientX - H.drag) * 0.012; H.drag = e.clientX; } });
    el.addEventListener('pointerup', () => { H.drag = null; });
    const loop = (t) => {
      if (!H.alive) return;
      const dt = Math.min(0.05, (t - H.last) / 1000); H.last = t;
      if (H.model) {
        if (H.drag == null) H.rotY += dt * 0.15;
        H.model.rotation.y = H.rotY;
        let emote = null;
        if (H.emote) { const et = (t - H.emote.start) / 1000; if (et < 3) emote = { anim: H.emote.anim, t: et }; else H.emote = null; }
        animateCharacter(H.model, { speed: 0, alive: true, ground: true, dt, pitch: -0.15, emote });
        if (!emote) H.model.userData.body.position.y = Math.sin(t / 600) * 0.012;
      }
      r.render(scene, cam);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  updateHero(preview) {
    const H = this.hero;
    if (!H) return;
    const base = this.app.profile.loadout;
    const lo = { ...base, ...(preview || {}) };
    const weapon = preview?.weapon || 'kr47';
    const finish = preview?.finish || base.finishes?.[weapon] || 'f_stock';
    const key = JSON.stringify(lo) + weapon + finish;
    if (key === H.key) return;
    H.key = key;
    if (H.model) H.scene.remove(H.model);
    H.model = makeCharacter(lo, 'N');
    setCharacterGun(H.model, weapon, finish);
    H.scene.add(H.model);
  }
  playEmote(anim) { if (this.hero && anim) this.hero.emote = { anim, start: performance.now() }; }
  disposeHero() {
    const H = this.hero;
    if (!H) return;
    H.alive = false; H.ro.disconnect(); H.r.dispose(); H.r.forceContextLoss(); H.r.domElement.remove();
    this.hero = null;
  }
  previewItem(it) {
    if (!it) return;
    if (it.type === 'emote') return this.playEmote(it.anim);
    if (it.type === 'finish') return this.updateHero({ weapon: 'kr47', finish: it.id });
    if (['outfit', 'face', 'hat', 'gloves', 'skin'].includes(it.type)) this.updateHero({ [it.type]: it.id });
  }

  // -------------------------------------------------------------- Spielen
  page_play() {
    const p = this.app.profile;
    const ch = p.challenges || {};
    const chal = (c, title) => !c ? '' : `<div class="card col"><h3>${title}</h3>${c.list.map((x) => { const v = Math.min(x.goal, c.progress[x.id] || 0); return `<div class="chal ${c.done[x.id] ? 'done' : ''}"><div class="row"><span class="grow">${esc(x.text)}</span><span class="muted">${c.done[x.id] ? '✓' : `${v}/${x.goal}`}</span></div><div class="bar"><div style="width:${v / x.goal * 100}%"></div></div><div class="muted" style="font-size:12px">+${x.xp} XP · +${x.coins} 🪙</div></div>`; }).join('')}</div>`;
    this.body.innerHTML = `<div class="page-head"><h1>Spielen</h1><span class="muted">Modus wählen – fehlende Spieler werden nach kurzer Zeit mit Bots aufgefüllt.</span></div>
      <div class="mode-grid">${Object.values(MODES).map((m) => {
        const [icon, c1, c2] = MODE_STYLE[m.id] || ['🎮', '#888', '#222'];
        const r = p.ranks[m.id];
        return `<button class="mode-tile" data-m="${m.id}" style="--c1:${c1};--c2:${c2}"><span class="mt-icon">${icon}</span><span class="mt-name">${m.name}</span>
          <span class="mt-desc">${m.desc}</span><span class="mt-foot"><span>${m.teams && m.id !== 'zombie' ? `${m.max / 2} vs ${m.max / 2}` : `bis ${m.max} Spieler`}</span>
          ${r ? `<span style="color:${r.rank.color}">${r.rank.placement ? 'Unplatziert' : r.rank.name}</span>` : '<span>Casual</span>'}</span>
          <span class="mt-maps">${MODE_MAPS[m.id].map((id) => MAP_LIST.find((x) => x.id === id).name).join(' · ')}</span></button>`;
      }).join('')}</div>
      <div class="grid2">
        <div class="card col"><h3>Mit Freunden spielen</h3><div class="muted">Private Lobby erstellen – Freunde treten über den Code bei.</div>
          <button class="primary cl">Lobby erstellen</button><div class="row"><input class="code grow" placeholder="Lobby-Code" maxlength="6" style="text-transform:uppercase"><button class="jc">Beitreten</button></div></div>
        ${chal(ch.daily, 'Tägliche Aufgaben')}${chal(ch.weekly, 'Wöchentliche Aufgaben')}
      </div>
      <div class="keys-hint">WASD bewegen · Umschalt sprinten · Q langsam gehen · C ducken · R nachladen · F Waffe betrachten · V Emote · B Kaufmenü/Loadout · Tab Punktestand</div>`;
    this.body.querySelectorAll('.mode-tile').forEach((c) => (c.onclick = () => this.app.net.send({ t: 'queue', mode: c.dataset.m })));
    this.body.querySelector('.cl').onclick = () => this.createDialog(true);
    const join = () => { const code = this.body.querySelector('.code').value.trim().toUpperCase(); if (code) this.app.net.send({ t: 'join', id: code }); };
    this.body.querySelector('.jc').onclick = join;
    this.body.querySelector('.code').onkeydown = (e) => { if (e.key === 'Enter') join(); };
  }

  setQueue(m) { this.queue = m.state === 'searching' ? m : null; this.renderQueue(); }
  renderQueue() {
    document.querySelector('.queue-box')?.remove();
    if (!this.queue || this.el.classList.contains('hidden')) return;
    const q = this.queue;
    const box = h(`<div class="queue-box"><div class="spinner"></div><div><b>Suche ${esc(MODES[q.mode]?.name)} …</b><div class="muted" style="font-size:13px">${q.waited ?? 0} s · ${q.count ?? 1}/${q.need ?? '?'} Spieler · fehlende Plätze werden mit Bots gefüllt</div></div><button>Abbrechen</button></div>`);
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
      <label>Bot-Stärke <select class="df">${BOT_LEVELS.map((l) => `<option value="${l.v}" ${l.id === 'normal' ? 'selected' : ''}>${l.name}</option>`).join('')}</select></label>
      <div class="rules"></div>
      <div class="muted" style="font-size:12px">Ihr startet in einer Aufwärmphase. Als Host startest du das Match über Esc → „Match starten“.</div>
      <button class="primary go">Erstellen</button></div>`);
    const $ = (s) => bg.querySelector(s);
    const fillMaps = () => {
      $('.mp').innerHTML = MODE_MAPS[$('.md').value].map((id) => `<option value="${id}">${MAP_LIST.find((x) => x.id === id).name}</option>`).join('');
      const m = $('.md').value;
      $('.rules').innerHTML = m === 'sniper' ? `<label class="row"><input type="checkbox" class="r-teams"> 5 gegen 5 statt Jeder gegen Jeden</label><label class="row"><input type="checkbox" class="r-one"> One-Shot-Modus</label><label>Punktelimit <input type="number" class="r-lim" value="3000" min="500" step="500"></label>`
        : m === 'tdm' ? `<label>Kill-Limit <input type="number" class="r-kl" value="50" min="10" step="5"></label>` : '';
    };
    $('.md').onchange = fillMaps; fillMaps();
    $('.go').onclick = () => {
      const m = $('.md').value;
      const rules = m === 'sniper' ? { teams: $('.r-teams').checked, oneShot: $('.r-one').checked, scoreLimit: Number($('.r-lim').value) } : m === 'tdm' ? { killLimit: Number($('.r-kl').value) } : {};
      this.app.net.send({ t: 'create', private: isPrivate, mode: m, map: $('.mp').value, name: $('.nm').value, password: $('.pw').value, bots: $('.bt').checked, diff: Number($('.df').value), rules });
      bg.remove();
    };
  }

  // -------------------------------------------------------------- Battlepass
  page_battlepass() {
    const p = this.app.profile;
    const xp = p.bp?.xp || 0, tier = bpTier(xp);
    const into = xp % SEASON.xpPerTier;
    this.body.innerHTML = `<div class="page-head"><h1>Battlepass</h1><span class="muted">${esc(SEASON.name)} · kostenlos · Fortschritt durch jedes Match</span></div>
      <div class="bp-head card"><div class="bp-tier"><span>${tier}</span><small>von ${SEASON.tiers}</small></div><div class="grow">
        <b>${tier >= SEASON.tiers ? 'Battlepass abgeschlossen!' : `Noch ${SEASON.xpPerTier - into} XP bis Stufe ${tier + 1}`}</b>
        <div class="xpbar big"><div style="width:${tier >= SEASON.tiers ? 100 : Math.round(into / SEASON.xpPerTier * 100)}%"></div></div>
        <span class="muted">Belohnungen werden beim Erreichen einer Stufe automatisch gutgeschrieben. Fahre über eine Belohnung für die Vorschau.</span></div></div>
      <div class="bp-track">${REWARDS.slice(1).map((r, i) => {
        const t = i + 1, L = rewardLabel(r), got = (p.bp?.claimed || []).includes(t);
        const vis = L.item ? swatch(L.item) : `<div class="sw sw-emote">${L.icon}</div>`;
        return `<div class="bp-cell ${got ? 'got' : t === tier + 1 ? 'next' : ''}" style="--rc:${RARITIES[L.rarity].color}" ${L.item ? `data-id="${L.item.id}"` : ''}>
          <div class="bp-num">${t}</div>${vis}<div class="bp-name">${esc(L.name)}</div><div class="muted bp-type">${esc(L.type || '')}</div>${got ? '<div class="bp-check">✓</div>' : ''}</div>`;
      }).join('')}</div>`;
    this.body.querySelectorAll('.bp-cell[data-id]').forEach((c) => (c.onmouseenter = () => this.previewItem(ITEM_BY_ID[c.dataset.id])));
    this.body.querySelector('.bp-track').onmouseleave = () => this.updateHero();
    this.body.querySelector('.bp-cell.next')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  // -------------------------------------------------------------- Spind
  page_inventory(tab = 'finish', weapon = 'kr47') {
    const p = this.app.profile;
    const tabs = [['finish', 'Waffen-Skins'], ['outfit', 'Outfits'], ['skin', 'Hautfarbe'], ['face', 'Gesicht'], ['hat', 'Accessoires'], ['gloves', 'Handschuhe'], ['emote', 'Emotes']];
    const owned = ITEMS.filter((i) => p.inventory.includes(i.id)).length;
    this.body.innerHTML = `<div class="page-head"><h1>Spind</h1><span class="muted">${owned} von ${ITEMS.length} Gegenständen gesammelt · rein kosmetisch</span></div>
      <div class="pills">${tabs.map(([t, n]) => `<button data-t="${t}" class="${t === tab ? 'active' : ''}">${n}</button>`).join('')}</div>
      ${tab === 'finish' ? `<div class="weapon-strip">${Object.values(WEAPONS).filter((w) => w.price > 0 && w.cat !== 'grenade').map((w) => `<button class="ws ${w.id === weapon ? 'active' : ''}" data-w="${w.id}"><img src="${weaponIcon(w.id, p.loadout.finishes[w.id] || 'f_stock')}"><span>${w.name}</span></button>`).join('')}</div>` : ''}
      <div class="items"></div>`;
    this.body.querySelectorAll('.pills button').forEach((b) => (b.onclick = () => this.page_inventory(b.dataset.t, weapon)));
    this.body.querySelectorAll('.ws').forEach((b) => (b.onclick = () => { this.page_inventory('finish', b.dataset.w); this.updateHero({ weapon: b.dataset.w }); }));
    if (tab === 'finish') { this.updateHero({ weapon }); this.body.querySelector('.ws.active')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }
    const order = Object.keys(RARITIES);
    const items = ITEMS.filter((i) => i.type === tab).sort((a, b) => (p.inventory.includes(b.id) - p.inventory.includes(a.id)) || order.indexOf(a.rarity) - order.indexOf(b.rarity));
    const equipped = tab === 'finish' ? (p.loadout.finishes[weapon] || 'f_stock') : p.loadout[tab];
    const grid = this.body.querySelector('.items');
    grid.innerHTML = items.map((i) => {
      const own = p.inventory.includes(i.id), r = RARITIES[i.rarity];
      const how = i.src === 'bp' ? 'Battlepass' : i.src === 'crate' ? 'Nur in Truhen' : 'Shop / Truhe';
      return `<div class="item ${own ? '' : 'locked'} ${equipped === i.id ? 'eq' : ''}" data-id="${i.id}" style="--rc:${r.color}">${swatch(i, weapon)}<div class="it-name">${esc(i.name)}</div><div class="r">${r.name}</div>${own ? (equipped === i.id ? '<div class="it-eq">Ausgerüstet</div>' : '') : `<div class="it-lock">🔒 ${how}</div>`}</div>`;
    }).join('');
    grid.querySelectorAll('.item').forEach((el) => {
      const it = ITEM_BY_ID[el.dataset.id];
      el.onmouseenter = () => (tab === 'finish' ? this.updateHero({ weapon, finish: it.id }) : this.previewItem(it));
      el.onclick = async () => {
        if (!p.inventory.includes(it.id)) return toast(it.src === 'bp' ? 'Gibt es im Battlepass.' : 'Im Shop kaufen oder aus einer Truhe ziehen.');
        const body = tab === 'finish' ? { loadout: { finishes: { [weapon]: it.id === 'f_stock' ? null : it.id } } } : { loadout: { [tab]: it.id } };
        try {
          const r = await api('/loadout', { method: 'PUT', body });
          p.loadout = r.loadout;
          if (tab === 'emote') this.playEmote(it.anim);
          this.refreshChrome();
          this.page_inventory(tab, weapon);
        } catch (e) { toast(e.message); }
      };
    });
    grid.onmouseleave = () => this.updateHero(tab === 'finish' ? { weapon } : undefined);
  }

  // -------------------------------------------------------------- Shop & Truhen
  async page_shop() {
    const p = this.app.profile;
    this.body.innerHTML = `<div class="page-head"><h1>Shop & Truhen</h1><span class="muted">Nur Spielwährung (🪙 aus Matches, Aufgaben, Levelaufstiegen und Battlepass). Kein Echtgeld, kein Pay-to-Win.</span></div>
      <div class="crate-row">${Object.values(CRATES).map((c) => {
        const n = p.crates?.[c.id] || 0;
        const tot = Object.values(c.weights).reduce((a, b) => a + b, 0);
        return `<div class="crate-card" style="--cc:${c.color}"><div class="crate-art">🎁</div><div class="grow"><h3>${c.name}</h3>
          <div class="muted">${c.types.length === 1 ? 'Nur Waffen-Skins' : 'Alle Kosmetik-Arten inkl. Emotes und Hautfarben'}</div>
          <div class="odds">${Object.entries(c.weights).map(([r, w]) => `<span style="color:${RARITIES[r].color}">${RARITIES[r].name} ${(w / tot * 100).toFixed(1)} %</span>`).join('')}</div>
          <div class="muted" style="font-size:12px">Duplikate: 40 % des Shop-Preises zurück in Münzen.</div></div>
          <button class="primary open" data-c="${c.id}" ${n === 0 && p.coins < c.price ? 'disabled' : ''}>${n ? `Öffnen (${n} im Besitz)` : `Öffnen · 🪙 ${c.price}`}</button></div>`;
      }).join('')}</div>
      <h2>Gegenstände</h2><div class="pills shop-f"><button class="active" data-t="">Alle</button>${Object.entries(TYPE_NAMES).map(([t, n]) => `<button data-t="${t}">${n}</button>`).join('')}</div><div class="items shop-items"><p class="muted">Lade …</p></div>`;
    this.body.querySelectorAll('.open').forEach((b) => (b.onclick = () => this.openCrate(b.dataset.c)));
    try {
      const data = await api('/shop');
      const order = Object.keys(RARITIES);
      data.items.sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
      const draw = (type) => {
        const grid = this.body.querySelector('.shop-items');
        const list = data.items.filter((i) => !type || i.type === type);
        grid.innerHTML = list.length ? list.map((i) => `<div class="item" data-id="${i.id}" style="--rc:${RARITIES[i.rarity].color}">${swatch(i)}<div class="it-name">${esc(i.name)}</div><div class="muted" style="font-size:11px">${TYPE_NAMES[i.type]}</div><div class="r">${RARITIES[i.rarity].name}</div><button data-buy="${i.id}" class="buy" ${data.coins < i.price ? 'disabled' : ''}>🪙 ${i.price}</button></div>`).join('') : '<p class="muted">Alles aus dieser Kategorie besitzt du schon.</p>';
        grid.querySelectorAll('.item').forEach((el) => (el.onmouseenter = () => this.previewItem(ITEM_BY_ID[el.dataset.id])));
        grid.onmouseleave = () => this.updateHero();
        grid.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = async (e) => {
          e.stopPropagation();
          try { const r = await api('/shop/buy', { method: 'POST', body: { item: b.dataset.buy } }); p.coins = r.coins; p.inventory = r.inventory; audio.ui('buy'); toast(`${ITEM_BY_ID[b.dataset.buy].name} gekauft – im Spind ausrüsten.`); this.show('shop'); }
          catch (er) { toast(er.message); }
        }));
      };
      this.body.querySelectorAll('.shop-f button').forEach((b) => (b.onclick = () => { this.body.querySelectorAll('.shop-f button').forEach((x) => x.classList.toggle('active', x === b)); draw(b.dataset.t); }));
      draw('');
    } catch (e) { toast(e.message); }
  }

  async openCrate(id) {
    const c = CRATES[id], p = this.app.profile;
    let res;
    try { res = await api('/crate/open', { method: 'POST', body: { crate: id } }); } catch (e) { return toast(e.message); }
    p.coins = res.coins; p.crates = res.crates; p.inventory = res.inventory;
    this.refreshChrome();
    // Walze nur als Optik – der Gewinn steht vorher fest und kommt vom Server
    const pool = ITEMS.filter((i) => c.types.includes(i.type) && i.src !== 'bp' && i.id !== 'f_stock');
    const tot = Object.values(c.weights).reduce((a, b) => a + b, 0);
    const rand = () => { let x = Math.random() * tot, r = 'common'; for (const [k, w] of Object.entries(c.weights)) { x -= w; if (x < 0) { r = k; break; } } const l = pool.filter((i) => i.rarity === r); return l[Math.floor(Math.random() * l.length)] || pool[0]; };
    const strip = Array.from({ length: 40 }, rand);
    const WIN = 33;
    strip[WIN] = res.item;
    const bg = modal(`<h2 style="margin:0 0 12px">${esc(c.name)}</h2><div class="roll"><div class="roll-strip">${strip.map((i) => `<div class="roll-it" style="--rc:${RARITIES[i.rarity].color}">${swatch(i)}<span>${esc(i.name)}</span></div>`).join('')}</div><div class="roll-marker"></div></div>
      <div class="roll-result"></div>`, 'crate-modal');
    bg.dataset.lock = '1';
    const s = bg.querySelector('.roll-strip');
    const itemW = 150;
    const box = bg.querySelector('.roll').clientWidth;
    const target = WIN * itemW - box / 2 + itemW / 2 + (Math.random() - 0.5) * itemW * 0.6;
    audio.init();
    let ticks = 0;
    const tickIv = setInterval(() => { if (ticks++ < 26) audio.tone({ freq: 900 + ticks * 20, dur: 0.03, gain: 0.08 }); }, 170);
    requestAnimationFrame(() => requestAnimationFrame(() => { s.style.transition = 'transform 5.2s cubic-bezier(0.08, 0.6, 0.12, 1)'; s.style.transform = `translateX(${-target}px)`; }));
    setTimeout(() => {
      clearInterval(tickIv);
      const it = res.item, r = RARITIES[it.rarity];
      audio.ui(['epic', 'legendary'].includes(it.rarity) ? 'level' : 'round');
      bg.querySelectorAll('.roll-it')[WIN].classList.add('win');
      bg.querySelector('.roll-result').innerHTML = `<div class="won" style="--rc:${r.color}"><div class="r">${r.name} · ${TYPE_NAMES[it.type]}</div><h2>${esc(it.name)}</h2>
        ${res.dup ? `<div class="muted">Schon im Besitz – ${res.refund} 🪙 erstattet.</div>` : '<div class="muted">Neu in deinem Spind!</div>'}</div>
        <div class="row"><button class="grow close">Schließen</button>${!res.dup ? '<button class="primary grow equip">Ausrüsten</button>' : ''}${(p.crates[id] || 0) > 0 || p.coins >= c.price ? '<button class="grow again">Nochmal öffnen</button>' : ''}</div>`;
      this.previewItem(it);
      bg.querySelector('.close').onclick = () => { bg.remove(); this.show('shop'); };
      bg.querySelector('.again')?.addEventListener('click', () => { bg.remove(); this.openCrate(id); });
      bg.querySelector('.equip')?.addEventListener('click', async () => {
        const body = it.type === 'finish' ? { loadout: { finishes: { kr47: it.id } } } : { loadout: { [it.type]: it.id } };
        try { const rr = await api('/loadout', { method: 'PUT', body }); p.loadout = rr.loadout; toast(it.type === 'finish' ? `${it.name} auf der KR-47 ausgerüstet – im Spind für jede Waffe wählbar.` : `${it.name} ausgerüstet.`); } catch (e) { toast(e.message); }
        bg.remove(); this.show('shop');
      });
    }, 5400);
  }

  // -------------------------------------------------------------- Server
  async page_servers() {
    this.body.innerHTML = `<div class="page-head"><h1>Server</h1><button class="cr primary">Server erstellen</button><button class="rf">Aktualisieren</button></div>
      <div class="row filters"><input class="q grow" placeholder="Suchen …"><select class="fm"><option value="">Alle Modi</option>${Object.values(MODES).map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}</select>
      <select class="fmap"><option value="">Alle Maps</option>${MAP_LIST.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}</select>
      <label class="row"><input type="checkbox" class="nf"> Nicht voll</label><label class="row"><input type="checkbox" class="nl"> Ohne Passwort</label></div>
      <div class="srv-list"></div>`;
    const $ = (s) => this.body.querySelector(s);
    $('.cr').onclick = () => this.createDialog(false);
    let data = { rooms: [] }, ping = 0;
    const draw = () => {
      const q = $('.q').value.toLowerCase();
      const rows = data.rooms.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!$('.fm').value || r.mode === $('.fm').value) && (!$('.fmap').value || r.map === $('.fmap').value) && (!$('.nf').checked || r.players < r.max) && (!$('.nl').checked || !r.locked));
      $('.srv-list').innerHTML = rows.length ? rows.map((r) => {
        const [icon, c1] = MODE_STYLE[r.mode] || ['🎮', '#888'];
        return `<div class="srv" style="--c1:${c1}"><span class="srv-ic">${icon}</span><div class="grow"><b>${esc(r.name)}</b> ${r.locked ? '🔒' : ''} ${r.ranked ? '<span class="tag">Matchmaking</span>' : ''}
          <div class="muted">${MODES[r.mode].name} · ${esc(MAP_LIST.find((m) => m.id === r.map)?.name)} · ${esc(r.region)} · ${esc(r.status)}</div></div>
          <div class="srv-p"><b>${r.players}</b>/${r.max}${r.bots ? `<div class="muted">+${r.bots} Bots</div>` : ''}</div><div class="srv-ping">${ping} ms</div>
          <button data-id="${r.id}" data-l="${r.locked ? 1 : 0}" ${r.players >= r.max ? 'disabled' : ''}>Beitreten</button></div>`;
      }).join('') : '<div class="empty">Keine passenden Server. Erstelle einen eigenen oder nutze das Matchmaking unter „Spielen“.</div>';
      $('.srv-list').querySelectorAll('button').forEach((b) => (b.onclick = () => { if (b.dataset.l === '1') this.passwordPrompt(b.dataset.id); else this.app.net.send({ t: 'join', id: b.dataset.id }); }));
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

  // -------------------------------------------------------------- Profil
  async page_profile(name) {
    let p = { ...this.app.profile, online: true, status: 'Im Menü' };
    if (name && name !== p.name) { try { p = await api('/profile/' + encodeURIComponent(name)); } catch (e) { return toast(e.message); } }
    const s = p.stats, kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills;
    const tile = (v, l, ic) => `<div class="stat"><span class="st-ic">${ic}</span><div class="v">${v}</div><div class="l">${l}</div></div>`;
    this.body.innerHTML = `<div class="profile-hero card"><div class="avatar big" style="background:${avatarColor(p.name)}">${esc(p.name[0].toUpperCase())}</div>
      <div class="grow"><h1 style="margin:0">${esc(p.name)}</h1><div class="muted">Level ${p.level.level} · ${p.online ? `<span class="dot on"></span> ${esc(p.status)}` : 'offline'}</div>
      <div class="xpbar big" style="max-width:360px"><div style="width:${Math.round(p.level.into / p.level.need * 100)}%"></div></div><div class="muted" style="font-size:12px">${p.level.into}/${p.level.need} XP bis Level ${p.level.level + 1}</div></div>
      <div class="rank-badges">${RANKED_MODES.map((m) => { const r = p.ranks[m]; return `<div class="rb" style="--rc:${r.rank.color}"><b>${r.rank.name}</b><span>${MODES[m].short}</span></div>`; }).join('')}</div></div>
      <div class="stat-grid">${tile(fmtTime(s.playtime), 'Spielzeit', '⏱️')}${tile(s.wins, 'Siege', '🏅')}${tile(s.losses, 'Niederlagen', '➖')}${tile(s.kills, 'Kills', '🎯')}${tile(s.deaths, 'Tode', '💀')}${tile(kd, 'K/D', '⚖️')}${tile((s.kills ? Math.round(s.hs / s.kills * 100) : 0) + ' %', 'Kopfschussquote', '🎯')}${tile(p.favorite ? esc(p.favorite.name) : '–', 'Lieblingswaffe', '🔫')}</div>
      <h2>Letzte Matches</h2><div class="history">${(p.history || []).map((m) => {
        const res = m.left ? 'Verlassen' : m.won ? 'Sieg' : m.draw ? 'Unentschieden' : 'Niederlage';
        const cls = m.left ? 'left' : m.won ? 'win' : m.draw ? 'draw' : 'loss';
        return `<div class="hist ${cls}"><span class="hist-ic">${(MODE_STYLE[m.mode] || ['🎮'])[0]}</span><div class="grow"><b>${res}</b> ${m.res ? `<span class="muted">${esc(m.res)}</span>` : ''}<div class="muted">${MODES[m.mode]?.name} · ${esc(MAP_LIST.find((x) => x.id === m.map)?.name)} · ${new Date(m.t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</div></div>
          <div class="hist-kda"><b>${m.k} / ${m.d} / ${m.a}</b><span class="muted">K / T / A</span></div>${m.rd != null ? `<div class="hist-rd ${m.rd >= 0 ? 'up' : 'down'}">${m.rd >= 0 ? '+' : ''}${m.rd}</div>` : ''}</div>`;
      }).join('') || '<div class="empty">Noch keine Matches gespielt.</div>'}</div>`;
  }

  // -------------------------------------------------------------- Rangliste
  async page_leaderboard(mode = 'comp5') {
    const tabs = [...RANKED_MODES.map((m) => [m, MODES[m].name]), ['level', 'Level']];
    this.body.innerHTML = `<div class="page-head"><h1>Rangliste</h1></div><div class="pills">${tabs.map(([m, n]) => `<button data-m="${m}" class="${m === mode ? 'active' : ''}">${n}</button>`).join('')}</div><div class="lb"><p class="muted">Lade …</p></div>`;
    this.body.querySelectorAll('.pills button').forEach((b) => (b.onclick = () => this.page_leaderboard(b.dataset.m)));
    try {
      const d = await api('/leaderboard?mode=' + mode);
      const me = this.app.profile.name;
      const val = (r) => (mode === 'level' ? `Level ${r.level}` : `<span style="color:${r.rank.color}">${r.rank.name}</span> · ${r.value}`);
      const top = d.rows.slice(0, 3);
      const podium = top.length ? `<div class="podium">${[1, 0, 2].filter((i) => top[i]).map((i) => `<div class="pod p${i + 1}"><div class="avatar big" style="background:${avatarColor(top[i].name)}">${esc(top[i].name[0].toUpperCase())}</div><b>${esc(top[i].name)}</b><span>${val(top[i])}</span><div class="pod-base">${i + 1}</div></div>`).join('')}</div>` : '';
      this.body.querySelector('.lb').innerHTML = `${mode !== 'level' ? '<p class="muted">Sichtbar ab 3 gewerteten Matchmaking-Spielen. Jeder Modus hat seine eigene Rangliste.</p>' : ''}${podium}
        <div class="lb-list">${d.rows.slice(3).map((r, i) => `<div class="lb-row ${r.name === me ? 'me' : ''}"><span class="lb-pos">${i + 4}</span><span class="grow"><a href="#" data-n="${esc(r.name)}">${esc(r.name)}</a> <span class="muted">Lvl ${r.level}</span></span><span>${val(r)}</span></div>`).join('')}</div>
        ${!d.rows.length ? '<div class="empty">Noch niemand platziert – spiel 3 Matches über das Matchmaking.</div>' : ''}${d.me ? `<div class="card" style="margin-top:12px">Dein Platz: <b>#${d.me.pos}</b></div>` : ''}`;
      this.body.querySelectorAll('a[data-n]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); this.show('profile'); this.page_profile(a.dataset.n); }));
    } catch (e) { toast(e.message); }
  }

  // -------------------------------------------------------------- Statistiken
  page_stats() {
    const p = this.app.profile, s = p.stats;
    const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
    const wk = Object.entries(s.weaponKills || {}).filter(([w]) => WEAPONS[w] && WEAPONS[w].price > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const maxK = wk[0]?.[1] || 1;
    const tile = (v, l, ic) => `<div class="stat"><span class="st-ic">${ic}</span><div class="v">${v}</div><div class="l">${l}</div></div>`;
    this.body.innerHTML = `<div class="page-head"><h1>Statistiken</h1></div><div class="stat-grid">
      ${tile(s.matches, 'Matches', '🎮')}${tile((s.matches ? Math.round(s.wins / s.matches * 100) : 0) + ' %', 'Siegquote', '🏅')}${tile(acc + ' %', 'Trefferquote', '🎯')}${tile(s.assists, 'Assists', '🤝')}
      ${tile(s.plants, 'Bomben gelegt', '💣')}${tile(s.defuses, 'Entschärft', '✂️')}${tile(s.infections, 'Infektionen', '🧟')}${tile(s.sniperKills, 'Sniper-Kills', '🔭')}</div>
      <div class="grid2"><div class="card"><h3>Lieblingswaffen</h3>${wk.map(([w, k]) => `<div class="wbar"><img src="${weaponIcon(w, p.loadout.finishes[w] || 'f_stock')}"><div class="grow"><div class="row"><span class="grow">${WEAPONS[w].name}</span><b>${k}</b></div><div class="bar"><div style="width:${k / maxK * 100}%"></div></div></div></div>`).join('') || '<div class="empty">Noch keine Kills.</div>'}</div>
      <div class="card"><h3>Nach Modus</h3>${Object.values(MODES).map((m) => { const x = p.modeStats[m.id] || { matches: 0, wins: 0, kills: 0, deaths: 0 }; const wr = x.matches ? Math.round(x.wins / x.matches * 100) : 0; return `<div class="mstat"><span>${(MODE_STYLE[m.id] || ['🎮'])[0]}</span><div class="grow"><div class="row"><b class="grow">${m.name}</b><span class="muted">${x.matches} Spiele · K/D ${x.deaths ? (x.kills / x.deaths).toFixed(2) : x.kills}</span></div><div class="bar"><div style="width:${wr}%"></div></div><span class="muted" style="font-size:12px">${wr} % Siege</span></div></div>`; }).join('')}</div></div>`;
  }

  // -------------------------------------------------------------- Einstellungen
  page_settings() {
    this.body.innerHTML = '<div class="page-head"><h1>Einstellungen</h1><span class="muted">Werden automatisch in deinem Konto gespeichert.</span></div><div class="card settings-card"></div>';
    renderSettings(this.body.querySelector('.settings-card'));
  }

  // -------------------------------------------------------------- Freunde
  async page_friends() {
    await this.app.refreshProfile();
    this.refreshChrome();
    const p = this.app.profile;
    this.body.innerHTML = `<div class="page-head"><h1>Freunde</h1><span class="muted">${p.friends.filter((f) => f.online).length} online</span></div><div class="grid2">
      <div class="card"><h3>Freundesliste</h3>${p.friends.map((f) => `<div class="friend"><div class="avatar" style="background:${avatarColor(f.name)}">${esc(f.name[0].toUpperCase())}</div><div class="grow"><a href="#" data-n="${esc(f.name)}"><b>${esc(f.name)}</b></a><div class="muted"><span class="dot ${f.online ? 'on' : ''}"></span> ${f.online ? esc(f.status) : 'offline'} · Lvl ${f.level}</div></div>
        <button data-rm="${f.id}" class="ghost" title="Entfernen">✕</button><button data-bl="${f.id}" class="ghost" title="Blockieren">⛔</button></div>`).join('') || '<div class="empty">Noch keine Freunde – suche rechts nach Spielern.</div>'}
        <div class="muted" style="font-size:12px;margin-top:10px">Einladen: Lobby erstellen (Spielen → Lobby erstellen), dann im Spiel Esc → „Freunde einladen“.</div></div>
      <div class="col">
        <div class="card"><h3>Spieler suchen</h3><input class="sq" placeholder="Name …" style="width:100%"><div class="sr"></div></div>
        <div class="card"><h3>Anfragen</h3>${p.requests.map((f) => `<div class="friend"><div class="avatar" style="background:${avatarColor(f.name)}">${esc(f.name[0].toUpperCase())}</div><span class="grow">${esc(f.name)}</span><button data-acc="${f.id}" class="primary">Annehmen</button><button data-dec="${f.id}">Ablehnen</button></div>`).join('') || '<div class="muted">Keine offenen Anfragen.</div>'}</div>
        <div class="card"><h3>Blockiert</h3>${p.blocked.map((f) => `<div class="friend"><span class="grow">${esc(f.name)}</span><button data-ub="${f.id}">Freigeben</button></div>`).join('') || '<div class="muted">Niemand blockiert.</div>'}</div>
        <div class="card"><h3>Spieler melden</h3><input class="rn" placeholder="Spielername" style="width:100%"><select class="rr" style="width:100%;margin-top:6px"><option>Cheaten</option><option>Beleidigung</option><option>Unangemessener Name</option><option>Sonstiges</option></select><button class="rs" style="margin-top:6px">Melden</button></div>
      </div></div>`;
    const act = async (path, body, msg) => { try { await api(path, { method: 'POST', body }); if (msg) toast(msg); this.page_friends(); } catch (e) { toast(e.message); } };
    const B = this.body;
    B.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => act('/friends/accept', { id: b.dataset.acc }, 'Freund hinzugefügt.')));
    B.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = () => act('/friends/decline', { id: b.dataset.dec })));
    B.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => act('/friends/remove', { id: b.dataset.rm })));
    B.querySelectorAll('[data-bl]').forEach((b) => (b.onclick = () => act('/block', { id: b.dataset.bl }, 'Spieler blockiert.')));
    B.querySelectorAll('[data-ub]').forEach((b) => (b.onclick = () => act('/block', { id: b.dataset.ub, unblock: true })));
    B.querySelectorAll('a[data-n]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); this.show('profile'); this.page_profile(a.dataset.n); }));
    B.querySelector('.rs').onclick = async () => { try { await api('/report', { method: 'POST', body: { name: B.querySelector('.rn').value, reason: B.querySelector('.rr').value } }); toast('Meldung gespeichert.'); } catch (e) { toast(e.message); } };
    let timer;
    B.querySelector('.sq').oninput = (e) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const d = await api('/search?q=' + encodeURIComponent(e.target.value)).catch(() => ({ rows: [] }));
        const sr = B.querySelector('.sr');
        sr.innerHTML = d.rows.map((r) => `<div class="friend"><span class="dot ${r.online ? 'on' : ''}"></span><span class="grow">${esc(r.name)} <span class="muted">Lvl ${r.level}</span></span><button data-add="${esc(r.name)}">Anfrage</button></div>`).join('');
        sr.querySelectorAll('[data-add]').forEach((b) => (b.onclick = async () => { try { const r = await api('/friends/request', { method: 'POST', body: { name: b.dataset.add } }); toast(r.accepted ? 'Ihr seid jetzt befreundet.' : 'Anfrage gesendet.'); b.disabled = true; } catch (er) { toast(er.message); } }));
      }, 250);
    };
  }
}
