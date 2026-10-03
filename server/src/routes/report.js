/* Anyone can report objectionable content from inside the app; see
 * services/reports.js for what happens with it. */
const express = require("express");
const rateLimit = require("express-rate-limit");
const { fileReport } = require("../services/reports");
const { REPORT_KINDS, REPORT_REASONS } = require("../utils/moderation");

const router = express.Router();
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));

router.get("/reasons", (req, res) => res.json({ kinds: REPORT_KINDS, reasons: REPORT_REASONS }));

router.post("/", async (req, res) => {
  const b = req.body || {};
  if (!b.kind || !REPORT_KINDS.includes(b.kind)) return res.status(400).json({ error: "Unbekannte Art der Meldung." });
  if (!b.reason && !b.details) return res.status(400).json({ error: "Bitte gib einen Grund an." });
  const report = await fileReport({ kind: b.kind, ref: b.ref, reason: b.reason, details: b.details, contact: b.contact, excerpt: b.excerpt, reporter: b.reporter, ip: req.ip });
  res.status(201).json({ ok: true, id: report.id });
});

module.exports = router;
