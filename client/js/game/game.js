// Spielsitzung im Client: Rendering, Eingabe, Vorhersage + Abgleich, Interpolation, Effekte.
import * as THREE from 'three';
import { getMap } from '/shared/maps.js';
import { World, simulate, newMoveState, eyeHeight } from '/shared/physics.js';
import { TICK_DT, INTERP_DELAY, KEY, MODES } from '/shared/constants.js';
import { ITEM_BY_ID } from '/shared/cosmetics.js';
import { WEAPONS, moveMult, sprayOffset, currentSpread, spreadSample, BOLT_ACTION } from '/shared/weapons.js';
import { dirFromAngles, clamp, lerp, angleDiff } from '/shared/util.js';
import { buildWorld, setupLights } from './world.js';
import { makeCharacter, animateCharacter, setCharacterGun, makeGun, Viewmodel, nameSprite } from './models.js';
import { Effects } from './effects.js';
import { audio } from './audio.js';
import { Input } from './input.js';
import { Hud } from '../ui/hud.js';
import { settings, onSettings } from '../settings.js';

export class Game {
  constructor(app, welcome) {
    this.app = app;
    this.net = app.net;
    this.renderer = app.renderer;
    this.welcome = welcome;
    this.me = welcome.you;
    this.modeId = welcome.mode;
    this.cfg = welcome.cfg || {};
    this.roomInfo = welcome.room;
    this.isHost = welcome.host;
    this.started = welcome.started;
    this.map = getMap(welcome.map);
    this.world = new World(this.map);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1000);
    this.scene.add(this.camera);
    this.applyGraphics();
    this.scene.add(buildWorld(this.map, settings.graphics));
    setupLights(this.scene, this.map, settings.graphics);
    this.fx = new Effects(this.scene, settings.graphics.effects);
    this.vm = new Viewmodel();
    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(this);

    this.pred = newMoveState(); this.prevPred = { ...this.pred };
    this.yaw = 0; this.pitch = 0; this.seq = 0; this.pending = []; this.acc = 0;
    this.self = null; this.g = {}; this.roster = new Map();
    this.remotes = new Map();
    this.timeOffset = null;
    this.wantSlot = 1; this.wantG = 0; this.slotChangedAt = 0;
    this.lw = { t: 0, nextFire: 0, drawEnd: 0, shotIdx: 0, lastShot: -9, shots: [], reloadUntil: 0 };
    this.zoom = 0; this.zoomChangedAt = 0;
    this.eyeH = 1.62; this.kickV = 0;
    this.spec = null; this.specIdx = 0; this.deathAt = 0; this.killerId = null;
    this.stepAcc = 0; this.wasGround = true;
    this.nadeMeshes = new Map(); this.dropMeshes = new Map(); this.bombMesh = null; this.beepAt = 0;
    this.lastFrame = performance.now(); this.fps = 0; this.fpsAcc = 0; this.fpsN = 0;
    this.running = true;
    this.offs = [
      this.net.on('s', (m) => this.onSnap(m)),
      this.net.on('roster', (m) => this.onRoster(m)),
      this.net.on('spawn', (m) => this.onSpawn(m)),
      this.net.on('chat', (m) => this.hud.chatLine(m)),
      this.net.on('matchStart', (m) => { this.started = true; this.cfg = m.cfg || this.cfg; this.hud.center('Das Match beginnt!', MODES[this.modeId].name, 2.5); audio.ui('round'); }),
      this.net.on('end', (m) => this.onEnd(m)),
      this.net.on('welcome', (m) => this.onRewelcome(m)),
    ];
    this.input.handlers.key = (code) => this.onKey(code);
    this.input.handlers.wheel = (d) => this.cycleSlot(d);
    this.input.handlers.unlock = () => { if (this.running && !this.hud.modalOpen()) this.hud.openEsc(); };
    this.resize = () => this.onResize();
    addEventListener('resize', this.resize);
    this.unsubSettings = onSettings(() => this.applyGraphics());
    this.onResize();
    audio.init(); audio.stopMusic();
    audio.startAmbient(this.map.theme.indoor ? 'indoor' : this.map.theme.city ? 'city' : 'wind');
    this.hud.show();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.renderer.domElement.addEventListener('click', this.clickLock = () => { if (!this.hud.modalOpen()) this.input.lock(); });
    this.input.lock();
  }

  applyGraphics() {
    if (this.running === false) return;
    const g = settings.graphics;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * g.renderScale);
    this.renderer.shadowMap.enabled = g.shadows !== 'aus';
    if (this.scene.fog) { this.scene.fog.near = g.viewDist * 0.45; this.scene.fog.far = g.viewDist; }
    this.camera.far = Math.max(250, g.viewDist + 60);
    this.camera.updateProjectionMatrix();
    this.onResize?.();
  }
  onResize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  baseVFov() {
    const h = settings.graphics.fov * Math.PI / 180;
    return 2 * Math.atan(Math.tan(h / 2) / this.camera.aspect) * 180 / Math.PI;
  }

  // ---------------------------------------------------------------- Netzwerk
  serverNow() { return performance.now() / 1000 + (this.timeOffset ?? 0); }

  onRewelcome(m) {
    // Reconnect in denselben Raum
    this.me = m.you; this.isHost = m.host; this.started = m.started;
    this.pending = []; this.timeOffset = null;
  }

  onSnap(m) {
    const now = performance.now() / 1000;
    const sample = m.st - now;
    if (this.timeOffset === null || Math.abs(sample - this.timeOffset) > 0.5) this.timeOffset = sample;
    else this.timeOffset += (sample - this.timeOffset) * 0.05;
    this.g = m.g || {};
    const prevSelf = this.self;
    this.self = m.me;
    if (m.me) this.reconcile(m.me, m.a, prevSelf);
    for (const p of m.ps) {
      const [id, x, y, z, yaw, pitch, f, wid, team] = p;
      if (id === this.me) continue;
      let r = this.remotes.get(id);
      if (!r) r = this.addRemote(id);
      r.buf.push({ t: m.st, x, y, z, yaw, pitch, f, wid, team });
      if (r.buf.length > 30) r.buf.shift();
      r.seen = m.st;
    }
    for (const [id, r] of this.remotes) if (r.seen !== m.st) { this.removeRemote(id); }
    this.syncNades(m.n || []);
    this.syncDrops(m.d || []);
    for (const e of m.ev) this.onEvent(e);
  }

  reconcile(me, ack, prev) {
    if (prev && prev.al && !me.al) { this.deathAt = performance.now(); this.vm.set(null); }
    if (!me.al) { this.pending = []; return; }
    if (prev && !prev.al && me.al) { this.spec = null; }
    // Server-Zustand übernehmen und noch nicht bestätigte Eingaben erneut simulieren
    const s = { x: me.x, y: me.y, z: me.z, vx: me.vx, vy: me.vy, vz: me.vz, g: !!me.g, c: !!me.c };
    this.pending = this.pending.filter((p) => p.s > ack);
    const w = this.currentWeapon();
    const opts = { speedMult: moveMult(w, this.zoom, me.sm), frozen: this.frozenFlag(), noSprint: this.zoom > 0 };
    for (const p of this.pending) simulate(s, p, TICK_DT, this.world, { ...opts, frozen: this.frozenFlag(p) });
    const err = Math.hypot(s.x - this.pred.x, s.y - this.pred.y, s.z - this.pred.z);
    if (err > 0.001) {
      // kleine Abweichungen weich korrigieren, große sofort
      if (err < 0.3) { this.prevPred.x += s.x - this.pred.x; this.prevPred.y += s.y - this.pred.y; this.prevPred.z += s.z - this.pred.z; }
      Object.assign(this.pred, s);
      if (err >= 0.3) Object.assign(this.prevPred, s);
    }
    this.lw.shots = this.lw.shots.filter((x) => x > ack);
    // Server-Waffe übernehmen, wenn lokal länger nicht gewechselt wurde
    if (performance.now() - this.slotChangedAt > 600 && me.cur !== this.wantSlot) { this.wantSlot = me.cur; this.wantG = me.gi; }
    if (performance.now() - this.zoomChangedAt > 400 && me.zoom !== this.zoom) this.zoom = me.zoom;
    if (me.rl > 0 && this.lw.reloadUntil < this.lw.t) { this.lw.reloadUntil = this.lw.t + me.rl; const w2 = this.currentWeapon(); if (w2) { this.vm.reload(me.rl); audio.reload(null); } }
  }

  onSpawn(m) {
    Object.assign(this.pred, { x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, g: true, c: false });
    Object.assign(this.prevPred, this.pred);
    this.yaw = m.yaw; this.pitch = 0; this.pending = [];
    this.spec = null; this.zoom = 0;
    this.lw.shots = []; this.lw.reloadUntil = 0;
  }

  onRoster(m) {
    this.isHost = m.host; this.started = m.started;
    this.roster = new Map(m.list.map((p) => [p.id, p]));
    for (const [id, r] of this.remotes) this.refreshRemoteLook(r, this.roster.get(id));
    this.hud.rosterChanged();
  }

  addRemote(id) {
    const r = { id, buf: [], model: null, look: null, stepAcc: 0, lastPos: null, wasGround: true, wasReload: false, tag: null };
    this.remotes.set(id, r);
    this.refreshRemoteLook(r, this.roster.get(id));
    return r;
  }
  refreshRemoteLook(r, info) {
    const team = info?.team || 'N', zombie = !!info?.z;
    const key = JSON.stringify(info?.lo) + team + zombie;
    if (r.look === key) return;
    r.look = key;
    if (r.model) this.scene.remove(r.model);
    r.model = makeCharacter(info?.lo, team, zombie);
    r.model.userData.finishes = info?.lo?.finishes || {};
    this.scene.add(r.model);
    r.model.userData.gunId = null;
    if (r.tag) r.tag = null;
    const myTeam = this.self?.team;
    const mate = MODES[this.modeId].teams && team === myTeam && team !== 'N';
    if (info && mate) { r.tag = info.adm ? nameSprite('👑 ' + info.name, '#ffc83a') : nameSprite(info.name); r.tag.position.y = 2.15; r.model.add(r.tag); }
  }
  removeRemote(id) {
    const r = this.remotes.get(id);
    if (r?.model) this.scene.remove(r.model);
    this.remotes.delete(id);
  }

  // ---------------------------------------------------------------- Ereignisse
  onEvent(e) {
    const P = (x, y, z) => [x, y, z];
    switch (e.e) {
      case 'shot': {
        if (e.id === this.me) {
          for (const h of e.h) if (!h[3] && h[4]) this.fx.impact([h[0], h[1], h[2]], decodeN(h[4]));
          break;
        }
        const w = WEAPONS[e.w];
        audio.gun(w?.cat, e.o, e.w);
        this.fx.muzzle(e.o);
        for (const h of e.h) {
          this.fx.tracer(e.o, [h[0], h[1], h[2]]);
          if (!h[3]) this.fx.impact([h[0], h[1], h[2]], h[4] ? decodeN(h[4]) : null);
        }
        break;
      }
      case 'dry': audio.dry(); break;
      case 'hit': {
        this.hud.hitmarker(e.z === 'head', e.kill);
        audio.hit(e.z === 'head');
        if (settings.gameplay.dmgNumbers) {
          const v = new THREE.Vector3(e.x, e.y, e.zz).project(this.camera);
          if (v.z < 1) this.hud.damageNumber((v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, e.dmg, e.z === 'head');
        }
        break;
      }
      case 'hurt': {
        audio.hurt();
        this.hud.hurt(e.from != null ? angleDiff(this.yaw, e.from) : null, e.dmg);
        this.kickV += 0.02;
        break;
      }
      case 'blood': if (this.camera.position.distanceTo(new THREE.Vector3(e.x, e.y, e.z)) > 1.6) this.fx.blood([e.x, e.y, e.z], e.h); break;
      case 'kill': {
        this.hud.killfeed(e);
        if (e.k === this.me && e.v !== this.me) audio.kill();
        if (e.v === this.me) { this.killerId = e.k; }
        break;
      }
      case 'swing': if (e.id !== this.me) audio.swing(this.remotePos(e.id)); break;
      case 'throw': if (e.id !== this.me) audio.swing(this.remotePos(e.id)); break;
      case 'bounce': audio.bounce(P(e.x, e.y, e.z)); break;
      case 'boom': this.fx.explosion([e.x, e.y, e.z], e.r); audio.boom([e.x, e.y, e.z]); this.shake = 0.4; break;
      case 'smoke': this.fx.smoke([e.x, e.y, e.z], e.r, e.d); audio.smoke([e.x, e.y, e.z]); break;
      case 'planting': audio.plantTick([e.x, e.y, e.z]); if (this.self?.team === 'C') this.hud.sub('Die Bombe wird platziert!', 2); break;
      case 'defusing': audio.plantTick([e.x, e.y, e.z]); if (this.self?.team === 'T') this.hud.sub('Die Bombe wird entschärft!', 2); break;
      case 'planted': this.hud.center('Bombe platziert', `Platz ${e.site}`, 2.5); audio.beep([e.x, e.y, e.z]); break;
      case 'defused': this.hud.center('Bombe entschärft', '', 2.5); break;
      case 'round': {
        const mine = this.self?.team === e.w;
        const why = { elim: 'Alle Gegner eliminiert', bomb: 'Die Bombe ist explodiert', defuse: 'Die Bombe wurde entschärft', time: 'Zeit abgelaufen' }[e.r] || '';
        const mvp = e.mvp != null ? this.roster.get(e.mvp)?.name : null;
        this.hud.center(`${e.w === 'T' ? 'Angreifer' : 'Verteidiger'} gewinnen die Runde`, why + (mvp ? ` · MVP: ${mvp}` : ''), 4, mine ? 'win' : 'lose');
        audio.ui(mine ? 'round' : 'lose');
        break;
      }
      case 'roundStart': this.fx.clearSmokes(); if (this.g.ph === 'freeze') this.hud.center(`Runde ${e.r}`, 'Kaufphase – Taste ' + keyLabel('buy') + ' zum Kaufen', 2.5); else this.hud.center(`Runde ${e.r}`, '', 2); break;
      case 'go': this.hud.sub('Los geht\'s!', 1.5); audio.ui('click'); break;
      case 'levelUp': this.hud.sub(`Level ${e.lvl + 1}: ${WEAPONS[e.w]?.name}`, 2); audio.ui('level'); break;
      case 'points': this.hud.sub(`+${e.n}${e.hs ? ' (Kopfschuss)' : ''}`, 1.2); break;
      case 'outbreak': this.hud.center('Ausbruch!', 'Die Infektion hat begonnen', 2.5); audio.ui('lose'); break;
      case 'infect': this.fx.burst([e.x, e.y + 1, e.z], 0x6f9a52, 20, 3, 0.1, 0.7); break;
      case 'zround': this.hud.center(e.w === 'humans' ? 'Die Überlebenden gewinnen' : 'Die Zombies gewinnen', '', 4, (e.w === 'humans') === (this.self?.team === 'C') ? 'win' : 'lose'); break;
      case 'bought': audio.ui('buy'); break;
      case 'emote': {
        const anim = ITEM_BY_ID[e.em]?.anim || 'wave';
        if (e.id === this.me) this.myEmote = { anim, start: performance.now() };
        else { const r = this.remotes.get(e.id); if (r) r.emote = { anim, start: performance.now() }; }
        break;
      }
      case 'pickup': audio.ui('click'); break;
      case 'bombDrop': this.hud.sub('Die Bombe wurde fallen gelassen!', 2); break;
      case 'bombPick': this.hud.sub('Die Bombe wurde aufgehoben.', 1.5); break;
    }
  }

  remotePos(id) { const r = this.remotes.get(id); const s = r?.buf[r.buf.length - 1]; return s ? [s.x, s.y + 1.4, s.z] : null; }

  syncNades(list) {
    const seen = new Set();
    for (const [id, type, x, y, z] of list) {
      seen.add(id);
      let m = this.nadeMeshes.get(id);
      if (!m) { m = makeGun(type, 'f_stock', false); this.scene.add(m); this.nadeMeshes.set(id, m); }
      m.position.set(x, y, z);
    }
    for (const [id, m] of this.nadeMeshes) if (!seen.has(id)) { this.scene.remove(m); this.nadeMeshes.delete(id); }
  }
  syncDrops(list) {
    const seen = new Set();
    for (const [id, wid, x, y, z] of list) {
      seen.add(id);
      let m = this.dropMeshes.get(id);
      if (!m) { m = makeGun(wid, 'f_stock', false); m.rotation.set(0, Math.random() * 6, Math.PI / 2); this.scene.add(m); this.dropMeshes.set(id, m); }
      m.position.set(x, y + 0.08, z);
    }
    for (const [id, m] of this.dropMeshes) if (!seen.has(id)) { this.scene.remove(m); this.dropMeshes.delete(id); }
  }

  // ---------------------------------------------------------------- Waffen (Client-Sicht)
  slotInst(slot) {
    const s = this.self;
    if (!s) return null;
    if (slot === 3) { const id = s.gr[this.wantG] ?? s.gr[0]; return id ? { id, mag: 1, res: 0 } : null; }
    const w = s.w.find((x) => x[0] === slot);
    return w ? { id: w[1], mag: w[2], res: w[3] } : null;
  }
  currentInst() { return this.slotInst(this.wantSlot) || this.slotInst(this.self?.cur); }
  currentWeapon() { const i = this.currentInst(); return i ? WEAPONS[i.id] : null; }
  predictedMag() { const i = this.currentInst(); return i ? Math.max(0, i.mag - this.lw.shots.length) : 0; }

  selectSlot(slot) {
    if (!this.self?.al) return;
    if (slot === 3) {
      if (!this.self.gr.length) return;
      if (this.wantSlot === 3) this.wantG = (this.wantG + 1) % this.self.gr.length; else this.wantG = 0;
    } else if (!this.slotInst(slot) || slot === this.wantSlot) return;
    this.wantSlot = slot;
    this.slotChangedAt = performance.now();
    this.zoom = 0; this.zoomChangedAt = performance.now();
    const w = this.currentWeapon();
    this.lw.drawEnd = this.lw.t + (w?.draw ?? 0.5);
    this.lw.reloadUntil = 0;
    audio.ui('click');
  }
  cycleSlot(d) {
    if (!this.self) return;
    const order = [0, 1, 2, 3, 4].filter((s) => this.slotInst(s));
    if (!order.length) return;
    let i = order.indexOf(this.wantSlot);
    i = (i + (d > 0 ? 1 : -1) + order.length) % order.length;
    this.selectSlot(order[i]);
  }

  onKey(code) {
    const k = settings.controls.keys;
    if (this.hud.chatOpen) return;
    if (code === k.slot1) this.selectSlot(0);
    else if (code === k.slot2) this.selectSlot(1);
    else if (code === k.slot3) this.selectSlot(2);
    else if (code === k.slot4) this.selectSlot(3);
    else if (code === k.slot5) this.selectSlot(4);
    else if (code === k.buy) this.hud.toggleBuy();
    else if (code === k.chat) this.hud.openChat(false);
    else if (code === k.teamchat) this.hud.openChat(true);
    else if (code === k.inspect) { if (this.self?.al) this.vm.inspect(); }
    else if (code === k.emote) { if (this.self?.al) this.net.send({ t: 'emote' }); }
    else if (code === k.fire && this.self && !this.self.al) this.nextSpec(1);
    else if (code === k.alt && this.self && !this.self.al) this.nextSpec(-1);
  }

  frozenFlag(inp) {
    const ph = this.g.ph;
    if (ph === 'freeze' || ph === 'countdown') return true;
    const k = inp ? inp.k : 0;
    return !!(this.self?.act && (k & KEY.USE));
  }

  // ---------------------------------------------------------------- Fester Tick (30 Hz)
  tick() {
    const s = this.self;
    this.lw.t += TICK_DT;
    const recent = performance.now() - this.slotChangedAt < 800;
    const inp = { t: 'i', s: ++this.seq, k: 0, y: this.yaw, p: this.pitch, w: recent ? this.wantSlot : undefined, g: recent ? this.wantG : undefined, rt: Math.round((this.serverNow() - INTERP_DELAY) * 1000) / 1000 };
    const active = this.input.locked && !this.hud.chatOpen;
    const I = this.input;
    if (!this.hud.chatOpen) {
      if (I.is('forward')) inp.k |= KEY.F; if (I.is('back')) inp.k |= KEY.B;
      if (I.is('left')) inp.k |= KEY.L; if (I.is('right')) inp.k |= KEY.R;
      if (I.is('jump')) inp.k |= KEY.JUMP; if (I.is('crouch')) inp.k |= KEY.CROUCH;
      if (I.is('walk')) inp.k |= KEY.WALK; if (I.is('sprint')) inp.k |= KEY.SPRINT; if (I.is('reload')) inp.k |= KEY.RELOAD;
      if (I.is('use')) inp.k |= KEY.USE; if (I.is('drop')) inp.k |= KEY.DROP;
    }
    if (active && I.is('fire')) inp.k |= KEY.FIRE;
    if (active && I.is('alt')) inp.k |= KEY.ALT;
    this.net.send(inp);
    if (!s || !s.al) { this.prevKeys = inp.k; return; }
    this.pending.push(inp);
    if (this.pending.length > 120) this.pending.shift();
    Object.assign(this.prevPred, this.pred);
    const w = this.currentWeapon();
    const wasG = this.pred.g, vyBefore = this.pred.vy;
    simulate(this.pred, inp, TICK_DT, this.world, { speedMult: moveMult(w, this.zoom, s.sm), frozen: this.frozenFlag(inp), noSprint: this.zoom > 0 });
    // eigene Schritte / Sprünge
    const sp = Math.hypot(this.pred.vx, this.pred.vz);
    if (this.pred.g && sp > 3 && !(inp.k & KEY.WALK) && !this.pred.c) {
      this.stepAcc += sp * TICK_DT;
      if (this.stepAcc > 2.1) { this.stepAcc = 0; audio.step(this.groundMat(this.pred), null, true); }
    }
    if (wasG && !this.pred.g && this.pred.vy > 1) audio.jump(null, true);
    if (!wasG && this.pred.g && vyBefore < -6) audio.land(null, true);
    this.predictWeapon(inp, w);
    this.prevKeys = inp.k;
  }

  predictWeapon(inp, w) {
    const k = inp.k, prev = this.prevKeys || 0, lw = this.lw;
    if (!w) return;
    if ((k & KEY.ALT) && !(prev & KEY.ALT) && w.scope && lw.t >= lw.drawEnd) { this.zoom = (this.zoom + 1) % (w.scope.length + 1); this.zoomChangedAt = performance.now(); }
    if ((k & KEY.RELOAD) && !(prev & KEY.RELOAD)) this.zoom = 0;
    if (!(k & KEY.FIRE)) return;
    if (!w.auto && (prev & KEY.FIRE) && !w.melee) return;
    if (lw.t < lw.nextFire || lw.t < lw.drawEnd || lw.t < lw.reloadUntil) return;
    if (this.g.ph === 'freeze' || this.g.ph === 'countdown') return;
    if (w.melee) { lw.nextFire = lw.t + 60 / w.rpm; this.vm.melee(); audio.swing(null); return; }
    if (w.cat === 'grenade') { lw.nextFire = lw.t + 1; this.vm.melee(); return; }
    if (w.cat === 'bomb') return;
    if (this.predictedMag() <= 0) return;
    lw.nextFire = lw.t + 60 / w.rpm;
    lw.shots.push(inp.s);
    const gap = lw.t - lw.lastShot;
    if (gap > w.recover) lw.shotIdx = 0; else lw.shotIdx = Math.max(0, lw.shotIdx - Math.floor(gap / 0.12));
    const [spP, spY] = sprayOffset(w, lw.shotIdx);
    lw.shotIdx++; lw.lastShot = lw.t;
    const spread = currentSpread(w, { speed: Math.hypot(this.pred.vx, this.pred.vz), air: !this.pred.g, crouch: this.pred.c, scoped: this.zoom > 0 });
    const eye = [this.pred.x, this.pred.y + eyeHeight(this.pred.c), this.pred.z];
    const muzzle = this.muzzleWorld(eye);
    for (let i = 0; i < w.pellets; i++) {
      const [ox, oy] = spreadSample(spread, this.me, inp.s, i);
      const d = dirFromAngles(this.yaw + spY + ox, clamp(this.pitch + spP + oy, -1.56, 1.56));
      const r = this.world.raycast(eye, d, w.range);
      const end = [eye[0] + d[0] * r.dist, eye[1] + d[1] * r.dist, eye[2] + d[2] * r.dist];
      if (i < 3) this.fx.tracer(muzzle, end);
    }
    this.vm.fire();
    this.fx.flashLight(muzzle, 4);
    audio.gun(w.cat, null, w.id);
    this.kickV += w.kick * 0.6;
    if (BOLT_ACTION.has(w.id)) { this.zoom = 0; this.zoomChangedAt = performance.now(); }
  }

  muzzleWorld(eye) {
    const d = dirFromAngles(this.yaw, this.pitch);
    const right = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
    return [eye[0] + d[0] * 0.6 + right[0] * 0.15, eye[1] + d[1] * 0.6 - 0.12, eye[2] + d[2] * 0.6 + right[2] * 0.15];
  }

  groundMat(p) {
    if (this.map.theme.ground === 'sand') {
      const r = this.world.raycast([p.x, p.y + 0.1, p.z], [0, -1, 0], 0.4);
      return r.mat === 'floor' ? 'sand' : r.mat;
    }
    return this.world.raycast([p.x, p.y + 0.1, p.z], [0, -1, 0], 0.4).mat || 'floor';
  }

  // ---------------------------------------------------------------- Zuschauen
  specCandidates() {
    const team = this.self?.team;
    const teams = MODES[this.modeId].teams && this.modeId !== 'zombie';
    return [...this.remotes.values()].filter((r) => {
      const last = r.buf[r.buf.length - 1];
      return last && (last.f & 1) && (!teams || last.team === team);
    });
  }
  nextSpec(d) {
    const c = this.specCandidates();
    if (!c.length) return;
    this.specIdx = (this.specIdx + d + c.length) % c.length;
    this.spec = c[this.specIdx].id;
  }

  // ---------------------------------------------------------------- Frame
  loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const lim = settings.graphics.fpsLimit;
    if (lim > 0 && now - this.lastFrame < 1000 / lim - 0.5) return;
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }

    // Maus -> Blickrichtung (sofort, unabhängig vom Tick)
    const [mx, my] = this.input.takeMouse();
    const w = this.currentWeapon();
    let sens = settings.controls.sens * 0.0022;
    if (this.zoom > 0 && w?.scope) {
      const ratio = Math.tan((w.scope[this.zoom - 1] * Math.PI / 180) / 2) / Math.tan((this.baseVFov() * Math.PI / 180) / 2);
      sens *= ratio * (w.cat === 'sniper' || w.cat === 'dmr' ? settings.controls.scopeSens : settings.controls.adsSens);
    }
    this.yaw -= mx * sens;
    this.pitch = clamp(this.pitch - my * sens * (settings.controls.invert ? -1 : 1), -1.55, 1.55);

    if (this.self) {
      this.acc += dt;
      while (this.acc >= TICK_DT) { this.acc -= TICK_DT; this.tick(); }
    }
    this.render(dt, mx, my);
    this.input.endFrame();
  }

  render(dt, mx, my) {
    const s = this.self;
    const alpha = this.acc / TICK_DT;
    const renderT = this.serverNow() - INTERP_DELAY;
    // andere Spieler interpolieren
    for (const r of this.remotes.values()) this.updateRemote(r, renderT, dt);
    // Kamera
    this.kickV = Math.max(0, this.kickV - dt * 0.35 - this.kickV * dt * 8);
    let camPos, yaw = this.yaw, pitch = this.pitch + this.kickV;
    if (s && s.al) {
      const p = this.pred, q = this.prevPred;
      const targetEye = eyeHeight(p.c);
      this.eyeH += (targetEye - this.eyeH) * Math.min(1, dt * 14);
      camPos = [lerp(q.x, p.x, alpha), lerp(q.y, p.y, alpha) + this.eyeH, lerp(q.z, p.z, alpha)];
    } else if (s) {
      // Zuschauer- oder Todeskamera
      if (performance.now() - this.deathAt > 1800 && (this.spec == null || !this.remotes.get(this.spec)?.vis)) this.nextSpec(1);
      const r = this.spec != null ? this.remotes.get(this.spec) : null;
      if (r && r.vis && performance.now() - this.deathAt > 1800) {
        const st = r.vis;
        const d = dirFromAngles(st.yaw, st.pitch * 0.6);
        const eye = [st.x, st.y + 1.6, st.z];
        const back = this.world.raycast(eye, [-d[0], -d[1] * 0.3 + 0.15, -d[2]], 3);
        const dist = Math.max(0.3, back.dist - 0.3);
        camPos = [eye[0] - d[0] * dist, eye[1] + (0.15 - d[1] * 0.3) * dist, eye[2] - d[2] * dist];
        yaw = st.yaw; pitch = st.pitch * 0.6;
      } else {
        camPos = [this.pred.x, this.pred.y + 0.6, this.pred.z];
        const k = this.killerId != null ? this.remotes.get(this.killerId)?.vis : null;
        if (k) { yaw = Math.atan2(-(k.x - camPos[0]), -(k.z - camPos[2])); pitch = Math.atan2(k.y + 1 - camPos[1], Math.hypot(k.x - camPos[0], k.z - camPos[2])); }
      }
    } else camPos = [0, 20, 0];
    // eigenes Emote: kurz in die Außenansicht wechseln
    const em = this.myEmote;
    const moving = this.input.is('forward') || this.input.is('back') || this.input.is('left') || this.input.is('right') || this.input.is('fire') || this.input.is('jump');
    let emoteView = false;
    if (em && s?.al && !moving && (performance.now() - em.start) / 1000 < 2.8) {
      emoteView = true;
      if (!this.selfModel || this.selfModelKey !== JSON.stringify(this.app.profile?.loadout) + s.team) {
        if (this.selfModel) this.scene.remove(this.selfModel);
        this.selfModel = makeCharacter(this.app.profile?.loadout, s.team);
        this.selfModelKey = JSON.stringify(this.app.profile?.loadout) + s.team;
        this.scene.add(this.selfModel);
      }
      const base = [camPos[0], camPos[1] - this.eyeH, camPos[2]];
      this.selfModel.visible = true;
      this.selfModel.position.set(base[0], base[1], base[2]);
      this.selfModel.rotation.y = this.yaw;
      animateCharacter(this.selfModel, { speed: 0, alive: true, ground: true, dt, pitch: 0, emote: { anim: em.anim, t: (performance.now() - em.start) / 1000 } });
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const want = [base[0] + fx * 3.2, base[1] + 1.7, base[2] + fz * 3.2];
      const d = [want[0] - base[0], want[1] - base[1] - 1.2, want[2] - base[2]], dl = Math.hypot(...d);
      const hit = this.world.raycast([base[0], base[1] + 1.2, base[2]], d.map((v) => v / dl), dl);
      const k = Math.max(0.3, (hit.dist - 0.3) / dl);
      camPos = [base[0] + d[0] * k, base[1] + 1.2 + d[1] * k, base[2] + d[2] * k];
      yaw = Math.atan2(-(base[0] - camPos[0]), -(base[2] - camPos[2]));
      pitch = Math.atan2(base[1] + 1.1 - camPos[1], Math.hypot(base[0] - camPos[0], base[2] - camPos[2]));
    } else {
      if (this.selfModel) this.selfModel.visible = false;
      if (em && (moving || (performance.now() - em.start) / 1000 >= 2.8)) this.myEmote = null;
    }
    if (this.shake > 0) { this.shake -= dt; camPos[0] += (Math.random() - 0.5) * this.shake * 0.3; camPos[1] += (Math.random() - 0.5) * this.shake * 0.3; }
    this.camera.position.set(camPos[0], camPos[1], camPos[2]);
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
    // Sichtfeld / Zielfernrohr
    const scoped = s?.al && this.zoom > 0 && w2(this);
    const fov = scoped ? w2(this).scope[this.zoom - 1] : this.baseVFov();
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const sniperScope = scoped && ['sniper', 'dmr'].includes(w2(this).cat);
    // Viewmodel
    if (s?.al) {
      const inst = this.currentInst();
      this.vm.set(inst?.id, this.app.profile?.loadout?.finishes?.[inst?.id] || 'f_stock', this.app.profile?.loadout?.gloves);
    }
    const spd = Math.hypot(this.pred.vx, this.pred.vz);
    this.vm.update(dt, { aspect: this.camera.aspect, speed: spd, ground: this.pred.g, mouseX: mx, mouseY: my, scoped: sniperScope || !s?.al || emoteView, sprint: spd > 5.6 * (this.currentWeapon()?.mob || 1) * 1.12 && this.pred.g, moving: spd > 0.5 });
    // Bombe
    this.updateBomb(dt);
    this.fx.update(dt);
    // Audio-Hörer
    const fwd = dirFromAngles(yaw, pitch);
    audio.setListener(camPos, fwd);
    // Zeichnen
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    if (s?.al && !sniperScope && !emoteView) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.vm.scene, this.vm.camera);
    }
    this.hud.frame(dt, { scoped: sniperScope });
  }

  updateRemote(r, t, dt) {
    const b = r.buf;
    if (!b.length) return;
    let a = b[0], c = b[b.length - 1];
    if (t <= a.t) c = a;
    else if (t >= c.t) a = c;
    else for (let i = b.length - 1; i > 0; i--) if (b[i - 1].t <= t) { a = b[i - 1]; c = b[i]; break; }
    const k = c.t > a.t ? (t - a.t) / (c.t - a.t) : 1;
    const st = {
      x: lerp(a.x, c.x, k), y: lerp(a.y, c.y, k), z: lerp(a.z, c.z, k),
      yaw: a.yaw + angleDiff(a.yaw, c.yaw) * k, pitch: lerp(a.pitch, c.pitch, k), f: c.f, wid: c.wid, team: c.team,
    };
    const prev = r.vis;
    r.vis = st;
    const m = r.model;
    if (!m) return;
    m.position.set(st.x, st.y, st.z);
    m.rotation.y = st.yaw;
    const alive = !!(st.f & 1), ground = !!(st.f & 4);
    let speed = 0;
    if (prev) speed = Math.hypot(st.x - prev.x, st.z - prev.z) / Math.max(dt, 1e-3);
    setCharacterGun(m, alive ? st.wid : null, m.userData.finishes?.[st.wid]);
    let emote = null;
    if (r.emote) { const t = (performance.now() - r.emote.start) / 1000; if (t < 2.8 && speed < 1) emote = { anim: r.emote.anim, t }; else r.emote = null; }
    animateCharacter(m, { speed, crouch: !!(st.f & 2), pitch: st.pitch, alive, ground, dt, action: st.f & (64 | 128), emote });
    m.visible = alive || m.userData.deadT < 1 || true;
    if (r.tag) r.tag.visible = alive;
    // Geräusche aus der Bewegung ableiten
    if (alive && prev) {
      if (ground && speed > 3 && !(st.f & 256) && !(st.f & 2)) {
        r.stepAcc += speed * dt;
        if (r.stepAcc > 2.1) { r.stepAcc = 0; audio.step(this.groundMat(st), [st.x, st.y, st.z]); }
      }
      if (r.wasGround && !ground && st.y > prev.y) audio.jump([st.x, st.y, st.z]);
      if (!r.wasGround && ground) audio.land([st.x, st.y, st.z]);
      const rel = !!(st.f & 512);
      if (rel && !r.wasReload) audio.reload([st.x, st.y + 1.3, st.z]);
      r.wasReload = rel;
    }
    r.wasGround = ground;
    // Spawnschutz sichtbar machen (Blinken)
    m.userData.body.visible = !((st.f & 32) && Math.floor(performance.now() / 150) % 2);
  }

  updateBomb(dt) {
    const b = this.g?.b;
    const state = b?.[0];
    if (state === 'planted' || state === 'dropped') {
      if (!this.bombMesh) { this.bombMesh = makeGun('bomb'); this.scene.add(this.bombMesh); }
      this.bombMesh.position.set(b[1], b[2] + 0.07, b[3]);
      if (state === 'planted') {
        const rem = b[5];
        const interval = clamp(rem / 40, 0.1, 1);
        const now = performance.now() / 1000;
        if (now >= this.beepAt) { this.beepAt = now + interval; audio.beep([b[1], b[2] + 0.3, b[3]]); if (this.bombMesh.userData.led) this.bombMesh.userData.led.visible = true; }
        else if (this.bombMesh.userData.led) this.bombMesh.userData.led.visible = now - (this.beepAt - interval) < 0.08;
      }
    } else if (this.bombMesh) { this.scene.remove(this.bombMesh); this.bombMesh = null; }
  }

  modeArmor() { return (this.modeId === 'comp5' || this.modeId === 'comp2') && this.started; }
  canBuyNow() {
    const s = this.self, g = this.g;
    if (!s?.al || !this.modeArmor()) return false;
    if (!(g.ph === 'freeze' || (g.ph === 'live' && g.be > 0))) return false;
    const z = this.map.buyZones[s.team];
    return !z || (this.pred.x >= z.min[0] && this.pred.x <= z.max[0] && this.pred.z >= z.min[1] && this.pred.z <= z.max[1]);
  }

  // ---------------------------------------------------------------- Ende
  onEnd(m) {
    this.input.unlock();
    this.hud.endScreen(m);
  }

  leave() {
    this.net.send({ t: 'leave' });
    this.dispose();
    this.app.backToMenu();
  }

  dispose() {
    if (!this.running) return;
    this.running = false;
    this.offs.forEach((f) => f());
    this.input.unlock();
    this.input.dispose();
    removeEventListener('resize', this.resize);
    this.renderer.domElement.removeEventListener('click', this.clickLock);
    this.hud.dispose();
    audio.stopAmbient();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.renderer.renderLists.dispose();
  }
}

function w2(game) { return game.currentWeapon(); }
function decodeN(s) {
  if (!s) return null;
  const m = s.match(/-?\d/g);
  return m ? m.map(Number) : null;
}
function keyLabel(a) { return settings.controls.keys[a]?.replace('Key', '') || a; }
