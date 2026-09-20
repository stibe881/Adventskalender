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
function eventLine(g) {
  if (!g.eventDate) return "";
  return `${formatDate(g.eventDate)}${g.eventTime ? ` um ${g.eventTime} Uhr` : ""}${g.eventPlace ? `, ${g.eventPlace}` : ""}`;
}
const toast = (msg, isError = false) => UI.toast(msg, { error: isError });
const copyText = (text) => UI.copy(text);
function inviteText() {
  const g = group;
  return [`${g.organizerName ? `${g.organizerName} lädt dich` : "Du bist"} zum Wichteln eingeladen: „${g.title}“`, g.eventDate ? `Bescherung: ${eventLine(g)}` : "", g.budget ? `Budget: ${g.budget}` : "", g.motto ? `Motto: ${g.motto}` : "", "Hier eintragen:"].filter(Boolean).join("\n");
}
async function shareInvite() {
  const r = await UI.share({ title: `Wichteln: ${group.title}`, text: inviteText(), url: group.inviteLink });
  if (r === "copied") toast("Link kopiert – teilen geht auf diesem Gerät nicht direkt.");
}

async function load() {
  group = await api.getWichtelGroup(groupId);
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
    if (r.url) window.location.href = r.url;
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
function renderDraw(active) {
  const hint = document.getElementById("draw-hint");
  const drawBtn = document.getElementById("draw-btn");
  const revealBtn = document.getElementById("reveal-btn");
  const table = document.getElementById("reveal-table");
  const box = document.getElementById("checklist");
  const min = group.minParticipants || 3;
  if (group.status === "draft") {
    hint.textContent = `Der Generator zieht kreuzungsfrei und schickt jedem sein Los${group.inviteMode === "names" ? " (ohne E-Mail: über die persönlichen Links)" : ""}. Vorher kurz die Checkliste:`;
    drawBtn.textContent = "Jetzt auslosen";
    drawBtn.disabled = active.length < min;
    revealBtn.classList.add("hidden");
    document.getElementById("unreveal-btn").classList.add("hidden");
    table.classList.add("hidden");
    box.classList.remove("hidden");
    renderChecklist();
  } else {
    hint.textContent = `Ausgelost am ${new Date(group.drawnAt).toLocaleString("de-DE")}. ${group.status === "revealed" ? "Enthüllt – die Auflösung siehst nur du als Organisator." : "Wer wen gezogen hat, bleibt bis zur Enthüllung geheim – auch für dich."}`;
    drawBtn.textContent = "Neu auslosen";
    drawBtn.disabled = false;
    revealBtn.classList.toggle("hidden", group.status === "revealed");
    document.getElementById("unreveal-btn").classList.toggle("hidden", group.status !== "revealed");
    box.classList.add("hidden");
    if (group.status === "revealed") {
      table.classList.remove("hidden");
      table.innerHTML = `<h3 class="text-sm font-semibold text-amber-200 mb-2">Auflösung</h3><div class="grid sm:grid-cols-2 gap-1 text-sm">${active.map((p) => `<div class="bg-black/20 rounded-lg px-3 py-1.5">${escapeHtml(p.name)} <span class="text-slate-500">→</span> <b>${escapeHtml(p.assignedToName || "?")}</b></div>`).join("")}</div>`;
    } else {
      table.classList.add("hidden");
    }
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
    : `<p class="text-sm text-slate-500">Noch kein Dankeschön.</p>`;
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
    body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#111;margin:32px;font-size:14px}
    h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
    .muted{color:#666;font-size:12px}table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f3f3f3}
    .matrix td,.matrix th{text-align:center;width:28px;padding:4px}.matrix th.row{text-align:left;width:auto}
    ul{margin:4px 0 0 18px;padding:0}.x{color:#b91c1c;font-weight:700}
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
    .recap-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.recap-photos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px}
    .thanks{border-left:3px solid #b91c1c;padding:6px 10px;margin:6px 0;background:#fff7f7}.thanks small{display:block;color:#666;font-size:11px}
    @media print{body{margin:12mm}.card{margin:0 auto;page-break-inside:avoid}}
  </style></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`;
}

function openPrint(kind) {
  const g = group;
  const active = g.participants.filter((p) => !p.pending);
  const head = `<h1>${escapeHtml(g.title)}</h1><p class="muted">${[g.organizerName ? `Organisation: ${escapeHtml(g.organizerName)}` : "", g.eventDate ? `Bescherung: ${escapeHtml(eventLine(g))}` : "", g.budget ? `Budget: ${escapeHtml(g.budget)}` : "", g.motto ? `Motto: ${escapeHtml(g.motto)}` : ""].filter(Boolean).join(" · ")}</p>`;
  let title = g.title;
  let body = "";
  if (kind === "participants") {
    title = `Teilnehmerliste – ${g.title}`;
    body = `${head}<h2>Teilnehmerliste (${active.length})</h2><table><tr><th>#</th><th>Name</th><th>E-Mail</th><th>Status</th><th>Persönlicher Link</th></tr>${active.map((p, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.email || "–")}</td><td>${p.joinedAt ? "dabei" : p.invitedAt ? "eingeladen" : "eingetragen"}</td><td style="font-size:11px">${escapeHtml(p.link)}</td></tr>`).join("")}</table>`;
  } else if (kind === "wishlists") {
    title = `Wunschzettel – ${g.title}`;
    body = `${head}<h2>Wunschzettel</h2>${active.map((p) => `<h3 style="margin:16px 0 2px">${escapeHtml(p.name)}</h3>${p.wishlist.length ? `<ul>${p.wishlist.map((w) => `<li>${escapeHtml(w.title || w.url)}${w.price ? ` – ${escapeHtml(w.price)}` : ""}${w.note ? ` <span class="muted">(${escapeHtml(w.note)})</span>` : ""}${w.url ? `<br><span class="muted">${escapeHtml(w.url)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="muted">Leerer Wunschzettel.${[p.hints.allergies, p.hints.favorites, p.hints.hobbies].some(Boolean) ? ` Hinweise: ${escapeHtml([p.hints.allergies && `Allergien: ${p.hints.allergies}`, p.hints.favorites && `Lieblingsgeschmack: ${p.hints.favorites}`, p.hints.hobbies && `Hobbys: ${p.hints.hobbies}`].filter(Boolean).join("; "))}` : ""}</p>`}`).join("")}`;
  } else if (kind === "matrix") {
    title = `Ziehungsmatrix – ${g.title}`;
    const revealed = g.status === "revealed";
    const excluded = (a, b) => g.exclusions.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    body = `${head}<h2>${revealed ? "Ziehungsmatrix (Auflösung)" : "Ausschluss-Matrix"}</h2><p class="muted">${revealed ? "Zeile = zieht, Spalte = beschenkt. ● markiert das Los, × einen Ausschluss." : "× = darf sich nicht ziehen (in beide Richtungen). Die Lose werden erst nach der Enthüllung gezeigt."}</p>
      <table class="matrix"><tr><th class="row">zieht ↓ / beschenkt →</th>${active.map((p) => `<th title="${escapeHtml(p.name)}">${escapeHtml(p.name.slice(0, 3))}</th>`).join("")}</tr>
      ${active.map((row) => `<tr><th class="row">${escapeHtml(row.name)}</th>${active.map((col) => `<td>${row.id === col.id ? "–" : revealed && row.assignedTo === col.id ? "●" : excluded(row.id, col.id) ? '<span class="x">×</span>' : ""}</td>`).join("")}</tr>`).join("")}</table>`;
  } else if (kind === "card") {
    title = `Einladungskarte – ${g.title}`;
    const qr = inviteCard?.qr || "";
    const facts = [g.eventDate ? `<b>Wann</b> ${escapeHtml(eventLine(g))}` : "", g.budget ? `<b>Budget</b> ${escapeHtml(g.budget)}` : "", g.motto ? `<b>Motto</b> ${escapeHtml(g.motto)}` : ""].filter(Boolean);
    body = `<div class="card"><div class="kicker">Einladung zum Wichteln</div><div class="title">${escapeHtml(g.title)}</div><div class="stars">✦ ✦ ✦</div><div>${g.organizerName ? `${escapeHtml(g.organizerName)} lädt dich herzlich ein.` : "Du bist herzlich eingeladen."}</div>${qr ? `<img src="${qr}" alt="QR-Code">` : ""}${facts.length ? `<div class="facts">${facts.join("<br>")}</div>` : ""}<div style="margin-top:14px">QR-Code scannen oder Link öffnen und eintragen:</div><div class="link">${escapeHtml(g.inviteLink)}</div></div>`;
  } else if (kind === "recap") {
    title = `Rückblick – ${g.title}`;
    const thanks = g.thanks || [];
    const revealed = g.status === "revealed";
    body = `${head}<h2>Rückblick</h2>
      ${revealed ? `<h3>Wer hat wen beschenkt?</h3><table><tr><th>Wichtel</th><th>hat beschenkt</th></tr>${active.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.assignedToName || "?")}</td></tr>`).join("")}</table>` : ""}
      <h3>Dankeschöns (${thanks.length})</h3>${thanks.length ? thanks.map((t) => `<div class="thanks">${escapeHtml(t.text)}<small>${escapeHtml(t.from)} · ${new Date(t.at).toLocaleDateString("de-DE")}</small></div>`).join("") : `<p class="muted">Noch keine.</p>`}
      <h3>Fotos (${g.photos.length})</h3>${g.photos.length ? `<div class="recap-photos">${g.photos.map((ph) => `<img src="${escapeHtml(ph.url)}" alt="${escapeHtml(ph.caption || "")}">`).join("")}</div>` : `<p class="muted">Noch keine.</p>`}`;
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
