// HTTP-API-Wrapper. Die Server-Adresse kann für einen getrennt gehosteten Client gesetzt werden
// (window.KF_SERVER = 'https://mein-server.onrender.com').
export const SERVER = (window.KF_SERVER || location.origin).replace(/\/$/, '');
let token = localStorage.getItem('kf_token') || null;

export function getToken() { return token; }
export function setToken(t) { token = t; if (t) localStorage.setItem('kf_token', t); else localStorage.removeItem('kf_token'); }

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(SERVER + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error(data.error || 'Fehler ' + res.status); e.status = res.status; throw e; }
  return data;
}
