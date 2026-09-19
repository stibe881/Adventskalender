const express = require("express");
const path = require("path");
const fs = require("fs");
const dns = require("dns").promises;
const net = require("net");
const crypto = require("crypto");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const config = require("../config");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { generateToken, generateId } = require("../utils/token");
const { generateQrDataUrl } = require("../utils/qr");
const { sendMail, layout, escapeHtml } = require("../services/mail");
const {
  MAX_PARTICIPANTS, RETENTION_OPTIONS, GIFT_STEPS, GIFT_STEP_LABELS, isEmail, cleanText, shortToken, drawAssignments, buildIcs,
} = require("../utils/wichtel");

const router = express.Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function ownerOf(group, user) {
  return Boolean(group && user && (group.ownerId === user.id || (group.ownerEmail && group.ownerEmail === user.email)));
}

function participantLink(p) {
  return `${config.baseUrl}/w/${p.token}`;
}

function inviteLink(group) {
  return `${config.baseUrl}/w/join/${group.inviteToken}`;
}

function computeDeleteAt(group) {
  const days = RETENTION_OPTIONS.includes(group.retentionDays) ? group.retentionDays : 90;
  const base = group.eventDate ? new Date(`${group.eventDate}T23:59:59`) : new Date(group.createdAt || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function newParticipant({ name, email, isOrganizer = false, pending = false }) {
  return {
    id: generateId(),
    token: shortToken(),
    name: cleanText(name, 60),
    email: isEmail(email) ? String(email).trim().toLowerCase() : "",
    isOrganizer,
    pending,
    createdAt: new Date().toISOString(),
    joinedAt: null,
    hints: { allergies: "", favorites: "", hobbies: "", notes: "" },
    wishlist: [],
    giftStatus: { method: "personal", steps: [] },
    notify: { email: true },
    assignedTo: null,
  };
}

function findParticipant(group, id) {
  return (group.participants || []).find((p) => p.id === id) || null;
}

function giverOf(group, receiverId) {
  return (group.participants || []).find((p) => p.assignedTo === receiverId) || null;
}

function activeParticipants(group) {
  return (group.participants || []).filter((p) => !p.pending);
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function eventLine(group) {
  if (!group.eventDate) return "";
  return `${formatDate(group.eventDate)}${group.eventTime ? ` um ${group.eventTime} Uhr` : ""}${group.eventPlace ? `, ${group.eventPlace}` : ""}`;
}

// E-mail (with the personal link) plus push to every device the person
// registered: the native app (Expo token) or a browser (Web Push).
async function notifyParticipant(group, p, subject, textBody, htmlBody, pushBody) {
  if (!p) return false;
  const link = participantLink(p);
  pushParticipant(group, p, subject, pushBody || textBody.split("\n").filter(Boolean).slice(-1)[0] || subject).catch(() => {});
  if (!p.email || p.notify?.email === false) return false;
  const text = `${textBody}\n\nDein persönlicher Wichtel-Bereich (dein Link):\n${link}`;
  const html = layout(group.title, `${htmlBody}<p style="margin-top:20px"><a href="${link}" style="background:#059669;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Zum Wichtel-Bereich</a></p><p style="font-size:12px;color:#94a3b8">Dein persönlicher Link: <a href="${link}" style="color:#6ee7b7">${link}</a></p>`);
  return sendMail({ to: p.email, subject: `[${group.title}] ${subject}`, text, html });
}

async function pushParticipant(group, p, title, body) {
  const subs = p.subscriptions || [];
  if (!subs.length || p.notify?.push === false) return;
  const { sendPushNotification } = require("../push");
  const dead = [];
  for (const sub of subs) {
    try {
      await sendPushNotification(sub, { title: `${group.title}: ${title}`, body, url: participantLink(p) });
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) dead.push(sub.endpoint);
      else console.warn("[Wichteln] Push fehlgeschlagen:", err.message);
    }
  }
  if (dead.length) {
    await db.updateWichtelGroup(group.id, (g) => {
      const x = findParticipant(g, p.id);
      if (x) x.subscriptions = (x.subscriptions || []).filter((s) => !dead.includes(s.endpoint));
      return g;
    });
  }
}

async function sendInvitation(group, p) {
  if (!p.email) return false;
  const intro = group.organizerName ? `${group.organizerName} lädt dich zum Wichteln ein.` : "Du bist zum Wichteln eingeladen.";
  const details = [
    group.motto ? `Motto: ${group.motto}` : null,
    group.budget ? `Budget: ${group.budget}` : null,
    group.eventDate ? `Bescherung: ${eventLine(group)}` : null,
  ].filter(Boolean);
  const text = `Hallo ${p.name}!\n\n${intro}\nRunde: ${group.title}\n${details.join("\n")}\n\nÜber deinen persönlichen Link kannst du deinen Wunschzettel pflegen und siehst nach der Auslosung, wen du beschenkst.`;
  const html = `<p>Hallo ${escapeHtml(p.name)}!</p><p>${escapeHtml(intro)}</p><p><strong>${escapeHtml(group.title)}</strong></p><ul>${details.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul><p>Über deinen persönlichen Link kannst du deinen Wunschzettel pflegen und siehst nach der Auslosung, wen du beschenkst.</p>`;
  return notifyParticipant(group, p, "Einladung zum Wichteln", text, html);
}

async function sendDrawMail(group, p) {
  const target = findParticipant(group, p.assignedTo);
  if (!target) return false;
  const text = `Hallo ${p.name}!\n\nDie Auslosung ist erledigt. Du beschenkst: ${target.name}\n${group.budget ? `Budget: ${group.budget}\n` : ""}${group.eventDate ? `Bescherung: ${eventLine(group)}\n` : ""}\nPsst – das bleibt unter uns.`;
  const html = `<p>Hallo ${escapeHtml(p.name)}!</p><p>Die Auslosung ist erledigt. Du beschenkst:</p><p style="font-size:22px;font-weight:700;color:#34d399">${escapeHtml(target.name)}</p>${group.budget ? `<p>Budget: ${escapeHtml(group.budget)}</p>` : ""}${group.eventDate ? `<p>Bescherung: ${escapeHtml(eventLine(group))}</p>` : ""}<p>Psst – das bleibt unter uns.</p>`;
  return notifyParticipant(group, p, "Dein Los ist da", text, html);
}

// What the organizer sees. Assignments stay hidden until the reveal so the
// organizer can take part without knowing the draw.
function organizerView(group) {
  const revealed = group.status === "revealed";
  return {
    id: group.id,
    title: group.title,
    organizerName: group.organizerName,
    organizerParticipates: Boolean(group.organizerParticipates),
    inviteMode: group.inviteMode,
    waitingRoom: group.waitingRoom !== false,
    budget: group.budget || "",
    motto: group.motto || "",
    eventDate: group.eventDate || "",
    eventTime: group.eventTime || "",
    eventPlace: group.eventPlace || "",
    description: group.description || "",
    chatEnabled: group.chatEnabled !== false,
    retentionDays: group.retentionDays || 90,
    deleteAt: group.deleteAt || null,
    status: group.status || "draft",
    createdAt: group.createdAt,
    drawnAt: group.drawnAt || null,
    revealedAt: group.revealedAt || null,
    inviteLink: inviteLink(group),
    maxParticipants: MAX_PARTICIPANTS,
    exclusions: group.exclusions || [],
    photos: (group.photos || []).map((ph) => ({ id: ph.id, url: ph.url, caption: ph.caption, by: findParticipant(group, ph.by)?.name || "", at: ph.at })),
    participants: (group.participants || []).map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      isOrganizer: Boolean(p.isOrganizer),
      pending: Boolean(p.pending),
      joinedAt: p.joinedAt,
      invitedAt: p.invitedAt || null,
      link: participantLink(p),
      wishlistCount: (p.wishlist || []).length,
      wishlist: (p.wishlist || []).map((w) => ({ url: w.url, title: w.title, price: w.price, note: w.note })),
      hints: p.hints || {},
      giftProgress: giftProgress(p),
      assignedTo: revealed ? p.assignedTo : null,
      assignedToName: revealed ? findParticipant(group, p.assignedTo)?.name || null : null,
    })),
  };
}

function giftProgress(p) {
  const method = p.giftStatus?.method === "post" ? "post" : "personal";
  const all = GIFT_STEPS[method];
  const done = (p.giftStatus?.steps || []).filter((s) => all.includes(s));
  return { method, done: done.length, total: all.length, steps: all.map((s) => ({ key: s, label: GIFT_STEP_LABELS[s], done: done.includes(s) })) };
}

function channelMessages(group, giverId, viewerId) {
  const giver = findParticipant(group, giverId);
  return (group.messages || [])
    .filter((m) => m.channel === giverId)
    .map((m) => ({
      id: m.id,
      at: m.at,
      text: m.text,
      mine: m.from === viewerId,
      // The giver stays anonymous towards the receiver.
      from: m.from === giverId ? (viewerId === giverId ? "Du" : "Dein geheimer Wichtel") : (findParticipant(group, m.from)?.name || "?"),
    }));
}

function participantView(group, me) {
  const drawn = group.status === "drawn" || group.status === "revealed";
  const target = drawn ? findParticipant(group, me.assignedTo) : null;
  const santa = drawn ? giverOf(group, me.id) : null;
  const chat = group.chatEnabled !== false;
  return {
    group: {
      id: group.id,
      title: group.title,
      organizerName: group.organizerName,
      budget: group.budget || "",
      motto: group.motto || "",
      eventDate: group.eventDate || "",
      eventTime: group.eventTime || "",
      eventPlace: group.eventPlace || "",
      description: group.description || "",
      status: group.status || "draft",
      chatEnabled: chat,
      deleteAt: group.deleteAt || null,
      participantCount: activeParticipants(group).length,
    },
    me: {
      id: me.id,
      name: me.name,
      email: me.email,
      pending: Boolean(me.pending),
      isOrganizer: Boolean(me.isOrganizer),
      hints: me.hints || {},
      wishlist: me.wishlist || [],
      giftStatus: giftProgress(me),
      notify: me.notify || { email: true },
      icsUrl: group.eventDate ? `/api/wichteln/p/${me.token}/event.ics` : null,
    },
    recipient: target ? {
      id: target.id,
      name: target.name,
      hints: target.hints || {},
      wishlist: (target.wishlist || []).map((w) => ({ id: w.id, url: w.url, title: w.title, image: w.image, price: w.price, note: w.note })),
      messages: chat ? channelMessages(group, me.id, me.id) : [],
    } : null,
    santa: santa ? {
      progress: giftProgress(santa),
      messages: chat ? channelMessages(group, santa.id, me.id) : [],
    } : null,
    participants: activeParticipants(group).map((p) => ({ id: p.id, name: p.name, isOrganizer: Boolean(p.isOrganizer), joined: Boolean(p.joinedAt) })),
    photos: (group.photos || []).map((ph) => ({ id: ph.id, url: ph.url, caption: ph.caption, by: findParticipant(group, ph.by)?.name || "", mine: ph.by === me.id, at: ph.at })),
    // The reveal is for the organizer only.
    reveal: group.status === "revealed" && me.isOrganizer
      ? activeParticipants(group).map((p) => ({ giver: p.name, receiver: findParticipant(group, p.assignedTo)?.name || "?" }))
      : null,
  };
}

async function loadOwnedGroup(req, res) {
  const group = await db.getWichtelGroupById(req.params.id);
  if (!ownerOf(group, req.user)) {
    res.status(404).json({ error: "Wichtel-Runde nicht gefunden." });
    return null;
  }
  return group;
}

async function loadByParticipantToken(req, res) {
  const token = String(req.params.token || "");
  if (!/^[\w-]{8,64}$/.test(token)) {
    res.status(404).json({ error: "Link ungültig." });
    return null;
  }
  const group = await db.getWichtelGroupByParticipantToken(token);
  const me = group ? (group.participants || []).find((p) => p.token === token) : null;
  if (!group || !me) {
    res.status(404).json({ error: "Link ungültig oder die Runde wurde bereits gelöscht." });
    return null;
  }
  return { group, me };
}

function applySettings(group, body) {
  const b = body || {};
  if (b.title !== undefined) group.title = cleanText(b.title, 80) || group.title;
  if (b.organizerName !== undefined) group.organizerName = cleanText(b.organizerName, 60);
  if (b.inviteMode !== undefined && ["email", "link", "names"].includes(b.inviteMode)) group.inviteMode = b.inviteMode;
  if (b.waitingRoom !== undefined) group.waitingRoom = Boolean(b.waitingRoom);
  if (b.budget !== undefined) group.budget = cleanText(b.budget, 40);
  if (b.motto !== undefined) group.motto = cleanText(b.motto, 120);
  if (b.eventDate !== undefined) group.eventDate = /^\d{4}-\d{2}-\d{2}$/.test(b.eventDate) ? b.eventDate : "";
  if (b.eventTime !== undefined) group.eventTime = /^\d{2}:\d{2}$/.test(b.eventTime) ? b.eventTime : "";
  if (b.eventPlace !== undefined) group.eventPlace = cleanText(b.eventPlace, 120);
  if (b.description !== undefined) group.description = cleanText(b.description, 2000);
  if (b.chatEnabled !== undefined) group.chatEnabled = Boolean(b.chatEnabled);
  if (b.retentionDays !== undefined && RETENTION_OPTIONS.includes(Number(b.retentionDays))) group.retentionDays = Number(b.retentionDays);
  group.deleteAt = computeDeleteAt(group);
}

// Keeps the organizer's own participant entry in sync with the setting.
function syncOrganizerParticipant(group, ownerEmail) {
  const existing = (group.participants || []).find((p) => p.isOrganizer);
  if (group.organizerParticipates && !existing) {
    group.participants.push(newParticipant({ name: group.organizerName || "Organisator", email: ownerEmail, isOrganizer: true }));
  } else if (!group.organizerParticipates && existing) {
    group.participants = group.participants.filter((p) => p.id !== existing.id);
    group.exclusions = (group.exclusions || []).filter(([a, b]) => a !== existing.id && b !== existing.id);
  } else if (existing && group.organizerName && !existing.joinedAt) {
    existing.name = group.organizerName;
  }
}

// ── Organizer API ───────────────────────────────────────────────────────────

router.get("/groups", requireAuth, async (req, res) => {
  const groups = await db.getWichtelGroupsByOwner(req.user.id);
  res.json(groups.map((g) => ({
    id: g.id,
    title: g.title,
    status: g.status || "draft",
    eventDate: g.eventDate || "",
    participantCount: activeParticipants(g).length,
    pendingCount: (g.participants || []).filter((p) => p.pending).length,
    createdAt: g.createdAt,
    deleteAt: g.deleteAt || null,
  })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
});

router.post("/groups", requireAuth, async (req, res) => {
  const b = req.body || {};
  const owner = await db.getUserById(req.user.id);
  const group = {
    id: generateId(),
    ownerId: req.user.id,
    ownerEmail: req.user.email,
    inviteToken: generateToken(18),
    title: cleanText(b.title, 80) || "Wichtel-Runde",
    organizerName: cleanText(b.organizerName, 60) || owner?.username || "",
    organizerParticipates: Boolean(b.organizerParticipates),
    inviteMode: ["email", "link", "names"].includes(b.inviteMode) ? b.inviteMode : "email",
    waitingRoom: true,
    budget: "",
    motto: "",
    eventDate: "",
    eventTime: "",
    eventPlace: "",
    description: "",
    chatEnabled: true,
    retentionDays: 90,
    status: "draft",
    participants: [],
    exclusions: [],
    messages: [],
    photos: [],
    createdAt: new Date().toISOString(),
  };
  applySettings(group, b);
  syncOrganizerParticipant(group, req.user.email);
  await db.createWichtelGroup(group);
  res.status(201).json(organizerView(group));
});

router.get("/groups/:id", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  res.json(organizerView(group));
});

router.put("/groups/:id", requireAuth, async (req, res) => {
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
    const line = eventLine(updated);
    for (const p of activeParticipants(updated)) {
      notifyParticipant(updated, p, "Neuer Termin für die Bescherung", `Hallo ${p.name}!\n\nDer Termin für die Bescherung wurde geändert:\n${line}`, `<p>Hallo ${escapeHtml(p.name)}!</p><p>Der Termin für die Bescherung wurde geändert:</p><p><strong>${escapeHtml(line)}</strong></p>`).catch(() => {});
    }
  }
  res.json(organizerView(updated));
});

router.delete("/groups/:id", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  removePhotoFiles(group);
  await db.deleteWichtelGroup(group.id);
  res.json({ ok: true });
});

router.post("/groups/:id/participants", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const name = cleanText(req.body?.name, 60);
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!name) return res.status(400).json({ error: "Name fehlt." });
  if (email && !isEmail(email)) return res.status(400).json({ error: "Ungültige E-Mail-Adresse." });
  if (group.inviteMode === "email" && !email) return res.status(400).json({ error: "Im E-Mail-Modus braucht jede Person eine E-Mail-Adresse." });
  if ((group.participants || []).length >= MAX_PARTICIPANTS) return res.status(400).json({ error: `Maximal ${MAX_PARTICIPANTS} Teilnehmende pro Runde.` });
  if (email && group.participants.some((p) => p.email === email)) return res.status(400).json({ error: "Diese E-Mail-Adresse ist schon dabei." });
  if (group.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) return res.status(400).json({ error: "Dieser Name ist schon vergeben – bitte eindeutig benennen." });
  const p = newParticipant({ name, email });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.participants.push(p);
    return g;
  });
  res.status(201).json(organizerView(updated));
});

router.put("/groups/:id/participants/:pid", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const target = findParticipant(group, req.params.pid);
  if (!target) return res.status(404).json({ error: "Person nicht gefunden." });
  const name = req.body?.name !== undefined ? cleanText(req.body.name, 60) : target.name;
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
  res.json(organizerView(updated));
});

router.delete("/groups/:id/participants/:pid", requireAuth, async (req, res) => {
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
  res.json(organizerView(updated));
});

router.post("/groups/:id/participants/:pid/approve", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const target = findParticipant(group, req.params.pid);
  if (!target) return res.status(404).json({ error: "Person nicht gefunden." });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    const p = findParticipant(g, target.id);
    p.pending = false;
    return g;
  });
  const p = findParticipant(updated, target.id);
  notifyParticipant(updated, p, "Du bist dabei!", `Hallo ${p.name}!\n\nDer Organisator hat dich in die Wichtel-Runde aufgenommen.`, `<p>Hallo ${escapeHtml(p.name)}!</p><p>Der Organisator hat dich in die Wichtel-Runde aufgenommen.</p>`).catch(() => {});
  res.json(organizerView(updated));
});

router.post("/groups/:id/participants/:pid/invite", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const target = findParticipant(group, req.params.pid);
  if (!target) return res.status(404).json({ error: "Person nicht gefunden." });
  if (!target.email) return res.status(400).json({ error: "Diese Person hat keine E-Mail-Adresse. Teile den Link direkt." });
  const sent = await sendInvitation(group, target);
  await db.updateWichtelGroup(group.id, (g) => {
    const p = findParticipant(g, target.id);
    p.invitedAt = new Date().toISOString();
    return g;
  });
  res.json({ ok: true, sent });
});

router.post("/groups/:id/invite-all", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  let count = 0;
  for (const p of activeParticipants(group)) {
    if (!p.email || p.isOrganizer) continue;
    await sendInvitation(group, p);
    count++;
  }
  await db.updateWichtelGroup(group.id, (g) => {
    const now = new Date().toISOString();
    g.participants.forEach((p) => { if (p.email && !p.isOrganizer && !p.pending) p.invitedAt = now; });
    return g;
  });
  res.json({ ok: true, count });
});

router.put("/groups/:id/exclusions", requireAuth, async (req, res) => {
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
  res.json(organizerView(updated));
});

router.post("/groups/:id/draw", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const active = activeParticipants(group);
  if (active.length < 3) return res.status(400).json({ error: "Mindestens drei Teilnehmende werden gebraucht." });
  const map = drawAssignments(active.map((p) => p.id), group.exclusions || []);
  if (!map) return res.status(409).json({ error: "Mit diesen Ausschlüssen ist keine Auslosung möglich. Entferne einen Ausschluss oder füge Teilnehmende hinzu." });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.participants.forEach((p) => { p.assignedTo = map[p.id] || null; });
    g.status = "drawn";
    g.drawnAt = new Date().toISOString();
    g.revealedAt = null;
    g.messages = [];
    g.participants.forEach((p) => { p.giftStatus = { method: p.giftStatus?.method || "personal", steps: [] }; });
    return g;
  });
  let mails = 0;
  for (const p of activeParticipants(updated)) {
    if (await sendDrawMail(updated, p)) mails++;
  }
  res.json({ ...organizerView(updated), mailsSent: mails });
});

router.post("/groups/:id/reveal", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  if (group.status === "draft") return res.status(400).json({ error: "Es wurde noch nicht ausgelost." });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.status = "revealed";
    g.revealedAt = new Date().toISOString();
    return g;
  });
  res.json(organizerView(updated));
});

// Take the reveal back: the draw stays, the assignments are hidden again.
router.post("/groups/:id/unreveal", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  if (group.status !== "revealed") return res.status(400).json({ error: "Die Runde ist nicht enthüllt." });
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.status = "drawn";
    g.revealedAt = null;
    return g;
  });
  res.json(organizerView(updated));
});

router.get("/groups/:id/invite-card", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const link = inviteLink(group);
  res.json({ link, qr: await generateQrDataUrl(link), title: group.title, organizerName: group.organizerName, motto: group.motto, budget: group.budget, eventDate: group.eventDate, eventTime: group.eventTime, eventPlace: group.eventPlace });
});

router.post("/groups/:id/rotate-invite", requireAuth, async (req, res) => {
  const group = await loadOwnedGroup(req, res);
  if (!group) return;
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    g.inviteToken = generateToken(18);
    return g;
  });
  res.json(organizerView(updated));
});

// ── Join via invite link ────────────────────────────────────────────────────

const joinLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

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
  const name = cleanText(req.body?.name, 60);
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!name) return res.status(400).json({ error: "Bitte gib deinen Namen ein." });
  if (email && !isEmail(email)) return res.status(400).json({ error: "Ungültige E-Mail-Adresse." });
  if ((group.participants || []).length >= MAX_PARTICIPANTS) return res.status(400).json({ error: "Diese Runde ist voll." });

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

// ── Participant API ─────────────────────────────────────────────────────────

const participantLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
router.use("/p", participantLimiter);

router.get("/p/:token", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  let { group, me } = found;
  if (!me.joinedAt) {
    group = await db.updateWichtelGroup(group.id, (g) => {
      const p = g.participants.find((x) => x.id === me.id);
      p.joinedAt = new Date().toISOString();
      return g;
    });
    me = findParticipant(group, me.id);
  }
  res.json(participantView(group, me));
});

router.put("/p/:token/profile", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const b = req.body || {};
  if (b.email !== undefined && b.email && !isEmail(b.email)) return res.status(400).json({ error: "Ungültige E-Mail-Adresse." });
  const updated = await db.updateWichtelGroup(found.group.id, (g) => {
    const p = findParticipant(g, found.me.id);
    if (b.name !== undefined && cleanText(b.name, 60)) p.name = cleanText(b.name, 60);
    if (b.email !== undefined) p.email = b.email ? String(b.email).trim().toLowerCase() : "";
    if (b.hints && typeof b.hints === "object") {
      p.hints = {
        allergies: cleanText(b.hints.allergies, 300),
        favorites: cleanText(b.hints.favorites, 300),
        hobbies: cleanText(b.hints.hobbies, 300),
        notes: cleanText(b.hints.notes, 500),
      };
    }
    if (b.notify && typeof b.notify === "object") p.notify = { email: b.notify.email !== false, push: b.notify.push !== false };
    return g;
  });
  res.json(participantView(updated, findParticipant(updated, found.me.id)));
});

router.put("/p/:token/wishlist", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const raw = Array.isArray(req.body?.wishlist) ? req.body.wishlist.slice(0, 30) : [];
  const wishlist = raw.map((w) => ({
    id: typeof w.id === "string" && /^[\w-]{1,40}$/.test(w.id) ? w.id : crypto.randomBytes(6).toString("hex"),
    url: safeHttpUrl(w.url) || "",
    title: cleanText(w.title, 140),
    image: safeHttpUrl(w.image) || "",
    price: cleanText(w.price, 20),
    note: cleanText(w.note, 300),
  })).filter((w) => w.title || w.url);
  const updated = await db.updateWichtelGroup(found.group.id, (g) => {
    const p = findParticipant(g, found.me.id);
    p.wishlist = wishlist;
    p.wishlistUpdatedAt = new Date().toISOString();
    return g;
  });
  // Tell the secret santa, at most once per hour.
  const santa = giverOf(updated, found.me.id);
  const me = findParticipant(updated, found.me.id);
  if (santa && (!me.wishlistNotifiedAt || Date.now() - new Date(me.wishlistNotifiedAt).getTime() > 60 * 60 * 1000)) {
    await db.updateWichtelGroup(updated.id, (g) => { findParticipant(g, me.id).wishlistNotifiedAt = new Date().toISOString(); return g; });
    notifyParticipant(updated, santa, "Wunschzettel aktualisiert", `Hallo ${santa.name}!\n\n${me.name} hat den Wunschzettel geändert. Schau mal rein.`, `<p>Hallo ${escapeHtml(santa.name)}!</p><p><strong>${escapeHtml(me.name)}</strong> hat den Wunschzettel geändert. Schau mal rein.</p>`).catch(() => {});
  }
  res.json(participantView(updated, me));
});

router.put("/p/:token/gift-status", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const method = req.body?.method === "post" ? "post" : "personal";
  const allowed = GIFT_STEPS[method];
  const steps = Array.isArray(req.body?.steps) ? req.body.steps.filter((s) => allowed.includes(s)) : [];
  const updated = await db.updateWichtelGroup(found.group.id, (g) => {
    const p = findParticipant(g, found.me.id);
    p.giftStatus = { method, steps: [...new Set(steps)], updatedAt: new Date().toISOString() };
    return g;
  });
  res.json(participantView(updated, findParticipant(updated, found.me.id)));
});

router.post("/p/:token/messages", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const { group, me } = found;
  if (group.chatEnabled === false) return res.status(403).json({ error: "Der anonyme Chat ist in dieser Runde ausgeschaltet." });
  if (group.status === "draft") return res.status(400).json({ error: "Der Chat öffnet nach der Auslosung." });
  const text = cleanText(req.body?.text, 1000);
  if (!text) return res.status(400).json({ error: "Nachricht ist leer." });
  const toRecipient = req.body?.channel === "recipient";
  const santa = giverOf(group, me.id);
  const channel = toRecipient ? me.id : santa?.id;
  if (!channel) return res.status(400).json({ error: "Kein Gesprächspartner gefunden." });
  const msg = { id: crypto.randomBytes(6).toString("hex"), channel, from: me.id, text, at: new Date().toISOString() };
  const updated = await db.updateWichtelGroup(group.id, (g) => {
    if (!g.messages) g.messages = [];
    g.messages.push(msg);
    if (g.messages.length > 2000) g.messages = g.messages.slice(-2000);
    return g;
  });
  const other = toRecipient ? findParticipant(updated, me.assignedTo) : santa;
  if (other) {
    const who = toRecipient ? "Dein geheimer Wichtel" : me.name;
    notifyParticipant(updated, other, "Neue anonyme Nachricht", `Hallo ${other.name}!\n\n${who} hat dir geschrieben:\n„${text}“\n\nAntworten kannst du direkt in deinem Wichtel-Bereich.`, `<p>Hallo ${escapeHtml(other.name)}!</p><p><strong>${escapeHtml(who)}</strong> hat dir geschrieben:</p><blockquote style="border-left:3px solid #34d399;padding-left:12px;color:#cbd5e1">${escapeHtml(text)}</blockquote><p>Antworten kannst du direkt in deinem Wichtel-Bereich.</p>`, `${who}: ${text.slice(0, 120)}`).catch(() => {});
  }
  res.status(201).json(participantView(updated, findParticipant(updated, me.id)));
});

// Photos: images only, stored next to the calendar uploads.
const photoStorage = multer.diskStorage({
  destination: config.paths.uploadsDir,
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname || "").toLowerCase().match(/^\.(png|jpe?g|gif|webp)$/) || [".jpg"])[0];
    cb(null, `wichtel-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});
const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)),
});

router.post("/p/:token/photos", photoUpload.single("photo"), async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  if (!req.file) return res.status(400).json({ error: "Bitte ein Bild (PNG, JPG, GIF, WebP) auswählen." });
  if ((found.group.photos || []).length >= 200) return res.status(400).json({ error: "Die Foto-Wand ist voll." });
  const photo = { id: crypto.randomBytes(6).toString("hex"), url: `/uploads/${req.file.filename}`, by: found.me.id, caption: cleanText(req.body?.caption, 140), at: new Date().toISOString() };
  const updated = await db.updateWichtelGroup(found.group.id, (g) => {
    if (!g.photos) g.photos = [];
    g.photos.push(photo);
    return g;
  });
  res.status(201).json(participantView(updated, findParticipant(updated, found.me.id)));
});

router.delete("/p/:token/photos/:photoId", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const photo = (found.group.photos || []).find((ph) => ph.id === req.params.photoId);
  if (!photo || photo.by !== found.me.id) return res.status(404).json({ error: "Foto nicht gefunden." });
  removePhotoFiles({ photos: [photo] });
  const updated = await db.updateWichtelGroup(found.group.id, (g) => {
    g.photos = (g.photos || []).filter((ph) => ph.id !== photo.id);
    return g;
  });
  res.json(participantView(updated, findParticipant(updated, found.me.id)));
});

router.get("/p/:token/event.ics", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const { group, me } = found;
  if (!group.eventDate) return res.status(404).json({ error: "Es ist noch kein Termin festgelegt." });
  const target = group.status !== "draft" ? findParticipant(group, me.assignedTo) : null;
  const description = [
    group.motto ? `Motto: ${group.motto}` : null,
    group.budget ? `Budget: ${group.budget}` : null,
    target ? `Du beschenkst: ${target.name}` : null,
    `Wichtel-Bereich: ${participantLink(me)}`,
  ].filter(Boolean).join("\n");
  const ics = buildIcs({ uid: `wichteln-${group.id}-${me.id}@adventskalender`, title: `Wichteln: ${group.title}`, description, date: group.eventDate, time: group.eventTime, location: group.eventPlace, url: participantLink(me) });
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="wichteln-${group.id.slice(0, 8)}.ics"`);
  res.send(ics);
});

// ── Push registration (native app via Expo token, browsers via Web Push) ────

router.get("/vapidPublicKey", (req, res) => {
  const { getVapidPublicKey } = require("../push");
  res.json({ publicKey: getVapidPublicKey() });
});

router.post("/p/:token/push", async (req, res) => {
  const found = await loadByParticipantToken(req, res);
  if (!found) return;
  const { isExpoPushToken } = require("../push");
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
    p.subscriptions = (p.subscriptions || []).filter((s) => s.endpoint !== sub.endpoint).concat([{ ...sub, addedAt: new Date().toISOString() }]).slice(-10);
    return g;
  });
  res.status(201).json({ ok: true });
});

// ── Link preview for wish lists ─────────────────────────────────────────────

function safeHttpUrl(v) {
  try {
    const u = new URL(String(v || "").trim());
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.href.slice(0, 1000);
  } catch (_) {
    return null;
  }
}

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:");
}

async function fetchLinkPreview(url) {
  const u = new URL(url);
  if (/^(localhost|.*\.local)$/i.test(u.hostname)) throw new Error("blocked");
  const { address } = await dns.lookup(u.hostname);
  if (isPrivateAddress(address)) throw new Error("blocked");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(u.href, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; WichtelBot/1.0; +https://adventskalender)", Accept: "text/html,*/*;q=0.5", "Accept-Language": "de,en;q=0.7" } });
    const ct = r.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/.test(ct)) return { title: u.hostname, image: "", price: "" };
    const reader = r.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < 400 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    ctrl.abort();
    const html = Buffer.concat(chunks).toString("utf8");
    const meta = (names) => {
      for (const n of names) {
        const re = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${n}["']`, "i");
        const m = html.match(re);
        if (m) return decodeEntities(m[1] || m[2]);
      }
      return "";
    };
    let title = meta(["og:title", "twitter:title"]) || decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "") || u.hostname;
    let image = meta(["og:image", "og:image:url", "twitter:image"]);
    if (image && !/^https?:/i.test(image)) image = new URL(image, u.href).href;
    const amount = meta(["product:price:amount", "og:price:amount"]);
    const currency = meta(["product:price:currency", "og:price:currency"]);
    return { title: title.trim().slice(0, 140), image: safeHttpUrl(image) || "", price: amount ? `${amount}${currency ? ` ${currency}` : ""}` : "" };
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(s) {
  return String(s || "").replace(/&(amp|lt|gt|quot|#39|#x27|apos|nbsp);/g, (m, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", apos: "'", nbsp: " " })[k]).replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)));
}

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

function removePhotoFiles(group) {
  for (const ph of group.photos || []) {
    const name = path.basename(ph.url || "");
    if (!name.startsWith("wichtel-")) continue;
    fs.promises.unlink(path.join(config.paths.uploadsDir, name)).catch(() => {});
  }
}

module.exports = router;
module.exports.removePhotoFiles = removePhotoFiles;
module.exports.eventLine = eventLine;
module.exports.notifyParticipant = notifyParticipant;
