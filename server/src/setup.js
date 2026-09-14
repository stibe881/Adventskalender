const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..", "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

if (fs.existsSync(envPath)) {
  console.log("ℹ️  .env existiert bereits – es wird nichts überschrieben.");
  process.exit(0);
}

let content = fs.readFileSync(examplePath, "utf-8");
const randomSecret = crypto.randomBytes(32).toString("hex");
content = content.replace("JWT_SECRET=change-this-to-a-long-random-string", `JWT_SECRET=${randomSecret}`);

fs.writeFileSync(envPath, content);
console.log("✅ .env wurde erstellt mit einem zufällig generierten JWT_SECRET.");
console.log("👉 Bitte jetzt ADMIN_USERNAME und ADMIN_PASSWORD in der .env anpassen, bevor du startest.");
