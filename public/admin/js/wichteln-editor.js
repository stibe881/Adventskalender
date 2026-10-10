requireAdminOrRedirect();

const groupId = new URLSearchParams(window.location.search).get("id");
if (!groupId) window.location.href = "/admin/wichteln.html";

let group = null;
let checklist = null;

const STATUS_LABELS = {
  draft: { text: "Vorbereitung", cls: "bg-slate-700 text-slate-200" },
  drawn: { text: "Ausgelost", cls: "bg-emerald-600/30 text-emerald-300 border border-emerald-500/40" },
  revealed: { text: "Aufgelöst", cls: "bg-amber-500/20 text-amber-300 border border-amber-500/40" },
};

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
// "20–25" becomes "20–25 CHF"; a budget that already names a currency stays as it is.
function fmtBudget(g) {
  const b = String(g.budget || "").trim();
  if (!b) return "";
  return /CHF|EUR|€|Fr\.|USD|\$/i.test(b) ? b : `${b} ${g.currency || "CHF"}`;
}
function eventLine(g) {
  if (!g.eventDate) return "";
  return `${formatDate(g.eventDate)}${g.eventTime ? ` um ${g.eventTime} Uhr` : ""}${g.eventPlace ? `, ${g.eventPlace}` : ""}`;
}
const toast = (msg, isError = false) => UI.toast(msg, { error: isError });
const copyText = (text) => UI.copy(text);
function inviteText() {
  const g = group;
  return [`${g.organizerName ? `${g.organizerName} lädt dich` : "Du bist"} zum Wichteln eingeladen: „${g.title}“`, g.eventDate ? `Bescherung: ${eventLine(g)}` : "", g.budget ? `Budget: ${fmtBudget(g)}` : "", g.motto ? `Motto: ${g.motto}` : "", "Hier eintragen:"].filter(Boolean).join("\n");
}
async function shareInvite() {
  const r = await UI.share({ title: `Wichteln: ${group.title}`, text: inviteText(), url: group.inviteLink });
  if (r === "copied") toast("Link kopiert – teilen geht auf diesem Gerät nicht direkt.");
}

let profileCurrency = "";
async function load() {
  group = await api.getWichtelGroup(groupId);
  try { profileCurrency = (await api.me()).currency || ""; } catch (_) { profileCurrency = ""; }
  render();
  const payment = new URLSearchParams(window.location.search).get("payment");
  if (payment) {
    window.history.replaceState({}, document.title, `${window.location.pathname}?id=${encodeURIComponent(groupId)}`);
    if (payment === "success") await UI.alert({ title: "Danke!", text: group.isPro ? "Diese Runde ist jetzt PRO: Wunschzettel, Hinweise für den Wichtel und der anonyme Chat sind für alle Teilnehmenden freigeschaltet." : "Die Zahlung ist eingegangen. Die Freischaltung kann einen Moment dauern – lade die Seite gleich noch einmal.", ok: "Super" });
    else toast("Zahlung abgebrochen.", true);
  }
}

// PRO for this round: Wunschzettel, Hinweise, Chat.
document.getElementById("upgrade-btn").addEventListener("click", async () => {
  const ok = await UI.proDialog({
    title: "Runde auf PRO upgraden",
    scope: `die Runde „${group.title}“ und alle Teilnehmenden`,
    price: group.proPrice || "",
    points: [
      ["clipboard-list", "Wunschzettel mit Link, Preis und Bild aus dem Online-Shop"],
      ["lightbulb", "Hinweise für den Wichtel: Allergien, Hobbys, Lieblingsgeschmack"],
      ["message-circle", "Anonymer Chat mit dem Wichtelkind und dem eigenen Wichtel"],
    ],
  });
  if (!ok) return;
  try {
    const r = await api.checkoutFor("wichteln", groupId);
    if (r.url) UI.openCheckout(r.url);
  } catch (err) {
    toast(err.message, true);
  }
});

function render() {
  const g = group;
  const st = STATUS_LABELS[g.status] || STATUS_LABELS.draft;
  document.title = `${g.title} – Wichteln`;
  document.getElementById("group-title").textContent = g.title;
  const badge = document.getElementById("status-badge");
  badge.textContent = st.text;
  badge.className = `inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`;
  const active = g.participants.filter((p) => !p.pending);
  const pending = g.participants.filter((p) => p.pending);
  document.getElementById("participant-summary").textContent = `${active.length} Teilnehmende${pending.length ? `, ${pending.length} im Warteraum` : ""}${g.eventDate ? ` · Bescherung ${eventLine(g)}` : ""}`;
  document.getElementById("participant-count").textContent = `(${active.length})`;
  document.getElementById("max-participants").textContent = g.maxParticipants;

  document.getElementById("pro-badge").classList.toggle("hidden", !g.isPro);
  document.getElementById("upgrade-btn").classList.toggle("hidden", Boolean(g.isPro));
  document.getElementById("upgrade-btn").innerHTML = UI.proButtonLabel(g.proPrice || "");
  document.getElementById("pro-settings").classList.toggle("hidden", !g.isPro);

  const mine = g.participants.find((p) => p.isOrganizer);
  const myLink = document.getElementById("my-area-link");
  myLink.classList.toggle("hidden", !mine);
  if (mine) myLink.href = mine.link;

  renderDraw(active);
  renderParticipants();
  renderExclusions(active);
  renderSettings();
  renderInvite();
  renderRecap();
}

// ── Draw + checklist ────────────────────────────────────────────────────────
const AVATAR_COLORS = ["#059669", "#2563eb", "#d946ef", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#14b8a6"];
const avatarColor = (name) => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; };
const initials = (name) => String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
const personChip = (p) => `<span class="draw-person"><span class="draw-person__avatar" style="background:${avatarColor(p.name)}">${escapeHtml(initials(p.name))}</span>${escapeHtml(p.name)}</span>`;
const drawDate = (iso) => new Date(iso).toLocaleString("de-CH", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

// The draw is one or more closed rings: A gives to B, B to C, C back to A.
function drawCycles(active) {
  const byId = Object.fromEntries(active.map((p) => [p.id, p]));
  const seen = new Set();
  const cycles = [];
  for (const start of active) {
    if (seen.has(start.id) || !start.assignedTo) continue;
    const ring = [];
    let cur = start;
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); ring.push(cur); cur = byId[cur.assignedTo]; }
    cycles.push(ring);
  }
  return cycles;
}

function renderDraw(active) {
  const hint = document.getElementById("draw-hint");
  const status = document.getElementById("draw-status");
  const drawBtn = document.getElementById("draw-btn");
  const revealBtn = document.getElementById("reveal-btn");
  const unrevealBtn = document.getElementById("unreveal-btn");
  const table = document.getElementById("reveal-table");
  const box = document.getElementById("checklist");
  const min = group.minParticipants || 3;
  const revealed = group.status === "revealed";
  if (group.status === "draft") {
    hint.textContent = `Der Generator zieht kreuzungsfrei und schickt jedem sein Los${group.inviteMode === "names" ? " (ohne E-Mail: über die persönlichen Links)" : ""}. Vorher kurz die Checkliste:`;
    hint.classList.remove("hidden");
    status.classList.add("hidden");
    drawBtn.innerHTML = `${icon("dices")} Jetzt auslosen`;
    drawBtn.className = "btn btn-primary";
    drawBtn.disabled = active.length < min;
    revealBtn.classList.add("hidden");
    unrevealBtn.classList.add("hidden");
    table.classList.add("hidden");
    box.classList.remove("hidden");
    renderChecklist();
    return;
  }
  hint.classList.add("hidden");
  box.classList.add("hidden");
  status.classList.remove("hidden");
  status.innerHTML = `<div class="draw-state ${revealed ? "draw-state--revealed" : "draw-state--secret"}">
    <div class="draw-state__icon">${icon(revealed ? "eye" : "lock")}</div>
    <div class="min-w-0">
      <div class="draw-state__title">Ausgelost <span class="draw-state__pill">${revealed ? "Aufgelöst" : "Geheim"}</span></div>
      <div class="draw-state__meta">${escapeHtml(drawDate(group.drawnAt))} · ${active.length} Lose verteilt${revealed && group.revealedAt ? ` · aufgelöst ${escapeHtml(drawDate(group.revealedAt))}` : ""}</div>
      <p class="draw-state__text">${revealed ? "Die Auflösung siehst nur du als Organisator. Die Teilnehmenden sehen weiterhin nur ihr eigenes Los." : "Wer wen gezogen hat, bleibt geheim – auch für dich. Du kannst es jederzeit enthüllen und wieder verbergen."}</p>
    </div>
  </div>`;
  drawBtn.innerHTML = `${icon("refresh-cw")} Neu auslosen`;
  drawBtn.className = "btn btn-ghost is-danger";
  drawBtn.disabled = false;
  revealBtn.classList.toggle("hidden", revealed);
  unrevealBtn.classList.toggle("hidden", !revealed);
  table.classList.toggle("hidden", !revealed);
  if (revealed) {
    const cycles = drawCycles(active);
    table.innerHTML = `<div class="mt-4">${cycles.map((ring) => `<div class="draw-chain">${ring.map((p) => `${personChip(p)}<span class="draw-arrow">${icon("arrow-right")}</span>`).join("")}<span class="draw-arrow is-loop" title="und wieder zurück zu ${escapeHtml(ring[0].name)}">${icon("refresh-cw")}</span></div>`).join("")}
      <p class="draw-legend">Lesen von links nach rechts: jede Person beschenkt die nächste, die letzte wieder die erste.${cycles.length > 1 ? ` ${cycles.length} getrennte Kreise.` : ""}</p></div>`;
  }
}

async function renderChecklist() {
  const box = document.getElementById("checklist");
  try {
    checklist = await api.wichtelChecklist(groupId);
  } catch (_) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `<div class="bg-black/20 rounded-xl px-4 py-2">${checklist.items.map((i) => {
    const cls = i.ok ? "is-ok" : i.blocking ? "is-block" : "is-warn";
    const ic = i.ok ? "circle-check" : i.blocking ? "circle-x" : "triangle-alert";
    return `<div class="check-item ${cls}"><i data-icon="${ic}"></i><span>${escapeHtml(i.label)}</span></div>`;
  }).join("")}</div>
  <p class="text-xs mt-2 ${checklist.ready ? "text-emerald-300" : "text-rose-300"}">${checklist.ready ? "Alles bereit – du kannst auslosen. Gelbe Punkte sind Hinweise, keine Blocker." : "Rote Punkte müssen vor der Auslosung gelöst werden."}</p>`;
  document.getElementById("draw-btn").disabled = !checklist.ready;
}

// ── Participants ────────────────────────────────────────────────────────────
function participantStatus(p) {
  if (p.pending) return `<span class="text-amber-300"><i data-icon="hourglass"></i> Warteraum</span>`;
  if (p.joinedAt) return `<span class="text-emerald-300"><i data-icon="check"></i> Dabei</span>`;
  if (p.invitedAt) return `<span class="text-sky-300"><i data-icon="mail"></i> Eingeladen</span>`;
  return `<span class="text-slate-400">Eingetragen</span>`;
}

function renderParticipants() {
  const tbody = document.getElementById("participant-rows");
  tbody.innerHTML = "";
  document.getElementById("invite-all-btn").classList.toggle("hidden", !group.participants.some((p) => p.email && !p.isOrganizer));
  for (const p of group.participants) {
    const tr = document.createElement("tr");
    tr.className = p.pending ? "bg-amber-500/5" : "";
    const gp = p.giftProgress;
    tr.innerHTML = `
      <td class="py-2 pr-3 font-medium text-white">${escapeHtml(p.name)}${p.isOrganizer ? ' <span class="text-[10px] text-slate-400">(Organisator)</span>' : ""}${p.pushDevices ? ' <span class="text-[10px] text-slate-500" title="Hat die App oder Browser-Push aktiv"><i data-icon="bell"></i></span>' : ""}<div class="md:hidden text-[11px] text-slate-400 font-normal truncate max-w-[30vw]">${escapeHtml(p.email || "")}</div></td>
      <td class="py-2 pr-3 text-slate-300 hidden md:table-cell">${escapeHtml(p.email || "–")}</td>
      <td class="py-2 pr-3">${participantStatus(p)}</td>
      <td class="py-2 pr-3 text-slate-300 hidden md:table-cell">${p.wishlistCount} ${p.wishlistCount === 1 ? "Wunsch" : "Wünsche"}</td>
      <td class="py-2 pr-3 text-slate-300 hidden sm:table-cell">${group.status === "draft" ? "–" : `${gp.done}/${gp.total}`}</td>
      <td class="py-2 text-right sm:whitespace-nowrap"><div class="flex flex-wrap justify-end gap-1">
        ${p.pending ? `<button data-act="approve" data-id="${p.id}" class="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded">Aufnehmen</button>` : ""}
        <button data-act="link" data-id="${p.id}" class="text-xs bg-slate-800 hover:bg-slate-700 border border-white/10 px-2 py-1 rounded" title="Persönlichen Link kopieren"><i data-icon="link"></i></button>
        <button data-act="share" data-id="${p.id}" class="text-xs bg-slate-800 hover:bg-slate-700 border border-white/10 px-2 py-1 rounded" title="Persönlichen Link teilen"><i data-icon="share-2"></i></button>
        ${p.email && !p.isOrganizer ? `<button data-act="invite" data-id="${p.id}" class="text-xs bg-slate-800 hover:bg-slate-700 border border-white/10 px-2 py-1 rounded" title="Einladung per E-Mail senden"><i data-icon="mail"></i></button>` : ""}
        <button data-act="edit" data-id="${p.id}" class="text-xs bg-slate-800 hover:bg-slate-700 border border-white/10 px-2 py-1 rounded" title="Bearbeiten"><i data-icon="pencil"></i></button>
        ${!p.isOrganizer ? `<button data-act="remove" data-id="${p.id}" class="text-xs bg-slate-800 hover:bg-rose-600 border border-white/10 px-2 py-1 rounded" title="Entfernen"><i data-icon="x"></i></button>` : ""}
      </div></td>`;
    tbody.appendChild(tr);
  }
}

document.getElementById("participant-rows").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const p = group.participants.find((x) => x.id === btn.dataset.id);
  if (!p) return;
  try {
    switch (btn.dataset.act) {
      case "approve":
        group = await api.approveWichtelParticipant(groupId, p.id);
        toast(`${p.name} ist jetzt dabei.`);
        break;
      case "link":
        await copyText(p.link);
        return;
      case "share":
        await UI.share({ title: `Wichteln: ${group.title}`, text: `${p.name}, hier ist dein persönlicher Wichtel-Zugang für „${group.title}“:`, url: p.link });
        return;
      case "invite": {
        const r = await api.inviteWichtelParticipant(groupId, p.id);
        toast(r.sent ? `Einladung an ${p.email} verschickt.` : "Kein SMTP konfiguriert – die Einladung steht im Server-Log.");
        group = await api.getWichtelGroup(groupId);
        break;
      }
      case "edit": {
        const r = await UI.form({
          title: "Person bearbeiten",
          ok: "Speichern",
          fields: [
            { name: "name", label: "Name", value: p.name, required: true, maxlength: 60 },
            { name: "email", label: "E-Mail (leer lassen für keine)", value: p.email || "", type: "email" },
          ],
        });
        if (!r) return;
        group = await api.updateWichtelParticipant(groupId, p.id, { name: r.name, email: r.email });
        break;
      }
      case "remove":
        if (!(await UI.confirm({ title: `${p.name} entfernen?`, text: "Die Person verschwindet samt Wunschzettel aus der Runde.", ok: "Entfernen", danger: true }))) return;
        group = await api.removeWichtelParticipant(groupId, p.id);
        break;
    }
    render();
  } catch (err) {
    toast(err.message, true);
  }
});

document.getElementById("add-participant-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const errEl = document.getElementById("participant-error");
  errEl.classList.add("hidden");
  try {
    group = await api.addWichtelParticipant(groupId, { name: fd.get("name"), email: fd.get("email") });
    e.target.reset();
    e.target.elements.name.focus();
    render();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  }
});

document.getElementById("invite-all-btn").addEventListener("click", async () => {
  const n = group.participants.filter((p) => p.email && !p.isOrganizer && !p.pending).length;
  if (!(await UI.confirm({ title: "Alle einladen?", text: `Schickt ${n} Personen eine E-Mail mit ihrem persönlichen Link.`, ok: "Einladungen senden" }))) return;
  try {
    const r = await api.inviteAllWichtel(groupId);
    toast(`${r.count} Einladungen verschickt.`);
    group = await api.getWichtelGroup(groupId);
    render();
  } catch (err) {
    toast(err.message, true);
  }
});

// ── Exclusions ──────────────────────────────────────────────────────────────
function renderExclusions(active) {
  const opts = active.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  const a = document.getElementById("excl-a");
  const b = document.getElementById("excl-b");
  const prevA = a.value;
  const prevB = b.value;
  a.innerHTML = opts;
  b.innerHTML = opts;
  if (prevA) a.value = prevA;
  if (prevB) b.value = prevB;
  const list = document.getElementById("exclusion-list");
  const nameOf = (id) => group.participants.find((p) => p.id === id)?.name || "?";
  list.innerHTML = group.exclusions.length
    ? group.exclusions.map(([x, y], i) => `<span class="inline-flex items-center gap-2 bg-slate-800 border border-white/10 rounded-full px-3 py-1 text-sm">${escapeHtml(nameOf(x))} ⇄ ${escapeHtml(nameOf(y))} <button data-idx="${i}" class="text-slate-400 hover:text-rose-300" title="Entfernen"><i data-icon="x"></i></button></span>`).join("")
    : `<span class="text-sm text-slate-500">Keine Ausschlüsse.</span>`;
}

document.getElementById("excl-add").addEventListener("click", async () => {
  const a = document.getElementById("excl-a").value;
  const b = document.getElementById("excl-b").value;
  if (!a || !b || a === b) return toast("Bitte zwei verschiedene Personen wählen.", true);
  try {
    group = await api.setWichtelExclusions(groupId, [...group.exclusions, [a, b]]);
    render();
  } catch (err) {
    toast(err.message, true);
  }
});
document.getElementById("exclusion-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-idx]");
  if (!btn) return;
  const next = group.exclusions.filter((_, i) => i !== Number(btn.dataset.idx));
  group = await api.setWichtelExclusions(groupId, next);
  render();
});

// ── Settings ────────────────────────────────────────────────────────────────
function renderSettings() {
  const f = document.getElementById("settings-form");
  f.elements.title.value = group.title;
  f.elements.organizerName.value = group.organizerName || "";
  f.elements.organizerParticipates.checked = group.organizerParticipates;
  f.elements.inviteMode.value = group.inviteMode;
  f.elements.waitingRoom.checked = group.waitingRoom;
  f.elements.wishlistsShared.checked = Boolean(group.wishlistsShared);
  f.elements.budget.value = group.budget;
  document.getElementById("budget-currency").textContent = profileCurrency || group.currency || "CHF";
  f.elements.motto.value = group.motto;
  f.elements.eventDate.value = group.eventDate;
  f.elements.eventTime.value = group.eventTime;
  f.elements.eventPlace.value = group.eventPlace;
  f.elements.description.value = group.description;
  f.elements.chatEnabled.checked = group.chatEnabled;
  f.elements.retentionDays.value = String(group.retentionDays);
  document.getElementById("delete-at-hint").textContent = group.deleteAt
    ? `Automatische, spurlose Löschung der kompletten Runde samt Fotos, Nachrichten und Wünschen am ${new Date(group.deleteAt).toLocaleDateString("de-DE")}.`
    : "Danach wird die komplette Runde samt Fotos, Nachrichten und Wünschen spurlos gelöscht.";
}

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const saved = document.getElementById("settings-saved");
  const err = document.getElementById("settings-error");
  err.classList.add("hidden");
  try {
    group = await api.updateWichtelGroup(groupId, {
      title: f.elements.title.value,
      organizerName: f.elements.organizerName.value,
      organizerParticipates: f.elements.organizerParticipates.checked,
      inviteMode: f.elements.inviteMode.value,
      waitingRoom: f.elements.waitingRoom.checked,
      wishlistsShared: f.elements.wishlistsShared.checked,
      budget: f.elements.budget.value,
      currency: profileCurrency || group.currency || "CHF",
      motto: f.elements.motto.value,
      eventDate: f.elements.eventDate.value,
      eventTime: f.elements.eventTime.value,
      eventPlace: f.elements.eventPlace.value,
      description: f.elements.description.value,
      chatEnabled: f.elements.chatEnabled.checked,
      retentionDays: Number(f.elements.retentionDays.value),
    });
    render();
    saved.classList.remove("hidden");
    setTimeout(() => saved.classList.add("hidden"), 1500);
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove("hidden");
  }
});

// ── Invitation ──────────────────────────────────────────────────────────────
let inviteCard = null;
async function renderInvite() {
  document.getElementById("invite-link").value = group.inviteLink;
  try {
    inviteCard = await api.wichtelInviteCard(groupId);
    const img = document.getElementById("invite-qr");
    img.src = inviteCard.qr;
    img.classList.remove("hidden");
  } catch (_) { /* QR optional */ }
}
document.getElementById("copy-invite").addEventListener("click", () => copyText(group.inviteLink));
document.getElementById("share-invite").addEventListener("click", shareInvite);
document.getElementById("card-share").addEventListener("click", shareInvite);
document.getElementById("rotate-invite").addEventListener("click", async () => {
  if (!(await UI.confirm({ title: "Einladungslink erneuern?", text: "Der bisherige Link (und QR-Code) funktioniert danach nicht mehr. Wer schon drin ist, bleibt drin.", ok: "Erneuern", danger: true }))) return;
  group = await api.rotateWichtelInvite(groupId);
  render();
});
document.getElementById("invite-card-btn").addEventListener("click", async () => {
  if (!inviteCard) inviteCard = await api.wichtelInviteCard(groupId);
  document.getElementById("card-qr").src = inviteCard.qr;
  document.getElementById("card-link").textContent = inviteCard.link;
  document.getElementById("card-modal").classList.remove("hidden");
});
document.getElementById("card-close").addEventListener("click", () => document.getElementById("card-modal").classList.add("hidden"));
document.getElementById("card-print").addEventListener("click", () => openPrint("card"));

// ── Draw actions ────────────────────────────────────────────────────────────
document.getElementById("draw-btn").addEventListener("click", async () => {
  const again = group.status !== "draft";
  const ok = await UI.confirm(again
    ? { title: "Wirklich neu auslosen?", text: "Alle bisherigen Lose, Chats und Geschenk-Status werden verworfen und alle erhalten ein neues Los.", ok: "Neu auslosen", danger: true }
    : { title: "Jetzt auslosen?", text: `${group.participants.filter((p) => !p.pending).length} Teilnehmende bekommen ihr Los. Danach kann niemand mehr entfernt werden, ohne neu auszulosen.`, ok: "Auslosen" });
  if (!ok) return;
  try {
    const r = await api.drawWichtel(groupId);
    group = r;
    render();
    toast(r.mailsSent ? `Ausgelost – ${r.mailsSent} Lose per E-Mail verschickt.` : "Ausgelost! Die Lose sind über die persönlichen Links abrufbar.");
  } catch (err) {
    toast(err.message, true);
  }
});
document.getElementById("unreveal-btn").addEventListener("click", async () => {
  try {
    group = await api.unrevealWichtel(groupId);
    render();
    toast("Die Auflösung ist wieder verborgen.");
  } catch (err) {
    toast(err.message, true);
  }
});
document.getElementById("reveal-btn").addEventListener("click", async () => {
  if (!(await UI.confirm({ title: "Enthüllen, wer wen gezogen hat?", text: "Die Auflösung siehst nur du. Du kannst sie jederzeit wieder zurücknehmen.", ok: "Enthüllen" }))) return;
  try {
    group = await api.revealWichtel(groupId);
    render();
  } catch (err) {
    toast(err.message, true);
  }
});

// ── Recap ───────────────────────────────────────────────────────────────────
function renderRecap() {
  const thanks = document.getElementById("thanks-list");
  thanks.innerHTML = (group.thanks || []).length
    ? group.thanks.map((t) => `<div class="bg-black/20 border-l-2 border-rose-400 rounded-r-lg px-3 py-2 text-sm">${escapeHtml(t.text)}<div class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(t.from)} · ${new Date(t.at).toLocaleDateString("de-DE")}</div></div>`).join("")
    : `<p class="text-sm text-slate-500">Noch keine Nachricht im Gruppenchat.</p>`;
  const grid = document.getElementById("photo-grid");
  grid.innerHTML = group.photos.length
    ? group.photos.map((ph) => `<a href="${escapeHtml(ph.url)}" target="_blank" class="block aspect-square rounded-lg overflow-hidden bg-black/30 border border-white/10" title="${escapeHtml(ph.caption || "")} – ${escapeHtml(ph.by)}"><img src="${escapeHtml(ph.url)}" alt="" class="w-full h-full object-cover" loading="lazy"></a>`).join("")
    : `<p class="text-sm text-slate-500 col-span-full">Noch keine Fotos.</p>`;
}

// ── Duplicate / delete ──────────────────────────────────────────────────────
document.getElementById("duplicate-group").addEventListener("click", async () => {
  const r = await UI.form({
    title: "Runde duplizieren",
    text: "Einstellungen, Teilnehmende und Ausschlüsse werden übernommen. Termin, Lose, Chats und Fotos nicht.",
    ok: "Duplizieren",
    fields: [{ name: "title", label: "Titel der neuen Runde", value: `${group.title} ${new Date().getFullYear() + 1}`, required: true, maxlength: 80 }],
  });
  if (!r) return;
  try {
    const copy = await api.duplicateWichtelGroup(groupId, { title: r.title });
    window.location.href = `/admin/wichteln-editor.html?id=${encodeURIComponent(copy.id)}`;
  } catch (err) {
    toast(err.message, true);
  }
});
document.getElementById("delete-group").addEventListener("click", async () => {
  if (!(await UI.confirm({ title: `„${group.title}“ endgültig löschen?`, text: "Teilnehmende, Wünsche, Nachrichten und Fotos werden sofort und unwiderruflich gelöscht.", ok: "Endgültig löschen", danger: true }))) return;
  await api.deleteWichtelGroup(groupId);
  window.location.href = "/admin/wichteln.html";
});

// ── Print views ─────────────────────────────────────────────────────────────
document.querySelectorAll(".print-btn").forEach((b) => b.addEventListener("click", () => openPrint(b.dataset.print)));

function printShell(title, body) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>
    :root{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--soft:#f8fafc;--green:#059669;--amber:#d97706;--rose:#e11d48}
    *{box-sizing:border-box}
    body{font-family:Inter,"Segoe UI",Arial,sans-serif;color:var(--ink);margin:0;padding:28px 32px;font-size:13px;line-height:1.45;background:#fff}
    .doc{max-width:860px;margin:0 auto}
    .head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:16px;border-bottom:2px solid var(--ink);margin-bottom:22px}
    .head .kicker{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--green);font-weight:700}
    .head h1{font-family:Georgia,"Times New Roman",serif;font-size:28px;margin:2px 0 8px;line-height:1.1}
    .head .doc-type{text-align:right;color:var(--muted);font-size:11px}.head .doc-type b{display:block;color:var(--ink);font-size:14px;margin-bottom:2px}
    .chips{display:flex;flex-wrap:wrap;gap:6px}
    .chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);background:var(--soft);border-radius:999px;padding:3px 10px;font-size:11.5px;color:#334155}
    .chip b{color:var(--ink);font-weight:600}
    h2{font-size:16px;margin:22px 0 10px;display:flex;align-items:baseline;gap:8px}h2 .count{font-size:12px;color:var(--muted);font-weight:500}
    .muted{color:var(--muted);font-size:12px}
    table{border-collapse:separate;border-spacing:0;width:100%;border:1px solid var(--line);border-radius:12px;overflow:hidden}
    th,td{padding:9px 12px;text-align:left;vertical-align:middle;border-bottom:1px solid var(--line)}
    tr:last-child td{border-bottom:0}th{background:var(--soft);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
    tbody tr:nth-child(even) td{background:#fcfdfe}
    .who{display:flex;align-items:center;gap:10px;font-weight:600}
    .avatar{width:28px;height:28px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .pill-ok{background:#d1fae5;color:#065f46}.pill-wait{background:#fef3c7;color:#92400e}.pill-soft{background:#e2e8f0;color:#334155}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;color:#475569;word-break:break-all}
    .num{color:var(--muted);font-variant-numeric:tabular-nums;width:36px}
    /* Wish lists */
    .person{border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0;page-break-inside:avoid}
    .person .who{margin-bottom:6px}
    .wish{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px dashed var(--line)}
    .wish:first-of-type{border-top:0}.wish .price{white-space:nowrap;font-weight:600}.wish .url{display:block}
    .hints{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    .empty{color:var(--muted);font-style:italic}
    /* Matrix */
    .matrix{width:auto}.matrix th,.matrix td{text-align:center;padding:6px 8px}
    .matrix th.row{text-align:left;padding-right:16px;text-transform:none;letter-spacing:0;font-size:12.5px;color:var(--ink)}
    .matrix th.col{vertical-align:bottom;height:92px}.matrix th.col span{display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg);text-transform:none;letter-spacing:0;font-size:12px;color:var(--ink)}
    .dot{display:inline-block;width:12px;height:12px;border-radius:999px;background:var(--green);-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .x{color:var(--rose);font-weight:700;font-size:15px}.self{color:#cbd5e1}
    .legend{display:flex;gap:16px;margin-top:10px;font-size:11.5px;color:var(--muted);align-items:center}
    /* Recap */
    .chain{display:flex;flex-wrap:wrap;align-items:center;gap:6px;border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0}
    .chain .who{border:1px solid var(--line);border-radius:999px;padding:3px 10px 3px 3px;font-size:12px}
    .arrow{color:var(--amber);font-size:16px}.loop{color:#94a3b8;font-size:13px}
    .thanks{border-left:3px solid var(--rose);background:#fff1f2;border-radius:0 10px 10px 0;padding:8px 12px;margin:8px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .thanks small{display:block;color:var(--muted);font-size:11px;margin-top:3px}
    .recap-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.recap-photos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px}
    .foot{margin-top:28px;padding-top:10px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted)}
    /* Festive invitation card */
    .card{position:relative;border:3px double #b91c1c;border-radius:18px;padding:36px 32px 28px;text-align:center;max-width:520px;margin:40px auto;background:#fffaf5;color:#1f2937}
    .card::before{content:"";position:absolute;inset:8px;border:1px solid #d4a373;border-radius:12px;pointer-events:none}
    .card .kicker{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#b91c1c;font-weight:700}
    .card .title{font-family:Georgia,"Times New Roman",serif;font-size:30px;font-weight:700;margin:6px 0 4px;color:#14532d}
    .card .stars{color:#d4a373;font-size:18px;letter-spacing:8px;margin:6px 0 10px}
    .card img{width:200px;height:200px;border:6px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.12);border-radius:8px;margin:10px 0}
    .card .facts{display:inline-block;text-align:left;margin:8px auto 0;font-size:14px;line-height:1.6}
    .card .facts b{display:inline-block;min-width:78px;color:#b91c1c}
    .card .link{font-size:11px;color:#555;word-break:break-all;margin-top:12px;font-family:ui-monospace,monospace}
    @media print{body{padding:10mm 12mm}.card{margin:0 auto;page-break-inside:avoid}tr{page-break-inside:avoid}}
  </style></head><body><div class="doc">${body}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`;
}

const PRINT_COLORS = ["#059669", "#2563eb", "#d946ef", "#d97706", "#e11d48", "#0ea5e9", "#7c3aed", "#0d9488"];
const printColor = (name) => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PRINT_COLORS[h % PRINT_COLORS.length]; };
const printInitials = (name) => String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
const who = (name) => `<span class="who"><span class="avatar" style="background:${printColor(name)}">${escapeHtml(printInitials(name))}</span>${escapeHtml(name)}</span>`;

function openPrint(kind) {
  const g = group;
  const active = g.participants.filter((p) => !p.pending);
  const today = new Date().toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" });
  const docHead = (type) => `<div class="head"><div><div class="kicker">Wichteln</div><h1>${escapeHtml(g.title)}</h1><div class="chips">${[
    g.organizerName ? `<span class="chip">Organisation <b>${escapeHtml(g.organizerName)}</b></span>` : "",
    g.eventDate ? `<span class="chip">Bescherung <b>${escapeHtml(eventLine(g))}</b></span>` : "",
    g.budget ? `<span class="chip">Budget <b>${escapeHtml(fmtBudget(g))}</b></span>` : "",
    g.motto ? `<span class="chip">Motto <b>${escapeHtml(g.motto)}</b></span>` : "",
    `<span class="chip">${active.length} Teilnehmende</span>`,
  ].filter(Boolean).join("")}</div></div><div class="doc-type"><b>${escapeHtml(type)}</b>${escapeHtml(today)}</div></div>`;
  const foot = `<div class="foot"><span>${escapeHtml(g.title)} · ${escapeHtml(today)}</span><span>Erstellt mit Advently · mein-adventskalender.ch</span></div>`;
  const revealed = g.status === "revealed";
  let title = g.title;
  let body = "";
  if (kind === "participants") {
    title = `Teilnehmerliste – ${g.title}`;
    const status = (p) => p.joinedAt ? `<span class="pill pill-ok">dabei</span>` : p.invitedAt ? `<span class="pill pill-wait">eingeladen</span>` : `<span class="pill pill-soft">eingetragen</span>`;
    body = `${docHead("Teilnehmerliste")}<h2>Teilnehmende <span class="count">${active.length} Personen · ${active.filter((p) => p.joinedAt).length} schon dabei</span></h2>
      <table><thead><tr><th class="num">#</th><th>Name</th><th>E-Mail</th><th>Status</th><th>Persönlicher Link</th></tr></thead><tbody>${active.map((p, i) => `<tr><td class="num">${i + 1}</td><td>${who(p.name)}${p.isOrganizer ? ` <span class="pill pill-soft" style="margin-left:6px">Orga</span>` : ""}</td><td>${escapeHtml(p.email || "–")}</td><td>${status(p)}</td><td class="mono">${escapeHtml(p.link)}</td></tr>`).join("")}</tbody></table>
      <p class="muted" style="margin-top:10px">Der persönliche Link ist der Zugang zur Runde – bitte nur der jeweiligen Person geben.</p>${foot}`;
  } else if (kind === "wishlists") {
    title = `Wunschzettel – ${g.title}`;
    const hints = (p) => [p.hints.allergies && `Allergien: ${p.hints.allergies}`, p.hints.favorites && `Lieblingsgeschmack: ${p.hints.favorites}`, p.hints.hobbies && `Hobbys: ${p.hints.hobbies}`, p.hints.notes && `Sonstiges: ${p.hints.notes}`].filter(Boolean);
    body = `${docHead("Wunschzettel")}<h2>Wunschzettel <span class="count">${active.filter((p) => p.wishlist.length).length} von ${active.length} ausgefüllt</span></h2>
      ${active.map((p) => `<div class="person">${who(p.name)}${p.wishlist.length
        ? p.wishlist.map((w) => `<div class="wish"><div><div>${escapeHtml(w.title || w.url)}${w.note ? ` <span class="muted">– ${escapeHtml(w.note)}</span>` : ""}</div>${w.url ? `<span class="mono url">${escapeHtml(w.url)}</span>` : ""}</div>${w.price ? `<span class="price">${escapeHtml(w.price)}</span>` : ""}</div>`).join("")
        : `<div class="empty">Noch keine Wünsche eingetragen.</div>`}${hints(p).length ? `<div class="hints">${hints(p).map((h) => `<span class="chip">${escapeHtml(h)}</span>`).join("")}</div>` : ""}</div>`).join("")}${foot}`;
  } else if (kind === "matrix") {
    title = `Ziehungsmatrix – ${g.title}`;
    const excluded = (a, b) => g.exclusions.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    body = `${docHead(revealed ? "Ziehungsmatrix" : "Ausschluss-Matrix")}<h2>${revealed ? "Wer zieht wen" : "Ausschlüsse"} <span class="count">Zeile zieht, Spalte wird beschenkt</span></h2>
      <table class="matrix"><thead><tr><th class="row"></th>${active.map((p) => `<th class="col"><span>${escapeHtml(p.name)}</span></th>`).join("")}</tr></thead><tbody>
      ${active.map((row) => `<tr><th class="row">${who(row.name)}</th>${active.map((col) => `<td>${row.id === col.id ? `<span class="self">–</span>` : revealed && row.assignedTo === col.id ? `<span class="dot"></span>` : excluded(row.id, col.id) ? `<span class="x">×</span>` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table>
      <div class="legend">${revealed ? `<span><span class="dot"></span> Los: diese Person wird beschenkt</span>` : ""}<span><span class="x">×</span> Ausschluss (in beide Richtungen)</span>${revealed ? "" : `<span>Die Lose erscheinen nach der Enthüllung.</span>`}</div>${foot}`;
  } else if (kind === "card") {
    title = `Einladungskarte – ${g.title}`;
    const qr = inviteCard?.qr || "";
    const facts = [g.eventDate ? `<b>Wann</b> ${escapeHtml(eventLine(g))}` : "", g.budget ? `<b>Budget</b> ${escapeHtml(fmtBudget(g))}` : "", g.motto ? `<b>Motto</b> ${escapeHtml(g.motto)}` : ""].filter(Boolean);
    body = `<div class="card"><div class="kicker">Einladung zum Wichteln</div><div class="title">${escapeHtml(g.title)}</div><div class="stars">✦ ✦ ✦</div><div>${g.organizerName ? `${escapeHtml(g.organizerName)} lädt dich herzlich ein.` : "Du bist herzlich eingeladen."}</div>${qr ? `<img src="${qr}" alt="QR-Code">` : ""}${facts.length ? `<div class="facts">${facts.join("<br>")}</div>` : ""}<div style="margin-top:14px">QR-Code scannen oder Link öffnen und eintragen:</div><div class="link">${escapeHtml(g.inviteLink)}</div></div>`;
  } else if (kind === "recap") {
    title = `Rückblick – ${g.title}`;
    const thanks = g.thanks || [];
    const photos = g.photos || [];
    const chains = revealed ? drawCycles(active) : [];
    body = `${docHead("Rückblick")}
      ${revealed ? `<h2>Wer hat wen beschenkt?</h2>${chains.map((ring) => `<div class="chain">${ring.map((p) => `${who(p.name)}<span class="arrow">→</span>`).join("")}<span class="loop" title="und wieder zur ersten Person">↺</span></div>`).join("")}<p class="muted">Jede Person beschenkt die nächste, die letzte wieder die erste.</p>` : ""}
      <h2>Gruppenchat <span class="count">${thanks.length}</span></h2>${thanks.length ? thanks.map((t) => `<div class="thanks">${escapeHtml(t.text)}<small>${escapeHtml(t.from)} · ${new Date(t.at).toLocaleDateString("de-CH")}</small></div>`).join("") : `<p class="empty">Noch keine Nachrichten im Gruppenchat.</p>`}
      <h2>Fotos <span class="count">${photos.length}</span></h2>${photos.length ? `<div class="recap-photos">${photos.map((ph) => `<img src="${escapeHtml(ph.url)}" alt="${escapeHtml(ph.caption || "")}">`).join("")}</div>` : `<p class="empty">Noch keine Fotos.</p>`}${foot}`;
  }
  const w = window.open("", "_blank");
  if (!w) return toast("Pop-up blockiert – bitte Pop-ups für diese Seite erlauben.", true);
  w.document.write(printShell(title, body));
  w.document.close();
}

load().catch((e) => {
  console.error(e);
  toast(e.message, true);
});
