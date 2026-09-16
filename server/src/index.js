const express = require("express");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const config = require("./config");

// Prevent server crash on unhandled promise rejections (Node.js v15+ exits by default)
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION] Server bleibt aktiv:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION] Server bleibt aktiv:", err);
});

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const calendarRoutes = require("./routes/calendar");
const { startCron } = require("./cron");
const { initWebPush } = require("./push");

if (!fs.existsSync(config.paths.uploadsDir)) fs.mkdirSync(config.paths.uploadsDir, { recursive: true });

initWebPush();

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

// Start cron
startCron();
app.use("/api/wichtel", require("./routes/wichtel"));

// Public config endpoint so the frontend knows the base domain
app.get("/api/config", (req, res) => {
  res.json({ baseDomain: config.baseDomain });
});

app.get("/api/global-stats", async (req, res) => {
  const db = require("./db");
  const calendars = await db.getAllCalendars();
  let totalOpened = 0;
  calendars.forEach(c => {
    c.days.forEach(d => {
      if (d.opened) totalOpened++;
    });
  });
  res.json({ totalOpened });
});

// Static assets
app.use(express.static(config.paths.publicDir));
app.use("/uploads", express.static(config.paths.uploadsDir));
app.use("/vendor/gsap", express.static(path.join(config.paths.root, "node_modules", "gsap", "dist")));

// ── Custom Domain Middleware ─────────────────────────────────────────────────  // 🌟 Subdomain Middleware 🌟
// If a request arrives on a subdomain (e.g. firma.adventskalender.de),
// look up the calendar whose customConfig.subdomain matches, then transparently serve
// the right calendar SPA. API calls (/api/*) still pass through normally so
// that calendar.js works without any extra config.
app.use(async (req, res, next) => {
  const host = (req.headers.host || "").split(":")[0]; // strip port

  // Skip: API/asset path
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/uploads/") ||
    req.path.startsWith("/vendor/")
  ) {
    return next();
  }

  // Determine subdomain
  const baseDomain = config.baseDomain;
  let subdomain = null;
  
  // Check if host ends with .baseDomain
  if (baseDomain && baseDomain !== "localhost" && host.endsWith("." + baseDomain)) {
    subdomain = host.substring(0, host.length - baseDomain.length - 1);
  } else if (host !== baseDomain && host !== "localhost" && host !== "127.0.0.1") {
    // Allow fallback if they use a full CNAME that isn't the baseDomain (legacy behavior)
    subdomain = host; 
  }
  
  if (!subdomain) return next();

  try {
    const db = require("./db");
    const calendar = await db.getCalendarBySubdomain(subdomain) || await db.getCalendarBySubdomain(host); // Fallback to host for exact matches

    if (!calendar) return next(); // unknown domain -> fall through to 404

    // Serve the calendar SPA for HTML requests (browser page loads)
    if (req.path === "/" || req.path === "") {
      return res.sendFile(require("path").join(config.paths.publicDir, "calendar", "index.html"));
    }
  } catch (err) {
    console.error("[Middleware] Datenbank-Fehler beim Subdomain-Lookup:", err);
    return next();
  }

  // Rewrite /c/:token style if someone navigates there
  if (req.path.startsWith("/c/")) {
    return res.sendFile(path.join(config.paths.publicDir, "calendar", "index.html"));
  }

  next();
});

// Inject calendar token for subdomain requests so calendar.js
// knows which calendar to load without needing /c/:token in the URL.
app.get("/api/calendar/by-domain", async (req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  const baseDomain = config.baseDomain;
  let subdomain = null;
  if (baseDomain && baseDomain !== "localhost" && host.endsWith("." + baseDomain)) {
    subdomain = host.substring(0, host.length - baseDomain.length - 1);
  } else {
    subdomain = host;
  }

  try {
    const db = require("./db");
    const calendar = await db.getCalendarBySubdomain(subdomain) || await db.getCalendarBySubdomain(host);
    if (!calendar) return res.status(404).json({ error: "Kein Kalender für diese Domain gefunden." });
    res.json({ token: calendar.token });
  } catch (err) {
    console.error("[/api/calendar/by-domain] DB-Fehler:", err.message);
    res.status(503).json({ error: "Datenbank nicht erreichbar." });
  }
});

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

const http = require("http");
const { initSocket } = require("./socket");

// Create HTTP server instead of listening directly on app
const server = http.createServer(app);
initSocket(server);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Interner Serverfehler." });
});

server.listen(config.port, () => {
  console.log(`🎄 Adventskalender läuft auf ${config.baseUrl} (Timezone: ${config.timezone})`);
});
