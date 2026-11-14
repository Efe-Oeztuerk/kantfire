// Verstecktes Admin-Panel. Öffnet sich nur, wenn das geheime Wort irgendwo eingetippt wird
// (Menü, Eingabefeld oder Chat) UND der Server den Account als Admin bestätigt.
// Im Code steht nur der SHA-256-Hash des Worts, nicht das Wort selbst.
import { api } from '../api.js';
import { ITEMS, RARITIES, CRATES, TYPE_NAMES } from '/shared/cosmetics.js';
import { MODES } from '/shared/constants.js';

const SECRET_HASH = 'e3248139ba0122944a8508d5c856473417bbb221a046e4f23242f925f4b13ac0';
const SECRET_LEN = 10;

// kompaktes synchrones SHA-256 (funktioniert auch ohne https)
function sha256(str) {
  const K = [], H = [];
  const isP = (n) => { for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
  for (let n = 2, c = 0; c < 64; n++) if (isP(n)) { if (c < 8) H[c] = (n ** 0.5 % 1) * 2 ** 32 | 0; K[c++] = (n ** (1 / 3) % 1) * 2 ** 32 | 0; }
  const b = [...new TextEncoder().encode(str)], l = b.length * 8;
  b.push(0x80); while (b.length % 64 !== 56) b.push(0);
  for (let i = 7; i >= 0; i--) b.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < b.length; o += 64) {
    const w = [];
    for (let i = 0; i < 64; i++) {
      if (i < 16) w[i] = (b[o + i * 4] << 24) | (b[o + i * 4 + 1] << 16) | (b[o + i * 4 + 2] << 8) | b[o + i * 4 + 3];
      else w[i] = (w[i - 16] + (r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 7] + (r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10))) | 0;
    }
    let [a, bb, c, d, e, f, g, hh] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    [a, bb, c, d, e, f, g, hh].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
  }
  return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}
export const isSecret = (text) => String(text).trim().length === SECRET_LEN && sha256(String(text).trim()) === SECRET_HASH;
const containsSecret = (text) => { const s = String(text); for (let i = 0; i + SECRET_LEN <= s.length; i++) if (isSecret(s.slice(i, i + SECRET_LEN))) return s.slice(i, i + SECRET_LEN); return null; };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let open = null;

// Globale Erkennung: Tastenfolge im Menü und Text in beliebigen Eingabefeldern
export function installAdminTrigger(app) {
  let buf = '';
  document.addEventListener('keydown', (e) => {
    if (app.game || e.key.length !== 1 || e.target?.matches?.('input, textarea')) return;
    buf = (buf + e.key).slice(-SECRET_LEN);
    if (isSecret(buf)) { buf = ''; openAdmin(app); }
  }, true);
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el?.matches?.('input, textarea') || el.closest('.adm') || el.value.length < SECRET_LEN) return;
    const hit = containsSecret(el.value);
    if (hit) { el.value = el.value.replace(hit, ''); openAdmin(app); }
  }, true);
}

export async function openAdmin(app) {
  if (open) return;
  try { await api('/admin/check'); } catch { return; } // kein Admin -> einfach nichts passiert
  const bg = document.createElement('div');
  bg.className = 'modal-bg adm-bg';
  bg.innerHTML = `<div class="modal adm">
    <div class="row adm-head"><h2 class="grow">🛠️ Admin-Panel</h2><button class="x">✕</button></div>
    <div class="row adm-acc"><input class="nm grow" placeholder="Accountname eingeben …" maxlength="16" autocomplete="off"><button class="primary ld">Laden</button></div>
    <div class="adm-tabs row"><button data-tab="acc" class="on">Account</button><button data-tab="rep">Meldungen</button><button data-tab="ov">Übersicht</button><button data-tab="ev">Events & Geschenke</button><button data-tab="ann">Ansage</button></div>
    <div class="adm-body"></div>
  </div>`;
  document.getElementById('overlay').append(bg);
  open = bg;
  const $ = (s) => bg.querySelector(s);
  const body = $('.adm-body');
  let user = null, tab = 'acc';
  const close = () => { bg.remove(); open = null; };
  $('.x').onclick = close;
  bg.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  const msg = (t, ok = true) => { const m = bg.querySelector('.adm-msg'); if (m) { m.textContent = t; m.className = 'adm-msg ' + (ok ? 'ok' : 'err'); } };
  const call = async (path, b) => { try { const r = await api('/admin' + path, b ? { method: 'POST', body: b } : {}); return r; } catch (e) { msg(e.message, false); return null; } };
  const afterChange = async (r, text) => {
    if (!r?.user) return;
    user = r.user; render(); msg('✓ ' + text);
    if (app.profile && user.id === app.profile.id) { try { await app.refreshProfile(); app.menu.refreshChrome?.(); } catch {} }
  };

  const load = async () => {
    const n = $('.nm').value.trim();
    if (!n) return;
    try { user = await api('/admin/user/' + encodeURIComponent(n)); tab = 'acc'; render(); }
    catch (e) { user = null; render(); msg(e.message, false); }
  };
  $('.ld').onclick = load;
  $('.nm').onkeydown = (e) => { if (e.key === 'Enter') load(); };
  bg.querySelectorAll('.adm-tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.tab; render(); });

  const itemOpts = ITEMS.map((i) => `<option value="${i.id}">${esc(i.name)} · ${TYPE_NAMES[i.type]} · ${RARITIES[i.rarity].name}</option>`).join('');

  async function render() {
    bg.querySelectorAll('.adm-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'acc') {
      if (!user) { body.innerHTML = `<p class="muted">Oben einen Accountnamen eingeben und „Laden“ drücken. Tipp: deinen eigenen Namen, um dir selbst etwas zu geben.</p><div class="adm-msg"></div>`; if (app.profile) $('.nm').placeholder = `z. B. ${app.profile.name}`; return; }
      const u = user;
      body.innerHTML = `
        <div class="adm-card row">
          <div class="grow"><b style="font-size:18px">${esc(u.name)}</b> ${u.banned ? '<span class="adm-ban">GESPERRT</span>' : ''}
          <div class="muted">${u.online ? '🟢 ' + esc(u.status) : '⚫ offline'} · Level ${u.level} · ${u.matches} Matches · ${u.kills} Kills</div></div>
          <div class="adm-stats"><span>🪙 ${u.coins}</span><span>📦 ${u.crates?.standard || 0} / 🔫 ${u.crates?.waffen || 0}</span><span>🎫 ${u.bpXp} BP-XP</span><span>🎒 ${u.items}/${u.itemsTotal}</span></div>
        </div>
        <div class="adm-sec"><h4>🪙 Münzen</h4><div class="row wrap">
          ${[1000, 10000, 100000].map((n) => `<button class="q" data-c="${n}">+${n.toLocaleString('de')}</button>`).join('')}
          <input type="number" class="cn" placeholder="Menge (auch minus)" style="width:150px"><button class="primary cg">Geben</button><button class="danger c0">Auf 0</button></div></div>
        <div class="adm-sec"><h4>📦 Truhen</h4><div class="row wrap">
          ${Object.entries(CRATES).map(([id, c]) => `<span class="muted">${esc(c.name)}</span><button class="cr" data-id="${id}" data-n="1">+1</button><button class="cr" data-id="${id}" data-n="10">+10</button>`).join('')}
          <button class="danger cr0">Alle entfernen</button></div></div>
        <div class="adm-sec"><h4>⭐ XP & Battlepass</h4><div class="row wrap">
          <button class="xp" data-n="1000">+1.000 XP</button><button class="xp" data-n="10000">+10.000 XP</button>
          <button class="bp" data-n="700">+1 BP-Stufe</button><button class="bp" data-n="7000">+10 BP-Stufen</button><button class="bp" data-n="21000">Battlepass komplett</button></div></div>
        <div class="adm-sec"><h4>🎨 Skins & Items</h4><div class="row wrap">
          <select class="it grow">${itemOpts}</select><button class="primary ig">Geben</button><button class="ua">Alles freischalten</button></div></div>
        <div class="adm-sec"><h4>🚫 Sperren</h4><div class="row wrap">
          ${u.banned ? `<span class="muted grow">${u.bannedUntil ? 'bis ' + new Date(u.bannedUntil).toLocaleString('de') : 'dauerhaft'} · Grund: ${esc(u.banReason)}</span><button class="primary unb">Entsperren</button>`
            : `<input class="br grow" placeholder="Grund (z. B. Cheating)" maxlength="120">
               <select class="bh"><option value="1">1 Stunde</option><option value="24" selected>24 Stunden</option><option value="72">3 Tage</option><option value="168">7 Tage</option><option value="720">30 Tage</option><option value="0">Dauerhaft</option></select>
               <button class="danger bn">Sperren</button>`}
          ${u.online && u.status === 'Im Spiel' ? '<button class="kk">Aus Match kicken</button>' : ''}</div></div>
        <div class="adm-sec"><h4>✏️ Account</h4><div class="row wrap">
          <input class="rn" placeholder="Neuer Name" maxlength="16" style="width:160px"><button class="rnb">Umbenennen</button>
          <span class="grow"></span><button class="danger rs">Fortschritt zurücksetzen …</button></div></div>
        <div class="adm-msg"></div>`;
      body.querySelector('.rnb').onclick = async () => { const r = await call('/rename', { name: u.name, newName: body.querySelector('.rn').value.trim() }); if (r) { $('.nm').value = r.user.name; await afterChange(r, 'Umbenannt'); } };
      body.querySelector('.rs').onclick = async () => {
        const c = prompt(`Wirklich ALLES von ${u.name} zurücksetzen (Level, Münzen, Items, Statistiken)?\nZum Bestätigen den Namen eintippen:`);
        if (c) afterChange(await call('/resetAccount', { name: u.name, confirm: c }), 'Account zurückgesetzt');
      };
      const grant = async (b, text) => afterChange(await call('/grant', { name: u.name, ...b }), text);
      body.querySelectorAll('.q').forEach((b) => b.onclick = () => grant({ coins: +b.dataset.c }, `+${b.dataset.c} Münzen`));
      body.querySelector('.cg').onclick = () => { const n = Math.trunc(+body.querySelector('.cn').value); if (n) grant({ coins: n }, `${n} Münzen`); };
      body.querySelector('.c0').onclick = async () => afterChange(await call('/reset', { name: u.name, what: 'coins' }), 'Münzen auf 0');
      body.querySelectorAll('.cr').forEach((b) => b.onclick = () => grant({ crates: { [b.dataset.id]: +b.dataset.n } }, `+${b.dataset.n} Truhe(n)`));
      body.querySelector('.cr0').onclick = async () => afterChange(await call('/reset', { name: u.name, what: 'crates' }), 'Truhen entfernt');
      body.querySelectorAll('.xp').forEach((b) => b.onclick = () => grant({ xp: +b.dataset.n }, `+${b.dataset.n} XP`));
      body.querySelectorAll('.bp').forEach((b) => b.onclick = () => grant({ bpXp: +b.dataset.n }, `+${b.dataset.n} Battlepass-XP`));
      body.querySelector('.ig').onclick = () => grant({ items: [body.querySelector('.it').value] }, 'Item gegeben');
      body.querySelector('.ua').onclick = () => grant({ unlockAll: true }, 'Alles freigeschaltet');
      body.querySelector('.bn')?.addEventListener('click', async () => {
        const r = await call('/ban', { name: u.name, ban: true, hours: +body.querySelector('.bh').value, reason: body.querySelector('.br').value || 'Regelverstoß' });
        if (r) { user = r.user; render(); msg(`✓ ${u.name} gesperrt`); }
      });
      body.querySelector('.unb')?.addEventListener('click', async () => { const r = await call('/ban', { name: u.name, ban: false }); if (r) { user = r.user; render(); msg(`✓ ${u.name} entsperrt`); } });
      body.querySelector('.kk')?.addEventListener('click', async () => { if (await call('/kick', { name: u.name })) msg(`✓ ${u.name} gekickt`); });
    } else if (tab === 'rep') {
      body.innerHTML = '<p class="muted">Lade …</p>';
      const list = await call('/reports') || [];
      body.innerHTML = `<div class="row"><span class="grow muted">${list.length} Meldungen (neueste zuerst)</span>${list.length ? '<button class="danger rc">Alle löschen</button>' : ''}</div>
        <div class="adm-list">${list.map((x) => `<div class="adm-rep row"><div class="grow"><b>${esc(x.target)}</b> ${x.targetBanned ? '<span class="adm-ban">GESPERRT</span>' : ''}<div class="muted">von ${esc(x.from)} · ${new Date(x.t).toLocaleString('de')}</div><div>${esc(x.reason) || '<i class="muted">kein Grund</i>'}</div></div><button class="op" data-n="${esc(x.target)}">Öffnen</button></div>`).join('') || '<p class="muted">Keine Meldungen. 🎉</p>'}</div><div class="adm-msg"></div>`;
      body.querySelectorAll('.op').forEach((b) => b.onclick = () => { $('.nm').value = b.dataset.n; load(); });
      body.querySelector('.rc')?.addEventListener('click', async () => { if (await call('/reports/clear', {})) render(); });
    } else if (tab === 'ov') {
      body.innerHTML = '<p class="muted">Lade …</p>';
      const o = await call('/overview');
      if (!o) return;
      const up = `${Math.floor(o.uptime / 3600)} h ${Math.floor(o.uptime % 3600 / 60)} min`;
      body.innerHTML = `<div class="adm-stats big"><span>👥 ${o.accounts} Accounts</span><span>🟢 ${o.online.length} online</span><span>🎮 ${o.rooms.length} Server</span><span>🚫 ${o.banned} gesperrt</span></div>
        <div class="muted" style="margin:6px 0">Speicher: ${esc(o.storage)} · Server läuft seit ${up}</div>
        <h4>Online</h4><div class="adm-list">${o.online.map((p) => `<div class="adm-rep row"><span class="grow"><b>${esc(p.name)}</b> <span class="muted">Lv ${p.level} · ${esc(p.status)}</span></span><button class="op" data-n="${esc(p.name)}">Öffnen</button></div>`).join('') || '<p class="muted">Niemand online.</p>'}</div>
        <h4>Laufende Server</h4><div class="adm-list">${o.rooms.map((r) => `<div class="adm-rep">${esc(r.name)} <span class="muted">· ${esc(MODES[r.mode]?.name || r.mode)} · ${esc(r.map)} · ${r.players}/${r.max}${r.private ? ' · privat' : ''}</span></div>`).join('') || '<p class="muted">Keine.</p>'}</div>`;
      body.querySelectorAll('.op').forEach((b) => b.onclick = () => { $('.nm').value = b.dataset.n; load(); });
    } else if (tab === 'ev') {
      const { event } = await call('/event') || {};
      const opt = (v) => [1, 1.5, 2, 3].map((x) => `<option value="${x}" ${x === v ? 'selected' : ''}>×${x}</option>`).join('');
      body.innerHTML = `<div class="adm-sec" style="border:0"><h4>🔥 Bonus-Event für alle</h4>
          ${event ? `<p>Läuft: <b>${esc(event.name)}</b> · XP ×${event.xp} · Münzen ×${event.coins} · bis ${new Date(event.until).toLocaleString('de')}</p>` : '<p class="muted">Gerade kein Event aktiv.</p>'}
          <div class="row wrap"><input class="evn" placeholder="Name" value="Doppel-XP-Wochenende" maxlength="40" style="width:200px">
          <span class="muted">XP</span><select class="evx">${opt(2)}</select><span class="muted">Münzen</span><select class="evc">${opt(2)}</select>
          <select class="evh"><option value="2">2 Stunden</option><option value="24">24 Stunden</option><option value="48" selected>48 Stunden (Wochenende)</option><option value="168">7 Tage</option></select>
          <button class="primary evs">Starten</button>${event ? '<button class="danger eve">Beenden</button>' : ''}</div></div>
        <div class="adm-sec"><h4>🎁 Geschenk an ALLE Accounts</h4><p class="muted">Online-Spieler sehen es sofort, alle anderen beim nächsten Login.</p>
          <div class="row wrap"><input type="number" class="gc" placeholder="Münzen" style="width:110px">
          <select class="gk"><option value="">keine Truhe</option>${Object.entries(CRATES).map(([id, c]) => `<option value="${id}">${esc(c.name)}</option>`).join('')}</select>
          <input type="number" class="gn" value="1" min="1" max="100" style="width:60px">
          <select class="gi"><option value="">kein Item</option>${itemOpts}</select></div>
          <div class="row" style="margin-top:6px"><input class="gm grow" placeholder="Nachricht (optional), z. B. Danke fürs Spielen!" maxlength="100"><button class="primary gs">Verschenken</button></div></div>
        <div class="adm-msg"></div>`;
      body.querySelector('.evs').onclick = async () => {
        const r = await call('/event', { name: body.querySelector('.evn').value, xp: +body.querySelector('.evx').value, coins: +body.querySelector('.evc').value, hours: +body.querySelector('.evh').value });
        if (r) { await render(); msg('✓ Event gestartet'); app.refreshProfile().then(() => app.menu.refreshChrome?.()).catch(() => {}); }
      };
      body.querySelector('.eve')?.addEventListener('click', async () => { if (await call('/event', { hours: 0 })) { await render(); msg('✓ Event beendet'); app.refreshProfile().then(() => app.menu.refreshChrome?.()).catch(() => {}); } });
      body.querySelector('.gs').onclick = async () => {
        const b = { coins: +body.querySelector('.gc').value || 0, crate: body.querySelector('.gk').value, crateN: +body.querySelector('.gn').value || 1, item: body.querySelector('.gi').value, message: body.querySelector('.gm').value };
        if (!confirm('Wirklich an ALLE Accounts verschenken?')) return;
        const r = await call('/giftAll', b);
        if (r) msg(`✓ An ${r.count} Accounts verschenkt`);
      };
    } else if (tab === 'ann') {
      body.innerHTML = `<p class="muted">Schickt eine Nachricht an alle, die gerade online sind (Popup im Menü + Chat in allen Matches).</p>
        <div class="row"><input class="an grow" maxlength="200" placeholder="z. B. Server-Neustart in 5 Minuten!"><button class="primary as">Senden</button></div><div class="adm-msg"></div>`;
      body.querySelector('.as').onclick = async () => { const r = await call('/announce', { text: body.querySelector('.an').value }); if (r) msg(`✓ An ${r.reached} Spieler gesendet`); };
    }
  }
  render();
  setTimeout(() => $('.nm').focus(), 0);
}
