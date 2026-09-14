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
};
