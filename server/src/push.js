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

// Sends to a browser (Web Push) or to the native app (Expo push token).
async function sendPushNotification(subscription, payload) {
  if (subscription && subscription.expoToken) return sendExpoPush(subscription.expoToken, payload);
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}

async function sendExpoPush(token, payload) {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ to: token, title: payload.title, body: payload.body, sound: "default", data: { url: payload.url || "/" } }),
  });
  const json = await res.json().catch(() => ({}));
  const ticket = json.data && (Array.isArray(json.data) ? json.data[0] : json.data);
  if (!res.ok || (ticket && ticket.status === "error")) {
    const err = new Error(ticket?.message || json.errors?.[0]?.message || `Expo push HTTP ${res.status}`);
    // Same contract as web-push: 410 tells the caller to drop the subscription.
    if (ticket?.details?.error === "DeviceNotRegistered") err.statusCode = 410;
    throw err;
  }
  return ticket;
}

function isExpoPushToken(v) {
  return typeof v === "string" && /^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/.test(v);
}

module.exports = { initWebPush, getVapidPublicKey, sendPushNotification, isExpoPushToken };
