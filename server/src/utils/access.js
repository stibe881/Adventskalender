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

module.exports = { hasAccess, resolveCompanyName, communityCanvasEnabled };
