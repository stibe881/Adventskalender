const webpush = require("web-push");
const fs = require("fs");
const path = require("path");
const config = require("./config");

const vapidKeysPath = path.join(__dirname, "..", "data", "vapid.json");

let vapidKeys = null;

function initWebPush() {
  if (fs.existsSync(vapidKeysPath)) {
    vapidKeys = JSON.parse(fs.readFileSync(vapidKeysPath, "utf-8"));
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidKeysPath, JSON.stringify(vapidKeys, null, 2));
  }
  
  webpush.setVapidDetails(vapidContact(), vapidKeys.publicKey, vapidKeys.privateKey);
  
  console.log("🔔 Web-Push VAPID keys loaded.");
}

// VAPID needs a "mailto:" or "https:" contact. Use VAPID_CONTACT, otherwise the
// address inside SMTP_FROM, otherwise a placeholder that at least keeps push working.
function vapidContact() {
  const configured = String(config.push?.contact || "").trim();
  if (/^(mailto:|https:\/\/)/i.test(configured)) return configured;
  if (configured.includes("@")) return `mailto:${configured}`;
  const fromAddr = (String(config.smtp?.from || "").match(/<([^>]+)>/) || [])[1] || String(config.smtp?.from || "").trim();
  if (fromAddr.includes("@") && !/adventskalender\.local$/i.test(fromAddr)) return `mailto:${fromAddr}`;
  console.warn("⚠️  Kein Push-Kontakt konfiguriert – bitte VAPID_CONTACT in .env setzen.");
  return "mailto:admin@adventskalender.local";
}

function getVapidPublicKey() {
  return vapidKeys ? vapidKeys.publicKey : null;
}

async function sendPushNotification(subscription, payload) {
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}

module.exports = { initWebPush, getVapidPublicKey, sendPushNotification };
