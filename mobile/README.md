# Adventskalender & Wichteln als iOS- und Android-App

Die App ist eine native Hülle (Capacitor) um die bestehende Web-App. Sie lädt den
gehosteten Server, darum gibt es nur **eine** Codebasis: Alles, was du im Web änderst,
ist sofort auch in der App – ohne neues Store-Release. Die Hülle liefert das, was eine
Website nicht kann: App-Icon, Splash-Screen, Statusleiste, Zurück-Taste, native
Teilen-Funktion, Deep Links (`/c/…`, `/w/…`) und einen Platz im App Store / Play Store.

## Voraussetzungen

| Ziel     | Nötig                                                                 |
|----------|-----------------------------------------------------------------------|
| Beides   | Node 18+, ein per **HTTPS** erreichbarer Server mit dieser App        |
| Android  | Android Studio (inkl. SDK), Java 17                                   |
| iOS      | macOS mit Xcode 15+, CocoaPods (`sudo gem install cocoapods`), Apple-Developer-Konto (99 $/Jahr) |

## Einrichtung (einmalig)

```bash
cd mobile
npm install
npm run configure -- --url https://adventskalender.deine-domain.ch   # Server-URL setzen
npx cap sync                                                          # Plugins + Assets in die nativen Projekte kopieren
```

Icons und Splash-Screens sind bereits aus `resources/` generiert. Wenn du das Logo
änderst: `resources/icon.png` (1024×1024) und `resources/splash.png` (2732×2732)
ersetzen, dann `npm run assets`.

## Android

```bash
npm run open:android      # öffnet Android Studio
```

1. In Android Studio **Build → Generate Signed Bundle / APK → Android App Bundle**.
2. Beim ersten Mal einen Keystore erzeugen und **sicher aufbewahren** (ohne ihn gibt es keine Updates mehr).
3. `.aab` in der Google Play Console hochladen (einmalig 25 $ Registrierung).
4. App Links: Den SHA-256-Fingerprint des Signatur-Zertifikats (Play Console →
   App-Signatur, oder `keytool -list -v -keystore …`) in `public/.well-known/assetlinks.json`
   auf dem Server eintragen. Dann öffnen Kalender- und Wichtel-Links direkt in der App.

Zum Testen auf einem Gerät im gleichen WLAN reicht `npm run configure -- --url http://192.168.x.y:3000`
(erlaubt Klartext-HTTP, nur für Tests), `npx cap sync android`, `npm run run:android`.

## iOS

```bash
npm run open:ios          # öffnet Xcode (vorher: cd ios/App && pod install)
```

1. In Xcode unter *Signing & Capabilities* dein Team wählen; Bundle-ID ist `ch.stibe.adventskalender`.
2. Für Deep Links die Capability **Associated Domains** hinzufügen:
   `applinks:adventskalender.deine-domain.ch`. Auf dem Server in
   `public/.well-known/apple-app-site-association` `TEAMID` durch deine Apple-Team-ID ersetzen.
3. **Product → Archive**, dann über den Organizer an App Store Connect hochladen und
   in TestFlight bzw. zur Prüfung freigeben.

## Was die App anders macht als der Browser

`public/shared/native.js` wird auf jeder Seite geladen und erkennt die App automatisch:

- Sichere Bereiche (Notch, Home-Balken) werden berücksichtigt.
- Android-Zurück-Taste schließt offene Fenster bzw. geht in der Historie zurück.
- Externe Links (Shops auf dem Wunschzettel, Spotify) öffnen im System-Browser.
- Downloads wie der Kalender-Export (ICS) werden an das System übergeben.
- `window.nativeShare({title, text, url})` und `window.nativeHaptic()` stehen der Web-App zur Verfügung.

Deep Links: `https://deine-domain/c/<token>` und `/w/<token>` öffnen direkt die
richtige Seite in der App, sobald App Links (Android) bzw. Universal Links (iOS)
eingerichtet sind.

## Bekannte Grenzen

- **Push auf iOS:** Web-Push funktioniert in der iOS-App nicht (WKWebView). Dafür wäre
  natives Push über APNs/Firebase nötig (Plugin `@capacitor/push-notifications` plus
  Server-Anbindung). Auf Android funktionieren die bestehenden Web-Push-Erinnerungen.
- **Offline:** Ohne Netz zeigt die App die Seite aus `www/index.html` mit „Erneut versuchen“.
- **App-Store-Prüfung:** Apple lehnt reine Website-Hüllen gelegentlich ab (Richtlinie 4.2).
  Die App bringt native Funktionen mit (Deep Links, Teilen, Zurück-Taste, Splash); in der
  Review-Notiz die Kalender- und Wichtel-Funktionen als App-Zweck beschreiben und einen
  Test-Login angeben.
- Die Version steht in `android/app/build.gradle` (`versionCode`/`versionName`) und in
  Xcode (*General → Version/Build*). Vor jedem Store-Upload erhöhen.

## Alternative ohne Stores: PWA

Die Web-App ist bereits eine PWA (`manifest.json`, Service Worker). Auf Android und iOS
kann sie über „Zum Home-Bildschirm“ installiert werden – ohne Store, ohne Signatur.
