requireAdminOrRedirect();

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

async function init() {
  const user = await api.me();
  document.getElementById("admin-name").textContent = user.email;
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api.logout();
    window.location.href = "/";
  });
  const orgInput = document.querySelector('#create-form [name="organizerName"]');
  if (orgInput && user.username) orgInput.value = user.username;
  initTabs();
  await loadGroups();
  await loadParticipations();
}

let groupsCache = [];
const view = UI.viewSwitch({ key: "wichtelnView", gridBtn: document.getElementById("view-grid-btn"), tableBtn: document.getElementById("view-table-btn"), onChange: () => renderGroups(groupsCache) });

function groupCard(g) {
  const st = STATUS_LABELS[g.status] || STATUS_LABELS.draft;
  const card = document.createElement("a");
  card.href = `/admin/wichteln-editor.html?id=${encodeURIComponent(g.id)}`;
  card.className = "block bg-white/5 border border-white/10 hover:border-emerald-500/50 rounded-2xl p-5 transition-colors";
  card.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="font-display font-semibold text-lg text-white">${escapeHtml(g.title)}</h3>
        <p class="text-xs text-slate-400 mt-1">${g.eventDate ? `Bescherung am ${formatDate(g.eventDate)}` : "Noch kein Termin"}</p>
      </div>
      <span class="flex items-center gap-1">${g.isPro ? `<span class="ui-pro-badge">PRO</span>` : ""}<span class="text-[11px] font-semibold px-2 py-1 rounded-full ${st.cls}">${st.text}</span></span>
    </div>
    <div class="flex items-center gap-4 mt-4 text-sm text-slate-300">
      <span><i data-icon="users"></i> ${g.participantCount} Teilnehmende</span>
      ${g.pendingCount ? `<span class="text-amber-300"><i data-icon="hourglass"></i> ${g.pendingCount} im Warteraum</span>` : ""}
    </div>
    ${g.deleteAt ? `<p class="text-[11px] text-slate-500 mt-3">Automatische Löschung am ${new Date(g.deleteAt).toLocaleDateString("de-DE")}</p>` : ""}`;
  return card;
}

function groupRow(g) {
  const st = STATUS_LABELS[g.status] || STATUS_LABELS.draft;
  const row = document.createElement("tr");
  row.className = "hover:bg-white/5 transition-colors cursor-pointer";
  row.addEventListener("click", () => { window.location.href = `/admin/wichteln-editor.html?id=${encodeURIComponent(g.id)}`; });
  row.innerHTML = `
    <td class="px-2 sm:px-4 py-3" style="max-width:0;width:100%">
      <div class="font-display font-semibold text-white flex items-center gap-2" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="truncate">${escapeHtml(g.title)}</span>${g.isPro ? `<span class="ui-pro-badge">PRO</span>` : ""}</div>
      <div class="text-xs text-slate-500 md:hidden" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.eventDate ? `Bescherung am ${formatDate(g.eventDate)}` : "Noch kein Termin"}</div>
    </td>
    <td class="px-2 sm:px-4 py-3 whitespace-nowrap"><span class="text-[11px] font-semibold px-2 py-1 rounded-full ${st.cls}">${st.text}</span></td>
    <td class="px-2 sm:px-4 py-3 whitespace-nowrap"><span class="text-emerald-400 font-bold">${g.participantCount}</span>${g.pendingCount ? ` <span class="text-amber-300 text-xs">+${g.pendingCount} wartend</span>` : ""}</td>
    <td class="px-4 py-3 hidden md:table-cell whitespace-nowrap">${g.eventDate ? formatDate(g.eventDate) : "–"}</td>`;
  return row;
}

function renderGroups(groups) {
  const list = document.getElementById("group-list");
  const tableWrap = document.getElementById("group-table-container");
  const body = document.getElementById("group-table-body");
  list.innerHTML = "";
  body.innerHTML = "";
  const grid = view.get() === "grid";
  list.classList.toggle("hidden", !grid || !groups.length);
  tableWrap.classList.toggle("hidden", grid || !groups.length);
  for (const g of groups) (grid ? list : body).appendChild(grid ? groupCard(g) : groupRow(g));
}

async function loadGroups() {
  groupsCache = await api.listWichtelGroups();
  document.getElementById("empty-state").classList.toggle("hidden", groupsCache.length > 0);
  renderGroups(groupsCache);
}

// ---------- Rounds I take part in ----------
let currentTab = "own";
function showTab(tab) {
  currentTab = tab === "part" ? "part" : "own";
  try { localStorage.setItem("wichtelnTab", currentTab); } catch (_) {}
  document.getElementById("own-section").classList.toggle("hidden", currentTab !== "own");
  document.getElementById("own-actions").classList.toggle("hidden", currentTab !== "own");
  document.getElementById("part-section").classList.toggle("hidden", currentTab !== "part");
  document.querySelectorAll("#tab-switch [data-tab]").forEach((b) => {
    const on = b.dataset.tab === currentTab;
    b.classList.toggle("bg-emerald-600", on); b.classList.toggle("text-white", on); b.classList.toggle("shadow", on);
    b.classList.toggle("hover:bg-slate-700", !on); b.classList.toggle("text-slate-400", !on);
  });
}
function initTabs() {
  document.querySelectorAll("#tab-switch [data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  showTab(new URLSearchParams(window.location.search).get("tab") || localStorage.getItem("wichtelnTab") || "own");
}

function participationCard(g) {
  const st = STATUS_LABELS[g.status] || STATUS_LABELS.draft;
  const card = document.createElement("a");
  card.href = g.link;
  card.className = "block bg-white/5 border border-white/10 hover:border-emerald-500/50 rounded-2xl p-5 transition-colors";
  card.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="font-display font-semibold text-lg text-white truncate">${escapeHtml(g.title)}</h3>
        <p class="text-xs text-slate-400 mt-1">${g.isOwn ? "Du organisierst diese Runde und machst selbst mit" : g.organizerName ? `Organisiert von ${escapeHtml(g.organizerName)}` : "Du bist eingeladen"}</p>
      </div>
      <span class="flex items-center gap-1">${g.unread ? `<span class="ui-badge">${g.unread}</span>` : ""}${g.isPro ? `<span class="ui-pro-badge">PRO</span>` : ""}<span class="text-[11px] font-semibold px-2 py-1 rounded-full ${st.cls}">${st.text}</span></span>
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-sm text-slate-300">
      <span><i data-icon="calendar"></i> ${g.eventDate ? `Bescherung am ${formatDate(g.eventDate)}${g.eventTime ? `, ${escapeHtml(g.eventTime)} Uhr` : ""}` : "Noch kein Termin"}</span>
      <span><i data-icon="users"></i> ${g.participantCount} Teilnehmende</span>
      ${g.recipientName ? `<span class="text-emerald-300"><i data-icon="gift"></i> Du beschenkst ${escapeHtml(g.recipientName)}</span>` : ""}
    </div>
    <div class="mt-4"><span class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 group-hover:bg-emerald-500 text-white text-sm font-semibold px-3 py-1.5"><i data-icon="drama"></i> Meinen Wichtel-Bereich öffnen</span></div>`;
  return card;
}

async function loadParticipations() {
  let list = [];
  try { list = await api.listWichtelParticipations(); } catch (err) { console.warn("Teilnahmen:", err.message); }
  const el = document.getElementById("part-list");
  const badge = document.getElementById("part-count");
  el.innerHTML = "";
  document.getElementById("part-empty").classList.toggle("hidden", list.length > 0);
  badge.textContent = String(list.length);
  badge.classList.toggle("hidden", !list.length);
  for (const g of list) el.appendChild(participationCard(g));
}

const createModal = document.getElementById("create-modal");
document.getElementById("new-group-btn").addEventListener("click", () => createModal.classList.remove("hidden"));
document.getElementById("create-close").addEventListener("click", () => createModal.classList.add("hidden"));
document.getElementById("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const err = document.getElementById("create-error");
  err.classList.add("hidden");
  try {
    const group = await api.createWichtelGroup({
      title: fd.get("title"),
      organizerName: fd.get("organizerName"),
      inviteMode: fd.get("inviteMode"),
      organizerParticipates: fd.get("organizerParticipates") === "on",
    });
    window.location.href = `/admin/wichteln-editor.html?id=${encodeURIComponent(group.id)}`;
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove("hidden");
  }
});

init().catch((e) => console.error(e));
