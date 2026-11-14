# KANTFIRE – Multiplayer-FPS im Browser

Kompetitiver 3D-Ego-Shooter mit kantigem Low-Poly-Stil. Echter Online-Multiplayer mit serverautoritärem Node.js-Server, fünf Spielmodi, Kaufsystem, CS-Rüstung, Ranglisten, Skins, Freunden und Server-Browser. Läuft ohne Installation im Browser.

Alle Maps, Modelle, Namen, Texturen und Sounds sind eigene Inhalte (prozedural erzeugt). Es werden keine Assets aus anderen Spielen verwendet.

---

## 1. Schnellstart (lokal)

Voraussetzung: **Node.js 18 oder neuer**.

```bash
npm install
npm start
```

Dann im Browser **http://localhost:3000** öffnen, ein Konto registrieren und unter „Spielen“ einen Modus wählen. Fehlen Mitspieler, füllt das Matchmaking nach 12 Sekunden mit Bots auf.

**Mit Freunden im selben WLAN:** Die anderen öffnen `http://<deine-IP>:3000` (z. B. `http://192.168.0.23:3000`).

**Über das Internet:** siehe Abschnitt 7 (Render, Docker).

### Steuerung (alles unter Einstellungen → Steuerung änderbar)

| Taste | Aktion | Taste | Aktion |
|---|---|---|---|
| W A S D | Bewegen | Maus links | Schießen |
| Leertaste | Springen | Maus rechts | Zielfernrohr |
| C | Ducken | R | Nachladen |
| Umschalt | Sprinten (schneller, aber ungenau) | E | Bombe legen/entschärfen, Waffe tauschen |
| Q | Langsam gehen (leise) | F | Waffe betrachten |
| V | Emote (kurze Außenansicht) | | |
| 1–5 | Primär / Sekundär / Messer / Granaten / Bombe | G | Waffe fallen lassen |
| B | Kaufmenü (Only Sniper: Waffenwahl) | Tab | Punktestand |
| Y / U | Chat alle / Team | Esc | Pause-Menü (Host: Match starten, Bots) |

Ducken liegt bewusst auf **C** statt Strg: Strg+W schließt sonst den Browser-Tab.

---

## 2. Spielmodi

| Modus | Regeln | Map |
|---|---|---|
| **Competitive 5v5** | Bombenmodus. 10 s Freeze + 30 s Kaufzeit, 1:45 Rundenzeit, 40 s Bombe, 3 s Legen, 10 s Entschärfen (5 s mit Kit). 24 Runden, 13 gewinnt, Seitenwechsel nach 12, Verlängerung (MR6). CS-Wirtschaft: Startgeld 800, Kill-Belohnung je Waffe, Rundensieg 3250/3500, Niederlagenbonus 1400 +500 pro Serie (max. 3400), Plant-Bonus. | Kraftwerk (2 Bombenplätze) |
| **Competitive 2v2** | Wie 5v5, aber kleine Map, ein Bombenplatz, 16 Runden (9 gewinnt), 90 s Runden. Eigene Rangliste. | Basar |
| **Gun Game** | Jeder gegen jeden, 14 Waffenstufen (serverseitig konfigurierbar). Kill = nächste Waffe, automatischer Wechsel. Messer-Kill nimmt dem Opfer eine Stufe. Wer mit der letzten Stufe (Messer) killt, gewinnt. | Lagerhalle, Kraftwerk, Basar |
| **Zombie-Modus** | Alle starten als Überlebende. Nach 15 s wird zufällig ein Mutterzombie gewählt (doppelte HP). Zombies infizieren per Klaue. Zwei Zombieklassen (Läufer: schnell, Panzer: viel HP). Überlebende gewinnen, wenn einer bis Zeitablauf überlebt. 3 Runden. Rückstoß auf Zombies bei Treffern. | Lagerhalle |
| **Team Deathmatch** | Zwei Teams (bis 6 vs 6), Respawn nach 3 s mit Spawnschutz, freie Waffenwahl über B (gilt ab dem nächsten Respawn). 50 Kills oder 10 min. | Siedlung, Kraftwerk, Lagerhalle |
| **Only Sniper** | Nur Scharfschützengewehre (4 Klassen: schwerer/leichter Repetierer, schwerer/leichter Halbautomat). Keine Kaufphase/Wirtschaft/Rüstung. Respawn 2 s mit 2 s Spawnschutz (endet beim Schießen). Kill 100 Punkte, Kopfschuss +50. Punktelimit 3000 oder 8 min. Optional 5v5 und One-Shot-Modus (in eigener Lobby wählbar). Countdown vor dem Start. Eigene Rangliste. | Skyline (Hochhausdächer) |

Alle Zeiten, Preise und Regeln stehen in `server/config.js` und lassen sich über eine `config.json` im Projektordner überschreiben (Vorlage: `config.example.json`).

---

### Präzision und Bewegung
Im Stand treffen Schüsse fast genau den Zielpunkt (Streuung ×0,45). Beim Laufen streut es wie gewohnt, beim Sprinten (Umschalt, nur vorwärts, +28 % Tempo) deutlich stärker. Scharfschützengewehre sind nur mit Zielfernrohr präzise.

### Kosmetik, Truhen und Battlepass
- **Spind:** Waffen-Skins pro Waffe, Outfits, Hautfarben, Gesichter, Accessoires, Handschuhe, Emotes. Alles rein optisch, mit 3D-Vorschau am Charakter rechts im Menü.
- **Truhen:** Standard-Truhe (alle Arten, 300 🪙) und Waffen-Truhe (nur Skins, 400 🪙). Das Ergebnis wird ausschließlich auf dem Server ausgelost. Die Drop-Chancen stehen offen im Shop. Duplikate geben 40 % des Shop-Preises zurück.
- **Battlepass (kostenlos):** 30 Stufen à 700 XP. Jede Match-XP zählt. Belohnungen (Münzen, Truhen, exklusive Skins, Emotes, Hautfarben) werden automatisch gutgeschrieben. Konfiguration in `shared/battlepass.js`.
- Kein Echtgeld: Münzen gibt es nur durch Spielen.

### Bots und Spawns
- Bot-Stärke in 6 Stufen: Anfänger, Leicht, Normal (Standard), Gut, Profi, Experte. Einstellbar beim Erstellen einer Lobby und als Host im Esc-Menü während des Spiels.
- Spawnpunkte werden pro Map automatisch verteilt: In Teammodi startet jedes Team auf seiner eigenen Kartenseite, in Jeder-gegen-jeden-Modi möglichst weit weg von Gegnern und nie zweimal hintereinander am selben Punkt.

### Admin-Werkzeuge
Ein verstecktes Admin-Panel: Münzen, Truhen, XP/Battlepass, Items, Sperren (befristet oder dauerhaft), Kicken, Umbenennen, Fortschritt zurücksetzen, Bonus-Events (z. B. Doppel-XP-Wochenende), Geschenke an alle Accounts, Meldungen, Übersicht und Ansagen. Admins tragen automatisch das exklusive rot-gelbe Fußballtrikot (Nr. 10) und haben einen goldenen Namen mit 👑. Wer Admin ist, legt ausschließlich der Server über `ADMIN_USERS` fest. Jede Aktion steht im Log (`[admin]`). Gesperrte Accounts können sich nicht mehr anmelden.

## 3. Architektur

```
Browser (Client)                                   Node.js-Prozess (Server)
┌────────────────────────────┐   HTTPS /api   ┌──────────────────────────────────────┐
│ ui/menu.js   Menüs         │ ─────────────▶ │ api.js      Accounts, Profil, Shop,  │
│ ui/hud.js    HUD, Kaufmenü │                │             Freunde, Rangliste       │
│ game/game.js Vorhersage,   │   WebSocket    │ hub.js      Verbindungen, Online-    │
│   Interpolation, Rendering │ ◀────────────▶ │             Status, Matchmaking,     │
│ game/world.js, models.js,  │  /ws (JSON)    │             Lobbys, Einladungen      │
│   effects.js, audio.js     │                │ room.js     ein Match, 30-Hz-Tick    │
└──────────┬─────────────────┘                │ combat.js   Treffer, Schaden, Granat.│
           │ importiert                       │ modes/*.js  Regeln je Modus          │
┌──────────▼─────────────────────────────┐    │ bot.js/nav.js  Bots + A*-Wegfindung │
│ shared/  (identisch auf beiden Seiten) │◀───│ progress.js XP, Level, Ränge, Stats  │
│ physics.js  Bewegung/Kollision/Raycast │    │ db.js       Speicherung (JSON-Datei) │
│ weapons.js  Waffenwerte, Spray, Rüstung│    │ security.js Hashing, Rate Limit, Logs│
│ maps.js     Maps -> Boxen, Spawns      │    └──────────────────────────────────────┘
│ constants.js, cosmetics.js, progression│
└────────────────────────────────────────┘
```

**Wichtigstes Prinzip:** Der Client schickt nur Eingaben (Tasten, Blickwinkel, Waffenslot, Zeitstempel). Bewegung, Munition, Feuerrate, Treffer, Schaden, Geld, Punkte und Matchergebnis berechnet ausschließlich der Server. Der Client sagt dieselbe Bewegung mit demselben Code voraus (`shared/physics.js`), damit sich das Spiel ohne Verzögerung anfühlt.

### Ordnerstruktur

```
server/            Spielserver + HTTP-API
  modes/           base.js, bomb.js (5v5/2v2), gungame.js, zombie.js, sniper.js, warmup.js
client/            statischer Webclient (kein Build-Schritt nötig)
  js/game/         3D-Spiel
  js/ui/           Menüs, HUD, Einstellungen
shared/            Code, den Server und Client gemeinsam nutzen
test/              automatische Tests (Server, Multiplayer, Browser)
```

---

## 4. Netzwerk

| Thema | Umsetzung |
|---|---|
| Tickrate | 30 Hz Simulation, 30 Snapshots/s an jeden Client |
| Client-Vorhersage | Eigene Bewegung und Schüsse werden sofort lokal simuliert, nicht bestätigte Eingaben nach jedem Snapshot neu angewendet (Reconciliation) |
| Interpolation | Andere Spieler werden 100 ms in der Vergangenheit zwischen zwei Snapshots interpoliert |
| Lag Compensation | Jeder Schuss trägt den Zeitstempel der Szene, die der Schütze sah. Der Server spult die Gegner bis zu 300 ms zurück und prüft dort den Treffer |
| Zeitstempel | Server-Zeit in jedem Snapshot. Der Client gleicht seine Uhr laufend ab |
| Reconnect | Bricht die Verbindung ab, verbindet der Client automatisch neu (exponentielles Backoff). Der Platz im Match bleibt 60 s reserviert und wird beim Wiederverbinden automatisch übernommen |
| Anzeige | FPS, Ping (Round-Trip) und Snapshot-Verlust (fehlende Snapshots im 2-s-Fenster) oben links |
| Überlast | Bei vollem Sendepuffer werden Snapshots für diesen Client ausgelassen statt den Server zu blockieren |

Die Streuung ist deterministisch aus Spieler-ID und Eingabenummer berechnet. Deshalb zeigt der Client dieselben Einschläge an, die der Server wertet.

---

## 5. Anti-Cheat und Sicherheit

- **Serverautorität:** Position, Geschwindigkeit, Munition, Feuerrate, Nachladezeit, Treffer und Schaden werden nur auf dem Server berechnet. Manipulierte Schadenswerte sind nicht möglich, weil der Client keine Schadenswerte sendet.
- **Speedhack-Schutz:** Eingaben werden über ein Guthaben pro Tick begrenzt (im Mittel 1 Eingabe/Tick). Eine Flut von Eingaben wird verworfen und protokolliert. Schickt ein Client gar keine Eingaben mehr, rechnet der Server mit neutraler Eingabe weiter (kein „Schweben“).
- **Spielregeln serverseitig:** Kaufzone und Kaufzeit, Geld, Teamschaden, Bombenregeln und Sieger werden alle auf dem Server geprüft.
- **Statistiken** werden nur vom Server geschrieben, nie vom Client.
- **Accounts:** Passwörter mit scrypt und Salt gehasht, zufällige 256-bit-Session-Token (30 Tage gültig).
- **Rate Limiting:** Registrierung, Login, API, WebSocket-Nachrichten, Chat, Einladungen und Meldungen.
- **Logs:** `logs/server.log` (alles) und `logs/anticheat.log` (Verdachtsfälle: Eingabe-Flut, extreme Blicksprünge direkt vor Kopftreffern, Kopfschussquote über 85 % bei mindestens 15 Kills). Spielermeldungen landen in der Datenbank und im Log.

**Grenzen:** Der Server schickt allen Clients die Positionen aller Spieler. Ein Wallhack ist deshalb technisch möglich. Aimbots werden nur über Heuristiken protokolliert, nicht automatisch gebannt. Es gibt keine Client-Integritätsprüfung (im Browser grundsätzlich nur begrenzt möglich).

---

## 6. Datenbank und Accounts

Gespeichert werden: Benutzerkonten, Name, Spieler-ID, Passwort-Hash, Sessions, XP/Level, Münzen, Statistiken (gesamt, je Modus, Kills je Waffe), Rangpunkte je Modus, Inventar, ausgerüstete Skins, Einstellungen (inkl. Tastenbelegung), Freunde, Anfragen, Blockliste, Matchhistorie, Herausforderungen und Meldungen.

Es gibt zwei Speicherarten mit identischem Verhalten (`server/db.js`):

| Speicher | Wann | Einrichtung |
|---|---|---|
| **Supabase (PostgreSQL)** | Hosting ohne dauerhafte Festplatte, z. B. Render Free | `SUPABASE_URL` und `SUPABASE_SERVICE_KEY` setzen |
| **JSON-Datei** `data/db.json` | lokal, VPS, Docker mit Volume | nichts, ist Standard |

Pro Account wird eine Zeile gespeichert, alle 2 s nur die geänderten Zeilen. `GET /health` zeigt unter `storage`, welcher Speicher aktiv ist.

### Supabase einrichten (kostenlos)
1. Auf supabase.com ein Projekt anlegen.
2. Im **SQL Editor** ausführen:
   ```sql
   create table public.kf_data (
     id text primary key,
     data jsonb not null
   );
   alter table public.kf_data enable row level security;
   ```
   RLS ohne Policies bedeutet: Nur der Server mit dem geheimen Schlüssel kommt an die Daten, nicht die Öffentlichkeit.
3. Unter **Project Settings → API**: die **Project URL** und den **secret / service_role key** kopieren.
4. Beim Hoster (z. B. Render → Environment) eintragen: `SUPABASE_URL` = Project URL, `SUPABASE_SERVICE_KEY` = geheimer Schlüssel.

Der geheime Schlüssel gehört nur auf den Server, niemals in den Client-Code oder auf GitHub.

## 7. Deployment

### Variante A: Render.com (empfohlen, alles in einem Dienst)
1. Projekt in ein GitHub-Repository hochladen.
2. Auf render.com: **New → Blueprint** → Repository wählen. `render.yaml` richtet einen Web-Service mit 1 GB dauerhafter Disk ein.
3. Fertig: Spiel und Server laufen unter `https://<name>.onrender.com`. WebSockets funktionieren dort direkt.

Hinweis: Der kostenlose Plan von Render hat keine dauerhafte Disk und schläft ein. Kostenlos dauerhaft speichern geht mit Supabase (Abschnitt 6). Alternativ den „Starter“-Plan mit Disk nehmen.

### Variante B: Docker (eigener Server/VPS, Fly.io, Railway)
```bash
docker build -t kantfire .
docker run -d -p 3000:3000 -v kantfire-data:/data --name kantfire kantfire
```

### Variante C: Client auf Vercel, Server woanders
Vercel kann den Webclient (`client/` + `shared/` + `node_modules/three`) statisch ausliefern, aber **keine dauerhaften WebSocket-Spielserver** betreiben. Der Server läuft dann auf Render/Fly/Railway. In `client/index.html` vor `main.js` eintragen:
```html
<script>window.KF_SERVER = 'https://dein-server.onrender.com';</script>
```
und auf dem Server `ALLOWED_ORIGIN=https://dein-client.vercel.app` setzen. Einfacher ist Variante A.

### Umgebungsvariablen

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | 3000 | HTTP-/WebSocket-Port |
| `DATA_DIR` | `./data` | Speicherort der Datenbank |
| `LOG_DIR` | `./logs` | Speicherort der Logs |
| `REGION` | EU | Anzeige im Server-Browser |
| `SERVER_NAME` | KANTFIRE Server | Servername |
| `CONFIG_FILE` | `./config.json` | Regel-Konfiguration |
| `ALLOWED_ORIGIN` | `*` | CORS für getrennt gehosteten Client |
| `AUTH_RATE` | 5 | Registrierungen pro Minute und IP (Login: 10) |
| `SUPABASE_URL` | – | Supabase-Projekt-URL (aktiviert Datenbankspeicher) |
| `SUPABASE_SERVICE_KEY` | – | geheimer Supabase-Schlüssel (nur auf dem Server!) |
| `ADMIN_USERS` | – | Accountnamen mit Admin-Rechten, kommagetrennt (z. B. `Efe,Efe2`) |

### Serveranforderungen
Ein Node-Prozess betreibt bis zu 40 Matches gleichzeitig (`server.maxRooms`). Im Test lief der Server mit 6 parallelen Räumen voller Bots bei unter 10 % CPU-Last eines Kerns und ca. 130 MB RAM. Für 10–20 gleichzeitige Matches reichen 1 vCPU und 512 MB RAM. Netzwerk: ca. 15–25 KB/s pro Spieler.

Monitoring: `GET /health` liefert Räume, Online-Spieler und Laufzeit.

---

## 8. Tests

```bash
npm test                         # Server: alle 5 Modi mit Bots, 2-Spieler-Multiplayer mit echten Treffern, Freunde/Einladungen
python3 test/browser.py gungame  # Browser-Test (benötigt Python + Playwright + Chrome)
```

Geprüft wurde unter anderem:
- Alle Modi starten und laufen bis zum Matchende.
- Zwei Clients sehen ihre Bewegung gegenseitig, und Treffer ziehen serverseitig Leben ab.
- Kaufen zieht Geld ab und legt die Waffe ins Inventar.
- Munition stimmt zwischen Client und Server überein.
- Daten überleben einen Server-Neustart.
- Reconnect übernimmt das laufende Match.
- Alle Menüseiten laufen ohne JavaScript-Fehler.

---

## 9. Erweitern

- **Neue Waffe:** Eintrag in `shared/weapons.js` (`WEAPONS`). Kaufmenü, Gun Game, Statistiken und Skins übernehmen sie automatisch.
- **Neue Map:** In `shared/maps.js` ein Objekt mit Raster-Befehlen (`fill`, `spawn`, `site`, `buyZone`) und freien 3D-Boxen (`box`, für Stockwerke, Fenster, Autos) anlegen und in `MODE_MAPS` (`shared/constants.js`) eintragen. Kollision, Optik, Radar und Bot-Navigation entstehen daraus automatisch.
- **Neuer Modus:** Klasse in `server/modes/` von `Mode` oder `RespawnMode` ableiten, in `modes/index.js` und `MODES` registrieren.
- **Neuer Skin:** Eintrag in `shared/cosmetics.js`.

---

## 10. Status der Funktionen (ehrlich)

✅ = umgesetzt und getestet · ⚠️ = umgesetzt, aber eingeschränkt · ❌ = noch nicht umgesetzt

| Bereich | Status |
|---|---|
| 3D-Welt, First-Person, Bewegung (Springen, Ducken, Gehen, Stufen), Schatten, Licht | ✅ |
| 19 Waffen mit eigenen Werten (Schaden, Feuerrate, Magazin, Rückstoß/Spray, Streuung, Reichweite, Kopfschuss, Tempo, Preis), Zielfernrohre, Messer, Rückenstich | ✅ |
| Rüstung nach CS-Prinzip (Weste / Weste + Helm, Durchschlag je Waffe, Helm nachkaufen) | ✅ |
| Splitter- und Rauchgranate, Bombe, Entschärfungskit, Waffen fallen lassen/aufheben | ✅ |
| Blendgranate, Molotow | ❌ |
| Durchschüsse durch Wände (Wallbang) | ❌ |
| Alle 5 Modi inkl. Kaufphase, Wirtschaft, Seitenwechsel, Gun-Game-Leiter, Infektion, Sniper-Punkte | ✅ |
| Verlängerung im Competitive | ⚠️ programmiert, aber nicht in einem kompletten Match getestet |
| Maps: Kraftwerk (Industrie), Basar (Wüste), Lagerhalle, Skyline (Sniper), Siedlung (2 Häuser mit OG, Brunnen, Autos) | ✅ |
| Bots auf Obergeschossen der Siedlung | ⚠️ Bots laufen nur im Erdgeschoss, die Treppen nutzen sie nicht |
| Team Deathmatch, Truhen, kostenloser Battlepass, Emotes, Hautfarben, Waffen-Inspect, Sprint | ✅ |
| Map „Urban“ (Stadt/Parkhaus) | ❌ |
| Echter Multiplayer, serverautoritär, Prediction, Interpolation, Lag Compensation, Reconnect | ✅ |
| Matchmaking nach Rating, Auffüllen mit Bots, ausgeglichene Teams | ✅ |
| Gemeinsam mit Freunden ins Matchmaking (Gruppen-Warteschlange) | ❌ Freunde spielen zusammen über private Lobbys |
| Private Lobbys (Code, Passwort, Teamwahl, Host-Start, Bots), Server-Browser mit Filtern, eigene Server | ✅ |
| Mehrere Server-Prozesse/Regionen mit gemeinsamer Account-Datenbank | ❌ Eine Instanz betreibt viele Matches. Mehrere Instanzen haben aktuell getrennte Datenbanken |
| Accounts, Profil, Level/XP, Münzen, tägliche/wöchentliche Aufgaben, Ranglisten (5v5, 2v2, Sniper, Level), Statistiken, Matchhistorie | ✅ |
| Inventar, Shop (nur Spielwährung), Charakter- und Waffen-Skins mit Seltenheiten, 3D-Vorschau | ✅ |
| Freunde, Anfragen, Online-Status, Einladungen, Textchat (alle/Team), Melden, Blockieren | ✅ |
| Sprachchat | ❌ |
| Synthetische Sounds mit räumlichem 3D-Audio (Schritte je Untergrund, Waffen, Bombe, Musik, Atmosphäre) | ✅ |
| Einstellungen (Grafik, Audio, freie Tastenbelegung, Fadenkreuz, HUD), im Konto gespeichert | ✅ |
| V-Sync abschaltbar | ⚠️ Im Browser nicht steuerbar. Stattdessen gibt es ein FPS-Limit |
| Bots | ⚠️ Einfache KI (Wegfindung, Zielen mit Reaktionszeit, Bombe legen/entschärfen), kein taktisches Teamspiel |
| Performance | ⚠️ Map in wenige Draw Calls zusammengefasst, Partikel instanziert. Auf echter Grafikhardware nicht gemessen (Testumgebung nur mit Software-Rendering) |
| Animationen | ⚠️ Prozedural (Laufen, Ducken, Zielen, Tod, Rückstoß, Nachladen), keine Motion-Capture-Qualität |
| Touch/Handy | ❌ Nur Maus und Tastatur |
| Passwort zurücksetzen per E-Mail | ❌ |
