// Wichteltür – the parents' planner for the Christmas elf. Served at /e/:token.
// Everybody with the link can plan; the owner additionally manages the links.
const token = window.location.pathname.split("/").filter(Boolean)[1] || "";
const API = `/api/wichteltuer/s/${encodeURIComponent(token)}`;
const app = document.getElementById("app");

let data = null;
let ideas = null;
let templates = null;
let sets = null;
let firstRender = true;
let ideaFilter = { cat: "", q: "", all: false };
let planFilter = "alle"; // alle | meine | offen
let swapFrom = null; // date picked up for a swap (long press / drag)
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
};
const ME_KEY = `wichteltuer_me_${token}`;
const TAB_KEY = `wichteltuer_tab_${token}`;
const ONB_KEY = `wichteltuer_onboarded_${token}`;
const TABS = ["heute", "plan", "ideen", "einkauf", "post", "wichtel"];
// Tabs that exist for this plan: the library and the shopping list only with PRO.
const tabs = () => TABS.filter((t) => (t === "ideen" ? feat().ideas : t === "einkauf" ? feat().shopping : true));
let activeTab = TABS.includes(store.get(TAB_KEY)) ? store.get(TAB_KEY) : "heute";
const PUSH_KEY = `wichteltuer_push_${token}`;

const esc = (s) => UI.esc(s);
// Which parts of the planner are unlocked (PRO). Older servers send no flags.
const feat = () => data.features || { ideas: true, letters: true, shopping: true };
const proPrice = () => data.proPrice || "CHF 4.50";
const PRO_POINTS = [
  ["lightbulb", "Ideen-Bibliothek: 60 Streiche, Aufgaben und Geschenke, passend zum Alter – und fertige Monatspläne"],
  ["mail", "Briefe schreiben: fertige Vorlagen in der Stimme des Wichtels, für den Plan und die Wichtelpost"],
  ["clipboard-list", "Einkaufsliste: alles Material aus dem Plan, nach Wochen sortiert, mit Vorrat und Kosten"],
];
async function startUpgrade() {
  const ok = await UI.proDialog({ title: "Wichteltür auf PRO upgraden", scope: "diese Wichteltür und alle, die den Link haben", price: proPrice(), points: PRO_POINTS });
  if (!ok) return;
  let r;
  try {
    r = await fetch("/api/payment/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "wichteltuer", id: data.id }) });
  } catch (_) {
    return toast("Verbindung fehlgeschlagen.", true);
  }
  const json = await r.json().catch(() => ({}));
  if (r.status === 401) return toast("Bitte melde dich zuerst in deinem Konto an.", true);
  if (!r.ok) return toast(json.error || `Fehler ${r.status}`, true);
  if (json.url) window.location.href = json.url;
}
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
const money = (n) => `CHF ${(Number(n) || 0).toFixed(2).replace(".00", ".–")}`;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

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
async function askWhoAmI(force = false) {
  if (!force && (data.parents.length < 2 || me())) return;
  if (!data.parents.length) return;
  const r = await UI.form({ title: "Wer bist du?", text: "Damit wir wissen, wer heute Nacht dran ist und wen wir erinnern.", ok: "Das bin ich", cancel: "Später", fields: [{ name: "who", type: "select", label: "Ich bin", value: meId() || "", options: data.parents.map((p) => ({ value: p.id, label: p.name })) }] });
  if (r?.who) { store.set(ME_KEY, r.who); render(); }
}

// ── First visit: three questions, then the planner ──────────────────────────
async function onboarding() {
  if (store.get(ONB_KEY) || !data.owner) return;
  // Created in the admin with children already entered: nothing to ask.
  if (data.children.length) { store.set(ONB_KEY, "1"); return; }
  store.set(ONB_KEY, "1");
  const s1 = await UI.form({
    title: "Willkommen bei der Wichteltür",
    text: "Drei kurze Fragen, dann steht alles bereit. Alles lässt sich später ändern.",
    ok: "Weiter", cancel: "Überspringen",
    fields: [
      { name: "elfName", label: "Wie heißt euer Wichtel?", value: data.elf.name, required: true, maxlength: 40 },
      { name: "doorPlace", label: "Wo steht die Tür?", value: data.elf.doorPlace, placeholder: "z. B. im Flur neben der Küche", required: false, maxlength: 80 },
      { name: "character", type: "select", label: "Charakter", value: data.elf.character, options: [["frech", "Frech"], ["lieb", "Lieb"], ["verpeilt", "Verpeilt"], ["neugierig", "Neugierig"]].map(([value, label]) => ({ value, label })) },
    ],
  });
  if (!s1) return;
  const s2 = await UI.form({
    title: "Schritt 2 von 3 · Die Kinder",
    text: "Name und Alter – die Ideen passen sich daran an. Mehrere Kinder mit Komma trennen, das Alter in Klammern.",
    ok: "Weiter", cancel: "Überspringen",
    fields: [
      { name: "kids", label: "Kinder", value: data.children.map((c) => `${c.name}${c.age !== null ? ` (${c.age})` : ""}`).join(", "), placeholder: "Mia (5), Ben (8)", required: false, maxlength: 200 },
      { name: "parents", label: "Wer plant mit? (mit Komma trennen)", value: data.parents.map((p) => p.name).join(", "), placeholder: "Stefan, Nina", required: false, maxlength: 200 },
    ],
  });
  const s3 = s2 ? await UI.form({
    title: "Schritt 3 von 3 · Die Erinnerung",
    text: "Jeden Abend sagen wir Bescheid, was heute Nacht ansteht – per Push auf dieses Gerät oder per E-Mail.",
    ok: "Fertig", cancel: "Überspringen",
    fields: [
      { name: "time", type: "time", label: "Uhrzeit", value: data.notify.time },
      { name: "emails", label: "E-Mail (optional, mit Komma trennen)", value: data.notify.emails.join(", "), required: false, maxlength: 200 },
      { name: "push", type: "checkbox", label: "Push auf diesem Gerät aktivieren", value: true },
    ],
  }) : null;
  try {
    const body = { elf: { name: s1.elfName, doorPlace: s1.doorPlace, character: s1.character } };
    if (s2) {
      const kids = String(s2.kids || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => { const m = s.match(/^(.*?)\s*\((\d{1,2})\)$/); return m ? { name: m[1].trim(), age: Number(m[2]) } : { name: s, age: "" }; });
      const parents = String(s2.parents || "").split(",").map((s) => s.trim()).filter(Boolean).map((name) => data.parents.find((p) => p.name === name) || { name });
      if (kids.length) body.children = kids;
      if (parents.length) body.parents = parents;
    }
    if (s3) body.notify = { enabled: true, time: s3.time, emails: String(s3.emails || "").split(",").map((s) => s.trim()).filter(Boolean) };
    await update("PUT", "/settings", body);
    if (s3?.push) await enablePush().catch(() => {});
    toast("Alles bereit. Viel Spaß mit " + data.elf.name + "!");
    if (data.parents.length > 1) askWhoAmI();
  } catch (err) {
    toast(err.message, true);
  }
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
  if (!tabs().includes(activeTab)) activeTab = "heute";
  const sec = (id, html) => (tabs().includes(id) ? `<section id="${id}" class="w-section ${activeTab === id ? "" : "hidden"}">${html}</section>` : "");
  app.innerHTML = [
    topBar(),
    sectionNav(),
    sec("heute", todayCard() + overviewCard()),
    sec("plan", planCard()),
    sec("ideen", feat().ideas ? setsCard() + ideasCard() : ""),
    sec("einkauf", feat().shopping ? shoppingCard() : ""),
    sec("post", postCard()),
    sec("wichtel", elfCard() + settingsCard() + linksCard()),
    `<p class="text-center text-xs text-slate-500 pb-6">Wichteltür · Advently</p>`,
  ].join("");
  bindEvents();
  if (firstRender) {
    firstRender = false;
    jumpToHash();
    onboarding().then(() => askWhoAmI());
  }
}

// One section at a time keeps the page short; the tab bar stays at the top.
function setTab(name, { scroll = true } = {}) {
  if (!tabs().includes(name)) return;
  activeTab = name;
  store.set(TAB_KEY, name);
  TABS.forEach((t) => document.getElementById(t)?.classList.toggle("hidden", t !== name));
  document.querySelectorAll(".w-secnav__item").forEach((a) => a.classList.toggle("is-active", a.dataset.tab === name));
  if (window.location.hash && window.location.hash !== `#${name}`) window.history.replaceState({}, "", window.location.pathname + `#${name}`);
  if (scroll) document.querySelector(".w-secnav")?.scrollIntoView({ block: "start" });
  if (name === "post" && data.unreadPost) {
    req("POST", "/post/read-all").then((d) => { data = d; render(); }).catch(() => {});
  }
}

function topBar() {
  const d = data;
  const m = me();
  return `<div class="flex flex-wrap items-center justify-between gap-2" id="w-nav">
    <div class="min-w-0"><p class="text-xs text-amber-300 uppercase tracking-widest font-semibold">Wichteltür ${d.year}</p><h1 class="w-title text-2xl truncate">${esc(d.title)}${d.isPro ? ` <span class="ui-pro-badge">PRO</span>` : ""}</h1></div>
    <div class="flex items-center gap-2">
      ${d.owner ? `<a href="/admin/wichteltuer.html" class="w-btn w-btn--ghost w-btn--sm">← Zurück</a>` : (window.history.length > 1 ? `<a href="#" data-act="back" class="w-btn w-btn--ghost w-btn--sm">← Zurück</a>` : "")}
      ${d.owner && !d.isPro ? `<button type="button" class="w-btn w-btn--sm w-btn--pro" data-act="upgrade">${UI.proButtonLabel(proPrice())}</button>` : ""}
      <button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="share-plan"><i data-icon="share-2"></i> Teilen</button>
      ${d.parents.length ? `<button type="button" class="t-avatar t-avatar--nav ${m ? "is-me" : ""}" data-act="who" title="${m ? `Du bist ${esc(m.name)} – tippen zum Wechseln` : "Wer bist du?"}" aria-label="Wer bin ich">${m ? esc(initials(m.name)) : "?"}</button>` : ""}
    </div>
  </div>`;
}

function sectionNav() {
  const items = [["heute", "sparkles", "Heute", 0], ["plan", "calendar", "Plan", data.stats.open], ["ideen", "lightbulb", "Ideen", 0], ["einkauf", "clipboard-list", "Einkauf", data.shopping.filter((i) => !i.checked && !i.have).length], ["post", "mail", "Post", data.unreadPost], ["wichtel", "door-open", "Wichtel", 0]].filter(([id]) => tabs().includes(id));
  return `<nav class="w-secnav" aria-label="Bereiche">${items.map(([id, ic, label, badge]) => `<a href="#${id}" data-tab="${id}" class="w-secnav__item ${activeTab === id ? "is-active" : ""}"><i data-icon="${ic}"></i><span>${label}</span>${badge ? `<span class="ui-badge ${id === "post" ? "" : "ui-badge--soft"}">${badge}</span>` : ""}</a>`).join("")}</nav>`;
}

// 24 dots: one per night, tappable.
function adventDots() {
  return `<div class="t-dots" aria-label="Die 24 Nächte">${data.days.map((x) => {
    const cls = x.entry?.done ? "is-done" : x.entry ? "is-planned" : "";
    const today = data.tonight?.date === x.date ? "is-today" : "";
    return `<button type="button" class="t-dot ${cls} ${today}" data-open-day="${x.date}" title="${x.day}. Dezember${x.entry ? ` – ${esc(x.entry.title)}` : " – frei"}"><span>${x.day}</span></button>`;
  }).join("")}</div>`;
}

// Short summary under the tonight card: what is next, where to click.
function overviewCard() {
  const d = data;
  const next = d.days.filter((x) => x.entry && !x.entry.done && x.date >= d.today).slice(0, 3);
  const openShop = d.shopping.filter((i) => !i.checked && !i.have).length;
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="clipboard-list"></i> Auf einen Blick</h2>
    ${adventDots()}
    <p class="text-xs text-slate-400 mt-2">${d.stats.planned} von 24 Nächten geplant${d.stats.done ? `, ${d.stats.done} erledigt` : ""}${d.stats.spent ? ` · bisher ${money(d.stats.spent)}` : ""}</p>
    <ul class="w-todo mt-3">
      <li class="${d.stats.open ? "" : "is-done"}">${d.stats.open ? icon("circle") : icon("circle-check")} <a href="#plan" data-tab="plan">${d.stats.open ? `${d.stats.open} Nächte noch ohne Idee` : "Alle 24 Nächte geplant"}</a></li>
      ${feat().shopping ? `<li class="${openShop ? "" : "is-done"}">${openShop ? icon("circle") : icon("circle-check")} <a href="#einkauf" data-tab="einkauf">${openShop ? `${openShop} Dinge einkaufen` : "Einkaufsliste erledigt"}</a></li>` : ""}
      <li class="${d.unreadPost ? "" : "is-done"}">${d.unreadPost ? icon("circle") : icon("circle-check")} <a href="#post" data-tab="post">${d.unreadPost ? `${d.unreadPost} Neues von den Kindern` : "Keine neue Post"}</a></li>
      <li class="${d.notify.pushDevices || d.notify.emails.length ? "is-done" : ""}">${d.notify.pushDevices || d.notify.emails.length ? icon("circle-check") : icon("circle")} <a href="#wichtel" data-tab="wichtel">${d.notify.pushDevices || d.notify.emails.length ? "Abendliche Erinnerung ist eingerichtet" : "Abendliche Erinnerung einrichten"}</a></li>
      <li class="${d.children.length ? "is-done" : ""}">${d.children.length ? icon("circle-check") : icon("circle")} <a href="#wichtel" data-tab="wichtel">${d.children.length ? `Kinder: ${d.children.map((c) => esc(c.name)).join(", ")}` : "Kinder eintragen, damit die Ideen zum Alter passen"}</a></li>
    </ul>
    ${next.length ? `<h3 class="text-xs uppercase tracking-wider text-slate-400 mt-4 mb-2">Die nächsten Nächte</h3><div class="space-y-2">${next.map((x) => dayRow(x, false)).join("")}</div>` : ""}
  </div>`;
}

function catChip(cat) {
  return `<span class="t-cat t-cat--${esc(cat)}"><i data-icon="${catIcon[cat] || "gift"}"></i> ${esc(data.categories[cat] || cat)}</span>`;
}

// Tonight: the one card that matters in the evening.
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
        ${d.stats.open && feat().ideas ? `<button type="button" class="w-btn w-btn--primary w-btn--sm" data-act="autoplan"><i data-icon="sparkles"></i> ${d.stats.planned ? "Lücken automatisch füllen" : "Alle 24 Nächte automatisch planen"}</button>` : ""}
        ${feat().shopping ? `<a href="#einkauf" data-tab="einkauf" class="w-btn w-btn--ghost w-btn--sm"><i data-icon="clipboard-list"></i> Einkaufsliste</a>` : ""}
        ${after ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-recap"><i data-icon="printer"></i> Album drucken</button>${d.viewLink ? `<a href="${esc(d.viewLink)}" target="_blank" class="w-btn w-btn--ghost w-btn--sm"><i data-icon="eye"></i> Album ansehen</a>` : ""}` : ""}
      </div>
    </div>`;
  }
  const e = t?.entry;
  const mine = e?.assignee && e.assignee === meId();
  const steps = e?.steps || [];
  return `<div class="w-card w-card--tonight t-tonight">
    <p class="text-xs text-amber-300 uppercase tracking-widest font-semibold">Heute Nacht · für den ${t ? t.day : "?"}. Dezember</p>
    <h2 class="t-tonight__title mt-1">${e ? esc(e.title) : "Noch nichts geplant"}</h2>
    ${e ? `
      <div class="flex flex-wrap items-center gap-2 mt-2">${catChip(e.category)}${e.minutes ? `<span class="w-chip"><i data-icon="clock"></i> ${e.minutes} Min.</span>` : ""}${e.assigneeName ? `<span class="w-chip ${mine ? "text-amber-300" : ""}"><i data-icon="user"></i> ${mine ? "Du bist dran" : esc(e.assigneeName)}</span>` : ""}</div>
      <p class="text-base text-slate-100 mt-3 whitespace-pre-line leading-relaxed">${esc(e.text)}</p>
      ${e.materials.length ? `<ul class="t-checklist mt-3">${e.materials.map((m) => { const s = d.shopping.find((i) => i.key === m.trim().toLowerCase()); const ok = !feat().shopping || !s || s.checked || s.have; return `<li class="${ok ? "is-ok" : ""}">${ok ? icon("circle-check") : icon("circle")} ${esc(m)}${!ok ? ` <small>noch kaufen</small>` : ""}</li>`; }).join("")}</ul>` : ""}
      ${steps.length ? `<h3 class="text-xs uppercase tracking-wider text-slate-400 mt-3 mb-1">Vorbereitung</h3><div class="space-y-1">${steps.map((s) => `<label class="w-check"><input type="checkbox" data-step="${t.date}" data-step-id="${esc(s.id)}" ${s.done ? "checked" : ""}> <span class="${s.done ? "line-through text-slate-400" : ""}">${esc(s.text)}</span></label>`).join("")}</div>` : ""}
      ${e.note ? `<p class="text-xs text-amber-200 mt-2"><i data-icon="pencil"></i> ${esc(e.note)}</p>` : ""}
      ${e.letter ? `<div class="t-letter t-letter--elf mt-3">${esc(e.letter)}</div>` : ""}
      <div class="flex flex-wrap gap-2 mt-4">
        <button type="button" class="w-btn ${e.done ? "w-btn--ghost" : "w-btn--primary"} t-done-btn" data-toggle-done="${t.date}" data-done-now="${e.done ? "1" : "0"}"><i data-icon="${e.done ? "circle-check" : "check"}"></i> ${e.done ? "Erledigt ✓ (zurücknehmen)" : "Erledigt!"}</button>
        <button type="button" class="w-btn w-btn--ghost w-btn--sm" data-open-day="${t.date}"><i data-icon="pencil"></i> Bearbeiten</button>
        ${e.letter ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-print-letter="${t.date}"><i data-icon="printer"></i> Brief drucken</button>` : ""}
        <label class="w-btn w-btn--ghost w-btn--sm"><i data-icon="camera"></i> Foto<input type="file" accept="image/*" capture="environment" class="sr-only" data-photo="${t.date}"></label>
      </div>`
      : `<p class="text-sm text-slate-300 mt-2">${esc(d.elf.name)} braucht eine Idee für heute Nacht.</p><div class="flex flex-wrap gap-2 mt-3"><button type="button" class="w-btn w-btn--primary w-btn--sm" data-open-day="${t ? t.date : ""}"><i data-icon="lightbulb"></i> Idee wählen</button>${feat().ideas ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="autoplan"><i data-icon="sparkles"></i> Automatisch füllen</button>` : ""}</div>`}
    ${d.prepTomorrow.length ? `<div class="mt-4 bg-black/25 rounded-xl p-3 text-sm"><b class="text-amber-200"><i data-icon="triangle-alert"></i> Morgen vorbereiten:</b> ${d.prepTomorrow.map((p) => `${esc(p.entry.title)}${p.entry.materials.length ? ` (${p.entry.materials.map(esc).join(", ")})` : ""}`).join("; ")}</div>` : ""}
  </div>`;
}

function planCard() {
  const d = data;
  const mineId = meId();
  const rows = d.days.filter((x) => planFilter === "alle" ? true : planFilter === "offen" ? !x.entry || !x.entry.done : x.entry?.assignee === mineId);
  return `<div class="w-card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="w-title text-xl"><i data-icon="calendar"></i> Der Plan</h2>
      <div class="flex gap-2">${d.stats.open && feat().ideas ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="autoplan"><i data-icon="sparkles"></i> Lücken füllen</button>` : ""}<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-plan" title="Plan drucken"><i data-icon="printer"></i></button></div>
    </div>
    <p class="text-sm text-slate-400 mt-1">Jede Zeile ist der Morgen, an dem die Kinder es entdecken. Tippe auf einen Tag, halte ihn gedrückt, um ihn mit einem anderen zu tauschen.</p>
    <div class="t-filter mt-3" id="plan-filter"><button type="button" data-plan-filter="alle" class="${planFilter === "alle" ? "is-active" : ""}">Alle</button>${d.parents.length > 1 && mineId ? `<button type="button" data-plan-filter="meine" class="${planFilter === "meine" ? "is-active" : ""}">Meine Tage</button>` : ""}<button type="button" data-plan-filter="offen" class="${planFilter === "offen" ? "is-active" : ""}">Nur offene</button></div>
    ${swapFrom ? `<div class="t-swapbar mt-3"><i data-icon="shuffle"></i> ${Number(swapFrom.slice(8))}. Dezember aufgenommen – tippe auf den Tag, mit dem du tauschen willst. <button type="button" data-act="swap-cancel">Abbrechen</button></div>` : ""}
    <div class="space-y-2 mt-3" id="plan-rows">${rows.map((day) => dayRow(day)).join("") || `<p class="text-sm text-slate-500">Nichts in dieser Ansicht.</p>`}</div>
  </div>`;
}

function dayRow(day, withId = true) {
  const e = day.entry;
  const tonight = data.tonight?.date === day.date;
  const cls = ["t-day", e ? `t-day--${e.category}` : "", e ? "" : "is-empty", e?.done ? "is-done" : "", day.weekend ? "is-weekend" : "", tonight ? "is-today" : "", day.date < data.today ? "is-past" : "", swapFrom === day.date ? "is-picked" : "", swapFrom && swapFrom !== day.date ? "is-swap-target" : ""].filter(Boolean).join(" ");
  const mine = e?.assignee && e.assignee === meId();
  return `<div class="${cls}" data-open-day="${day.date}" ${withId ? `id="tag-${day.date}" draggable="true"` : ""} role="button" tabindex="0">
    <div class="t-day__num">${day.day}<small>${day.weekday}</small></div>
    <div class="min-w-0">
      <div class="t-day__title">${e ? esc(e.title) : `<span class="text-slate-500">Noch frei${tonight ? " – heute Nacht!" : ""}</span>`}</div>
      ${e ? `<div class="t-day__meta">${catChip(e.category)}${e.minutes ? `<span><i data-icon="clock"></i> ${e.minutes} Min.</span>` : ""}${e.prepDayBefore ? `<span class="text-amber-300"><i data-icon="triangle-alert"></i> vorbereiten</span>` : ""}${e.letter ? `<span><i data-icon="mail"></i></span>` : ""}${e.photo ? `<span><i data-icon="image"></i></span>` : ""}${e.kidHint ? `<span title="Morgen-Hinweis"><i data-icon="eye"></i></span>` : ""}${e.price ? `<span>${money(e.price)}</span>` : ""}</div>` : ""}
    </div>
    <div class="t-day__right">${e?.letter ? `<button type="button" class="t-day__print" data-print-letter="${day.date}" title="Brief drucken" aria-label="Brief vom ${day.day}. Dezember drucken"><i data-icon="printer"></i></button>` : ""}${e?.assigneeName ? `<span class="t-avatar ${mine ? "is-me" : ""}" title="${esc(e.assigneeName)}">${esc(initials(e.assigneeName))}</span>` : ""}${e && withId ? `<label class="t-day__done" title="${e.done ? "Erledigt" : "Als erledigt markieren"}"><input type="checkbox" data-done="${day.date}" ${e.done ? "checked" : ""} aria-label="Erledigt"></label>` : e?.done ? icon("circle-check", "text-emerald-300") : ""}</div>
  </div>`;
}

// Ready-made month plans (PRO).
function setsCard() {
  if (!sets) return "";
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="sparkles"></i> Fertige Monatspläne</h2>
    <p class="text-sm text-slate-400 mt-1">Ein Tipp füllt ${data.stats.open ? `die ${data.stats.open} freien Nächte` : "den Monat"} – passend zum Alter der Kinder. Danach lässt sich jeder Tag ändern.</p>
    <div class="grid sm:grid-cols-2 gap-2 mt-3">${sets.map((s) => `<button type="button" class="t-set" data-set="${esc(s.id)}"><b>${esc(s.title)}</b><span>${esc(s.desc)}</span></button>`).join("")}</div>
  </div>`;
}

function ideasCard() {
  if (!ideas) return `<div class="w-card"><h2 class="w-title text-xl"><i data-icon="lightbulb"></i> Ideen</h2><p class="text-sm text-slate-400 mt-2">Lade Bibliothek …</p></div>`;
  const used = new Set(data.days.map((d) => d.entry?.ideaId).filter(Boolean));
  const ages = data.children.map((c) => c.age).filter((a) => a !== null);
  const fits = (i) => !ages.length || (i.ageMax >= Math.min(...ages) && i.ageMin <= Math.max(...ages));
  const q = ideaFilter.q.toLowerCase();
  const all = ideas.filter((i) => (!ideaFilter.cat || (ideaFilter.cat === "eigene" ? i.custom : i.category === ideaFilter.cat)) && (!q || `${i.title} ${i.text} ${i.materials.join(" ")}`.toLowerCase().includes(q)));
  const limit = ideaFilter.all || ideaFilter.cat || q ? all.length : 8;
  const list = all.slice(0, limit);
  const own = ideas.filter((i) => i.custom).length;
  return `<div class="w-card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="w-title text-xl"><i data-icon="lightbulb"></i> Ideen-Bibliothek <span class="text-sm font-normal text-slate-400">(${ideas.length})</span></h2>
      <button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="new-idea"><i data-icon="pencil"></i> Eigene Idee</button>
    </div>
    <p class="text-sm text-slate-400 mt-1">Aufwand, Material und Alter stehen dabei. „Einplanen“ legt die Idee auf einen freien Tag. Eigene Ideen bleiben für nächstes Jahr gespeichert.</p>
    <input id="idea-search" class="w-input mt-3" placeholder="Suchen: Mehl, Brief, Rätsel …" value="${esc(ideaFilter.q)}">
    <div class="t-filter mt-2" id="idea-filter"><button type="button" data-cat="" class="${ideaFilter.cat ? "" : "is-active"}">Alle</button>${own ? `<button type="button" data-cat="eigene" class="${ideaFilter.cat === "eigene" ? "is-active" : ""}">Eigene (${own})</button>` : ""}${Object.entries(data.categories).map(([k, v]) => `<button type="button" data-cat="${k}" class="${ideaFilter.cat === k ? "is-active" : ""}">${esc(v)}</button>`).join("")}</div>
    <div class="grid sm:grid-cols-2 gap-2 mt-3">${list.map((i) => `<div class="t-idea ${used.has(i.id) ? "is-used" : ""} ${i.custom ? "t-idea--own" : ""}">
      <div class="t-idea__head"><div class="t-idea__title">${i.custom ? `<i data-icon="star"></i> ` : ""}${esc(i.title)}</div>${catChip(i.category)}</div>
      <div class="t-idea__text">${esc(i.text)}</div>
      <div class="t-day__meta"><span><i data-icon="clock"></i> ${i.minutes} Min.</span><span><i data-icon="user"></i> ${i.ageMin}–${i.ageMax} J.</span>${i.prepDayBefore ? `<span class="text-amber-300"><i data-icon="triangle-alert"></i> Vortag</span>` : ""}${i.weekend ? `<span><i data-icon="calendar"></i> Wochenende</span>` : ""}${!fits(i) ? `<span class="text-rose-300">passt nicht zum Alter</span>` : ""}</div>
      ${i.materials.length ? `<div class="text-xs text-slate-400">Material: ${i.materials.map(esc).join(", ")}</div>` : ""}
      <div class="flex gap-2 mt-1"><button type="button" class="w-btn w-btn--primary w-btn--sm" data-plan-idea="${esc(i.id)}"><i data-icon="calendar"></i> ${used.has(i.id) ? "Nochmal einplanen" : "Einplanen"}</button>${i.letter ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-idea-letter="${esc(i.id)}" title="Brief ansehen"><i data-icon="mail"></i></button>` : ""}${i.custom ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-del-idea="${esc(i.id)}" title="Eigene Idee löschen"><i data-icon="trash-2"></i></button>` : ""}</div>
    </div>`).join("") || `<p class="text-sm text-slate-500 col-span-full">Nichts gefunden.</p>`}</div>
    ${all.length > list.length ? `<button type="button" class="w-btn w-btn--ghost w-full mt-3" data-act="ideas-all">Alle ${all.length} Ideen anzeigen</button>` : ""}
  </div>`;
}

function shoppingCard() {
  const list = data.shopping;
  const stock = list.filter((i) => i.have);
  const active = list.filter((i) => !i.have);
  const weeks = {};
  for (const i of active) (weeks[i.week] = weeks[i.week] || []).push(i);
  const label = (w) => (w === 0 ? "Eigene Einträge" : `Woche ${w} · ${(w - 1) * 7 + 1}.–${Math.min(24, w * 7)}. Dezember`);
  const open = active.filter((i) => !i.checked).length;
  const st = data.stats;
  const pct = st.budget ? Math.min(100, Math.round((st.spent / st.budget) * 100)) : 0;
  return `<div class="w-card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="w-title text-xl"><i data-icon="clipboard-list"></i> Einkaufsliste <span class="text-sm font-normal text-slate-400">(${open} offen)</span></h2>
      <div class="flex gap-2"><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="share-shopping" title="Teilen"><i data-icon="share-2"></i></button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-shopping" title="Drucken"><i data-icon="printer"></i></button></div>
    </div>
    <p class="text-sm text-slate-400 mt-1">Aus allen geplanten Nächten, nach Wochen sortiert. Was ihr schon habt, kommt in den Vorrat. Erledigte Nächte verschwinden von selbst.</p>
    ${st.spent || st.budget ? `<div class="t-budget mt-3"><div class="flex justify-between text-sm"><span><i data-icon="wallet"></i> Kosten: <b>${money(st.spent)}</b></span>${st.budget ? `<span class="${st.spent > st.budget ? "text-rose-300" : "text-slate-400"}">Budget ${money(st.budget)}</span>` : `<button type="button" class="text-xs text-amber-300 underline" data-tab="wichtel">Budget festlegen</button>`}</div>${st.budget ? `<div class="w-progress mt-1"><div style="width:${pct}%${st.spent > st.budget ? ";background:#e11d48" : ""}"></div></div>` : ""}</div>` : ""}
    ${Object.keys(weeks).sort((a, b) => (a === "0" ? 1 : b === "0" ? -1 : a - b)).map((w) => `<h3 class="text-xs uppercase tracking-wider text-slate-400 mt-4 mb-1">${label(Number(w))}</h3>${weeks[w].map((i) => `<label class="t-shop ${i.checked ? "is-checked" : ""}"><input type="checkbox" data-shop="${esc(i.key)}" ${i.checked ? "checked" : ""}><span class="flex-1">${esc(i.text)}</span>${i.dates.length ? `<small>${i.dates.map((x) => `${Number(x.slice(8))}.`).join(" ")}</small>` : ""}${i.custom ? `<button type="button" class="text-slate-500 hover:text-rose-300" data-shop-del="${esc(i.id)}" title="Entfernen"><i data-icon="x"></i></button>` : `<button type="button" class="text-slate-500 hover:text-amber-300" data-shop-have="${esc(i.key)}" title="Haben wir schon – in den Vorrat"><i data-icon="package"></i></button>`}</label>`).join("")}`).join("") || emptyState("clipboard-list", "Noch nichts zu kaufen – plane zuerst ein paar Nächte.")}
    <form id="shop-form" class="flex gap-2 mt-4"><input name="text" maxlength="80" required class="w-input" placeholder="Eigener Eintrag, z. B. Batterien"><button class="w-btn w-btn--primary" aria-label="Hinzufügen"><i data-icon="check"></i></button></form>
    ${active.some((i) => i.checked) ? `<button type="button" class="text-xs text-slate-400 hover:text-white mt-3" data-act="clear-checked"><i data-icon="trash-2"></i> Abgehakte entfernen</button>` : ""}
    ${stock.length ? `<details class="w-details mt-4"><summary><i data-icon="package"></i> Vorrat – haben wir schon (${stock.length})</summary><div class="mt-2">${stock.map((i) => `<div class="t-shop"><i data-icon="package"></i><span class="flex-1 text-slate-300">${esc(i.text)}</span><button type="button" class="text-xs text-amber-300 underline" data-shop-unhave="${esc(i.key)}">doch kaufen</button></div>`).join("")}</div></details>` : ""}
  </div>`;
}

function postCard() {
  const d = data;
  const post = d.post;
  const R = { heart: "❤️", laugh: "😂", wow: "😮" };
  const row = (l) => {
    if (l.from !== "kid") return `<div class="t-letter t-letter--elf">${esc(l.text)}<small>${esc(d.elf.name)}${l.childName ? ` an ${esc(l.childName)}` : ""} · ${formatDate(l.at.slice(0, 10))}</small><div class="t-letter__actions"><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-print-post="${esc(l.id)}"><i data-icon="printer"></i> Drucken</button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-del-post="${esc(l.id)}"><i data-icon="x"></i></button></div></div>`;
    const actions = `<div class="t-letter__actions">${feat().letters ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-reply="${esc(l.id)}" data-child="${esc(l.childId || "")}"><i data-icon="pen-line"></i> Antworten</button>` : ""}<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-del-post="${esc(l.id)}"><i data-icon="x"></i></button></div>`;
    if (l.kind === "reaction") return `<div class="t-letter t-letter--kid t-letter--reaction ${l.read ? "" : "t-letter--unread"}"><span class="t-reaction-big">${R[l.reaction] || "❤️"}</span> ${esc(l.childName || "Ein Kind")} hat auf den ${esc(l.refLabel || "Brief")} reagiert.<small>${formatDate(l.at.slice(0, 10))}</small>${actions}</div>`;
    if (l.kind === "voice") return `<div class="t-letter t-letter--kid ${l.read ? "" : "t-letter--unread"}"><b><i data-icon="mic"></i> Sprachnachricht</b><audio controls preload="none" src="${esc(l.audio)}" class="t-audio mt-2"></audio><small>${esc(l.childName || "Kind")} · ${formatDate(l.at.slice(0, 10))}</small>${actions}</div>`;
    return `<div class="t-letter t-letter--kid ${l.read ? "" : "t-letter--unread"}">${esc(l.text)}<small>${esc(l.childName || "Kind")} · ${formatDate(l.at.slice(0, 10))}</small>${actions}</div>`;
  };
  return `<div class="w-card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="w-title text-xl"><i data-icon="mail"></i> Wichtelpost ${d.unreadPost ? `<span class="ui-badge">${d.unreadPost}</span>` : ""}</h2>
      ${feat().letters ? `<button type="button" class="w-btn w-btn--primary w-btn--sm" data-act="write-post"><i data-icon="pen-line"></i> Brief an die Kinder</button>` : ""}
    </div>
    <p class="text-sm text-slate-400 mt-1">Briefe, Sprachnachrichten und Reaktionen der Kinder von der Kinderseite${feat().letters ? ` und die Antworten von ${esc(d.elf.name)}. Antworten erscheinen sofort auf der Kinderseite.` : "."}</p>
    <div class="space-y-3 mt-3">${post.length ? post.map(row).join("") : emptyState("mail", "Noch keine Post. Teile die Kinderseite, dann können die Kinder schreiben.")}</div>
  </div>`;
}

// The elf's door shows the character: a sign, a wreath, a lost sock or curious eyes.
function doorHtml(character, size = "small") {
  const c = ["frech", "lieb", "verpeilt", "neugierig"].includes(character) ? character : "frech";
  return `<div class="t-door t-door--${c} t-door--${size}" aria-hidden="true"><div class="t-door__frame"></div><div class="t-door__window"><span class="t-door__eyes"></span></div><div class="t-door__knob"></div><div class="t-door__wreath"></div><div class="t-door__sign">Psst!</div><div class="t-door__sock"></div><div class="t-door__mat"></div></div>`;
}

function elfCard() {
  const d = data;
  return `<div class="w-card w-card--elf">
    <div class="flex items-center gap-5">
      ${doorHtml(d.elf.character, "small")}
      <div class="min-w-0"><p class="text-xs text-rose-300 uppercase tracking-widest font-semibold">Euer Wichtel</p><h2 class="w-title text-2xl">${esc(d.elf.name)}</h2><p class="text-sm text-slate-300">${esc({ frech: "frech und verspielt", lieb: "lieb und hilfsbereit", verpeilt: "ein bisschen verpeilt", neugierig: "neugierig und vorwitzig" }[d.elf.character] || "")}${d.elf.doorPlace ? ` · Tür: ${esc(d.elf.doorPlace)}` : ""}</p>
      <p class="text-xs text-slate-400 mt-1">Kinder: ${d.children.length ? d.children.map((c) => `${esc(c.name)}${c.age !== null ? ` (${c.age})` : ""}`).join(", ") : "noch keine eingetragen"}</p></div>
    </div>
  </div>`;
}

function settingsCard() {
  const d = data;
  const rows = (list, name, extra) => list.map((x, i) => `<div class="flex gap-2 items-center"><input name="${name}_name_${i}" value="${esc(x.name)}" maxlength="40" class="w-input" placeholder="Name"><input type="hidden" name="${name}_id_${i}" value="${esc(x.id)}">${extra ? `<input name="${name}_age_${i}" type="number" min="0" max="18" value="${x.age ?? ""}" class="w-input" style="width:80px" placeholder="Alter">` : ""}</div>`).join("");
  const rule = d.assignRule || { mode: "manual", weekdays: {} };
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="settings"></i> Einstellungen</h2>
    <form id="settings-form" class="space-y-4 mt-3">
      <div class="grid sm:grid-cols-2 gap-2">
        <label class="ui-field"><span class="ui-field__label">Titel</span><input name="title" value="${esc(d.title)}" maxlength="80" class="w-input"></label>
        <label class="ui-field"><span class="ui-field__label">Name des Wichtels</span><input name="elfName" value="${esc(d.elf.name)}" maxlength="40" class="w-input"></label>
        <label class="ui-field"><span class="ui-field__label">Charakter</span><select name="character" class="w-input">${[["frech", "Frech"], ["lieb", "Lieb"], ["verpeilt", "Verpeilt"], ["neugierig", "Neugierig"]].map(([v, l]) => `<option value="${v}" ${d.elf.character === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="ui-field"><span class="ui-field__label">Wo steht die Tür?</span><input name="doorPlace" value="${esc(d.elf.doorPlace)}" maxlength="80" class="w-input" placeholder="z. B. im Flur neben der Küche"></label>
      </div>
      <label class="w-check"><input type="checkbox" name="swissMode" ${d.swissMode ? "checked" : ""}> <span>Schweizer Modus <span class="text-slate-500">– Christkind statt Weihnachtsmann, Samichlaus statt Nikolaus. Gilt für Ideen, Vorlagen und alle schon geschriebenen Briefe.</span></span></label>
      <div><span class="ui-field__label">Kinder <span class="text-slate-500">(Name, Alter – die Ideen passen sich an)</span></span><div class="space-y-2" id="children-rows">${rows(d.children, "child", true)}</div><button type="button" class="text-xs text-amber-300 mt-2" data-act="add-child">+ Kind hinzufügen</button></div>
      <div><span class="ui-field__label">Eltern / Helfer <span class="text-slate-500">(wer ist dran)</span></span><div class="space-y-2" id="parent-rows">${rows(d.parents, "parent", false)}</div><button type="button" class="text-xs text-amber-300 mt-2" data-act="add-parent">+ Person hinzufügen</button></div>
      ${d.parents.length > 1 ? `<div class="border-t border-white/10 pt-3">
        <span class="ui-field__label">Wer ist dran? <span class="text-slate-500">(automatische Verteilung)</span></span>
        <div class="grid sm:grid-cols-2 gap-2">
          <label class="ui-field"><select name="assignMode" class="w-input" id="assign-mode"><option value="manual" ${rule.mode === "manual" ? "selected" : ""}>Von Hand pro Tag</option><option value="alternate" ${rule.mode === "alternate" ? "selected" : ""}>Abwechselnd, Tag für Tag</option><option value="weekdays" ${rule.mode === "weekdays" ? "selected" : ""}>Feste Wochentage</option></select></label>
          <button type="button" class="w-btn w-btn--ghost self-start" data-act="assign-now"><i data-icon="shuffle"></i> Jetzt verteilen</button>
        </div>
        <div id="assign-weekdays" class="${rule.mode === "weekdays" ? "" : "hidden"} space-y-2 mt-2">${d.parents.map((p) => `<div class="flex flex-wrap items-center gap-1 text-sm"><span class="w-24 text-slate-300">${esc(p.name)}</span>${WEEKDAYS.map((w, i) => `<label class="t-wd ${(rule.weekdays?.[p.id] || []).includes(i) ? "is-on" : ""}"><input type="checkbox" name="wd_${esc(p.id)}_${i}" class="sr-only" ${(rule.weekdays?.[p.id] || []).includes(i) ? "checked" : ""}>${w}</label>`).join("")}</div>`).join("")}</div>
        <p class="text-xs text-slate-500 mt-1">„Jetzt verteilen“ füllt nur Tage ohne Zuteilung. Beim Speichern mit einer Regel ebenfalls.</p>
      </div>` : ""}
      <div class="border-t border-white/10 pt-3 grid sm:grid-cols-2 gap-2">
        <label class="ui-field"><span class="ui-field__label">Budget für den Monat (CHF, optional)</span><input name="budget" type="number" min="0" step="1" value="${d.budget || ""}" class="w-input" placeholder="z. B. 80"></label>
        <p class="text-xs text-slate-500 self-end pb-2">Kosten trägst du pro Tag im Tagesdialog ein. Die Summe steht in der Einkaufsliste.</p>
      </div>
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
      <div><b class="text-white">Nur lesen – für Grosseltern und Babysitter</b><p class="text-xs text-slate-400 mt-0.5">Zeigt Plan, Fotos, Reaktionen und die Wichtelpost, ohne dass etwas geändert werden kann. Nach dem 24. wird daraus das Album.</p>
        ${d.viewLink ? `<p class="text-xs text-slate-400 break-all mt-1 bg-black/20 rounded-lg p-2 font-mono">${esc(d.viewLink)}</p>
        <div class="flex flex-wrap gap-2 mt-2"><a href="${esc(d.viewLink)}" target="_blank" class="w-btn w-btn--ghost w-btn--sm"><i data-icon="eye"></i> Ansehen</a><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="copy-view"><i data-icon="copy"></i> Kopieren</button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="share-view"><i data-icon="share-2"></i> Teilen</button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="rotate-view"><i data-icon="refresh-cw"></i> Erneuern</button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="delete-view"><i data-icon="x"></i> Deaktivieren</button></div>`
        : `<div class="mt-2"><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="rotate-view"><i data-icon="link"></i> Nur-Lesen-Link erstellen</button></div>`}</div>
      <div><b class="text-white">Kalender</b><p class="text-xs text-slate-400 mt-0.5">Alle geplanten Nächte als Termine, mit Erinnerung am Vorabend um ${esc(d.notify.time)}. Öffnen mit Apple Kalender, Google Kalender oder Outlook.</p>
        <div class="flex flex-wrap gap-2 mt-2"><a href="${API}/plan.ics" download="wichteltuer-${d.year}.ics" class="w-btn w-btn--ghost w-btn--sm"><i data-icon="calendar"></i> Als Kalender (ICS) laden</a></div></div>
      <div><b class="text-white">Drucken</b><div class="flex flex-wrap gap-2 mt-2"><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-plan"><i data-icon="printer"></i> Plan</button>${feat().shopping ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-shopping"><i data-icon="printer"></i> Einkaufsliste</button>` : ""}<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-letters"><i data-icon="printer"></i> Alle Briefe (Mini-Format)</button><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="print-recap"><i data-icon="printer"></i> Album / Rückblick</button></div></div>
      ${d.owner ? `<div class="border-t border-white/10 pt-3 flex flex-wrap gap-2"><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="rollover"><i data-icon="refresh-cw"></i> Ins nächste Jahr übernehmen</button><button type="button" class="w-btn w-btn--sm" style="background:rgba(225,29,72,.15);color:#fda4af" data-act="delete-plan"><i data-icon="trash-2"></i> Wichteltür endgültig löschen</button></div>` : ""}
    </div>
  </div>`;
}

function emptyState(iconName, text) {
  const art = { mail: `<svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2"><rect x="10" y="22" width="44" height="30" rx="4"/><path d="M10 26l22 14 22-14"/><path d="M32 8v10M26 14l6-6 6 6" stroke="#fbbf24"/></svg>`, "clipboard-list": `<svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2"><rect x="14" y="10" width="36" height="46" rx="4"/><path d="M24 8h16v6H24z" fill="#fbbf24" stroke="#fbbf24"/><path d="M22 28h6M22 38h6M22 48h6" stroke="#fbbf24"/><path d="M32 28h10M32 38h10M32 48h10"/></svg>`, "door-open": `<svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 56V16a14 14 0 0 1 28 0v40z"/><circle cx="32" cy="22" r="5" fill="#fbbf24" stroke="#fbbf24"/><circle cx="40" cy="38" r="2" fill="#fbbf24"/><path d="M12 56h40"/></svg>` };
  return `<div class="ui-empty"><div class="ui-empty__art ui-empty__art--svg">${art[iconName] || `<i data-icon="${iconName}"></i>`}</div>${text}</div>`;
}
function icon(name, cls = "") {
  return `<i data-icon="${name}" class="${cls}"></i>`;
}

// ── Day editor ──────────────────────────────────────────────────────────────
async function openDay(date) {
  const day = data.days.find((x) => x.date === date);
  if (!day) return;
  if (!ideas && feat().ideas) await loadLibrary();
  const idx = data.days.indexOf(day);
  const e = day.entry || { ideaId: null, title: "", category: "streich", text: "", materials: [], minutes: 10, prepDayBefore: false, assignee: null, note: "", letter: "", letterVisibleToKids: false, photo: null, photoVisibleToKids: false, reaction: "", done: false, kidHint: "", price: 0, steps: [] };
  const ideaOptions = [`<option value="">– eigene Idee –</option>`].concat((ideas || []).some((i) => i.custom) ? [`<optgroup label="Eigene Ideen">${ideas.filter((i) => i.custom).map((i) => `<option value="${esc(i.id)}" ${e.ideaId === i.id ? "selected" : ""}>${esc(i.title)}</option>`).join("")}</optgroup>`] : []).concat(Object.entries(data.categories).map(([k, v]) => `<optgroup label="${esc(v)}">${(ideas || []).filter((i) => !i.custom && i.category === k).map((i) => `<option value="${esc(i.id)}" ${e.ideaId === i.id ? "selected" : ""}>${esc(i.title)} (${i.minutes} Min.)</option>`).join("")}</optgroup>`)).join("");
  const hasMore = Boolean(e.letter || e.note || e.photo || e.reaction || e.kidHint || e.price || (e.steps || []).length);
  const body = `
    <div class="t-daynav"><button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-day-prev ${idx === 0 ? "disabled" : ""}>‹ ${idx > 0 ? `${data.days[idx - 1].day}.` : ""}</button><span class="text-xs text-slate-400">${weekdayLong(date)}${e.done ? " · erledigt" : ""}</span><button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-day-next ${idx === data.days.length - 1 ? "disabled" : ""}>${idx < data.days.length - 1 ? `${data.days[idx + 1].day}.` : ""} ›</button></div>
    ${feat().ideas ? `<label class="ui-field"><span class="ui-field__label">Idee aus der Bibliothek</span><select name="ideaId" class="ui-input" data-idea-select>${ideaOptions}</select></label>` : ""}
    <label class="ui-field"><span class="ui-field__label">Titel</span><input name="title" class="ui-input" value="${esc(e.title)}" maxlength="100" required></label>
    <div class="grid grid-cols-2 gap-2">
      <label class="ui-field"><span class="ui-field__label">Art</span><select name="category" class="ui-input">${Object.entries(data.categories).map(([k, v]) => `<option value="${k}" ${e.category === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
      <label class="ui-field"><span class="ui-field__label">Wer ist dran?</span><select name="assignee" class="ui-input"><option value="">– offen –</option>${data.parents.map((p) => `<option value="${esc(p.id)}" ${e.assignee === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
    </div>
    <label class="ui-field"><span class="ui-field__label">Was ist zu tun?</span><textarea name="text" class="ui-input" rows="3" maxlength="2000">${esc(e.text)}</textarea></label>
    <label class="ui-field"><span class="ui-field__label">Material (mit Komma trennen)</span><input name="materials" class="ui-input" value="${esc(e.materials.join(", "))}"></label>
    <label class="ui-check"><input type="checkbox" name="done" ${e.done ? "checked" : ""}> <span>Erledigt</span></label>
    <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm w-full" data-more>${hasMore ? "Weniger" : "Mehr: Brief, Vorbereitung, Foto, Notiz …"}</button>
    <div data-more-box class="${hasMore ? "" : "hidden"} space-y-2 mt-2">
      <div class="grid grid-cols-3 gap-2">
        <label class="ui-field"><span class="ui-field__label">Aufwand (Min.)</span><input name="minutes" type="number" min="0" max="600" class="ui-input" value="${e.minutes || 0}"></label>
        <label class="ui-field"><span class="ui-field__label">Kosten (CHF)</span><input name="price" type="number" min="0" step="0.5" class="ui-input" value="${e.price || ""}" placeholder="0"></label>
        <label class="ui-check" style="margin-top:18px"><input type="checkbox" name="prepDayBefore" ${e.prepDayBefore ? "checked" : ""}> <span>Vortag</span></label>
      </div>
      <label class="ui-field"><span class="ui-field__label">Vorbereitung – ein Schritt pro Zeile</span><textarea name="steps" class="ui-input" rows="3" maxlength="1500" placeholder="Teig vorbereiten&#10;Zettel schreiben&#10;Kamera bereitlegen">${esc((e.steps || []).map((s) => s.text).join("\n"))}</textarea></label>
      <label class="ui-field"><span class="ui-field__label">Notiz für uns</span><input name="note" class="ui-input" value="${esc(e.note)}" maxlength="500" placeholder="z. B. Kamera bereitlegen"></label>
      <label class="ui-field"><span class="ui-field__label">Morgen-Hinweis für die Kinderseite <span class="text-slate-500">(erscheint nur an diesem Tag ab 6 Uhr)</span></span><input name="kidHint" class="ui-input" value="${esc(e.kidHint || "")}" maxlength="200" placeholder="z. B. Schaut mal in die Küche!"></label>
      ${feat().letters ? `<div class="ui-field"><span class="ui-field__label">Brief vom Wichtel <button type="button" class="text-amber-300 underline" data-letter-template>Vorlage einsetzen</button>${e.letter ? ` · <button type="button" class="text-amber-300 underline" data-print-day-letter>Drucken</button>` : ""}</span><textarea name="letter" class="ui-input" rows="4" maxlength="2000" placeholder="Leer lassen, wenn es keinen Brief gibt">${esc(e.letter)}</textarea></div>
      <label class="ui-check"><input type="checkbox" name="letterVisibleToKids" ${e.letterVisibleToKids ? "checked" : ""}> <span>Brief ab diesem Morgen auch auf der Kinderseite zeigen</span></label>` : ""}
      ${e.photo ? `<div class="flex items-center gap-3 mt-2"><img src="${esc(e.photo)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:10px"><label class="ui-check"><input type="checkbox" name="photoVisibleToKids" ${e.photoVisibleToKids ? "checked" : ""}> <span>Foto auf der Kinderseite zeigen</span></label><button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-remove-photo>Foto löschen</button></div>` : ""}
      <label class="ui-field"><span class="ui-field__label">${e.photo ? "Anderes Foto" : "Foto (Beweis oder Reaktion der Kinder)"}</span><input type="file" name="photo" accept="image/*" class="ui-input"></label>
      <label class="ui-field"><span class="ui-field__label">Wie haben die Kinder reagiert? (fürs Tagebuch)</span><input name="reaction" class="ui-input" value="${esc(e.reaction)}" maxlength="500"></label>
      <div class="flex flex-wrap gap-2 items-end">
        <label class="ui-field" style="margin:0"><span class="ui-field__label">Tag tauschen mit</span><select name="swapWith" class="ui-input"><option value="">–</option>${data.days.filter((x) => x.date !== date).map((x) => `<option value="${x.date}">${x.day}. (${x.weekday}) ${x.entry ? esc(x.entry.title) : "frei"}</option>`).join("")}</select></label>
        ${day.entry && feat().ideas ? `<button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-save-idea><i data-icon="star"></i> Als eigene Idee speichern</button>` : ""}
        ${day.entry ? `<button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-clear-day>Tag leeren</button>` : ""}
      </div>
    </div>`;
  const dialogPromise = UI.dialog({ title: `${day.day}. Dezember`, body, ok: "Speichern" });
  // Wire the extras inside the open dialog.
  const dlg = document.querySelector(".ui-backdrop:last-of-type");
  const form = dlg.querySelector("form");
  const cancel = () => dlg.querySelector("[data-cancel]").click();
  dlg.querySelector("[data-more]").addEventListener("click", (ev) => { const box = dlg.querySelector("[data-more-box]"); box.classList.toggle("hidden"); ev.target.textContent = box.classList.contains("hidden") ? "Mehr: Brief, Vorbereitung, Foto, Notiz …" : "Weniger"; });
  dlg.querySelector("[data-day-prev]")?.addEventListener("click", () => { cancel(); setTimeout(() => openDay(data.days[idx - 1].date), 180); });
  dlg.querySelector("[data-day-next]")?.addEventListener("click", () => { cancel(); setTimeout(() => openDay(data.days[idx + 1].date), 180); });
  dlg.querySelector("[data-idea-select]")?.addEventListener("change", (ev) => {
    const i = ideas.find((x) => x.id === ev.target.value);
    if (!i) return;
    form.elements.title.value = i.title;
    form.elements.category.value = i.category;
    form.elements.text.value = i.text;
    form.elements.materials.value = i.materials.join(", ");
    form.elements.minutes.value = i.minutes;
    form.elements.prepDayBefore.checked = i.prepDayBefore;
    if (i.steps?.length) form.elements.steps.value = i.steps.join("\n");
    if (i.letter && form.elements.letter && !form.elements.letter.value) form.elements.letter.value = fill(i.letter);
  });
  dlg.querySelector("[data-print-day-letter]")?.addEventListener("click", () => printLetterText(form.elements.letter.value, `${day.day}. Dezember`, `Brief ${day.day}. Dezember`));
  dlg.querySelector("[data-letter-template]")?.addEventListener("click", async () => {
    const t = await pickTemplate(date, null);
    if (t) form.elements.letter.value = t;
  });
  dlg.querySelector("[data-save-idea]")?.addEventListener("click", async () => {
    cancel();
    try {
      await update("POST", "/ideas", { fromDate: date, title: form.elements.title.value, category: form.elements.category.value, text: form.elements.text.value, materials: form.elements.materials.value, minutes: form.elements.minutes.value, prepDayBefore: form.elements.prepDayBefore.checked, letter: form.elements.letter?.value || "", steps: form.elements.steps.value.split("\n") });
      ideas = null; await loadLibrary(); renderIdeasOnly();
      toast("Als eigene Idee gespeichert – bleibt auch nächstes Jahr.");
    } catch (err) { toast(err.message, true); }
  });
  const clearBtn = dlg.querySelector("[data-clear-day]");
  if (clearBtn) clearBtn.addEventListener("click", async () => {
    cancel();
    const backup = day.entry;
    try {
      await update("DELETE", `/days/${date}`);
      UI.toast(`${day.day}. Dezember geleert.`, { action: { label: "Rückgängig", onClick: async () => { try { await update("PUT", `/days/${date}/restore`, { entry: backup }); toast("Wiederhergestellt."); } catch (err) { toast(err.message, true); } } } });
    } catch (err) { toast(err.message, true); }
  });
  const rmPhoto = dlg.querySelector("[data-remove-photo]");
  if (rmPhoto) rmPhoto.addEventListener("click", async () => {
    cancel();
    try { await update("DELETE", `/days/${date}/photo`); toast("Foto gelöscht"); } catch (err) { toast(err.message, true); }
  });
  const r = await dialogPromise;
  if (!r) return;
  try {
    const body2 = {
      title: r.title, category: r.category, text: r.text, materials: String(r.materials || "").split(",").map((s) => s.trim()).filter(Boolean),
      minutes: Number(r.minutes) || 0, prepDayBefore: Boolean(r.prepDayBefore), assignee: r.assignee || null, note: r.note, letter: r.letter,
      letterVisibleToKids: Boolean(r.letterVisibleToKids), photoVisibleToKids: r.photoVisibleToKids !== undefined ? Boolean(r.photoVisibleToKids) : undefined, reaction: r.reaction, done: Boolean(r.done),
      kidHint: r.kidHint, price: r.price || 0, steps: String(r.steps || "").split("\n").map((s) => s.trim()).filter(Boolean),
    };
    // The idea id is only sent when it changed, so edited texts survive re-saves.
    if (feat().ideas && r.ideaId !== (e.ideaId || "")) body2.ideaId = r.ideaId || null;
    if (body2.ideaId) { delete body2.title; delete body2.category; delete body2.text; delete body2.materials; delete body2.minutes; delete body2.prepDayBefore; delete body2.steps; }
    if (!feat().letters) { delete body2.letter; delete body2.letterVisibleToKids; }
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
  if (!ideas && feat().ideas) { const lib = await req("GET", "/ideas"); ideas = lib.ideas; sets = lib.sets || null; }
  if (!ideas) ideas = [];
  if (!templates) templates = feat().letters ? (await req("GET", "/letters/templates")).templates : [];
}

async function newIdea() {
  const r = await UI.form({
    title: "Eigene Idee",
    text: "Landet in eurer Bibliothek und bleibt für nächstes Jahr gespeichert.",
    ok: "Speichern",
    fields: [
      { name: "title", label: "Titel", required: true, maxlength: 100 },
      { name: "category", type: "select", label: "Art", options: Object.entries(data.categories).map(([value, label]) => ({ value, label })) },
      { name: "text", type: "textarea", label: "Was ist zu tun?", required: true, maxlength: 2000 },
      { name: "materials", label: "Material (mit Komma trennen)", required: false, maxlength: 300 },
      { name: "minutes", type: "number", label: "Aufwand (Min.)", value: "10", required: false },
      { name: "steps", type: "textarea", label: "Vorbereitung – ein Schritt pro Zeile", required: false, rows: 2 },
      { name: "prepDayBefore", type: "checkbox", label: "Am Vortag vorbereiten", value: false },
    ],
  });
  if (!r) return;
  try {
    await update("POST", "/ideas", { ...r, steps: String(r.steps || "").split("\n") });
    ideas = null; await loadLibrary(); ideaFilter = { cat: "eigene", q: "", all: false }; renderIdeasOnly();
    toast("Idee gespeichert.");
  } catch (err) { toast(err.message, true); }
}

async function pickTemplate(date, childId) {
  if (!feat().letters) { toast("Briefe schreiben gibt es in der PRO-Version.", true); return null; }
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

async function autoplanDialog() {
  await loadLibrary();
  const list = sets || [{ id: "klassik", title: "Klassischer Dezember", desc: "" }];
  const r = await UI.form({
    title: data.stats.planned ? "Lücken automatisch füllen" : "Alle 24 Nächte automatisch planen",
    text: "Passend zum Alter der Kinder, mit Abwechslung, aufwendigen Ideen am Wochenende und einem Ruhetag pro Woche. Du kannst danach alles ändern.",
    ok: "Planen",
    fields: [{ name: "set", type: "select", label: "Welcher Monat soll es werden?", options: list.map((s) => ({ value: s.id, label: s.desc ? `${s.title} – ${s.desc}` : s.title })), value: "klassik" }],
  });
  if (!r) return;
  await update("POST", "/autoplan", { set: r.set });
  toast("Der Plan steht. Schau ihn dir an!");
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

async function rollover() {
  const r = await UI.form({
    title: "Ins nächste Jahr übernehmen",
    text: `Wichtel, Kinder (ein Jahr älter), Eltern, Einstellungen und eure eigenen Ideen werden übernommen. Der Plan bleibt leer – oder wird gleich neu gefüllt.`,
    ok: "Neue Wichteltür anlegen",
    fields: [
      { name: "year", type: "number", label: "Jahr", value: String(data.year + 1), required: true },
      ...(feat().ideas ? [{ name: "autoplan", type: "checkbox", label: "Alle 24 Nächte gleich automatisch planen", value: true }] : []),
    ],
  });
  if (!r) return;
  try {
    const res = await fetch(`/api/wichteltuer/plans/${data.id}/rollover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year: Number(r.year), autoplan: Boolean(r.autoplan) }) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `Fehler ${res.status}`);
    window.location.href = `/e/${encodeURIComponent(d.shareLink.split("/").pop())}`;
  } catch (err) { toast(err.message, true); }
}

// ── Print views ─────────────────────────────────────────────────────────────
function printShell(title, body, extraCss = "") {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Inter:wght@400;600&display=swap" rel="stylesheet"><style>
    body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#111;margin:28px;font-size:13px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}
    .muted{color:#666;font-size:11px}table{border-collapse:collapse;width:100%;margin-top:6px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f3f3f3}
    .letter{position:relative;width:62mm;min-height:40mm;border:1px dashed #b8860b;border-radius:6px;padding:7mm 6mm 6mm;margin:3mm;display:inline-block;vertical-align:top;font-family:"Caveat","Comic Sans MS",cursive;font-size:13pt;line-height:1.25;white-space:pre-line;background:#fffdf5;page-break-inside:avoid;box-sizing:border-box}
    .letter::before{content:"❄";position:absolute;top:2mm;left:3mm;color:#b8c7dd;font-size:9pt}.letter::after{content:"❄ ❄";position:absolute;bottom:2mm;right:3mm;color:#b8c7dd;font-size:8pt}
    .letter small{display:block;font-family:Inter,sans-serif;font-size:7pt;color:#999;margin-top:4mm;border-top:1px solid #eee;padding-top:2mm}
    .letter--big{width:120mm;min-height:70mm;font-size:17pt;padding:12mm 10mm}
    .fold{font-size:8pt;color:#999;margin:4mm 3mm 0}
    .photos{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.photos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px}
    .album{display:grid;grid-template-columns:1fr 1fr;gap:10px}.album .d{border:1px solid #e5e7eb;border-radius:8px;padding:8px;page-break-inside:avoid}.album .d img{width:100%;max-height:70mm;object-fit:cover;border-radius:6px;margin-top:6px}.album .d h3{margin:0;font-size:12px}.album .d p{margin:4px 0 0;font-size:11px;color:#333}
    @media print{body{margin:10mm}}${extraCss}</style></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`;
}
function openPrint(kind) {
  const d = data;
  const head = `<h1>${esc(d.title)}</h1><p class="muted">Wichtel: ${esc(d.elf.name)} · Kinder: ${d.children.map((c) => esc(c.name)).join(", ") || "–"} · ${d.year}</p>`;
  let title = d.title;
  let body = "";
  if (kind === "plan") {
    title = `Plan – ${d.title}`;
    body = `${head}<h2>Der Plan (Morgen der Entdeckung)</h2><table><tr><th>Tag</th><th>Idee</th><th>Art</th><th>Material</th><th>Wer</th><th>Min.</th><th>✓</th></tr>${d.days.map((x) => `<tr><td>${x.day}. ${x.weekday}</td><td>${x.entry ? esc(x.entry.title) : "<span class=muted>frei</span>"}${x.entry?.note ? `<br><span class=muted>${esc(x.entry.note)}</span>` : ""}${x.entry?.steps?.length ? `<br><span class=muted>☐ ${x.entry.steps.map((s) => esc(s.text)).join(" ☐ ")}</span>` : ""}</td><td>${x.entry ? esc(x.entry.categoryLabel) : ""}</td><td>${x.entry ? x.entry.materials.map(esc).join(", ") : ""}</td><td>${esc(x.entry?.assigneeName || "")}</td><td>${x.entry?.minutes || ""}</td><td>${x.entry?.done ? "✓" : "☐"}</td></tr>`).join("")}</table>`;
  } else if (kind === "shopping") {
    title = `Einkaufsliste – ${d.title}`;
    body = `${head}<h2>Einkaufsliste</h2><table><tr><th>☐</th><th>Was</th><th>Für Tag</th></tr>${d.shopping.filter((i) => !i.checked && !i.have).map((i) => `<tr><td>☐</td><td>${esc(i.text)}</td><td>${i.dates.map((x) => `${Number(x.slice(8))}.`).join(" ")}</td></tr>`).join("")}</table>${d.stats.spent ? `<p class="muted">Geplante Kosten: ${money(d.stats.spent)}${d.stats.budget ? ` von ${money(d.stats.budget)}` : ""}</p>` : ""}`;
  } else if (kind === "letters") {
    title = `Briefe – ${d.title}`;
    const letters = d.days.filter((x) => x.entry?.letter);
    body = `<h1>Wichtelbriefe · ${esc(d.title)}</h1><p class="muted">Ausschneiden, klein falten, vor die Tür legen.</p>${letters.map((x) => `<div class="letter">${esc(x.entry.letter)}<small>${x.day}. Dezember</small></div>`).join("") || "<p>Noch keine Briefe geplant.</p>"}`;
  } else if (kind === "recap") {
    title = `Album – ${d.title}`;
    const done = d.days.filter((x) => x.entry && (x.entry.done || x.entry.photo || x.entry.reaction));
    const R = { heart: "❤️", laugh: "😂", wow: "😮" };
    body = `${head}<h2>Unser Wichtel-Dezember</h2><div class="album">${done.map((x) => `<div class="d"><h3>${x.day}. Dezember – ${esc(x.entry.title)}</h3>${x.entry.reaction ? `<p>${esc(x.entry.reaction)}</p>` : ""}${x.entry.photo ? `<img src="${esc(x.entry.photo)}">` : ""}${x.entry.letter ? `<p class="muted" style="white-space:pre-line">„${esc(x.entry.letter)}“</p>` : ""}</div>`).join("") || "<p class=muted>Noch nichts erledigt.</p>"}</div><h2>Wichtelpost</h2>${d.post.slice().reverse().map((l) => `<p><b>${l.from === "kid" ? esc(l.childName || "Kind") : esc(d.elf.name)}:</b> ${l.kind === "reaction" ? `${R[l.reaction] || ""} auf den ${esc(l.refLabel)}` : l.kind === "voice" ? "🎤 Sprachnachricht" : esc(l.text)}</p>`).join("") || "<p class=muted>Keine Briefe.</p>"}`;
  }
  const w = window.open("", "_blank");
  if (!w) return toast("Pop-up blockiert – bitte Pop-ups für diese Seite erlauben.", true);
  w.document.write(printShell(title, body));
  w.document.close();
}
function printLetterText(text, footer, title) {
  if (!String(text || "").trim()) return toast("Der Brief ist noch leer.", true);
  const w = window.open("", "_blank");
  if (!w) return toast("Pop-up blockiert – bitte Pop-ups für diese Seite erlauben.", true);
  w.document.write(printShell(title, `<div class="letter letter--big">${esc(text)}<small>${esc(footer)}</small></div><p class="fold">Tipp: Zweimal falten, dann passt der Brief unter die Wichteltür. Für das Mini-Format „Alle Briefe“ im Tab Wichtel drucken.</p>`));
  w.document.close();
}
function printLetter(date) {
  const x = data.days.find((y) => y.date === date);
  if (!x?.entry?.letter) return;
  printLetterText(x.entry.letter, `${x.day}. Dezember`, `Brief ${x.day}. Dezember`);
}
function printPost(id) {
  const l = data.post.find((p) => p.id === id);
  if (!l) return;
  printLetterText(l.text, `${data.elf.name}${l.childName ? ` an ${l.childName}` : ""} · ${formatDate(l.at.slice(0, 10))}`, `Brief von ${data.elf.name}`);
}

// ── Events ──────────────────────────────────────────────────────────────────
function jumpToHash() {
  const h = (window.location.hash || "").slice(1);
  if (!h) { setTab(activeTab, { scroll: false }); return; }
  if (h.startsWith("tag-")) { setTab("plan", { scroll: false }); const date = h.slice(4); document.getElementById(h)?.scrollIntoView({ block: "center" }); openDay(date); return; }
  if (TABS.includes(h)) { setTab(h, { scroll: false }); return; }
  const el = document.getElementById(h);
  if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}
window.addEventListener("hashchange", jumpToHash);

// Long press on a day (or drag on desktop) picks it up; the next tap swaps.
let pressTimer = null;
function bindSwap() {
  const rows = document.getElementById("plan-rows");
  if (!rows) return;
  const rowOf = (t) => t.closest(".t-day[data-open-day]");
  rows.addEventListener("pointerdown", (e) => {
    const row = rowOf(e.target);
    if (!row || e.target.closest("button, input, label")) return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { swapFrom = row.dataset.openDay; haptic("medium"); render(); setTab("plan", { scroll: false }); }, 550);
  });
  ["pointerup", "pointercancel", "pointerleave", "pointermove"].forEach((ev) => rows.addEventListener(ev, (e) => { if (ev !== "pointermove" || Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clearTimeout(pressTimer); }));
  rows.addEventListener("dragstart", (e) => { const row = rowOf(e.target); if (!row) return; e.dataTransfer.setData("text/plain", row.dataset.openDay); e.dataTransfer.effectAllowed = "move"; row.classList.add("is-picked"); });
  rows.addEventListener("dragover", (e) => { const row = rowOf(e.target); if (!row) return; e.preventDefault(); row.classList.add("is-over"); });
  rows.addEventListener("dragleave", (e) => { rowOf(e.target)?.classList.remove("is-over"); });
  rows.addEventListener("drop", async (e) => {
    const row = rowOf(e.target);
    const from = e.dataTransfer.getData("text/plain");
    if (!row || !from || from === row.dataset.openDay) return;
    e.preventDefault();
    await swapDays(from, row.dataset.openDay);
  });
}
async function swapDays(a, b) {
  swapFrom = null;
  try { await update("POST", "/days/swap", { a, b }); haptic("success"); toast(`${Number(a.slice(8))}. und ${Number(b.slice(8))}. Dezember getauscht.`); } catch (err) { toast(err.message, true); }
}

function bindEvents() {
  app.addEventListener("click", onClick);
  app.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-open-day]")) openDay(e.target.dataset.openDay); });
  app.addEventListener("change", onChange);
  bindSwap();
  const search = document.getElementById("idea-search");
  if (search) search.addEventListener("input", () => { ideaFilter.q = search.value; const pos = search.selectionStart; renderIdeasOnly(); const s2 = document.getElementById("idea-search"); s2.focus(); s2.setSelectionRange(pos, pos); });
  document.getElementById("shop-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = e.target.elements.text.value.trim();
    if (!text) return;
    try { await update("POST", "/shopping/custom", { text }); } catch (err) { toast(err.message, true); }
  });
  document.getElementById("settings-form").addEventListener("submit", onSettingsSubmit);
  document.getElementById("assign-mode")?.addEventListener("change", (e) => document.getElementById("assign-weekdays").classList.toggle("hidden", e.target.value !== "weekdays"));
}
function renderIdeasOnly() {
  const el = document.getElementById("ideen");
  if (el) el.innerHTML = setsCard() + ideasCard();
}

async function onClick(e) {
  const t = e.target;
  const tab = t.closest("[data-tab]");
  if (tab) { e.preventDefault(); setTab(tab.dataset.tab); return; }
  const btn = t.closest("[data-act], [data-open-day], [data-plan-idea], [data-idea-letter], [data-del-idea], [data-reply], [data-del-post], [data-shop-del], [data-shop-have], [data-shop-unhave], [data-print-letter], [data-print-post], [data-cat], [data-set], [data-plan-filter], [data-toggle-done]");
  if (!btn) return;
  if (btn.matches("[data-cat]")) { ideaFilter.cat = btn.dataset.cat; renderIdeasOnly(); return; }
  if (btn.matches("[data-plan-filter]")) { planFilter = btn.dataset.planFilter; render(); setTab("plan", { scroll: false }); return; }
  if (btn.matches("[data-open-day]") && !t.closest("input, label, button:not([data-open-day])")) {
    if (swapFrom && swapFrom !== btn.dataset.openDay) return swapDays(swapFrom, btn.dataset.openDay);
    if (swapFrom === btn.dataset.openDay) { swapFrom = null; render(); setTab("plan", { scroll: false }); return; }
    return openDay(btn.dataset.openDay);
  }
  if (btn.matches("[data-toggle-done]")) { try { await update("PUT", `/days/${btn.dataset.toggleDone}`, { done: btn.dataset.doneNow !== "1" }); haptic("success"); if (btn.dataset.doneNow !== "1") toast("Erledigt – gute Nacht!"); } catch (err) { toast(err.message, true); } return; }
  if (btn.matches("[data-set]")) {
    if (!(await UI.confirm({ title: `Monatsplan „${sets.find((s) => s.id === btn.dataset.set)?.title || ""}“`, text: data.stats.open ? `Füllt die ${data.stats.open} freien Nächte. Schon geplante Tage bleiben.` : "Alle Nächte sind schon geplant. Sollen sie ersetzt werden?", ok: data.stats.open ? "Füllen" : "Ersetzen", danger: !data.stats.open }))) return;
    try { await update("POST", "/autoplan", { set: btn.dataset.set, overwrite: !data.stats.open }); toast("Der Plan steht."); setTab("plan"); } catch (err) { toast(err.message, true); }
    return;
  }
  if (btn.matches("[data-plan-idea]")) return planIdea(btn.dataset.planIdea);
  if (btn.matches("[data-idea-letter]")) { const i = ideas.find((x) => x.id === btn.dataset.ideaLetter); return UI.alert({ title: i.title, text: fill(i.letter), ok: "Schließen" }); }
  if (btn.matches("[data-del-idea]")) {
    if (!(await UI.confirm({ title: "Eigene Idee löschen?", ok: "Löschen", danger: true }))) return;
    try { await update("DELETE", `/ideas/${btn.dataset.delIdea}`); ideas = null; await loadLibrary(); renderIdeasOnly(); } catch (err) { toast(err.message, true); }
    return;
  }
  if (btn.matches("[data-reply]")) return writePost(btn.dataset.child || null, btn.dataset.reply);
  if (btn.matches("[data-print-letter]")) return printLetter(btn.dataset.printLetter);
  if (btn.matches("[data-print-post]")) return printPost(btn.dataset.printPost);
  if (btn.matches("[data-del-post]")) {
    const id = btn.dataset.delPost;
    try {
      await update("DELETE", `/post/${id}`);
      UI.toast("Brief gelöscht.", { action: { label: "Rückgängig", onClick: async () => { try { await update("POST", `/post/${id}/restore`); } catch (err) { toast(err.message, true); } } } });
    } catch (err) { toast(err.message, true); }
    return;
  }
  if (btn.matches("[data-shop-del]")) { try { await update("DELETE", `/shopping/custom/${btn.dataset.shopDel}`); } catch (err) { toast(err.message, true); } return; }
  if (btn.matches("[data-shop-have]")) { e.preventDefault(); try { await update("PUT", "/shopping/have", { key: btn.dataset.shopHave, have: true }); toast("In den Vorrat verschoben."); } catch (err) { toast(err.message, true); } return; }
  if (btn.matches("[data-shop-unhave]")) { try { await update("PUT", "/shopping/have", { key: btn.dataset.shopUnhave, have: false }); } catch (err) { toast(err.message, true); } return; }
  const act = btn.dataset.act;
  try {
    switch (act) {
      case "autoplan": await autoplanDialog(); break;
      case "swap-cancel": swapFrom = null; render(); setTab("plan", { scroll: false }); break;
      case "who": await askWhoAmI(true); break;
      case "new-idea": await newIdea(); break;
      case "rollover": await rollover(); break;
      case "assign-now": {
        const mode = document.getElementById("assign-mode")?.value || "manual";
        if (mode === "manual") return toast("Wähle zuerst eine Regel: abwechselnd oder feste Wochentage.", true);
        const rule = collectAssignRule(document.getElementById("settings-form"));
        const all = data.days.some((x) => x.entry?.assignee) ? await UI.confirm({ title: "Alle Tage neu verteilen?", text: "„Nur offene“ lässt bestehende Zuteilungen stehen.", ok: "Alle neu", cancel: "Nur offene" }) : false;
        await update("POST", "/assign", { rule, all });
        toast(all ? "Alle Nächte neu verteilt." : "Offene Nächte verteilt.");
        setTab("wichtel", { scroll: false });
        break;
      }
      case "back": e.preventDefault(); window.history.back(); break;
      case "upgrade": await startUpgrade(); break;
      case "share-plan": {
        const r = await UI.share({ title: `Wichteltür: ${data.title}`, text: `Unser Wichtel-Plan für ${data.elf.name} – hier kannst du mitplanen:`, url: data.shareLink });
        if (r === "copied") toast("Link kopiert.");
        break;
      }
      case "share-view": {
        const r = await UI.share({ title: `Wichteltür: ${data.title}`, text: `So läuft unser Wichtel-Dezember mit ${data.elf.name} – zum Mitschauen:`, url: data.viewLink });
        if (r === "copied") toast("Link kopiert.");
        break;
      }
      case "copy-share": await UI.copy(data.shareLink); break;
      case "copy-kid": await UI.copy(data.kidLink); break;
      case "copy-view": await UI.copy(data.viewLink); break;
      case "share-shopping": {
        const text = data.shopping.filter((i) => !i.checked && !i.have).map((i) => `☐ ${i.text}`).join("\n");
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
      case "rotate-view":
        if (data.viewLink && !(await UI.confirm({ title: "Nur-Lesen-Link erneuern?", text: "Der bisherige Link funktioniert danach nicht mehr.", ok: "Erneuern" }))) return;
        await update("POST", "/rotate-view-link");
        toast("Nur-Lesen-Link ist bereit.");
        break;
      case "delete-view":
        if (!(await UI.confirm({ title: "Nur-Lesen-Link deaktivieren?", text: "Grosseltern und Helfer sehen dann nichts mehr.", ok: "Deaktivieren", danger: true }))) return;
        await update("DELETE", "/view-link");
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
    if (t.matches("[data-done]")) { await update("PUT", `/days/${t.dataset.done}`, { done: t.checked }); haptic("success"); if (t.checked) toast("Erledigt ✓"); }
    else if (t.matches("[data-step]")) { await update("PUT", `/days/${t.dataset.step}/steps/${t.dataset.stepId}`, { done: t.checked }); }
    else if (t.matches("[data-shop]")) { await update("PUT", "/shopping/check", { key: t.dataset.shop, checked: t.checked }); }
    else if (t.matches("[data-photo]") && t.files[0]) { toast("Lade hoch …"); await uploadPhoto(t.dataset.photo, t.files[0]); toast("Foto gespeichert"); }
    else if (t.name && t.name.startsWith("wd_")) { t.closest("label").classList.toggle("is-on", t.checked); }
  } catch (err) {
    toast(err.message, true);
  }
}

function collectAssignRule(form) {
  const fd = new FormData(form);
  const mode = fd.get("assignMode") || "manual";
  const weekdays = {};
  for (const p of data.parents) weekdays[p.id] = WEEKDAYS.map((_, i) => i).filter((i) => fd.get(`wd_${p.id}_${i}`) === "on");
  return { mode, weekdays };
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
  const swissBefore = data.swissMode;
  try {
    await update("PUT", "/settings", {
      title: fd.get("title"),
      elf: { name: fd.get("elfName"), character: fd.get("character"), doorPlace: fd.get("doorPlace") },
      swissMode: fd.get("swissMode") === "on",
      budget: fd.get("budget") || null,
      children: collect("child", true),
      parents: collect("parent", false),
      ...(fd.get("assignMode") ? { assignRule: collectAssignRule(f) } : {}),
      notify: { enabled: fd.get("notifyEnabled") === "on", time: fd.get("notifyTime"), emails: String(fd.get("emails") || "").split(",").map((s) => s.trim()).filter(Boolean) },
    });
    const ok = document.getElementById("settings-saved");
    ok.classList.remove("hidden");
    setTimeout(() => ok.classList.add("hidden"), 1500);
    document.getElementById("wichtel").scrollIntoView({ block: "start" });
    // The library is served in the plan's language, so fetch it again after a change.
    if (swissBefore !== data.swissMode) { ideas = null; templates = null; if (feat().ideas) loadLibrary().then(renderIdeasOnly).catch(() => {}); }
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
    // "Erledigt" straight from the reminder mail.
    const params = new URLSearchParams(window.location.search);
    const doneDate = params.get("done");
    if (doneDate && data.days.some((x) => x.date === doneDate && x.entry)) {
      try { data = await req("PUT", `/days/${doneDate}`, { done: true }); toast(`${Number(doneDate.slice(8))}. Dezember als erledigt markiert. Gute Nacht!`); } catch (_) { /* shown below */ }
    }
    render();
    if (feat().ideas) loadLibrary().then(renderIdeasOnly).catch(() => {});
    setupPush();
    const payment = params.get("payment");
    if (payment || doneDate) window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    if (payment === "success") UI.alert({ title: "Danke!", text: data.isPro ? "Diese Wichteltür ist jetzt PRO: Ideen-Bibliothek, Briefe und Einkaufsliste sind für alle mit dem Link freigeschaltet." : "Die Zahlung ist eingegangen. Die Freischaltung kann einen Moment dauern – lade die Seite gleich noch einmal.", ok: "Super" });
    else if (payment) toast("Zahlung abgebrochen.", true);
    setInterval(async () => {
      if (document.hidden || navigator.onLine === false || document.querySelector(".ui-backdrop") || swapFrom || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      try { const fresh = await req("GET", ""); if (JSON.stringify(fresh) !== JSON.stringify(data)) { data = fresh; render(); } } catch (_) { /* keep */ }
    }, 30000);
  } catch (err) {
    app.innerHTML = `<div class="w-card text-center"><div class="ui-empty__art"><i data-icon="eye-off"></i></div><h1 class="w-title text-xl mb-2">Link ungültig</h1><p class="text-slate-400">${esc(err.message)}</p></div>`;
  }
})();
