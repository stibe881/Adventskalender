/* Wichteltür module: mounted at /api/wichteltuer.
 *
 *   /plans…        – owner (logged in): list, create, delete, rotate share link
 *   /s/:token…     – everybody with the share link: the whole planner
 *   /k/:token…     – the children's page
 */
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const config = require("../../config");
const db = require("../../db");
const { requireAuth, COOKIE_NAME } = require("../../middleware/auth");
const { generateToken, generateId } = require("../../utils/token");
const { cleanText } = require("../../utils/wichtel");
const { IDEAS } = require("../../wichteltuer/ideas");
const { TEMPLATES, render: renderLetter } = require("../../wichteltuer/letters");
const S = require("./shared");
const { cfg } = S;

const router = express.Router();
const newId = () => crypto.randomBytes(6).toString("hex");
const isoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

// Optional session: the share page shows owner-only actions when the owner is logged in.
function optionalUser(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try { return jwt.verify(token, config.jwtSecret); } catch (_) { return null; }
}

// ── Owner API ───────────────────────────────────────────────────────────────
router.get("/plans", requireAuth, async (req, res) => {
  const plans = await db.getElfPlansByOwner(req.user.id);
  res.json(plans.map((p) => {
    const v = S.planView(p, { owner: true });
    return { id: p.id, title: p.title, year: p.year, elfName: v.elf.name, children: p.children.map((c) => c.name), shareToken: p.shareToken, shareLink: v.shareLink, kidLink: v.kidLink, stats: v.stats, unreadPost: v.unreadPost, createdAt: p.createdAt };
  }).sort((a, b) => b.year - a.year || String(b.createdAt).localeCompare(String(a.createdAt))));
});

router.post("/plans", requireAuth, async (req, res) => {
  const owner = await db.getUserById(req.user.id);
  const plan = S.newPlan({ ...req.user, username: owner?.username || req.user.username }, req.body || {});
  if (req.body?.autoplan) S.autoplan(plan);
  await db.createElfPlan(plan);
  res.status(201).json(S.planView(plan, { owner: true }));
});

async function loadOwned(req, res) {
  const plan = await db.getElfPlanById(req.params.id);
  if (!plan || !S.isOwner(plan, req.user)) {
    res.status(404).json({ error: "Wichteltür nicht gefunden." });
    return null;
  }
  return plan;
}

router.delete("/plans/:id", requireAuth, async (req, res) => {
  const plan = await loadOwned(req, res);
  if (!plan) return;
  S.removePhotoFiles(plan);
  await db.deleteElfPlan(plan.id);
  res.json({ ok: true });
});

// A new share link locks out everybody who had the old one.
router.post("/plans/:id/rotate-share", requireAuth, async (req, res) => {
  const plan = await loadOwned(req, res);
  if (!plan) return;
  const updated = await db.updateElfPlan(plan.id, (p) => { p.shareToken = generateToken(cfg.shareTokenBytes); return p; });
  res.json(S.planView(updated, { owner: true }));
});

// ── Library (public, static) ────────────────────────────────────────────────
router.get("/ideas", (req, res) => res.json({ ideas: IDEAS, categories: cfg.categories }));
router.get("/letters/templates", (req, res) => res.json({ templates: TEMPLATES }));
router.get("/vapidPublicKey", (req, res) => {
  const { getVapidPublicKey } = require("../../push");
  res.json({ publicKey: getVapidPublicKey() });
});

// ── Shared planner (share token) ────────────────────────────────────────────
const share = express.Router({ mergeParams: true });
share.use(rateLimit({ windowMs: 60 * 1000, limit: cfg.shareRequestsPerMinute, standardHeaders: true, legacyHeaders: false }));

async function respond(req, res, mutate, status = 200) {
  const plan = await S.loadByShareToken(req, res);
  if (!plan) return null;
  const owner = S.isOwner(plan, optionalUser(req));
  let updated = plan;
  if (mutate) {
    const r = mutate(plan);
    if (r === false) return null;
    updated = await db.updateElfPlan(plan.id, (p) => { (typeof r === "function" ? r : mutate)(p); return p; });
  }
  res.status(status).json(S.planView(updated, { owner }));
  return updated;
}

share.get("/", (req, res) => respond(req, res));

share.put("/settings", (req, res) => {
  const b = req.body || {};
  return respond(req, res, (p) => {
    if (b.title !== undefined) p.title = cleanText(b.title, cfg.titleMax) || p.title;
    if (b.year !== undefined && Number(b.year) >= 2024 && Number(b.year) <= 2100 && !Object.keys(p.days).length) p.year = Number(b.year);
    if (b.elf && typeof b.elf === "object") {
      p.elf = p.elf || {};
      if (b.elf.name !== undefined) p.elf.name = cleanText(b.elf.name, cfg.nameMax) || p.elf.name || "Wichtel";
      if (b.elf.doorPlace !== undefined) p.elf.doorPlace = cleanText(b.elf.doorPlace, cfg.placeMax);
      if (b.elf.character !== undefined) p.elf.character = ["frech", "lieb", "verpeilt", "neugierig"].includes(b.elf.character) ? b.elf.character : "frech";
    }
    if (Array.isArray(b.children)) p.children = b.children.slice(0, cfg.maxChildren).map(S.cleanChild).filter((c) => c.name);
    if (Array.isArray(b.parents)) {
      p.parents = b.parents.slice(0, cfg.maxParents).map(S.cleanParent).filter((x) => x.name);
      const ids = new Set(p.parents.map((x) => x.id));
      for (const e of Object.values(p.days)) if (e.assignee && !ids.has(e.assignee)) e.assignee = null;
    }
    if (b.notify && typeof b.notify === "object") {
      p.notify = p.notify || {};
      if (b.notify.enabled !== undefined) p.notify.enabled = Boolean(b.notify.enabled);
      if (b.notify.time !== undefined && /^\d{2}:\d{2}$/.test(b.notify.time)) p.notify.time = b.notify.time;
      if (b.notify.emails !== undefined) p.notify.emails = S.cleanEmails(b.notify.emails);
    }
  });
});

// Days
share.put("/days/:date", (req, res) => {
  const date = String(req.params.date);
  if (!isoDate(date)) return res.status(400).json({ error: "Ungültiges Datum." });
  const b = req.body || {};
  return respond(req, res, (p) => {
    if (!S.seasonDates(p.year).includes(date)) { res.status(400).json({ error: "Das Datum liegt außerhalb der Adventszeit dieses Plans." }); return false; }
    return (x) => { x.days[date] = S.applyDay(x, date, b, x.days[date]); };
  });
});

share.delete("/days/:date", (req, res) => {
  const date = String(req.params.date);
  return respond(req, res, (p) => (x) => {
    const e = x.days[date];
    if (e?.photo) S.removePhotoFiles({ days: { [date]: e } });
    delete x.days[date];
  });
});

share.post("/days/swap", (req, res) => {
  const { a, b } = req.body || {};
  if (!isoDate(a) || !isoDate(b) || a === b) return res.status(400).json({ error: "Zwei verschiedene Tage angeben." });
  return respond(req, res, (p) => (x) => {
    const ea = x.days[a];
    const eb = x.days[b];
    if (eb) x.days[a] = eb; else delete x.days[a];
    if (ea) x.days[b] = ea; else delete x.days[b];
  });
});

share.post("/autoplan", (req, res) => respond(req, res, (p) => (x) => S.autoplan(x, { overwrite: Boolean(req.body?.overwrite) })));

// Photos (evidence of the prank, the kids' reaction)
const photoStorage = multer.diskStorage({
  destination: config.paths.uploadsDir,
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname || "").toLowerCase().match(/^\.(png|jpe?g|gif|webp)$/) || [".jpg"])[0];
    cb(null, `elf-${Date.now()}-${newId()}${ext}`);
  },
});
const photoUpload = multer({ storage: photoStorage, limits: { fileSize: cfg.photoMaxBytes }, fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) });

share.post("/days/:date/photo", photoUpload.single("photo"), async (req, res) => {
  const date = String(req.params.date);
  if (!req.file) return res.status(400).json({ error: "Bitte ein Bild (PNG, JPG, GIF, WebP) auswählen." });
  const url = `/uploads/${req.file.filename}`;
  const done = await respond(req, res, (p) => (x) => {
    if (!x.days[date]) x.days[date] = S.applyDay(x, date, { title: "Überraschung" }, null);
    if (x.days[date].photo) S.removePhotoFiles({ days: { [date]: x.days[date] } });
    x.days[date].photo = url;
    if (req.body?.visibleToKids !== undefined) x.days[date].photoVisibleToKids = ["1", "true", "on"].includes(String(req.body.visibleToKids));
  }, 201);
  if (!done) S.removePhotoFiles({ days: { [date]: { photo: url } } });
});

share.delete("/days/:date/photo", (req, res) => {
  const date = String(req.params.date);
  return respond(req, res, (p) => (x) => {
    if (x.days[date]?.photo) {
      S.removePhotoFiles({ days: { [date]: x.days[date] } });
      x.days[date].photo = null;
    }
  });
});

// Shopping
share.put("/shopping/check", (req, res) => {
  const key = String(req.body?.key || "");
  const checked = Boolean(req.body?.checked);
  return respond(req, res, (p) => (x) => {
    if (!x.shopping) x.shopping = { checked: {}, custom: [] };
    if (key.startsWith("custom:")) {
      const c = (x.shopping.custom || []).find((i) => i.id === key.slice(7));
      if (c) c.checked = checked;
    } else if (checked) x.shopping.checked[key] = true;
    else delete x.shopping.checked[key];
  });
});
share.post("/shopping/custom", (req, res) => {
  const text = cleanText(req.body?.text, cfg.shoppingMax);
  if (!text) return res.status(400).json({ error: "Was soll auf die Liste?" });
  return respond(req, res, (p) => (x) => {
    if (!x.shopping) x.shopping = { checked: {}, custom: [] };
    if ((x.shopping.custom || []).length >= cfg.maxCustomShopping) return;
    x.shopping.custom.push({ id: newId(), text, checked: false });
  }, 201);
});
share.delete("/shopping/custom/:id", (req, res) => respond(req, res, (p) => (x) => {
  if (x.shopping?.custom) x.shopping.custom = x.shopping.custom.filter((i) => i.id !== req.params.id);
}));
share.post("/shopping/clear-checked", (req, res) => respond(req, res, (p) => (x) => {
  if (!x.shopping) return;
  x.shopping.checked = {};
  x.shopping.custom = (x.shopping.custom || []).filter((i) => !i.checked);
}));

// Letters: render a template into the elf's voice.
share.post("/letters/render", async (req, res) => {
  const plan = await S.loadByShareToken(req, res);
  if (!plan) return;
  const b = req.body || {};
  const tpl = TEMPLATES.find((t) => t.id === b.templateId);
  const source = tpl ? tpl.text : cleanText(b.text, cfg.letterMax);
  const child = plan.children.find((c) => c.id === b.childId);
  const text = renderLetter(source, S.letterCtx(plan, isoDate(b.date) ? b.date : null, { free: cleanText(b.free, cfg.letterMax), childName: child?.name }));
  res.json({ text });
});

// Wichtelpost: letters between the elf and the children.
share.post("/post", (req, res) => {
  const text = cleanText(req.body?.text, cfg.letterMax);
  if (!text) return res.status(400).json({ error: "Der Brief ist leer." });
  return respond(req, res, (p) => (x) => {
    if (!x.post) x.post = [];
    const child = x.children.find((c) => c.id === req.body?.childId);
    x.post.push({ id: newId(), from: "elf", childId: child?.id || null, childName: child?.name || "", text, at: new Date().toISOString(), read: true });
    if (x.post.length > cfg.maxLetters) x.post = x.post.slice(-cfg.maxLetters);
  }, 201);
});
share.put("/post/:id/read", (req, res) => respond(req, res, (p) => (x) => {
  const l = (x.post || []).find((i) => i.id === req.params.id);
  if (l) l.read = true;
}));
share.post("/post/read-all", (req, res) => respond(req, res, (p) => (x) => { (x.post || []).forEach((l) => { l.read = true; }); }));
share.delete("/post/:id", (req, res) => respond(req, res, (p) => (x) => { x.post = (x.post || []).filter((i) => i.id !== req.params.id); }));

// Kids link
share.post("/rotate-kid-link", (req, res) => respond(req, res, (p) => (x) => { x.kidToken = generateToken(cfg.kidTokenBytes); }));

// Push registration for the parents' devices
share.post("/push", async (req, res) => {
  const plan = await S.loadByShareToken(req, res);
  if (!plan) return;
  const { isExpoPushToken } = require("../../push");
  let sub = req.body || {};
  const who = cleanText(sub.who, cfg.nameMax);
  if (sub.expoToken) {
    if (!isExpoPushToken(sub.expoToken)) return res.status(400).json({ error: "Ungültiges Push-Token." });
    sub = { endpoint: `expo:${sub.expoToken}`, expoToken: sub.expoToken, platform: String(sub.platform || "").slice(0, 10) };
  } else if (sub.endpoint && sub.keys) {
    sub = { endpoint: String(sub.endpoint).slice(0, 1000), keys: { p256dh: String(sub.keys.p256dh || ""), auth: String(sub.keys.auth || "") }, expirationTime: null };
  } else {
    return res.status(400).json({ error: "Kein Push-Abo übermittelt." });
  }
  await db.updateElfPlan(plan.id, (p) => {
    if (!p.notify) p.notify = { enabled: true, time: cfg.reminderTimeDefault, emails: [], subscriptions: [] };
    p.notify.subscriptions = (p.notify.subscriptions || []).filter((s) => s.endpoint !== sub.endpoint).concat([{ ...sub, who, addedAt: new Date().toISOString() }]).slice(-cfg.maxPushDevices);
    return p;
  });
  res.status(201).json({ ok: true });
});
share.delete("/push", async (req, res) => {
  const plan = await S.loadByShareToken(req, res);
  if (!plan) return;
  const endpoint = req.body?.expoToken ? `expo:${req.body.expoToken}` : String(req.body?.endpoint || "");
  await db.updateElfPlan(plan.id, (p) => {
    if (p.notify) p.notify.subscriptions = (p.notify.subscriptions || []).filter((s) => endpoint && s.endpoint !== endpoint);
    return p;
  });
  res.json({ ok: true });
});

router.use("/s/:token", share);

// ── Kids page ───────────────────────────────────────────────────────────────
const kids = express.Router({ mergeParams: true });
kids.use(rateLimit({ windowMs: 60 * 1000, limit: cfg.kidRequestsPerMinute, standardHeaders: true, legacyHeaders: false }));

kids.get("/", async (req, res) => {
  const plan = await S.loadByKidToken(req, res);
  if (!plan) return;
  res.json(S.kidView(plan));
});

kids.post("/letters", async (req, res) => {
  const plan = await S.loadByKidToken(req, res);
  if (!plan) return;
  const text = cleanText(req.body?.text, cfg.kidLetterMax);
  if (!text) return res.status(400).json({ error: "Schreib dem Wichtel etwas." });
  const child = plan.children.find((c) => c.id === req.body?.childId);
  const updated = await db.updateElfPlan(plan.id, (p) => {
    if (!p.post) p.post = [];
    p.post.push({ id: newId(), from: "kid", childId: child?.id || null, childName: child?.name || "", text, at: new Date().toISOString(), read: false });
    if (p.post.length > cfg.maxLetters) p.post = p.post.slice(-cfg.maxLetters);
    return p;
  });
  notifyParents(updated, "Post für den Wichtel", `${child?.name || "Ein Kind"} hat dem Wichtel geschrieben: „${text.slice(0, 80)}“`, "#post").catch(() => {});
  res.status(201).json(S.kidView(updated));
});

router.use("/k/:token", kids);

// ── Notifications to the parents ────────────────────────────────────────────
async function notifyParents(plan, title, body, anchor = "") {
  const { sendPushNotification } = require("../../push");
  const { sendMail, layout, escapeHtml } = require("../../services/mail");
  const url = `${S.shareLink(plan)}${anchor}`;
  const subs = plan.notify?.subscriptions || [];
  const dead = [];
  for (const sub of subs) {
    try {
      await sendPushNotification(sub, { title: `${plan.elf?.name || "Wichtel"}: ${title}`, body, url });
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) dead.push(sub.endpoint);
      else console.warn("[Wichteltür] Push fehlgeschlagen:", err.message);
    }
  }
  if (dead.length) {
    await db.updateElfPlan(plan.id, (p) => {
      if (p.notify) p.notify.subscriptions = (p.notify.subscriptions || []).filter((s) => !dead.includes(s.endpoint));
      return p;
    });
  }
  let mails = 0;
  for (const to of plan.notify?.emails || []) {
    const html = layout(plan.title, `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p><p style="margin-top:20px"><a href="${url}" style="background:#059669;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Zur Wichteltür</a></p>`);
    if (await sendMail({ to, subject: `[${plan.title}] ${title}`, text: `${body}\n\n${url}`, html })) mails++;
  }
  return { push: subs.length - dead.length, mails };
}

module.exports = router;
module.exports.notifyParents = notifyParents;
module.exports.removePhotoFiles = S.removePhotoFiles;
