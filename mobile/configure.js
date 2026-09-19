#!/usr/bin/env node
// Sets the server the app loads and keeps deep-link hosts in sync:
//   node configure.js --url https://adventskalender.meine-domain.ch
// For tests on a phone in the same Wi-Fi: node configure.js --url http://192.168.1.20:3000
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const idx = args.indexOf("--url");
const url = idx >= 0 ? args[idx + 1] : null;
if (!url || !/^https?:\/\//.test(url)) {
  console.error("Bitte eine URL angeben, z. B.: node configure.js --url https://adventskalender.meine-domain.ch");
  process.exit(1);
}
const file = path.join(__dirname, "app.json");
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
const clean = url.replace(/\/+$/, "");
const host = new URL(clean).hostname;
cfg.expo.extra = cfg.expo.extra || {};
cfg.expo.extra.serverUrl = clean;
if (clean.startsWith("https://")) {
  cfg.expo.ios.associatedDomains = [`applinks:${host}`];
  cfg.expo.android.intentFilters = [
    {
      action: "VIEW",
      autoVerify: true,
      data: ["/c/", "/w/", "/admin/"].map((pathPrefix) => ({ scheme: "https", host, pathPrefix })),
      category: ["BROWSABLE", "DEFAULT"],
    },
  ];
  delete cfg.expo.android.usesCleartextTraffic;
} else {
  cfg.expo.android.usesCleartextTraffic = true;
}
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
console.log(`✔ serverUrl = ${clean}`);
console.log(clean.startsWith("https://") ? `✔ Deep Links (App Links / Universal Links) auf ${host} gesetzt` : "⚠ Klartext-HTTP nur für lokale Tests – für Store-Builds eine HTTPS-URL setzen.");
