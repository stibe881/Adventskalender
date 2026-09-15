const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const config = require("../config");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { generateToken, generateId } = require("../utils/token");
const { generateQrDataUrl } = require("../utils/qr");
const { CONTENT_TYPES, THEMES } = require("../utils/contentTypes");
const { unlockDateISO, getTodayParts } = require("../utils/time");

const router = express.Router();
router.use(requireAuth);

function makeEmptyDays() {
  return Array.from({ length: 24 }, (_, i) => ({
    day: i + 1,
    contentType: null,
    content: null,
    opened: false,
    openedAt: null,
  }));
}

function toSummary(cal) {
  const filled = cal.days.filter((d) => d.contentType).length;
  const opened = cal.days.filter((d) => d.opened).length;
  return {
    id: cal.id,
    recipientName: cal.recipientName,
    ownerName: cal.ownerName,
    theme: cal.theme,
    year: cal.year,
    customConfig: cal.customConfig,
    token: cal.token,
    shareUrl: `${config.baseUrl}/c/${cal.token}`,
    createdAt: cal.createdAt,
    filledDoors: filled,
    openedDoors: opened,
  };
}

// ---------- Calendars ----------

router.get("/calendars", (req, res) => {
  const calendars = db.getCalendarsByOwner(req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(calendars.map(toSummary));
});

router.post("/calendars", (req, res) => {
  const { recipientName, theme, year, customConfig } = req.body || {};
  if (!recipientName || !String(recipientName).trim()) {
    return res.status(400).json({ error: "Name des Beschenkten ist erforderlich." });
  }
  if (!THEMES.includes(theme)) {
    return res.status(400).json({ error: `Ungültiges Theme. Erlaubt: ${THEMES.join(", ")}` });
  }
  const parsedYear = parseInt(year, 10);
  if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2200) {
    return res.status(400).json({ error: "Ungültiges Jahr." });
  }

  const calendar = {
    id: generateId(),
    token: generateToken(),
    ownerId: req.user.id,
    ownerName: req.user.username,
    recipientName: String(recipientName).trim(),
    theme,
    customConfig: customConfig || null,
    strictMode: Boolean(req.body.strictMode),
    year: parsedYear,
    createdAt: new Date().toISOString(),
    days: makeEmptyDays(),
  };
  db.createCalendar(calendar);
  res.status(201).json(toSummary(calendar));
});

router.get("/calendars/:id", (req, res) => {
  const calendar = db.getCalendarById(req.params.id);
  if (!calendar || calendar.ownerId !== req.user.id) return res.status(404).json({ error: "Kalender nicht gefunden." });
  res.json(calendar);
});

router.put("/calendars/:id", (req, res) => {
  const { recipientName, theme, year, customConfig, strictMode } = req.body || {};
  const calendar = db.getCalendarById(req.params.id);
  if (!calendar || calendar.ownerId !== req.user.id) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const updated = db.updateCalendar(req.params.id, (cal) => {
    if (recipientName && String(recipientName).trim()) cal.recipientName = String(recipientName).trim();
    if (theme && THEMES.includes(theme)) cal.theme = theme;
    if (customConfig !== undefined) cal.customConfig = customConfig;
    if (strictMode !== undefined) cal.strictMode = Boolean(strictMode);
    if (year) {
      const parsedYear = parseInt(year, 10);
      if (Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2200) cal.year = parsedYear;
    }
    return cal;
  });
  if (!updated) return res.status(404).json({ error: "Kalender nicht gefunden." });
  res.json(toSummary(updated));
});

router.delete("/calendars/:id", (req, res) => {
  const calendar = db.getCalendarById(req.params.id);
  if (!calendar || calendar.ownerId !== req.user.id) return res.status(404).json({ error: "Kalender nicht gefunden." });
  const ok = db.deleteCalendar(req.params.id);
  if (!ok) return res.status(404).json({ error: "Kalender nicht gefunden." });
  res.json({ ok: true });
});

router.post("/calendars/:id/duplicate", (req, res) => {
  const source = db.getCalendarById(req.params.id);
  if (!source || source.ownerId !== req.user.id) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const duplicate = {
    ...source,
    id: generateId(),
    token: generateToken(),
    recipientName: `${source.recipientName} (Kopie)`,
    createdAt: new Date().toISOString(),
  };
  
  // Create deep copy of days so they don't share objects
  duplicate.days = source.days.map(d => ({
    ...d,
    content: d.content ? JSON.parse(JSON.stringify(d.content)) : null
  }));

  db.createCalendar(duplicate);
  res.status(201).json(toSummary(duplicate));
});

// Admin-only preview: bypasses the date lock so Stibe can check the
// experience before December. Never exposed on the public token route.
router.get("/calendars/:id/preview", (req, res) => {
  const calendar = db.getCalendarById(req.params.id);
  if (!calendar || calendar.ownerId !== req.user.id) return res.status(404).json({ error: "Kalender nicht gefunden." });
  res.json({
    recipientName: calendar.recipientName,
    ownerName: calendar.ownerName,
    theme: calendar.theme,
    customConfig: calendar.customConfig,
    year: calendar.year,
    today: getTodayParts(),
    preview: true,
    days: calendar.days.map((d) => ({
      day: d.day,
      unlockDate: unlockDateISO(calendar.year, d.day),
      unlocked: true,
      filled: Boolean(d.contentType),
      contentType: d.contentType,
      content: d.content,
    })),
  });
});

// ---------- Day content ----------

router.put("/calendars/:id/days/:day", async (req, res) => {
  const dayNum = parseInt(req.params.day, 10);
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 24) {
    return res.status(400).json({ error: "Ungültiger Tag (1-24)." });
  }
  const { contentType, content } = req.body || {};
  if (contentType !== null && !CONTENT_TYPES.includes(contentType)) {
    return res.status(400).json({ error: `Ungültiger Inhaltstyp. Erlaubt: ${CONTENT_TYPES.join(", ")}` });
  }

  let finalContent = content || null;
  if (contentType === "qrcode" && finalContent?.data) {
    finalContent = { ...finalContent, qrImage: await generateQrDataUrl(finalContent.data) };
  }

  const calendar = db.getCalendarById(req.params.id);
  if (!calendar || calendar.ownerId !== req.user.id) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const updated = db.updateCalendar(req.params.id, (cal) => {
    const doorIdx = cal.days.findIndex((d) => d.day === dayNum);
    cal.days[doorIdx] = {
      ...cal.days[doorIdx],
      contentType: contentType || null,
      content: contentType ? finalContent : null,
    };
    return cal;
  });

  res.json(updated.days.find((d) => d.day === dayNum));
});

// ---------- Uploads (gallery images / audio files) ----------

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.paths.uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : "";
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  },
});

const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp)|audio\/(mpeg|mp3|wav|ogg|x-m4a|mp4))$/;

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.test(file.mimetype)) {
      return cb(new Error("Dateityp nicht erlaubt. Erlaubt: Bilder (png/jpg/gif/webp) und Audio (mp3/wav/ogg/m4a)."));
    }
    cb(null, true);
  },
});

router.post("/upload", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Keine Datei erhalten." });
    res.json({ url: `/uploads/${req.file.filename}`, originalName: req.file.originalname });
  });
});

module.exports = router;
