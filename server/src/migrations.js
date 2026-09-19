/* One-off data migrations, run at start-up. Every step is idempotent and
 * only writes rows that actually change, so running them again is cheap. */
const db = require("./db");

const LEGACY_REACTIONS = { "❤️": "heart", "😂": "laugh", "🥺": "touched", "🎉": "party" };

/** Calendar reactions used to be stored as emojis; the UI now uses keys. */
function normalizeReactions(cal) {
  let changed = false;
  for (const day of cal.days || []) {
    const list = day.feedback?.reactions;
    if (!Array.isArray(list)) continue;
    const next = list.map((r) => LEGACY_REACTIONS[r] || r);
    if (next.some((v, i) => v !== list[i])) {
      day.feedback.reactions = next;
      changed = true;
    }
  }
  return changed;
}

/** Fields added to Wichtel rounds and participants after the first release. */
function completeWichtelGroup(group) {
  let changed = false;
  const set = (obj, key, value) => {
    if (obj[key] === undefined || obj[key] === null) {
      obj[key] = value;
      changed = true;
    }
  };
  set(group, "thanks", []);
  set(group, "wishlistsShared", false);
  set(group, "giftReminderSentFor", []);
  for (const p of group.participants || []) {
    if (!p.notify || typeof p.notify !== "object") {
      p.notify = { email: true, push: true };
      changed = true;
    } else if (p.notify.push === undefined) {
      p.notify.push = true;
      changed = true;
    }
    set(p, "lastRead", {});
    set(p, "subscriptions", []);
    if (!p.giftStatus || typeof p.giftStatus !== "object") {
      p.giftStatus = { method: "personal", steps: [], updatedAt: null };
      changed = true;
    } else if (p.giftStatus.updatedAt === undefined) {
      p.giftStatus.updatedAt = null;
      changed = true;
    }
  }
  return changed;
}

async function runMigrations() {
  const stats = { calendars: 0, wichtelGroups: 0 };
  for (const cal of await db.getAllCalendars()) {
    if (!normalizeReactions(cal)) continue;
    await db.updateCalendar(cal.id, (c) => { normalizeReactions(c); return c; });
    stats.calendars++;
  }
  for (const group of await db.getAllWichtelGroups()) {
    if (!completeWichtelGroup(group)) continue;
    await db.updateWichtelGroup(group.id, (g) => { completeWichtelGroup(g); return g; });
    stats.wichtelGroups++;
  }
  if (stats.calendars || stats.wichtelGroups) console.log(`[Migration] ${stats.calendars} Kalender, ${stats.wichtelGroups} Wichtel-Runden aktualisiert.`);
  return stats;
}

module.exports = { runMigrations, normalizeReactions, completeWichtelGroup };
