// Startet einen Testserver und führt die automatischen Servertests aus: node test/run.js
import { spawn, execSync } from 'child_process';
const env = { ...process.env, PORT: '3999', AUTH_RATE: '1000', DATA_DIR: '/tmp/kf-test-data', LOG_DIR: '/tmp/kf-test-logs', CONFIG_FILE: 'test/config.test.json', LOG_STDOUT: '0' };
execSync('rm -rf /tmp/kf-test-data');
const srv = spawn('node', ['server/index.js'], { env, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 1500));
const run = (args) => new Promise((res) => { const p = spawn('node', args, { stdio: 'inherit' }); p.on('exit', res); });
for (const m of ['comp5', 'comp2', 'gungame', 'zombie', 'sniper']) { console.log(`\n=== Modus ${m}`); await run(['test/smoke.mjs', m, '15000']); }
console.log('\n=== Multiplayer (2 Spieler)'); await run(['test/multiplayer.mjs']);
console.log('\n=== Freunde & Einladungen'); await run(['test/social.mjs']);
srv.kill();
