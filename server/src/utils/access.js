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
  return {
    day: BONUS_DOOR_DAY,
    contentType: configured ? stored.contentType : DEFAULT_BONUS_CONTENT.contentType,
    content: configured ? stored.content : DEFAULT_BONUS_CONTENT.content,
    configured,
    opened: Boolean(stored.opened),
    openedAt: stored.openedAt || null,
  };
}

function bonusDoorUnlocked(calendar) {
  return (calendar?.referrals || 0) >= BONUS_REFERRALS_NEEDED;
}

module.exports = {
  hasAccess,
  resolveCompanyName,
  communityCanvasEnabled,
  BONUS_DOOR_DAY,
  BONUS_REFERRALS_NEEDED,
  getBonusDoor,
  bonusDoorUnlocked,
};
