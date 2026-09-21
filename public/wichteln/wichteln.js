// Wichteln participant area. Served at /w/:token (participant) and /w/join/:inviteToken (join).
const parts = window.location.pathname.split("/").filter(Boolean); // ["w", "join", token] or ["w", token]
const isJoin = parts[1] === "join";
const token = isJoin ? parts[2] : parts[1];
const API = isJoin ? `/api/wichteln/join/${encodeURIComponent(token || "")}` : `/api/wichteln/p/${encodeURIComponent(token || "")}`;
const query = new URLSearchParams(window.location.search);

let data = null;
let pollTimer = null;
let firstRender = true;
const app = document.getElementById("app");
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
};

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
function eventLine(g) {
  if (!g.eventDate) return "";
  return `${formatDate(g.eventDate)}${g.eventTime ? ` um ${g.eventTime} Uhr` : ""}${g.eventPlace ? `, ${g.eventPlace}` : ""}`;
}
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return new Date(iso).toLocaleDateString("de-DE");
}
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Heute";
  if (same(d, yesterday)) return "Gestern";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
const toast = (msg, isError = false) => UI.toast(msg, { error: isError });
const haptic = (style) => { if (typeof window.nativeHaptic === "function") window.nativeHaptic(style); };

async function req(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (isForm) opts.body = body;
    else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  let r;
  try {
    r = await fetch(`${API}${path}`, opts);
  } catch (_) {
    if (navigator.onLine === false) UI.setOffline(true);
    throw new Error(navigator.onLine === false ? "Du bist offline – bitte später noch einmal versuchen." : "Verbindung fehlgeschlagen.");
  }
  UI.setOffline(false);
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `Fehler ${r.status}`);
  return json;
}

// Remember every round this browser joined so the person can get back to it.
function knownTokens() {
  try { return JSON.parse(store.get("wichtel_tokens") || "[]"); } catch (_) { return []; }
}
function rememberToken(t) {
  const list = knownTokens();
  if (!list.includes(t)) store.set("wichtel_tokens", JSON.stringify([...list, t].slice(-10)));
}

// ── Join page (two steps: name, then contact) ───────────────────────────────
async function renderJoin() {
  let info;
  try {
    info = await req("GET", "");
  } catch (err) {
    app.innerHTML = `<div class="w-card text-center"><div class="ui-empty__art"><i data-icon="eye-off"></i></div><h1 class="w-title text-xl mb-2">Einladung nicht gefunden</h1><p class="text-slate-400">${esc(err.message)}</p></div>`;
    return;
  }
  document.title = `Wichteln: ${info.title}`;
  const details = [
    info.eventDate ? `<span class="w-chip"><i data-icon="calendar"></i> ${esc(eventLine(info))}</span>` : "",
    info.budget ? `<span class="w-chip"><i data-icon="wallet"></i> ${esc(info.budget)}</span>` : "",
    info.motto ? `<span class="w-chip"><i data-icon="palette"></i> ${esc(info.motto)}</span>` : "",
    `<span class="w-chip"><i data-icon="users"></i> ${info.participantCount} dabei</span>`,
  ].filter(Boolean).join(" ");
  app.innerHTML = `
    <div class="w-card text-center">
      <div class="text-5xl mb-2 text-emerald-300"><i data-icon="gift"></i></div>
      <p class="text-sm text-emerald-300 uppercase tracking-widest font-semibold">Einladung zum Wichteln</p>
      <h1 class="w-title text-3xl mt-1">${esc(info.title)}</h1>
      <p class="text-slate-300 mt-2">${info.organizerName ? `${esc(info.organizerName)} lädt dich ein.` : "Du bist eingeladen."}</p>
      <div class="flex flex-wrap justify-center gap-2 mt-4">${details}</div>
      ${info.description ? `<p class="text-sm text-slate-300 mt-4 whitespace-pre-line text-left bg-black/20 rounded-xl p-3">${esc(info.description)}</p>` : ""}
    </div>
    ${info.closed
      ? `<div class="w-card text-center"><div class="ui-empty__art"><i data-icon="lock"></i></div><p class="text-amber-300 font-semibold">Die Auslosung ist schon gelaufen.</p><p class="text-sm text-slate-400 mt-1">Frag den Organisator – er kann neu auslosen und dich mitnehmen.</p></div>`
      : `<form id="join-form" class="w-card space-y-3" novalidate>
          <div class="flex items-center justify-between"><h2 class="w-title text-lg">Ich bin dabei!</h2><span class="text-xs text-slate-500" id="join-step-label">Schritt 1 von 2</span></div>
          <div id="join-step-1">
            <label class="block text-sm text-slate-300 mb-1">Wie heißt du?</label>
            <input name="name" required maxlength="60" class="w-input" placeholder="So sehen dich die anderen" autofocus autocomplete="name">
            <p class="text-xs text-slate-500 mt-2">Gibt es dich in der Runde zweimal? Dann ergänze z. B. den Nachnamen.</p>
            <button type="button" id="join-next" class="w-btn w-btn--primary w-full mt-3">Weiter <i data-icon="check"></i></button>
          </div>
          <div id="join-step-2" class="hidden">
            <p class="text-sm text-slate-300">Hallo <b id="join-name-echo" class="text-white"></b>! Fast geschafft.</p>
            <label class="block text-sm text-slate-300 mt-3 mb-1">E-Mail <span class="text-slate-500">(optional)</span></label>
            <input name="email" type="email" class="w-input" placeholder="für dein Los und Benachrichtigungen" autocomplete="email">
            <ul class="text-xs text-slate-400 mt-2 space-y-1">
              <li><i data-icon="mail"></i> Mit E-Mail bekommst du dein Los, Nachrichten und den Termin zugeschickt.</li>
              <li><i data-icon="link"></i> Ohne E-Mail: Dein persönlicher Link ist dein Zugang – du kannst ihn gleich speichern.</li>
              ${info.waitingRoom ? `<li><i data-icon="hourglass"></i> Diese Runde hat einen Warteraum: Der Organisator gibt dich frei, danach bist du dabei.</li>` : ""}
            </ul>
            <div class="flex gap-2 mt-3">
              <button type="button" id="join-back" class="w-btn w-btn--ghost">Zurück</button>
              <button type="submit" id="join-submit" class="w-btn w-btn--primary flex-1">Eintragen</button>
            </div>
          </div>
          <p id="join-error" class="hidden text-sm text-rose-400"></p>
        </form>`}`;
  const form = document.getElementById("join-form");
  if (!form) return;
  const errEl = document.getElementById("join-error");
  const showError = (msg) => { errEl.textContent = msg; errEl.classList.remove("hidden"); };
  const goStep = (n) => {
    document.getElementById("join-step-1").classList.toggle("hidden", n !== 1);
    document.getElementById("join-step-2").classList.toggle("hidden", n !== 2);
    document.getElementById("join-step-label").textContent = `Schritt ${n} von 2`;
    errEl.classList.add("hidden");
    if (n === 2) {
      document.getElementById("join-name-echo").textContent = form.elements.name.value.trim();
      form.elements.email.focus();
    } else form.elements.name.focus();
  };
  document.getElementById("join-next").addEventListener("click", () => {
    if (!form.elements.name.value.trim()) return showError("Bitte gib deinen Namen ein.");
    goStep(2);
  });
  form.elements.name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("join-next").click(); } });
  document.getElementById("join-back").addEventListener("click", () => goStep(1));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.classList.add("hidden");
    const btn = document.getElementById("join-submit");
    btn.disabled = true;
    try {
      const r = await req("POST", "", { name: form.elements.name.value, email: form.elements.email.value });
      rememberToken(r.token);
      haptic("success");
      window.location.href = `/w/${r.token}?welcome=1`;
    } catch (err) {
      btn.disabled = false;
      showError(err.message);
    }
  });
}

// ── Participant page ────────────────────────────────────────────────────────
async function load() {
  data = await req("GET", "");
  rememberToken(token);
  document.title = `Wichteln: ${data.group.title}`;
  render();
  setupPush();
  checkOtherRounds();
}

// ── Push: the app registers on its own, browsers after a tap ─────────────────
const PUSH_KEY = `wichtel_push_${token}`;
const PUSH_ASKED_KEY = "wichtel_push_asked";
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
function webPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
async function registerWebPush() {
  const swReg = await navigator.serviceWorker.ready;
  const r = await fetch("/api/wichteln/vapidPublicKey");
  const { publicKey } = await r.json();
  if (!publicKey) throw new Error("Push ist auf dem Server nicht eingerichtet.");
  const sub = (await swReg.pushManager.getSubscription()) || (await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  await req("POST", "/push", sub.toJSON());
  store.set(PUSH_KEY, "web");
}
async function enableWebPush() {
  const perm = await Notification.requestPermission();
  store.set(PUSH_ASKED_KEY, "1");
  if (perm !== "granted") { toast("Benachrichtigungen wurden nicht erlaubt.", true); return false; }
  await registerWebPush();
  toast("Benachrichtigungen sind aktiv.");
  return true;
}
function pushNeedsOptIn() {
  return !window.__NATIVE_APP && webPushSupported() && Notification.permission === "default" && !data?.me?.pending;
}
async function setupPush() {
  if (data?.me?.pending) return;
  if (window.__NATIVE_APP && typeof window.nativeRequestPushToken === "function") {
    const t = await window.nativeRequestPushToken();
    if (t && store.get(PUSH_KEY) !== t) {
      try { await req("POST", "/push", { expoToken: t, platform: window.__NATIVE_APP.platform }); store.set(PUSH_KEY, t); } catch (_) { /* retry next visit */ }
    }
    return;
  }
  if (!webPushSupported() || Notification.permission === "denied") return;
  if (Notification.permission === "granted" && store.get(PUSH_KEY) !== "web") {
    registerWebPush().catch(() => {});
    return;
  }
  // The bell in the top bar stays as the manual way in; the friendly prompt
  // appears after the first meaningful action (see maybeAskPush).
  const btn = document.getElementById("push-btn");
  if (btn && Notification.permission === "default" && store.get(PUSH_ASKED_KEY)) {
    btn.classList.remove("hidden");
    btn.addEventListener("click", () => enableWebPush().catch((err) => toast(err.message, true)));
  }
}
// Ask for notifications right after the person did something worth being
// notified about (a wish, a message) – never as the first thing on the page.
function maybeAskPush() {
  if (!pushNeedsOptIn() || store.get(PUSH_ASKED_KEY)) return;
  const host = document.getElementById("push-ask");
  if (!host) return;
  host.classList.remove("hidden");
  host.innerHTML = `<div class="w-card w-card--soft flex flex-wrap items-center gap-3">
    <div class="text-2xl text-emerald-300"><i data-icon="bell"></i></div>
    <div class="flex-1 min-w-[200px]"><b class="text-white">Bescheid sagen, wenn etwas passiert?</b><p class="text-xs text-slate-400 mt-0.5">Neue Nachricht, geänderter Wunschzettel, Termin – als Benachrichtigung auf diesem Gerät.</p></div>
    <div class="flex gap-2"><button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="push-later">Später</button><button type="button" class="w-btn w-btn--primary w-btn--sm" data-act="push-on">Aktivieren</button></div>
  </div>`;
  host.querySelector("[data-act='push-later']").addEventListener("click", () => { store.set(PUSH_ASKED_KEY, "1"); host.classList.add("hidden"); });
  host.querySelector("[data-act='push-on']").addEventListener("click", async () => {
    try { await enableWebPush(); } catch (err) { toast(err.message, true); }
    host.classList.add("hidden");
  });
}

// ── Helpers for the content ─────────────────────────────────────────────────
const isDrawn = () => data.group.status !== "draft";
const unreadRecipient = () => data.recipient?.unread || 0;
const unreadSanta = () => data.santa?.unread || 0;
const unreadTotal = () => unreadRecipient() + unreadSanta();

function parseAmount(s) {
  const m = String(s || "").replace(/'/g, "").match(/(\d+(?:[.,]\d{1,2})?)/g);
  if (!m) return null;
  return Math.max(...m.map((x) => parseFloat(x.replace(",", "."))));
}
function currencyOf(s) {
  const m = String(s || "").match(/CHF|EUR|€|Fr\.|USD|\$/i);
  return m ? m[0] : "";
}
function budgetInfo() {
  const max = parseAmount(data.group.budget);
  return max ? { max, currency: currencyOf(data.group.budget) } : null;
}
function priceTag(w) {
  const b = budgetInfo();
  const price = parseAmount(w.price);
  if (!b || price === null) return "";
  if (price <= b.max) return `<span class="w-tag w-tag--ok" title="Passt ins Budget"><i data-icon="circle-check"></i> im Budget</span>`;
  return `<span class="w-tag w-tag--warn" title="Über dem Budget"><i data-icon="triangle-alert"></i> über Budget</span>`;
}

const IDEA_RULES = [
  [/koch|back|küche|rezept/i, "Gewürz-Set oder ein schönes Kochbuch"],
  [/kaffee|espresso|barista/i, "Kaffee von einer lokalen Rösterei"],
  [/\btee\b|matcha/i, "Feine Tee-Auswahl mit Sieb"],
  [/wein|bier|gin|whisky|likör/i, "Eine besondere Flasche mit persönlicher Notiz"],
  [/schoko|süss|süß|nasch|praline|guetzli|kekse/i, "Handgemachte Schokolade oder Pralinen"],
  [/lesen|buch|bücher|krimi|roman|fantasy/i, "Ein Buch aus dem Lieblingsgenre plus Lesezeichen"],
  [/wander|outdoor|berg|natur|camping/i, "Thermosflasche, Wanderkarte oder warme Socken"],
  [/sport|fitness|yoga|lauf|jogg|velo|fahrrad|rad|schwimm|ski/i, "Trinkflasche, Sportsocken oder ein Training-Gutschein"],
  [/garten|pflanz|balkon/i, "Samen-Set, Kräutertopf oder Gartenhandschuhe"],
  [/musik|konzert|gitarre|klavier|vinyl|schallplatte/i, "Konzert-Gutschein oder eine Schallplatte"],
  [/film|serie|kino|netflix|streaming/i, "Kino-Gutschein mit Popcorn-Set"],
  [/spiel|brettspiel|puzzle|gaming|zocken|karten/i, "Ein kleines Karten- oder Brettspiel"],
  [/reise|urlaub|ferien|städte/i, "Reise-Organizer, Stadtführer oder Reisetagebuch"],
  [/foto|kamera|instagram/i, "Fotobuch-Gutschein oder ein schöner Bilderrahmen"],
  [/hund|katze|haustier/i, "Etwas für den Vierbeiner – Leckerli oder Spielzeug"],
  [/bastel|handarbeit|strick|näh|häkel|diy|malen|zeichnen/i, "Bastel- oder Mal-Set, schönes Garn"],
  [/wellness|bad|entspann|sauna|massage|kerze/i, "Badezusatz, Duftkerze oder Massage-Gutschein"],
  [/technik|gadget|computer|handy|smartphone/i, "Ein cleveres kleines Gadget oder eine Powerbank"],
  [/auto|motorrad|oldtimer/i, "Pflege-Set fürs Fahrzeug oder ein Modell"],
  [/kinder|baby|familie/i, "Ein Erlebnis für die ganze Familie"],
];
function giftIdeas(r) {
  const text = [r.hints?.hobbies, r.hints?.favorites, r.hints?.notes].filter(Boolean).join(" ");
  const ideas = [];
  for (const [re, idea] of IDEA_RULES) if (re.test(text) && !ideas.includes(idea)) ideas.push(idea);
  const motto = data.group.motto || "";
  if (/selbstgemacht|diy|handmade/i.test(motto)) ideas.unshift("Selbstgemachtes: Marmelade, Granola, Likör oder Guetzli");
  if (/schrott|weisser elefant|white elephant/i.test(motto)) ideas.unshift("Das kurioseste Ding aus dem eigenen Keller");
  if (/regional|lokal/i.test(motto)) ideas.unshift("Etwas vom Wochenmarkt oder aus dem Hofladen");
  if (!ideas.length) ideas.push("Gutschein für ein gemeinsames Erlebnis", "Etwas Regionales vom Wochenmarkt", "Eine Duftkerze oder gute Schokolade");
  return ideas.slice(0, 4);
}

function emptyState(iconName, text) {
  return `<div class="ui-empty"><div class="ui-empty__art"><i data-icon="${iconName}"></i></div>${text}</div>`;
}

// Which parts of the round are unlocked (PRO). Older servers send no flags.
function feat() {
  return data.features || { wishlist: true, hints: true, chat: Boolean(data.group.chatEnabled) };
}
// ── Rendering ───────────────────────────────────────────────────────────────
function render() {
  const { group: g, me } = data;
  UI.watchOffline();
  if (me.pending) {
    app.innerHTML = `${navBar()}${headerCard()}${welcomeCard()}
      <div class="w-card text-center">
        <div class="ui-empty__art text-amber-300"><i data-icon="hourglass"></i></div>
        <h2 class="w-title text-xl">Du bist im Warteraum</h2>
        <p class="text-slate-300 mt-2">Der Organisator gibt dich gleich frei. Diese Seite prüft das automatisch.</p>
      </div>`;
    bindNav();
    bindWelcome();
    return;
  }
  const drawn = isDrawn();
  app.innerHTML = [
    navBar(),
    headerCard(),
    welcomeCard(),
    stepper(),
    sectionNav(),
    `<div id="push-ask" class="hidden"></div>`,
    `<section id="wichtelkind" class="w-section">${data.reveal ? revealCard() : ""}${drawn && data.recipient ? recipientCard() + todoCard() : notDrawnCard()}</section>`,
    `<section id="wunschzettel" class="w-section">${feat().wishlist ? myWishlistCard() : ""}${myHintsCard()}${feat().wishlist ? sharedWishlistsCard() : ""}</section>`,
    feat().chat || !data.group.chatEnabled ? `<section id="chat" class="w-section">${chatSection()}</section>` : "",
    `<section id="rueckblick" class="w-section">${drawn && data.santa ? santaCard() : ""}${recapCard()}</section>`,
    participantsCard(),
    footerCard(),
  ].join("");
  bindEvents();
  if (firstRender) {
    firstRender = false;
    jumpToHash();
  }
}

// Top bar: back (organizer came from the admin editor, or a previous page exists),
// link to the round's administration for the organizer, and a switcher when this
// browser knows several rounds.
function navBar() {
  const g = data.group;
  const me = data.me;
  const links = [];
  const cameFromAdmin = /\/admin\//.test(document.referrer || "");
  if (me.isOrganizer) links.push(`<a href="/admin/wichteln-editor.html?id=${encodeURIComponent(g.id)}" class="w-btn w-btn--ghost w-btn--sm"><i data-icon="settings"></i> Runde verwalten</a>`);
  else if (cameFromAdmin || window.history.length > 1) links.push(`<a href="#" data-act="back" class="w-btn w-btn--ghost w-btn--sm">← Zurück</a>`);
  const others = knownTokens().filter((t) => t !== token);
  if (others.length) links.push(`<button type="button" data-act="switch" class="w-btn w-btn--ghost w-btn--sm"><i data-icon="refresh-cw"></i> Andere Runde <span id="switch-dot" class="ui-dot hidden"></span></button>`);
  links.push(`<button type="button" id="push-btn" class="hidden w-btn w-btn--ghost w-btn--sm" title="Bei neuen Nachrichten benachrichtigt werden"><i data-icon="bell"></i> Benachrichtigungen</button>`);
  return `<div class="flex flex-wrap gap-2" id="w-nav">${links.join("")}</div><div id="w-switch" class="hidden w-card space-y-2"></div>`;
}

async function fetchRound(t) {
  try {
    const r = await fetch(`/api/wichteln/p/${encodeURIComponent(t)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}
async function showSwitcher() {
  const box = document.getElementById("w-switch");
  box.classList.toggle("hidden");
  if (box.classList.contains("hidden") || box.dataset.loaded) return;
  box.innerHTML = `<p class="text-sm text-slate-400">Lade Runden …</p>`;
  const rows = [];
  for (const t of knownTokens()) {
    const d = t === token ? data : await fetchRound(t);
    if (!d) continue;
    const unread = (d.recipient?.unread || 0) + (d.santa?.unread || 0);
    rows.push(`<a href="/w/${encodeURIComponent(t)}" class="w-btn w-btn--ghost w-full justify-between ${t === token ? "opacity-60" : ""}"><span>${esc(d.group.title)} <span class="text-xs text-slate-400">· als ${esc(d.me.name)}${t === token ? " (aktuell)" : ""}</span></span>${unread ? `<span class="ui-badge">${unread}</span>` : ""}</a>`);
  }
  box.innerHTML = `<h3 class="font-semibold text-white">Deine Wichtel-Runden auf diesem Gerät</h3>${rows.join("") || `<p class="text-sm text-slate-400">Keine weiteren Runden gefunden.</p>`}`;
  box.dataset.loaded = "1";
}
// A red dot on "Andere Runde" when another round has unread messages.
async function checkOtherRounds() {
  const others = knownTokens().filter((t) => t !== token);
  if (!others.length) return;
  let unread = 0;
  for (const t of others) {
    const d = await fetchRound(t);
    if (d) unread += (d.recipient?.unread || 0) + (d.santa?.unread || 0);
  }
  const dot = document.getElementById("switch-dot");
  if (dot) dot.classList.toggle("hidden", unread === 0);
}

function headerCard() {
  const g = data.group;
  const chips = [
    g.eventDate ? `<span class="w-chip"><i data-icon="calendar"></i> ${esc(eventLine(g))}</span>` : "",
    g.budget ? `<span class="w-chip"><i data-icon="wallet"></i> ${esc(g.budget)}</span>` : "",
    g.motto ? `<span class="w-chip"><i data-icon="palette"></i> ${esc(g.motto)}</span>` : "",
  ].filter(Boolean).join(" ");
  return `<div class="w-card" id="start">
    <p class="text-xs text-emerald-300 uppercase tracking-widest font-semibold">Wichteln</p>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <h1 class="w-title text-3xl">${esc(g.title)}</h1>
      <span class="text-sm text-slate-400">Hallo <b class="text-white">${esc(data.me.name)}</b> <i data-icon="hand"></i></span>
    </div>
    ${chips ? `<div class="flex flex-wrap gap-2 mt-3">${chips}</div>` : ""}
    ${g.description ? `<p class="text-sm text-slate-300 mt-3 whitespace-pre-line">${esc(g.description)}</p>` : ""}
    ${data.me.icsUrl ? `<div class="mt-4"><a href="${esc(data.me.icsUrl)}" class="w-btn w-btn--ghost w-btn--sm"><i data-icon="calendar"></i> In meinen Kalender eintragen</a><span class="text-xs text-slate-500 ml-2">mit Motto, Budget, Wichtelkind und Erinnerung am Vortag</span></div>` : ""}
  </div>`;
}

// Shown once: how to get back to this page.
const WELCOME_KEY = `wichtel_welcome_${token}`;
function welcomeCard() {
  if (store.get(WELCOME_KEY) && !query.has("welcome")) return "";
  const link = window.location.origin + window.location.pathname;
  return `<div class="w-card w-card--soft" id="welcome-card">
    <div class="flex items-start gap-3">
      <div class="text-2xl text-emerald-300"><i data-icon="key"></i></div>
      <div class="flex-1 min-w-0">
        <h2 class="font-semibold text-white">Das ist dein persönlicher Zugang</h2>
        <p class="text-sm text-slate-300 mt-1">${data.me.email ? "Du bekommst ihn auch per E-Mail. " : "Du hast keine E-Mail angegeben, also: "}Speichere dir diesen Link, er ist dein Schlüssel zu dieser Runde${window.__NATIVE_APP ? " – in der App bleibt er unter „Andere Runde“ gespeichert" : ""}.</p>
        <p class="text-xs text-slate-400 break-all mt-2 bg-black/20 rounded-lg p-2 font-mono">${esc(link)}</p>
        <div class="flex flex-wrap gap-2 mt-3">
          <button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="copy-link"><i data-icon="copy"></i> Kopieren</button>
          ${UI.canShare() ? `<button type="button" class="w-btn w-btn--ghost w-btn--sm" data-act="share-link"><i data-icon="share-2"></i> An mich schicken</button>` : ""}
          <button type="button" class="w-btn w-btn--primary w-btn--sm" data-act="welcome-done"><i data-icon="check"></i> Verstanden</button>
        </div>
      </div>
    </div>
  </div>`;
}
function bindWelcome() {
  const card = document.getElementById("welcome-card");
  if (!card) return;
  const link = window.location.origin + window.location.pathname;
  card.querySelector("[data-act='copy-link']").addEventListener("click", () => UI.copy(link));
  const share = card.querySelector("[data-act='share-link']");
  if (share) share.addEventListener("click", () => UI.share({ title: `Wichteln: ${data.group.title}`, text: `Mein Wichtel-Zugang für „${data.group.title}“`, url: link }));
  card.querySelector("[data-act='welcome-done']").addEventListener("click", () => {
    store.set(WELCOME_KEY, "1");
    card.remove();
    if (query.has("welcome")) window.history.replaceState({}, "", window.location.pathname + window.location.hash);
  });
}

function stepper() {
  const g = data.group;
  const drawn = isDrawn();
  const cls = (i) => (i === 0 ? "is-done" : i === 1 ? (drawn ? "is-done" : "is-current") : g.eventPassed || g.status === "revealed" ? "is-done" : drawn ? "is-current" : "");
  return `<div class="w-steps px-1">
    <div class="w-step ${cls(0)}">1 · Eingetragen</div>
    <div class="w-step ${cls(1)}">2 · Auslosung${drawn ? ' <i data-icon="check"></i>' : " steht aus"}</div>
    <div class="w-step ${cls(2)}">3 · Bescherung${g.eventDate ? ` ${formatDate(g.eventDate)}` : ""}</div>
  </div>`;
}

// Sticky anchor menu with unread badges.
function sectionNav() {
  const items = [
    ["#wichtelkind", "gift", "Wichtelkind", 0],
    feat().wishlist || feat().hints ? ["#wunschzettel", "clipboard-list", "Wünsche", 0] : ["#wunschzettel", "bell", "Benachrichtigung", 0],
    feat().chat || !data.group.chatEnabled ? ["#chat", "message-circle", "Chat", unreadTotal()] : null,
    ["#rueckblick", "camera", "Rückblick", 0],
  ].filter(Boolean);
  return `<nav class="w-secnav" aria-label="Bereiche">${items.map(([href, ic, label, badge]) => `<a href="${href}" class="w-secnav__item"><i data-icon="${ic}"></i><span>${label}</span>${badge ? `<span class="ui-badge">${badge}</span>` : ""}</a>`).join("")}</nav>`;
}

function notDrawnCard() {
  return `<div class="w-card w-card--gift text-center">
    <div class="ui-empty__art text-emerald-300"><i data-icon="dices"></i></div>
    <h2 class="w-title text-xl">Die Auslosung steht noch aus</h2>
    <p class="text-slate-300 text-sm mt-2">Sobald der Organisator auslost, erfährst du hier${data.me.email ? " und per E-Mail" : ""}, wen du beschenkst. Nutze die Zeit für deinen Wunschzettel!</p>
    <a href="#wunschzettel" class="w-btn w-btn--primary w-btn--sm mt-4"><i data-icon="clipboard-list"></i> Zum Wunschzettel</a>
  </div>`;
}

function wishItem(w, editable) {
  return `<div class="w-wish" data-wish="${esc(w.id)}">
    ${w.image ? `<img src="${esc(w.image)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'w-wish-ph\\'>'+icon('gift')+'</div>'">` : `<div class="w-wish-ph"><i data-icon="gift"></i></div>`}
    <div class="flex-1 min-w-0">
      ${w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener nofollow" class="w-wish-title block truncate">${esc(w.title || w.url)}</a>` : `<div class="w-wish-title truncate">${esc(w.title)}</div>`}
      <div class="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">${w.price ? `<span class="text-emerald-300 font-semibold">${esc(w.price)}</span>` : ""}${!editable ? priceTag(w) : ""}${w.note ? `<span>${esc(w.note)}</span>` : ""}</div>
      ${w.url ? `<div class="text-[11px] text-slate-500 truncate">${esc(new URL(w.url).hostname)}</div>` : ""}
    </div>
    ${editable ? `<button class="w-btn w-btn--ghost w-btn--sm self-start" data-act="remove-wish" data-id="${esc(w.id)}" title="Entfernen"><i data-icon="x"></i></button>` : ""}
  </div>`;
}

function hintsBlock(h) {
  const rows = [
    h.allergies ? [`<i data-icon="ban"></i> Allergien / No-Gos`, h.allergies] : null,
    h.favorites ? [`<i data-icon="smile"></i> Lieblingsgeschmack`, h.favorites] : null,
    h.hobbies ? [`<i data-icon="target"></i> Hobbys`, h.hobbies] : null,
    h.notes ? [`<i data-icon="lightbulb"></i> Sonstiges`, h.notes] : null,
  ].filter(Boolean);
  if (!rows.length) return `<p class="text-sm text-slate-500">Keine Hinweise hinterlegt.</p>`;
  return `<dl class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">${rows.map(([k, v]) => `<div class="bg-black/20 rounded-xl p-3"><dt class="text-xs text-slate-400">${k}</dt><dd class="text-slate-100 mt-0.5 whitespace-pre-line">${esc(v)}</dd></div>`).join("")}</dl>`;
}

function chatBlock(messages, channel, placeholder) {
  const rows = [];
  let lastDay = "";
  let lastMineIdx = -1;
  messages.forEach((m, i) => { if (m.mine) lastMineIdx = i; });
  messages.forEach((m, i) => {
    const day = dayLabel(m.at);
    if (day !== lastDay) { rows.push(`<div class="w-msg-day">${day}</div>`); lastDay = day; }
    const status = m.mine && i === lastMineIdx ? ` · ${m.read ? `Gelesen <i data-icon="check"></i>` : "Zugestellt"}` : "";
    rows.push(`<div class="w-msg ${m.mine ? "is-mine" : "is-theirs"}">${esc(m.text)}<small>${esc(m.from)} · ${timeAgo(m.at)}${status}</small></div>`);
  });
  return `<div class="w-chat" id="chat-${channel}">
      ${rows.length ? rows.join("") : `<p class="text-xs text-slate-500 text-center py-3">Noch keine Nachrichten – schreib die erste.</p>`}
    </div>
    <form class="flex gap-2 mt-2" data-chat="${channel}">
      <input name="text" maxlength="1000" required class="w-input" placeholder="${esc(placeholder)}" autocomplete="off">
      <button class="w-btn w-btn--primary" aria-label="Senden"><i data-icon="check"></i><span class="hidden sm:inline">Senden</span></button>
    </form>`;
}

function recipientCard() {
  const r = data.recipient;
  const gs = data.me.giftStatus;
  const b = budgetInfo();
  const inBudget = b ? r.wishlist.filter((w) => { const p = parseAmount(w.price); return p !== null && p <= b.max; }).length : 0;
  const ideas = giftIdeas(r);
  return `<div class="w-card w-card--gift">
    <p class="text-xs text-emerald-300 uppercase tracking-widest font-semibold">Du beschenkst</p>
    <div class="w-big-name mt-1"><i data-icon="gift"></i> ${esc(r.name)}</div>
    <p class="text-xs text-slate-400 mt-1">Psst – das bleibt unter uns.</p>

    ${b ? `<div class="w-budget mt-4"><i data-icon="wallet"></i> <span>Budget <b>${esc(data.group.budget)}</b>${r.wishlist.length ? ` · ${inBudget} von ${r.wishlist.length} Wünschen ${inBudget === 1 ? "passt" : "passen"} ins Budget` : ""}</span></div>` : ""}

    ${feat().wishlist ? `<h3 class="font-semibold text-white mt-5 mb-2">Wunschzettel von ${esc(r.name)}</h3>
    ${r.wishlist.length ? `<div class="space-y-2">${r.wishlist.map((w) => wishItem(w, false)).join("")}</div>` : emptyState("clipboard-list", `Noch leer. Die Hinweise helfen dir, nicht ins Blaue zu kaufen${feat().chat ? ` – oder <a href="#chat" class="text-emerald-300 underline">frag anonym nach</a>` : ""}.`)}` : ""}

    ${feat().hints ? `<h3 class="font-semibold text-white mt-5 mb-2">Hinweise</h3>
    ${hintsBlock(r.hints)}` : ""}

    <h3 class="font-semibold text-white mt-5 mb-2"><i data-icon="lightbulb"></i> Ideen${r.hints?.hobbies || r.hints?.favorites ? " aus den Hinweisen" : ""}</h3>
    <div class="flex flex-wrap gap-2">${ideas.map((i) => `<span class="w-chip w-chip--idea">${esc(i)}</span>`).join("")}</div>

    <h3 class="font-semibold text-white mt-5 mb-1">Dein Geschenk-Status</h3>
    <p class="text-xs text-slate-400 mb-2">Persönliche Übergabe oder Versand per Post – hak ab, wie weit du bist. ${esc(r.name)} sieht nur die Vorfreude-Anzeige, nie von wem sie kommt.</p>
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <select id="gift-method" class="w-input" style="width:auto">
        <option value="personal" ${gs.method === "personal" ? "selected" : ""}>Persönliche Übergabe</option>
        <option value="post" ${gs.method === "post" ? "selected" : ""}>Versand per Post</option>
      </select>
      <div class="flex-1 min-w-[140px]"><div class="w-progress"><div style="width:${Math.round((gs.done / gs.total) * 100)}%"></div></div></div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2">${gs.steps.map((s) => `<label class="w-check"><input type="checkbox" data-step="${s.key}" ${s.done ? "checked" : ""}> <span>${esc(s.label)}</span></label>`).join("")}</div>
  </div>`;
}

// What is left to do after the draw – a short, honest list.
function todoCard() {
  const r = data.recipient;
  const g = data.group;
  const gs = data.me.giftStatus;
  const items = [
    { done: true, text: `Dein Los: ${r.name}` },
    feat().wishlist ? { done: r.wishlist.length > 0 || Object.values(r.hints || {}).some(Boolean), text: r.wishlist.length ? `Wunschzettel von ${r.name} angeschaut (${r.wishlist.length} ${r.wishlist.length === 1 ? "Wunsch" : "Wünsche"})` : `${r.name} hat noch nichts eingetragen${feat().chat ? " – frag anonym nach" : ""}`, href: r.wishlist.length ? "#wichtelkind" : "#chat" } : null,
    feat().wishlist ? { done: data.me.wishlist.length > 0, text: data.me.wishlist.length ? "Dein eigener Wunschzettel ist gefüllt" : "Deinen eigenen Wunschzettel füllen", href: "#wunschzettel" } : null,
    { done: gs.done > 0, text: gs.done ? `Geschenk: ${gs.done} von ${gs.total} Schritten` : "Geschenk besorgen und Status abhaken", href: "#wichtelkind" },
    g.eventDate ? { done: g.eventPassed, text: `Bescherung: ${eventLine(g)}`, href: data.me.icsUrl || "" } : null,
  ].filter(Boolean);
  return `<div class="w-card w-card--soft">
    <h3 class="font-semibold text-white mb-2"><i data-icon="clipboard-list"></i> Deine nächsten Schritte</h3>
    <ul class="w-todo">${items.map((i) => `<li class="${i.done ? "is-done" : ""}">${i.done ? icon("circle-check") : icon("circle")} ${i.href ? `<a href="${esc(i.href)}">${esc(i.text)}</a>` : esc(i.text)}</li>`).join("")}</ul>
  </div>`;
}

function myWishlistCard() {
  const me = data.me;
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="clipboard-list"></i> Dein Wunschzettel</h2>
    <p class="text-sm text-slate-400 mt-1">Einfach eintippen und Enter drücken. Du kannst auch einen Link aus dem Online-Shop einfügen – Titel und Bild holen wir dann automatisch.</p>
    <div class="space-y-2 mt-3" id="my-wishes">${me.wishlist.length ? me.wishlist.map((w) => wishItem(w, true)).join("") : emptyState("gift", "Noch keine Wünsche. Was würde dich freuen?")}</div>
    <form id="wish-form" class="mt-4 space-y-2 bg-black/20 rounded-2xl p-3">
      <div class="flex gap-2">
        <input name="title" maxlength="140" required class="w-input" placeholder="Was wünschst du dir? (oder Link einfügen)" autocomplete="off">
        <button class="w-btn w-btn--primary whitespace-nowrap" aria-label="Wunsch hinzufügen"><i data-icon="check"></i><span class="hidden sm:inline">Hinzufügen</span></button>
      </div>
      <button type="button" id="wish-more" class="text-xs text-slate-400 hover:text-white"><i data-icon="pencil"></i> Preis, Link oder Notiz ergänzen</button>
      <div id="wish-details" class="hidden space-y-2">
        <div class="flex gap-2">
          <input name="url" type="url" class="w-input" placeholder="Link zum Produkt im Online-Shop">
          <button type="button" id="wish-preview" class="w-btn w-btn--ghost whitespace-nowrap">Vorschau</button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="price" maxlength="20" class="w-input" placeholder="Preis, z. B. 19.90">
          <input name="note" maxlength="300" class="w-input" placeholder="Notiz: Farbe, Größe, Alternative …">
        </div>
        <input name="image" type="hidden">
        <div id="wish-preview-box" class="hidden"></div>
      </div>
    </form>
  </div>`;
}

function myHintsCard() {
  const me = data.me;
  const h = me.hints || {};
  const pro = feat().hints;
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="${pro ? "lightbulb" : "bell"}"></i> ${pro ? "Hinweise für deinen Wichtel" : "Benachrichtigungen"}</h2>
    <p class="text-sm text-slate-400 mt-1">${pro ? "Leerer Wunschzettel? Allergien, Lieblingsgeschmack und Hobbys geben deinem Wichtel Anhaltspunkte." : "Wir sagen dir Bescheid, wenn es in der Runde etwas Neues gibt."}</p>
    <form id="hints-form" class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
      ${pro ? `<input name="allergies" maxlength="300" class="w-input" placeholder="Allergien / No-Gos" value="${esc(h.allergies || "")}">
      <input name="favorites" maxlength="300" class="w-input" placeholder="Lieblingsgeschmack" value="${esc(h.favorites || "")}">
      <input name="hobbies" maxlength="300" class="w-input" placeholder="Hobbys" value="${esc(h.hobbies || "")}">
      <input name="notes" maxlength="500" class="w-input" placeholder="Sonstiges" value="${esc(h.notes || "")}">` : ""}
      <div class="sm:col-span-2 ${pro ? "border-t border-white/10 pt-3 mt-1" : ""} grid sm:grid-cols-2 gap-2 items-center">
        <input name="email" type="email" class="w-input" placeholder="E-Mail für Benachrichtigungen" value="${esc(me.email || "")}">
        <label class="w-check"><input type="checkbox" name="notifyEmail" ${me.notify.email !== false ? "checked" : ""}> <span class="text-sm">Bei neuer Nachricht, geändertem Wunschzettel oder neuem Termin informieren (E-Mail und, falls aktiv, Push)</span></label>
      </div>
      <div class="sm:col-span-2 flex items-center gap-3"><button class="w-btn w-btn--primary">Speichern</button><span id="hints-saved" class="hidden text-sm text-emerald-300">Gespeichert <i data-icon="check"></i></span></div>
    </form>
  </div>`;
}

// Family mode: everybody's wishes are visible to everybody.
function sharedWishlistsCard() {
  if (!data.wishlists) return "";
  const lists = data.wishlists.filter((p) => p.wishlist.length);
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="users"></i> Wunschzettel der anderen</h2>
    <p class="text-sm text-slate-400 mt-1">In dieser Runde sind alle Wunschzettel für alle sichtbar.</p>
    ${lists.length ? lists.map((p) => `<details class="w-details mt-3"><summary>${esc(p.name)} <span class="text-xs text-slate-400">· ${p.wishlist.length} ${p.wishlist.length === 1 ? "Wunsch" : "Wünsche"}</span></summary><div class="space-y-2 mt-2">${p.wishlist.map((w) => wishItem(w, false)).join("")}</div></details>`).join("") : emptyState("clipboard-list", "Noch hat niemand etwas eingetragen.")}
  </div>`;
}

function chatSection() {
  const g = data.group;
  if (!g.chatEnabled) return `<div class="w-card">${emptyState("message-circle", "Der anonyme Chat ist in dieser Runde ausgeschaltet.")}</div>`;
  if (!feat().chat) return "";
  if (!isDrawn()) return `<div class="w-card"><h2 class="w-title text-xl"><i data-icon="message-circle"></i> Chat</h2>${emptyState("message-circle", "Der Chat öffnet nach der Auslosung: ein Kanal zu deinem Wichtelkind, einer zu deinem geheimen Wichtel.")}</div>`;
  const r = data.recipient;
  const s = data.santa;
  return `${r ? `<div class="w-card w-card--gift" id="chat-with-recipient">
    <h2 class="w-title text-xl flex items-center gap-2"><i data-icon="gift"></i> Mit ${esc(r.name)} ${unreadRecipient() ? `<span class="ui-badge">${unreadRecipient()}</span>` : ""}</h2>
    <p class="text-xs text-slate-400 mt-1 mb-2">Frag ${esc(r.name)} Löcher in den Bauch – ${esc(r.name)} sieht nur „Dein geheimer Wichtel“.</p>
    ${chatBlock(r.messages, "recipient", `Nachricht an ${r.name} …`)}
  </div>` : ""}
  ${s ? `<div class="w-card w-card--santa" id="chat-with-santa">
    <h2 class="w-title text-xl flex items-center gap-2"><i data-icon="drama"></i> Mit deinem geheimen Wichtel ${unreadSanta() ? `<span class="ui-badge">${unreadSanta()}</span>` : ""}</h2>
    <p class="text-xs text-slate-400 mt-1 mb-2">Dein Wichtel fragt, du antwortest – wer es ist, bleibt geheim.</p>
    ${chatBlock(s.messages, "santa", "Antwort an deinen geheimen Wichtel …")}
  </div>` : ""}`;
}

function santaCard() {
  const s = data.santa;
  const pct = Math.round((s.progress.done / s.progress.total) * 100);
  const mood = pct === 0 ? "Dein Wichtel ist noch am Grübeln …" : pct < 100 ? "Dein Wichtel ist dran – die Vorfreude steigt!" : "Dein Geschenk ist bereit.";
  return `<div class="w-card w-card--santa">
    <p class="text-xs text-rose-300 uppercase tracking-widest font-semibold">Dein geheimer Wichtel</p>
    <h2 class="w-title text-xl mt-1"><i data-icon="heart"></i> Jemand kümmert sich um dich</h2>
    <p class="text-sm text-slate-300 mt-3">${mood}</p>
    <div class="w-progress w-progress--santa mt-2"><div style="width:${pct}%"></div></div>
    <p class="text-xs text-slate-400 mt-1">${s.progress.done} von ${s.progress.total} Schritten (${s.progress.method === "post" ? "Versand per Post" : "persönliche Übergabe"})</p>
  </div>`;
}

function revealCard() {
  return `<div class="w-card w-card--reveal">
    <h2 class="w-title text-xl"><i data-icon="drama"></i> Die Auflösung</h2>
    <p class="text-sm text-slate-300 mt-1 mb-3">Nur für dich als Organisator sichtbar: wer wen beschenkt.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">${data.reveal.map((r) => `<div class="w-reveal-row"><span>${esc(r.giver)}</span><span class="text-slate-500">→</span><b>${esc(r.receiver)}</b></div>`).join("")}</div>
  </div>`;
}

function participantsCard() {
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="users"></i> Teilnehmende <span class="text-sm font-normal text-slate-400">(${data.participants.length})</span></h2>
    <div class="flex flex-wrap gap-2 mt-3">${data.participants.map((p) => `<span class="w-chip">${p.joined ? icon("circle-check", "text-emerald-300") : icon("circle", "text-slate-500")} ${esc(p.name)}${p.isOrganizer ? " <span class='text-slate-500'>· Orga</span>" : ""}${p.id === data.me.id ? " <span class='text-emerald-300'>(du)</span>" : ""}</span>`).join("")}</div>
  </div>`;
}

// Recap: thank-you notes and the photo wall.
function recapCard() {
  const g = data.group;
  const drawn = isDrawn();
  const thanks = data.thanks || [];
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent) || window.__NATIVE_APP;
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="camera"></i> Rückblick</h2>
    <p class="text-sm text-slate-400 mt-1">${g.eventPassed ? "Wie war's? Fotos und ein Dankeschön für die Runde." : "Nach der Bescherung ist hier Platz für Fotos und ein Dankeschön."}</p>

    <h3 class="font-semibold text-white mt-4 mb-2"><i data-icon="heart"></i> Danke sagen</h3>
    ${drawn ? `<form id="thanks-form" class="flex gap-2">
      <input name="text" maxlength="400" required class="w-input" placeholder="Ein paar Worte an die Runde oder deinen Wichtel …" autocomplete="off">
      <button class="w-btn w-btn--primary" aria-label="Senden"><i data-icon="check"></i></button>
    </form>` : `<p class="text-xs text-slate-500">Nach der Auslosung freigeschaltet.</p>`}
    <div class="space-y-2 mt-3" id="thanks-list">${thanks.length ? thanks.map((t) => `<div class="w-thanks">${esc(t.text)}<small>${esc(t.from)} · ${timeAgo(t.at)}</small></div>`).join("") : ""}</div>

    <h3 class="font-semibold text-white mt-5 mb-2"><i data-icon="image"></i> Foto-Wand</h3>
    <form id="photo-form" class="flex flex-wrap gap-2 items-center">
      <input name="caption" maxlength="140" class="w-input" style="flex:1;min-width:160px" placeholder="Bildunterschrift (optional)">
      ${mobile ? `<label class="w-btn w-btn--ghost"><i data-icon="camera"></i> Aufnehmen<input type="file" name="photo-camera" accept="image/*" capture="environment" class="sr-only"></label>` : ""}
      <label class="w-btn w-btn--primary"><i data-icon="image"></i> ${mobile ? "Galerie" : "Foto hochladen"}<input type="file" name="photo" accept="image/png,image/jpeg,image/gif,image/webp" class="sr-only"></label>
    </form>
    <p class="text-xs text-slate-500 mt-1">Wird direkt nach der Auswahl hochgeladen. Nur für die Runde sichtbar, wird mit der Runde gelöscht.</p>
    <div class="w-photos mt-4">${data.photos.length ? data.photos.map((ph) => `<figure class="w-photo"><a href="${esc(ph.url)}" target="_blank"><img src="${esc(ph.url)}" alt="${esc(ph.caption || "")}" loading="lazy"></a>${ph.caption || ph.by ? `<figcaption>${esc(ph.caption || "")}${ph.by ? ` <span class="opacity-70">– ${esc(ph.by)}</span>` : ""}</figcaption>` : ""}${ph.mine ? `<button data-act="remove-photo" data-id="${esc(ph.id)}" title="Löschen"><i data-icon="x"></i></button>` : ""}</figure>`).join("") : `<div class="col-span-full">${emptyState("image", "Noch keine Fotos – nach der Bescherung ist hier Platz.")}</div>`}</div>
  </div>`;
}

function footerCard() {
  const g = data.group;
  return `<p class="text-center text-xs text-slate-500 pb-6">
    ${g.deleteAt ? `Diese Runde wird am ${new Date(g.deleteAt).toLocaleDateString("de-DE")} automatisch und spurlos gelöscht – samt Fotos, Nachrichten und Wünschen.<br>` : ""}
    Dein Zugang ist dieser Link – speichere ihn dir.${g.organizerName ? ` Organisiert von ${esc(g.organizerName)}.` : ""}
  </p>`;
}

// ── Events ──────────────────────────────────────────────────────────────────
function bindNav() {
  const back = document.querySelector("#w-nav [data-act='back']");
  if (back) back.addEventListener("click", (e) => { e.preventDefault(); window.history.back(); });
  const sw = document.querySelector("#w-nav [data-act='switch']");
  if (sw) sw.addEventListener("click", showSwitcher);
}

function jumpToHash() {
  const id = (window.location.hash || "").slice(1);
  if (!id) return;
  const el = document.getElementById(id);
  if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}
window.addEventListener("hashchange", jumpToHash);

async function markRead(channel) {
  const chan = channel === "santa" ? data.santa : data.recipient;
  if (!chan || !chan.unread) return;
  chan.unread = 0;
  document.querySelectorAll(".w-secnav .ui-badge, #chat .ui-badge").forEach((b) => b.remove());
  try { data = await req("PUT", "/read", { channel }); } catch (_) { /* next poll */ }
}
function watchChatVisibility() {
  if (!("IntersectionObserver" in window)) return;
  const obs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const channel = en.target.id === "chat-with-santa" ? "santa" : "recipient";
      markRead(channel);
    }
  }, { threshold: 0.6 });
  document.querySelectorAll("#chat-with-recipient, #chat-with-santa").forEach((el) => obs.observe(el));
}

function bindEvents() {
  bindNav();
  bindWelcome();
  document.querySelectorAll(".w-chat").forEach((c) => (c.scrollTop = c.scrollHeight));
  watchChatVisibility();

  document.querySelectorAll("form[data-chat]").forEach((form) => {
    form.elements.text.addEventListener("focus", () => markRead(form.dataset.chat));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = form.elements.text.value.trim();
      if (!text) return;
      try {
        data = await req("POST", "/messages", { channel: form.dataset.chat, text });
        haptic("light");
        render();
        maybeAskPush();
        const again = document.querySelector(`form[data-chat='${form.dataset.chat}'] [name=text]`);
        if (again && window.innerWidth >= 640) again.focus();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  const method = document.getElementById("gift-method");
  if (method) {
    const save = async () => {
      const steps = [...document.querySelectorAll("input[data-step]:checked")].map((i) => i.dataset.step);
      try {
        data = await req("PUT", "/gift-status", { method: method.value, steps });
        haptic("light");
        render();
      } catch (err) {
        toast(err.message, true);
      }
    };
    method.addEventListener("change", save);
    document.querySelectorAll("input[data-step]").forEach((i) => i.addEventListener("change", save));
  }

  const wishForm = document.getElementById("wish-form");
  if (wishForm) {
    const details = document.getElementById("wish-details");
    document.getElementById("wish-more").addEventListener("click", () => {
      details.classList.toggle("hidden");
      if (!details.classList.contains("hidden")) wishForm.elements.url.focus();
    });
    const looksLikeUrl = (v) => /^https?:\/\/\S+$/i.test(v.trim());
    async function loadPreview(url) {
      const f = wishForm.elements;
      const btn = document.getElementById("wish-preview");
      btn.disabled = true;
      btn.textContent = "Lade …";
      try {
        const p = await req("POST", "/link-preview", { url });
        if (!f.title.value || looksLikeUrl(f.title.value)) f.title.value = p.title || "";
        if (!f.price.value && p.price) f.price.value = p.price;
        f.image.value = p.image || "";
        f.url.value = url;
        details.classList.remove("hidden");
        const box = document.getElementById("wish-preview-box");
        box.classList.remove("hidden");
        box.innerHTML = `<div class="w-wish">${p.image ? `<img src="${esc(p.image)}" alt="">` : `<div class="w-wish-ph"><i data-icon="link"></i></div>`}<div class="min-w-0"><div class="w-wish-title truncate">${esc(p.title || url)}</div><div class="text-xs text-slate-400">${esc(p.note || "Vorschau geladen – Titel und Preis kannst du anpassen.")}</div></div></div>`;
        return p;
      } catch (err) {
        toast(err.message, true);
        return null;
      } finally {
        btn.disabled = false;
        btn.textContent = "Vorschau";
      }
    }
    // A pasted shop link in the main field turns into a wish with preview.
    wishForm.elements.title.addEventListener("paste", () => setTimeout(() => {
      const v = wishForm.elements.title.value.trim();
      if (looksLikeUrl(v)) loadPreview(v);
    }, 0));
    wishForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = wishForm.elements;
      let title = f.title.value.trim();
      let url = f.url.value.trim();
      if (looksLikeUrl(title) && !url) {
        url = title;
        const p = await loadPreview(url);
        title = (p && p.title) || new URL(url).hostname;
      }
      const item = { id: `w${Date.now().toString(36)}`, url, title, price: f.price.value.trim(), note: f.note.value.trim(), image: f.image.value };
      try {
        data = await req("PUT", "/wishlist", { wishlist: [...data.me.wishlist, item] });
        haptic("success");
        render();
        toast("Wunsch gespeichert");
        maybeAskPush();
        const again = document.querySelector("#wish-form [name=title]");
        if (again && window.innerWidth >= 640) again.focus();
      } catch (err) {
        toast(err.message, true);
      }
    });
    document.getElementById("wish-preview").addEventListener("click", () => {
      const url = wishForm.elements.url.value.trim();
      if (!url) return toast("Bitte zuerst einen Link einfügen.", true);
      loadPreview(url);
    });
    document.getElementById("my-wishes").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act='remove-wish']");
      if (!btn) return;
      try {
        data = await req("PUT", "/wishlist", { wishlist: data.me.wishlist.filter((w) => w.id !== btn.dataset.id) });
        render();
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  document.getElementById("hints-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    try {
      data = await req("PUT", "/profile", {
        email: f.email.value.trim(),
        ...(f.allergies ? { hints: { allergies: f.allergies.value, favorites: f.favorites.value, hobbies: f.hobbies.value, notes: f.notes.value } } : {}),
        notify: { email: f.notifyEmail.checked, push: f.notifyEmail.checked },
      });
      const ok = document.getElementById("hints-saved");
      ok.classList.remove("hidden");
      setTimeout(() => ok.classList.add("hidden"), 1500);
      maybeAskPush();
    } catch (err) {
      toast(err.message, true);
    }
  });

  const thanksForm = document.getElementById("thanks-form");
  if (thanksForm) thanksForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = thanksForm.elements.text.value.trim();
    if (!text) return;
    try {
      data = await req("POST", "/thanks", { text });
      haptic("success");
      render();
      toast("Danke gesagt");
    } catch (err) {
      toast(err.message, true);
    }
  });

  const photoForm = document.getElementById("photo-form");
  photoForm.querySelectorAll("input[type=file]").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("photo", file, file.name || "foto.jpg");
    fd.append("caption", photoForm.elements.caption.value);
    toast("Lade hoch …");
    try {
      data = await req("POST", "/photos", fd, true);
      haptic("success");
      render();
      toast("Foto hochgeladen");
    } catch (err) {
      toast(err.message, true);
      input.value = "";
    }
  }));
  document.querySelectorAll("button[data-act='remove-photo']").forEach((b) => b.addEventListener("click", async () => {
    if (!(await UI.confirm({ title: "Foto löschen?", text: "Das Foto verschwindet für alle aus der Foto-Wand.", ok: "Löschen", danger: true }))) return;
    try {
      data = await req("DELETE", `/photos/${b.dataset.id}`);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }));
}

// Keep chats and the waiting room fresh without a socket.
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (document.hidden || navigator.onLine === false || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    try {
      const fresh = await req("GET", "");
      if (JSON.stringify(fresh) !== JSON.stringify(data)) {
        const gotMessage = ((fresh.recipient?.unread || 0) + (fresh.santa?.unread || 0)) > unreadTotal();
        data = fresh;
        render();
        if (gotMessage) haptic("light");
      }
    } catch (_) { /* keep old state */ }
  }, 20000);
}
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || isJoin || !data) return;
  try { const fresh = await req("GET", ""); if (JSON.stringify(fresh) !== JSON.stringify(data)) { data = fresh; render(); } } catch (_) { /* ignore */ }
});

(async () => {
  try {
    if (isJoin) await renderJoin();
    else {
      await load();
      startPolling();
    }
  } catch (err) {
    app.innerHTML = `<div class="w-card text-center"><div class="ui-empty__art"><i data-icon="eye-off"></i></div><h1 class="w-title text-xl mb-2">Link ungültig</h1><p class="text-slate-400">${esc(err.message)}</p></div>`;
  }
})();
