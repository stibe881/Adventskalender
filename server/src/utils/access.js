function hasAccess(calendar, user) {
  if (!calendar || !user) return false;
  if (calendar.ownerId === user.id) return true;
  if (calendar.collaborators && calendar.collaborators.includes(user.email)) return true;
  return false;
}

// Company name shown to employees of a "firma" calendar: the owner's company
// from their account profile, falling back to the calendar's recipient name.
async function resolveCompanyName(calendar) {
  if (!calendar) return null;
  try {
    const db = require("../db");
    const owner = calendar.ownerId ? await db.getUserById(calendar.ownerId) : null;
    if (owner?.company && String(owner.company).trim()) return String(owner.company).trim();
  } catch (err) {
    console.error("[access] Firmenname konnte nicht ermittelt werden:", err.message);
  }
  return calendar.recipientName || null;
}

// The shared pixel canvas is a company feature; firma calendars have it on
// unless the owner switched it off.
function communityCanvasEnabled(calendar) {
  return Boolean(calendar) && calendar.theme === "firma" && calendar.communityCanvas !== false;
}

// Secret door 25: unlocked once the recipient has invited three friends.
// Its content is configured by the owner (cal.bonusDoor); without a
// configuration a friendly default thank-you is shown.
const BONUS_DOOR_DAY = 25;
const BONUS_REFERRALS_NEEDED = 3;
const DEFAULT_BONUS_CONTENT = {
  contentType: "text",
  content: {
    message: "Wahnsinn! Du hast 3 Freunde eingeladen! Als Dankeschön: Hier ist dein geheimes 25. Türchen!",
    sender: "Team Adventskalender",
  },
};

function getBonusDoor(calendar) {
  const stored = calendar?.bonusDoor || {};
  const configured = Boolean(stored.contentType);
  const rule = bonusRule(calendar);
  const fallbackMessage = {
    referrals: `Wahnsinn! Du hast ${rule.count} ${rule.count === 1 ? "Freund" : "Freunde"} eingeladen! Als Dankeschön: Hier ist dein geheimes 25. Türchen!`,
    allOpened: "Alle 24 Türchen offen – und hier ist noch eines obendrauf. Frohe Weihnachten!",
    date: "Überraschung! Ein geheimes 25. Türchen, nur für dich.",
    always: "Ein geheimes 25. Türchen, nur für dich.",
    never: DEFAULT_BONUS_CONTENT.content.message,
  }[rule.mode];
  return {
    day: BONUS_DOOR_DAY,
    contentType: configured ? stored.contentType : DEFAULT_BONUS_CONTENT.contentType,
    content: configured ? stored.content : { ...DEFAULT_BONUS_CONTENT.content, message: fallbackMessage },
    configured,
    opened: Boolean(stored.opened),
    openedAt: stored.openedAt || null,
  };
}

/* When door 25 appears. The owner picks the rule in the editor:
 *   referrals  – after N invited friends (the original behaviour, N = 3)
 *   allOpened  – once all 24 doors are open
 *   date       – from a date on (default 25 December of the calendar year)
 *   always     – from the start
 *   never      – door 25 is switched off */
const BONUS_MODES = ["referrals", "allOpened", "date", "always", "never"];
function bonusRule(calendar) {
  const raw = calendar?.bonusUnlock || {};
  const mode = BONUS_MODES.includes(raw.mode) ? raw.mode : "referrals";
  const count = Math.max(1, Math.min(50, parseInt(raw.count, 10) || BONUS_REFERRALS_NEEDED));
  const year = calendar?.year || new Date().getFullYear();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date || "") ? raw.date : `${year}-12-25`;
  return { mode, count, date };
}
function cleanBonusRule(b, calendar) {
  return bonusRule({ ...calendar, bonusUnlock: { mode: b?.mode, count: b?.count, date: b?.date } });
}
function openedCount(calendar, user) {
  if (calendar?.companyMode && user) {
    const st = calendar.userStates && calendar.userStates[user];
    return (st?.openedDays || []).filter((d) => d >= 1 && d <= 24).length;
  }
  return (calendar?.days || []).filter((d) => d.day <= 24 && d.opened).length;
}
function todayIso() {
  const { getTodayParts } = require("./time");
  const t = getTodayParts();
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}
function bonusDoorUnlocked(calendar, user) {
  const rule = bonusRule(calendar);
  switch (rule.mode) {
    case "referrals": return (calendar?.referrals || 0) >= rule.count;
    case "allOpened": return openedCount(calendar, user) >= 24;
    case "date": return todayIso() >= rule.date;
    case "always": return true;
    default: return false;
  }
}
/** What the recipient sees while the door is still hidden (null when nothing to tell). */
function bonusDoorStatus(calendar, user) {
  const rule = bonusRule(calendar);
  const unlocked = bonusDoorUnlocked(calendar, user);
  const [y, m, d] = rule.date.split("-");
  const hint = {
    referrals: `Lade ${rule.count} ${rule.count === 1 ? "Freund" : "Freunde"} ein, dann öffnet sich ein geheimes Türchen 25.`,
    allOpened: "Wenn alle 24 Türchen offen sind, erscheint ein geheimes Türchen 25.",
    date: `Ab dem ${Number(d)}.${Number(m)}.${y} erscheint ein geheimes Türchen 25.`,
    always: "",
    never: "",
  }[rule.mode];
  return { mode: rule.mode, count: rule.count, date: rule.date, unlocked, hint, referrals: calendar?.referrals || 0, opened: openedCount(calendar, user) };
}

module.exports = {
  hasAccess,
  resolveCompanyName,
  communityCanvasEnabled,
  BONUS_DOOR_DAY,
  BONUS_REFERRALS_NEEDED,
  getBonusDoor,
  bonusDoorUnlocked,
  bonusDoorStatus,
  bonusRule,
  cleanBonusRule,
  BONUS_MODES,
};
