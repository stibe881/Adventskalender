const THEME_LABELS = {
  partner: "💕 Partner*in",
  kid: "🎈 Kind",
  parents: "🌲 Eltern",
  modern: "✨ Modern",
};

const listEl = document.getElementById("calendar-list");
const emptyState = document.getElementById("empty-state");
const createForm = document.getElementById("create-form");

async function init() {
  try {
    const me = await api.me();
    document.getElementById("admin-name").textContent = me.username;
  } catch (_) {
    window.location.href = "/admin/";
    return;
  }
  await loadCalendars();
}

async function loadCalendars() {
  const calendars = await api.listCalendars();
  listEl.innerHTML = "";
  emptyState.classList.toggle("hidden", calendars.length > 0);
  calendars.forEach((cal) => listEl.appendChild(renderCard(cal)));
}

function renderCard(cal) {
  const card = document.createElement("div");
  card.className = "bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3";
  const progressPct = Math.round((cal.filledDoors / 24) * 100);

  card.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div>
        <h3 class="font-display font-semibold text-lg">${escapeHtml(cal.recipientName)}</h3>
        <p class="text-xs text-slate-400">${THEME_LABELS[cal.theme] || cal.theme} · Dezember ${cal.year}</p>
      </div>
      <button data-action="delete" class="text-slate-500 hover:text-rose-400 text-sm" title="Löschen">🗑</button>
    </div>

    <div>
      <div class="flex justify-between text-xs text-slate-400 mb-1">
        <span>${cal.filledDoors}/24 Türchen befüllt</span>
        <span>${cal.openedDoors} geöffnet</span>
      </div>
      <div class="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div class="h-full bg-emerald-500" style="width:${progressPct}%"></div>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 mt-1">
      <a href="/admin/editor.html?id=${cal.id}" class="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-3 py-1.5 transition-colors">Bearbeiten</a>
      <a href="/c/preview/${cal.id}" target="_blank" rel="noopener" class="rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-3 py-1.5 transition-colors">Vorschau</a>
      <button data-action="copy" data-url="${cal.shareUrl}" class="rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-3 py-1.5 transition-colors">🔗 Link kopieren</button>
    </div>
  `;

  card.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    if (!confirm(`Kalender für "${cal.recipientName}" wirklich löschen?`)) return;
    await api.deleteCalendar(cal.id);
    await loadCalendars();
  });

  card.querySelector('[data-action="copy"]').addEventListener("click", async (e) => {
    await navigator.clipboard.writeText(cal.shareUrl);
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = "✅ Kopiert!";
    setTimeout(() => (btn.textContent = original), 1500);
  });

  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(createForm);
  try {
    const cal = await api.createCalendar({
      recipientName: fd.get("recipientName"),
      theme: fd.get("theme"),
      year: fd.get("year"),
    });
    createForm.reset();
    window.location.href = `/admin/editor.html?id=${cal.id}`;
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await api.logout();
  window.location.href = "/admin/";
});

init();
