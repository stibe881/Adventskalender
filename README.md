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
- 4 Themes, jedes als eigene Szene mit handgezeichneten Vektor-Illustrationen (`public/calendar/js/art.js`, `js/scenes.js`, `themes.css`):
  - **Partner*in** – Sternenhimmel mit Mond, Dächer-Silhouette mit erleuchteten Fenstern, Bogenfenster in Weinrot/Gold mit flackernder Kerze hinter dem Glas, Schreibschrift-Ziffern, schwebende Herzen
  - **Kind** – verschneites Dorf: jedes Türchen ist ein Häuschen mit Schneedach, rauchendem Schornstein, leuchtenden Sprossenfenstern und Kranz an der Tür; dazu Tannen, Schneemann, Dorf im Hintergrund, Lichterkette und Schneefall
  - **Eltern** – alter Holzschrank mit Maserung und Astlöchern, Messing-Nummernschildern und Knäufen, Tannengirlande mit Beeren, Zapfen und warmen Lichtern
  - **Modern** – editorialer Poster-Look auf warmem Papier: große Typografie, harte Schatten, ein Akzentblau
- Eigene Icon-Set (SVG) für alle Inhaltstypen statt Emojis – konsistent auf allen Geräten
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

## Spotify-Anbindung (Inhaltstyp „Gemeinsame Playlist“)

Songwünsche der Beschenkten werden in der App gespeichert **und** – sobald der Kalender mit einem Spotify-Account verbunden ist – automatisch in die echte Spotify-Playlist eingetragen.

1. Unter https://developer.spotify.com/dashboard eine App anlegen und `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` in die `.env` eintragen.
2. In der Spotify-App als **Redirect URI** exakt `<BASE_URL>/api/spotify/callback` hinterlegen (lokal `http://127.0.0.1:3000/api/spotify/callback` – Spotify akzeptiert kein `localhost`; produktiv die HTTPS-Domain).
3. Solange die Spotify-App im „Development Mode“ ist, dürfen nur Spotify-Nutzer, die im Dashboard unter *User Management* eingetragen sind, die Verbindung herstellen (das betrifft nur den Schenker, nicht die Beschenkten – die Song-Suche läuft über das App-Token).
4. Im Editor beim Türchen „Gemeinsame Playlist“ auf **Mit Spotify verbinden** klicken, danach eine Playlist aus dem Account wählen oder per Klick eine neue anlegen.

Die Suche der Beschenkten nutzt die Spotify Web API (Client Credentials, `/api/spotify/search`); das Hinzufügen läuft über den OAuth-Token des Schenkers (`server/src/services/spotify.js`), der pro Kalender gespeichert und automatisch erneuert wird. Tokens werden nie an den Browser ausgeliefert.

## Wichteltür (Weihnachtswichtel-Planer)

Drittes Modul neben Adventskalender und Wichteln: Eltern planen die 24 Nächte des
Weihnachtswichtels, der den Kindern Streiche spielt.

- **Eltern-Seite** `/e/<shareToken>`: Plan für den 1.–24. Dezember, Ideen-Bibliothek
  (60 Ideen mit Aufwand, Material, Alter), automatische Planung, Einkaufsliste nach
  Wochen, Wichtelpost, Briefvorlagen in Wichtel-Stimme, Druckansichten (Plan,
  Einkauf, Mini-Briefe, Rückblick). Der Link gibt volle Bearbeitungsrechte ohne
  Konto, damit das andere Elternteil mitplanen kann; in der App bleibt die Tür
  gespeichert und erscheint auf der Startseite unter „Meine Wichteltüren“.
- **Planen**: 24 Punkte als Adventsleiste, Tage per langem Drücken oder Ziehen
  tauschen, Erledigt-Häkchen in der Zeile, Filter „Meine Tage“/„Nur offene“,
  Tagesdialog in zwei Stufen mit Vor/Zurück, Vorbereitungs-Checkliste, Kosten pro
  Tag mit Monatsbudget, Morgen-Hinweis für die Kinderseite, eigene Ideen (bleiben
  fürs nächste Jahr), fertige Monatspläne (Klassisch, Kleinkinder, Schulkinder,
  Wenig Aufwand, Bastel-Dezember), automatische Verteilung „wer ist dran“
  (abwechselnd oder feste Wochentage), Vorrat in der Einkaufsliste, Rückgängig
  nach „Tag leeren“ und gelöschten Briefen, Kalender-Export (ICS mit Erinnerung am
  Vorabend), Nur-Lesen-Link `/v/<viewToken>` für Grosseltern (wird nach dem 24.
  zum Album), „Ins nächste Jahr übernehmen“.
- **Kinder-Seite** `/k/<kidToken>`: Tür mit Charakter, Kerzen-Countdown, Briefe vom
  Wichtel mit Reaktionen (Herz, Lachen, Staunen), Sprachnachrichten an den Wichtel,
  Morgen-Hinweis, Briefe an den Wichtel. Zeigt nie den Plan.
- **Erinnerung**: Jeden Abend zur eingestellten Zeit per Push (App/Browser) und
  E-Mail: was heute Nacht zu tun ist, was morgen vorbereitet werden muss. Die Mail
  hat einen „Erledigt“-Link, der den Tag direkt abhakt.
- **Verwaltung** `/admin/wichteltuer.html`: Türen anlegen, Links erneuern, löschen.
- Code: `server/src/routes/wichteltuer/`, `server/src/wichteltuer/` (Ideen, Briefe,
  Limits), `public/wichteltuer/`, Tests in `test/wichteltuer.test.js`.

## Wichteln (Secret Santa)

Eingeloggte Nutzer können oben im Kopfbereich zwischen **Adventskalender** und **Wichteln** wechseln. Unter *Konto* lässt sich einstellen, welcher Bereich nach dem Login geöffnet wird.

- **Runde anlegen & einladen:** Titel, Organisator-Name, Einladungsmodus (per E-Mail, per teilbarem Link mit Warteraum, ohne E-Mail-Adressen). Der Organisator kann selbst mitwichteln, ohne sein Los zu kennen.
- **Regeln:** Ausschlüsse für Paare, Budget, Motto, Termin/Ort der Bescherung, anonymer Chat an/aus, Aufbewahrungsfrist (30–180 Tage).
- **Auslosen:** kreuzungsfrei unter Beachtung der Ausschlüsse; jede Person erhält ihr Los per E-Mail bzw. über den persönlichen Link (`/w/<token>`). Neu auslosen und spätere Enthüllung durch den Organisator.
- **Teilnehmerbereich:** Wichtelkind mit Wunschzettel (Shop-Links mit Vorschau) und Hinweisen (Allergien, Lieblingsgeschmack, Hobbys), zwei anonyme Chat-Kanäle, Geschenk-Status mit Vorfreude-Anzeige, Foto-Wand, Kalender-Export (ICS) mit Erinnerung am Vortag, Benachrichtigungen per E-Mail.
- **Organisator:** Einladungskarte mit QR-Code, Druckansichten (Teilnehmerliste, Wunschzettel, Ziehungs-/Ausschlussmatrix), Warteraum-Freigabe.
- **Cron (08:00):** Erinnerung am Vortag der Bescherung und automatische, spurlose Löschung der Runde nach Ablauf der Frist.

Die Daten liegen in der Tabelle `wichtel_groups` (wird beim Start automatisch angelegt).

## iOS- und Android-App (Expo)

Im Ordner `mobile/` liegt eine Expo/React-Native-App, die den gehosteten Server als native
App für iOS und Android verpackt: App-Icon, Splash, Deep Links, Teilen, Zurück-Taste,
Offline-Hinweis und native Push-Benachrichtigungen über den Expo-Push-Dienst (auch iOS).
Store-Builds entstehen mit EAS Build in der Cloud, ein Mac ist nicht nötig.
Einrichtung und Store-Upload: [`mobile/README.md`](mobile/README.md).
Die Datei `public/shared/native.js` verbindet die Web-Seiten mit der App.

## Hinweise für den Produktivbetrieb

Nach jedem `git pull` auf dem Server: `npm run build:css` ausführen und den Node-Prozess neu
starten, sonst läuft der alte Code weiter (Symptom: neue API-Routen antworten mit „Nicht
gefunden.“). Bei Passenger-Hosting genügt `touch tmp/restart.txt` im Projektordner.

- Setze `NODE_ENV=production` und eine öffentlich erreichbare `BASE_URL` in der `.env`, damit generierte Links korrekt sind und Cookies als `secure` gesetzt werden (HTTPS erforderlich).
- `server/data/db.json` und `server/uploads/` enthalten alle Nutzdaten – für ein Backup reicht es, beide Ordner zu sichern.
- Für viele parallele Kalender/hohen Traffic empfiehlt sich mittelfristig der Umstieg von der JSON-Datei auf eine echte Datenbank; die Zugriffsschicht ist dafür bereits in `server/src/db.js` gekapselt.
