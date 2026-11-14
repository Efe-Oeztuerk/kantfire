// Wer Admin ist, entscheidet nur der Server: ADMIN_USERS (kommagetrennt) bzw. config.admins.
import { CONFIG } from './config.js';
const names = () => new Set([...String(process.env.ADMIN_USERS || '').split(','), ...(CONFIG.admins || [])].map((s) => String(s).trim().toLowerCase()).filter(Boolean));
export const isAdmin = (u) => !!u && names().has(String(u.name).toLowerCase());
export const ADMIN_ITEMS = ['o_admin'];
// Admins bekommen ihre exklusiven Items automatisch
export function ensureAdminItems(u) {
  if (!isAdmin(u)) return false;
  let added = false;
  for (const id of ADMIN_ITEMS) if (!u.inventory.includes(id)) { u.inventory.push(id); added = true; }
  return added;
}
