// App-Start: Anmeldung, Menü, Verbindung und Wechsel ins Spiel.
import * as THREE from 'three';
import { api, getToken, setToken } from './api.js';
import { net } from './net.js';
import { settings, applyServerSettings } from './settings.js';
import { Menu, toast } from './ui/menu.js';
import { Game } from './game/game.js';
import { audio } from './game/audio.js';
import { MODES } from '/shared/constants.js';
import { installAdminTrigger } from './ui/admin.js';

class App {
  constructor() {
    this.net = net;
    this.menu = new Menu(this);
    this.game = null;
    this.profile = null;
    this.renderer = new THREE.WebGLRenderer({ antialias: settings.graphics.aa, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('gameRoot').append(this.renderer.domElement);
    this.renderer.domElement.style.display = 'none';
    this.wire();
    installAdminTrigger(this);
  }

  async boot() {
    if (!getToken()) return this.menu.showAuth();
    try { await this.afterLogin(); } catch { setToken(null); this.menu.showAuth(); }
  }

  async afterLogin() {
    await this.refreshProfile();
    applyServerSettings(this.profile.settings);
    if (!this.net.connected) this.net.connect();
    this.menu.show('play');
  }

  async refreshProfile() {
    this.profile = await api('/me');
    for (const n of this.profile.notices || []) toast(n, [], 9000);
    return this.profile;
  }

  async logout() {
    try { await api('/logout', { method: 'POST' }); } catch {}
    setToken(null); this.net.close(); this.profile = null;
    this.menu.showAuth();
  }

  wire() {
    const n = this.net;
    n.on('welcome', (m) => { if (!this.game) this.startGame(m); });
    n.on('queue', (m) => { if (m.state === 'found') { this.menu.setQueue({ state: 'idle' }); } else this.menu.setQueue(m); });
    n.on('toast', (m) => toast(m.text));
    n.on('rejoin', () => toast('Verbindung zum laufenden Match wiederhergestellt.'));
    n.on('needPassword', (m) => this.menu.passwordPrompt(m.id));
    n.on('invite', (m) => toast(`${m.from} lädt dich zu ${MODES[m.mode]?.name || 'einem Spiel'} ein`, [['Beitreten', () => { if (this.game) this.game.leave(); this.net.send({ t: 'join', id: m.room, password: m.password }); }]], 15000));
    n.on('friendRequest', (m) => { toast(`Freundschaftsanfrage von ${m.from}`, [['Ansehen', () => this.menu.show('friends')]], 8000); this.refreshProfile().catch(() => {}); });
    n.on('friendUpdate', () => { if (!this.game && this.menu.page === 'friends') this.menu.show('friends'); });
    n.on('presence', () => { if (!this.game && this.menu.page === 'friends') this.menu.show('friends'); });
    n.on('authFail', () => { setToken(null); this.net.close(); this.menu.showAuth(); });
    n.on('profileUpdate', (m) => { toast(`🎁 ${m.text}`); this.refreshProfile().then(() => { if (!this.game) this.menu.refreshChrome(); }).catch(() => {}); });
    n.on('event', (m) => { toast(`🔥 ${m.event.name} gestartet: XP ×${m.event.xp}, Münzen ×${m.event.coins}!`, [], 9000); if (this.profile) { this.profile.event = m.event; if (!this.game) this.menu.refreshChrome(); } });
    n.on('kicked', (m) => { toast(m.reason); this.net.close(); });
    n.on('roomClosed', () => { if (this.game && !this.game.hud.ended) { toast('Der Server wurde geschlossen.'); this.game.dispose(); this.backToMenu(); } });
    n.on('close', () => { if (!this.game) document.title = 'KANTFIRE (verbinde neu …)'; });
    n.on('open', () => { document.title = 'KANTFIRE'; });
  }

  startGame(welcome) {
    this.menu.hide();
    this.menu.setQueue({ state: 'idle' });
    this.renderer.domElement.style.display = 'block';
    try { this.game = new Game(this, welcome); }
    catch (e) { console.error(e); toast('Fehler beim Laden der Map: ' + e.message); this.backToMenu(); }
  }

  async backToMenu() {
    this.game = null;
    this.renderer.domElement.style.display = 'none';
    try { await this.refreshProfile(); } catch {}
    this.menu.show('play');
    audio.startMusic();
  }
}

const app = new App();
window.kf = app; // Debug-Zugriff in der Konsole
app.boot();
