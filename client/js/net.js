// WebSocket-Verbindung mit automatischem Wiederverbinden, Ping-Messung und Snapshot-Lückenzählung.
import { SERVER, getToken } from './api.js';

export class Net {
  constructor() {
    this.handlers = {};
    this.ws = null;
    this.connected = false;
    this.rtt = 0;
    this.lossPct = 0;
    this.retry = 0;
    this.closedByUser = false;
    this.snapTimes = [];
    setInterval(() => this.sendPing(), 1000);
  }
  on(t, fn) { (this.handlers[t] ||= []).push(fn); return () => { this.handlers[t] = this.handlers[t].filter((f) => f !== fn); }; }
  emit(t, m) { for (const f of this.handlers[t] || []) f(m); }

  connect() {
    this.closedByUser = false;
    const url = SERVER.replace(/^http/, 'ws') + '/ws';
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this.retry = 0; this.send({ t: 'auth', token: getToken() }); this.emit('open'); };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'pong') { this.rtt = performance.now() - m.c; }
      if (m.t === 's') this.trackSnap();
      this.emit(m.t, m);
    };
    ws.onclose = () => {
      this.connected = false;
      this.emit('close');
      if (this.closedByUser) return;
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  }
  close() { this.closedByUser = true; this.ws?.close(); }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  sendPing() { this.send({ t: 'ping', c: performance.now() }); }

  // Server sendet 30 Snapshots/s. Fehlende/verspätete Snapshots im letzten 2-s-Fenster ergeben die "Verlust"-Anzeige.
  trackSnap() {
    const now = performance.now();
    this.snapTimes.push(now);
    while (this.snapTimes.length && now - this.snapTimes[0] > 2000) this.snapTimes.shift();
    const expected = 60;
    this.lossPct = Math.max(0, Math.round((1 - this.snapTimes.length / expected) * 100));
  }
}
export const net = new Net();
