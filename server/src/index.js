const express = require("express");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const config = require("./config");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const calendarRoutes = require("./routes/calendar");

if (!fs.existsSync(config.paths.uploadsDir)) fs.mkdirSync(config.paths.uploadsDir, { recursive: true });

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // relaxed for CDN-free local/dev use; tighten for production hosting.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Static assets
app.use(express.static(config.paths.publicDir));
app.use("/uploads", express.static(config.paths.uploadsDir));
app.use("/vendor/gsap", express.static(path.join(config.paths.root, "node_modules", "gsap", "dist")));

// API
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/calendar", calendarRoutes);

// Pretty recipient URL: /c/:token -> calendar SPA page
app.get("/c/:token", (req, res) => {
  res.sendFile(path.join(config.paths.publicDir, "calendar", "index.html"));
});

// Admin-only preview (bypasses the date lock) reuses the same SPA, but is
// keyed by calendar id and requires the admin session cookie to load data.
app.get("/c/preview/:id", (req, res) => {
  res.sendFile(path.join(config.paths.publicDir, "calendar", "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ error: "Nicht gefunden." });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Interner Serverfehler." });
});

app.listen(config.port, () => {
  console.log(`🎄 Adventskalender läuft auf ${config.baseUrl} (Timezone: ${config.timezone})`);
});
