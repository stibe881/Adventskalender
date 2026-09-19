/* Participant API: joining via invite link and everything a participant does
 * through their personal link (/w/:token). */
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const config = require("../../config");
const db = require("../../db");
const { isEmail, cleanText, buildIcs } = require("../../utils/wichtel");
const { notify } = require("./notify");
const { fetchLinkPreview } = require("./preview");
const {
  cfg, participantLink, newParticipant, findParticipant, giverOf, activeParticipants, isDrawn, participantView,
  loadByParticipantToken, safeHttpUrl, removePhotoFiles,
} = require("./shared");

const router = express.Router();
const newId = () => crypto.randomBytes(6).toString("hex");

// ── Join via invite link ────────────────────────────────────────────────────

const joinLimiter = rateLimit({ windowMs: 60 * 1000, limit: cfg.joinRequestsPerMinute, standardHeaders: true, legacyHeaders: false });

router.get("/join/:inviteToken", joinLimiter, async (req, res) => {
  const group = await db.getWichtelGroupByInviteToken(String(req.params.inviteToken));
  if (!group) return res.status(404).json({ error: "Einladungslink ungültig." });
  res.json({
    title: group.title,
    organizerName: group.organizerName,
    motto: group.motto || "",
    budget: group.budget || "",
    eventDate: group.eventDate || "",
    eventTime: group.eventTime || "",
    eventPlace: group.eventPlace || "",
    description: group.description || "",
    status: group.status || "draft",
    waitingRoom: group.waitingRoom !== false,
    participantCount: activeParticipants(group).length,
    closed: group.status !== "draft",
  });
});

router.post("/join/:inviteToken", joinLimiter, async (req, res) => {
  const group = await db.getWichtelGroupByInviteToken(String(req.params.inviteToken));
  if (!group) return res.status(404).json({ error: "Einladungslink ungültig." });
  if (group.status !== "draft") return res.status(409).json({ error: "Die Auslosung ist schon gelaufen – frag den Organisator, ob er neu auslost." });
  const name = cleanText(req.body?.name, cfg.nameMax);
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!name) return res.status(400).json({ error: "Bitte gib deinen Namen ein." });
  if (email && !isEmail(email)) return res.status(400).json({ error: "Ungültige E-Mail-Adresse." });
  if ((group.participants || []).length >= cfg.maxParticipants) return res.status(400).json({ error: "Diese Runde ist voll." });

  // Someone the organizer already listed can claim their entry by e-mail.
  const existing = email ? group.participants.find((p) => p.email === email) : null;
  if (existing) return res.json({ token: existing.token, pending: Boolean(existing.pending), existing: true });
  if (group.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return res.status(400).json({ error: "Diesen Namen gibt es schon in der Runde. Bitte ergänze z. B. den Nachnamen." });
  }
  const p = newParticipant({ name, email, pending: group.waitingRoom !== false });
  p.joinedAt = new Date().toISOString();
  await db.updateWichtelGroup(group.id, (g) => {
    g.participants.push(p);
    return g;
  });
  res.status(201).json({ token: p.token, pending: p.pending });
});

// ── Personal area ───────────────────────────────────────────────────────────

const participantLimiter = rateLimit({ windowMs: 60 * 1000, limit: cfg.participantRequestsPerMinute, standardHeaders: true, legacyHeaders: false });
router.use("/p", participantLimiter);

// Loads the group, applies `mutate` and answers with the fresh participant view.
async function mutateAndRespond(req, res, mutate, status = 200) {
  const found = await loadByParticipantToken(req, res);
  if (!found) return null;
  const result = mutate(found);
  if (result === false) return null;
  const updated = await db.updateWichtelGroup(found.group.id, (g) => {
    const p = findParticipant(g, found.me.id);
    if (!p) return g;
    (typeof result === "function" ? result : () => {})(g, p);
    return g;
  });
  const me = findParticipant(updated, found.me.id);
  res.status(status).json(participantView(updated, me));
  return { group: updated, me, before: found };
}

router.get("/p/:token", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  let { group, me } = found;
  if (!me.joinedAt) {
    group = await db.updateWichtelGroup(group.id, (g) => {
      findParticipant(g, me.id).joinedAt = new Date().toISOString();
      return g;
    });
    me = findParticipant(group, me.id);
  }
  res.json(participantView(group, me));
});

router.put("/p/:token/profile", async (req, res) => {
  const b = req.body || {};
  if (b.email !== undefined && b.email && !isEmail(b.email)) return res.status(400).json({ error: "Ungültige E-Mail-Adresse." });
  await mutateAndRespond(req, res, () => (g, p) => {
    if (b.name !== undefined && cleanText(b.name, cfg.nameMax)) p.name = cleanText(b.name, cfg.nameMax);
    if (b.email !== undefined) p.email = b.email ? String(b.email).trim().toLowerCase() : "";
    if (b.hints && typeof b.hints === "object") {
      p.hints = {
        allergies: cleanText(b.hints.allergies, cfg.hintMax),
        favorites: cleanText(b.hints.favorites, cfg.hintMax),
        hobbies: cleanText(b.hints.hobbies, cfg.hintMax),
        notes: cleanText(b.hints.notes, cfg.notesMax),
      };
    }
    if (b.notify && typeof b.notify === "object") p.notify = { email: b.notify.email !== false, push: b.notify.push !== false };
  });
});

router.put("/p/:token/wishlist", async (req, res) => {
  const raw = Array.isArray(req.body?.wishlist) ? req.body.wishlist.slice(0, cfg.maxWishlistItems) : [];
  const wishlist = raw.map((w) => ({
    id: typeof w.id === "string" && /^[\w-]{1,40}$/.test(w.id) ? w.id : newId(),
    url: safeHttpUrl(w.url) || "",
    title: cleanText(w.title, 140),
    image: safeHttpUrl(w.image) || "",
    price: cleanText(w.price, 20),
    note: cleanText(w.note, 300),
  })).filter((w) => w.title || w.url);
  const done = await mutateAndRespond(req, res, () => (g, p) => {
    p.wishlist = wishlist;
    p.wishlistUpdatedAt = new Date().toISOString();
  });
  if (!done) return;
  // Tell the secret santa, at most once per hour.
  const { group, me } = done;
  const santa = giverOf(group, me.id);
  if (santa && (!me.wishlistNotifiedAt || Date.now() - new Date(me.wishlistNotifiedAt).getTime() > cfg.wishlistNotifyThrottleMs)) {
    await db.updateWichtelGroup(group.id, (g) => { findParticipant(g, me.id).wishlistNotifiedAt = new Date().toISOString(); return g; });
    notify("wishlistChanged", { group, p: santa, by: me }).catch(() => {});
  }
});

router.put("/p/:token/gift-status", async (req, res) => {
  const method = req.body?.method === "post" ? "post" : "personal";
  const allowed = cfg.giftSteps[method];
  const steps = Array.isArray(req.body?.steps) ? req.body.steps.filter((s) => allowed.includes(s)) : [];
  await mutateAndRespond(req, res, () => (g, p) => {
    p.giftStatus = { method, steps: [...new Set(steps)], updatedAt: new Date().toISOString() };
  });
});

// Marks a chat channel as read ("recipient" = my chat with my recipient,
// "santa" = my chat with my secret santa).
router.put("/p/:token/read", async (req, res) => {
  const channel = req.body?.channel === "santa" ? "santa" : "recipient";
  await mutateAndRespond(req, res, () => (g, p) => {
    p.lastRead = { ...(p.lastRead || {}), [channel]: new Date().toISOString() };
  });
});

router.post("/p/:token/messages", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const { group, me } = found;
  if (group.chatEnabled === false) return res.status(403).json({ error: "Der anonyme Chat ist in dieser Runde ausgeschaltet." });
  if (!isDrawn(group)) return res.status(400).json({ error: "Der Chat öffnet nach der Auslosung." });
  const text = cleanText(req.body?.text, cfg.messageMax);
  if (!text) return res.status(400).json({ error: "Nachricht ist leer." });
  const toRecipient = req.body?.channel === "recipient";
  const santa = giverOf(group, me.id);
  const channel = toRecipient ? me.id : santa?.id;
  if (!channel) return res.status(400).json({ error: "Kein Gesprächspartner gefunden." });
  const msg = { id: newId(), channel, from: me.id, text, at: new Date().toISOString() };
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    if (!g.messages) g.messages = [];
    g.messages.push(msg);
    if (g.messages.length > cfg.maxMessages) g.messages = g.messages.slice(-cfg.maxMessages);
    // Sending implies having read the channel.
    const p = findParticipant(g, me.id);
    p.lastRead = { ...(p.lastRead || {}), [toRecipient ? "recipient" : "santa"]: msg.at };
    return g;
  });
  const other = toRecipient ? findParticipant(updated, me.assignedTo) : santa;
  if (other) notify("message", { group: updated, p: other, who: toRecipient ? "Dein geheimer Wichtel" : me.name, text }).catch(() => {});
  res.status(201).json(participantView(updated, findParticipant(updated, me.id)));
});

// Thank-you notes after the event (the recap).
router.post("/p/:token/thanks", async (req, res) => {
  const text = cleanText(req.body?.text, cfg.thanksMax);
  if (!text) return res.status(400).json({ error: "Bitte schreib ein paar Worte." });
  let entry;
  const done = await mutateAndRespond(req, res, ({ group }) => {
    if (!isDrawn(group)) {
      res.status(400).json({ error: "Danke sagen geht nach der Auslosung." });
      return false;
    }
    if ((group.thanks || []).length >= cfg.maxThanks) {
      res.status(400).json({ error: "Der Rückblick ist voll." });
      return false;
    }
    return (g, p) => {
      if (!g.thanks) g.thanks = [];
      entry = { id: newId(), from: p.id, text, at: new Date().toISOString() };
      g.thanks.push(entry);
    };
  }, 201);
  if (!done) return;
  // The person's secret santa hears about it (still anonymous to the sender).
  const santa = giverOf(done.group, done.me.id);
  if (santa) notify("thanks", { group: done.group, p: santa, by: done.me, text }).catch(() => {});
});

router.delete("/p/:token/thanks/:thanksId", async (req, res) => {
  await mutateAndRespond(req, res, ({ group, me }) => {
    const t = (group.thanks || []).find((x) => x.id === req.params.thanksId);
    if (!t || t.from !== me.id) {
      res.status(404).json({ error: "Eintrag nicht gefunden." });
      return false;
    }
    return (g) => { g.thanks = (g.thanks || []).filter((x) => x.id !== t.id); };
  });
});

// ── Photos: images only, stored next to the calendar uploads ────────────────

const photoStorage = multer.diskStorage({
  destination: config.paths.uploadsDir,
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname || "").toLowerCase().match(/^\.(png|jpe?g|gif|webp)$/) || [".jpg"])[0];
    cb(null, `wichtel-${Date.now()}-${newId()}${ext}`);
  },
});
const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: cfg.photoMaxBytes },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)),
});

router.post("/p/:token/photos", photoUpload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Bitte ein Bild (PNG, JPG, GIF, WebP) auswählen." });
  const photo = { id: newId(), url: `/uploads/${req.file.filename}`, by: null, caption: cleanText(req.body?.caption, cfg.captionMax), at: new Date().toISOString() };
  const done = await mutateAndRespond(req, res, ({ group }) => {
    if ((group.photos || []).length >= cfg.maxPhotos) {
      res.status(400).json({ error: "Die Foto-Wand ist voll." });
      return false;
    }
    return (g, p) => {
      if (!g.photos) g.photos = [];
      g.photos.push({ ...photo, by: p.id });
    };
  }, 201);
  if (!done) removePhotoFiles({ photos: [photo] });
});

router.delete("/p/:token/photos/:photoId", async (req, res) => {
  await mutateAndRespond(req, res, ({ group, me }) => {
    const photo = (group.photos || []).find((ph) => ph.id === req.params.photoId);
    if (!photo || photo.by !== me.id) {
      res.status(404).json({ error: "Foto nicht gefunden." });
      return false;
    }
    removePhotoFiles({ photos: [photo] });
    return (g) => { g.photos = (g.photos || []).filter((ph) => ph.id !== photo.id); };
  });
});

// ── Calendar file ───────────────────────────────────────────────────────────

router.get("/p/:token/event.ics", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const { group, me } = found;
  if (!group.eventDate) return res.status(404).json({ error: "Es ist noch kein Termin festgelegt." });
  const target = isDrawn(group) ? findParticipant(group, me.assignedTo) : null;
  const description = [
    group.motto ? `Motto: ${group.motto}` : null,
    group.budget ? `Budget: ${group.budget}` : null,
    target ? `Du beschenkst: ${target.name}` : null,
    `Wichtel-Bereich: ${participantLink(me)}`,
  ].filter(Boolean).join("\n");
  const ics = buildIcs({ uid: `wichteln-${group.id}-${me.id}@advently`, title: `Wichteln: ${group.title}`, description, date: group.eventDate, time: group.eventTime, location: group.eventPlace, url: participantLink(me) });
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="wichteln-${group.id.slice(0, 8)}.ics"`);
  res.send(ics);
});

// ── Push registration (native app via Expo token, browsers via Web Push) ────

router.get("/vapidPublicKey", (req, res) => {
  const { getVapidPublicKey } = require("../../push");
  res.json({ publicKey: getVapidPublicKey() });
});

router.post("/p/:token/push", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const { isExpoPushToken } = require("../../push");
  let sub = req.body || {};
  if (sub.expoToken) {
    if (!isExpoPushToken(sub.expoToken)) return res.status(400).json({ error: "Ungültiges Push-Token." });
    sub = { endpoint: `expo:${sub.expoToken}`, expoToken: sub.expoToken, platform: String(sub.platform || "").slice(0, 10) };
  } else if (sub.endpoint && sub.keys) {
    sub = { endpoint: String(sub.endpoint).slice(0, 1000), keys: { p256dh: String(sub.keys.p256dh || ""), auth: String(sub.keys.auth || "") }, expirationTime: null };
  } else {
    return res.status(400).json({ error: "Kein Push-Abo übermittelt." });
  }
  await db.updateWichtelGroup(found.group.id, (g) => {
    const p = findParticipant(g, found.me.id);
    p.subscriptions = (p.subscriptions || []).filter((s) => s.endpoint !== sub.endpoint).concat([{ ...sub, addedAt: new Date().toISOString() }]).slice(-cfg.maxPushDevices);
    return g;
  });
  res.status(201).json({ ok: true });
});

router.delete("/p/:token/push", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const endpoint = req.body?.expoToken ? `expo:${req.body.expoToken}` : String(req.body?.endpoint || "");
  await db.updateWichtelGroup(found.group.id, (g) => {
    const p = findParticipant(g, found.me.id);
    p.subscriptions = (p.subscriptions || []).filter((s) => endpoint && s.endpoint !== endpoint);
    return g;
  });
  res.json({ ok: true });
});

// ── Link preview for wish lists ─────────────────────────────────────────────

router.post("/p/:token/link-preview", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const url = safeHttpUrl(req.body?.url);
  if (!url) return res.status(400).json({ error: "Bitte einen gültigen Link (http/https) eingeben." });
  try {
    res.json({ url, ...(await fetchLinkPreview(url)) });
  } catch (err) {
    res.json({ url, title: new URL(url).hostname, image: "", price: "", note: "Vorschau konnte nicht geladen werden – Titel bitte selbst eintragen." });
  }
});

module.exports = router;
