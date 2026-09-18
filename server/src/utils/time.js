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

module.exports = { getTodayParts, isDayUnlocked, unlockDateISO, unlockAtMs };
