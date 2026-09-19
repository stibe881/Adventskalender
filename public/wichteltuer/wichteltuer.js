// Wichteltür – the parents' planner for the Christmas elf. Served at /e/:token.
// Everybody with the link can plan; the owner additionally manages the link.
const token = window.location.pathname.split("/").filter(Boolean)[1] || "";
const API = `/api/wichteltuer/s/${encodeURIComponent(token)}`;
const app = document.getElementById("app");

let data = null;
let ideas = null;
let templates = null;
let firstRender = true;
let ideaFilter = { cat: "", q: "", all: false };
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
};
const ME_KEY = `wichteltuer_me_${token}`;
const PUSH_KEY = `wichteltuer_push_${token}`;

const esc = (s) => UI.esc(s);
const toast = (msg, isError = false) => UI.toast(msg, { error: isError });
const haptic = (style) => { if (typeof window.nativeHaptic === "function") window.nativeHaptic(style); };
function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.${y}`;
}
const weekdayLong = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", { weekday: "long" });
const initials = (name) => String(name || "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const catIcon = { streich: "drama", brief: "mail", geschenk: "gift", aufgabe: "clipboard-list", basteln: "scissors", ruhe: "clock" };

async function req(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (isForm) opts.body = body;
    else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  }
  let r;
  try { r = await fetch(`${API}${path}`, opts); } catch (_) {
    if (navigator.onLine === false) UI.setOffline(true);
    throw new Error(navigator.onLine === false ? "Du bist offline – bitte später noch einmal versuchen." : "Verbindung fehlgeschlagen.");
  }
  UI.setOffline(false);
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `Fehler ${r.status}`);
  return json;
}
async function update(method, path, body, isForm) {
  data = await req(method, path, body, isForm);
  render();
  return data;
}

function rememberToken() {
  try {
    const list = JSON.parse(store.get("wichteltuer_tokens") || "[]");
    if (!list.includes(token)) store.set("wichteltuer_tokens", JSON.stringify([...list, token].slice(-10)));
  } catch (_) { /* ignore */ }
}

// ── Who am I (for "du bist dran" and push) ──────────────────────────────────
const meId = () => store.get(ME_KEY);
const me = () => data.parents.find((p) => p.id === meId()) || null;
async function askWhoAmI() {
  if (data.parents.length < 2 || me()) return;
  const r = await UI.form({ title: "Wer bist du?", text: "Damit wir wissen, wer heute Nacht dran ist und wen wir erinnern.", ok: "Das bin ich", cancel: "Später", fields: [{ name: "who", type: "select", label: "Ich bin", options: data.parents.map((p) => ({ value: p.id, label: p.name })) }] });
  if (r?.who) { store.set(ME_KEY, r.who); render(); }
}

// ── Push ────────────────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
const webPushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
async function registerWebPush() {
  const swReg = await navigator.serviceWorker.ready;
  const { publicKey } = await (await fetch("/api/wichteltuer/vapidPublicKey")).json();
  if (!publicKey) throw new Error("Push ist auf dem Server nicht eingerichtet.");
  const sub = (await swReg.pushManager.getSubscription()) || (await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  await req("POST", "/push", { ...sub.toJSON(), who: me()?.name || "" });
  store.set(PUSH_KEY, "web");
}
async function setupPush() {
  if (window.__NATIVE_APP && typeof window.nativeRequestPushToken === "function") {
    const t = await window.nativeRequestPushToken();
    if (t && store.get(PUSH_KEY) !== t) {
      try { await req("POST", "/push", { expoToken: t, platform: window.__NATIVE_APP.platform, who: me()?.name || "" }); store.set(PUSH_KEY, t); } catch (_) { /* next visit */ }
    }
    return;
  }
  if (webPushSupported() && Notification.permission === "granted" && store.get(PUSH_KEY) !== "web") registerWebPush().catch(() => {});
}
async function enablePush() {
  if (window.__NATIVE_APP) return setupPush();
  if (!webPushSupported()) return toast("Dieser Browser unterstützt keine Benachrichtigungen.", true);
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return toast("Benachrichtigungen wurden nicht erlaubt.", true);
  await registerWebPush();
  data = await req("GET", "");
  render();
  toast("Erinnerungen kommen jetzt auf dieses Gerät.");
}

// ── Rendering ───────────────────────────────────────────────────────────────
function render() {
  UI.watchOffline();
  app.innerHTML = [
    topBar(),
    `<div id="heute" class="w-section">${todayCard()}</div>`,
    sectionNav(),
    `<section id="plan" class="w-section">${planCard()}</section>`,
    `<section id="ideen" class="w-section">${ideasCard()}</section>`,
    `<section id="einkauf" class="w-section">${shoppingCard()}</section>`,
    `<section id="post" class="w-section">${postCard()}</section>`,
    `<section id="wichtel" class="w-section">${elfCard()}${settingsCard()}${linksCard()}</section>`,
    `<p class="text-center text-xs text-slate-500 pb-6">Wichteltür · Advently</p>`,
  ].join("");
  bindEvents();
  if (firstRender) {
    firstRender = false;
    jumpToHash();
    askWhoAmI();
  }
}

function topBar() {
  const d = data;
  return `<div class="flex flex-wrap items-center justify-between gap-2" id="w-nav">
    <div class="min-w-0"><p class="text-xs text-amber-300 uppercase tracking-widest font-semibold">Wichteltür ${d.year}</p><h1 class="w-title text-2xl truncate">${esc(d.title)}</h1></div>
    <div class="flex gap-2">
      ${d.owner ? `<a href="/admin/wichteltuer.html" class="w-btn w-btn--ghost w-btn--sm"><i data-icon="settings"></i> Alle Türen</a>` : ""}
      <button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="share-plan"><i data-icon="share-2"></i> Teilen</button>
    </div>
  </div>`;
}

function sectionNav() {
  const items = [["#plan", "calendar", "Plan", 0], ["#ideen", "lightbulb", "Ideen", 0], ["#einkauf", "clipboard-list", "Einkauf", data.shopping.filter((i) => !i.checked).length], ["#post", "mail", "Post", data.unreadPost], ["#wichtel", "door-open", "Wichtel", 0]];
  return `<nav class="w-secnav" aria-label="Bereiche">${items.map(([href, ic, label, badge]) => `<a href="${href}" class="w-secnav__item"><i data-icon="${ic}"></i><span>${label}</span>${badge ? `<span class="ui-badge">${badge}</span>` : ""}</a>`).join("")}</nav>`;
}

function catChip(cat) {
  return `<span class="t-cat t-cat--${esc(cat)}"><i data-icon="${catIcon[cat] || "gift"}"></i> ${esc(data.categories[cat] || cat)}</span>`;
}

function todayCard() {
  const d = data;
  const t = d.tonight;
  const daysToStart = Math.round((Date.parse(d.season.start) - Date.parse(d.today)) / 86400000);
  if (!d.season.active) {
    const after = d.today > d.season.end;
    return `<div class="w-card w-card--tonight">
      <p class="text-xs text-amber-300 uppercase tracking-widest font-semibold">${after ? "Rückblick" : "Vorbereitung"}</p>
      <h2 class="w-title text-xl mt-1">${after ? `${esc(d.elf.name)} ist wieder am Nordpol` : `Noch ${daysToStart} ${daysToStart === 1 ? "Tag" : "Tage"} bis ${esc(d.elf.name)} einzieht`}</h2>
      <div class="w-progress mt-3"><div style="width:${Math.round((d.stats.planned / 24) * 100)}%"></div></div>
      <p class="text-xs text-slate-400 mt-1">${d.stats.planned} von 24 Nächten geplant${d.stats.done ? `, ${d.stats.done} erledigt` : ""}</p>
      <div class="flex flex-wrap gap-2 mt-3">
        ${d.stats.open ? `<button type="button" class="w-btn w-btn--primary w-btn--sm" data-act="autoplan"><i data-icon="sparkles"></i> ${d.stats.planned ? "Lücken automatisch füllen" : "Alle 24 Nächte automatisch planen"}</button>` : ""}
        <a href="#einkauf" class="w-btn w-btn--ghost w-btn--sm"><i data-icon="clipboard-list"></i> Einkaufsliste</a>
        ${after ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-recap"><i data-icon="printer"></i> Rückblick drucken</button>` : ""}
      </div>
    </div>`;
  }
  const e = t?.entry;
  const mine = e?.assignee && e.assignee === meId();
  return `<div class="w-card w-card--tonight">
    <div class="flex items-start justify-between gap-3">
      <div><p class="text-xs text-amber-300 uppercase tracking-widest font-semibold">Heute Nacht · für den ${t ? t.day : "?"}. Dezember</p>
      <h2 class="w-title text-xl mt-1">${e ? esc(e.title) : "Noch nichts geplant"}</h2></div>
      ${e ? `<label class="w-check"><input type="checkbox" data-done="${t.date}" ${e.done ? "checked" : ""}> <span>Erledigt</span></label>` : ""}
    </div>
    ${e ? `
      <div class="flex flex-wrap items-center gap-2 mt-2">${catChip(e.category)}${e.minutes ? `<span class="w-chip"><i data-icon="clock"></i> ${e.minutes} Min.</span>` : ""}${e.assigneeName ? `<span class="w-chip ${mine ? "text-amber-300" : ""}"><i data-icon="user"></i> ${mine ? "Du bist dran" : esc(e.assigneeName)}</span>` : ""}</div>
      <p class="text-sm text-slate-200 mt-3 whitespace-pre-line">${esc(e.text)}</p>
      ${e.materials.length ? `<p class="text-sm mt-2"><span class="text-slate-400">Du brauchst:</span> ${e.materials.map(esc).join(", ")}</p>` : ""}
      ${e.note ? `<p class="text-xs text-amber-200 mt-2"><i data-icon="pencil"></i> ${esc(e.note)}</p>` : ""}
      ${e.letter ? `<div class="t-letter t-letter--elf mt-3">${esc(e.letter)}</div>` : ""}
      <div class="flex flex-wrap gap-2 mt-3">
        <button type="button" class="w-btn w-btn--ghost w-btn--sm" data-open-day="${t.date}"><i data-icon="pencil"></i> Bearbeiten</button>
        ${e.letter ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-print-letter="${t.date}"><i data-icon="printer"></i> Brief drucken</button>` : ""}
        <label class="w-btn w-btn--ghost w-btn--sm"><i data-icon="camera"></i> Foto<input type="file" accept="image/*" capture="environment" class="sr-only" data-photo="${t.date}"></label>
      </div>`
      : `<p class="text-sm text-slate-300 mt-2">${esc(d.elf.name)} braucht eine Idee für heute Nacht.</p><div class="flex flex-wrap gap-2 mt-3"><button type="button" class="w-btn w-btn--primary w-btn--sm" data-open-day="${t ? t.date : ""}"><i data-icon="lightbulb"></i> Idee wählen</button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="autoplan"><i data-icon="sparkles"></i> Automatisch füllen</button></div>`}
    ${d.prepTomorrow.length ? `<div class="mt-4 bg-black/25 rounded-xl p-3 text-sm"><b class="text-amber-200"><i data-icon="triangle-alert"></i> Morgen vorbereiten:</b> ${d.prepTomorrow.map((p) => `${esc(p.entry.title)}${p.entry.materials.length ? ` (${p.entry.materials.map(esc).join(", ")})` : ""}`).join("; ")}</div>` : ""}
  </div>`;
}

function planCard() {
  const d = data;
  return `<div class="w-card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="w-title text-xl"><i data-icon="calendar"></i> Der Plan</h2>
      <div class="flex gap-2">${d.stats.open ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="autoplan"><i data-icon="sparkles"></i> Lücken füllen</button>` : ""}<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-plan"><i data-icon="printer"></i></button></div>
    </div>
    <p class="text-sm text-slate-400 mt-1 mb-3">Jede Zeile ist der Morgen, an dem die Kinder es entdecken. Vorbereitet wird in der Nacht davor. Tippe auf einen Tag.</p>
    <div class="space-y-2">${d.days.map((day) => dayRow(day)).join("")}</div>
  </div>`;
}

function dayRow(day) {
  const e = day.entry;
  const tonight = data.tonight?.date === day.date;
  const cls = ["t-day", e ? "" : "is-empty", e?.done ? "is-done" : "", day.weekend ? "is-weekend" : "", tonight ? "is-today" : "", day.date < data.today ? "is-past" : ""].filter(Boolean).join(" ");
  const mine = e?.assignee && e.assignee === meId();
  return `<div class="${cls}" data-open-day="${day.date}" id="tag-${day.date}" role="button" tabindex="0">
    <div class="t-day__num">${day.day}<small>${day.weekday}</small></div>
    <div class="min-w-0">
      <div class="t-day__title">${e ? esc(e.title) : `<span class="text-slate-500">Noch frei${tonight ? " – heute Nacht!" : ""}</span>`}</div>
      ${e ? `<div class="t-day__meta">${catChip(e.category)}${e.minutes ? `<span><i data-icon="clock"></i> ${e.minutes} Min.</span>` : ""}${e.prepDayBefore ? `<span class="text-amber-300"><i data-icon="triangle-alert"></i> vorbereiten</span>` : ""}${e.letter ? `<span><i data-icon="mail"></i></span>` : ""}${e.photo ? `<span><i data-icon="image"></i></span>` : ""}</div>` : ""}
    </div>
    <div class="t-day__right">${e?.assigneeName ? `<span class="t-avatar ${mine ? "is-me" : ""}" title="${esc(e.assigneeName)}">${esc(initials(e.assigneeName))}</span>` : ""}${e?.done ? icon("circle-check", "text-emerald-300") : ""}</div>
  </div>`;
}

function ideasCard() {
  if (!ideas) return `<div class="w-card"><h2 class="w-title text-xl"><i data-icon="lightbulb"></i> Ideen</h2><p class="text-sm text-slate-400 mt-2">Lade Bibliothek …</p></div>`;
  const used = new Set(data.days.map((d) => d.entry?.ideaId).filter(Boolean));
  const ages = data.children.map((c) => c.age).filter((a) => a !== null);
  const fits = (i) => !ages.length || (i.ageMax >= Math.min(...ages) && i.ageMin <= Math.max(...ages));
  const q = ideaFilter.q.toLowerCase();
  const all = ideas.filter((i) => (!ideaFilter.cat || i.category === ideaFilter.cat) && (!q || `${i.title} ${i.text} ${i.materials.join(" ")}`.toLowerCase().includes(q)));
  const limit = ideaFilter.all || ideaFilter.cat || q ? all.length : 8;
  const list = all.slice(0, limit);
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="lightbulb"></i> Ideen-Bibliothek <span class="text-sm font-normal text-slate-400">(${ideas.length})</span></h2>
    <p class="text-sm text-slate-400 mt-1">Aufwand, Material und Alter stehen dabei. „Einplanen“ legt die Idee auf einen freien Tag.</p>
    <input id="idea-search" class="w-input mt-3" placeholder="Suchen: Mehl, Brief, Rätsel …" value="${esc(ideaFilter.q)}">
    <div class="t-filter mt-2" id="idea-filter"><button type="button" data-cat="" class="${ideaFilter.cat ? "" : "is-active"}">Alle</button>${Object.entries(data.categories).map(([k, v]) => `<button type="button" data-cat="${k}" class="${ideaFilter.cat === k ? "is-active" : ""}">${esc(v)}</button>`).join("")}</div>
    <div class="grid sm:grid-cols-2 gap-2 mt-3">${list.map((i) => `<div class="t-idea ${used.has(i.id) ? "is-used" : ""}">
      <div class="t-idea__head"><div class="t-idea__title">${esc(i.title)}</div>${catChip(i.category)}</div>
      <div class="t-idea__text">${esc(i.text)}</div>
      <div class="t-day__meta"><span><i data-icon="clock"></i> ${i.minutes} Min.</span><span><i data-icon="user"></i> ${i.ageMin}–${i.ageMax} J.</span>${i.prepDayBefore ? `<span class="text-amber-300"><i data-icon="triangle-alert"></i> Vortag</span>` : ""}${i.weekend ? `<span><i data-icon="calendar"></i> Wochenende</span>` : ""}${!fits(i) ? `<span class="text-rose-300">passt nicht zum Alter</span>` : ""}</div>
      ${i.materials.length ? `<div class="text-xs text-slate-400">Material: ${i.materials.map(esc).join(", ")}</div>` : ""}
      <div class="flex gap-2 mt-1"><button type="button" class="w-btn w-btn--primary w-btn--sm" data-plan-idea="${esc(i.id)}"><i data-icon="calendar"></i> ${used.has(i.id) ? "Nochmal einplanen" : "Einplanen"}</button>${i.letter ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-idea-letter="${esc(i.id)}" title="Brief ansehen"><i data-icon="mail"></i></button>` : ""}</div>
    </div>`).join("") || `<p class="text-sm text-slate-500 col-span-full">Nichts gefunden.</p>`}</div>
    ${all.length > list.length ? `<button type="button" class="w-btn w-btn--ghost w-full mt-3" data-act="ideas-all">Alle ${all.length} Ideen anzeigen</button>` : ""}
  </div>`;
}

function shoppingCard() {
  const list = data.shopping;
  const weeks = {};
  for (const i of list) (weeks[i.week] = weeks[i.week] || []).push(i);
  const label = (w) => (w === 0 ? "Eigene Einträge" : `Woche ${w} · ${(w - 1) * 7 + 1}.–${Math.min(24, w * 7)}. Dezember`);
  const open = list.filter((i) => !i.checked).length;
  return `<div class="w-card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="w-title text-xl"><i data-icon="clipboard-list"></i> Einkaufsliste <span class="text-sm font-normal text-slate-400">(${open} offen)</span></h2>
      <div class="flex gap-2"><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="share-shopping"><i data-icon="share-2"></i></button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-shopping"><i data-icon="printer"></i></button></div>
    </div>
    <p class="text-sm text-slate-400 mt-1">Aus allen geplanten Nächten, nach Wochen sortiert. Erledigte Nächte verschwinden von selbst.</p>
    ${Object.keys(weeks).sort((a, b) => (a === "0" ? 1 : b === "0" ? -1 : a - b)).map((w) => `<h3 class="text-xs uppercase tracking-wider text-slate-400 mt-4 mb-1">${label(Number(w))}</h3>${weeks[w].map((i) => `<label class="t-shop ${i.checked ? "is-checked" : ""}"><input type="checkbox" data-shop="${esc(i.key)}" ${i.checked ? "checked" : ""}><span class="flex-1">${esc(i.text)}</span>${i.dates.length ? `<small>${i.dates.map((x) => `${Number(x.slice(8))}.`).join(" ")}</small>` : ""}${i.custom ? `<button type="button" class="text-slate-500 hover:text-rose-300" data-shop-del="${esc(i.id)}" title="Entfernen"><i data-icon="x"></i></button>` : ""}</label>`).join("")}`).join("") || `<div class="ui-empty"><div class="ui-empty__art"><i data-icon="clipboard-list"></i></div>Noch nichts zu kaufen – plane zuerst ein paar Nächte.</div>`}
    <form id="shop-form" class="flex gap-2 mt-4"><input name="text" maxlength="80" required class="w-input" placeholder="Eigener Eintrag, z. B. Batterien"><button class="w-btn w-btn--primary" aria-label="Hinzufügen"><i data-icon="check"></i></button></form>
    ${list.some((i) => i.checked) ? `<button type="button" class="text-xs text-slate-400 hover:text-white mt-3" data-act="clear-checked"><i data-icon="trash-2"></i> Abgehakte entfernen</button>` : ""}
  </div>`;
}

function postCard() {
  const d = data;
  const post = d.post;
  return `<div class="w-card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="w-title text-xl"><i data-icon="mail"></i> Wichtelpost ${d.unreadPost ? `<span class="ui-badge">${d.unreadPost}</span>` : ""}</h2>
      <button type="button" class="w-btn w-btn--primary w-btn--sm" data-act="write-post"><i data-icon="pen-line"></i> Brief an die Kinder</button>
    </div>
    <p class="text-sm text-slate-400 mt-1">Briefe der Kinder von der Kinderseite und die Antworten von ${esc(d.elf.name)}. Antworten erscheinen sofort auf der Kinderseite.</p>
    <div class="space-y-3 mt-3">${post.length ? post.map((l) => l.from === "kid"
      ? `<div class="t-letter t-letter--kid ${l.read ? "" : "t-letter--unread"}">${esc(l.text)}<small>${esc(l.childName || "Kind")} · ${formatDate(l.at.slice(0, 10))}</small><div class="t-letter__actions"><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-reply="${esc(l.id)}" data-child="${esc(l.childId || "")}"><i data-icon="pen-line"></i> Antworten</button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-del-post="${esc(l.id)}"><i data-icon="x"></i></button></div></div>`
      : `<div class="t-letter t-letter--elf">${esc(l.text)}<small>${esc(d.elf.name)}${l.childName ? ` an ${esc(l.childName)}` : ""} · ${formatDate(l.at.slice(0, 10))}</small><div class="t-letter__actions"><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-del-post="${esc(l.id)}"><i data-icon="x"></i></button></div></div>`).join("")
      : `<div class="ui-empty"><div class="ui-empty__art"><i data-icon="mail"></i></div>Noch keine Post. Teile die Kinderseite, dann können die Kinder schreiben.</div>`}</div>
  </div>`;
}

function elfCard() {
  const d = data;
  return `<div class="w-card w-card--elf">
    <div class="flex items-center gap-4">
      <div class="t-door" style="width:72px;height:102px;flex-shrink:0"><div class="t-door__frame"></div><div class="t-door__window" style="width:24px;height:24px;top:14px"></div><div class="t-door__knob" style="top:60px;right:10px;width:8px;height:8px"></div></div>
      <div class="min-w-0"><p class="text-xs text-rose-300 uppercase tracking-widest font-semibold">Euer Wichtel</p><h2 class="w-title text-2xl">${esc(d.elf.name)}</h2><p class="text-sm text-slate-300">${esc({ frech: "frech und verspielt", lieb: "lieb und hilfsbereit", verpeilt: "ein bisschen verpeilt", neugierig: "neugierig und vorwitzig" }[d.elf.character] || "")}${d.elf.doorPlace ? ` · Tür: ${esc(d.elf.doorPlace)}` : ""}</p>
      <p class="text-xs text-slate-400 mt-1">Kinder: ${d.children.length ? d.children.map((c) => `${esc(c.name)}${c.age !== null ? ` (${c.age})` : ""}`).join(", ") : "noch keine eingetragen"}</p></div>
    </div>
  </div>`;
}

function settingsCard() {
  const d = data;
  const rows = (list, name, extra) => list.map((x, i) => `<div class="flex gap-2 items-center"><input name="${name}_name_${i}" value="${esc(x.name)}" maxlength="40" class="w-input" placeholder="Name"><input type="hidden" name="${name}_id_${i}" value="${esc(x.id)}">${extra ? `<input name="${name}_age_${i}" type="number" min="0" max="18" value="${x.age ?? ""}" class="w-input" style="width:80px" placeholder="Alter">` : ""}</div>`).join("");
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="settings"></i> Einstellungen</h2>
    <form id="settings-form" class="space-y-4 mt-3">
      <div class="grid sm:grid-cols-2 gap-2">
        <label class="ui-field"><span class="ui-field__label">Titel</span><input name="title" value="${esc(d.title)}" maxlength="80" class="w-input"></label>
        <label class="ui-field"><span class="ui-field__label">Name des Wichtels</span><input name="elfName" value="${esc(d.elf.name)}" maxlength="40" class="w-input"></label>
        <label class="ui-field"><span class="ui-field__label">Charakter</span><select name="character" class="w-input">${[["frech", "Frech"], ["lieb", "Lieb"], ["verpeilt", "Verpeilt"], ["neugierig", "Neugierig"]].map(([v, l]) => `<option value="${v}" ${d.elf.character === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="ui-field"><span class="ui-field__label">Wo steht die Tür?</span><input name="doorPlace" value="${esc(d.elf.doorPlace)}" maxlength="80" class="w-input" placeholder="z. B. im Flur neben der Küche"></label>
      </div>
      <div><span class="ui-field__label">Kinder <span class="text-slate-500">(Name, Alter – die Ideen passen sich an)</span></span><div class="space-y-2" id="children-rows">${rows(d.children, "child", true)}</div><button type="button" class="text-xs text-amber-300 mt-2" data-act="add-child">+ Kind hinzufügen</button></div>
      <div><span class="ui-field__label">Eltern / Helfer <span class="text-slate-500">(wer ist dran)</span></span><div class="space-y-2" id="parent-rows">${rows(d.parents, "parent", false)}</div><button type="button" class="text-xs text-amber-300 mt-2" data-act="add-parent">+ Person hinzufügen</button></div>
      <div class="border-t border-white/10 pt-3">
        <span class="ui-field__label">Abendliche Erinnerung</span>
        <div class="grid sm:grid-cols-2 gap-2">
          <label class="w-check"><input type="checkbox" name="notifyEnabled" ${d.notify.enabled ? "checked" : ""}> <span>Jeden Abend erinnern</span></label>
          <label class="ui-field"><span class="ui-field__label">Uhrzeit</span><input name="notifyTime" type="time" value="${esc(d.notify.time)}" class="w-input"></label>
          <label class="ui-field sm:col-span-2"><span class="ui-field__label">Zusätzlich per E-Mail an (mit Komma trennen)</span><input name="emails" value="${esc(d.notify.emails.join(", "))}" class="w-input" placeholder="mama@…, papa@…"></label>
        </div>
        <p class="text-xs text-slate-400">Push auf diesem Gerät: ${d.notify.pushDevices ? `${d.notify.pushDevices} Gerät${d.notify.pushDevices === 1 ? "" : "e"} angemeldet` : "noch keins"}. <button type="button" class="text-amber-300 underline" data-act="push">Auf diesem Gerät aktivieren</button></p>
      </div>
      <div class="flex items-center gap-3"><button class="w-btn w-btn--primary">Speichern</button><span id="settings-saved" class="hidden text-sm text-emerald-300">Gespeichert <i data-icon="check"></i></span></div>
    </form>
  </div>`;
}

function linksCard() {
  const d = data;
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="link"></i> Teilen</h2>
    <div class="mt-3 space-y-4">
      <div><b class="text-white">Für das andere Elternteil</b><p class="text-xs text-slate-400 mt-0.5">Wer diesen Link öffnet, kann alles sehen und bearbeiten – ohne Konto. In der App bleibt die Tür gespeichert.</p>
        <p class="text-xs text-slate-400 break-all mt-1 bg-black/20 rounded-lg p-2 font-mono">${esc(d.shareLink)}</p>
        <div class="flex flex-wrap gap-2 mt-2"><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="copy-share"><i data-icon="copy"></i> Kopieren</button><button type="button" class="w-btn w-btn--primary w-btn--sm" data-act="share-plan"><i data-icon="share-2"></i> Teilen</button>${d.owner ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="rotate-share"><i data-icon="refresh-cw"></i> Link erneuern</button>` : ""}</div></div>
      <div><b class="text-white">Für die Kinder</b><p class="text-xs text-slate-400 mt-0.5">Die Kinderseite zeigt nur die Tür, den Countdown und die Briefe – nie den Plan. Am Tablet als Lesezeichen speichern.</p>
        <p class="text-xs text-slate-400 break-all mt-1 bg-black/20 rounded-lg p-2 font-mono">${esc(d.kidLink)}</p>
        <div class="flex flex-wrap gap-2 mt-2"><a href="${esc(d.kidLink)}" target="_blank" class="w-btn w-btn--ghost w-btn--sm"><i data-icon="eye"></i> Ansehen</a><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="copy-kid"><i data-icon="copy"></i> Kopieren</button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="rotate-kid"><i data-icon="refresh-cw"></i> Link erneuern</button></div></div>
      <div><b class="text-white">Drucken</b><div class="flex flex-wrap gap-2 mt-2"><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-plan"><i data-icon="printer"></i> Plan</button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-shopping"><i data-icon="printer"></i> Einkaufsliste</button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-letters"><i data-icon="printer"></i> Alle Briefe (Mini-Format)</button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-recap"><i data-icon="printer"></i> Rückblick</button></div></div>
      ${d.owner ? `<div class="border-t border-white/10 pt-3"><button type="button" class="w-btn w-btn--sm" style="background:rgba(225,29,72,.15);color:#fda4af" data-act="delete-plan"><i data-icon="trash-2"></i> Wichteltür endgültig löschen</button></div>` : ""}
    </div>
  </div>`;
}

// ── Day editor ──────────────────────────────────────────────────────────────
async function openDay(date) {
  const day = data.days.find((x) => x.date === date);
  if (!day) return;
  if (!ideas) await loadLibrary();
  const e = day.entry || { ideaId: null, title: "", category: "streich", text: "", materials: [], minutes: 10, prepDayBefore: false, assignee: null, note: "", letter: "", letterVisibleToKids: false, photo: null, photoVisibleToKids: false, reaction: "", done: false };
  const ideaOptions = [`<option value="">– eigene Idee –</option>`].concat(Object.entries(data.categories).map(([k, v]) => `<optgroup label="${esc(v)}">${ideas.filter((i) => i.category === k).map((i) => `<option value="${esc(i.id)}" ${e.ideaId === i.id ? "selected" : ""}>${esc(i.title)} (${i.minutes} Min.)</option>`).join("")}</optgroup>`)).join("");
  const body = `
    <label class="ui-field"><span class="ui-field__label">Idee aus der Bibliothek</span><select name="ideaId" class="ui-input" data-idea-select>${ideaOptions}</select></label>
    <label class="ui-field"><span class="ui-field__label">Titel</span><input name="title" class="ui-input" value="${esc(e.title)}" maxlength="100" required></label>
    <div class="grid grid-cols-2 gap-2">
      <label class="ui-field"><span class="ui-field__label">Art</span><select name="category" class="ui-input">${Object.entries(data.categories).map(([k, v]) => `<option value="${k}" ${e.category === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
      <label class="ui-field"><span class="ui-field__label">Aufwand (Min.)</span><input name="minutes" type="number" min="0" max="600" class="ui-input" value="${e.minutes || 0}"></label>
    </div>
    <label class="ui-field"><span class="ui-field__label">Was ist zu tun?</span><textarea name="text" class="ui-input" rows="3" maxlength="2000">${esc(e.text)}</textarea></label>
    <label class="ui-field"><span class="ui-field__label">Material (mit Komma trennen)</span><input name="materials" class="ui-input" value="${esc(e.materials.join(", "))}"></label>
    <div class="grid grid-cols-2 gap-2">
      <label class="ui-field"><span class="ui-field__label">Wer ist dran?</span><select name="assignee" class="ui-input"><option value="">– offen –</option>${data.parents.map((p) => `<option value="${esc(p.id)}" ${e.assignee === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      <label class="ui-check" style="margin-top:18px"><input type="checkbox" name="prepDayBefore" ${e.prepDayBefore ? "checked" : ""}> <span>Am Vortag vorbereiten</span></label>
    </div>
    <label class="ui-field"><span class="ui-field__label">Notiz für uns</span><input name="note" class="ui-input" value="${esc(e.note)}" maxlength="500" placeholder="z. B. Kamera bereitlegen"></label>
    <div class="ui-field"><span class="ui-field__label">Brief vom Wichtel <button type="button" class="text-amber-300 underline" data-letter-template>Vorlage einsetzen</button></span><textarea name="letter" class="ui-input" rows="4" maxlength="2000" placeholder="Leer lassen, wenn es keinen Brief gibt">${esc(e.letter)}</textarea></div>
    <label class="ui-check"><input type="checkbox" name="letterVisibleToKids" ${e.letterVisibleToKids ? "checked" : ""}> <span>Brief ab diesem Morgen auch auf der Kinderseite zeigen</span></label>
    ${e.photo ? `<div class="flex items-center gap-3 mt-2"><img src="${esc(e.photo)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:10px"><label class="ui-check"><input type="checkbox" name="photoVisibleToKids" ${e.photoVisibleToKids ? "checked" : ""}> <span>Foto auf der Kinderseite zeigen</span></label><button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-remove-photo>Foto löschen</button></div>` : ""}
    <label class="ui-field"><span class="ui-field__label">${e.photo ? "Anderes Foto" : "Foto (Beweis oder Reaktion der Kinder)"}</span><input type="file" name="photo" accept="image/*" class="ui-input"></label>
    <div class="border-t border-white/10 pt-3 mt-2">
      <label class="ui-check"><input type="checkbox" name="done" ${e.done ? "checked" : ""}> <span>Erledigt</span></label>
      <label class="ui-field"><span class="ui-field__label">Wie haben die Kinder reagiert? (fürs Tagebuch)</span><input name="reaction" class="ui-input" value="${esc(e.reaction)}" maxlength="500"></label>
    </div>
    <div class="flex flex-wrap gap-2 mt-2">
      <label class="ui-field" style="margin:0"><span class="ui-field__label">Tag tauschen mit</span><select name="swapWith" class="ui-input"><option value="">–</option>${data.days.filter((x) => x.date !== date).map((x) => `<option value="${x.date}">${x.day}. (${x.weekday}) ${x.entry ? esc(x.entry.title) : "frei"}</option>`).join("")}</select></label>
      ${day.entry ? `<button type="button" class="ui-btn ui-btn--ghost ui-btn--sm self-end" data-clear-day>Tag leeren</button>` : ""}
    </div>`;
  const dialogPromise = UI.dialog({ title: `${day.day}. Dezember · ${weekdayLong(date)}`, body, ok: "Speichern" });
  // Wire the extras inside the open dialog.
  const dlg = document.querySelector(".ui-backdrop:last-of-type");
  const form = dlg.querySelector("form");
  dlg.querySelector("[data-idea-select]").addEventListener("change", (ev) => {
    const i = ideas.find((x) => x.id === ev.target.value);
    if (!i) return;
    form.elements.title.value = i.title;
    form.elements.category.value = i.category;
    form.elements.text.value = i.text;
    form.elements.materials.value = i.materials.join(", ");
    form.elements.minutes.value = i.minutes;
    form.elements.prepDayBefore.checked = i.prepDayBefore;
    if (i.letter && !form.elements.letter.value) form.elements.letter.value = fill(i.letter);
  });
  dlg.querySelector("[data-letter-template]").addEventListener("click", async () => {
    const t = await pickTemplate(date, null);
    if (t) form.elements.letter.value = t;
  });
  const clearBtn = dlg.querySelector("[data-clear-day]");
  if (clearBtn) clearBtn.addEventListener("click", async () => {
    dlg.querySelector("[data-cancel]").click();
    if (!(await UI.confirm({ title: "Tag leeren?", text: "Die geplante Idee, Notizen und der Brief für diesen Tag werden entfernt.", ok: "Leeren", danger: true }))) return;
    try { await update("DELETE", `/days/${date}`); } catch (err) { toast(err.message, true); }
  });
  const rmPhoto = dlg.querySelector("[data-remove-photo]");
  if (rmPhoto) rmPhoto.addEventListener("click", async () => {
    dlg.querySelector("[data-cancel]").click();
    try { await update("DELETE", `/days/${date}/photo`); toast("Foto gelöscht"); } catch (err) { toast(err.message, true); }
  });
  const r = await dialogPromise;
  if (!r) return;
  try {
    const body2 = {
      ideaId: r.ideaId && r.ideaId !== e.ideaId ? r.ideaId : (r.ideaId ? e.ideaId : null),
      title: r.title, category: r.category, text: r.text, materials: String(r.materials || "").split(",").map((s) => s.trim()).filter(Boolean),
      minutes: Number(r.minutes) || 0, prepDayBefore: Boolean(r.prepDayBefore), assignee: r.assignee || null, note: r.note, letter: r.letter,
      letterVisibleToKids: Boolean(r.letterVisibleToKids), photoVisibleToKids: r.photoVisibleToKids !== undefined ? Boolean(r.photoVisibleToKids) : undefined, reaction: r.reaction, done: Boolean(r.done),
    };
    // The idea id is only sent when it changed, so edited texts survive re-saves.
    if (r.ideaId === e.ideaId) delete body2.ideaId; else body2.ideaId = r.ideaId || null;
    if (body2.ideaId) { delete body2.title; delete body2.category; delete body2.text; delete body2.materials; delete body2.minutes; delete body2.prepDayBefore; }
    await update("PUT", `/days/${date}`, body2);
    if (r.photo && r.photo.size) await uploadPhoto(date, r.photo);
    haptic("light");
    if (r.swapWith) await update("POST", "/days/swap", { a: date, b: r.swapWith });
    toast("Gespeichert");
  } catch (err) {
    toast(err.message, true);
  }
}

async function uploadPhoto(date, file) {
  const fd = new FormData();
  fd.append("photo", file, file.name || "foto.jpg");
  await update("POST", `/days/${date}/photo`, fd, true);
}

function fill(text) {
  const kids = data.children.map((c) => c.name);
  const kinder = kids.length > 1 ? `${kids.slice(0, -1).join(", ")} und ${kids[kids.length - 1]}` : kids[0] || "Kinder";
  return String(text).replace(/\{wichtel\}/g, data.elf.name).replace(/\{kinder\}/g, kinder).replace(/\{kind\}/g, kids[0] || "Kind").replace(/\{frei\}/g, "…");
}

async function loadLibrary() {
  if (!ideas) ideas = (await (await fetch("/api/wichteltuer/ideas")).json()).ideas;
  if (!templates) templates = (await (await fetch("/api/wichteltuer/letters/templates")).json()).templates;
}

async function pickTemplate(date, childId) {
  await loadLibrary();
  const r = await UI.form({
    title: "Briefvorlage",
    ok: "Einsetzen",
    fields: [
      { name: "templateId", type: "select", label: "Vorlage", options: templates.map((t) => ({ value: t.id, label: t.title })) },
      { name: "free", type: "textarea", label: "Freier Text (ersetzt „…“ in der Vorlage)", placeholder: "z. B. Ihr habt so schön geteilt." },
      ...(data.children.length > 1 ? [{ name: "childId", type: "select", label: "An", options: [{ value: "", label: "alle Kinder" }, ...data.children.map((c) => ({ value: c.id, label: c.name }))], value: childId || "" }] : []),
    ],
  });
  if (!r) return null;
  try {
    const out = await req("POST", "/letters/render", { templateId: r.templateId, free: r.free, date, childId: r.childId || childId || null });
    return out.text;
  } catch (err) {
    toast(err.message, true);
    return null;
  }
}

async function planIdea(ideaId) {
  const i = ideas.find((x) => x.id === ideaId);
  if (!i) return;
  const open = data.days.filter((d) => !d.entry);
  const r = await UI.form({
    title: `„${i.title}“ einplanen`,
    text: i.fixedDay ? `Diese Idee gehört zum ${i.fixedDay}. Dezember.` : i.weekend ? "Tipp: Diese Idee braucht Zeit, ein Wochenende passt gut." : "",
    ok: "Einplanen",
    fields: [{ name: "date", type: "select", label: "Tag", options: data.days.map((d) => ({ value: d.date, label: `${d.day}. (${d.weekday})${d.entry ? ` – ersetzt „${d.entry.title}“` : " – frei"}` })), value: i.fixedDay ? data.days[i.fixedDay - 1].date : (open[0]?.date || data.days[0].date) }],
  });
  if (!r) return;
  try {
    await update("PUT", `/days/${r.date}`, { ideaId });
    haptic("light");
    toast(`Eingeplant für den ${Number(r.date.slice(8))}. Dezember`);
    document.getElementById(`tag-${r.date}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) {
    toast(err.message, true);
  }
}

async function writePost(childId, replyToId) {
  const text = await pickTemplate(null, childId);
  if (text === null) return;
  const r = await UI.form({ title: "Brief an die Kinder", text: "Erscheint sofort auf der Kinderseite.", ok: "Abschicken", fields: [{ name: "text", type: "textarea", value: text, rows: 8, required: true, maxlength: 2000 }, ...(data.children.length > 1 ? [{ name: "childId", type: "select", label: "An", options: [{ value: "", label: "alle Kinder" }, ...data.children.map((c) => ({ value: c.id, label: c.name }))], value: childId || "" }] : [])] });
  if (!r) return;
  try {
    await update("POST", "/post", { text: r.text, childId: r.childId || childId || null });
    if (replyToId) await update("PUT", `/post/${replyToId}/read`);
    haptic("success");
    toast("Der Brief liegt auf der Kinderseite.");
  } catch (err) {
    toast(err.message, true);
  }
}

// ── Print views ─────────────────────────────────────────────────────────────
function printShell(title, body, extraCss = "") {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#111;margin:28px;font-size:13px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}
    .muted{color:#666;font-size:11px}table{border-collapse:collapse;width:100%;margin-top:6px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f3f3f3}
    .letter{width:62mm;min-height:40mm;border:1px dashed #b8860b;border-radius:6px;padding:6mm 5mm;margin:3mm;display:inline-block;vertical-align:top;font-family:"Comic Sans MS","Segoe Print",cursive;font-size:9.5pt;line-height:1.3;white-space:pre-line;background:#fffdf5;page-break-inside:avoid}
    .letter small{display:block;font-family:Inter,sans-serif;font-size:7pt;color:#999;margin-top:4mm;border-top:1px solid #eee;padding-top:2mm}
    .photos{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.photos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px}
    @media print{body{margin:10mm}}${extraCss}</style></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`;
}
function openPrint(kind) {
  const d = data;
  const head = `<h1>${esc(d.title)}</h1><p class="muted">Wichtel: ${esc(d.elf.name)} · Kinder: ${d.children.map((c) => esc(c.name)).join(", ") || "–"} · ${d.year}</p>`;
  let title = d.title;
  let body = "";
  if (kind === "plan") {
    title = `Plan – ${d.title}`;
    body = `${head}<h2>Der Plan (Morgen der Entdeckung)</h2><table><tr><th>Tag</th><th>Idee</th><th>Art</th><th>Material</th><th>Wer</th><th>Min.</th><th>✓</th></tr>${d.days.map((x) => `<tr><td>${x.day}. ${x.weekday}</td><td>${x.entry ? esc(x.entry.title) : "<span class=muted>frei</span>"}${x.entry?.note ? `<br><span class=muted>${esc(x.entry.note)}</span>` : ""}</td><td>${x.entry ? esc(x.entry.categoryLabel) : ""}</td><td>${x.entry ? x.entry.materials.map(esc).join(", ") : ""}</td><td>${esc(x.entry?.assigneeName || "")}</td><td>${x.entry?.minutes || ""}</td><td>${x.entry?.done ? "✓" : "☐"}</td></tr>`).join("")}</table>`;
  } else if (kind === "shopping") {
    title = `Einkaufsliste – ${d.title}`;
    body = `${head}<h2>Einkaufsliste</h2><table><tr><th>☐</th><th>Was</th><th>Für Tag</th></tr>${d.shopping.filter((i) => !i.checked).map((i) => `<tr><td>☐</td><td>${esc(i.text)}</td><td>${i.dates.map((x) => `${Number(x.slice(8))}.`).join(" ")}</td></tr>`).join("")}</table>`;
  } else if (kind === "letters") {
    title = `Briefe – ${d.title}`;
    const letters = d.days.filter((x) => x.entry?.letter);
    body = `<h1>Wichtelbriefe · ${esc(d.title)}</h1><p class="muted">Ausschneiden, klein falten, vor die Tür legen.</p>${letters.map((x) => `<div class="letter">${esc(x.entry.letter)}<small>${x.day}. Dezember</small></div>`).join("") || "<p>Noch keine Briefe geplant.</p>"}`;
  } else if (kind === "recap") {
    title = `Rückblick – ${d.title}`;
    const done = d.days.filter((x) => x.entry && (x.entry.done || x.entry.photo || x.entry.reaction));
    body = `${head}<h2>Tagebuch der Wichtelzeit</h2>${done.map((x) => `<h3 style="margin:14px 0 2px">${x.day}. Dezember – ${esc(x.entry.title)}</h3>${x.entry.reaction ? `<p>${esc(x.entry.reaction)}</p>` : ""}${x.entry.photo ? `<img src="${esc(x.entry.photo)}" style="max-width:60mm;border-radius:6px">` : ""}`).join("") || "<p class=muted>Noch nichts erledigt.</p>"}<h2>Wichtelpost</h2>${d.post.slice().reverse().map((l) => `<p><b>${l.from === "kid" ? esc(l.childName || "Kind") : esc(d.elf.name)}:</b> ${esc(l.text)}</p>`).join("") || "<p class=muted>Keine Briefe.</p>"}`;
  }
  const w = window.open("", "_blank");
  if (!w) return toast("Pop-up blockiert – bitte Pop-ups für diese Seite erlauben.", true);
  w.document.write(printShell(title, body));
  w.document.close();
}
function printLetter(date) {
  const x = data.days.find((y) => y.date === date);
  if (!x?.entry?.letter) return;
  const w = window.open("", "_blank");
  if (!w) return toast("Pop-up blockiert – bitte Pop-ups für diese Seite erlauben.", true);
  w.document.write(printShell(`Brief ${x.day}. Dezember`, `<div class="letter">${esc(x.entry.letter)}<small>${x.day}. Dezember</small></div>`));
  w.document.close();
}

// ── Events ──────────────────────────────────────────────────────────────────
function jumpToHash() {
  const h = (window.location.hash || "").slice(1);
  if (!h) return;
  if (h.startsWith("tag-")) { const date = h.slice(4); document.getElementById(h)?.scrollIntoView({ block: "center" }); openDay(date); return; }
  const el = document.getElementById(h);
  if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}
window.addEventListener("hashchange", jumpToHash);

function bindEvents() {
  app.addEventListener("click", onClick);
  app.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-open-day]")) openDay(e.target.dataset.openDay); });
  app.addEventListener("change", onChange);
  const search = document.getElementById("idea-search");
  if (search) search.addEventListener("input", () => { ideaFilter.q = search.value; const pos = search.selectionStart; renderIdeasOnly(); const s2 = document.getElementById("idea-search"); s2.focus(); s2.setSelectionRange(pos, pos); });
  document.getElementById("shop-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = e.target.elements.text.value.trim();
    if (!text) return;
    try { await update("POST", "/shopping/custom", { text }); } catch (err) { toast(err.message, true); }
  });
  document.getElementById("settings-form").addEventListener("submit", onSettingsSubmit);
  // Reading the post section marks the kids' letters as read.
  if ("IntersectionObserver" in window && data.unreadPost) {
    const obs = new IntersectionObserver((entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      obs.disconnect();
      req("POST", "/post/read-all").then((d) => { data = d; document.querySelectorAll(".t-letter--unread").forEach((el) => el.classList.remove("t-letter--unread")); document.querySelectorAll(".w-secnav .ui-badge, #post .ui-badge").forEach((b) => { if (b.closest("a")?.getAttribute("href") === "#post" || b.closest("#post")) b.remove(); }); }).catch(() => {});
    }, { threshold: 0.5 });
    obs.observe(document.getElementById("post"));
  }
}
function renderIdeasOnly() {
  const el = document.getElementById("ideen");
  if (el) el.innerHTML = ideasCard();
}

async function onClick(e) {
  const t = e.target;
  const btn = t.closest("[data-act], [data-open-day], [data-plan-idea], [data-idea-letter], [data-reply], [data-del-post], [data-shop-del], [data-print-letter], [data-cat]");
  if (!btn) return;
  if (btn.matches("[data-cat]")) { ideaFilter.cat = btn.dataset.cat; renderIdeasOnly(); return; }
  if (btn.matches("[data-open-day]") && !t.closest("input, label")) return openDay(btn.dataset.openDay);
  if (btn.matches("[data-plan-idea]")) return planIdea(btn.dataset.planIdea);
  if (btn.matches("[data-idea-letter]")) { const i = ideas.find((x) => x.id === btn.dataset.ideaLetter); return UI.alert({ title: i.title, text: fill(i.letter), ok: "Schließen" }); }
  if (btn.matches("[data-reply]")) return writePost(btn.dataset.child || null, btn.dataset.reply);
  if (btn.matches("[data-print-letter]")) return printLetter(btn.dataset.printLetter);
  if (btn.matches("[data-del-post]")) {
    if (!(await UI.confirm({ title: "Brief löschen?", ok: "Löschen", danger: true }))) return;
    try { await update("DELETE", `/post/${btn.dataset.delPost}`); } catch (err) { toast(err.message, true); }
    return;
  }
  if (btn.matches("[data-shop-del]")) { try { await update("DELETE", `/shopping/custom/${btn.dataset.shopDel}`); } catch (err) { toast(err.message, true); } return; }
  const act = btn.dataset.act;
  try {
    switch (act) {
      case "autoplan": {
        if (!(await UI.confirm({ title: data.stats.planned ? "Lücken automatisch füllen?" : "Alle 24 Nächte automatisch planen?", text: "Passend zum Alter der Kinder, mit Abwechslung, aufwendigen Ideen am Wochenende und einem Ruhetag pro Woche. Du kannst danach alles ändern.", ok: "Planen" }))) return;
        await update("POST", "/autoplan", {});
        toast("Der Plan steht. Schau ihn dir an!");
        break;
      }
      case "share-plan": {
        const r = await UI.share({ title: `Wichteltür: ${data.title}`, text: `Unser Wichtel-Plan für ${data.elf.name} – hier kannst du mitplanen:`, url: data.shareLink });
        if (r === "copied") toast("Link kopiert.");
        break;
      }
      case "copy-share": await UI.copy(data.shareLink); break;
      case "copy-kid": await UI.copy(data.kidLink); break;
      case "share-shopping": {
        const text = data.shopping.filter((i) => !i.checked).map((i) => `☐ ${i.text}`).join("\n");
        await UI.share({ title: "Wichtel-Einkaufsliste", text: `Einkaufsliste für ${data.elf.name}:\n${text}` });
        break;
      }
      case "rotate-share":
        if (!(await UI.confirm({ title: "Eltern-Link erneuern?", text: "Der bisherige Link funktioniert danach nicht mehr – auch auf dem Gerät des anderen Elternteils. Du landest auf dem neuen Link.", ok: "Erneuern", danger: true }))) return;
        { const d = await (await fetch(`/api/wichteltuer/plans/${data.id}/rotate-share`, { method: "POST" })).json(); if (d.shareLink) window.location.href = `/e/${encodeURIComponent(d.shareLink.split("/").pop())}`; else toast(d.error || "Fehler", true); }
        break;
      case "rotate-kid":
        if (!(await UI.confirm({ title: "Kinder-Link erneuern?", text: "Das Lesezeichen am Tablet muss danach neu gesetzt werden.", ok: "Erneuern" }))) return;
        await update("POST", "/rotate-kid-link");
        break;
      case "delete-plan":
        if (!(await UI.confirm({ title: "Wichteltür endgültig löschen?", text: "Plan, Briefe und Fotos werden sofort gelöscht.", ok: "Endgültig löschen", danger: true }))) return;
        { const r = await fetch(`/api/wichteltuer/plans/${data.id}`, { method: "DELETE" }); if (r.ok) window.location.href = "/admin/wichteltuer.html"; else toast("Löschen fehlgeschlagen.", true); }
        break;
      case "write-post": await writePost(null, null); break;
      case "clear-checked": await update("POST", "/shopping/clear-checked"); break;
      case "push": await enablePush(); break;
      case "add-child": document.getElementById("children-rows").insertAdjacentHTML("beforeend", `<div class="flex gap-2 items-center"><input name="child_name_new${Date.now()}" class="w-input" placeholder="Name" maxlength="40"><input name="child_age_new${Date.now()}" type="number" min="0" max="18" class="w-input" style="width:80px" placeholder="Alter"></div>`); break;
      case "add-parent": document.getElementById("parent-rows").insertAdjacentHTML("beforeend", `<div class="flex gap-2 items-center"><input name="parent_name_new${Date.now()}" class="w-input" placeholder="Name" maxlength="40"></div>`); break;
      case "ideas-all": ideaFilter.all = true; renderIdeasOnly(); break;
      case "print-plan": openPrint("plan"); break;
      case "print-shopping": openPrint("shopping"); break;
      case "print-letters": openPrint("letters"); break;
      case "print-recap": openPrint("recap"); break;
      default: break;
    }
  } catch (err) {
    toast(err.message, true);
  }
}

async function onChange(e) {
  const t = e.target;
  try {
    if (t.matches("[data-done]")) { await update("PUT", `/days/${t.dataset.done}`, { done: t.checked }); haptic("success"); }
    else if (t.matches("[data-shop]")) { await update("PUT", "/shopping/check", { key: t.dataset.shop, checked: t.checked }); }
    else if (t.matches("[data-photo]") && t.files[0]) { toast("Lade hoch …"); await uploadPhoto(t.dataset.photo, t.files[0]); toast("Foto gespeichert"); }
  } catch (err) {
    toast(err.message, true);
  }
}

async function onSettingsSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const fd = new FormData(f);
  const collect = (prefix, withAge) => {
    const out = [];
    for (const [k, v] of fd.entries()) {
      const m = k.match(new RegExp(`^${prefix}_name_(.+)$`));
      if (!m || !String(v).trim()) continue;
      const idx = m[1];
      out.push({ id: fd.get(`${prefix}_id_${idx}`) || undefined, name: v, ...(withAge ? { age: fd.get(`${prefix}_age_${idx}`) } : {}) });
    }
    return out;
  };
  try {
    await update("PUT", "/settings", {
      title: fd.get("title"),
      elf: { name: fd.get("elfName"), character: fd.get("character"), doorPlace: fd.get("doorPlace") },
      children: collect("child", true),
      parents: collect("parent", false),
      notify: { enabled: fd.get("notifyEnabled") === "on", time: fd.get("notifyTime"), emails: String(fd.get("emails") || "").split(",").map((s) => s.trim()).filter(Boolean) },
    });
    const ok = document.getElementById("settings-saved");
    ok.classList.remove("hidden");
    setTimeout(() => ok.classList.add("hidden"), 1500);
    document.getElementById("wichtel").scrollIntoView({ block: "start" });
  } catch (err) {
    toast(err.message, true);
  }
}

// ── Start ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    data = await req("GET", "");
    rememberToken();
    document.title = `${data.title} – Wichteltür`;
    render();
    loadLibrary().then(renderIdeasOnly).catch(() => {});
    setupPush();
    setInterval(async () => {
      if (document.hidden || navigator.onLine === false || document.querySelector(".ui-backdrop") || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      try { const fresh = await req("GET", ""); if (JSON.stringify(fresh) !== JSON.stringify(data)) { data = fresh; render(); } } catch (_) { /* keep */ }
    }, 30000);
  } catch (err) {
    app.innerHTML = `<div class="w-card text-center"><div class="ui-empty__art"><i data-icon="eye-off"></i></div><h1 class="w-title text-xl mb-2">Link ungültig</h1><p class="text-slate-400">${esc(err.message)}</p></div>`;
  }
})();
