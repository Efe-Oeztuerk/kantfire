import { register, connect } from './client.js';
const base = 'http://localhost:3999';
const modes = ['comp5', 'gungame', 'zombie', 'sniper', 'comp5', 'gungame'];
const cs = [];
for (let i = 0; i < modes.length; i++) { const c = await connect(base, await register(base, 'load_' + i)); c.send({ t: 'queue', mode: modes[i] }); cs.push(c); setInterval(() => c.send({ t: 'i', s: ++c.seq, k: 0, y: 0, p: 0, rt: c.last.s?.st ?? 0 }), 33); }
await new Promise((r) => setTimeout(r, 15000));
const h = await (await fetch(base + '/health')).json();
console.log('health', JSON.stringify(h));
process.exit(0);
