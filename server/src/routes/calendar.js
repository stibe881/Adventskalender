const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { isDayUnlocked, unlockDateISO, getTodayParts } = require("../utils/time");

const router = express.Router();

const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(tokenLimiter);

function publicDayView(calendar, door) {
  const unlocked = calendar.strictMode ? isDayUnlocked(calendar.year, door.day) : true;
  const base = {
    day: door.day,
    unlockDate: unlockDateISO(calendar.year, door.day),
    unlocked,
    opened: door.opened,
    filled: Boolean(door.contentType),
  };
  if (door.opened) {
    base.contentType = door.contentType || "empty";
    base.content = door.content;
  }
  return base;
}

router.get("/:token", (req, res) => {
  const calendar = db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Dieser Kalender existiert nicht." });

  res.json({
    recipientName: calendar.recipientName,
    ownerName: calendar.ownerName,
    theme: calendar.theme,
    customConfig: calendar.customConfig,
    year: calendar.year,
    today: getTodayParts(),
    days: calendar.days.map((d) => publicDayView(calendar, d)),
  });
});

router.post("/:token/days/:day/open", (req, res) => {
  const calendar = db.getCalendarByToken(req.params.token);
  if (!calendar) return res.status(404).json({ error: "Dieser Kalender existiert nicht." });

  const dayNum = parseInt(req.params.day, 10);
  const door = calendar.days.find((d) => d.day === dayNum);
  if (!door) return res.status(400).json({ error: "Ungültiges Türchen." });

  // Server-side-only truth: never trust any date the client might send.
  const unlocked = calendar.strictMode ? isDayUnlocked(calendar.year, dayNum) : true;
  if (!unlocked) {
    return res.status(403).json({
      error: "Noch nicht so weit! Dieses Türchen öffnet sich erst am " + unlockDateISO(calendar.year, dayNum) + ".",
      unlockDate: unlockDateISO(calendar.year, dayNum),
    });
  }

  const updated = db.updateCalendar(calendar.id, (cal) => {
    const idx = cal.days.findIndex((d) => d.day === dayNum);
    if (!cal.days[idx].opened) {
      cal.days[idx].opened = true;
      cal.days[idx].openedAt = new Date().toISOString();
    }
    return cal;
  });

  const openedDoor = updated.days.find((d) => d.day === dayNum);
  res.json({
    day: openedDoor.day,
    contentType: openedDoor.contentType || "empty",
    content: openedDoor.content,
  });
});

module.exports = router;
