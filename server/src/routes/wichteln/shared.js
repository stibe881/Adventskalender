/* Helpers and view builders shared by the Wichteln routers. */
const path = require("path");
const fs = require("fs");
const config = require("../../config");
const db = require("../../db");
const cfg = require("../../wichteln/config");
const { generateId } = require("../../utils/token");
const { isEmail, cleanText, shortToken } = require("../../utils/wichtel");

const participantLink = (p) => `${config.baseUrl}/w/${p.token}`;
const inviteLink = (group) => `${config.baseUrl}/w/join/${group.inviteToken}`;

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function eventLine(group) {
  if (!group.eventDate) return "";
  return `${formatDate(group.eventDate)}${group.eventTime ? ` um ${group.eventTime} Uhr` : ""}${group.eventPlace ? `, ${group.eventPlace}` : ""}`;
}

function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function eventPassed(group, now = new Date()) {
  return Boolean(group.eventDate) && group.eventDate < todayIso(now);
}

function computeDeleteAt(group) {
  const days = cfg.retentionOptions.includes(group.retentionDays) ? group.retentionDays : cfg.retentionDefault;
  const base = group.eventDate ? new Date(`${group.eventDate}T23:59:59`) : new Date(group.createdAt || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function newParticipant({ name, email, isOrganizer = false, pending = false }) {
  return {
    id: generateId(),
    token: shortToken(),
    name: cleanText(name, cfg.nameMax),
    email: isEmail(email) ? String(email).trim().toLowerCase() : "",
    isOrganizer,
    pending,
    createdAt: new Date().toISOString(),
    joinedAt: null,
    hints: { allergies: "", favorites: "", hobbies: "", notes: "" },
    wishlist: [],
    giftStatus: { method: "personal", steps: [], updatedAt: null },
    notify: { email: true, push: true },
    lastRead: {},
    subscriptions: [],
    assignedTo: null,
  };
}

const findParticipant = (group, id) => (group.participants || []).find((p) => p.id === id) || null;
const giverOf = (group, receiverId) => (group.participants || []).find((p) => p.assignedTo === receiverId) || null;
const activeParticipants = (group) => (group.participants || []).filter((p) => !p.pending);
const isDrawn = (group) => group.status === "drawn" || group.status === "revealed";

function giftProgress(p) {
  const method = p.giftStatus?.method === "post" ? "post" : "personal";
  const all = cfg.giftSteps[method];
  const done = (p.giftStatus?.steps || []).filter((s) => all.includes(s));
  return { method, done: done.length, total: all.length, steps: all.map((s) => ({ key: s, label: cfg.giftStepLabels[s], done: done.includes(s) })) };
}

// A channel is keyed by the giver's id and connects the giver with their recipient.
function channelMessages(group, giverId, viewer) {
  const other = giverId === viewer.id ? findParticipant(group, viewer.assignedTo) : findParticipant(group, giverId);
  const otherReadKey = giverId === viewer.id ? "santa" : "recipient";
  const otherRead = other?.lastRead?.[otherReadKey] || "";
  return (group.messages || [])
    .filter((m) => m.channel === giverId)
    .map((m) => ({
      id: m.id,
      at: m.at,
      text: m.text,
      mine: m.from === viewer.id,
      read: m.from === viewer.id ? m.at <= otherRead : true,
      // The giver stays anonymous towards the receiver.
      from: m.from === giverId ? (viewer.id === giverId ? "Du" : "Dein geheimer Wichtel") : (findParticipant(group, m.from)?.name || "?"),
    }));
}

function unreadCount(group, viewer, channelId, readKey) {
  const since = viewer.lastRead?.[readKey] || "";
  return (group.messages || []).filter((m) => m.channel === channelId && m.from !== viewer.id && m.at > since).length;
}

// Wish list, hints and the anonymous chat are PRO features of a round.
function proFeatures(group, pro) {
  return { wishlist: pro, hints: pro, chat: pro && group.chatEnabled !== false };
}

function wishView(w, withImage = true) {
  return { id: w.id, url: w.url, title: w.title, image: withImage ? w.image : undefined, price: w.price, note: w.note };
}

function thanksView(group) {
  return (group.thanks || []).map((t) => ({ id: t.id, text: t.text, from: findParticipant(group, t.from)?.name || "?", at: t.at }));
}

function photoView(group, ph, me) {
  return { id: ph.id, url: ph.url, caption: ph.caption, by: findParticipant(group, ph.by)?.name || "", mine: me ? ph.by === me.id : false, at: ph.at };
}

// What the organizer sees. Assignments stay hidden until the reveal so the
// organizer can take part without knowing the draw.
const { proPriceLabel } = require("../../utils/pro");

function organizerView(group, pro = Boolean(group.isPro)) {
  const revealed = group.status === "revealed";
  return {
    id: group.id,
    isPro: pro,
    proPrice: proPriceLabel(),
    features: proFeatures(group, pro),
    title: group.title,
    organizerName: group.organizerName,
    organizerParticipates: Boolean(group.organizerParticipates),
    inviteMode: group.inviteMode,
    waitingRoom: group.waitingRoom !== false,
    wishlistsShared: Boolean(group.wishlistsShared),
    budget: group.budget || "",
    motto: group.motto || "",
    eventDate: group.eventDate || "",
    eventTime: group.eventTime || "",
    eventPlace: group.eventPlace || "",
    description: group.description || "",
    chatEnabled: group.chatEnabled !== false,
    retentionDays: group.retentionDays || cfg.retentionDefault,
    deleteAt: group.deleteAt || null,
    status: group.status || "draft",
    createdAt: group.createdAt,
    drawnAt: group.drawnAt || null,
    revealedAt: group.revealedAt || null,
    eventPassed: eventPassed(group),
    inviteLink: inviteLink(group),
    maxParticipants: cfg.maxParticipants,
    minParticipants: cfg.minParticipantsForDraw,
    exclusions: group.exclusions || [],
    photos: (group.photos || []).map((ph) => photoView(group, ph, null)),
    thanks: thanksView(group),
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
      wishlist: (p.wishlist || []).map((w) => wishView(w, false)),
      hints: p.hints || {},
      giftProgress: giftProgress(p),
      pushDevices: (p.subscriptions || []).length,
      assignedTo: revealed ? p.assignedTo : null,
      assignedToName: revealed ? findParticipant(group, p.assignedTo)?.name || null : null,
    })),
  };
}

function participantView(group, me, pro = Boolean(group.isPro)) {
  const drawn = isDrawn(group);
  const target = drawn ? findParticipant(group, me.assignedTo) : null;
  const santa = drawn ? giverOf(group, me.id) : null;
  const features = proFeatures(group, pro);
  const chat = features.chat;
  const passed = eventPassed(group);
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
      chatEnabled: group.chatEnabled !== false,
      isPro: pro,
      proPrice: proPriceLabel(),
      wishlistsShared: Boolean(group.wishlistsShared) && pro,
      deleteAt: group.deleteAt || null,
      participantCount: activeParticipants(group).length,
      eventPassed: passed,
    },
    features,
    me: {
      id: me.id,
      name: me.name,
      email: me.email,
      pending: Boolean(me.pending),
      isOrganizer: Boolean(me.isOrganizer),
      hints: pro ? me.hints || {} : {},
      wishlist: pro ? me.wishlist || [] : [],
      giftStatus: giftProgress(me),
      notify: me.notify || { email: true, push: true },
      pushDevices: (me.subscriptions || []).length,
      icsUrl: group.eventDate ? `/api/wichteln/p/${me.token}/event.ics` : null,
    },
    recipient: target ? {
      id: target.id,
      name: target.name,
      hints: pro ? target.hints || {} : {},
      wishlist: pro ? (target.wishlist || []).map((w) => wishView(w)) : [],
      messages: chat ? channelMessages(group, me.id, me) : [],
      unread: chat ? unreadCount(group, me, me.id, "recipient") : 0,
    } : null,
    santa: santa ? {
      progress: giftProgress(santa),
      messages: chat ? channelMessages(group, santa.id, me) : [],
      unread: chat ? unreadCount(group, me, santa.id, "santa") : 0,
    } : null,
    participants: activeParticipants(group).map((p) => ({ id: p.id, name: p.name, isOrganizer: Boolean(p.isOrganizer), joined: Boolean(p.joinedAt) })),
    // Family rounds: everybody may see everybody's wishes.
    wishlists: group.wishlistsShared && pro
      ? activeParticipants(group).filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name, wishlist: (p.wishlist || []).map((w) => wishView(w)) }))
      : null,
    photos: (group.photos || []).map((ph) => photoView(group, ph, me)),
    thanks: thanksView(group),
    // The reveal is for the organizer only.
    reveal: group.status === "revealed" && me.isOrganizer
      ? activeParticipants(group).map((p) => ({ giver: p.name, receiver: findParticipant(group, p.assignedTo)?.name || "?" }))
      : null,
  };
}

async function loadOwnedGroup(req, res) {
  const group = await db.getWichtelGroupById(req.params.id);
  const user = req.user;
  const owned = Boolean(group && user && (group.ownerId === user.id || (group.ownerEmail && group.ownerEmail === user.email)));
  if (!owned) {
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
  if (b.title !== undefined) group.title = cleanText(b.title, cfg.titleMax) || group.title;
  if (b.organizerName !== undefined) group.organizerName = cleanText(b.organizerName, cfg.nameMax);
  if (b.inviteMode !== undefined && ["email", "link", "names"].includes(b.inviteMode)) group.inviteMode = b.inviteMode;
  if (b.waitingRoom !== undefined) group.waitingRoom = Boolean(b.waitingRoom);
  if (b.wishlistsShared !== undefined) group.wishlistsShared = Boolean(b.wishlistsShared);
  if (b.budget !== undefined) group.budget = cleanText(b.budget, cfg.budgetMax);
  if (b.motto !== undefined) group.motto = cleanText(b.motto, cfg.mottoMax);
  if (b.eventDate !== undefined) group.eventDate = /^\d{4}-\d{2}-\d{2}$/.test(b.eventDate) ? b.eventDate : "";
  if (b.eventTime !== undefined) group.eventTime = /^\d{2}:\d{2}$/.test(b.eventTime) ? b.eventTime : "";
  if (b.eventPlace !== undefined) group.eventPlace = cleanText(b.eventPlace, cfg.placeMax);
  if (b.description !== undefined) group.description = cleanText(b.description, cfg.descriptionMax);
  if (b.chatEnabled !== undefined) group.chatEnabled = Boolean(b.chatEnabled);
  if (b.retentionDays !== undefined && cfg.retentionOptions.includes(Number(b.retentionDays))) group.retentionDays = Number(b.retentionDays);
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

function safeHttpUrl(v) {
  try {
    const u = new URL(String(v || "").trim());
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.href.slice(0, 1000);
  } catch (_) {
    return null;
  }
}

function removePhotoFiles(group) {
  for (const ph of group.photos || []) {
    const name = path.basename(ph.url || "");
    if (!name.startsWith("wichtel-")) continue;
    fs.promises.unlink(path.join(config.paths.uploadsDir, name)).catch(() => {});
  }
}

module.exports = {
  cfg, proFeatures, participantLink, inviteLink, formatDate, eventLine, todayIso, eventPassed, computeDeleteAt, newParticipant,
  findParticipant, giverOf, activeParticipants, isDrawn, giftProgress, organizerView, participantView,
  loadOwnedGroup, loadByParticipantToken, applySettings, syncOrganizerParticipant, safeHttpUrl, removePhotoFiles,
};
