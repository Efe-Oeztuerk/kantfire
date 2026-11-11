// Nachbau der Supabase-REST-Schnittstelle (PostgREST) für Tests: GET mit Range, POST-Upsert.
import http from 'http';
const rows = new Map();
http.createServer(async (req, res) => {
  if (req.headers.apikey !== 'test-key') { res.writeHead(401); return res.end('no key'); }
  if (req.method === 'GET') {
    const [a, b] = (req.headers.range || '0-999').split('-').map(Number);
    const all = [...rows.entries()].sort().map(([id, data]) => ({ id, data }));
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(all.slice(a, b + 1)));
  }
  let body = ''; for await (const c of req) body += c;
  for (const r of JSON.parse(body)) rows.set(r.id, r.data);
  console.log('[mock] upsert', JSON.parse(body).map((r) => r.id).join(','));
  res.writeHead(201); res.end();
}).listen(5455);
