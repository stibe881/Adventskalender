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
  
  webpush.setVapidDetails(
    "mailto:admin@adventskalender.local",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  
  console.log("🔔 Web-Push VAPID keys loaded.");
}

function getVapidPublicKey() {
  return vapidKeys ? vapidKeys.publicKey : null;
}

async function sendPushNotification(subscription, payload) {
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}

module.exports = { initWebPush, getVapidPublicKey, sendPushNotification };
