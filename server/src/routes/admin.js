const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const config = require("../config");
const db = require("../db");
const { requireAuth, signUserToken, setAuthCookie } = require("../middleware/auth");
const { generateToken, generateId } = require("../utils/token");
const { generateQrDataUrl } = require("../utils/qr");
const { CONTENT_TYPES, THEMES } = require("../utils/contentTypes");
const { unlockDateISO, getTodayParts } = require("../utils/time");

const router = express.Router();
router.use(requireAuth);

function makeEmptyDays() {
  return Array.from({ length: 24 }, (_, i) => ({
    day: i + 1,
    contentType: null,
    content: null,
    opened: false,
    openedAt: null,
  }));
}

function applyTemplate(days, templateId) {
  const mindfulTasks = [
    "Nimm dir 3 bewusste, tiefe Atemzüge.",
    "Trinke eine Tasse Tee oder Kaffee ganz ohne Ablenkung.",
    "Schreibe 3 Dinge auf, für die du heute dankbar bist.",
    "Mache einen 10-minütigen Spaziergang an der frischen Luft.",
    "Lege dein Handy für die nächste Stunde in einen anderen Raum.",
    "Lächle dich selbst im Spiegel an und sage dir etwas Nettes.",
    "Höre dein absolutes Lieblingslied und singe oder summe mit.",
    "Räume einen kleinen Bereich auf (z.B. deinen Schreibtisch).",
    "Schließe die Augen und achte 2 Minuten lang nur auf deinen Körper.",
    "Schreibe einer Person, die du magst, eine nette Nachricht.",
    "Lies ein Kapitel in einem Buch, das du schon lange lesen wolltest.",
    "Dehne deinen Körper für 5 Minuten durch.",
    "Genieße ein Stück Schokolade oder Obst ganz langsam und bewusst.",
    "Mach heute bewusst ein Kompliment an jemand anderen.",
    "Gönne dir heute Abend eine extra lange Dusche oder ein Bad.",
    "Beobachte für ein paar Minuten die Wolken oder die Natur.",
    "Notiere dir einen Erfolg, den du in letzter Zeit gefeiert hast.",
    "Versuche heute, dich über nichts aufzuregen und gelassen zu bleiben.",
    "Zünde eine Kerze an und betrachte die Flamme für eine Minute.",
    "Höre einen beruhigenden Podcast oder entspannende Musik.",
    "Gehe heute 15 Minuten früher ins Bett als sonst.",
    "Mache dir ein schönes, gesundes Frühstück.",
    "Denke an einen besonders schönen Moment aus diesem Jahr zurück.",
    "Nimm dir Zeit für dich selbst und mache genau das, worauf du jetzt Lust hast."
  ];

  if (templateId === "romantic") {
    days.forEach(d => {
      d.contentType = "text";
      d.content = { message: `Grund #${d.day}, warum ich dich liebe...`, sender: "Dein Schatz" };
    });
  } else if (templateId === "mindful") {
    days.forEach(d => {
      d.contentType = "challenge";
      d.content = { task: `Achtsamkeitsübung: ${mindfulTasks[d.day - 1]}`, btnText: "Erledigt!", successMessage: "Gut gemacht!" };
    });
  } else if (templateId === "jokes") {
    const jokesList = [
      "Was sagt der große Stift zum kleinen Stift? Wachs-mal-stift!",
      "Warum können Geister so schlecht lügen? Weil man durch sie hindurchsehen kann!",
      "Was ist orange und geht über die Berge? Eine Wanderine!",
      "Treffen sich zwei Magnete. Sagt der eine: 'Was soll ich heute anziehen?'",
      "Was ist braun, knusprig und schwimmt unter Wasser? Ein U-Brot!",
      "Warum summen Bienen? Weil sie den Text nicht kennen!",
      "Wie nennt man ein verschwundenes Rind? Oxford!",
      "Was passiert, wenn man Cola und Bier gleichzeitig trinkt? Man colabiert!",
      "Was macht ein Clown im Büro? Faxen!",
      "Wie nennt man einen Bumerang, der nicht zurückkommt? Stock.",
      "Welches ist das lustigste Tier? Das Scherz-entier!",
      "Warum fressen Eisbären keine Pinguine? Weil sie an entgegengesetzten Polen leben!",
      "Was ist ein Keks unter einem Baum? Ein schattiges Plätzchen!",
      "Was sagt der Hai, wenn er einen Surfer sieht? 'Oh, Frühstück auf dem Brettchen!'",
      "Warum gehen Ameisen nicht in die Kirche? Weil sie in-sekten sind!",
      "Was ist grün, glücklich und hüpft über die Wiese? Eine Freuschrecke!",
      "Warum hat der Mathematiker ein dickes Auge? Er hat sich verrechnet!",
      "Was ist gelb und kann nicht schwimmen? Ein Bagger. Und warum? Weil er nur einen Arm hat!",
      "Wie nennt man ein helles Mammut? Hellmut!",
      "Treffen sich zwei unsichtbare Menschen. Sagt der eine: 'Lange nicht gesehen!'",
      "Was sitzt auf dem Baum und winkt? Ein Huhu!",
      "Warum weint der Geometrie-Lehrer? Weil seine Klasse völlig formlos ist!",
      "Was essen Autos am liebsten? Parkplätzchen!",
      "Warum legen Hühner Eier? Wenn sie sie werfen würden, gingen sie kaputt!"
    ];
    days.forEach(d => {
      d.contentType = "text";
      const joke = jokesList[(d.day - 1) % jokesList.length];
      d.content = { message: `Witz des Tages #${d.day}:\n\n${joke}`, sender: "Spaßvogel" };
    });
  } else if (templateId === "quotes") {
    days.forEach(d => {
      d.contentType = "text";
      d.content = { message: `"Zitat des Tages #${d.day}"\n\n- (Autor)`, sender: "Inspiration" };
    });
  } else if (templateId === "fitness") {
    days.forEach(d => {
      d.contentType = "challenge";
      d.content = { task: `Fitness-Challenge #${d.day}:\nMach 10 Kniebeugen!`, btnText: "Erledigt!", successMessage: "Stark!" };
    });
  } else if (templateId === "trivia") {
    days.forEach(d => {
      d.contentType = "quiz";
      d.content = { question: `Quizfrage #${d.day}: Was ist...?`, options: ["Antwort A", "Antwort B", "Antwort C", "Antwort D"], correctIndex: 0, successMessage: "Richtig!", failureMessage: "Leider falsch.", prizeText: "10 Punkte", prizeCoins: 10 };
    });
  } else if (templateId === "recipes") {
    days.forEach(d => {
      d.contentType = "text";
      d.content = { message: `Rezept #${d.day}:\n\nZutaten:\n- ...\n\nZubereitung:\n...`, sender: "Bäckerei" };
    });
  } else if (templateId === "couples_activities") {
    const activities = [
      "Zusammen den Sonnenuntergang anschauen",
      "Heute kochen wir zusammen etwas Neues!",
      "Ein gemeinsamer Spaziergang ohne Handys",
      "Gegenseitig eine Massage geben",
      "Einen Filmabend mit Popcorn machen",
      "Zusammen ein neues Café ausprobieren",
      "Ein Brettspiel oder Kartenspiel spielen",
      "Gegenseitig 3 Dinge sagen, die wir aneinander lieben",
      "Zusammen Plätzchen oder Kuchen backen",
      "Ein heißes Bad zusammen nehmen",
      "Einen Ausflug in die Natur machen",
      "Gemeinsam ein Puzzle beginnen",
      "Ein Picknick im Wohnzimmer veranstalten",
      "Fotos von früher anschauen und in Erinnerungen schwelgen",
      "Zusammen ein Workout oder Yoga machen",
      "Ein leckeres Frühstück im Bett",
      "Einen Glühwein oder heißen Kakao trinken",
      "Zusammen ein Weihnachtsgedicht oder -lied lernen",
      "Gegenseitig einen Wunsch erfüllen",
      "Einen ganzen Abend nur bei Kerzenschein verbringen",
      "Gemeinsam den Sternenhimmel beobachten",
      "Eine Kissenschlacht machen",
      "Zusammen die Weihnachtsdekoration aufhängen",
      "Ein romantisches Dinner zuhause"
    ];
    days.forEach(d => {
      d.contentType = "challenge";
      const activity = activities[(d.day - 1) % activities.length];
      d.content = { task: `Aktivität #${d.day}:\n${activity}`, btnText: "Erledigt!", successMessage: "Schön war's!" };
    });
  } else if (templateId === "kids_fun") {
    days.forEach(d => {
      d.contentType = "challenge";
      d.content = { task: `Rätselspaß #${d.day}:\nFinde 3 rote Dinge im Raum!`, btnText: "Gefunden!", successMessage: "Toll gemacht!" };
    });
  } else if (templateId === "praise") {
    days.forEach(d => {
      d.contentType = "text";
      d.content = { message: `Was ich an dir schätze #${d.day}:\n\nDu bist so wundervoll, weil...`, sender: "Dein Fan" };
    });
  } else if (templateId === "photo_memories") {
    days.forEach(d => {
      d.contentType = "gallery";
      d.content = { images: [], desc: `Unsere schönste Erinnerung #${d.day} (Bitte Bild hochladen)` };
    });
  } else if (templateId === "escape_room") {
    days.forEach(d => {
      d.contentType = "quiz";
      d.content = { question: `Rätsel #${d.day}:\nLöse den Code...`, options: ["123", "456", "789", "000"], correctIndex: 0, successMessage: "Tür entriegelt!", failureMessage: "Falscher Code.", prizeText: "Hinweis gefunden!", prizeCoins: 0 };
    });
  }
  return days;
}

function toSummary(cal) {
  const filled = cal.days.filter((d) => d.contentType).length;
  const opened = cal.days.filter((d) => d.opened).length;
  
  let shareUrl = `${config.baseUrl}/c/${cal.token}`;
  if (cal.customConfig && cal.customConfig.subdomain) {
    // Assuming https or using baseUrl scheme
    const scheme = new URL(config.baseUrl).protocol;
    const baseHost = config.baseDomain || new URL(config.baseUrl).host;
    if (baseHost !== "localhost" && baseHost !== "127.0.0.1") {
      shareUrl = `${scheme}//${cal.customConfig.subdomain}.${baseHost}`;
    } else {
      // Fallback for local development or when baseDomain is not set
      shareUrl = `http://${cal.customConfig.subdomain}.localhost:${config.port}`;
    }
  }

  return {
    id: cal.id,
    recipientName: cal.recipientName,
    recipientEmail: cal.recipientEmail,
    ownerName: cal.ownerName,
    theme: cal.theme,
    year: cal.year,
    customConfig: cal.customConfig,
    token: cal.token,
    shareUrl: shareUrl,
    createdAt: cal.createdAt,
    filledDoors: filled,
    openedDoors: opened,
    randomLayout: Boolean(cal.randomLayout),
    collaborators: cal.collaborators || [],
    isPro: Boolean(cal.isPro),
  };
}

// Session Token Refresh (e.g. after Stripe Payment)
router.post("/refresh", async (req, res) => {
  try {
    const user = await db.getUserByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({ error: "Nutzer nicht gefunden." });
    }

    const token = signUserToken(user);
    setAuthCookie(res, token);
    
    res.json({ ok: true, isPro: user.isPro });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Interner Fehler beim Refresh: " + err.message });
  }
});

// Admin Dev-Toggle
router.post("/dev-toggle-pro", async (req, res) => {
  try {
    if (req.user.email !== "stefan.gross@gross-ict.ch") {
      return res.status(403).json({ error: "Nur für stefan.gross@gross-ict.ch" });
    }
    const updatedUser = await db.updateUser(req.user.email, (u) => {
      u.isPro = !u.isPro;
      return u;
    });
    const token = signUserToken(updatedUser);
    setAuthCookie(res, token);
    res.json({ ok: true, isPro: updatedUser.isPro });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function hasAccess(calendar, user) {
  if (!calendar) return false;
  if (calendar.ownerId === user.id) return true;
  if (calendar.collaborators && calendar.collaborators.includes(user.email)) return true;
  return false;
}

// ---------- Calendars ----------

router.get("/calendars", async (req, res) => {
  const calendars = await db.getCalendarsByOwnerOrCollaborator(req.user.id, req.user.email);
  calendars.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(calendars.map(toSummary));
});

router.post("/calendars", async (req, res) => {
  const { recipientName, recipientEmail, theme, year, customConfig, template, randomLayout } = req.body || {};
  if (!recipientName || !String(recipientName).trim()) {
    return res.status(400).json({ error: "Name des Beschenkten ist erforderlich." });
  }
  if (!THEMES.includes(theme)) {
    return res.status(400).json({ error: `Ungültiges Theme. Erlaubt: ${THEMES.join(", ")}` });
  }
  const parsedYear = parseInt(year, 10);
  if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2200) {
    return res.status(400).json({ error: "Ungültiges Jahr." });
  }

  let days = makeEmptyDays();
  if (template) {
    days = applyTemplate(days, template);
  }

  const calendar = {
    id: generateId(),
    token: generateToken(),
    ownerId: req.user.id,
    ownerName: req.user.username,
    recipientName: String(recipientName).trim(),
    recipientEmail: recipientEmail ? String(recipientEmail).trim() : null,
    collaborators: [],
    theme,
    customConfig: customConfig || null,
    strictMode: Boolean(req.body.strictMode),
    randomLayout: Boolean(randomLayout),
    year: parsedYear,
    createdAt: new Date().toISOString(),
    days,
  };
  await db.createCalendar(calendar);
  res.status(201).json(toSummary(calendar));
});

router.get("/calendars/:id", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden oder kein Zugriff." });
  res.json(calendar);
});

router.put("/calendars/:id", async (req, res) => {
  const { recipientName, recipientEmail, theme, year, customConfig, strictMode, randomLayout } = req.body || {};
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const updated = await db.updateCalendar(req.params.id, (cal) => {
    if (recipientName && String(recipientName).trim()) cal.recipientName = String(recipientName).trim();
    if (recipientEmail !== undefined) cal.recipientEmail = recipientEmail ? String(recipientEmail).trim() : null;
    if (theme && THEMES.includes(theme)) cal.theme = theme;
    if (customConfig !== undefined) {
      cal.customConfig = customConfig;
      // Strip PRO features if user and calendar are not PRO
      if (!req.user.isPro && !cal.isPro && cal.customConfig) {
        delete cal.customConfig.logo;
        delete cal.customConfig.logoUrl;
        delete cal.customConfig.firmaColor;
        delete cal.customConfig.firmaBgUrl;
      }
    }
    if (strictMode !== undefined) cal.strictMode = Boolean(strictMode);
    if (randomLayout !== undefined) cal.randomLayout = Boolean(randomLayout);
    if (year) {
      const parsedYear = parseInt(year, 10);
      if (Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2200) cal.year = parsedYear;
    }
    return cal;
  });
  if (!updated) return res.status(404).json({ error: "Kalender nicht gefunden." });
  res.json(toSummary(updated));
});

router.post("/calendars/:id/collaborators", async (req, res) => {
  const { email } = req.body || {};
  const calendar = await db.getCalendarById(req.params.id);
  if (!calendar || calendar.ownerId !== req.user.id) return res.status(403).json({ error: "Nur der Besitzer kann Mitbearbeiter einladen." });

  const updated = await db.updateCalendar(req.params.id, (cal) => {
    if (!cal.collaborators) cal.collaborators = [];
    if (email && !cal.collaborators.includes(email)) {
      cal.collaborators.push(email);
    }
    return cal;
  });
  res.json(toSummary(updated));
});

router.delete("/calendars/:id", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  // Only owner can delete
  if (!calendar || calendar.ownerId !== req.user.id) return res.status(404).json({ error: "Kalender nicht gefunden oder keine Berechtigung." });
  const ok = await db.deleteCalendar(req.params.id);
  if (!ok) return res.status(404).json({ error: "Kalender nicht gefunden." });
  res.json({ ok: true });
});

router.get("/calendars/:id/export-giveaway", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  let csv = "Tag,Email\n";
  calendar.days.forEach(d => {
    if (d.giveawayEntries && d.giveawayEntries.length > 0) {
      d.giveawayEntries.forEach(email => {
        csv += `${d.day},${email}\n`;
      });
    }
  });
  
  res.header('Content-Type', 'text/csv');
  res.attachment('giveaway_teilnehmer.csv');
  res.send(csv);
});

router.post("/calendars/:id/import", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  // simple csv processing: Day,Type,ContentJSON
  const csvText = req.body.csv;
  if (!csvText) return res.status(400).json({ error: "Keine CSV Daten" });

  const lines = csvText.split("\n");
  const updated = await db.updateCalendar(req.params.id, (cal) => {
    lines.forEach(line => {
      const parts = line.split(";");
      if (parts.length >= 3) {
        const day = parseInt(parts[0], 10);
        const type = parts[1].trim();
        let contentStr = parts.slice(2).join(";").trim();
        if (day >= 1 && day <= 24 && CONTENT_TYPES.includes(type)) {
          try {
            const content = JSON.parse(contentStr);
            const idx = cal.days.findIndex(d => d.day === day);
            if (idx !== -1) {
              cal.days[idx].contentType = type;
              cal.days[idx].content = content;
            }
          } catch(e) {}
        }
      }
    });
    return cal;
  });
  res.json({ ok: true });
});

router.post("/calendars/:id/duplicate", async (req, res) => {
  const source = await db.getCalendarById(req.params.id);
  // Only owner can duplicate (or collaborator could, but let's say anyone with access)
  if (!hasAccess(source, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const duplicate = {
    ...source,
    id: generateId(),
    token: generateToken(),
    ownerId: req.user.id, // duplicator becomes new owner
    ownerName: req.user.username,
    collaborators: [], // don't copy collaborators
    recipientName: `${source.recipientName} (Kopie)`,
    createdAt: new Date().toISOString(),
  };
  
  duplicate.days = source.days.map(d => ({
    ...d,
    opened: false,
    openedAt: null,
    content: d.content ? JSON.parse(JSON.stringify(d.content)) : null
  }));

  await db.createCalendar(duplicate);
  res.status(201).json(toSummary(duplicate));
});

router.post("/calendars/:id/swap", async (req, res) => {
  const { dayA, dayB } = req.body || {};
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const updated = await db.updateCalendar(req.params.id, (cal) => {
    const idxA = cal.days.findIndex((d) => d.day === dayA);
    const idxB = cal.days.findIndex((d) => d.day === dayB);
    if (idxA !== -1 && idxB !== -1) {
      const tempType = cal.days[idxA].contentType;
      const tempContent = cal.days[idxA].content;
      cal.days[idxA].contentType = cal.days[idxB].contentType;
      cal.days[idxA].content = cal.days[idxB].content;
      cal.days[idxB].contentType = tempType;
      cal.days[idxB].content = tempContent;
    }
    return cal;
  });
  res.json({ ok: true });
});

router.get("/calendars/:id/preview", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });
  res.json({
    recipientName: calendar.recipientName,
    ownerName: calendar.ownerName,
    theme: calendar.theme,
    customConfig: calendar.customConfig,
    randomLayout: calendar.randomLayout,
    syncOpen: calendar.syncOpen,
    metaPuzzle: calendar.metaPuzzle,
    playlist: calendar.playlist || [],
    year: calendar.year,
    today: getTodayParts(),
    preview: true,
    days: calendar.days.map((d) => ({
      day: d.day,
      unlockDate: unlockDateISO(calendar.year, d.day),
      unlocked: true,
      filled: Boolean(d.contentType),
      contentType: d.contentType,
      content: d.content,
    })),
  });
});

router.get("/calendars/:id/analytics", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  const openings = calendar.days.map(d => ({
    day: d.day,
    opened: d.opened,
    leads: d.giveawayEntries?.length || 0
  }));
  
  res.json({ openings });
});

// ---------- Day content ----------

router.put("/calendars/:id/days/:day", async (req, res) => {
  const dayNum = parseInt(req.params.day, 10);
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 24) {
    return res.status(400).json({ error: "Ungültiger Tag (1-24)." });
  }
  const { contentType, content } = req.body || {};
  if (contentType !== null && !CONTENT_TYPES.includes(contentType)) {
    return res.status(400).json({ error: `Ungültiger Inhaltstyp. Erlaubt: ${CONTENT_TYPES.join(", ")}` });
  }

  let finalContent = content || null;
  if (contentType === "qrcode" && finalContent?.data) {
    finalContent = { ...finalContent, qrImage: await generateQrDataUrl(finalContent.data) };
  }

  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const updated = await db.updateCalendar(req.params.id, (cal) => {
    const doorIdx = cal.days.findIndex((d) => d.day === dayNum);
    cal.days[doorIdx] = {
      ...cal.days[doorIdx],
      contentType: contentType || null,
      content: contentType ? finalContent : null,
    };
    return cal;
  });

  res.json(updated.days.find((d) => d.day === dayNum));
});

router.post("/calendars/:id/days/:day/wichtel-link", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const dayNum = parseInt(req.params.day, 10);
  let token = null;

  await db.updateCalendar(req.params.id, (cal) => {
    const doorIdx = cal.days.findIndex((d) => d.day === dayNum);
    if (doorIdx !== -1) {
      if (!cal.days[doorIdx].wichtelToken) {
        cal.days[doorIdx].wichtelToken = crypto.randomBytes(8).toString("hex");
      }
      token = cal.days[doorIdx].wichtelToken;
    }
    return cal;
  });

  if (!token) return res.status(400).json({ error: "Ungültiges Türchen." });
  res.json({ token, url: `${config.baseUrl}/wichtel.html?token=${token}` });
});

// ---------- Uploads (gallery images / audio files) ----------

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.paths.uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : "";
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  },
});

const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp)|audio\/(mpeg|mp3|wav|ogg|x-m4a|mp4|webm|weba))$/;

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // increased for voice notes
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.test(file.mimetype)) {
      return cb(new Error("Dateityp nicht erlaubt."));
    }
    cb(null, true);
  },
});

router.post("/upload", async (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Keine Datei erhalten." });
    res.json({ url: `/uploads/${req.file.filename}`, originalName: req.file.originalname });
  });
});

router.post("/calendars/:id/push", async (req, res) => {
  const db = require("../db");
  const { sendPushNotification } = require("../push");
  
  const calendar = await db.getCalendarById(req.params.id);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  const subs = calendar.subscriptions || [];
  let sent = 0;
  
  for (const sub of subs) {
    try {
      await sendPushNotification(sub, { title: "Kalender Update", body: req.body.message });
      sent++;
    } catch (e) {
      console.error("Push Fehler:", e);
      // Ideally remove stale subscriptions here if e.statusCode === 410 or 404
    }
  }
  
  res.json({ success: true, sent });
});

module.exports = router;
