const cron = require("node-cron");
const db = require("./db");
const config = require("./config");
const nodemailer = require("nodemailer");
const { getTodayParts } = require("./utils/time");
const { sendPushNotification } = require("./push");

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

// Track which calendars already received the push reminder today
// (reset automatically at midnight)
const pushedToday = new Set();

function startCron() {
  // ── Wichteln: Erinnerung am Vortag + automatische Löschung (08:00) ─────────
  cron.schedule("0 8 * * *", async () => {
    try {
      await runWichtelJobs();
    } catch (err) {
      console.error("[CRON] Wichtel-Job fehlgeschlagen:", err);
    }
  }, { timezone: config.timezone });

  // ── Tägliche E-Mail-Erinnerung: 07:00 Uhr ─────────────────────────────────
  cron.schedule("0 7 * * *", async () => {
    console.log("[CRON] Starte täglichen E-Mail-Erinnerungs-Job...");
    pushedToday.clear(); // Reset Push-Tracker täglich um 07:00

    const { month, day } = getTodayParts();
    if (month !== 12 || day > 24) {
      console.log("[CRON] Nicht im Dezember (1-24), überspringe Mails.");
      return;
    }

    const calendars = await db.getAllCalendars();
    for (const cal of calendars) {
      if (!cal.recipientEmail) continue;

      const currentDoor = cal.days.find(d => d.day === day);
      if (!currentDoor || currentDoor.opened) continue;

      const link = `${config.baseUrl}/c/${cal.token}`;

      try {
        if (config.smtp.host && config.smtp.user && config.smtp.user !== "dein_ethereal_user@ethereal.email") {
          await transporter.sendMail({
            from: config.smtp.from,
            to: cal.recipientEmail,
            subject: `Türchen ${day} wartet auf dich!`,
            text: `Hallo ${cal.recipientName}!\n\nDein Adventskalender-Türchen Nummer ${day} ist jetzt verfügbar.\n\nKlicke hier, um es zu öffnen:\n${link}\n\nViel Spaß!`,
            html: `<p>Hallo ${cal.recipientName}!</p><p>Dein Adventskalender-Türchen Nummer <strong>${day}</strong> ist jetzt verfügbar.</p><p><a href="${link}">Klicke hier, um es zu öffnen</a></p><p>Viel Spaß!</p>`,
          });
          console.log(`[CRON] Mail gesendet an: ${cal.recipientEmail}`);
        } else {
          console.log(`[CRON] SIMULATION: Erinnerung für Türchen ${day} an ${cal.recipientEmail} (${link})`);
        }
      } catch (err) {
        console.error(`[CRON] Fehler beim Senden an ${cal.recipientEmail}:`, err);
      }
    }
  }, { timezone: config.timezone });

  // ── Wichteltür: abendliche Erinnerung an die Eltern (minütlich geprüft) ───
  cron.schedule("* * * * *", async () => {
    try {
      await runElfReminders();
    } catch (err) {
      console.error("[CRON] Wichteltür-Erinnerung fehlgeschlagen:", err);
    }
  }, { timezone: config.timezone });

  // ── Minütlicher Check: Per-Kalender Push-Erinnerungen ─────────────────────
  // Prüft jede Minute ob ein Kalender jetzt seine konfigurierte Push-Zeit hat.
  cron.schedule("* * * * *", async () => {
    const { month, day } = getTodayParts();
    if (month !== 12 || day > 24) return;

    // Aktuelle Zeit in der konfigurierten Zeitzone (HH:MM)
    const nowStr = new Date().toLocaleTimeString("de-DE", {
      timeZone: config.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }); // z.B. "08:00"

    const calendars = await db.getAllCalendars();
    for (const cal of calendars) {
      const cfg = cal.customConfig || {};
      if (!cfg.dailyReminderEnabled) continue;

      const reminderTime = cfg.dailyReminderTime || "08:00"; // default 08:00
      if (nowStr !== reminderTime) continue;

      // Nicht doppelt senden
      const key = `${cal.id}-${day}`;
      if (pushedToday.has(key)) continue;

      // Türchen heute schon geöffnet? Dann keine Erinnerung nötig
      const currentDoor = cal.days.find(d => d.day === day);
      if (currentDoor && currentDoor.opened) continue;

      const subs = cal.subscriptions || [];
      if (subs.length === 0) continue;

      pushedToday.add(key);

      const title = `Türchen ${day} wartet auf dich!`;
      const body = `Hallo ${cal.recipientName || ""}! Öffne heute dein Adventskalender-Türchen.`;

      console.log(`[CRON] Sende Push für Kalender ${cal.id} (Tag ${day}) an ${subs.length} Geräte...`);

      for (const sub of subs) {
        try {
          await sendPushNotification(sub, {
            title,
            body,
            url: `/c/${cal.token}`,
          });
        } catch (e) {
          // Abgelaufene Subscription entfernen (410 = gone, 404 = not found)
          if (e.statusCode === 410 || e.statusCode === 404) {
            await db.updateCalendar(cal.id, (c) => {
              c.subscriptions = (c.subscriptions || []).filter(s => s.endpoint !== sub.endpoint);
              return c;
            });
          }
          console.error(`[CRON] Push-Fehler:`, e.message);
        }
      }
    }
  }, { timezone: config.timezone });

  console.log("[CRON] Jobs registriert: E-Mail täglich 07:00 | Push minütlich geprüft.");
}

async function runWichtelJobs(now = new Date()) {
  const { notify, removePhotoFiles } = require("./routes/wichteln");
  const wcfg = require("./wichteln/config");
  const groups = await db.getAllWichtelGroups();
  const dayIso = (offsetDays) => new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000));
  const tomorrowIso = dayIso(wcfg.reminderDaysBefore);
  const weekIso = dayIso(wcfg.giftReminderDaysBefore);
  let reminders = 0;
  let giftReminders = 0;
  let deleted = 0;
  for (const g of groups) {
    // Retention over: wipe the whole group including photos.
    if (g.deleteAt && new Date(g.deleteAt).getTime() <= now.getTime()) {
      removePhotoFiles(g);
      await db.deleteWichtelGroup(g.id);
      deleted++;
      continue;
    }
    const active = (g.participants || []).filter((x) => !x.pending);
    // The day before: everybody who wants to hear from us.
    if (g.eventDate === tomorrowIso && !g.reminderSentFor?.includes(tomorrowIso)) {
      for (const p of active) {
        await notify("reminderTomorrow", { group: g, p });
        reminders++;
      }
      await db.updateWichtelGroup(g.id, (x) => { x.reminderSentFor = [...(x.reminderSentFor || []), tomorrowIso]; return x; });
    }
    // A week before: nudge givers who have not started on their gift.
    if (g.eventDate === weekIso && g.status !== "draft" && !g.giftReminderSentFor?.includes(weekIso)) {
      for (const p of active) {
        if (!p.assignedTo || (p.giftStatus?.steps || []).length) continue;
        await notify("giftReminder", { group: g, p });
        giftReminders++;
      }
      await db.updateWichtelGroup(g.id, (x) => { x.giftReminderSentFor = [...(x.giftReminderSentFor || []), weekIso]; return x; });
    }
  }
  if (reminders || giftReminders || deleted) console.log(`[CRON] Wichteln: ${reminders} Erinnerungen, ${giftReminders} Geschenk-Erinnerungen, ${deleted} Runden gelöscht.`);
  return { reminders, giftReminders, deleted };
}

/* Evening reminder: what to prepare tonight (for tomorrow morning) and what
 * to buy or prepare tomorrow for the night after. */
async function runElfReminders(now = new Date()) {
  const { notifyParents } = require("./routes/wichteltuer");
  const S = require("./routes/wichteltuer/shared");
  const nowStr = new Date(now).toLocaleTimeString("de-DE", { timeZone: config.timezone, hour: "2-digit", minute: "2-digit", hour12: false });
  const today = S.todayIso(now);
  let sent = 0;
  for (const plan of await db.getAllElfPlans()) {
    if (plan.notify?.enabled === false) continue;
    if ((plan.notify?.time || S.cfg.reminderTimeDefault) !== nowStr) continue;
    if ((plan.reminderSentFor || []).includes(today)) continue;
    const dates = S.seasonDates(plan.year);
    const tonight = S.addDays(today, 1);
    const dayAfter = S.addDays(today, 2);
    if (tonight < dates[0] || tonight > dates[dates.length - 1]) continue;
    const e = plan.days[tonight];
    const prep = plan.days[dayAfter];
    const elf = plan.elf?.name || "Der Wichtel";
    const lines = [];
    if (e && !e.done) {
      const who = plan.parents.find((p) => p.id === e.assignee)?.name;
      lines.push(`Heute Nacht (für den ${S.dayNumber(tonight)}. Dezember): ${e.title}${who ? ` – ${who} ist dran` : ""}${e.minutes ? `, ca. ${e.minutes} Min.` : ""}`);
      if (e.materials?.length) lines.push(`Du brauchst: ${e.materials.join(", ")}`);
    } else if (!e) {
      lines.push(`Für den ${S.dayNumber(tonight)}. Dezember ist noch nichts geplant – ${elf} braucht eine Idee!`);
    }
    if (prep?.prepDayBefore && !prep.done) lines.push(`Morgen vorbereiten (für den ${S.dayNumber(dayAfter)}.): ${prep.title}${prep.materials?.length ? ` – ${prep.materials.join(", ")}` : ""}`);
    if (!lines.length) continue;
    await notifyParents(plan, "Heute Nacht ist Wichtelzeit", lines.join("\n"), `#tag-${tonight}`);
    await db.updateElfPlan(plan.id, (p) => { p.reminderSentFor = [...(p.reminderSentFor || []), today].slice(-40); return p; });
    sent++;
  }
  return { sent };
}

module.exports = { startCron, runWichtelJobs, runElfReminders };
