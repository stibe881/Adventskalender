/* Organizer API: everything a logged-in owner does with a Wichtel round. */
const express = require("express");
const db = require("../../db");
const { requireAuth } = require("../../middleware/auth");
const { generateToken, generateId } = require("../../utils/token");
const { generateQrDataUrl } = require("../../utils/qr");
const { isEmail, cleanText, drawAssignments } = require("../../utils/wichtel");
const { notify } = require("./notify");
const { isProItem } = require("../../utils/pro");
const {
  cfg, inviteLink, eventLine, newParticipant, findParticipant, activeParticipants, organizerView,
  loadOwnedGroup, applySettings, syncOrganizerParticipant, removePhotoFiles,
} = require("./shared");

const router = express.Router();
router.use("/groups", requireAuth);

const view = async (group) => organizerView(group, await isProItem(group));

function blankGroup(user, owner, b = {}) {
  return {
    id: generateId(),
    ownerId: user.id,
    ownerEmail: user.email,
    inviteToken: generateToken(cfg.inviteTokenBytes),
    title: cleanText(b.title, cfg.titleMax) || "Wichtel-Runde",
    organizerName: cleanText(b.organizerName, cfg.nameMax) || owner?.username || "",
    organizerParticipates: Boolean(b.organizerParticipates),
    inviteMode: ["email", "link", "names"].includes(b.inviteMode) ? b.inviteMode : "email",
    waitingRoom: true,
    wishlistsShared: false,
    budget: "",
    motto: "",
    eventDate: "",
    eventTime: "",
    eventPlace: "",
    description: "",
    chatEnabled: true,
    retentionDays: cfg.retentionDefault,
    status: "draft",
    participants: [],
    exclusions: [],
    messages: [],
    photos: [],
    thanks: [],
    createdAt: new Date().toISOString(),
  };
}

router.get("/groups", async (req, res) => {
  const groups = await db.getWichtelGroupsByOwner(req.user.id);
  const ownerPro = await isProItem({ ownerId: req.user.id });
  res.json(groups.map((g) => ({
    id: g.id,
    isPro: ownerPro || Boolean(g.isPro),
    title: g.title,
    status: g.status || "draft",
    eventDate: g.eventDate || "",
    participantCount: activeParticipants(g).length,
    pendingCount: (g.participants || []).filter((p) => p.pending).length,
    createdAt: g.createdAt,
    deleteAt: g.deleteAt || null,
  })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
});

router.post("/groups", async (req, res) => {
  const b = req.body || {};
  const owner = await db.getUserById(req.user.id);
  const group = blankGroup(req.user, owner, b);
  applySettings(group, b);
  syncOrganizerParticipant(group, req.user.email);
  await db.createWichtelGroup(group);
  res.status(201).json(await view(group));
});

router.get("/groups/:id", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  res.json(await view(group));
});

router.put("/groups/:id", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const b = req.body || {};
  const drawn = group.status !== "draft";
  if (drawn && b.organizerParticipates !== undefined && Boolean(b.organizerParticipates) !== Boolean(group.organizerParticipates)) {
    return res.status(409).json({ error: "Nach der Auslosung kann die Teilnahme des Organisators nicht mehr geändert werden. Lose zuerst neu aus." });
  }
  const dateBefore = `${group.eventDate}|${group.eventTime}|${group.eventPlace}`;
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    applySettings(g, b);
    if (b.organizerParticipates !== undefined) g.organizerParticipates = Boolean(b.organizerParticipates);
    syncOrganizerParticipant(g, req.user.email);
    return g;
  });
  const dateAfter = `${updated.eventDate}|${updated.eventTime}|${updated.eventPlace}`;
  if (updated.eventDate && dateAfter !== dateBefore && updated.status !== "draft") {
    for (const p of activeParticipants(updated)) notify("dateChanged", { group: updated, p }).catch(() => {});
  }
  res.json(await view(updated));
});

router.delete("/groups/:id", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  removePhotoFiles(group);
  await db.deleteWichtelGroup(group.id);
  res.json({ ok: true });
});

// Copies settings, participants (names + e-mails) and exclusions into a fresh
// draft round – handy for the same circle of people next year.
router.post("/groups/:id/duplicate", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const owner = await db.getUserById(req.user.id);
  const copy = blankGroup(req.user, owner, {
    title: cleanText(req.body?.title, cfg.titleMax) || `${group.title} (Kopie)`,
    organizerName: group.organizerName,
    organizerParticipates: group.organizerParticipates,
    inviteMode: group.inviteMode,
  });
  applySettings(copy, {
    waitingRoom: group.waitingRoom !== false,
    wishlistsShared: Boolean(group.wishlistsShared),
    budget: group.budget,
    motto: group.motto,
    eventPlace: group.eventPlace,
    description: group.description,
    chatEnabled: group.chatEnabled !== false,
    retentionDays: group.retentionDays,
  });
  const idMap = {};
  for (const p of activeParticipants(group)) {
    const np = newParticipant({ name: p.name, email: p.email, isOrganizer: Boolean(p.isOrganizer) });
    idMap[p.id] = np.id;
    copy.participants.push(np);
  }
  copy.exclusions = (group.exclusions || []).filter(([a, b]) => idMap[a] && idMap[b]).map(([a, b]) => [idMap[a], idMap[b]]);
  syncOrganizerParticipant(copy, req.user.email);
  await db.createWichtelGroup(copy);
  res.status(201).json(await view(copy));
});

router.post("/groups/:id/participants", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const name = cleanText(req.body?.name, cfg.nameMax);
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!name) return res.status(400).json({ error: "Name fehlt." });
  if (email && !isEmail(email)) return res.status(400).json({ error: "Ungültige E-Mail-Adresse." });
  if (group.inviteMode === "email" && !email) return res.status(400).json({ error: "Im E-Mail-Modus braucht jede Person eine E-Mail-Adresse." });
  if ((group.participants || []).length >= cfg.maxParticipants) return res.status(400).json({ error: `Maximal ${cfg.maxParticipants} Teilnehmende pro Runde.` });
  if (email && group.participants.some((p) => p.email === email)) return res.status(400).json({ error: "Diese E-Mail-Adresse ist schon dabei." });
  if (group.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) return res.status(400).json({ error: "Dieser Name ist schon vergeben – bitte eindeutig benennen." });
  const p = newParticipant({ name, email });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.participants.push(p);
    return g;
  });
  res.status(201).json(await view(updated));
});

router.put("/groups/:id/participants/:pid", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const target = findParticipant(group, req.params.pid);
  if (!target) return res.status(404).json({ error: "Person nicht gefunden." });
  const name = req.body?.name !== undefined ? cleanText(req.body.name, cfg.nameMax) : target.name;
  const email = req.body?.email !== undefined ? String(req.body.email || "").trim().toLowerCase() : target.email;
  if (!name) return res.status(400).json({ error: "Name fehlt." });
  if (email && !isEmail(email)) return res.status(400).json({ error: "Ungültige E-Mail-Adresse." });
  if (email && group.participants.some((p) => p.id !== target.id && p.email === email)) return res.status(400).json({ error: "Diese E-Mail-Adresse ist schon dabei." });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    const p = findParticipant(g, target.id);
    p.name = name;
    p.email = email;
    return g;
  });
  res.json(await view(updated));
});

router.delete("/groups/:id/participants/:pid", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const target = findParticipant(group, req.params.pid);
  if (!target) return res.status(404).json({ error: "Person nicht gefunden." });
  if (target.isOrganizer) return res.status(400).json({ error: "Schalte dazu „Organisator wichtelt mit“ aus." });
  if (group.status !== "draft" && !target.pending) return res.status(409).json({ error: "Nach der Auslosung kann niemand mehr entfernt werden. Lose zuerst neu aus." });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.participants = g.participants.filter((p) => p.id !== target.id);
    g.exclusions = (g.exclusions || []).filter(([a, b]) => a !== target.id && b !== target.id);
    return g;
  });
  res.json(await view(updated));
});

router.post("/groups/:id/participants/:pid/approve", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const target = findParticipant(group, req.params.pid);
  if (!target) return res.status(404).json({ error: "Person nicht gefunden." });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    findParticipant(g, target.id).pending = false;
    return g;
  });
  notify("approved", { group: updated, p: findParticipant(updated, target.id) }).catch(() => {});
  res.json(await view(updated));
});

router.post("/groups/:id/participants/:pid/invite", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const target = findParticipant(group, req.params.pid);
  if (!target) return res.status(404).json({ error: "Person nicht gefunden." });
  if (!target.email) return res.status(400).json({ error: "Diese Person hat keine E-Mail-Adresse. Teile den Link direkt." });
  const sent = await notify("invitation", { group, p: target });
  await db.updateWichtelGroup(group.id, (g) => {
    findParticipant(g, target.id).invitedAt = new Date().toISOString();
    return g;
  });
  res.json({ ok: true, sent });
});

router.post("/groups/:id/invite-all", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  let count = 0;
  for (const p of activeParticipants(group)) {
    if (!p.email || p.isOrganizer) continue;
    await notify("invitation", { group, p });
    count++;
  }
  await db.updateWichtelGroup(group.id, (g) => {
    const now = new Date().toISOString();
    g.participants.forEach((p) => { if (p.email && !p.isOrganizer && !p.pending) p.invitedAt = now; });
    return g;
  });
  res.json({ ok: true, count });
});

router.put("/groups/:id/exclusions", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const ids = new Set((group.participants || []).map((p) => p.id));
  const raw = Array.isArray(req.body?.exclusions) ? req.body.exclusions : [];
  const seen = new Set();
  const exclusions = [];
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const [a, b] = pair.map(String);
    if (a === b || !ids.has(a) || !ids.has(b)) continue;
    const key = [a, b].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    exclusions.push([a, b]);
  }
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.exclusions = exclusions;
    return g;
  });
  res.json(await view(updated));
});

// Everything the organizer should look at before drawing.
router.get("/groups/:id/checklist", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const active = activeParticipants(group);
  const pending = (group.participants || []).filter((p) => p.pending);
  const withoutEmail = active.filter((p) => !p.email);
  const notInvited = active.filter((p) => p.email && !p.isOrganizer && !p.invitedAt);
  const possible = active.length >= cfg.minParticipantsForDraw && Boolean(drawAssignments(active.map((p) => p.id), group.exclusions || []));
  const items = [
    { key: "count", ok: active.length >= cfg.minParticipantsForDraw, label: `Mindestens ${cfg.minParticipantsForDraw} Teilnehmende (${active.length})`, blocking: true },
    { key: "pending", ok: pending.length === 0, label: pending.length ? `${pending.length} im Warteraum – freigeben oder entfernen` : "Niemand wartet im Warteraum", blocking: false },
    { key: "exclusions", ok: possible, label: possible ? "Ausschlüsse lassen eine Auslosung zu" : "Mit diesen Ausschlüssen ist keine Auslosung möglich", blocking: true },
    { key: "date", ok: Boolean(group.eventDate), label: group.eventDate ? `Termin: ${eventLine(group)}` : "Termin der Bescherung fehlt", blocking: false },
    { key: "budget", ok: Boolean(group.budget), label: group.budget ? `Budget: ${group.budget}` : "Budget ist nicht festgelegt", blocking: false },
    { key: "email", ok: withoutEmail.length === 0, label: withoutEmail.length ? `${withoutEmail.length} ohne E-Mail – Link direkt teilen` : "Alle haben eine E-Mail-Adresse", blocking: false },
    { key: "invited", ok: notInvited.length === 0, label: notInvited.length ? `${notInvited.length} noch nicht eingeladen` : "Alle sind eingeladen", blocking: false },
  ];
  res.json({ ready: items.filter((i) => i.blocking).every((i) => i.ok), items });
});

router.post("/groups/:id/draw", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const active = activeParticipants(group);
  if (active.length < cfg.minParticipantsForDraw) return res.status(400).json({ error: `Mindestens ${cfg.minParticipantsForDraw === 3 ? "drei" : cfg.minParticipantsForDraw} Teilnehmende werden gebraucht.` });
  const map = drawAssignments(active.map((p) => p.id), group.exclusions || []);
  if (!map) return res.status(409).json({ error: "Mit diesen Ausschlüssen ist keine Auslosung möglich. Entferne einen Ausschluss oder füge Teilnehmende hinzu." });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.participants.forEach((p) => {
      p.assignedTo = map[p.id] || null;
      p.giftStatus = { method: p.giftStatus?.method || "personal", steps: [], updatedAt: null };
      p.lastRead = {};
    });
    g.status = "drawn";
    g.drawnAt = new Date().toISOString();
    g.revealedAt = null;
    g.messages = [];
    g.giftReminderSentFor = [];
    return g;
  });
  let mails = 0;
  for (const p of activeParticipants(updated)) {
    if (await notify("draw", { group: updated, p })) mails++;
  }
  res.json({ ...(await view(updated)), mailsSent: mails });
});

router.post("/groups/:id/reveal", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  if (group.status === "draft") return res.status(400).json({ error: "Es wurde noch nicht ausgelost." });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.status = "revealed";
    g.revealedAt = new Date().toISOString();
    return g;
  });
  res.json(await view(updated));
});

// Take the reveal back: the draw stays, the assignments are hidden again.
router.post("/groups/:id/unreveal", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  if (group.status !== "revealed") return res.status(400).json({ error: "Die Runde ist nicht enthüllt." });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.status = "drawn";
    g.revealedAt = null;
    return g;
  });
  res.json(await view(updated));
});

router.get("/groups/:id/invite-card", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const link = inviteLink(group);
  res.json({ link, qr: await generateQrDataUrl(link), title: group.title, organizerName: group.organizerName, motto: group.motto, budget: group.budget, eventDate: group.eventDate, eventTime: group.eventTime, eventPlace: group.eventPlace, description: group.description || "" });
});

router.post("/groups/:id/rotate-invite", async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.inviteToken = generateToken(cfg.inviteTokenBytes);
    return g;
  });
  res.json(await view(updated));
});

module.exports = router;
