const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Fehlende Umgebungsvariable: ${name}. Siehe .env.example.`);
  }
  return value;
}

module.exports = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: (process.env.NODE_ENV || "development") === "production",
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  timezone: process.env.TIMEZONE || "Europe/Berlin",
  db: {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || process.env.DB_PASS || "",
    database: process.env.DB_NAME || "adventskalender",
  },
  // Base domain for subdomain-based custom URLs.
  // Set BASE_DOMAIN=adventskalender.de in production.
  // Customers get:  ihr-slug.adventskalender.de
  baseDomain: process.env.BASE_DOMAIN || "mein-adventskalender.ch",
  admin: {
    username: required("ADMIN_USERNAME", "Stibe"),
    password: required("ADMIN_PASSWORD", "change-me-please"),
  },
  jwtSecret: required("JWT_SECRET", "insecure-dev-secret-change-me"),
  paths: {
    root: path.join(__dirname, "..", ".."),
    dataFile: path.join(__dirname, "..", "data", "db.json"),
    uploadsDir: path.join(__dirname, "..", "uploads"),
    publicDir: path.join(__dirname, "..", "..", "public"),
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || '"Adventskalender" <noreply@adventskalender.local>',
  },
  push: {
    // Contact for push services (Apple, Google, Mozilla) if they need to reach the operator.
    // Falls back to the SMTP sender address.
    contact: process.env.VAPID_CONTACT || "",
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    priceId: process.env.STRIPE_PRICE_ID || "",
    // One payment per Wichtel-Runde or Wichteltür unlocks all its PRO features.
    currency: (process.env.STRIPE_CURRENCY || "chf").toLowerCase(),
    moduleAmount: Number(process.env.STRIPE_MODULE_AMOUNT || 450),
  },
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || "",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
    // Must match a Redirect URI registered in the Spotify Developer Dashboard.
    redirectUri:
      process.env.SPOTIFY_REDIRECT_URI ||
      `${process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`}/api/spotify/callback`,
  },
};
