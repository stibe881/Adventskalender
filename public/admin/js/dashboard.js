const THEME_LABELS = {
  partner: "Partner*in",
  kid: "Kind",
  parents: "Eltern",
  modern: "Modern",
  firma: "Firma",
};

const listEl = document.getElementById("calendar-list");
const emptyState = document.getElementById("empty-state");
const createForm = document.getElementById("create-form");

let isProUser = false;

document.addEventListener("DOMContentLoaded", () => {
  const yearInput = document.querySelector('input[name="year"]');
  if (yearInput) {
    yearInput.value = new Date().getFullYear();
  }
});

async function init() {
  try {
    const user = await api.me();
    document.getElementById("admin-name").textContent = user.email;
    isProUser = !!user.isPro;
    
    if (isProUser) {
      document.getElementById("pro-badge").classList.remove("hidden");
      document.getElementById("upgrade-btn").classList.add("hidden");
    } else {
      document.getElementById("upgrade-btn").classList.remove("hidden");
    }

    document.getElementById("logout-btn").addEventListener("click", async () => {
      await api.logout();
      window.location.href = "/admin/";
    });
    
    // Payment Status prüfen
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("payment") === "success") {
      try {
        await api.refreshToken(); // Refresh token since we are now PRO
        alert("Zahlung erfolgreich! Du bist jetzt PRO User.");
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.reload();
        return;
      } catch (err) {
        console.error("Token refresh failed:", err);
      }
    } else if (urlParams.get("payment") === "cancelled") {
      alert("Zahlung abgebrochen.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    document.getElementById("upgrade-btn").addEventListener("click", async () => {
      try {
        const res = await api.checkout();
        if (res.url) {
          window.location.href = res.url;
        }
      } catch(e) { alert(e.message); }
    });

    if (user.email === "stefan.gross@gross-ict.ch") {
      const toggleBtn = document.getElementById("admin-toggle-pro");
      toggleBtn.classList.remove("hidden");
      toggleBtn.addEventListener("click", async () => {
        try {
          await api.devTogglePro();
          window.location.reload();
        } catch (e) { alert(e.message); }
      });
    }

    await loadCalendars();
  } catch (err) {
    console.error("Dashboard Init Error:", err);
    alert("Ein Fehler ist aufgetreten: " + err.message);
  }
}

let currentView = localStorage.getItem("dashboardView") || "grid";

async function loadCalendars() {
  const calendars = await api.listCalendars();
  const listEl = document.getElementById("calendar-list");
  const tableContainer = document.getElementById("calendar-table-container");
  const tableBody = document.getElementById("calendar-table-body");
  const emptyState = document.getElementById("empty-state");
  
  listEl.innerHTML = "";
  tableBody.innerHTML = "";
  emptyState.classList.toggle("hidden", calendars.length > 0);
  
  if (calendars.length === 0) {
    listEl.classList.add("hidden");
    tableContainer.classList.add("hidden");
    return;
  }
  
  if (currentView === "grid") {
    listEl.classList.remove("hidden");
    tableContainer.classList.add("hidden");
    calendars.forEach((cal) => listEl.appendChild(renderCard(cal)));
  } else {
    listEl.classList.add("hidden");
    tableContainer.classList.remove("hidden");
    calendars.forEach((cal) => tableBody.appendChild(renderTableRow(cal)));
  }
  updateViewButtons();
}

function updateViewButtons() {
  const gridBtn = document.getElementById("view-grid-btn");
  const tableBtn = document.getElementById("view-table-btn");
  if (currentView === "grid") {
    gridBtn.classList.replace("text-slate-400", "text-white");
    gridBtn.classList.replace("hover:bg-slate-700", "bg-emerald-600");
    gridBtn.classList.add("shadow");
    tableBtn.classList.replace("text-white", "text-slate-400");
    tableBtn.classList.replace("bg-emerald-600", "hover:bg-slate-700");
    tableBtn.classList.remove("shadow");
  } else {
    tableBtn.classList.replace("text-slate-400", "text-white");
    tableBtn.classList.replace("hover:bg-slate-700", "bg-emerald-600");
    tableBtn.classList.add("shadow");
    gridBtn.classList.replace("text-white", "text-slate-400");
    gridBtn.classList.replace("bg-emerald-600", "hover:bg-slate-700");
    gridBtn.classList.remove("shadow");
  }
}

document.getElementById("view-grid-btn").addEventListener("click", () => {
  currentView = "grid";
  localStorage.setItem("dashboardView", "grid");
  loadCalendars();
});

document.getElementById("view-table-btn").addEventListener("click", () => {
  currentView = "table";
  localStorage.setItem("dashboardView", "table");
  loadCalendars();
});

window.toggleMenu = (id) => {
  document.querySelectorAll('[id^="menu-"]').forEach((m) => {
    if (m.id !== `menu-${id}`) m.classList.add("hidden");
  });
  const menu = document.getElementById(`menu-${id}`);
  if (menu) menu.classList.toggle("hidden");
};

window.duplicateCalendar = async (id) => {
  try {
    await api.duplicateCalendar(id);
    await loadCalendars();
  } catch (err) {
    alert("Fehler beim Duplizieren: " + err.message);
  }
};

window.deleteCalendar = async (id) => {
  if (!confirm("Kalender wirklich löschen?")) return;
  try {
    await api.deleteCalendar(id);
    await loadCalendars();
  } catch (err) {
    alert("Fehler beim Löschen: " + err.message);
  }
};

window.promptImport = async (id) => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const res = await fetch(`/api/admin/calendars/${id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      if (!res.ok) throw new Error("Import fehlgeschlagen");
      alert("CSV erfolgreich importiert!");
      await loadCalendars();
    } catch (err) {
      alert(err.message);
    }
  };
  input.click();
};

let currentChart = null;

window.showAnalytics = async (id) => {
  if (!isProUser) {
    alert("Diese Funktion ist nur für PRO-Nutzer verfügbar.");
    return;
  }
  try {
    const res = await fetch(`/api/admin/calendars/${id}/analytics`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    
    document.getElementById("analytics-modal").classList.remove("hidden");
    
    const ctx = document.getElementById("analyticsChart").getContext("2d");
    if (currentChart) currentChart.destroy();
    
    const labels = data.openings.map(d => `Tag ${d.day}`);
    const openedData = data.openings.map(d => d.opened ? 1 : 0);
    const leadsData = data.openings.map(d => d.leads);

    currentChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Geöffnet",
            data: openedData,
            backgroundColor: "#10b981", // emerald-500
          },
          {
            label: "Leads (Gewinnspiel)",
            data: leadsData,
            backgroundColor: "#6366f1", // indigo-500
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  } catch(e) {
    alert(e.message);
  }
};

window.addEventListener("click", (e) => {
  if (!e.target.closest(".calendar-menu-btn") && !e.target.closest('[id^="menu-"]')) {
    document.querySelectorAll('[id^="menu-"]').forEach((m) => m.classList.add("hidden"));
  }
});

function renderTableRow(cal) {
  const row = document.createElement("tr");
  row.className = "hover:bg-white/5 transition-colors group";
  const progressPct = Math.round((cal.filledDoors / 24) * 100);
  
  row.innerHTML = `
    <td class="px-4 py-3">
      <div class="font-display font-semibold text-white">${escapeHtml(cal.recipientName)}</div>
      <div class="text-xs text-slate-500">Erstellt: ${new Date(cal.createdAt).toLocaleDateString("de-DE")}</div>
    </td>
    <td class="px-4 py-3">${THEME_LABELS[cal.theme] || cal.theme} (${cal.year})</td>
    <td class="px-4 py-3">
      <div class="flex items-center gap-2">
        <span class="text-emerald-400 font-bold">${cal.filledDoors}/24</span>
        <div class="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full bg-emerald-500" style="width: ${progressPct}%"></div>
        </div>
      </div>
    </td>
    <td class="px-4 py-3">
      <span class="text-amber-400 font-bold">${cal.openedDoors}/24</span>
    </td>
    <td class="px-4 py-3 text-right">
      <div class="relative inline-block text-left">
        <button class="calendar-menu-btn text-slate-400 hover:text-white p-2" onclick="toggleMenu('table-${cal.id}')">
          •••
        </button>
        <div id="menu-table-${cal.id}" class="hidden absolute right-0 mt-2 w-48 bg-slate-800 rounded-lg shadow-lg border border-white/10 z-10 text-sm overflow-hidden text-left">
          <a href="/admin/editor.html?id=${cal.id}" class="block px-4 py-2 hover:bg-slate-700 text-white">Bearbeiten</a>
          <button onclick="copyLink('${cal.shareUrl}')" class="w-full text-left px-4 py-2 hover:bg-slate-700 text-white">Link kopieren</button>
          <a href="${cal.shareUrl}" target="_blank" class="block px-4 py-2 hover:bg-slate-700 text-white">Ansehen</a>
          <button onclick="duplicateCalendar('${cal.id}')" class="w-full text-left px-4 py-2 hover:bg-slate-700 text-white border-t border-white/10">Duplizieren</button>
          <button onclick="showAnalytics('${cal.id}')" class="w-full text-left px-4 py-2 hover:bg-slate-700 text-emerald-400 border-b border-white/10">Statistiken</button>
          <button onclick="deleteCalendar('${cal.id}')" class="w-full text-left px-4 py-2 hover:bg-rose-500/20 text-rose-400">Löschen</button>
        </div>
      </div>
    </td>
  `;
  return row;
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
      <div class="relative inline-block text-left">
        <button class="calendar-menu-btn text-slate-400 hover:text-white p-2" onclick="toggleMenu('${cal.id}')">
          ⋮
        </button>
        <div id="menu-${cal.id}" class="hidden absolute right-0 mt-2 w-48 bg-slate-800 rounded-lg shadow-lg border border-white/10 z-10 text-sm overflow-hidden">
          <button onclick="duplicateCalendar('${cal.id}')" class="w-full text-left px-4 py-2 hover:bg-slate-700 text-white flex items-center gap-2">Kopieren</button>
          <button onclick="showAnalytics('${cal.id}')" class="w-full text-left px-4 py-2 hover:bg-slate-700 text-purple-400 flex items-center gap-2">Statistiken</button>
          <a href="/api/admin/calendars/${cal.id}/export-giveaway" class="w-full text-left px-4 py-2 hover:bg-slate-700 text-emerald-400 flex items-center gap-2" download>Leads Exportieren</a>
          <button onclick="promptImport('${cal.id}')" class="w-full text-left px-4 py-2 hover:bg-slate-700 text-blue-400 flex items-center gap-2">CSV Import</button>
          <button onclick="deleteCalendar('${cal.id}')" class="w-full text-left px-4 py-2 hover:bg-rose-900/50 text-rose-500 flex items-center gap-2">Löschen</button>
        </div>
      </div>
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
      <button data-action="copy" data-url="${cal.shareUrl}" class="rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-3 py-1.5 transition-colors">🔗 Link</button>
      <button data-action="duplicate" class="rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-3 py-1.5 transition-colors" title="Duplizieren">📑 Kopieren</button>
      <button data-action="collab" class="rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-sm font-medium px-3 py-1.5 transition-colors" title="Zusammen befüllen">+ Mitbearbeiter</button>
    </div>
  `;

  card.querySelector('[data-action="copy"]').addEventListener("click", async (e) => {
    await navigator.clipboard.writeText(cal.shareUrl);
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = "Kopiert!";
    setTimeout(() => (btn.textContent = original), 1500);
  });

  card.querySelector('[data-action="duplicate"]').addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try {
      await api.duplicateCalendar(cal.id);
      await loadCalendars();
    } catch (err) {
      alert("Fehler beim Duplizieren: " + err.message);
      e.currentTarget.disabled = false;
    }
  });

  card.querySelector('[data-action="collab"]').addEventListener("click", async () => {
    const email = prompt("E-Mail-Adresse des Mitbearbeiters:");
    if (!email) return;
    try {
      await api.addCollaborator(cal.id, email);
      alert(email + " wurde als Mitbearbeiter hinzugefügt!");
    } catch (err) {
      alert(err.message);
    }
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
      recipientEmail: fd.get("recipientEmail"),
      theme: fd.get("theme"),
      year: fd.get("year"),
      template: fd.get("template"),
      strictMode: document.getElementById("strictMode").checked,
      randomLayout: document.getElementById("randomLayout").checked,
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
