// Wichteln participant area. Served at /w/:token (participant) and /w/join/:inviteToken (join).
const parts = window.location.pathname.split("/").filter(Boolean); // ["w", "join", token] or ["w", token]
const isJoin = parts[1] === "join";
const token = isJoin ? parts[2] : parts[1];
const API = isJoin ? `/api/wichteln/join/${encodeURIComponent(token || "")}` : `/api/wichteln/p/${encodeURIComponent(token || "")}`;

let data = null;
let pollTimer = null;
const app = document.getElementById("app");

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
let toastTimer = null;
function toast(msg, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.toggle("is-error", isError);
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2800);
}

async function req(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (isForm) opts.body = body;
    else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  const r = await fetch(`${API}${path}`, opts);
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `Fehler ${r.status}`);
  return json;
}

// Remember every round this browser joined so the person can get back to it.
function rememberToken(t) {
  try {
    const list = JSON.parse(localStorage.getItem("wichtel_tokens") || "[]");
    if (!list.includes(t)) localStorage.setItem("wichtel_tokens", JSON.stringify([...list, t].slice(-10)));
  } catch (_) { /* ignore */ }
}

// ── Join page ───────────────────────────────────────────────────────────────
async function renderJoin() {
  let info;
  try {
    info = await req("GET", "");
  } catch (err) {
    app.innerHTML = `<div class="w-card text-center"><div class="text-4xl mb-3 text-slate-500"><i data-icon="eye-off"></i></div><h1 class="w-title text-xl mb-2">Einladung nicht gefunden</h1><p class="text-slate-400">${esc(err.message)}</p></div>`;
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
      ? `<div class="w-card text-center"><p class="text-amber-300 font-semibold">Die Auslosung ist schon gelaufen.</p><p class="text-sm text-slate-400 mt-1">Frag den Organisator – er kann neu auslosen und dich mitnehmen.</p></div>`
      : `<form id="join-form" class="w-card space-y-3">
          <h2 class="w-title text-lg">Ich bin dabei!</h2>
          <div><label class="block text-sm text-slate-300 mb-1">Dein Name</label><input name="name" required maxlength="60" class="w-input" placeholder="So sehen dich die anderen" autofocus></div>
          <div><label class="block text-sm text-slate-300 mb-1">E-Mail <span class="text-slate-500">(optional)</span></label><input name="email" type="email" class="w-input" placeholder="für dein Los und Benachrichtigungen"><p class="text-xs text-slate-500 mt-1">Ohne E-Mail: Speichere dir nach dem Eintragen deinen persönlichen Link – er ist dein Zugang.</p></div>
          ${info.waitingRoom ? `<p class="text-xs text-slate-400"><i data-icon="lightbulb"></i> Diese Runde hat einen Warteraum: Der Organisator gibt dich frei, danach bist du dabei.</p>` : ""}
          <p id="join-error" class="hidden text-sm text-rose-400"></p>
          <button class="w-btn w-btn--primary w-full">Eintragen</button>
        </form>`}`;
  const form = document.getElementById("join-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const errEl = document.getElementById("join-error");
    errEl.classList.add("hidden");
    try {
      const r = await req("POST", "", { name: fd.get("name"), email: fd.get("email") });
      rememberToken(r.token);
      window.location.href = `/w/${r.token}`;
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    }
  });
}

// ── Participant page ────────────────────────────────────────────────────────
async function load() {
  data = await req("GET", "");
  rememberToken(token);
  document.title = `Wichteln: ${data.group.title}`;
  render();
}

function render() {
  const { group: g, me } = data;
  if (me.pending) {
    app.innerHTML = `${navBar()}${headerCard()}
      <div class="w-card text-center">
        <div class="text-5xl mb-3 text-amber-300"><i data-icon="hourglass"></i></div>
        <h2 class="w-title text-xl">Du bist im Warteraum</h2>
        <p class="text-slate-300 mt-2">Der Organisator gibt dich gleich frei. Diese Seite prüft das automatisch.</p>
        <p class="text-xs text-slate-500 mt-4">Speichere dir diesen Link: <span class="text-slate-300 break-all">${esc(window.location.href)}</span></p>
      </div>`;
    bindNav();
    return;
  }
  const drawn = g.status !== "draft";
  app.innerHTML = [
    navBar(),
    headerCard(),
    stepper(),
    data.reveal ? revealCard() : "",
    drawn && data.recipient ? recipientCard() : notDrawnCard(),
    myWishlistCard(),
    myHintsCard(),
    drawn && data.santa ? santaCard() : "",
    participantsCard(),
    photosCard(),
    footerCard(),
  ].join("");
  bindEvents();
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
  let known = [];
  try { known = JSON.parse(localStorage.getItem("wichtel_tokens") || "[]"); } catch (_) {}
  const others = known.filter((t) => t !== token);
  if (others.length) links.push(`<button type="button" data-act="switch" class="w-btn w-btn--ghost w-btn--sm"><i data-icon="refresh-cw"></i> Andere Runde</button>`);
  if (!links.length) return "";
  return `<div class="flex flex-wrap gap-2" id="w-nav">${links.join("")}</div><div id="w-switch" class="hidden w-card space-y-2"></div>`;
}

async function showSwitcher() {
  const box = document.getElementById("w-switch");
  box.classList.toggle("hidden");
  if (box.classList.contains("hidden") || box.dataset.loaded) return;
  box.innerHTML = `<p class="text-sm text-slate-400">Lade Runden …</p>`;
  let known = [];
  try { known = JSON.parse(localStorage.getItem("wichtel_tokens") || "[]"); } catch (_) {}
  const rows = [];
  for (const t of known) {
    try {
      const r = await fetch(`/api/wichteln/p/${encodeURIComponent(t)}`);
      if (!r.ok) continue;
      const d = await r.json();
      rows.push(`<a href="/w/${encodeURIComponent(t)}" class="block w-btn w-btn--ghost w-full ${t === token ? "opacity-60" : ""}">${esc(d.group.title)} <span class="text-xs text-slate-400">· als ${esc(d.me.name)}${t === token ? " (aktuell)" : ""}</span></a>`);
    } catch (_) { /* skip dead links */ }
  }
  box.innerHTML = `<h3 class="font-semibold text-white">Deine Wichtel-Runden auf diesem Gerät</h3>${rows.join("") || `<p class="text-sm text-slate-400">Keine weiteren Runden gefunden.</p>`}`;
  box.dataset.loaded = "1";
}

function headerCard() {
  const g = data.group;
  const chips = [
    g.eventDate ? `<span class="w-chip"><i data-icon="calendar"></i> ${esc(eventLine(g))}</span>` : "",
    g.budget ? `<span class="w-chip"><i data-icon="wallet"></i> ${esc(g.budget)}</span>` : "",
    g.motto ? `<span class="w-chip"><i data-icon="palette"></i> ${esc(g.motto)}</span>` : "",
  ].filter(Boolean).join(" ");
  return `<div class="w-card">
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

function stepper() {
  const g = data.group;
  const drawn = g.status !== "draft";
  const eventPast = g.eventDate && new Date(`${g.eventDate}T23:59:59`) < new Date();
  const cls = (i) => (i === 0 ? "is-done" : i === 1 ? (drawn ? "is-done" : "is-current") : eventPast || g.status === "revealed" ? "is-done" : drawn ? "is-current" : "");
  return `<div class="w-steps px-1">
    <div class="w-step ${cls(0)}">1 · Eingetragen</div>
    <div class="w-step ${cls(1)}">2 · Auslosung${drawn ? ' <i data-icon="check"></i>' : " steht aus"}</div>
    <div class="w-step ${cls(2)}">3 · Bescherung${g.eventDate ? ` ${formatDate(g.eventDate)}` : ""}</div>
  </div>`;
}

function notDrawnCard() {
  return `<div class="w-card w-card--gift text-center">
    <div class="text-4xl mb-2 text-emerald-300"><i data-icon="dices"></i></div>
    <h2 class="w-title text-xl">Die Auslosung steht noch aus</h2>
    <p class="text-slate-300 text-sm mt-2">Sobald der Organisator auslost, erfährst du hier${data.me.email ? " und per E-Mail" : ""}, wen du beschenkst. Nutze die Zeit für deinen Wunschzettel!</p>
  </div>`;
}

function wishItem(w, editable) {
  return `<div class="w-wish" data-wish="${esc(w.id)}">
    ${w.image ? `<img src="${esc(w.image)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'w-wish-ph\\'>'+icon('gift')+'</div>'">` : `<div class="w-wish-ph"><i data-icon="gift"></i></div>`}
    <div class="flex-1 min-w-0">
      ${w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener nofollow" class="w-wish-title block truncate">${esc(w.title || w.url)}</a>` : `<div class="w-wish-title truncate">${esc(w.title)}</div>`}
      <div class="text-xs text-slate-400 mt-0.5">${w.price ? `<span class="text-emerald-300 font-semibold">${esc(w.price)}</span>` : ""}${w.price && w.note ? " · " : ""}${esc(w.note || "")}</div>
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
  return `<dl class="grid sm:grid-cols-2 gap-2 text-sm">${rows.map(([k, v]) => `<div class="bg-black/20 rounded-xl p-3"><dt class="text-xs text-slate-400">${k}</dt><dd class="text-slate-100 mt-0.5 whitespace-pre-line">${esc(v)}</dd></div>`).join("")}</dl>`;
}

function chatBlock(messages, channel, placeholder) {
  return `<div class="w-chat" id="chat-${channel}">
      ${messages.length ? messages.map((m) => `<div class="w-msg ${m.mine ? "is-mine" : "is-theirs"}">${esc(m.text)}<small>${esc(m.from)} · ${timeAgo(m.at)}</small></div>`).join("") : `<p class="text-xs text-slate-500 text-center py-3">Noch keine Nachrichten.</p>`}
    </div>
    <form class="flex gap-2 mt-2" data-chat="${channel}">
      <input name="text" maxlength="1000" required class="w-input" placeholder="${esc(placeholder)}" autocomplete="off">
      <button class="w-btn w-btn--primary">Senden</button>
    </form>`;
}

function recipientCard() {
  const r = data.recipient;
  const gs = data.me.giftStatus;
  const chat = data.group.chatEnabled;
  return `<div class="w-card w-card--gift">
    <p class="text-xs text-emerald-300 uppercase tracking-widest font-semibold">Du beschenkst</p>
    <div class="w-big-name mt-1"><i data-icon="gift"></i> ${esc(r.name)}</div>
    <p class="text-xs text-slate-400 mt-1">Psst – das bleibt unter uns.</p>

    <h3 class="font-semibold text-white mt-5 mb-2">Wunschzettel von ${esc(r.name)}</h3>
    ${r.wishlist.length ? `<div class="space-y-2">${r.wishlist.map((w) => wishItem(w, false)).join("")}</div>` : `<p class="text-sm text-slate-400">Noch leer. Die Hinweise unten helfen dir, nicht ins Blaue zu kaufen${chat ? " – oder frag einfach anonym nach" : ""}.</p>`}

    <h3 class="font-semibold text-white mt-5 mb-2">Hinweise</h3>
    ${hintsBlock(r.hints)}

    <h3 class="font-semibold text-white mt-5 mb-1">Dein Geschenk-Status</h3>
    <p class="text-xs text-slate-400 mb-2">Persönliche Übergabe oder Versand per Post – hak ab, wie weit du bist. ${esc(r.name)} sieht nur die Vorfreude-Anzeige, nie von wem sie kommt.</p>
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <select id="gift-method" class="w-input" style="width:auto">
        <option value="personal" ${gs.method === "personal" ? "selected" : ""}>Persönliche Übergabe</option>
        <option value="post" ${gs.method === "post" ? "selected" : ""}>Versand per Post</option>
      </select>
      <div class="flex-1 min-w-[140px]"><div class="w-progress"><div style="width:${Math.round((gs.done / gs.total) * 100)}%"></div></div></div>
    </div>
    <div class="grid sm:grid-cols-2">${gs.steps.map((s) => `<label class="w-check"><input type="checkbox" data-step="${s.key}" ${s.done ? "checked" : ""}> <span>${esc(s.label)}</span></label>`).join("")}</div>

    ${chat ? `<h3 class="font-semibold text-white mt-5 mb-1">Anonym nachfragen</h3><p class="text-xs text-slate-400 mb-2">Frag ${esc(r.name)} Löcher in den Bauch – ${esc(r.name)} sieht nur „Dein geheimer Wichtel“.</p>${chatBlock(r.messages, "recipient", `Nachricht an ${r.name} …`)}` : ""}
  </div>`;
}

function myWishlistCard() {
  const me = data.me;
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="clipboard-list"></i> Dein Wunschzettel</h2>
    <p class="text-sm text-slate-400 mt-1">Shop-Link einfügen – Titel und Bild werden automatisch als Vorschau geladen. Preis und Notiz trägst du selbst ein.</p>
    <div class="space-y-2 mt-3" id="my-wishes">${me.wishlist.length ? me.wishlist.map((w) => wishItem(w, true)).join("") : `<p class="text-sm text-slate-500">Noch keine Wünsche.</p>`}</div>
    <form id="wish-form" class="mt-4 space-y-2 bg-black/20 rounded-2xl p-3">
      <div class="flex gap-2">
        <input name="url" type="url" class="w-input" placeholder="https://shop.example/…  (optional)">
        <button type="button" id="wish-preview" class="w-btn w-btn--ghost whitespace-nowrap">Vorschau laden</button>
      </div>
      <div class="grid sm:grid-cols-3 gap-2">
        <input name="title" maxlength="140" required class="w-input sm:col-span-2" placeholder="Was wünschst du dir?">
        <input name="price" maxlength="20" class="w-input" placeholder="Preis, z. B. 19.90">
      </div>
      <input name="note" maxlength="300" class="w-input" placeholder="Notiz: Farbe, Größe, Alternative …">
      <input name="image" type="hidden">
      <div id="wish-preview-box" class="hidden"></div>
      <button class="w-btn w-btn--primary w-full">Wunsch hinzufügen</button>
    </form>
  </div>`;
}

function myHintsCard() {
  const me = data.me;
  const h = me.hints;
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="lightbulb"></i> Hinweise für deinen Wichtel</h2>
    <p class="text-sm text-slate-400 mt-1">Leerer Wunschzettel? Allergien, Lieblingsgeschmack und Hobbys geben deinem Wichtel Anhaltspunkte.</p>
    <form id="hints-form" class="grid sm:grid-cols-2 gap-2 mt-3">
      <input name="allergies" maxlength="300" class="w-input" placeholder="Allergien / No-Gos" value="${esc(h.allergies || "")}">
      <input name="favorites" maxlength="300" class="w-input" placeholder="Lieblingsgeschmack" value="${esc(h.favorites || "")}">
      <input name="hobbies" maxlength="300" class="w-input" placeholder="Hobbys" value="${esc(h.hobbies || "")}">
      <input name="notes" maxlength="500" class="w-input" placeholder="Sonstiges" value="${esc(h.notes || "")}">
      <div class="sm:col-span-2 border-t border-white/10 pt-3 mt-1 grid sm:grid-cols-2 gap-2 items-center">
        <input name="email" type="email" class="w-input" placeholder="E-Mail für Benachrichtigungen" value="${esc(me.email || "")}">
        <label class="w-check"><input type="checkbox" name="notifyEmail" ${me.notify.email !== false ? "checked" : ""}> <span class="text-sm">Bei neuer Nachricht, geändertem Wunschzettel oder neuem Termin per E-Mail informieren</span></label>
      </div>
      <div class="sm:col-span-2 flex items-center gap-3"><button class="w-btn w-btn--primary">Speichern</button><span id="hints-saved" class="hidden text-sm text-emerald-300">Gespeichert <i data-icon="check"></i></span></div>
    </form>
  </div>`;
}

function santaCard() {
  const s = data.santa;
  const chat = data.group.chatEnabled;
  const pct = Math.round((s.progress.done / s.progress.total) * 100);
  const mood = pct === 0 ? "Dein Wichtel ist noch am Grübeln …" : pct < 100 ? "Dein Wichtel ist dran – die Vorfreude steigt!" : "Dein Geschenk ist bereit.";
  return `<div class="w-card w-card--santa">
    <p class="text-xs text-rose-300 uppercase tracking-widest font-semibold">Dein geheimer Wichtel</p>
    <h2 class="w-title text-xl mt-1"><i data-icon="heart"></i> Jemand kümmert sich um dich</h2>
    <p class="text-sm text-slate-300 mt-3">${mood}</p>
    <div class="w-progress mt-2"><div style="width:${pct}%"></div></div>
    <p class="text-xs text-slate-400 mt-1">${s.progress.done} von ${s.progress.total} Schritten (${s.progress.method === "post" ? "Versand per Post" : "persönliche Übergabe"})</p>
    ${chat ? `<h3 class="font-semibold text-white mt-5 mb-1">Dein Wichtel fragt – du antwortest</h3><p class="text-xs text-slate-400 mb-2">Eigener Kanal, dein Wichtel bleibt unerkannt.</p>${chatBlock(s.messages, "santa", "Antwort an deinen geheimen Wichtel …")}` : ""}
  </div>`;
}

function revealCard() {
  return `<div class="w-card w-card--reveal">
    <h2 class="w-title text-xl"><i data-icon="drama"></i> Die Auflösung</h2>
    <p class="text-sm text-slate-300 mt-1 mb-3">Der Organisator hat aufgelöst, wer wen beschenkt hat.</p>
    <div class="grid sm:grid-cols-2 gap-1">${data.reveal.map((r) => `<div class="w-reveal-row"><span>${esc(r.giver)}</span><span class="text-slate-500">→</span><b>${esc(r.receiver)}</b></div>`).join("")}</div>
  </div>`;
}

function participantsCard() {
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="users"></i> Teilnehmende <span class="text-sm font-normal text-slate-400">(${data.participants.length})</span></h2>
    <div class="flex flex-wrap gap-2 mt-3">${data.participants.map((p) => `<span class="w-chip">${p.joined ? icon("circle-check", "text-emerald-300") : icon("circle", "text-slate-500")} ${esc(p.name)}${p.isOrganizer ? " <span class='text-slate-500'>· Orga</span>" : ""}${p.id === data.me.id ? " <span class='text-emerald-300'>(du)</span>" : ""}</span>`).join("")}</div>
  </div>`;
}

function photosCard() {
  return `<div class="w-card">
    <h2 class="w-title text-xl"><i data-icon="camera"></i> Foto-Wand</h2>
    <p class="text-sm text-slate-400 mt-1">Fotos der Bescherung schnell &amp; datensparend in der gemeinsamen Galerie teilen.</p>
    <form id="photo-form" class="flex flex-wrap gap-2 mt-3 items-center">
      <input name="photo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required class="text-sm text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-full file:border-0 file:bg-emerald-600 file:text-white">
      <input name="caption" maxlength="140" class="w-input" style="flex:1;min-width:160px" placeholder="Bildunterschrift (optional)">
      <button class="w-btn w-btn--primary">Hochladen</button>
    </form>
    <div class="w-photos mt-4">${data.photos.length ? data.photos.map((ph) => `<figure class="w-photo"><a href="${esc(ph.url)}" target="_blank"><img src="${esc(ph.url)}" alt="${esc(ph.caption || "")}" loading="lazy"></a>${ph.caption || ph.by ? `<figcaption>${esc(ph.caption || "")}${ph.by ? ` <span class="opacity-70">– ${esc(ph.by)}</span>` : ""}</figcaption>` : ""}${ph.mine ? `<button data-act="remove-photo" data-id="${esc(ph.id)}" title="Löschen"><i data-icon="x"></i></button>` : ""}</figure>`).join("") : `<p class="text-sm text-slate-500 col-span-full">Noch keine Fotos – nach der Bescherung ist hier Platz.</p>`}</div>
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

function bindEvents() {
  bindNav();
  document.querySelectorAll(".w-chat").forEach((c) => (c.scrollTop = c.scrollHeight));

  document.querySelectorAll("form[data-chat]").forEach((form) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = form.elements.text.value.trim();
    if (!text) return;
    try {
      data = await req("POST", "/messages", { channel: form.dataset.chat, text });
      render();
    } catch (err) {
      toast(err.message, true);
    }
  }));

  const method = document.getElementById("gift-method");
  if (method) {
    const save = async () => {
      const steps = [...document.querySelectorAll("input[data-step]:checked")].map((i) => i.dataset.step);
      try {
        data = await req("PUT", "/gift-status", { method: method.value, steps });
        render();
      } catch (err) {
        toast(err.message, true);
      }
    };
    method.addEventListener("change", save);
    document.querySelectorAll("input[data-step]").forEach((i) => i.addEventListener("change", save));
  }

  const wishForm = document.getElementById("wish-form");
  wishForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = wishForm.elements;
    const item = { id: `w${Date.now().toString(36)}`, url: f.url.value.trim(), title: f.title.value.trim(), price: f.price.value.trim(), note: f.note.value.trim(), image: f.image.value };
    try {
      data = await req("PUT", "/wishlist", { wishlist: [...data.me.wishlist, item] });
      render();
      toast("Wunsch gespeichert");
    } catch (err) {
      toast(err.message, true);
    }
  });
  document.getElementById("wish-preview").addEventListener("click", async () => {
    const f = wishForm.elements;
    const url = f.url.value.trim();
    if (!url) return toast("Bitte zuerst einen Link einfügen.", true);
    const btn = document.getElementById("wish-preview");
    btn.disabled = true;
    btn.textContent = "Lade …";
    try {
      const p = await req("POST", "/link-preview", { url });
      if (!f.title.value) f.title.value = p.title || "";
      if (!f.price.value && p.price) f.price.value = p.price;
      f.image.value = p.image || "";
      const box = document.getElementById("wish-preview-box");
      box.classList.remove("hidden");
      box.innerHTML = `<div class="w-wish">${p.image ? `<img src="${esc(p.image)}" alt="">` : `<div class="w-wish-ph"><i data-icon="link"></i></div>`}<div class="min-w-0"><div class="w-wish-title truncate">${esc(p.title || url)}</div><div class="text-xs text-slate-400">${esc(p.note || "Vorschau geladen – Titel und Preis kannst du anpassen.")}</div></div></div>`;
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Vorschau laden";
    }
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

  document.getElementById("hints-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    try {
      data = await req("PUT", "/profile", {
        email: f.email.value.trim(),
        hints: { allergies: f.allergies.value, favorites: f.favorites.value, hobbies: f.hobbies.value, notes: f.notes.value },
        notify: { email: f.notifyEmail.checked },
      });
      const ok = document.getElementById("hints-saved");
      ok.classList.remove("hidden");
      setTimeout(() => ok.classList.add("hidden"), 1500);
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.getElementById("photo-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!fd.get("photo") || !fd.get("photo").size) return;
    try {
      data = await req("POST", "/photos", fd, true);
      render();
      toast("Foto hochgeladen");
    } catch (err) {
      toast(err.message, true);
    }
  });
  document.querySelectorAll("button[data-act='remove-photo']").forEach((b) => b.addEventListener("click", async () => {
    if (!window.confirm("Foto löschen?")) return;
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
    if (document.hidden || document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
    try {
      const fresh = await req("GET", "");
      if (JSON.stringify(fresh) !== JSON.stringify(data)) {
        data = fresh;
        render();
      }
    } catch (_) { /* keep old state */ }
  }, 20000);
}

(async () => {
  try {
    if (isJoin) await renderJoin();
    else {
      await load();
      startPolling();
    }
  } catch (err) {
    app.innerHTML = `<div class="w-card text-center"><div class="text-4xl mb-3 text-slate-500"><i data-icon="eye-off"></i></div><h1 class="w-title text-xl mb-2">Link ungültig</h1><p class="text-slate-400">${esc(err.message)}</p></div>`;
  }
})();
