const config = require("../config");

/**
 * Returns { year, month, day } for "now" in the given IANA timezone.
 * Uses Intl so we never depend on the server host's local timezone.
 */
function getTodayParts(timeZone = config.timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * A door for `day` of a calendar for `calendarYear` (always December) is
 * unlocked once "today" (server-side, timezone-aware) is on or after
 * Dec <day> <calendarYear>. This MUST only ever be evaluated on the server —
 * never trust a client-supplied date.
 */
function isDayUnlocked(calendarYear, day, timeZone = config.timezone) {
  const today = getTodayParts(timeZone);
  if (today.year !== calendarYear) return today.year > calendarYear;
  if (today.month !== 12) return today.month > 12;
  return today.day >= day;
}

function unlockDateISO(calendarYear, day) {
  return new Date(Date.UTC(calendarYear, 11, day)).toISOString().slice(0, 10);
}

/**
 * Epoch milliseconds of midnight (start of Dec <day>) in the configured
 * timezone, so clients can count down without knowing the server's zone.
 */
function unlockAtMs(calendarYear, day, timeZone = config.timezone) {
  const utcGuess = Date.UTC(calendarYear, 11, day, 0, 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcGuess));
  const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return utcGuess - (asIfUtc - utcGuess);
}

// ── Calendars with a custom period ─────────────────────────────────────────
// `calendar.period = { start, end }` (ISO dates) replaces "1–24 December of
// calendar.year". Door n is the n-th day of the period.
const MAX_PERIOD_DAYS = 62;
const pad2 = (n) => String(n).padStart(2, "0");
const isoOf = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
function addDaysIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
function todayIso(timeZone = config.timezone) {
  const t = getTodayParts(timeZone);
  return isoOf(t.year, t.month, t.day);
}
/** Validates { start, end } from a request; null for an Advent calendar, a string for an error. */
function parsePeriod(b) {
  if (!b || typeof b !== "object" || !b.start || !b.end) return null;
  const ok = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  if (!ok(b.start) || !ok(b.end)) return "Bitte ein gültiges Start- und Enddatum wählen.";
  const n = daysBetween(b.start, b.end) + 1;
  if (n < 2) return "Das Ende muss nach dem Anfang liegen (mindestens 2 Tage).";
  if (n > MAX_PERIOD_DAYS) return `Höchstens ${MAX_PERIOD_DAYS} Tage sind möglich.`;
  return { start: String(b.start), end: String(b.end) };
}
function dayCount(calendar) {
  return calendar?.period ? daysBetween(calendar.period.start, calendar.period.end) + 1 : 24;
}
/** ISO date on which door `day` opens. */
function doorDateISO(calendar, day) {
  return calendar?.period ? addDaysIso(calendar.period.start, day - 1) : unlockDateISO(calendar.year, day);
}
function isDoorUnlocked(calendar, day, timeZone = config.timezone) {
  return todayIso(timeZone) >= doorDateISO(calendar, day);
}
/** Midnight (start of the door's date) in the configured timezone, as epoch ms. */
function doorUnlockAtMs(calendar, day, timeZone = config.timezone) {
  const [y, m, d] = doorDateISO(calendar, day).split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcGuess));
  const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return utcGuess - (asIfUtc - utcGuess);
}
/** Which door belongs to today (1-based), or null outside the calendar's days. */
function todayDoor(calendar, timeZone = config.timezone) {
  const first = doorDateISO(calendar, 1);
  const n = daysBetween(first, todayIso(timeZone)) + 1;
  return n >= 1 && n <= dayCount(calendar) ? n : null;
}
/** "1.–24. Dezember 2026" or "12.3.–20.3.2027". */
function periodLabel(calendar) {
  if (!calendar?.period) return `1.–24. Dezember ${calendar?.year}`;
  const f = (iso) => { const [y, m, d] = iso.split("-"); return `${Number(d)}.${Number(m)}.${y}`; };
  return `${f(calendar.period.start)} – ${f(calendar.period.end)}`;
}

module.exports = { getTodayParts, isDayUnlocked, unlockDateISO, unlockAtMs, MAX_PERIOD_DAYS, parsePeriod, dayCount, doorDateISO, isDoorUnlocked, doorUnlockAtMs, todayDoor, todayIso, periodLabel, addDaysIso };
