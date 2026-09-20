/* Helpers and view builders of the Wichteltür (Christmas elf planner). */
const path = require("path");
const fs = require("fs");
const config = require("../../config");
const db = require("../../db");
const cfg = require("../../wichteltuer/config");
const { IDEAS, byId: ideaById, fillPlaceholders } = require("../../wichteltuer/ideas");
const { generateId, generateToken } = require("../../utils/token");
const { cleanText, isEmail } = require("../../utils/wichtel");

const shareLink = (plan) => `${config.baseUrl}/e/${plan.shareToken}`;
const kidLink = (plan) => `${config.baseUrl}/k/${plan.kidToken}`;

function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
const pad = (n) => String(n).padStart(2, "0");
const isoFor = (year, day) => `${year}-${pad(cfg.month)}-${pad(day)}`;
function seasonDates(year) {
  const out = [];
  for (let d = cfg.firstDay; d <= cfg.lastDay; d++) out.push(isoFor(year, d));
  return out;
}
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
function weekdayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}
const isWeekend = (iso) => [0, 6].includes(weekdayOf(iso));
const dayNumber = (iso) => Number(iso.slice(8, 10));
function seasonYear(now = new Date()) {
  // Before December we plan the coming season; from December on, this one.
  const t = todayIso(now);
  return Number(t.slice(0, 4));
}

function newPlan(user, b = {}) {
  const year = Number(b.year) >= 2024 && Number(b.year) <= 2100 ? Number(b.year) : seasonYear();
  const plan = {
    id: generateId(),
    ownerId: user.id,
    ownerEmail: user.email,
    shareToken: generateToken(cfg.shareTokenBytes),
    kidToken: generateToken(cfg.kidTokenBytes),
    title: cleanText(b.title, cfg.titleMax) || `Wichteltür ${year}`,
    year,
    elf: { name: cleanText(b.elfName, cfg.nameMax) || "Wichtel", doorPlace: "", character: "frech" },
    children: [],
    parents: [],
    days: {},
    shopping: { checked: {}, custom: [] },
    post: [],
    notify: { enabled: true, time: cfg.reminderTimeDefault, emails: [], subscriptions: [] },
    reminderSentFor: [],
    createdAt: new Date().toISOString(),
  };
  if (Array.isArray(b.children)) plan.children = b.children.slice(0, cfg.maxChildren).map(cleanChild).filter((c) => c.name);
  if (Array.isArray(b.parents)) plan.parents = b.parents.slice(0, cfg.maxParents).map(cleanParent).filter((p) => p.name);
  if (!plan.parents.length && user.username) plan.parents.push({ id: generateId(), name: cleanText(user.username, cfg.nameMax) });
  return plan;
}

function cleanChild(c) {
  const age = Number(c?.age);
  return { id: typeof c?.id === "string" && c.id ? c.id : generateId(), name: cleanText(c?.name, cfg.nameMax), age: Number.isFinite(age) && age >= 0 && age <= 18 ? age : null };
}
function cleanParent(p) {
  return { id: typeof p?.id === "string" && p.id ? p.id : generateId(), name: cleanText(p?.name, cfg.nameMax) };
}
const materialKey = (m) => String(m || "").trim().toLowerCase();

function cleanMaterials(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const m of list) {
    const t = cleanText(m, cfg.materialMax);
    if (!t || seen.has(materialKey(t))) continue;
    seen.add(materialKey(t));
    out.push(t);
  }
  return out.slice(0, 20);
}

/** Builds/updates a day entry from a request body. Idea-based entries copy the
 * idea's text so parents can edit it without losing the original. */
function applyDay(plan, date, b, existing) {
  const e = existing || { createdAt: new Date().toISOString() };
  if (b.ideaId !== undefined) {
    const idea = b.ideaId ? ideaById[b.ideaId] : null;
    e.ideaId = idea ? idea.id : null;
    if (idea) {
      e.title = idea.title;
      e.category = idea.category;
      e.text = idea.text;
      e.materials = [...idea.materials];
      e.minutes = idea.minutes;
      e.prepDayBefore = idea.prepDayBefore;
      e.letter = idea.letter ? fillPlaceholders(idea.letter, letterCtx(plan, date)) : e.letter || "";
    }
  }
  if (b.title !== undefined) e.title = cleanText(b.title, cfg.dayTitleMax);
  if (b.category !== undefined) e.category = cfg.categories[b.category] ? b.category : "streich";
  if (b.text !== undefined) e.text = cleanText(b.text, cfg.dayTextMax);
  if (b.materials !== undefined) e.materials = cleanMaterials(b.materials);
  if (b.minutes !== undefined) e.minutes = Math.max(0, Math.min(600, Number(b.minutes) || 0));
  if (b.prepDayBefore !== undefined) e.prepDayBefore = Boolean(b.prepDayBefore);
  if (b.assignee !== undefined) e.assignee = plan.parents.some((p) => p.id === b.assignee) ? b.assignee : null;
  if (b.note !== undefined) e.note = cleanText(b.note, cfg.noteMax);
  if (b.letter !== undefined) e.letter = cleanText(b.letter, cfg.letterMax);
  if (b.letterVisibleToKids !== undefined) e.letterVisibleToKids = Boolean(b.letterVisibleToKids);
  if (b.photoVisibleToKids !== undefined) e.photoVisibleToKids = Boolean(b.photoVisibleToKids);
  if (b.reaction !== undefined) e.reaction = cleanText(b.reaction, cfg.noteMax);
  if (b.done !== undefined) {
    e.done = Boolean(b.done);
    e.doneAt = e.done ? new Date().toISOString() : null;
  }
  if (!e.title) e.title = "Überraschung";
  if (!e.category) e.category = "streich";
  if (!e.materials) e.materials = [];
  return e;
}

function letterCtx(plan, date, extra = {}) {
  return { elfName: plan.elf?.name, children: plan.children, day: date ? `${dayNumber(date)}. Dezember` : "", ...extra };
}

/** Fills empty days with ideas that fit the children, the weekday and the
 * variety a month needs. Fixed days (arrival, Nikolaus, farewell) go first. */
function autoplan(plan, { overwrite = false } = {}) {
  const dates = seasonDates(plan.year);
  const ages = plan.children.map((c) => c.age).filter((a) => a !== null && a !== undefined);
  const minAge = ages.length ? Math.min(...ages) : null;
  const maxAge = ages.length ? Math.max(...ages) : null;
  const fits = (i) => (minAge === null || i.ageMax >= minAge) && (maxAge === null || i.ageMin <= maxAge);
  const used = new Set(Object.values(plan.days).map((d) => d.ideaId).filter(Boolean));
  const days = overwrite ? {} : { ...plan.days };
  if (overwrite) used.clear();
  const setDay = (date, idea) => {
    days[date] = applyDay(plan, date, { ideaId: idea.id }, null);
    used.add(idea.id);
  };
  // 1. Fixed days.
  for (const i of IDEAS) {
    if (!i.fixedDay) continue;
    const date = isoFor(plan.year, i.fixedDay);
    if (!days[date] && !used.has(i.id)) setDay(date, i);
  }
  // 2. Everything else: rotate categories, heavy stuff on weekends, one rest day a week.
  const rotation = ["streich", "aufgabe", "brief", "streich", "geschenk", "basteln", "streich", "aufgabe", "brief", "geschenk"];
  let r = 0;
  let weekStart = null;
  let restThisWeek = 0;
  const pool = IDEAS.filter((i) => !i.fixedDay && fits(i));
  const shuffled = (list) => [...list].sort(() => Math.random() - 0.5);
  for (const date of dates) {
    const wd = weekdayOf(date);
    if (wd === 1 || weekStart === null) { weekStart = date; restThisWeek = 0; }
    if (days[date]) continue;
    const weekend = isWeekend(date);
    let pick = null;
    // A quiet day mid-week keeps the month survivable for the parents.
    if (!weekend && restThisWeek < cfg.restDaysPerWeek && [2, 3].includes(wd) && dayNumber(date) > 2 && dayNumber(date) < 23) {
      pick = shuffled(pool.filter((i) => i.category === "ruhe" && !used.has(i.id)))[0] || null;
      if (pick) restThisWeek++;
    }
    if (!pick) {
      for (let tries = 0; tries < rotation.length && !pick; tries++) {
        const cat = rotation[(r + tries) % rotation.length];
        const candidates = pool.filter((i) => i.category === cat && !used.has(i.id) && (weekend ? true : !i.weekend && i.minutes <= 20));
        pick = shuffled(candidates)[0] || null;
        if (pick) r = r + tries + 1;
      }
    }
    if (!pick) pick = shuffled(pool.filter((i) => !used.has(i.id) && i.category !== "ruhe"))[0] || null;
    if (!pick) pick = shuffled(pool.filter((i) => i.category === "streich"))[0] || null;
    if (pick) setDay(date, pick);
  }
  plan.days = days;
  return plan;
}

function shoppingList(plan) {
  const items = {};
  const dates = seasonDates(plan.year);
  for (const date of dates) {
    const e = plan.days[date];
    if (!e || e.done) continue;
    for (const m of e.materials || []) {
      const key = materialKey(m);
      if (!items[key]) items[key] = { key, text: m, dates: [], week: Math.ceil(dayNumber(date) / 7) };
      items[key].dates.push(date);
      items[key].week = Math.min(items[key].week, Math.ceil(dayNumber(date) / 7));
    }
  }
  const checked = plan.shopping?.checked || {};
  const list = Object.values(items).map((i) => ({ ...i, checked: Boolean(checked[i.key]), custom: false }));
  for (const c of plan.shopping?.custom || []) list.push({ key: `custom:${c.id}`, id: c.id, text: c.text, dates: [], week: 0, checked: Boolean(c.checked), custom: true });
  list.sort((a, b) => a.week - b.week || a.text.localeCompare(b.text, "de"));
  return list;
}

function dayView(plan, date, e) {
  const wd = weekdayOf(date);
  return {
    date,
    day: dayNumber(date),
    weekday: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][wd],
    weekend: isWeekend(date),
    entry: e ? {
      ideaId: e.ideaId || null,
      title: e.title,
      category: e.category,
      categoryLabel: cfg.categories[e.category] || e.category,
      text: e.text || "",
      materials: e.materials || [],
      minutes: e.minutes || 0,
      prepDayBefore: Boolean(e.prepDayBefore),
      assignee: e.assignee || null,
      assigneeName: plan.parents.find((p) => p.id === e.assignee)?.name || null,
      note: e.note || "",
      letter: e.letter || "",
      letterVisibleToKids: Boolean(e.letterVisibleToKids),
      photo: e.photo || null,
      photoVisibleToKids: Boolean(e.photoVisibleToKids),
      reaction: e.reaction || "",
      done: Boolean(e.done),
      doneAt: e.doneAt || null,
    } : null,
  };
}

/** Which parts of the planner need PRO. The kids' page is never gated. */
function proFeatures(pro) {
  return { ideas: pro, letters: pro, shopping: pro };
}

function planView(plan, { owner = false, now = new Date(), pro = Boolean(plan.isPro) } = {}) {
  const today = todayIso(now);
  const features = proFeatures(pro);
  const dates = seasonDates(plan.year);
  const days = dates.map((d) => dayView(plan, d, plan.days[d]));
  const tonight = days.find((d) => d.date === addDays(today, 1)) || null;
  const prepTomorrow = days.filter((d) => d.date === addDays(today, 2) && d.entry?.prepDayBefore);
  const planned = days.filter((d) => d.entry).length;
  const done = days.filter((d) => d.entry?.done).length;
  return {
    id: plan.id,
    title: plan.title,
    year: plan.year,
    owner,
    isPro: pro,
    features,
    elf: { name: plan.elf?.name || "Wichtel", doorPlace: plan.elf?.doorPlace || "", character: plan.elf?.character || "frech" },
    children: plan.children,
    parents: plan.parents,
    shareLink: shareLink(plan),
    kidLink: kidLink(plan),
    notify: { enabled: plan.notify?.enabled !== false, time: plan.notify?.time || cfg.reminderTimeDefault, emails: plan.notify?.emails || [], pushDevices: (plan.notify?.subscriptions || []).length },
    today,
    season: { start: dates[0], end: dates[dates.length - 1], active: today >= addDays(dates[0], -1) && today <= dates[dates.length - 1] },
    stats: { planned, done, open: dates.length - planned },
    tonight,
    prepTomorrow,
    days,
    shopping: features.shopping ? shoppingList(plan) : [],
    post: (plan.post || []).map(postView).sort((a, b) => b.at.localeCompare(a.at)),
    unreadPost: (plan.post || []).filter((l) => l.from === "kid" && !l.read).length,
    categories: cfg.categories,
    createdAt: plan.createdAt,
  };
}

function postView(l) {
  return { id: l.id, from: l.from, childId: l.childId || null, childName: l.childName || "", text: l.text, photo: l.photo || null, at: l.at, read: Boolean(l.read) };
}

function kidView(plan, now = new Date()) {
  const today = todayIso(now);
  const dates = seasonDates(plan.year);
  const christmas = isoFor(plan.year, 24);
  const daysLeft = Math.max(0, Math.round((Date.parse(christmas) - Date.parse(today)) / 86400000));
  const letters = [];
  for (const date of dates) {
    const e = plan.days[date];
    if (!e || date > today) continue;
    if (e.letter && e.letterVisibleToKids) letters.push({ id: `day-${date}`, date, at: `${date}T06:00:00.000Z`, from: "elf", text: e.letter, photo: e.photoVisibleToKids ? e.photo || null : null });
    else if (e.photo && e.photoVisibleToKids) letters.push({ id: `photo-${date}`, date, at: `${date}T06:00:00.000Z`, from: "elf", text: "", photo: e.photo });
  }
  for (const l of plan.post || []) {
    if (l.from === "elf") letters.push({ id: l.id, date: l.at.slice(0, 10), at: l.at, from: "elf", text: l.text, photo: l.photo || null, childId: l.childId || null });
    else letters.push({ id: l.id, date: l.at.slice(0, 10), at: l.at, from: "kid", text: l.text, childId: l.childId || null, childName: l.childName || "" });
  }
  letters.sort((a, b) => b.at.localeCompare(a.at));
  return {
    elf: { name: plan.elf?.name || "Wichtel", doorPlace: plan.elf?.doorPlace || "", character: plan.elf?.character || "frech" },
    children: plan.children.map((c) => ({ id: c.id, name: c.name })),
    today,
    daysLeft,
    arrived: today >= dates[0],
    gone: today > dates[dates.length - 1],
    dayNumber: today >= dates[0] && today <= dates[dates.length - 1] ? dayNumber(today) : null,
    letters: letters.slice(0, 60),
  };
}

async function loadByShareToken(req, res) {
  const token = String(req.params.token || "");
  if (!/^[\w-]{8,64}$/.test(token)) {
    res.status(404).json({ error: "Link ungültig." });
    return null;
  }
  const plan = await db.getElfPlanByShareToken(token);
  if (!plan) {
    res.status(404).json({ error: "Diese Wichteltür gibt es nicht (mehr)." });
    return null;
  }
  return plan;
}

async function loadByKidToken(req, res) {
  const token = String(req.params.token || "");
  if (!/^[\w-]{8,64}$/.test(token)) {
    res.status(404).json({ error: "Link ungültig." });
    return null;
  }
  const plan = await db.getElfPlanByKidToken(token);
  if (!plan) {
    res.status(404).json({ error: "Diese Wichteltür gibt es nicht (mehr)." });
    return null;
  }
  return plan;
}

function isOwner(plan, user) {
  return Boolean(user && (plan.ownerId === user.id || (plan.ownerEmail && plan.ownerEmail === user.email)));
}

function removePhotoFiles(plan) {
  const names = [];
  for (const e of Object.values(plan.days || {})) if (e.photo) names.push(e.photo);
  for (const l of plan.post || []) if (l.photo) names.push(l.photo);
  for (const url of names) {
    const name = path.basename(url || "");
    if (!name.startsWith("elf-")) continue;
    fs.promises.unlink(path.join(config.paths.uploadsDir, name)).catch(() => {});
  }
}

const cleanEmails = (list) => (Array.isArray(list) ? [...new Set(list.map((e) => String(e || "").trim().toLowerCase()).filter(isEmail))].slice(0, cfg.maxEmails) : []);

module.exports = {
  cfg, shareLink, kidLink, todayIso, seasonDates, isoFor, addDays, weekdayOf, isWeekend, dayNumber, seasonYear, newPlan, cleanChild, cleanParent,
  cleanMaterials, materialKey, applyDay, letterCtx, autoplan, shoppingList, dayView, planView, proFeatures, kidView, loadByShareToken, loadByKidToken, isOwner,
  removePhotoFiles, cleanEmails,
};
