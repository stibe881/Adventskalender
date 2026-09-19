#!/usr/bin/env node
// Sets the server URL the native app loads:  node configure.js --url https://adventskalender.meine-domain.ch
// For local testing on a phone in the same Wi-Fi:  node configure.js --url http://192.168.1.20:3000
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const idx = args.indexOf("--url");
const url = idx >= 0 ? args[idx + 1] : null;
if (!url || !/^https?:\/\//.test(url)) {
  console.error("Bitte eine URL angeben, z. B.: node configure.js --url https://adventskalender.meine-domain.ch");
  process.exit(1);
}
const file = path.join(__dirname, "capacitor.config.json");
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
cfg.server = cfg.server || {};
cfg.server.url = url.replace(/\/+$/, "");
cfg.server.cleartext = url.startsWith("http://");
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
console.log(`✔ server.url = ${cfg.server.url}${cfg.server.cleartext ? "  (cleartext erlaubt – nur für lokale Tests!)" : ""}`);
// Keep the Android App-Link host in sync (only for https hosts).
const manifest = path.join(__dirname, "android", "app", "src", "main", "AndroidManifest.xml");
const host = new URL(cfg.server.url).hostname;
if (fs.existsSync(manifest) && !cfg.server.cleartext) {
  const xml = fs.readFileSync(manifest, "utf8").replace(/android:host="[^"]+"/g, `android:host="${host}"`);
  fs.writeFileSync(manifest, xml);
  console.log(`✔ Android App-Links auf ${host} gesetzt`);
}
console.log("Jetzt: npx cap sync");
