# Advently – die iOS- und Android-App (Expo)

Die App heisst **Advently** und bündelt Adventskalender und Wichteln.

Die App ist eine native Hülle mit **Expo / React Native**. Sie lädt die gehostete Web-App
in einer WebView – es bleibt **eine** Codebasis: Alles, was du im Web änderst, ist sofort
auch in der App, ohne neues Store-Release. Nativ dazu kommen App-Icon, Splash-Screen,
Deep Links (`/c/…`, `/w/…`), Zurück-Taste, Teilen, Haptik, Offline-Hinweis und
**echte Push-Benachrichtigungen auf iOS und Android** (Expo Push).

Mit **EAS Build** werden die Store-Dateien in der Cloud gebaut – für iOS brauchst du
also **keinen Mac**.

## Voraussetzungen

- Node 18+, ein per **HTTPS** erreichbarer Server mit dieser App
- Kostenloses Expo-Konto: https://expo.dev (für EAS Build und Push)
- Google-Play-Konto (einmalig 25 $) und Apple-Developer-Konto (99 $/Jahr) für die Stores

## Einrichtung (einmalig)

```bash
cd mobile
npm install
npm run configure -- --url https://adventskalender.deine-domain.ch   # Server-URL + Deep-Link-Hosts setzen
npm run login       # Expo-Konto (eas-cli ist lokal im Projekt, keine globale Installation nötig)
npm run init        # legt das Expo-Projekt an und trägt extra.eas.projectId in app.json ein
```

Alle `eas`-Befehle laufen über die lokale Kopie im Projekt (`npx eas …`), das funktioniert auch
auf Shared-Hosting ohne Root-Rechte.

Die App-ID ist `ch.stibe.adventskalender` (in `app.json` unter `ios.bundleIdentifier`
und `android.package` änderbar).

## Auf dem eigenen Handy testen

```bash
npx expo start            # Expo Go auf dem Handy installieren und den QR-Code scannen
```

Für lokale Tests mit deinem Rechner als Server:
`npm run configure -- --url http://192.168.x.y:3000` (gleiches WLAN). Hinweis: Push-Token
und einige native Module brauchen einen **Development Build** statt Expo Go:
`eas build -p android --profile development` bzw. `-p ios`.

## Store-Builds (Cloud, kein Mac nötig)

```bash
npm run build:android     # erzeugt ein signiertes .aab  (EAS verwaltet den Keystore)
npm run build:ios         # erzeugt ein signiertes .ipa   (EAS fragt nach Apple-Login und legt Zertifikate an)
npm run submit:android    # lädt den neuesten fertigen Build in die Play Console hoch
npm run submit:ios        # lädt den neuesten fertigen Build zu TestFlight hoch
```

`npm run build:preview` baut eine Android-APK zum direkten Installieren ohne Store.
Die Versionsnummern erhöht EAS automatisch (`autoIncrement` in `eas.json`).

### Bauen und direkt einreichen (TestFlight + Play Console)

```bash
npm run release            # iOS + Android bauen und nach dem Build automatisch einreichen
npm run release:ios        # nur iOS  → TestFlight
npm run release:android    # nur Android → Play Console, Track „Internes Testen“
```

`--auto-submit` reicht jeden fertigen Build ohne weiteres Zutun ein. Dafür einmalig in
`eas.json` unter `submit.production` eintragen:

- **iOS:** `appleId` und `appleTeamId` sind eingetragen. EAS sucht die App in App Store Connect
  anhand der Bundle-ID `ch.stibe.adventskalender` und legt sie bei Bedarf an. Beim ersten
  Mal verlangt Apple ein app-spezifisches Passwort oder einen API-Key – EAS führt dich durch.
- **Android:** Einen Google-Cloud-Service-Account mit Zugriff auf die Play Console anlegen und
  dessen JSON-Schlüssel als `mobile/google-play-key.json` ablegen (ist per `.gitignore`
  ausgeschlossen). Wichtig: Den **allerersten** Build muss man einmal von Hand in der Play
  Console hochladen, erst danach erlaubt Google Uploads über die API.

Der Fortschritt ist auf https://expo.dev unter *Builds* und *Submissions* sichtbar. Nach dem
iOS-Submit dauert es meist 10–30 Minuten, bis der Build in TestFlight erscheint.

## Deep Links einrichten

Damit `https://deine-domain/c/<token>` und `/w/<token>` direkt in der App aufgehen:

- **Android:** In `public/.well-known/assetlinks.json` auf dem Server den SHA-256-Fingerprint
  eintragen. Den zeigt `eas credentials -p android` (bzw. die Play Console unter App-Signatur).
- **iOS:** In `public/.well-known/apple-app-site-association` `TEAMID` durch deine
  Apple-Team-ID ersetzen. Die Associated-Domains-Berechtigung setzt EAS aus `app.json`.

Zusätzlich versteht die App das Schema `adventskalender://c/<token>`.

### Sprungmarken (Wichteln)

Push-Benachrichtigungen aus dem Wichtel-Modul tragen als `url` den persönlichen Link plus
eine Sprungmarke, z. B. `https://deine-domain/w/<token>#chat`. Die App (und der Browser
über den Service Worker) öffnet die Seite und scrollt direkt zum Bereich:

| Sprungmarke     | Bereich                                   | Ereignis                              |
|-----------------|-------------------------------------------|---------------------------------------|
| `#wichtelkind`  | Los, Wunschzettel des Wichtelkinds, Status | Auslosung, geänderter Wunschzettel, Geschenk-Erinnerung |
| `#wunschzettel` | Eigener Wunschzettel und Hinweise         | –                                     |
| `#chat`         | Anonyme Chats                             | Neue Nachricht                        |
| `#rueckblick`   | Dankeschöns und Foto-Wand                 | Dankeschön                            |

Alle Texte und Sprungmarken stehen in `server/src/routes/wichteln/notify.js`.

## Push-Benachrichtigungen

Die tägliche Türchen-Erinnerung (Editor → „Automatische tägliche Push-Erinnerung“)
erreicht die App nativ: Die Kalenderseite holt sich in der App ein Expo-Push-Token und
meldet es am Server an (`POST /api/calendar/:token/subscribe` mit `{ expoToken }`). Der
Server verschickt über den Expo-Push-Dienst; ungültige Token werden automatisch entfernt.
Für iOS-Push muss einmalig `eas credentials -p ios` den Push-Key anlegen (EAS macht das
beim ersten Build automatisch, wenn du zustimmst).

## Was die App anders macht als der Browser

`public/shared/native.js` wird auf jeder Seite geladen und erkennt die App:

- Externe Links (Shops auf dem Wunschzettel) öffnen im System-Browser, Spotify-Login bleibt in der App.
- Downloads wie der Kalender-Export (ICS) werden an das System übergeben.
- Druckansichten öffnen als normale Seite (kein Pop-up nötig).
- `window.nativeShare(...)`, `window.nativeHaptic()`, `window.nativeOpen(url)` stehen der Web-App zur Verfügung.
- Android-Zurück-Taste schließt offene Fenster bzw. geht in der Historie zurück.

## Hinweise für die Store-Prüfung

Apple lehnt reine Website-Hüllen gelegentlich ab (Richtlinie 4.2). Die App bringt native
Push-Benachrichtigungen, Deep Links, Teilen und Zurück-Navigation mit. In der Review-Notiz
Kalender- und Wichtel-Funktionen als App-Zweck beschreiben und einen Test-Login angeben.

## Dateien

| Datei            | Zweck                                                        |
|------------------|--------------------------------------------------------------|
| `App.js`         | WebView-Hülle, Deep Links, Push, Zurück-Taste, Offline-Seite |
| `app.json`       | Name, IDs, Icons, Splash, Deep-Link-Hosts, Server-URL        |
| `eas.json`       | Build-Profile für EAS                                        |
| `configure.js`   | Setzt Server-URL und Deep-Link-Hosts                         |
| `assets/`        | Icon, Adaptive Icon, Splash (aus dem Projekt-Logo erzeugt)   |
