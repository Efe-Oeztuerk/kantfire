// Zwei echte Clients: Lobby per Code, Bewegung sichtbar beim anderen, Treffer + Schaden serverseitig.
import { register, connect } from './client.js';
const base = 'http://localhost:3999';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = await connect(base, await register(base, 'mp_alice'));
const B = await connect(base, await register(base, 'mp_bob'));
A.send({ t: 'create', private: true, mode: 'gungame', map: 'lagerhalle', bots: false });
await sleep(500);
const code = A.last.welcome.room.id;
console.log('Lobby-Code:', code, 'host:', A.last.welcome.host);
B.send({ t: 'join', id: code });
await sleep(500);
console.log('B im Raum:', B.last.welcome?.room.id === code, 'Spieler:', A.last.roster.list.map((p) => p.name).join(', '));
A.send({ t: 'start' });
await sleep(6500); // Countdown
const pump = (c, extra = () => ({})) => setInterval(() => c.send({ t: 'i', s: ++c.seq, k: 0, y: c.yaw || 0, p: c.pitch || 0, rt: c.last.s?.st ?? 0, ...extra() }), 33);
// B läuft vorwärts – A muss die Bewegung sehen
const ia = pump(A);
const ib = pump(B, () => ({ k: 1 }));
const idB = B.last.welcome.you, idA = A.last.welcome.you;
const posInA = () => A.last.s.ps.find((p) => p[0] === idB);
const p0 = posInA(); await sleep(1000); const p1 = posInA();
console.log('A sieht B laufen:', Math.hypot(p1[1] - p0[1], p1[3] - p0[3]).toFixed(2), 'm in 1 s');
clearInterval(ib);
const ib2 = pump(B);
await sleep(300);
// A läuft auf B zu, bis freie Sicht und < 14 m (Sichtlinie mit derselben Welt-Physik prüfen)
const { getMap } = await import('../shared/maps.js');
const { World } = await import('../shared/physics.js');
const world = new World(getMap('lagerhalle'));
clearInterval(ia);
const aimAtB = () => {
  const meA = A.last.s.me, b = posInA();
  const dx = b[1] - meA.x, dz = b[3] - meA.z, dy = (b[2] + 1.1) - (meA.y + 1.62);
  A.yaw = Math.atan2(-dx, -dz); A.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const d = Math.hypot(dx, dy, dz);
  const clear = world.raycast([meA.x, meA.y + 1.62, meA.z], [dx / d, dy / d, dz / d], d).dist >= d - 0.3;
  return { d, clear };
};
const { Nav } = await import('../server/nav.js');
const nav = new Nav(getMap('lagerhalle'), world);
const hpBefore = B.last.s.me.hp;
let hits = 0; A.on.s = (m) => { for (const e of m.ev) if (e.e === 'hit') hits++; };
let info = aimAtB(), n = 0, path = null, pi = 0;
const t0 = Date.now();
while (Date.now() - t0 < 25000 && hits < 2) {
  info = aimAtB();
  n++;
  const me = A.last.s.me, b = posInA();
  let k = 0, yaw = A.yaw, pitch = A.pitch;
  if (info.clear && info.d < 25) k = n % 2 ? 128 : 0; // freie Sicht: stehen und schießen
  else {
    // per A*-Pfad (dieselbe Navigation wie die Bots) auf B zulaufen
    if (!path || n % 30 === 0) { path = nav.path([me.x, me.y, me.z], [b[1], b[2], b[3]]); pi = 1; }
    const nx = path?.[pi];
    if (nx) {
      if (Math.hypot(nx[0] - me.x, nx[2] - me.z) < 0.8 && pi < path.length - 1) pi++;
      yaw = Math.atan2(-(path[pi][0] - me.x), -(path[pi][2] - me.z)); pitch = 0; k = 1;
      if (path[pi][1] - me.y > 0.6) k |= 16;
    }
  }
  A.send({ t: 'i', s: ++A.seq, k, y: yaw, p: pitch, rt: A.last.s.st - 0.1 });
  await sleep(33);
}
clearInterval(ib2);
console.log(`Abstand ${info.d.toFixed(1)} m · Treffer laut Server: ${hits} · B Leben vorher ${hpBefore} -> nachher ${B.last.s.me.hp} (lebt: ${B.last.s.me.al}) · ${hits >= 1 ? 'OK' : 'FEHLGESCHLAGEN'}`);
console.log('A Stufe (Gun Game):', A.last.roster.list.find((p) => p.id === idA).gl);
process.exit(0);
