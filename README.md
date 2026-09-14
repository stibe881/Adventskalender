# 🎄 Adventskalender

Ein moderner, interaktiver, animierter Adventskalender mit Admin-Dashboard für den Schenker und einer eigenen Ansicht für Beschenkte.

## Architektur & Tech-Stack

- **Backend:** Node.js + Express. Speicherung als versionierbare JSON-Datei (`server/data/db.json`, ohne native Abhängigkeiten). Auth per JWT in einem httpOnly-Cookie, Passwort-Hashing mit bcrypt. QR-Codes werden serverseitig generiert (`qrcode`-Paket), Datei-Uploads über `multer`.
- **Frontend:** Vanilla JS + TailwindCSS (lokal gebaut, kein CDN) + GSAP (lokal aus `node_modules` ausgeliefert unter `/vendor/gsap`). Kein Build-Tool/Bundler für JS nötig – einfache `<script>`-Tags reichen.
- **Sicherheit:** Die Freischalt-Logik der Türchen läuft **ausschließlich serverseitig** (`server/src/utils/time.js`), zeitzonenbewusst (`Europe/Berlin`). Der Client kann das Systemdatum beliebig manipulieren – das Backend vertraut dem nie.

### Ordnerstruktur

```
Adventskalender/
├── server/
│   └── src/
│       ├── index.js            # Express-App, Static-Serving, Routing
│       ├── config.js           # Env-Konfiguration
│       ├── db.js               # Kleine JSON-Datei-Datenbank
│       ├── middleware/auth.js  # JWT-Cookie-Auth für den Admin
│       ├── routes/auth.js      # Login/Logout/Session
│       ├── routes/admin.js     # Kalender- & Türchen-CRUD, Upload, Preview
│       ├── routes/calendar.js  # Öffentliche, token-basierte Empfänger-API
│       └── utils/
│           ├── time.js         # Serverseitige Zeit-/Freischalt-Logik
│           ├── token.js        # Sichere Link-Tokens
│           └── qr.js           # QR-Code-Generierung
├── public/
│   ├── admin/                  # Login, Dashboard, Türchen-Editor
│   ├── calendar/                # Interaktive Empfänger-Ansicht + Animationen
│   └── shared/                 # Gebaute Tailwind-CSS-Datei
├── src/input.css                # Tailwind-Quelle inkl. Theme-Variablen
└── server/data, server/uploads  # Laufzeitdaten (nicht in Git)
```

## Funktionsumfang

**Admin-Bereich** (`/admin`, geschützt durch Login als „Stibe“)
- Dashboard mit allen Kalendern, Fortschrittsanzeige, Link kopieren, Vorschau, Löschen
- Editor mit 24-Türchen-Raster, pro Türchen wählbarer Inhaltstyp
- 9 Inhaltstypen: Text-Nachricht, Gutscheincode, QR-Code (automatisch generiert), Video-Embed (YouTube/Vimeo), Audio (Spotify-Embed oder MP3-Upload), Bilder-Galerie, **digitales Rubbellos**, **interaktive Quiz-Frage**, **Event-Countdown**
- Generiert einen sicheren, zufälligen Freigabe-Link pro Kalender

**Empfänger-Ansicht** (`/c/<token>`, kein Login nötig)
- 4 Themes, jedes als eigene Szene statt nur Farbpalette (`public/calendar/themes.css`, `js/scenes.js`):
  - **Partner*in** – Sternenhimmel mit Mond, Bogenfenster in Weinrot/Gold mit Kerzenschein, Schreibschrift-Ziffern, schwebende Herzen
  - **Kind** – verschneites Dorf: jedes Türchen ist ein buntes Häuschen mit Schneedach und leuchtenden Fenstern, Lichterkette, Tannen, Schneefall
  - **Eltern** – alter Holzschrank mit Maserung, Messing-Nummernschildern und Knäufen, warmem Lampenschein und Lichterkette
  - **Modern** – editorialer Poster-Look auf warmem Papier: große Typografie, harte Schatten, ein Akzentblau
- Gemischte Nummernreihenfolge und unterschiedliche Türchengrößen wie bei einem echten Kalender, leichte Schiefstellung, Textur und Vignette
- Scharnier-Öffnung in 3D: das Türblatt klappt auf und gibt einen beleuchteten Innenraum mit dem Überraschungs-Symbol frei; geöffnete Türchen bleiben offen
- Konfetti-/Herzen-Partikel-Burst bei Erfolg, gestaffelte Einblend-Animation, flackerndes Licht und funkelnde Sterne im Stillstand
- Klick auf ein gesperrtes Türchen löst ein Wackeln + charmante Fehlermeldung mit Freischalt-Datum aus
- Server prüft bei **jedem** Öffnen-Versuch das Datum neu (`POST /api/calendar/:token/days/:day/open`) – Client-Manipulation ist wirkungslos

**Admin-Vorschau:** Über „👁 Vorschau“ im Dashboard/Editor kann sich Stibe den Kalender ansehen, ohne auf Dezember warten zu müssen (nur mit Admin-Login erreichbar, der öffentliche Link bleibt strikt zeitgesperrt).

## Lokal starten

### Voraussetzungen
- Node.js ≥ 18

### 1. Installation

```bash
npm install
```

### 2. Konfiguration

```bash
npm run setup
```

Das erstellt eine `.env` aus `.env.example` mit einem zufällig generierten `JWT_SECRET`. Öffne danach die `.env` und setze dein eigenes Passwort:

```
ADMIN_USERNAME=Stibe
ADMIN_PASSWORD=dein-sicheres-passwort
```

### 3. CSS bauen

```bash
npm run build:css
```

### 4. Server starten

```bash
npm start
```

Die App läuft nun unter **http://localhost:3000**. Admin-Login: http://localhost:3000/admin

### Entwicklung (mit Auto-Reload & CSS-Watcher)

```bash
npm run dev
```

## Typischer Ablauf

1. Unter `/admin` als „Stibe“ einloggen.
2. Im Dashboard einen neuen Kalender anlegen (Name des Beschenkten, Jahr, Theme).
3. Im Editor die 24 Türchen mit Inhalten befüllen.
4. Über „🔗 Link kopieren“ den persönlichen Link an die beschenkte Person senden.
5. Diese kann ab dem jeweiligen Datum im Dezember ihre Türchen öffnen – alles andere bleibt bis dahin verschlossen, garantiert serverseitig.

## Hinweise für den Produktivbetrieb

- Setze `NODE_ENV=production` und eine öffentlich erreichbare `BASE_URL` in der `.env`, damit generierte Links korrekt sind und Cookies als `secure` gesetzt werden (HTTPS erforderlich).
- `server/data/db.json` und `server/uploads/` enthalten alle Nutzdaten – für ein Backup reicht es, beide Ordner zu sichern.
- Für viele parallele Kalender/hohen Traffic empfiehlt sich mittelfristig der Umstieg von der JSON-Datei auf eine echte Datenbank; die Zugriffsschicht ist dafür bereits in `server/src/db.js` gekapselt.
