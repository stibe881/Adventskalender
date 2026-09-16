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
            subject: `Türchen ${day} wartet auf dich! 🎄`,
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

      const title = `🎄 Türchen ${day} warte auf dich!`;
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

module.exports = { startCron };
