/* Helpers and view builders of the Wichteltür (Christmas elf planner). */
const path = require("path");
const fs = require("fs");
const config = require("../../config");
const db = require("../../db");
const cfg = require("../../wichteltuer/config");
const { IDEAS, byId: ideaById, fillPlaceholders } = require("../../wichteltuer/ideas");
const SETS = require("../../wichteltuer/sets");
const { convertContent, convertText } = require("../../utils/swiss");
const { proPriceLabel } = require("../../utils/pro");
const { generateId, generateToken } = require("../../utils/token");
const { cleanText, isEmail } = require("../../utils/wichtel");

const shareLink = (plan) => `${config.baseUrl}/e/${plan.shareToken}`;
const kidLink = (plan) => `${config.baseUrl}/k/${plan.kidToken}`;
const viewLink = (plan) => (plan.viewToken ? `${config.baseUrl}/v/${plan.viewToken}` : null);
const hourNow = (now = new Date()) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, hour: "2-digit", hour12: false }).format(now));

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
    swissMode: Boolean(b.swissMode),
    children: [],
    parents: [],
    days: {},
    shopping: { checked: {}, custom: [], have: {} },
    post: [],
    customIdeas: [],
    assignRule: { mode: "manual", weekdays: {} },
    budget: null,
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
    const idea = b.ideaId ? findIdea(plan, b.ideaId) : null;
    e.ideaId = idea ? idea.id : null;
    if (idea) {
      e.title = idea.title;
      e.category = idea.category;
      e.text = idea.text;
      e.materials = [...idea.materials];
      e.minutes = idea.minutes;
      e.prepDayBefore = idea.prepDayBefore;
      e.letter = idea.letter ? fillPlaceholders(idea.letter, letterCtx(plan, date)) : e.letter || "";
      if (idea.steps?.length) e.steps = cleanSteps(idea.steps);
      // Swiss households: the Christkind brings the presents, the Samichlaus comes on the 6th.
      if (plan.swissMode) for (const k of ["title", "text", "letter"]) e[k] = convertText(e[k], true);
      if (plan.swissMode) e.materials = e.materials.map((m) => convertText(m, true));
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
  if (b.kidHint !== undefined) e.kidHint = cleanText(b.kidHint, cfg.kidHintMax);
  if (b.price !== undefined) { const n = Number(String(b.price).replace(",", ".")); e.price = Number.isFinite(n) && n > 0 ? Math.round(Math.min(n, 9999) * 100) / 100 : 0; }
  if (b.steps !== undefined) e.steps = cleanSteps(b.steps, e.steps);
  if (b.done !== undefined) {
    e.done = Boolean(b.done);
    e.doneAt = e.done ? new Date().toISOString() : null;
  }
  if (!e.title) e.title = "Überraschung";
  if (!e.category) e.category = "streich";
  if (!e.materials) e.materials = [];
  return e;
}

/** Library ideas plus the family's own ones. */
function findIdea(plan, id) {
  return ideaById[id] || (plan.customIdeas || []).find((i) => i.id === id) || null;
}
function allIdeas(plan) {
  return [...(plan.customIdeas || []), ...IDEAS];
}
function cleanIdea(b, existingId) {
  const materials = cleanMaterials(Array.isArray(b.materials) ? b.materials : String(b.materials || "").split(","));
  const minutes = Math.max(0, Math.min(600, Number(b.minutes) || 10));
  return {
    id: existingId || `own-${generateId()}`,
    custom: true,
    title: cleanText(b.title, cfg.dayTitleMax) || "Eigene Idee",
    category: cfg.categories[b.category] ? b.category : "streich",
    minutes,
    effort: minutes >= 30 ? 3 : minutes >= 15 ? 2 : 1,
    materials,
    prepDayBefore: Boolean(b.prepDayBefore),
    ageMin: 2,
    ageMax: 12,
    weekend: minutes >= 30,
    fixedDay: null,
    text: cleanText(b.text, cfg.dayTextMax),
    letter: cleanText(b.letter, cfg.letterMax) || null,
    steps: cleanSteps(b.steps).map((x) => x.text),
  };
}

/** Preparation checklist of a day: ["Teig", {text, done}] → [{id, text, done}]. */
function cleanSteps(list, existing = []) {
  if (!Array.isArray(list)) return existing || [];
  const out = [];
  for (const raw of list) {
    const text = cleanText(typeof raw === "string" ? raw : raw?.text, cfg.stepMax);
    if (!text) continue;
    const old = (existing || []).find((x) => x.text === text || (raw?.id && x.id === raw.id));
    out.push({ id: old?.id || generateId(), text, done: raw?.done !== undefined ? Boolean(raw.done) : Boolean(old?.done) });
    if (out.length >= cfg.maxSteps) break;
  }
  return out;
}

/** Who is on duty: alternate by day, or fixed weekdays per parent. */
function applyAssignments(plan, { onlyOpen = true } = {}) {
  const rule = plan.assignRule || { mode: "manual" };
  if (rule.mode === "manual" || !plan.parents.length) return plan;
  const dates = seasonDates(plan.year);
  let i = 0;
  for (const date of dates) {
    const e = plan.days[date];
    if (!e) continue;
    if (onlyOpen && e.assignee && plan.parents.some((p) => p.id === e.assignee)) { i++; continue; }
    let who = null;
    if (rule.mode === "alternate") who = plan.parents[i % plan.parents.length]?.id || null;
    else if (rule.mode === "weekdays") who = plan.parents.find((p) => (rule.weekdays?.[p.id] || []).includes(weekdayOf(date)))?.id || null;
    e.assignee = who;
    i++;
  }
  return plan;
}
function cleanAssignRule(b, parents) {
  const mode = ["manual", "alternate", "weekdays"].includes(b?.mode) ? b.mode : "manual";
  const weekdays = {};
  for (const p of parents) {
    const list = Array.isArray(b?.weekdays?.[p.id]) ? b.weekdays[p.id].map(Number).filter((d) => d >= 0 && d <= 6) : [];
    weekdays[p.id] = [...new Set(list)];
  }
  return { mode, weekdays };
}

function letterCtx(plan, date, extra = {}) {
  return { elfName: plan.elf?.name, children: plan.children, day: date ? `${dayNumber(date)}. Dezember` : "", ...extra };
}

/** Fills empty days with ideas that fit the children, the weekday and the
 * variety a month needs. Fixed days (arrival, Nikolaus, farewell) go first. */
function autoplan(plan, { overwrite = false, set = "klassik" } = {}) {
  const preset = SETS.byId[set] || SETS.byId.klassik;
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
  const rotation = preset.rotation || ["streich", "aufgabe", "brief", "streich", "geschenk", "basteln", "streich", "aufgabe", "brief", "geschenk"];
  const maxWeekday = preset.maxMinutes || 20;
  let r = 0;
  let weekStart = null;
  let restThisWeek = 0;
  const everything = allIdeas(plan).filter((i) => !i.fixedDay && fits(i));
  let pool = everything.filter((i) => preset.filter(i));
  if (pool.length < 12) pool = everything;
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
        const candidates = pool.filter((i) => i.category === cat && !used.has(i.id) && (weekend || preset.allowLongOnWeekdays ? true : !i.weekend && i.minutes <= maxWeekday));
        pick = shuffled(candidates)[0] || null;
        if (pick) r = r + tries + 1;
      }
    }
    if (!pick) pick = shuffled(pool.filter((i) => !used.has(i.id) && i.category !== "ruhe"))[0] || null;
    if (!pick) pick = shuffled(everything.filter((i) => !used.has(i.id) && i.category !== "ruhe"))[0] || null;
    if (!pick) pick = shuffled(everything.filter((i) => i.category === "streich"))[0] || null;
    if (pick) setDay(date, pick);
  }
  plan.days = days;
  applyAssignments(plan, { onlyOpen: true });
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
  const have = plan.shopping?.have || {};
  const list = Object.values(items).map((i) => ({ ...i, checked: Boolean(checked[i.key]), have: Boolean(have[i.key]), custom: false }));
  for (const c of plan.shopping?.custom || []) list.push({ key: `custom:${c.id}`, id: c.id, text: c.text, dates: [], week: 0, checked: Boolean(c.checked), have: false, custom: true });
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
      kidHint: e.kidHint || "",
      price: e.price || 0,
      steps: e.steps || [],
      done: Boolean(e.done),
      doneAt: e.doneAt || null,
    } : null,
  };
}

/** Which parts of the planner need PRO. The kids' page is never gated. */
function proFeatures(pro) {
  return { ideas: pro, letters: pro, shopping: pro };
}

/** Switches the figures in everything already written: days and letters. */
function setSwissMode(plan, on) {
  on = Boolean(on);
  if (Boolean(plan.swissMode) === on) return plan;
  plan.swissMode = on;
  plan.days = convertContent(plan.days, on);
  plan.post = (plan.post || []).map((l) => ({ ...l, text: convertText(l.text, on) }));
  return plan;
}

/** The library in the plan's language: Swiss plans read Christkind and Samichlaus. */
function libraryFor(plan, list) {
  return plan.swissMode ? convertContent(list, true) : list;
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
  const spent = Math.round(days.reduce((sum, d) => sum + (d.entry?.price || 0), 0) * 100) / 100;
  return {
    id: plan.id,
    title: plan.title,
    year: plan.year,
    owner,
    isPro: pro,
    proPrice: proPriceLabel(),
    features,
    swissMode: Boolean(plan.swissMode),
    elf: { name: plan.elf?.name || "Wichtel", doorPlace: plan.elf?.doorPlace || "", character: plan.elf?.character || "frech" },
    children: plan.children,
    parents: plan.parents,
    shareLink: shareLink(plan),
    kidLink: kidLink(plan),
    viewLink: viewLink(plan),
    assignRule: plan.assignRule || { mode: "manual", weekdays: {} },
    budget: plan.budget || null,
    customIdeas: plan.customIdeas || [],
    notify: { enabled: plan.notify?.enabled !== false, time: plan.notify?.time || cfg.reminderTimeDefault, emails: plan.notify?.emails || [], pushDevices: (plan.notify?.subscriptions || []).length },
    today,
    season: { start: dates[0], end: dates[dates.length - 1], active: today >= addDays(dates[0], -1) && today <= dates[dates.length - 1] },
    stats: { planned, done, open: dates.length - planned, spent, budget: plan.budget || null },
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
  return { id: l.id, from: l.from, kind: l.kind || "letter", childId: l.childId || null, childName: l.childName || "", text: l.text || "", photo: l.photo || null, audio: l.audio || null, reaction: l.reaction || null, ref: l.ref || null, refLabel: l.refLabel || "", at: l.at, read: Boolean(l.read) };
}

const REACTIONS = { heart: "❤️", laugh: "😂", wow: "😮" };

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
    if (l.kind === "reaction") continue;
    if (l.from === "elf") letters.push({ id: l.id, date: l.at.slice(0, 10), at: l.at, from: "elf", text: l.text, photo: l.photo || null, childId: l.childId || null });
    else letters.push({ id: l.id, date: l.at.slice(0, 10), at: l.at, from: "kid", kind: l.kind || "letter", text: l.text || "", audio: l.audio || null, childId: l.childId || null, childName: l.childName || "" });
  }
  // The children's reactions hang on the elf's letters.
  for (const l of letters) if (l.from === "elf") l.reactions = (plan.post || []).filter((r) => r.kind === "reaction" && r.ref === l.id).map((r) => ({ childId: r.childId, childName: r.childName, kind: r.reaction, emoji: REACTIONS[r.reaction] || "" }));
  letters.sort((a, b) => b.at.localeCompare(a.at));
  // The morning hint: only on the day itself, and not before the elf is "asleep" at six.
  const todayEntry = plan.days[today];
  const hint = todayEntry?.kidHint && hourNow(now) >= 6 && today >= dates[0] && today <= dates[dates.length - 1] ? { date: today, text: todayEntry.kidHint } : null;
  return {
    hint,
    reactions: REACTIONS,
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

/** Read-only page for grandparents: plan, photos, reactions and the post. */
function viewView(plan, now = new Date()) {
  const today = todayIso(now);
  const dates = seasonDates(plan.year);
  const days = dates.map((d) => {
    const e = plan.days[d];
    const v = dayView(plan, d, e);
    return { date: d, day: v.day, weekday: v.weekday, entry: e ? { title: e.title, category: e.category, categoryLabel: cfg.categories[e.category] || e.category, text: e.text || "", done: Boolean(e.done), photo: e.photo || null, reaction: e.reaction || "", letter: e.letter || "" } : null };
  });
  return {
    title: plan.title,
    year: plan.year,
    today,
    elf: { name: plan.elf?.name || "Wichtel", doorPlace: plan.elf?.doorPlace || "", character: plan.elf?.character || "frech" },
    children: plan.children.map((c) => c.name),
    stats: { planned: days.filter((d) => d.entry).length, done: days.filter((d) => d.entry?.done).length },
    days,
    post: (plan.post || []).map(postView).sort((a, b) => a.at.localeCompare(b.at)),
    reactions: REACTIONS,
  };
}

/** The plan as a calendar file: one all-day event per planned morning, with an
 * alarm the evening before at the family's reminder time. */
function buildPlanIcs(plan) {
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const [hh, mm] = String(plan.notify?.time || cfg.reminderTimeDefault).split(":").map(Number);
  const alarmMinutes = 24 * 60 - (hh * 60 + mm);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Advently//Wichteltuer//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(plan.title)}`];
  for (const date of seasonDates(plan.year)) {
    const e = plan.days[date];
    if (!e) continue;
    const who = plan.parents.find((p) => p.id === e.assignee)?.name;
    const desc = [e.text, e.materials?.length ? `Material: ${e.materials.join(", ")}` : "", who ? `Dran: ${who}` : "", e.prepDayBefore ? "Am Vortag vorbereiten." : "", e.note ? `Notiz: ${e.note}` : ""].filter(Boolean).join("\n");
    const end = addDays(date, 1).replace(/-/g, "");
    lines.push("BEGIN:VEVENT", `UID:wichteltuer-${plan.id}-${date}@advently`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${esc(`${plan.elf?.name || "Wichtel"}: ${e.title}`)}`, `DESCRIPTION:${esc(desc)}`, `URL:${shareLink(plan)}#tag-${date}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(`Heute Nacht: ${e.title}`)}`, `TRIGGER:-PT${alarmMinutes}M`, "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** Next year's plan from this one: same elf, same family a year older, own ideas kept. */
function rolloverPlan(plan, user, { year, autoplan: doAutoplan = false, set } = {}) {
  const newYear = Number(year) >= 2024 && Number(year) <= 2100 ? Number(year) : plan.year + 1;
  const diff = Math.max(0, newYear - plan.year);
  const next = newPlan(user, {
    title: String(plan.title || "").replace(String(plan.year), String(newYear)) === plan.title ? `Wichteltür ${newYear}` : String(plan.title).replace(String(plan.year), String(newYear)),
    year: newYear,
    elfName: plan.elf?.name,
    swissMode: plan.swissMode,
    children: plan.children.map((c) => ({ ...c, age: c.age === null || c.age === undefined ? null : Math.min(18, c.age + diff) })),
    parents: plan.parents,
  });
  next.elf = { ...next.elf, doorPlace: plan.elf?.doorPlace || "", character: plan.elf?.character || "frech" };
  next.notify = { ...next.notify, enabled: plan.notify?.enabled !== false, time: plan.notify?.time || cfg.reminderTimeDefault, emails: plan.notify?.emails || [] };
  next.assignRule = plan.assignRule || { mode: "manual", weekdays: {} };
  next.budget = plan.budget || null;
  next.customIdeas = (plan.customIdeas || []).map((i) => ({ ...i }));
  next.isPro = Boolean(plan.isPro);
  if (doAutoplan) autoplan(next, { set });
  return next;
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

async function loadByViewToken(req, res) {
  const token = String(req.params.token || "");
  if (!/^[\w-]{8,64}$/.test(token)) {
    res.status(404).json({ error: "Link ungültig." });
    return null;
  }
  const plan = await db.getElfPlanByViewToken(token);
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
  for (const l of plan.post || []) { if (l.photo) names.push(l.photo); if (l.audio) names.push(l.audio); }
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
  removePhotoFiles, cleanEmails, setSwissMode, libraryFor, viewLink, viewView, loadByViewToken, buildPlanIcs, rolloverPlan, findIdea, allIdeas, cleanIdea, cleanSteps,
  applyAssignments, cleanAssignRule, REACTIONS,
};
