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
  await loadGroups();
}

async function loadGroups() {
  const groups = await api.listWichtelGroups();
  const list = document.getElementById("group-list");
  list.innerHTML = "";
  document.getElementById("empty-state").classList.toggle("hidden", groups.length > 0);
  for (const g of groups) {
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
        <span class="text-[11px] font-semibold px-2 py-1 rounded-full ${st.cls}">${st.text}</span>
      </div>
      <div class="flex items-center gap-4 mt-4 text-sm text-slate-300">
        <span><i data-icon="users"></i> ${g.participantCount} Teilnehmende</span>
        ${g.pendingCount ? `<span class="text-amber-300"><i data-icon="hourglass"></i> ${g.pendingCount} im Warteraum</span>` : ""}
      </div>
      ${g.deleteAt ? `<p class="text-[11px] text-slate-500 mt-3">Automatische Löschung am ${new Date(g.deleteAt).toLocaleDateString("de-DE")}</p>` : ""}`;
    list.appendChild(card);
  }
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
