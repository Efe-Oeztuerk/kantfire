// Einstiegspunkt: HTTP-Server (Webclient + API) und WebSocket-Spielserver in einem Prozess.
import http from 'http';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import * as db from './db.js';
import { Hub } from './hub.js';
import { api } from './api.js';
import { CONFIG } from './config.js';
import { adminApi } from './admin.js';
import { log } from './security.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);

await db.load();
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  // erlaubt einen getrennt gehosteten Client (z. B. Vercel) – Ursprung über ALLOWED_ORIGIN einschränken
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const server = http.createServer(app);
const hub = new Hub(server);
hub.region = CONFIG.server.region;

app.use('/api/admin', adminApi(hub));
app.use('/api', api(hub));
app.get('/health', (req, res) => res.json({ ok: true, rooms: hub.rooms.size, online: hub.byUser.size, storage: db.backend, uptime: Math.round(process.uptime()) }));
app.use('/shared', express.static(path.join(root, 'shared'), { maxAge: '1h' }));
app.use('/vendor/three', express.static(path.join(root, 'node_modules/three'), { maxAge: '7d' }));
app.use(express.static(path.join(root, 'client'), { maxAge: '10m' }));

server.listen(PORT, () => log('info', `${CONFIG.server.name} läuft auf http://localhost:${PORT} (Region ${CONFIG.server.region}, Speicher: ${db.backend})`));
process.on('uncaughtException', (e) => log('error', `Unbehandelter Fehler: ${e.stack}`));
