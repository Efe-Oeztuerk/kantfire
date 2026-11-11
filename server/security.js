// Passwort-Hashing, Rate Limiting und Server-Logs (inkl. Verdachtsfälle für Anti-Cheat).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt) return false;
  const h = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
}

// Einfaches Token-Bucket-Rate-Limit je Schlüssel (IP, Nutzer)
const buckets = new Map();
export function rateLimit(key, perMinute) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) { b = { tokens: perMinute, t: now }; buckets.set(key, b); }
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.t) / 60000) * perMinute);
  b.t = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 600000) buckets.delete(k); }, 60000).unref();

const LOG_DIR = process.env.LOG_DIR || path.resolve('logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const streams = {};
function stream(name) { return (streams[name] ||= fs.createWriteStream(path.join(LOG_DIR, name + '.log'), { flags: 'a' })); }

export function log(kind, msg, extra) {
  const line = `${new Date().toISOString()} [${kind}] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`;
  stream('server').write(line + '\n');
  if (kind === 'cheat') stream('anticheat').write(line + '\n');
  if (process.env.LOG_STDOUT !== '0' && kind !== 'debug') console.log(line);
}

export function validName(n) { return typeof n === 'string' && /^[A-Za-z0-9_\-]{3,16}$/.test(n); }
export function cleanText(t, max = 120) {
  return String(t ?? '').replace(/[\u0000-\u001f<>]/g, '').slice(0, max).trim();
}
