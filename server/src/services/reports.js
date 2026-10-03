/* Reports of objectionable content: stored in the database and mailed to the
 * moderation address right away, so they can be handled within 24 hours. */
const crypto = require("crypto");
const config = require("../config");
const db = require("../db");
const mail = require("./mail");
const { REPORT_KINDS, REPORT_REASONS } = require("../utils/moderation");

function clean(s, max) { return String(s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max); }

async function fileReport({ kind, ref, reason, details, contact, excerpt, reporter, ip }) {
  const report = {
    id: crypto.randomBytes(8).toString("hex"),
    kind: REPORT_KINDS.includes(kind) ? kind : "other",
    ref: ref && typeof ref === "object" ? ref : {},
    reason: REPORT_REASONS[reason] ? reason : "other",
    details: clean(details, 1000),
    contact: clean(contact, 200),
    excerpt: clean(excerpt, 400),
    reporter: clean(reporter, 120),
    ip: clean(ip, 64),
    status: "open",
    createdAt: new Date().toISOString(),
  };
  await db.createReport(report);
  const to = config.moderation.email;
  if (to) {
    const lines = [
      `Art: ${report.kind}`, `Grund: ${REPORT_REASONS[report.reason]}`, report.details ? `Beschreibung: ${report.details}` : null,
      report.excerpt ? `Inhalt: ${report.excerpt}` : null, `Referenz: ${JSON.stringify(report.ref)}`, report.reporter ? `Gemeldet von: ${report.reporter}` : null,
      report.contact ? `Kontakt: ${report.contact}` : null, `Zeit: ${report.createdAt}`, "", `Bearbeiten: ${config.baseUrl}/admin/moderation.html`,
    ].filter((l) => l !== null);
    mail.sendMail({
      to, subject: `[Moderation] Neue Meldung: ${REPORT_REASONS[report.reason]} (${report.kind})`,
      text: lines.join("\n"),
      html: mail.layout("Neue Meldung", `<pre style="white-space:pre-wrap;font-family:inherit">${mail.escapeHtml(lines.join("\n"))}</pre>`),
    }).catch((e) => console.warn("[reports] Mail fehlgeschlagen:", e.message));
  }
  return report;
}

module.exports = { fileReport };
