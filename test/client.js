// Headless-Testclient für Servertests
import WebSocket from 'ws';
export async function register(base, name, pw = 'geheim123') {
  let r = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: pw }) });
  if (r.status === 409) r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: pw }) });
  const j = await r.json(); if (!j.token) throw new Error(JSON.stringify(j)); return j.token;
}
export function connect(base, token) {
  return new Promise((res) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    const c = { ws, msgs: [], last: {}, on: {}, seq: 0 };
    ws.on('message', (d) => { const m = JSON.parse(d); c.last[m.t] = m; if (m.t !== 's') c.msgs.push(m); c.on[m.t]?.(m); if (m.t === 's') (c.snaps ||= []).push(m); });
    ws.on('open', () => { ws.send(JSON.stringify({ t: 'auth', token })); setTimeout(() => res(c), 200); });
    c.send = (m) => ws.send(JSON.stringify(m));
  });
}
