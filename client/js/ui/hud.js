// In-Game-HUD (DOM-Overlay).
import { WEAPONS, GEAR, CATEGORIES } from '/shared/weapons.js';
import { MODES, TEAM_NAMES } from '/shared/constants.js';
import { TALL } from '/shared/maps.js';
import { settings, keyName } from '../settings.js';
import { renderSettings, drawCrosshair } from './settingsView.js';
import { audio } from '../game/audio.js';
import { api } from '../api.js';
import { weaponIcon } from '../game/icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtT = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class Hud {
  constructor(game) {
    this.g = game;
    this.el = document.getElementById('hud');
    this.el.innerHTML = `
      <div class="h-vignette"></div><div class="h-flash"></div>
      <canvas class="h-scope hidden"></canvas>
      <div class="h-net"></div>
      <canvas class="h-radar" width="170" height="170"></canvas>
      <div class="h-top"></div>
      <div class="h-banner hidden pe"></div>
      <div class="h-sub hidden"></div>
      <div class="h-feed"></div>
      <div class="h-center"></div>
      <canvas class="h-cross" width="80" height="80"></canvas>
      <svg class="h-hit" viewBox="0 0 30 30"><path d="M3 3 L11 11 M27 3 L19 11 M3 27 L11 19 M27 27 L19 19" stroke="#fff" stroke-width="2.5"/></svg>
      <canvas class="h-dir" width="220" height="220"></canvas>
      <div class="h-progress hidden"><span></span><div class="b"><div></div></div></div>
      <div class="h-chat"></div>
      <div class="h-money"></div>
      <div class="h-bl"><div class="h-hp"><div class="h-small">LEBEN</div><div class="h-big">100</div></div><div class="h-ar"><div class="h-small">RÜSTUNG</div><div class="h-big">0</div></div></div>
      <div class="h-br"><div class="h-slots"></div><img class="h-wicon" alt=""><div class="h-small h-wname"></div><div class="h-big h-ammo"></div></div>
      <div class="h-spec hidden"></div>
      <div class="h-layer"></div>`;
    this.$ = (s) => this.el.querySelector(s);
    this.cache = new Map();
    this.feedItems = [];
    this.chatLines = [];
    this.layer = this.$('.h-layer');
    this.buyOpen = false; this.escOpen = false; this.chatOpen = false; this.scoreOpen = false; this.ended = false;
    this.hurtAngles = [];
    this.drawCross();
    this.radarBase = this.buildRadar();
    this.applyScale();
  }

  set(sel, val, prop = 'textContent') {
    const k = sel + prop;
    if (this.cache.get(k) === val) return;
    this.cache.set(k, val);
    const el = typeof sel === 'string' ? this.$(sel) : sel;
    if (el) el[prop] = val;
  }
  show() { this.el.classList.remove('hidden'); }
  dispose() { this.el.classList.add('hidden'); this.el.innerHTML = ''; }
  modalOpen() { return this.buyOpen || this.escOpen || this.chatOpen || this.ended; }
  applyScale() { this.el.style.transform = `scale(${settings.gameplay.hudScale})`; }
  drawCross() { drawCrosshair(this.$('.h-cross'), settings.gameplay.crosshair); }

  // -------------------------------------------------------------- pro Frame
  frame(dt, { scoped }) {
    const G = this.g, s = G.self, gs = G.g || {};
    if (this.lastSettingsStamp !== JSON.stringify(settings.gameplay)) { this.lastSettingsStamp = JSON.stringify(settings.gameplay); this.drawCross(); this.applyScale(); }
    const net = [];
    if (settings.gameplay.showFps) net.push(`${G.fps} FPS`);
    if (settings.gameplay.showNet) net.push(`Ping ${Math.round(G.net.rtt)} ms`, `Verlust ${G.net.lossPct} %`);
    if (!G.net.connected) net.push('⚠ Verbindung unterbrochen – verbinde neu …');
    this.set('.h-net', net.join(' · '));
    const sc = this.$('.h-scope');
    sc.classList.toggle('hidden', !scoped);
    if (scoped && (sc.width !== innerWidth || sc.height !== innerHeight)) drawScope(sc);
    this.$('.h-cross').classList.toggle('hidden', !!scoped || !s?.al || !!G.myEmote);
    if (!s) return;
    // Leben/Rüstung
    this.set('.h-hp .h-big', String(s.hp));
    this.$('.h-hp .h-big').classList.toggle('h-low', s.hp <= 25);
    this.$('.h-ar').classList.toggle('hidden', !G.modeArmor());
    this.set('.h-ar .h-big', String(s.ar) + (s.hm ? ' ⛑' : ''));
    this.set('.h-money', gs.ph && ['freeze', 'live', 'planted', 'end'].includes(gs.ph) && gs.b ? `$${s.$}${G.canBuyNow() ? '  🛒' : ''}` : '');
    // Waffe/Munition
    const inst = G.currentInst(), w = G.currentWeapon();
    this.set('.h-wname', w ? w.name + (s.kit ? ' · Kit' : '') : '');
    const finish = inst ? (G.app.profile?.loadout?.finishes?.[inst.id] || 'f_stock') : null;
    const showIcon = w && w.cat !== 'bomb' && w.id !== 'klaue';
    const icon = showIcon ? weaponIcon(inst.id, finish) : '';
    if (this.cache.get('icon') !== icon) { this.cache.set('icon', icon); const im = this.$('.h-wicon'); im.src = icon || ''; im.style.display = icon ? 'block' : 'none'; }
    let ammo = '';
    if (w && !w.melee && w.cat !== 'grenade' && w.cat !== 'bomb') ammo = `${G.predictedMag()} / ${inst.res >= 900 ? '∞' : inst.res}`;
    if (s.rl > 0) ammo = 'Lädt …';
    this.set('.h-ammo', ammo);
    const slots = [];
    for (const [slot, label] of [[0, '1'], [1, '2'], [2, '3'], [3, '4'], [4, '5']]) {
      const it = G.slotInst(slot);
      if (!it) continue;
      const name = slot === 3 ? s.gr.map((g) => WEAPONS[g].name).join(', ') : WEAPONS[it.id].name;
      slots.push(`<div class="s ${G.wantSlot === slot ? 'on' : ''}">${label} · ${esc(name)}</div>`);
    }
    this.set('.h-slots', slots.join(''), 'innerHTML');
    this.$('.h-bl').classList.toggle('hidden', !s.al);
    this.$('.h-br').classList.toggle('hidden', !s.al);
    // Aktion (Legen/Entschärfen)
    const pr = this.$('.h-progress');
    if (s.act) { pr.classList.remove('hidden'); this.set('.h-progress span', s.act.t === 'plant' ? 'Bombe wird platziert …' : 'Entschärfe …'); this.$('.h-progress .b > div').style.width = Math.round(s.act.p * 100) + '%'; }
    else pr.classList.add('hidden');
    this.topBar(gs, s);
    this.specBox(s);
    this.banner();
    this.drawRadar();
    this.drawHurt(dt);
    // Kill-Feed ausblenden
    const now = performance.now();
    this.feedItems = this.feedItems.filter((f) => { if (now - f.t > 6000) { f.el.remove(); return false; } return true; });
    for (const c of this.chatLines) c.el.style.opacity = this.chatOpen || now - c.t < 9000 ? 1 : 0;
    if (this.centerUntil && now > this.centerUntil) { this.$('.h-center').innerHTML = ''; this.centerUntil = 0; }
    if (this.subUntil && now > this.subUntil) { this.$('.h-sub').classList.add('hidden'); this.subUntil = 0; }
    // Punktestand
    const showScore = G.input.is('score') && !this.chatOpen;
    if (showScore !== this.scoreOpen || (showScore && now - (this.scoreDrawn || 0) > 500)) { this.scoreOpen = showScore; this.renderScore(); this.scoreDrawn = now; }
    if (this.buyOpen && now - (this.buyDrawn || 0) > 250) this.renderBuy();
  }

  topBar(gs, s) {
    const G = this.g, mode = G.modeId;
    let html = '';
    if (gs.ph === 'warmup') html = `<span>Aufwärmphase</span>`;
    else if (gs.sc) {
      const label = { freeze: 'Kaufphase', live: '', planted: '💣', end: '' }[gs.ph] || '';
      html = `<span class="sc h-t">${gs.sc.T}</span><span class="tm ${gs.ph === 'planted' ? 'h-low' : ''}">${fmtT(gs.te)}</span><span class="sc h-c">${gs.sc.C}</span>
        <span class="h-small">Runde ${gs.r}/${gs.mr} ${label}<br><span class="h-t">${gs.al.T}</span> vs <span class="h-c">${gs.al.C}</span> am Leben</span>`;
    } else if (mode === 'gungame') {
      const lad = G.cfg.ladder || [];
      const me = G.roster.get(G.me);
      const lvl = me?.gl ?? 0;
      html = `<span class="tm">${fmtT(gs.te)}</span><div><div class="h-gg">${lad.map((_, i) => `<span class="${i <= lvl ? 'on' : ''}"></span>`).join('')}</div>
        <div class="h-small">Stufe ${lvl + 1}/${lad.length}: ${esc(WEAPONS[lad[lvl]]?.name)} · nächste: ${esc(WEAPONS[lad[lvl + 1]]?.name || 'Sieg')}</div></div>
        <span class="h-small">Führung: ${(gs.top || []).map(([id, l]) => `${esc(G.roster.get(id)?.name)} (${l + 1})`).join(', ')}</span>`;
    } else if (mode === 'zombie') {
      html = `<span class="h-c">🧍 ${gs.hum ?? 0}</span><span class="tm">${gs.ph === 'wait' ? 'Infektion in ' + Math.ceil(gs.te) : fmtT(gs.te)}</span><span style="color:#8fd16a">🧟 ${gs.zom ?? 0}</span><span class="h-small">Runde ${gs.r}/${gs.rounds}<br>Überlebende ${gs.w?.humans ?? 0} : ${gs.w?.zombies ?? 0} Zombies</span>`;
    } else if (mode === 'tdm') {
      html = `<span class="sc h-t">${gs.ts?.T ?? 0}</span><span class="tm">${gs.ph === 'countdown' ? 'Start in ' + Math.ceil(gs.te) : fmtT(gs.te)}</span><span class="sc h-c">${gs.ts?.C ?? 0}</span><span class="h-small">Team Deathmatch<br>${gs.lim} Kills gewinnen</span>`;
    } else if (mode === 'sniper') {
      const me = G.roster.get(G.me);
      const ts = gs.ts ? `<span class="sc h-t">${gs.ts.T}</span>` : '';
      const tc = gs.ts ? `<span class="sc h-c">${gs.ts.C}</span>` : '';
      html = `${ts}<span class="tm">${gs.ph === 'countdown' ? 'Start in ' + Math.ceil(gs.te) : fmtT(gs.te)}</span>${tc}<span class="h-small">Deine Punkte: ${me?.sc ?? 0} / ${gs.lim}<br>${(gs.top || []).map(([id, p]) => `${esc(G.roster.get(id)?.name)} ${p}`).join(' · ')}</span>`;
    }
    if (gs.ph === 'countdown' && mode !== 'sniper') html = `<span class="tm">Start in ${Math.ceil(gs.te)}</span>` + html;
    this.set('.h-top', html, 'innerHTML');
  }

  banner() {
    const G = this.g, b = this.$('.h-banner');
    if (G.started || !G.roomInfo) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    const txt = G.isHost ? `Aufwärmphase · Lobby-Code ${G.roomInfo.id} · Esc → „Match starten“` : `Aufwärmphase · Lobby-Code ${G.roomInfo.id} · Warte auf den Host`;
    this.set('.h-banner', txt);
  }

  specBox(s) {
    const box = this.$('.h-spec'), G = this.g;
    if (s.al || this.ended) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const target = G.spec != null ? G.roster.get(G.spec)?.name : null;
    const resp = s.ra != null ? `Respawn in ${s.ra.toFixed(1)} s` : 'Du bist tot – warte auf die nächste Runde';
    this.set('.h-spec', `${resp}${target ? `<br><span class="h-small">Zuschauen: ${esc(target)} · Klick = nächster Spieler</span>` : ''}`, 'innerHTML');
  }

  // -------------------------------------------------------------- Radar
  buildRadar() {
    const m = this.g.map, cv = document.createElement('canvas');
    cv.width = cv.height = 170;
    const g = cv.getContext('2d');
    const sc = 160 / Math.max(m.w, m.h);
    this.radarScale = sc;
    this.radarOff = [(170 - m.w * sc) / 2, (170 - m.h * sc) / 2];
    for (let z = 0; z < m.h; z++) for (let x = 0; x < m.w; x++) {
      const c = m.grid[z][x];
      if (c === ' ') continue;
      g.fillStyle = TALL.has(c) ? '#6b7380' : /[1-9k]/.test(c) ? '#3b424c' : '#262b33';
      g.fillRect(this.radarOff[0] + x * sc, this.radarOff[1] + z * sc, sc + 0.5, sc + 0.5);
    }
    g.fillStyle = '#ff6a2a'; g.font = 'bold 12px sans-serif';
    for (const s of m.sites) { const [px, pz] = this.toRadar((s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2); g.fillText(s.name, px - 4, pz + 4); }
    return cv;
  }
  toRadar(x, z) { const m = this.g.map; return [this.radarOff[0] + ((x + m.w) / 2) * this.radarScale, this.radarOff[1] + ((z + m.h) / 2) * this.radarScale]; }
  drawRadar() {
    const cv = this.$('.h-radar');
    cv.classList.toggle('hidden', !settings.gameplay.radar);
    if (!settings.gameplay.radar) return;
    const g = cv.getContext('2d'), G = this.g;
    g.clearRect(0, 0, 170, 170);
    g.drawImage(this.radarBase, 0, 0);
    const myTeam = G.self?.team, teams = MODES[G.modeId].teams;
    for (const r of G.remotes.values()) {
      const v = r.vis;
      if (!v || !(v.f & 1)) continue;
      if (!teams || v.team !== myTeam || myTeam === 'N') continue;
      const [x, z] = this.toRadar(v.x, v.z);
      g.fillStyle = v.team === 'T' ? '#e8a33c' : '#5aa7ff';
      g.beginPath(); g.arc(x, z, 3, 0, 7); g.fill();
    }
    const b = G.g?.b;
    if (b && (b[0] === 'planted' || b[0] === 'dropped') && (myTeam === 'T' || b[0] === 'planted')) { const [x, z] = this.toRadar(b[1], b[3]); g.fillStyle = '#ff3030'; g.fillRect(x - 3, z - 3, 6, 6); }
    if (G.self?.al) {
      const [x, z] = this.toRadar(G.pred.x, G.pred.z);
      g.save(); g.translate(x, z); g.rotate(-G.yaw);
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.fill();
      g.restore();
    }
  }

  // -------------------------------------------------------------- Rückmeldungen
  hitmarker(head, kill) {
    if (!settings.gameplay.hitmarker) return;
    const h = this.$('.h-hit');
    h.querySelector('path').setAttribute('stroke', kill ? '#ff4040' : head ? '#ffd23f' : '#fff');
    h.classList.add('show');
    clearTimeout(this.hitT); this.hitT = setTimeout(() => h.classList.remove('show'), 90);
  }
  damageNumber(x, y, dmg, head) {
    const d = document.createElement('div');
    d.className = 'h-dmgnum' + (head ? ' hs' : '');
    d.textContent = dmg;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    this.layer.append(d);
    setTimeout(() => d.remove(), 800);
  }
  hurt(angle, dmg) {
    if (angle != null) this.hurtAngles.push({ a: angle, t: 1 });
    const f = this.$('.h-flash');
    f.style.transition = 'none'; f.style.background = `rgba(255,0,0,${Math.min(0.35, dmg / 150)})`;
    requestAnimationFrame(() => { f.style.transition = 'background .5s'; f.style.background = 'rgba(255,0,0,0)'; });
  }
  drawHurt(dt) {
    const cv = this.$('.h-dir'), g = cv.getContext('2d');
    g.clearRect(0, 0, 220, 220);
    this.hurtAngles = this.hurtAngles.filter((h) => (h.t -= dt * 0.8) > 0);
    for (const h of this.hurtAngles) {
      g.strokeStyle = `rgba(255,40,40,${h.t})`; g.lineWidth = 6;
      const a = -Math.PI / 2 - h.a;
      g.beginPath(); g.arc(110, 110, 100, a - 0.3, a + 0.3); g.stroke();
    }
    const s = this.g.self;
    this.$('.h-vignette').style.boxShadow = s?.al && s.hp < 35 ? `inset 0 0 180px rgba(176,0,0,${0.6 - s.hp / 70})` : 'inset 0 0 180px rgba(176,0,0,0)';
  }
  center(title, sub = '', dur = 2.5, kind) {
    const col = kind === 'win' ? '#7dff9a' : kind === 'lose' ? '#ff8a8a' : '#fff';
    this.$('.h-center').innerHTML = `<div style="color:${col}">${esc(title)}</div>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    this.centerUntil = performance.now() + dur * 1000;
  }
  sub(text, dur = 2) { const s = this.$('.h-sub'); s.textContent = text; s.classList.remove('hidden'); this.subUntil = performance.now() + dur * 1000; }

  killfeed(e) {
    if (!settings.gameplay.killfeed) return;
    const R = this.g.roster;
    const name = (id) => { const p = R.get(id); return p ? `<span class="${p.team === 'T' ? 'h-t' : p.team === 'C' ? 'h-c' : ''}">${esc(p.name)}</span>` : '?'; };
    const wname = e.inf ? '🧟 infiziert' : e.w === 'fall' ? 'Absturz' : e.w === 'bomb' ? '💣' : esc(WEAPONS[e.w]?.name || e.w);
    const killer = e.k != null && e.k !== e.v ? name(e.k) + (e.a != null ? ` + ${name(e.a)}` : '') + ' ' : '';
    const d = document.createElement('div');
    d.innerHTML = `${killer}[${wname}${e.hs ? ' ◎' : ''}] ${name(e.v)}`;
    if (e.k === this.g.me || e.v === this.g.me) d.className = 'me';
    this.$('.h-feed').append(d);
    this.feedItems.push({ el: d, t: performance.now() });
    if (this.feedItems.length > 6) this.feedItems.shift().el.remove();
  }

  // -------------------------------------------------------------- Chat
  chatLine(m) {
    const d = document.createElement('div');
    d.className = 'ln';
    if (m.sys) d.innerHTML = `<span style="color:#ffb02a">${esc(m.text)}</span>`;
    else d.innerHTML = `${m.team ? '<span class="muted">[Team]</span> ' : ''}${m.alive === false ? '<span class="muted">*tot*</span> ' : ''}<b>${esc(m.from)}:</b> ${esc(m.text)}`;
    this.$('.h-chat').append(d);
    this.chatLines.push({ el: d, t: performance.now() });
    if (this.chatLines.length > 8) this.chatLines.shift().el.remove();
  }
  openChat(team) {
    if (this.chatOpen || this.ended) return;
    this.chatOpen = true;
    this.g.input.typing = true;
    this.g.input.unlock();
    const i = document.createElement('input');
    i.placeholder = team ? 'Team-Nachricht … (Enter senden, Esc abbrechen)' : 'Nachricht an alle … (Enter senden, Esc abbrechen)';
    i.className = 'pe'; i.maxLength = 140;
    this.$('.h-chat').append(i);
    setTimeout(() => i.focus(), 0);
    const close = () => { i.remove(); this.chatOpen = false; this.g.input.typing = false; this.g.input.lock(); };
    i.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { if (i.value.trim()) this.g.net.send({ t: 'chat', text: i.value, team }); close(); }
      if (e.key === 'Escape') close();
    };
  }

  // -------------------------------------------------------------- Punktestand
  rosterChanged() { if (this.scoreOpen) this.renderScore(); }
  renderScore() {
    let box = this.$('.h-score');
    if (!this.scoreOpen) { box?.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'h-score'; this.layer.append(box); }
    const G = this.g, list = [...G.roster.values()];
    const teams = MODES[G.modeId].teams;
    const row = (p) => {
      const r = G.remotes.get(p.id);
      const alive = p.id === G.me ? G.self?.al : r?.vis ? r.vis.f & 1 : 1;
      return `<tr class="t${p.team} ${alive ? '' : 'dead'} ${p.id === G.me ? 'me' : ''}"><td>${esc(p.name)}${p.bot ? ' <span class="tag">BOT</span>' : ''}${p.dc ? ' <span class="tag">getrennt</span>' : ''}${p.z ? ' 🧟' : ''}</td>
        ${G.modeId === 'gungame' ? `<td>${(p.gl ?? 0) + 1}</td>` : ''}<td>${p.k}</td><td>${p.d}</td><td>${p.a}</td><td>${p.k ? Math.round((p.hs / p.k) * 100) : 0}%</td><td>${p.sc}</td>${p.$ != null ? `<td>$${p.$}</td>` : '<td></td>'}<td>${p.bot ? '–' : p.ping + ' ms'}</td></tr>`;
    };
    const head = `<tr><th>Spieler</th>${G.modeId === 'gungame' ? '<th>Stufe</th>' : ''}<th>K</th><th>T</th><th>A</th><th>HS</th><th>Punkte</th><th></th><th>Ping</th></tr>`;
    let html = `<div class="row"><b>${esc(G.roomInfo?.name || '')}</b><span class="muted grow">${esc(G.map.name)} · ${MODES[G.modeId].name}</span><span class="muted">Code ${G.roomInfo?.id}</span></div>`;
    if (teams && G.modeId !== 'zombie') {
      for (const t of ['T', 'C']) {
        const ps = list.filter((p) => p.team === t).sort((a, b) => b.sc - a.sc);
        html += `<h4 class="${t === 'T' ? 'h-t' : 'h-c'}" style="margin:10px 0 4px">${TEAM_NAMES[t]} ${G.g?.sc ? '· ' + G.g.sc[t] : ''}</h4><table>${head}${ps.map(row).join('')}</table>`;
      }
      if (G.g?.hist?.length) html += `<div class="row" style="margin-top:8px;gap:3px">${G.g.hist.map((w) => `<span class="dot" style="background:${w === 'T' ? '#e8a33c' : '#5aa7ff'}"></span>`).join('')}</div>`;
    } else {
      html += `<table>${head}${list.sort((a, b) => (G.modeId === 'gungame' ? b.gl - a.gl : 0) || b.sc - a.sc || b.k - a.k).map(row).join('')}</table>`;
    }
    box.innerHTML = html;
  }

  // -------------------------------------------------------------- Kaufmenü
  toggleBuy() {
    if (this.ended || this.escOpen) return;
    if (this.buyOpen) return this.closeBuy();
    const mode = this.g.modeId;
    const loadoutMode = mode === 'sniper' || mode === 'tdm';
    if (!['comp5', 'comp2', 'sniper', 'tdm'].includes(mode) || (!loadoutMode && !this.g.started)) { this.sub(loadoutMode || this.g.started ? 'In diesem Modus gibt es kein Kaufmenü.' : 'Kaufen ist ab Matchbeginn möglich.', 2); audio.ui('error'); return; }
    this.buyOpen = true;
    this.g.input.unlock();
    this.renderBuy();
  }
  closeBuy() { this.buyOpen = false; this.$('.h-buy')?.remove(); if (!this.escOpen) this.g.input.lock(); }
  renderBuy() {
    const G = this.g, s = G.self;
    let box = this.$('.h-buy');
    if (!box) { box = document.createElement('div'); box.className = 'h-buy pe'; this.layer.append(box); }
    this.buyDrawn = performance.now();
    if (G.modeId === 'tdm') {
      if (box.dataset.built) return;
      box.dataset.built = '1';
      const fin = (id) => G.app.profile?.loadout?.finishes?.[id] || 'f_stock';
      const card = (id) => { const w = WEAPONS[id]; return `<button class="pk lo-card" data-w="${id}"><img src="${weaponIcon(id, fin(id))}"><b>${w.name}</b><span class="muted">${w.dmg} Schaden · ${w.rpm}/min · ${w.mag} Schuss</span></button>`; };
      box.innerHTML = `<div class="row"><h2 class="grow" style="margin:0">Loadout – Team Deathmatch</h2><button class="x">Schließen (${keyName(settings.controls.keys.buy)})</button></div>
        <p class="muted">Gilt ab dem nächsten Respawn (während des Spawnschutzes sofort). Messer und Splittergranate sind immer dabei.</p>
        <h4 class="muted">PRIMÄRWAFFE</h4><div class="lo-grid">${(G.cfg.primaries || []).map(card).join('')}</div>
        <h4 class="muted">SEKUNDÄRWAFFE</h4><div class="lo-grid">${(G.cfg.secondaries || []).map(card).join('')}</div>`;
      box.querySelectorAll('.pk').forEach((b) => (b.onclick = () => { G.net.send({ t: 'pick', w: b.dataset.w }); audio.ui('buy'); box.querySelectorAll('.pk').forEach((x) => { if (WEAPONS[x.dataset.w].slot === WEAPONS[b.dataset.w].slot) x.classList.toggle('sel', x === b); }); }));
      box.querySelector('.x').onclick = () => this.closeBuy();
      return;
    }
    if (G.modeId === 'sniper') {
      if (box.dataset.built) return;
      box.dataset.built = '1';
      const allowed = G.cfg.allowed || [];
      box.innerHTML = `<div class="row"><h2 class="grow" style="margin:0">Waffenwahl – Only Sniper</h2><button class="x">Schließen (${keyName(settings.controls.keys.buy)})</button></div>
        <p class="muted">Die Auswahl gilt ab dem nächsten Respawn (während des Spawnschutzes sofort).</p>
        <div class="cats">${allowed.map((id) => { const w = WEAPONS[id]; return `<div class="card"><h3 style="margin:0 0 4px">${w.name}</h3><div class="muted">${w.sniperClass || ''}</div>
        <p>Schaden ${w.dmg} · ${w.rpm} Schuss/min · Magazin ${w.mag}<br>Nachladen ${w.reload}s · Zoom ${w.scope.join('°/')}° · Tempo ${Math.round(w.mob * 100)}%</p><button class="primary pk" data-w="${id}">Auswählen</button></div>`; }).join('')}</div>`;
      box.querySelectorAll('.pk').forEach((b) => (b.onclick = () => { G.net.send({ t: 'pick', w: b.dataset.w }); audio.ui('buy'); this.closeBuy(); }));
      box.querySelector('.x').onclick = () => this.closeBuy();
      return;
    }
    const can = G.canBuyNow();
    const money = s?.$ ?? 0;
    const owns = new Set([...(s?.w || []).map((w) => w[1]), ...(s?.gr || [])]);
    if (!box.dataset.built) {
      box.dataset.built = '1';
      const cats = CATEGORIES.map((c) => {
        const items = c.id === 'gear' ? Object.values(GEAR).filter((g) => !g.team || g.team === s?.team) : Object.values(WEAPONS).filter((w) => w.cat === c.id && w.price > 0);
        if (!items.length) return '';
        return `<div class="cat"><h4>${c.name}</h4>${items.map((it) => `<button class="bi" data-i="${it.id}" title="${it.desc || weaponInfo(it)}"><span class="n">${it.name}</span><span class="p"></span></button>`).join('')}</div>`;
      }).join('');
      box.innerHTML = `<div class="row" style="margin-bottom:10px"><h2 class="grow" style="margin:0">Kaufmenü</h2><span class="bm" style="font-size:22px;color:#9cff9c"></span>
        <span class="muted bt"></span><button class="x">Schließen</button></div>
        <div class="muted ba" style="margin-bottom:8px"></div><div class="cats">${cats}</div>`;
      box.querySelectorAll('.bi').forEach((b) => (b.onclick = () => G.net.send({ t: 'buy', item: b.dataset.i })));
      box.querySelector('.x').onclick = () => this.closeBuy();
    }
    box.querySelector('.bm').textContent = `$${money}`;
    box.querySelector('.bt').textContent = can ? `Kaufzeit: ${Math.ceil(G.g.be || 0)} s` : 'Kaufen gerade nicht möglich (nur in der Kaufzone während der Kaufzeit)';
    box.querySelector('.ba').textContent = `Leben 100 · Rüstung ${s?.ar ?? 0}${s?.hm ? ' + Helm' : ''} · Weste schützt den Körper, Helm zusätzlich den Kopf.`;
    box.querySelectorAll('.bi').forEach((b) => {
      const it = WEAPONS[b.dataset.i] || GEAR[b.dataset.i];
      const price = it.id === 'vesthelm' && s?.ar >= 100 && !s?.hm ? 350 : it.price;
      b.classList.toggle('no', money < price || !can);
      b.querySelector('.p').textContent = `$${price}`;
      b.querySelector('.n').textContent = it.name + (owns.has(it.id) ? ' ✓' : '');
    });
  }

  // -------------------------------------------------------------- Esc-Menü
  openEsc() {
    if (this.ended || this.chatOpen) return;
    if (this.buyOpen) { this.closeBuy(); return; }
    this.escOpen = true;
    const G = this.g;
    const box = document.createElement('div');
    box.className = 'h-esc pe';
    const teamMode = MODES[G.modeId].teams && G.modeId !== 'zombie';
    box.innerHTML = `<div class="modal col">
      <h2 style="margin:0">Pause</h2><div class="muted">${esc(G.roomInfo?.name || '')} · Code <b>${G.roomInfo?.id}</b></div>
      <button class="primary res">Fortsetzen</button>
      ${G.isHost && !G.started ? `<button class="primary start">Match starten</button><div class="row"><button class="grow ba">+ Bot</button><button class="grow bk">− Bot</button></div>` : ''}
      ${!G.started && teamMode ? `<div class="row"><button class="grow tt">Team Angreifer</button><button class="grow tc">Team Verteidiger</button></div>` : ''}
      <button class="inv">Freunde einladen</button>
      <button class="set">Einstellungen</button>
      <button class="rep">Spieler melden</button>
      <button class="danger lv">Spiel verlassen</button>
      <div class="sub"></div></div>`;
    this.layer.append(box);
    this.escBox = box;
    const $ = (s) => box.querySelector(s);
    $('.res').onclick = () => this.closeEsc();
    if ($('.start')) { $('.start').onclick = () => { G.net.send({ t: 'start' }); this.closeEsc(); }; $('.ba').onclick = () => G.net.send({ t: 'botAdd' }); $('.bk').onclick = () => G.net.send({ t: 'botKick' }); }
    if ($('.tt')) { $('.tt').onclick = () => G.net.send({ t: 'team', team: 'T' }); $('.tc').onclick = () => G.net.send({ t: 'team', team: 'C' }); }
    $('.set').onclick = () => { const sub = $('.sub'); sub.innerHTML = ''; sub.style.minWidth = '640px'; renderSettings(sub); };
    $('.lv').onclick = () => { this.closeEsc(false); G.leave(); };
    $('.inv').onclick = async () => {
      const sub = $('.sub');
      sub.innerHTML = '<p class="muted">Lade Freunde …</p>';
      try {
        const me = await api('/me');
        const on = me.friends.filter((f) => f.online);
        sub.innerHTML = on.length ? on.map((f) => `<div class="row"><span class="grow">${esc(f.name)} <span class="muted">${f.status}</span></span><button data-id="${f.id}">Einladen</button></div>`).join('') : '<p class="muted">Keine Freunde online. Teile den Lobby-Code: <b>' + G.roomInfo?.id + '</b></p>';
        sub.querySelectorAll('button[data-id]').forEach((b) => (b.onclick = () => { G.net.send({ t: 'invite', to: b.dataset.id }); b.disabled = true; }));
      } catch (e) { sub.textContent = e.message; }
    };
    $('.rep').onclick = () => {
      const sub = $('.sub');
      const humans = [...G.roster.values()].filter((p) => !p.bot && p.id !== G.me);
      sub.innerHTML = humans.length ? `<div class="col"><select class="who">${humans.map((p) => `<option>${esc(p.name)}</option>`).join('')}</select>
        <select class="why"><option>Cheaten (Aimbot/Wallhack)</option><option>Speedhack</option><option>Beleidigung</option><option>Teamschaden/Griefing</option><option>Sonstiges</option></select><button class="send">Meldung senden</button></div>` : '<p class="muted">Keine anderen Spieler.</p>';
      sub.querySelector('.send')?.addEventListener('click', async () => {
        try { await api('/report', { method: 'POST', body: { name: sub.querySelector('.who').value, reason: sub.querySelector('.why').value } }); sub.innerHTML = '<p>Danke, die Meldung wurde gespeichert.</p>'; }
        catch (e) { sub.innerHTML = `<p>${esc(e.message)}</p>`; }
      });
    };
  }
  closeEsc(relock = true) { this.escOpen = false; this.escBox?.remove(); this.escBox = null; if (relock) this.g.input.lock(); }

  // -------------------------------------------------------------- Ende
  endScreen(m) {
    this.ended = true;
    this.closeBuy(); this.closeEsc(false);
    const G = this.g;
    const mine = (m.summary || []).find((x) => x.id === G.me);
    const r = m.result || {};
    let head = 'Match beendet';
    if (r.draw) head = 'Unentschieden';
    else if (mine) head = mine.won ? 'Sieg!' : 'Niederlage';
    audio.ui(mine?.won ? 'level' : 'lose');
    let detail = '';
    if (r.score) detail = `<span class="h-t">${r.score.T}</span> : <span class="h-c">${r.score.C}</span>`;
    if (r.winnerName) detail = `Sieger: ${esc(r.winnerName)}`;
    if (r.wins) detail = `Überlebende ${r.wins.humans} : ${r.wins.zombies} Zombies`;
    const box = document.createElement('div');
    box.className = 'h-end pe';
    box.innerHTML = `<div class="modal col" style="min-width:520px">
      <h1 style="margin:0">${head}</h1><div style="font-size:22px">${detail}</div>
      ${mine ? `<div class="stat-grid">
        <div class="stat"><div class="v">+${mine.xp}</div><div class="l">XP</div></div>
        <div class="stat"><div class="v">+${mine.coins}</div><div class="l">Münzen</div></div>
        ${mine.rating ? `<div class="stat"><div class="v">${mine.rating.delta >= 0 ? '+' : ''}${mine.rating.delta}</div><div class="l">Rangpunkte · ${esc(mine.rating.rank)} (${mine.rating.now})</div></div>` : ''}
        ${mine.levelUp ? `<div class="stat"><div class="v">Level ${mine.levelUp}</div><div class="l">Levelaufstieg!</div></div>` : ''}
      </div>
      ${mine.unlocked?.length ? `<div>Freigeschaltet: ${mine.unlocked.map(esc).join(', ')}</div>` : ''}
      ${mine.challenges?.length ? `<div>Herausforderung geschafft: ${mine.challenges.map(esc).join(', ')}</div>` : ''}
      ${mine.bp ? `<div>🎫 Battlepass-Stufe ${mine.bp.tier}${mine.bp.rewards?.length ? ` · Neu: ${mine.bp.rewards.map(esc).join(', ')}` : ''}</div>` : ''}` : ''}
      <div class="score-here"></div>
      <button class="primary back">Zurück zum Menü</button></div>`;
    this.layer.append(box);
    this.scoreOpen = true; this.renderScore();
    const sc = this.$('.h-score'); if (sc) { sc.style.position = 'static'; sc.style.transform = 'none'; sc.style.width = '100%'; box.querySelector('.score-here').append(sc); }
    this.scoreOpen = false;
    box.querySelector('.back').onclick = () => G.leave();
  }
}

function weaponInfo(w) {
  if (!w.dmg) return '';
  return `Schaden ${w.dmg}${w.pellets > 1 ? '×' + w.pellets : ''} · ${w.rpm} Schuss/min · Magazin ${w.mag} · Tempo ${Math.round(w.mob * 100)}% · Kill-Belohnung $${w.reward}`;
}

// Echtes Zielfernrohr-Bild: schwarzer Rand, Linse mit Vignette, dicke Balken und feines Fadenkreuz mit Mil-Dots
function drawScope(cv) {
  const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
  const g = cv.getContext('2d');
  const cx = W / 2, cy = H / 2, R = H * 0.46;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  const hole = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R);
  hole.addColorStop(0, 'rgba(0,0,0,1)'); hole.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hole; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  // Linsen-Vignette und leichter Glanz
  const vig = g.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vig; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  const shine = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, 0, cx - R * 0.35, cy - R * 0.4, R * 0.6);
  shine.addColorStop(0, 'rgba(180,220,255,0.10)'); shine.addColorStop(1, 'rgba(180,220,255,0)');
  g.fillStyle = shine; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  // dicke Balken (enden vor der Mitte)
  g.fillStyle = '#050505';
  const tw = Math.max(5, H * 0.011), gap = R * 0.3;
  g.fillRect(cx - R, cy - tw / 2, R - gap, tw);
  g.fillRect(cx + gap, cy - tw / 2, R - gap, tw);
  g.fillRect(cx - tw / 2, cy + gap, tw, R - gap);
  g.fillRect(cx - tw / 2, cy - R, tw, R - gap);
  // feines Fadenkreuz
  g.fillStyle = 'rgba(0,0,0,0.85)';
  g.fillRect(cx - gap, cy - 0.75, gap * 2, 1.5);
  g.fillRect(cx - 0.75, cy - gap, 1.5, gap * 2);
  for (let i = 1; i <= 4; i++) {
    const d = (gap / 5) * i;
    for (const [x, y] of [[cx + d, cy], [cx - d, cy], [cx, cy + d], [cx, cy - d]]) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); }
  }
  g.fillStyle = 'rgba(255,40,40,0.9)'; g.beginPath(); g.arc(cx, cy, 1.6, 0, Math.PI * 2); g.fill();
}
