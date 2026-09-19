const crypto = require("crypto");
const cfg = require("../wichteln/config");

// Kept for callers that import the constants from here.
const MAX_PARTICIPANTS = cfg.maxParticipants;
const RETENTION_OPTIONS = cfg.retentionOptions;
const GIFT_STEPS = cfg.giftSteps;
const GIFT_STEP_LABELS = cfg.giftStepLabels;

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
}

function cleanText(v, max = 200) {
  return String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

function shortToken() {
  return crypto.randomBytes(cfg.participantTokenBytes).toString("base64url");
}

/**
 * Draws a random assignment where nobody draws themselves and no excluded
 * pair draws each other. Random shuffles first; if the exclusions make
 * that unlikely, a randomised backtracking search finds a valid cycle or
 * proves that none exists.
 */
function drawAssignments(ids, exclusions = []) {
  const n = ids.length;
  if (n < 2) return null;
  const blocked = new Set();
  for (const [a, b] of exclusions) {
    blocked.add(`${a}>${b}`);
    blocked.add(`${b}>${a}`);
  }
  const allowed = (g, r) => g !== r && !blocked.has(`${g}>${r}`);

  for (let attempt = 0; attempt < 200; attempt++) {
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    const ok = shuffled.every((g, i) => allowed(g, shuffled[(i + 1) % n]));
    if (ok) {
      const map = {};
      shuffled.forEach((g, i) => (map[g] = shuffled[(i + 1) % n]));
      return map;
    }
  }

  // Backtracking: build a bijection givers -> receivers.
  const givers = [...ids].sort(() => Math.random() - 0.5);
  const used = new Set();
  const map = {};
  const order = givers.map((g) => ({ g, options: ids.filter((r) => allowed(g, r)).sort(() => Math.random() - 0.5) }))
    .sort((a, b) => a.options.length - b.options.length);
  function solve(i) {
    if (i === order.length) return true;
    const { g, options } = order[i];
    for (const r of options) {
      if (used.has(r)) continue;
      used.add(r);
      map[g] = r;
      if (solve(i + 1)) return true;
      used.delete(r);
      delete map[g];
    }
    return false;
  }
  return solve(0) ? map : null;
}

function buildIcs({ uid, title, description, date, time, location, url }) {
  const pad = (n) => String(n).padStart(2, "0");
  const [y, m, d] = date.split("-").map(Number);
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  let dtStart;
  let dtEnd;
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const [hh, mm] = time.split(":").map(Number);
    dtStart = `DTSTART:${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
    const endH = Math.min(23, hh + 2);
    dtEnd = `DTEND:${y}${pad(m)}${pad(d)}T${pad(endH)}${pad(mm)}00`;
  } else {
    dtStart = `DTSTART;VALUE=DATE:${y}${pad(m)}${pad(d)}`;
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    dtEnd = `DTEND;VALUE=DATE:${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
  }
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Advently//Wichteln//DE",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${esc(title)}`,
    description ? `DESCRIPTION:${esc(description)}` : null,
    location ? `LOCATION:${esc(location)}` : null,
    url ? `URL:${url}` : null,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc("Morgen ist Wichtel-Bescherung!")}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

module.exports = { MAX_PARTICIPANTS, RETENTION_OPTIONS, GIFT_STEPS, GIFT_STEP_LABELS, isEmail, cleanText, shortToken, drawAssignments, buildIcs };
