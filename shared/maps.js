// Map-Definitionen. Jede Map ist ein Raster aus 2-m-Zellen, aufgebaut über Rechteck-Befehle.
// Daraus entstehen Kollisionsboxen (Server + Client), Spawnpunkte, Bombenplätze und das Bot-Navigationsraster.

export const CELL = 2;

// Höhe/Material je Zeichen. ' ' = Leere (kein Boden, Absturz), '.' = Boden.
const SOLIDS = {
  X: { h: 12, m: 'outer' },
  '#': { h: 5, m: 'wall' },
  H: { h: 8, m: 'build' },
  c: { h: 2.6, m: 'cont' },
  k: { h: 1.1, m: 'crate' },
  K: { h: 2.2, m: 'crate2' },
  S: { h: 4.4, m: 'shelf' },
};
for (let i = 1; i <= 9; i++) SOLIDS[String(i)] = { h: i * 0.5, m: 'plat' };

export const TALL = new Set(['X', '#', 'H', 'c', 'K', 'S']);

function makeGrid(w, h, fill = '.') {
  return Array.from({ length: h }, () => Array(w).fill(fill));
}

function build(def) {
  const { w, h } = def;
  const g = makeGrid(w, h, def.base ?? '.');
  const spawns = { T: [], C: [], P: [] };
  const zones = [];
  const buy = {};
  const raw = [];
  const fill = (x0, z0, x1, z1, ch) => {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
        if (x >= 0 && z >= 0 && x < w && z < h) g[z][x] = ch;
  };
  const api = {
    fill,
    cell: (x, z, ch) => fill(x, z, x, z, ch),
    border: (ch = 'X') => { fill(0, 0, w - 1, 0, ch); fill(0, h - 1, w - 1, h - 1, ch); fill(0, 0, 0, h - 1, ch); fill(w - 1, 0, w - 1, h - 1, ch); },
    spawn: (team, x0, z0, x1 = x0, z1 = z0) => {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) spawns[team].push([x, z]);
    },
    site: (name, x0, z0, x1, z1) => zones.push({ name, x0, z0, x1, z1 }),
    buyZone: (team, x0, z0, x1, z1) => { buy[team] = { x0, z0, x1, z1 }; },
    // freie 3D-Box in Weltmetern (für Häuser mit Stockwerken, Autos, Brunnen …)
    box: (x0, y0, z0, x1, y1, z1, m) => raw.push({ min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], m, raw: true }),
  };
  def.draw(api);
  return { grid: g, spawns, zones, buy, raw };
}

function cellToWorld(map, cx, cz) {
  return [(cx + 0.5) * CELL - (map.w * CELL) / 2, (cz + 0.5) * CELL - (map.h * CELL) / 2];
}

function rectToWorld(map, r) {
  const [ax, az] = cellToWorld(map, r.x0, r.z0);
  const [bx, bz] = cellToWorld(map, r.x1, r.z1);
  return { min: [ax - CELL / 2, az - CELL / 2], max: [bx + CELL / 2, bz + CELL / 2] };
}

// Gleichartige Zellen zu wenigen großen Boxen zusammenfassen (weniger Kollisionsprüfungen und Draw Calls)
function mergeRects(grid, test) {
  const h = grid.length, w = grid[0].length;
  const rects = [];
  let open = new Map();
  for (let z = 0; z < h; z++) {
    const next = new Map();
    let x = 0;
    while (x < w) {
      const k = test(grid[z][x]);
      if (k == null) { x++; continue; }
      let x1 = x;
      while (x1 + 1 < w && test(grid[z][x1 + 1]) === k) x1++;
      const key = `${x},${x1},${k}`;
      const prev = open.get(key);
      if (prev) { prev.z1 = z; next.set(key, prev); }
      else { const r = { x0: x, x1, z0: z, z1: z, k }; rects.push(r); next.set(key, r); }
      x = x1 + 1;
    }
    open = next;
  }
  return rects;
}

export function compileMap(def) {
  const map = { id: def.id, name: def.name, desc: def.desc, w: def.w, h: def.h, theme: def.theme, killFloor: def.killFloor ?? false };
  const { grid, spawns, zones, buy, raw } = build(def);
  map.grid = grid;
  const boxes = [];
  // Boden unter allem, was keine Leere ist
  for (const r of mergeRects(grid, (c) => (c === ' ' ? null : 'F'))) {
    const wr = rectToWorld(map, r);
    boxes.push({ min: [wr.min[0], -1, wr.min[1]], max: [wr.max[0], 0, wr.max[1]], m: 'floor' });
  }
  for (const r of mergeRects(grid, (c) => (SOLIDS[c] ? c : null))) {
    const s = SOLIDS[r.k];
    const wr = rectToWorld(map, r);
    boxes.push({ min: [wr.min[0], 0, wr.min[1]], max: [wr.max[0], s.h, wr.max[1]], m: s.m, ch: r.k });
  }
  boxes.push(...raw);
  map.boxes = boxes;
  map.raw = raw;
  const toPts = (list) => list.map(([x, z]) => { const [wx, wz] = cellToWorld(map, x, z); return [wx, heightAt(map, x, z), wz]; });
  map.spawns = { T: toPts(spawns.T), C: toPts(spawns.C), P: toPts(spawns.P) };
  // Automatisch verteilte Spawnpunkte: FFA über die ganze Map, Teams jeweils auf ihrer Seite
  const open = openCells(map, raw);
  if (open.length) {
    map.spawns.P = toPts(spread(open, 20, map));
    if (spawns.T.length && spawns.C.length) {
      const cen = (l) => l.reduce((a, [x, z]) => [a[0] + x / l.length, a[1] + z / l.length], [0, 0]);
      const t = cen(spawns.T), c = cen(spawns.C);
      const ax = [t[0] - c[0], t[1] - c[1]], len = Math.hypot(ax[0], ax[1]) || 1;
      const proj = ([x, z]) => ((x - c[0]) * ax[0] + (z - c[1]) * ax[1]) / len / len; // 0 = C-Seite, 1 = T-Seite
      const tSide = open.filter((q) => proj(q) > 0.62), cSide = open.filter((q) => proj(q) < 0.38);
      map.spawns.TS = toPts(spread(tSide.length >= 6 ? tSide : spawns.T, 12, map));
      map.spawns.CS = toPts(spread(cSide.length >= 6 ? cSide : spawns.C, 12, map));
    }
  }
  map.sites = zones.map((z) => ({ name: z.name, ...rectToWorld(map, z) }));
  map.buyZones = {};
  for (const t in buy) map.buyZones[t] = rectToWorld(map, buy[t]);
  map.bounds = { min: [-(map.w * CELL) / 2, -(map.h * CELL) / 2], max: [(map.w * CELL) / 2, (map.h * CELL) / 2] };
  return map;
}

// Freie Zellen: begehbar, alle 8 Nachbarn auf gleicher Höhe begehbar, nicht in einem 3D-Objekt
function openCells(map, raw) {
  const out = [];
  const h = (x, z) => { const c = map.grid[z]?.[x]; return c == null || c === ' ' || TALL.has(c) || c === 'k' ? null : heightAt(map, x, z); };
  for (let z = 1; z < map.h - 1; z++) for (let x = 1; x < map.w - 1; x++) {
    const hc = h(x, z);
    if (hc === null) continue;
    let ok = true;
    for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1 && ok; dx++) { const n = h(x + dx, z + dz); if (n === null || Math.abs(n - hc) > 0.6) ok = false; }
    if (!ok) continue;
    const [wx, wz] = cellToWorld(map, x, z);
    if (raw.some((b) => b.min[1] < hc + 1.8 && b.max[1] > hc + 0.3 && wx > b.min[0] - 0.6 && wx < b.max[0] + 0.6 && wz > b.min[2] - 0.6 && wz < b.max[2] + 0.6)) continue;
    out.push([x, z]);
  }
  return out;
}

// Farthest-Point-Sampling: möglichst gleichmäßig verteilte Auswahl
function spread(cells, n, map) {
  if (cells.length <= n) return cells.slice();
  const cx = map.w / 2, cz = map.h / 2;
  let first = cells[0], bd = Infinity;
  for (const c of cells) { const d = Math.hypot(c[0] - cx, c[1] - cz); if (d < bd) { bd = d; first = c; } }
  const out = [first];
  const dist = cells.map((c) => Math.hypot(c[0] - first[0], c[1] - first[1]));
  while (out.length < n) {
    let bi = 0;
    for (let i = 1; i < cells.length; i++) if (dist[i] > dist[bi]) bi = i;
    const p = cells[bi];
    out.push(p);
    for (let i = 0; i < cells.length; i++) dist[i] = Math.min(dist[i], Math.hypot(cells[i][0] - p[0], cells[i][1] - p[1]));
  }
  return out;
}

export function heightAt(map, cx, cz) {
  const c = map.grid[cz]?.[cx];
  if (c == null || c === ' ') return null;
  return SOLIDS[c] ? SOLIDS[c].h : 0;
}

export function worldToCell(map, x, z) {
  return [Math.floor((x + (map.w * CELL) / 2) / CELL), Math.floor((z + (map.h * CELL) / 2) / CELL)];
}
export { cellToWorld };

export function inRect(r, x, z) { return x >= r.min[0] && x <= r.max[0] && z >= r.min[1] && z <= r.max[1]; }

// ---------------------------------------------------------------------------
// Map 1 – Kraftwerk (Industrie, 5v5 Bombe)
const KRAFTWERK = {
  id: 'kraftwerk', name: 'Kraftwerk', desc: 'Industriegebiet mit Lagerhallen, Containern und zwei Bombenplätzen.',
  w: 40, h: 36,
  theme: { sky: 0x9ec9e8, fog: 0xb8cfe0, floor: 0x8a8d91, wall: 0x7b5b4a, outer: 0x5a5f66, build: 0xb7a58a, cont: [0xa4472f, 0x3f6e4a, 0x2f5f8f, 0xc28a2c], crate: 0xa77b47, crate2: 0x8f6a3c, shelf: 0x50555c, plat: 0x6f7378, sun: 0xfff1d6, ground: 'concrete' },
  draw(m) {
    m.border();
    m.spawn('C', 16, 2, 23, 4); m.buyZone('C', 13, 1, 26, 6);
    m.spawn('T', 16, 31, 23, 33); m.buyZone('T', 13, 29, 26, 34);
    m.site('A', 2, 2, 11, 11); m.site('B', 28, 2, 37, 11);
    // Trennwände oben
    m.fill(12, 1, 12, 4, '#'); m.fill(12, 7, 12, 9, '#');
    m.fill(27, 1, 27, 4, '#'); m.fill(27, 7, 27, 9, '#');
    m.fill(15, 7, 24, 9, 'H');
    m.fill(5, 13, 12, 13, '#'); m.fill(27, 13, 34, 13, '#');
    // Gebäudeblöcke Mitte
    m.fill(5, 14, 12, 27, 'H'); m.fill(27, 14, 34, 27, 'H');
    // Mitte: Deckung, Container, Plattform
    m.fill(15, 16, 16, 18, 'c'); m.fill(23, 19, 24, 21, 'c');
    m.cell(19, 15, 'k'); m.cell(20, 22, 'k'); m.cell(13, 11, 'k'); m.cell(26, 11, 'k');
    m.fill(17, 13, 22, 13, '#');
    m.fill(13, 20, 14, 23, '4'); m.cell(13, 24, '3'); m.cell(14, 24, '3'); m.fill(13, 25, 14, 25, '2'); m.fill(13, 26, 14, 26, '1');
    m.fill(25, 14, 26, 16, '4'); m.fill(25, 17, 26, 17, '3'); m.fill(25, 18, 26, 18, '2'); m.fill(25, 19, 26, 19, '1');
    m.fill(15, 26, 16, 26, '#'); m.fill(23, 26, 24, 26, '#');
    // Platz A
    m.fill(5, 6, 6, 6, 'K'); m.cell(5, 7, 'k'); m.fill(8, 9, 9, 10, 'c'); m.cell(10, 4, 'k'); m.fill(2, 2, 3, 3, '3'); m.cell(4, 2, '2'); m.cell(4, 3, '1');
    // Platz B
    m.fill(31, 6, 32, 7, 'c'); m.cell(35, 9, 'K'); m.cell(34, 9, 'k'); m.cell(29, 10, 'k'); m.fill(36, 2, 37, 3, '3'); m.cell(35, 2, '2'); m.cell(35, 3, '1');
    // Lange Wege
    m.cell(2, 18, 'k'); m.cell(3, 22, 'k'); m.cell(1, 16, 'K');
    m.cell(37, 17, 'k'); m.cell(36, 21, 'K'); m.fill(37, 24, 38, 25, 'c');
    // T-Bereich & CT-Bereich
    m.cell(10, 30, 'k'); m.cell(29, 30, 'k'); m.fill(7, 31, 8, 32, 'c'); m.fill(31, 31, 32, 32, 'c');
    m.cell(14, 3, 'k'); m.cell(25, 3, 'k');
  },
};

// Map 2 – Basar (Wüste, 2v2, ein Bombenplatz)
const BASAR = {
  id: 'basar', name: 'Basar', desc: 'Kompakter Wüstenmarkt mit Innenhof und einem Bombenplatz.',
  w: 26, h: 24,
  theme: { sky: 0xf2d9a8, fog: 0xead6b0, floor: 0xd8c08f, wall: 0xc9a46c, outer: 0xb08a55, build: 0xdcc39a, cont: [0x9e5b3a, 0x5a7d8c], crate: 0x9b7444, crate2: 0x84603a, shelf: 0x7a6040, plat: 0xc8ae80, sun: 0xffe4b0, ground: 'sand' },
  draw(m) {
    m.border();
    m.spawn('C', 18, 2, 22, 4); m.buyZone('C', 16, 1, 24, 6);
    m.spawn('T', 3, 19, 8, 21); m.buyZone('T', 1, 17, 10, 22);
    m.site('A', 3, 2, 11, 9);
    m.fill(13, 8, 17, 13, 'H');
    m.fill(4, 11, 8, 14, 'H');
    m.fill(9, 16, 20, 16, '#'); m.fill(11, 16, 12, 16, '.');
    m.fill(12, 1, 12, 5, '#');
    m.fill(19, 8, 19, 12, '#');
    m.fill(7, 5, 8, 5, 'K'); m.cell(5, 7, 'k'); m.fill(3, 2, 4, 3, '3'); m.cell(5, 2, '2'); m.cell(5, 3, '1'); m.cell(10, 8, 'k');
    m.cell(21, 10, 'k'); m.cell(23, 13, 'k'); m.cell(20, 18, 'k'); m.fill(22, 19, 23, 20, 'c');
    m.cell(10, 12, 'k'); m.cell(2, 15, 'k'); m.cell(14, 19, 'K'); m.cell(15, 5, 'k');
  },
};

// Map 3 – Lagerhalle (Warehouse, Gun Game & Zombie)
const LAGERHALLE = {
  id: 'lagerhalle', name: 'Lagerhalle', desc: 'Große Lagerhalle mit Regalreihen, Containern und erhöhter Mittelplattform.',
  w: 34, h: 28,
  theme: { sky: 0x6f7c8a, fog: 0x55606b, floor: 0x6c6f73, wall: 0x4d545c, outer: 0x3e444b, build: 0x5d646c, cont: [0x2f5f8f, 0xa4472f, 0x3f6e4a], crate: 0xa77b47, crate2: 0x8f6a3c, shelf: 0x3d6fa8, plat: 0x8a6d3b, sun: 0xdde6f0, ground: 'concrete', indoor: true },
  draw(m) {
    m.border();
    for (const x of [6, 12, 21, 27]) { m.fill(x, 4, x, 10, 'S'); m.fill(x, 17, x, 23, 'S'); }
    m.fill(15, 11, 18, 16, '4');
    m.fill(12, 13, 12, 14, '1'); m.fill(13, 13, 13, 14, '2'); m.fill(14, 13, 14, 14, '3');
    m.fill(19, 13, 19, 14, '3'); m.fill(20, 13, 20, 14, '2'); m.fill(21, 13, 21, 14, '1');
    m.cell(2, 6, 'K'); m.cell(31, 20, 'K'); m.cell(16, 3, 'K'); m.cell(17, 24, 'K');
    for (const [x, z] of [[9, 7], [24, 19], [3, 13], [30, 14], [9, 20], [24, 8]]) m.cell(x, z, 'k');
    m.fill(14, 20, 15, 21, 'c'); m.fill(18, 6, 19, 7, 'c');
    for (const [x, z] of [[2, 2], [31, 2], [2, 25], [31, 25], [9, 13], [24, 14], [16, 1], [17, 26], [3, 9], [30, 18], [9, 24], [24, 3], [16, 13], [17, 14], [4, 18], [29, 9]]) m.spawn('P', x, z);
    m.spawn('T', 2, 2, 4, 4); m.spawn('C', 29, 23, 31, 25);
  },
};

// Map 4 – Skyline (Hochhausdächer, Only Sniper)
const SKYLINE = {
  id: 'skyline', name: 'Skyline', desc: 'Hochhausdächer mit Brücken und langen Sichtlinien – gebaut für Scharfschützen.',
  w: 40, h: 40, base: ' ', killFloor: true,
  theme: { sky: 0x8fb6dd, fog: 0xa9c4df, floor: 0x7d8288, wall: 0x9aa1a8, outer: 0x5a5f66, build: 0x6a7480, cont: [0xc28a2c, 0x3f6e4a], crate: 0xa77b47, crate2: 0x8f6a3c, shelf: 0x50555c, plat: 0x8d939a, sun: 0xfff1d6, ground: 'roof', city: true },
  draw(m) {
    // Dächer
    m.fill(2, 2, 11, 11, '.'); m.fill(28, 2, 37, 11, '4'); m.fill(2, 28, 11, 37, '4'); m.fill(28, 28, 37, 37, '.');
    m.fill(2, 16, 9, 23, '.'); m.fill(30, 16, 37, 23, '.'); m.fill(16, 2, 23, 9, '.'); m.fill(16, 30, 23, 37, '.');
    m.fill(15, 15, 24, 24, '6');
    // Treppen in den Turm (Norden und Süden)
    ['1', '2', '3', '4', '5'].forEach((ch, i) => { m.fill(19, 15 + i, 20, 15 + i, ch); m.fill(19, 24 - i, 20, 24 - i, ch); });
    // Brücken
    m.fill(12, 6, 15, 7, '.'); m.fill(24, 6, 27, 7, '.'); m.cell(28, 6, '1'); m.cell(28, 7, '1'); m.cell(29, 6, '2'); m.cell(29, 7, '2'); m.cell(30, 6, '3'); m.cell(30, 7, '3');
    m.fill(5, 12, 6, 15, '.'); m.fill(5, 24, 6, 27, '.'); m.fill(5, 28, 6, 28, '1'); m.fill(5, 29, 6, 29, '2'); m.fill(5, 30, 6, 30, '3');
    m.fill(33, 12, 34, 15, '.'); m.fill(33, 11, 34, 11, '1'); m.fill(33, 10, 34, 10, '2'); m.fill(33, 9, 34, 9, '3');
    m.fill(33, 24, 34, 27, '.');
    m.fill(12, 32, 15, 33, '.'); m.cell(11, 32, '1'); m.cell(11, 33, '1'); m.cell(10, 32, '2'); m.cell(10, 33, '2'); m.cell(9, 32, '3'); m.cell(9, 33, '3');
    m.fill(24, 32, 27, 33, '.');
    m.fill(19, 10, 20, 14, '.'); m.fill(19, 25, 20, 29, '.');
    // Deckung
    m.fill(8, 8, 9, 9, 'H'); m.cell(4, 4, 'k'); m.cell(10, 3, 'K'); m.fill(3, 9, 4, 9, '#');
    m.fill(18, 4, 21, 4, '#'); m.cell(17, 7, 'k'); m.cell(22, 7, 'k');
    m.fill(31, 4, 32, 5, 'H'); m.cell(36, 9, '9'); m.cell(34, 3, '6');
    m.fill(4, 18, 4, 21, '#'); m.cell(7, 17, 'k'); m.cell(8, 22, 'K');
    m.fill(35, 18, 35, 21, '#'); m.cell(32, 17, 'K'); m.cell(31, 22, 'k');
    m.fill(3, 33, 4, 34, 'H'); m.cell(9, 36, '6'); m.cell(7, 30, '9');
    m.fill(31, 31, 32, 32, 'H'); m.cell(35, 35, 'K'); m.cell(29, 36, 'k');
    m.fill(18, 35, 21, 35, '#'); m.cell(17, 32, 'k'); m.cell(22, 32, 'k');
    m.fill(16, 16, 17, 16, '9'); m.fill(22, 23, 23, 23, '9');
    for (const [x, z] of [[3, 3], [10, 10], [6, 3], [33, 3], [36, 10], [36, 6], [3, 36], [10, 29], [3, 30], [36, 36], [29, 29], [33, 36], [5, 20], [8, 19], [34, 19], [31, 20], [19, 3], [21, 8], [19, 36], [21, 31]]) m.spawn('P', x, z);
    for (const [x, z] of [[3, 3], [10, 10], [6, 3], [5, 20], [8, 19], [3, 36], [10, 29], [3, 30], [19, 3], [19, 36]]) m.spawn('T', x, z);
    for (const [x, z] of [[33, 3], [36, 10], [36, 6], [34, 19], [31, 20], [36, 36], [29, 29], [33, 36], [21, 8], [21, 31]]) m.spawn('C', x, z);
  },
};


// Map 5 – Siedlung (zwei Häuser mit Erd- und Obergeschoss, Brunnen und Autos in der Mitte)
function wall(m, axis, fixed, a, b, y0, y1, t, mat, openings = []) {
  // Wandsegment entlang einer Achse mit Öffnungen [von, bis, unten, oben]
  const seg = (u0, u1, v0, v1) => {
    if (u1 - u0 < 0.01 || v1 - v0 < 0.01) return;
    if (axis === 'x') m.box(u0, v0, fixed - t / 2, u1, v1, fixed + t / 2, mat);
    else m.box(fixed - t / 2, v0, u0, fixed + t / 2, v1, u1, mat);
  };
  const ops = openings.slice().sort((p, q) => p[0] - q[0]);
  let cur = a;
  for (const [o0, o1, ob, ot] of ops) {
    seg(cur, o0, y0, y1);
    seg(o0, o1, y0, ob);
    seg(o0, o1, ot, y1);
    cur = o1;
  }
  seg(cur, b, y0, y1);
}

function house(m, x0, x1, z0, z1, front, mat) {
  // front: Seite zur Kartenmitte ('east' oder 'west'). Erdgeschoss 0–3.2 m, Decke 3.2–3.5 m, OG 3.5–6.5 m, Dach.
  const T = 0.3, G = 3.2, F = 3.5, R = 6.5;
  const fx = front === 'east' ? x1 : x0, bx = front === 'east' ? x0 : x1;
  const dir = front === 'east' ? 1 : -1;
  const zc = (z0 + z1) / 2;
  // Erdgeschoss
  wall(m, 'z', fx, z0, z1, 0, G, T, mat, [[zc - 1, zc + 1, 0, 2.4], [z0 + 1.5, z0 + 3.5, 1.0, 2.2], [z1 - 3.5, z1 - 1.5, 1.0, 2.2]]);
  wall(m, 'z', bx, z0, z1, 0, G, T, mat, [[z1 - 4, z1 - 2, 0, 2.4], [z0 + 3, z0 + 5, 1.0, 2.2]]);
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), xm = (xa + xb) / 2;
  wall(m, 'x', z0, xa, xb, 0, G, T, mat, [[xm + dir * 2 - 1, xm + dir * 2 + 1, 0, 2.4], [xm - dir * 2 - 1, xm - dir * 2 + 1, 1.0, 2.2]]);
  wall(m, 'x', z1, xa, xb, 0, G, T, mat, [[xm - 1, xm + 1, 1.0, 2.2]]);
  // Obergeschoss mit großen Fenstern zur Mitte (Sniper-Positionen)
  wall(m, 'z', fx, z0, z1, F, R, T, mat, [[z0 + 1.5, z0 + 4.5, 4.3, 5.6], [z1 - 4.5, z1 - 1.5, 4.3, 5.6], [zc - 0.8, zc + 0.8, 4.3, 5.6]]);
  wall(m, 'z', bx, z0, z1, F, R, T, mat, [[zc - 1, zc + 1, 4.4, 5.5]]);
  wall(m, 'x', z0, xa, xb, F, R, T, mat, [[xm - 1.5, xm + 1.5, 4.4, 5.5]]);
  wall(m, 'x', z1, xa, xb, F, R, T, mat, [[xm - 1.5, xm + 1.5, 4.4, 5.5]]);
  // Treppe entlang der Nordwand (von der Rückseite zur Front), 7 Stufen à 0.5 m
  const sz0 = z0 + T / 2, sz1 = sz0 + 1.5, step = 0.75;
  const sx = bx + dir * T / 2;
  for (let i = 0; i < 7; i++) {
    const a = sx + dir * i * step, b = sx + dir * (i + 1) * step;
    m.box(a, 0, sz0, b, (i + 1) * 0.5, sz1, 'stair');
  }
  const holeEnd = sx + dir * 7 * step;
  // Decke mit Treppenloch
  const ha = Math.min(sx, holeEnd), hb = Math.max(sx, holeEnd);
  m.box(xa, G, sz1, xb, F, z1, 'slab');
  if (dir > 0) m.box(hb, G, z0, xb, F, sz1, 'slab'); else m.box(xa, G, z0, ha, F, sz1, 'slab');
  // Geländer am Treppenloch
  m.box(ha, F, sz1, hb - dir * 0.0, F + 1.0, sz1 + 0.1, 'stair');
  // Dach
  m.box(xa - 0.4, R, z0 - 0.4, xb + 0.4, R + 0.3, z1 + 0.4, 'roof');
  // Möbel als Deckung
  m.box(fx - dir * 3, 0, zc + 3, fx - dir * 1.8, 1.0, zc + 5, 'crate');
  m.box(bx + dir * 2, F, zc - 1, bx + dir * 3.2, F + 1.0, zc + 2, 'crate');
}

function car(m, x, z, along, mat) {
  const L = 4.4, W = 1.9;
  const [hx, hz] = along === 'x' ? [L / 2, W / 2] : [W / 2, L / 2];
  m.box(x - hx, 0.25, z - hz, x + hx, 1.15, z + hz, mat);
  const [cx, cz] = along === 'x' ? [1.2, W / 2 - 0.1] : [W / 2 - 0.1, 1.2];
  m.box(x - cx, 1.15, z - cz, x + cx, 1.85, z + cz, 'glass');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wx = along === 'x' ? x + sx * 1.4 : x + sx * 0.85, wz = along === 'x' ? z + sz * 0.85 : z + sz * 1.4;
    m.box(wx - 0.3, 0, wz - 0.3, wx + 0.3, 0.6, wz + 0.3, 'tire');
  }
}

const SIEDLUNG = {
  id: 'siedlung', name: 'Siedlung', desc: 'Zwei Häuser mit Obergeschoss, dazwischen Brunnen und Autos – Fensterduelle und Nahkampf.',
  w: 30, h: 22,
  theme: { sky: 0xa8d4f0, fog: 0xc4dff0, floor: 0x6f9a4e, wall: 0xb9b3a8, outer: 0x6b7a5a, build: 0xc9bfa8, cont: [0x3f6e4a], crate: 0x9b7444, crate2: 0x84603a, shelf: 0x50555c, plat: 0x8d939a, sun: 0xfff1d6, ground: 'grass',
    houseA: 0x6f9fd0, houseB: 0xe0b85a, slab: 0x8a6a45, roof: 0x5a3a32, stair: 0x7a5a3a, glass: 0x9fc6e0, tire: 0x1c1c1c, carR: 0xc23b2e, carB: 0x2f5f9f, carG: 0x6a7a3a, carW: 0xe8e8e8, fountain: 0xb8b0a0, water: 0x3a8fd0, road: 0x4a4d52 },
  draw(m) {
    m.border('X');
    // Straße quer durch die Mitte (nur Optik, flach)
    m.box(-12, 0, -2.5, 12, 0.02, 2.5, 'road');
    house(m, -24, -12, -7, 7, 'east', 'houseA');
    house(m, 12, 24, -7, 7, 'west', 'houseB');
    // Brunnen
    for (const [a, b, c, d] of [[-3, -3, 3, -2.6], [-3, 2.6, 3, 3], [-3, -2.6, -2.6, 2.6], [2.6, -2.6, 3, 2.6]]) m.box(a, 0, b, c, 0.85, d, 'fountain');
    m.box(-2.6, 0, -2.6, 2.6, 0.35, 2.6, 'water');
    m.box(-0.6, 0, -0.6, 0.6, 2.2, 0.6, 'fountain');
    m.box(-1.2, 2.0, -1.2, 1.2, 2.35, 1.2, 'fountain');
    // Autos
    car(m, -1, -11, 'x', 'carR');
    car(m, 2, 11.5, 'x', 'carB');
    car(m, -8, 10, 'z', 'carW');
    car(m, 8, -10.5, 'z', 'carG');
    // Gartenzäune und Kisten in den Höfen
    for (const sx of [-1, 1]) {
      m.box(sx * 24.2, 0, -16, sx * 24.5, 1.1, -9, 'crate2');
      m.box(sx * 24.2, 0, 9, sx * 24.5, 1.1, 16, 'crate2');
      m.box(sx * 17, 0, -15, sx * 18.2, 1.2, -13.8, 'crate');
      m.box(sx * 17, 0, 13.8, sx * 18.2, 1.2, 15, 'crate');
      m.box(sx * 9, 0, -17, sx * 10.2, 2.3, -15.8, 'crate2');
      m.box(sx * 9, 0, 15.8, sx * 10.2, 2.3, 17, 'crate2');
    }
    m.spawn('T', 1, 3, 2, 18); m.spawn('C', 27, 3, 28, 18);
    for (const [x, z] of [[1, 4], [2, 17], [6, 9], [8, 12], [28, 4], [27, 17], [23, 9], [21, 12], [14, 2], [15, 19], [5, 2], [24, 19], [11, 6], [18, 15]]) m.spawn('P', x, z);
  },
};

export const MAP_DEFS = { kraftwerk: KRAFTWERK, basar: BASAR, lagerhalle: LAGERHALLE, skyline: SKYLINE, siedlung: SIEDLUNG };
const cache = {};
export function getMap(id) {
  if (!MAP_DEFS[id]) throw new Error('Unbekannte Map ' + id);
  return (cache[id] ||= compileMap(MAP_DEFS[id]));
}
export const MAP_LIST = Object.values(MAP_DEFS).map((d) => ({ id: d.id, name: d.name, desc: d.desc }));
