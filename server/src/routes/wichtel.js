const express = require("express");
const db = require("../db");

const router = express.Router();

async function getCalendarByWichtelToken(token) {
  const calendars = await db.getAllCalendars();
  for (const cal of calendars) {
    if (!cal.days) continue;
    const door = cal.days.find(d => d.wichtelToken === token);
    if (door) return { calendar: cal, door };
  }
  return null;
}

router.get("/:token", async (req, res) => {
  const data = await getCalendarByWichtelToken(req.params.token);
  if (!data) return res.status(404).json({ error: "Link ungültig oder abgelaufen." });
  
  res.json({
    calendarId: data.calendar.id,
    day: data.door.day,
    contentType: data.door.contentType,
    content: data.door.content
  });
});

router.put("/:token", async (req, res) => {
  const data = await getCalendarByWichtelToken(req.params.token);
  if (!data) return res.status(404).json({ error: "Link ungültig." });
  
  const { contentType, content } = req.body;
  
  await db.updateCalendar(data.calendar.id, (cal) => {
    const idx = cal.days.findIndex(d => d.day === data.door.day);
    if (idx !== -1) {
      cal.days[idx].contentType = contentType;
      cal.days[idx].content = content;
    }
    return cal;
  });
  
  res.json({ success: true });
});

const multer = require("multer");
const path = require("path");
const config = require("../config");
const storage = multer.diskStorage({
  destination: config.paths.uploadsDir,
  filename: (req, file, cb) => cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});
const upload = multer({ storage });

router.post("/:token/upload", upload.single("file"), async (req, res) => {
  const data = await getCalendarByWichtelToken(req.params.token);
  if (!data) return res.status(404).json({ error: "Link ungültig." });
  if (!req.file) return res.status(400).json({ error: "Keine Datei." });
  res.json({ url: `/uploads/${req.file.filename}` });
});

module.exports = router;
