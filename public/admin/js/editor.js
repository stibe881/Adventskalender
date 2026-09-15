const params = new URLSearchParams(window.location.search);
const calendarId = params.get("id");

let calendar = null;
let currentDay = null;
let currentContent = {};

const doorGrid = document.getElementById("door-grid");
const modalBackdrop = document.getElementById("modal-backdrop");
const contentTypeSelect = document.getElementById("content-type-select");
const typeFields = document.getElementById("type-fields");
const themeSelect = document.getElementById("theme-select");

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function init() {
  if (!calendarId) {
    window.location.href = "/admin/dashboard.html";
    return;
  }
  try {
    await api.me();
  } catch (_) {
    window.location.href = "/admin/";
    return;
  }

  Object.entries(THEME_META).forEach(([key, meta]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = meta.label;
    themeSelect.appendChild(opt);
  });

  const typeListContainer = document.getElementById("type-list-container");
  
  // Add empty option
  const emptyBtn = document.createElement("button");
  emptyBtn.className = "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-white/10 hover:bg-slate-800 transition-colors bg-slate-900/50 text-slate-400";
  emptyBtn.innerHTML = `<span class="text-2xl">—</span><span class="text-xs font-semibold text-center leading-tight">leer / nicht befüllt</span>`;
  emptyBtn.addEventListener("click", (e) => selectType("", e));
  emptyBtn.addEventListener("mouseenter", () => previewType(""));
  emptyBtn.addEventListener("mouseleave", () => {
    if (previewTarget) previewType(previewTarget);
    else previewType(activeType);
  });
  typeListContainer.appendChild(emptyBtn);

  Object.entries(CONTENT_TYPE_META).forEach(([key, meta]) => {
    const btn = document.createElement("button");
    btn.className = "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-white/10 hover:bg-slate-800 transition-colors bg-slate-900/50";
    btn.innerHTML = `<span class="text-2xl">${meta.icon}</span><span class="text-xs font-semibold text-center leading-tight text-slate-300">${meta.label}</span>`;
    btn.addEventListener("click", (e) => selectType(key, e));
    btn.addEventListener("mouseenter", () => previewType(key));
    btn.addEventListener("mouseleave", () => {
      if (previewTarget) previewType(previewTarget);
      else previewType(activeType);
    });
    typeListContainer.appendChild(btn);
  });

  try {
    await loadCalendar();
  } catch(e) {
    alert("Editor Init Error: " + e.message);
  }
}

async function loadCalendar() {
  calendar = await api.getCalendar(calendarId);
  document.getElementById("cal-title").textContent = `Für ${calendar.recipientName}`;
  document.getElementById("cal-subtitle").textContent = `Dezember ${calendar.year} · ${THEME_META[calendar.theme]?.label || calendar.theme}`;

  const settingsForm = document.getElementById("settings-form");
  document.querySelector('input[name="recipientName"]').value = calendar.recipientName;
  document.querySelector('input[name="recipientEmail"]').value = calendar.recipientEmail || "";
  document.getElementById("theme-select").value = calendar.theme;
  document.querySelector('input[name="year"]').value = calendar.year;
  document.getElementById("strictMode").checked = calendar.strictMode;
  document.getElementById("randomLayout").checked = calendar.randomLayout;
  document.getElementById("syncOpen").checked = calendar.syncOpen || false;
  
  const metaCheckbox = document.getElementById("metaPuzzle");
  const metaConfig = document.getElementById("metaPuzzleConfig");
  metaCheckbox.checked = calendar.metaPuzzle || false;
  document.getElementById("metaPassword").value = calendar.metaPassword || "";
  metaConfig.classList.toggle("hidden", !metaCheckbox.checked);
  
  metaCheckbox.addEventListener("change", (e) => {
    metaConfig.classList.toggle("hidden", !e.target.checked);
  });
  
  if (calendar.customConfig && calendar.customConfig.customDomain) {
    document.getElementById("customDomain").value = calendar.customConfig.customDomain;
  }

  // Daily push reminder settings
  const cfg = calendar.customConfig || {};
  if (cfg.dailyReminderEnabled) {
    document.getElementById("dailyReminderEnabled").checked = true;
  }
  if (cfg.dailyReminderTime) {
    document.getElementById("dailyReminderTime").value = cfg.dailyReminderTime;
  }

  if (calendar.customConfig?.firmaColor) {
    document.getElementById("firma-color").value = calendar.customConfig.firmaColor;
  }

  document.getElementById("preview-link").href = `/c/preview/${calendarId}`;

  const firmaSettings = document.getElementById("firma-settings");
  firmaSettings.classList.toggle("hidden", calendar.theme !== "firma");

  // Keep reference to customConfig
  if (!calendar.customConfig) calendar.customConfig = {};

  renderDoorGrid();
}

function renderDoorGrid() {
  doorGrid.innerHTML = "";
  calendar.days.forEach((door) => {
    const meta = door.contentType ? CONTENT_TYPE_META[door.contentType] : null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `relative aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 transition-colors ${
      door.contentType
        ? "bg-emerald-900/30 border-emerald-700/60 hover:bg-emerald-900/50"
        : "bg-slate-900/60 border-white/10 hover:bg-slate-800"
    }`;
    btn.draggable = true;
    btn.dataset.day = door.day;
    btn.innerHTML = `
      <span class="text-lg">${meta ? meta.icon : "—"}</span>
      <span class="text-xs font-semibold">${door.day}</span>
      ${door.opened ? '<span class="absolute top-1 right-1 text-[10px]" title="Bereits geöffnet">✓</span>' : ""}
      ${door.openedAt ? `<span class="absolute bottom-1 right-1 text-[8px] text-slate-400" title="Geöffnet am">👁 ${new Date(door.openedAt).toLocaleDateString()}</span>` : ""}
    `;
    btn.addEventListener("click", () => openModal(door.day));
    
    // Drag & Drop
    btn.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", door.day);
      btn.classList.add("opacity-50");
    });
    btn.addEventListener("dragend", () => {
      btn.classList.remove("opacity-50");
    });
    btn.addEventListener("dragover", (e) => {
      e.preventDefault(); // allow drop
      btn.classList.add("ring-2", "ring-emerald-500");
    });
    btn.addEventListener("dragleave", () => {
      btn.classList.remove("ring-2", "ring-emerald-500");
    });
    btn.addEventListener("drop", async (e) => {
      e.preventDefault();
      btn.classList.remove("ring-2", "ring-emerald-500");
      const draggedDay = parseInt(e.dataTransfer.getData("text/plain"), 10);
      const targetDay = door.day;
      if (draggedDay && draggedDay !== targetDay) {
        try {
          await api.swapDays(calendarId, draggedDay, targetDay);
          await loadCalendar();
        } catch (err) {
          alert("Fehler beim Tauschen: " + err.message);
        }
      }
    });

    doorGrid.appendChild(btn);
  });
}

let activeType = "";
let previewTarget = "";

function applySelectedType(typeKey) {
  activeType = typeKey;
  const labelEl = document.getElementById("current-type-label");
  if (!typeKey || typeKey === "") {
    labelEl.innerHTML = `<span class="text-slate-400">– leer / nicht befüllt –</span>`;
  } else {
    const meta = CONTENT_TYPE_META[typeKey];
    labelEl.innerHTML = `<span class="text-xl">${meta.icon}</span> <span class="font-bold text-white">${meta.label}</span>`;
  }
}

function selectType(typeKey, e) {
  previewTarget = typeKey;
  document.getElementById("type-selector-confirm").classList.remove("hidden");
  
  // On mobile, show the slide-over preview pane
  const previewPane = document.getElementById("preview-pane");
  if (previewPane) previewPane.classList.remove("hidden");

  // Visual feedback in list
  document.querySelectorAll("#type-list-container button").forEach(b => b.classList.remove("ring-2", "ring-emerald-500", "bg-slate-800"));
  
  if (e && e.currentTarget) {
    e.currentTarget.classList.add("ring-2", "ring-emerald-500", "bg-slate-800");
  } else if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add("ring-2", "ring-emerald-500", "bg-slate-800");
  }
  
  previewType(typeKey);
}

function previewType(typeKey) {
  const container = document.getElementById("type-preview-container");
  if (!typeKey || typeKey === "") {
    container.innerHTML = `<div class="p-16 flex flex-col items-center justify-center text-slate-400"><div class="text-4xl mb-4">—</div><div>Kein Inhalt, dieses Türchen bleibt leer.</div></div>`;
    return;
  }
  
  // Render a visual representation
  container.innerHTML = generateVisualPreview(typeKey);
}

document.getElementById("open-type-selector-btn").addEventListener("click", () => {
  document.getElementById("type-selector-modal").classList.remove("hidden");
  document.getElementById("type-selector-confirm").classList.add("hidden");
  
  // Hide mobile preview pane initially
  const previewPane = document.getElementById("preview-pane");
  if (previewPane && window.innerWidth < 768) {
    previewPane.classList.add("hidden");
  }
  
  previewTarget = activeType;
  previewType(activeType);
});

document.getElementById("mobile-back-btn")?.addEventListener("click", () => {
  document.getElementById("preview-pane").classList.add("hidden");
});

document.getElementById("type-selector-close").addEventListener("click", () => {
  document.getElementById("type-selector-modal").classList.add("hidden");
});

document.getElementById("type-selector-confirm").addEventListener("click", () => {
  applySelectedType(previewTarget);
  renderTypeFields(previewTarget, currentContent);
  document.getElementById("type-selector-modal").classList.add("hidden");
  
  // Hide mobile preview pane for next time
  const previewPane = document.getElementById("preview-pane");
  if (previewPane && window.innerWidth < 768) {
    previewPane.classList.add("hidden");
  }
});

function generateVisualPreview(typeKey) {
  const meta = CONTENT_TYPE_META[typeKey];
  // A generic mock-up of how it looks in the app
  return `
    <div class="h-96 bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col">
      <div class="p-6 pb-2 text-center">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-2 shadow-inner text-2xl">
          ${meta.icon}
        </div>
        <h3 class="font-display font-bold text-xl text-slate-800">${meta.label}</h3>
        <p class="text-sm font-medium text-slate-600 mt-2 px-4 leading-snug">${meta.desc || ""}</p>
      </div>
      <div class="flex-1 overflow-hidden p-6 pt-2 flex items-center justify-center relative">
        <div class="absolute inset-0 pointer-events-none bg-gradient-to-t from-slate-200/50 to-transparent z-10"></div>
        ${getSpecificPreviewMockup(typeKey)}
      </div>
    </div>
  `;
}

function getSpecificPreviewMockup(type) {
  switch (type) {
    case "text":
      return `<div class="w-full bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-left space-y-2">
        <div class="w-3/4 h-4 bg-slate-200 rounded"></div>
        <div class="w-full h-4 bg-slate-200 rounded"></div>
        <div class="w-5/6 h-4 bg-slate-200 rounded"></div>
      </div>`;
    case "image":
    case "gallery":
      return `<div class="w-full aspect-video bg-slate-200 rounded-xl shadow-sm border border-slate-100 flex items-center justify-center">
        <span class="text-4xl">🖼️</span>
      </div>
      <div class="flex gap-2 mt-2 w-full justify-center">
        <div class="w-8 h-8 bg-slate-300 rounded-full"></div>
        <div class="w-8 h-8 bg-slate-200 rounded-full"></div>
        <div class="w-8 h-8 bg-slate-200 rounded-full"></div>
      </div>`;
    case "video":
      return `<div class="w-full aspect-video bg-slate-800 rounded-xl shadow-sm relative flex items-center justify-center overflow-hidden">
        <div class="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
          <div class="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1"></div>
        </div>
        <div class="absolute bottom-0 inset-x-0 h-1 bg-white/30"><div class="w-1/3 h-full bg-red-500"></div></div>
      </div>`;
    case "audio":
      return `<div class="w-full bg-slate-800 p-4 rounded-full shadow-lg flex items-center gap-4">
        <div class="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xl">▶</div>
        <div class="flex-1">
          <div class="w-2/3 h-3 bg-slate-600 rounded-full mb-2"></div>
          <div class="w-full h-1 bg-slate-600 rounded-full overflow-hidden"><div class="w-1/3 h-full bg-emerald-500"></div></div>
        </div>
      </div>`;
    case "quiz":
    case "choice":
      return `<div class="w-full space-y-2">
        <div class="w-full h-10 bg-indigo-100 rounded-xl border border-indigo-200 flex items-center px-4"><div class="w-1/2 h-3 bg-indigo-300 rounded"></div></div>
        <div class="w-full h-10 bg-indigo-100 rounded-xl border border-indigo-200 flex items-center px-4"><div class="w-2/3 h-3 bg-indigo-300 rounded"></div></div>
        <div class="w-full h-10 bg-emerald-100 rounded-xl border border-emerald-400 flex items-center px-4"><div class="w-1/3 h-3 bg-emerald-500 rounded"></div><span class="ml-auto text-emerald-600">✓</span></div>
        <div class="w-full h-10 bg-indigo-100 rounded-xl border border-indigo-200 flex items-center px-4"><div class="w-1/2 h-3 bg-indigo-300 rounded"></div></div>
      </div>`;
    case "scratchcard":
      return `<div class="w-full aspect-video bg-zinc-300 rounded-xl shadow-inner relative overflow-hidden flex items-center justify-center border-4 border-zinc-200">
        <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNjY2MiPjwvcmVjdD48cGF0aCBkPSJNMCAwTDggOFpNOCAwTDAgOFoiIHN0cm9rZT0iI2JiYiIgc3Ryb2tlLXdpZHRoPSIxIj48L3BhdGg+PC9zdmc+')] opacity-50"></div>
        <div class="w-16 h-16 bg-white/20 rounded-full blur-xl absolute left-4 top-4"></div>
        <span class="text-zinc-500 font-black text-2xl z-10 drop-shadow-sm transform -rotate-12">RUBBELN!</span>
      </div>`;
    case "memory":
      return `<div class="w-full grid grid-cols-4 gap-2">
        ${Array(8).fill(0).map((_, i) => `<div class="aspect-square rounded-lg ${i===2 || i===5 ? 'bg-emerald-400 border-2 border-emerald-500' : 'bg-indigo-500 border-b-4 border-indigo-700'} flex items-center justify-center text-white text-xl">${i===2||i===5 ? '🌟' : '?'}</div>`).join('')}
      </div>`;
    case "catcher":
      return `<div class="w-full h-40 bg-sky-100 rounded-xl shadow-inner relative overflow-hidden border border-sky-200">
        <div class="absolute top-4 left-1/4 text-2xl animate-bounce">🎁</div>
        <div class="absolute top-12 right-1/3 text-2xl animate-bounce" style="animation-delay: 0.2s">❄️</div>
        <div class="absolute bottom-2 left-1/3 w-16 h-8 bg-red-500 rounded-t-xl border-x-4 border-t-4 border-red-700 flex justify-center"><div class="w-12 h-2 bg-red-800 rounded-full mt-1"></div></div>
      </div>`;
    case "puzzle":
      return `<div class="w-full aspect-square bg-slate-200 rounded-xl shadow-inner grid grid-cols-3 gap-0.5 p-0.5">
        ${Array(9).fill(0).map((_, i) => `<div class="bg-indigo-400 rounded-sm ${i===8 ? 'opacity-0' : ''}"></div>`).join('')}
      </div>`;
    case "ar":
      return `<div class="w-full aspect-square bg-slate-800 rounded-xl relative overflow-hidden flex items-center justify-center">
        <div class="absolute inset-0 opacity-30 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTAgMEwyMCAyME0yMCAwTDAgMjAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIwLjUiPjwvcGF0aD48L3N2Zz4=')]"></div>
        <div class="w-24 h-24 border-2 border-emerald-500 rounded-lg absolute animate-pulse"></div>
        <div class="text-5xl drop-shadow-xl transform hover:scale-110 transition-transform">🦖</div>
        <div class="absolute bottom-2 text-[10px] text-white/50 bg-black/50 px-2 py-1 rounded-full">AR Ansicht</div>
      </div>`;
    case "product":
      return `<div class="w-full bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden flex flex-col">
        <div class="h-24 bg-slate-200 flex items-center justify-center text-3xl">👟</div>
        <div class="p-3 text-left">
          <div class="w-3/4 h-3 bg-slate-800 rounded mb-2"></div>
          <div class="flex items-end gap-2"><div class="w-1/3 h-4 bg-emerald-600 rounded"></div><div class="w-1/4 h-3 bg-slate-400 rounded line-through"></div></div>
          <div class="mt-3 w-full h-8 bg-indigo-600 rounded-lg"></div>
        </div>
      </div>`;
    case "countdown":
      return `<div class="w-full bg-slate-900 rounded-xl p-4 text-white flex flex-col items-center justify-center space-y-3">
        <div class="w-2/3 h-4 bg-slate-700 rounded-full"></div>
        <div class="flex gap-2">
          <div class="w-12 h-14 bg-slate-800 rounded-lg border border-slate-700 flex flex-col items-center justify-center"><span class="text-lg font-black">12</span><span class="text-[8px] text-slate-400">TAGE</span></div>
          <div class="w-12 h-14 bg-slate-800 rounded-lg border border-slate-700 flex flex-col items-center justify-center"><span class="text-lg font-black">04</span><span class="text-[8px] text-slate-400">STD</span></div>
          <div class="w-12 h-14 bg-slate-800 rounded-lg border border-slate-700 flex flex-col items-center justify-center"><span class="text-lg font-black">59</span><span class="text-[8px] text-slate-400">MIN</span></div>
        </div>
      </div>`;
    case "spotify-collab":
      return `<div class="w-full bg-zinc-900 rounded-xl p-4 flex flex-col gap-3 border border-zinc-800">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-black text-xl">♫</div>
          <div class="flex-1 space-y-2"><div class="w-3/4 h-3 bg-zinc-100 rounded-full"></div><div class="w-1/2 h-2 bg-zinc-400 rounded-full"></div></div>
        </div>
        <div class="w-full h-8 bg-zinc-800 rounded-full flex items-center px-3"><div class="w-4 h-4 rounded-full bg-zinc-500 mr-2"></div><div class="w-1/3 h-2 bg-zinc-600 rounded"></div></div>
      </div>`;
    case "voucher":
      return `<div class="w-full bg-gradient-to-r from-amber-200 to-yellow-400 p-6 rounded-xl shadow-lg border-2 border-dashed border-amber-600 text-center relative overflow-hidden">
        <div class="absolute -left-3 -top-3 w-8 h-8 bg-white rounded-full"></div>
        <div class="absolute -right-3 -top-3 w-8 h-8 bg-white rounded-full"></div>
        <div class="text-amber-800 font-black text-2xl uppercase tracking-widest border-y-2 border-amber-600 py-2">GUTSCHEIN</div>
        <div class="mt-4 text-4xl">🎫</div>
      </div>`;
    case "qrcode":
      return `<div class="w-full aspect-square max-w-[200px] bg-white p-4 rounded-xl shadow-md flex items-center justify-center border-4 border-slate-900 mx-auto">
        <div class="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTAgMGg4djhIMHptMTIgMGg4djhIMTJ6TTAgMTJoOHY4SDB6IiBmaWxsPSIjMGYxNzJhIi8+PC9zdmc+')] opacity-80"></div>
      </div>`;
    case "challenge":
      return `<div class="w-full bg-rose-100 p-6 rounded-xl border border-rose-300 text-center">
        <div class="text-4xl mb-3">🎯</div>
        <div class="w-5/6 h-5 bg-rose-200 rounded mx-auto mb-4"></div>
        <div class="w-full h-10 bg-rose-500 rounded-lg shadow-md flex items-center justify-center text-white font-bold">Aufgabe erledigt!</div>
      </div>`;
    case "location":
      return `<div class="w-full aspect-video bg-emerald-100 rounded-xl relative overflow-hidden border border-emerald-300 flex items-center justify-center">
        <div class="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTAgMEwyMCAyME0yMCAwTDAgMjAiIHN0cm9rZT0iIzA1OTY2OSIgc3Ryb2tlLXdpZHRoPSIwLjUiPjwvcGF0aD48L3N2Zz4=')]"></div>
        <div class="w-32 h-32 border-4 border-emerald-500 rounded-full absolute animate-ping opacity-30"></div>
        <div class="text-5xl drop-shadow-xl z-10 text-emerald-600">📍</div>
      </div>`;
    case "giveaway":
      return `<div class="w-full bg-indigo-600 p-6 rounded-xl text-center text-white relative overflow-hidden shadow-lg border-2 border-indigo-400">
        <div class="absolute -top-10 -right-10 text-8xl opacity-10">🍀</div>
        <h3 class="font-black text-2xl mb-2 text-indigo-100 uppercase italic">GEWINNSPIEL</h3>
        <div class="w-full h-10 bg-white/20 rounded-lg mb-2 flex items-center px-3"><div class="w-1/2 h-3 bg-white/40 rounded"></div></div>
        <div class="w-full h-10 bg-white rounded-lg text-indigo-800 font-bold flex items-center justify-center">Jetzt teilnehmen</div>
      </div>`;
    case "coins":
      return `<div class="w-full h-32 bg-yellow-100 rounded-xl border border-yellow-300 flex flex-col items-center justify-center relative shadow-inner">
        <div class="absolute top-2 right-2 text-xl animate-bounce" style="animation-delay: 0.1s">🪙</div>
        <div class="absolute bottom-4 left-4 text-2xl animate-bounce" style="animation-delay: 0.3s">🪙</div>
        <div class="text-5xl drop-shadow-lg z-10">💰</div>
        <div class="font-black text-yellow-700 text-lg mt-2">+50 Münzen</div>
      </div>`;
    case "diary":
      return `<div class="w-full bg-amber-50 p-6 rounded-xl shadow-md border-l-8 border-amber-700 flex flex-col">
        <div class="w-2/3 h-5 bg-amber-200 rounded mb-4"></div>
        <div class="flex-1 border-2 border-dashed border-amber-300 rounded-lg bg-white/50 p-3">
          <div class="w-full h-2 bg-amber-100 rounded mb-2"></div>
          <div class="w-full h-2 bg-amber-100 rounded mb-2"></div>
          <div class="w-3/4 h-2 bg-amber-100 rounded"></div>
        </div>
      </div>`;
    case "duel":
      return `<div class="w-full bg-slate-900 rounded-xl p-4 flex items-center justify-between shadow-xl border border-red-900">
        <div class="flex flex-col items-center gap-2">
          <div class="w-12 h-12 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div>
          <div class="w-16 h-2 bg-blue-900 rounded-full"><div class="w-full h-full bg-blue-400 rounded-full"></div></div>
        </div>
        <div class="text-3xl font-black text-red-500 italic px-2">VS</div>
        <div class="flex flex-col items-center gap-2">
          <div class="w-12 h-12 bg-rose-500 rounded-full border-2 border-white shadow-lg"></div>
          <div class="w-16 h-2 bg-rose-900 rounded-full"><div class="w-1/2 h-full bg-rose-400 rounded-full"></div></div>
        </div>
      </div>`;
    case "timecapsule":
      return `<div class="w-full h-40 bg-purple-900 rounded-xl border border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)] flex flex-col items-center justify-center relative overflow-hidden">
        <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-600/30 to-transparent opacity-50 animate-pulse"></div>
        <div class="text-5xl z-10 drop-shadow-xl mb-2">⏳</div>
        <div class="w-3/4 h-8 bg-black/40 backdrop-blur rounded-lg border border-purple-500/50 flex items-center justify-center text-purple-200 font-mono text-sm font-bold">Öffnet in 365 Tagen</div>
      </div>`;
    case "printplay":
      return `<div class="w-full aspect-[3/4] max-h-[250px] bg-white mx-auto rounded shadow-lg border border-slate-200 flex flex-col p-4">
        <div class="w-full h-1/2 border-2 border-dashed border-slate-300 rounded flex items-center justify-center mb-3">✂️</div>
        <div class="w-full h-3 bg-slate-200 rounded mb-2"></div>
        <div class="w-3/4 h-3 bg-slate-200 rounded mb-4"></div>
        <div class="w-full h-8 bg-slate-800 rounded mt-auto text-white flex items-center justify-center text-xs font-bold">PDF HERUNTERLADEN</div>
      </div>`;
    case "iot-box":
      return `<div class="w-full bg-slate-800 rounded-xl p-6 shadow-inner border border-slate-700 text-center relative">
        <div class="absolute top-4 right-4 w-3 h-3 bg-blue-500 rounded-full animate-ping"></div>
        <div class="text-6xl mb-4 drop-shadow-lg">🧰</div>
        <div class="w-full h-10 bg-blue-600 rounded-lg text-white font-bold flex items-center justify-center gap-2"><span>Bluetooth verbinden</span></div>
      </div>`;
    default:
      return `<div class="w-full h-8 bg-slate-200 rounded-lg animate-pulse mb-3"></div>
        <div class="w-3/4 h-8 bg-slate-200 rounded-lg animate-pulse mb-6"></div>
        <div class="w-full h-12 bg-emerald-500 rounded-xl shadow-lg opacity-80"></div>`;
  }
}

function openModal(day) {
  currentDay = day;
  const door = calendar.days.find((d) => d.day === day);
  currentContent = JSON.parse(JSON.stringify(door.content || {}));
  document.getElementById("modal-day").textContent = day;
  
  applySelectedType(door.contentType || "");
  renderTypeFields(door.contentType, currentContent);
  
  document.getElementById("f-lockPassword").value = currentContent.lockPassword || "";
  document.getElementById("f-lockHint").value = currentContent.lockHint || "";
  document.getElementById("f-sensorLock").value = currentContent.sensorLock || "";
  document.getElementById("f-geoLat").value = currentContent.geoLat || "";
  document.getElementById("f-geoLon").value = currentContent.geoLon || "";
  document.getElementById("geoAR-inputs").classList.toggle("hidden", currentContent.sensorLock !== "geoAR");
  
  document.getElementById("f-reqChoiceDay").value = currentContent.reqChoiceDay || "";
  document.getElementById("f-reqChoiceOpt").value = currentContent.reqChoiceOpt || "";
  
  // Feedback
  const section = document.getElementById("feedback-section");
  if (door.feedback && (door.feedback.reactions?.length || door.feedback.replies?.length)) {
    section.classList.remove("hidden");
    document.getElementById("feedback-reactions").innerHTML = door.feedback.reactions?.map(e => `<span>${escapeHtml(e)}</span>`).join("") || "–";
    document.getElementById("feedback-replies").innerHTML = door.feedback.replies?.map(r => {
      if (r.type === "audio") return `<audio controls src="${escapeHtml(r.url)}" class="w-full h-8 mt-1"></audio>`;
      return `<p class="text-sm text-slate-300">Unbekanntes Feedback</p>`;
    }).join("") || "Keine Antworten.";
  } else {
    section.classList.add("hidden");
  }

  modalBackdrop.classList.remove("hidden");
}

function closeModal() {
  modalBackdrop.classList.add("hidden");
  currentDay = null;
}

// No longer needed, handled by custom modal confirm

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

themeSelect.addEventListener("change", (e) => {
  document.getElementById("firma-settings").classList.toggle("hidden", e.target.value !== "firma");
});

document.getElementById("firma-bg").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const { url } = await api.upload(file);
    if (!calendar.customConfig) calendar.customConfig = {};
    calendar.customConfig.bgUrl = url;
  } catch (err) {
    alert("Fehler beim Upload: " + err.message);
  }
});

document.getElementById("firma-logo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const { url } = await api.upload(file);
    if (!calendar.customConfig) calendar.customConfig = {};
    calendar.customConfig.logoUrl = url;
  } catch (err) {
    alert("Fehler beim Upload: " + err.message);
  }
});

function fieldWrap(labelText, inputHtml) {
  return `<div><label class="block text-sm text-slate-300 mb-1">${labelText}</label>${inputHtml}</div>`;
}

const inputClass =
  "w-full rounded-lg bg-slate-800 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

function renderTypeFields(type, content) {
  typeFields.innerHTML = "";
  if (!type) return;

  const renderers = {
    text: renderTextFields,
    voucher: renderVoucherFields,
    qrcode: renderQrFields,
    video: renderVideoFields,
    audio: renderAudioFields,
    gallery: renderGalleryFields,
    scratchcard: renderScratchcardFields,
    quiz: renderQuizFields,
    countdown: renderCountdownFields,
    memory: renderMemoryFields,
    challenge: renderChallengeFields,
    location: renderLocationFields,
    puzzle: renderPuzzleFields,
    giveaway: renderGiveawayFields,
    ar: renderArFields,
    catcher: renderCatcherFields,
    product: renderProductFields,
    choice: renderChoiceFields,
    coins: renderCoinsFields,
    diary: renderDiaryFields,
    duel: renderDuelFields,
    timecapsule: renderTimeCapsuleFields,
    printplay: renderPrintPlayFields,
    "spotify-collab": renderSpotifyCollabFields,
    "iot-box": renderIotBoxFields,
  };
  (renderers[type] || (() => {}))(content);
}

function renderSpotifyCollabFields(c) {
  typeFields.innerHTML = `<p class="text-sm text-slate-300">Der Nutzer kann hier einen Song suchen und der Familien-Playlist hinzufügen.</p>`;
}

function renderIotBoxFields(c) {
  typeFields.innerHTML = `<p class="text-sm text-slate-300">Dieser Inhalt verbindet sich über Web-Bluetooth mit einer physischen Schatztruhe.</p>`;
}

function renderCoinsFields(c) {
  typeFields.innerHTML = fieldWrap("Münz-Anzahl", `<input type="number" id="f-coinAmount" value="${c.coinAmount || 50}" class="${inputClass}" />`);
}

function renderDiaryFields(c) {
  typeFields.innerHTML = fieldWrap("Tagebuch-Frage", `<textarea id="f-diaryQuestion" rows="3" class="${inputClass}">${escapeHtml(c.diaryQuestion || '')}</textarea>`);
}

function renderDuelFields(c) {
  typeFields.innerHTML = `<p class="text-sm text-slate-300">Für dieses Minispiel sind keine weiteren Einstellungen nötig. Das Türchen erfordert einen zweiten Live-Spieler.</p>`;
}

function renderTimeCapsuleFields(c) {
  typeFields.innerHTML = `<p class="text-sm text-slate-300">Der Nutzer kann hier eine Nachricht für nächstes Jahr hinterlassen.</p>`;
}

function renderPrintPlayFields(c) {
  typeFields.innerHTML =
    fieldWrap("Titel des Spielteils", `<input id="f-ppTitle" value="${escapeHtml(c.ppTitle || '')}" class="${inputClass}" />`) +
    fieldWrap("Bild-URL (Das PDF/Spielfeld)", `<input id="f-ppImage" value="${escapeHtml(c.ppImage || '')}" class="${inputClass}" />`);
}

function renderChoiceFields(c) {
  typeFields.innerHTML =
    fieldWrap("Frage / Situation", `<textarea id="f-question" rows="2" class="${inputClass}">${escapeHtml(c.question || '')}</textarea>`) +
    fieldWrap("Option A Text", `<input id="f-optionA" value="${escapeHtml(c.optionA || '')}" class="${inputClass}" />`) +
    fieldWrap("Option B Text", `<input id="f-optionB" value="${escapeHtml(c.optionB || '')}" class="${inputClass}" />`);
}

function renderProductFields(c) {
  typeFields.innerHTML =
    fieldWrap("Produkt-Name", `<input id="f-title" value="${escapeHtml(c.title || '')}" class="${inputClass}" />`) +
    fieldWrap("Bild-URL", `<input id="f-image" value="${escapeHtml(c.image || '')}" class="${inputClass}" placeholder="https://..." />`) +
    fieldWrap("Streichpreis (z.B. 49,99 €)", `<input id="f-oldPrice" value="${escapeHtml(c.oldPrice || '')}" class="${inputClass}" />`) +
    fieldWrap("Aktionspreis (z.B. 29,99 €)", `<input id="f-newPrice" value="${escapeHtml(c.newPrice || '')}" class="${inputClass}" />`) +
    fieldWrap("Rabattcode (optional)", `<input id="f-discount" value="${escapeHtml(c.discount || '')}" placeholder="XMAS20" class="${inputClass}" />`) +
    fieldWrap("Kaufen-Button Link", `<input id="f-url" value="${escapeHtml(c.url || '')}" placeholder="https://..." class="${inputClass}" />`);
}

function renderArFields(c) {
  typeFields.innerHTML =
    fieldWrap("Titel", `<input id="f-title" value="${escapeHtml(c.title || 'Schau dir das an!')}" class="${inputClass}" />`) +
    fieldWrap("3D Modell (.glb) URL", `<input id="f-modelUrl" value="${escapeHtml(c.modelUrl || 'https://modelviewer.dev/shared-assets/models/Astronaut.glb')}" class="${inputClass}" placeholder="URL zur GLB-Datei" />`);
}

function renderCatcherFields(c) {
  typeFields.innerHTML =
    fieldWrap("Titel", `<input id="f-title" value="${escapeHtml(c.title || 'Fang die Geschenke!')}" class="${inputClass}" />`) +
    fieldWrap("Ziel-Punkte", `<input id="f-targetScore" type="number" value="${c.targetScore || 20}" class="${inputClass}" />`);
}

function renderLocationFields(c) {
  typeFields.innerHTML =
    fieldWrap("Hinweis-Nachricht (z. B. Geh zum großen Baum im Park)", `<textarea id="f-hint" rows="3" class="${inputClass}">${escapeHtml(c.hint)}</textarea>`) +
    fieldWrap("Breitengrad (Latitude)", `<input id="f-lat" type="number" step="any" value="${escapeHtml(c.lat)}" class="${inputClass}" placeholder="z. B. 52.5200" />`) +
    fieldWrap("Längengrad (Longitude)", `<input id="f-lng" type="number" step="any" value="${escapeHtml(c.lng)}" class="${inputClass}" placeholder="z. B. 13.4050" />`) +
    fieldWrap("Erfolgsnachricht (wenn gefunden)", `<textarea id="f-successMessage" rows="2" class="${inputClass}">${escapeHtml(c.successMessage)}</textarea>`);
}

// ---------- Per-type field renderers ----------

function renderTextFields(c) {
  typeFields.innerHTML =
    fieldWrap("Nachricht", `<textarea id="f-message" rows="4" class="${inputClass}">${escapeHtml(c.message)}</textarea>`) +
    fieldWrap("Von (optional)", `<input id="f-sender" value="${escapeHtml(c.sender)}" class="${inputClass}" />`);
}

function renderVoucherFields(c) {
  typeFields.innerHTML =
    fieldWrap("Titel", `<input id="f-title" value="${escapeHtml(c.title)}" class="${inputClass}" />`) +
    fieldWrap("Gutscheincode", `<input id="f-code" value="${escapeHtml(c.code)}" class="${inputClass}" />`) +
    fieldWrap("Beschreibung", `<textarea id="f-description" rows="3" class="${inputClass}">${escapeHtml(c.description)}</textarea>`);
}

function renderQrFields(c) {
  typeFields.innerHTML =
    fieldWrap("Beschriftung", `<input id="f-label" value="${escapeHtml(c.label)}" class="${inputClass}" />`) +
    fieldWrap(
      "Inhalt (URL oder Text) – wird automatisch als QR-Code generiert",
      `<input id="f-data" value="${escapeHtml(c.data)}" class="${inputClass}" />`
    ) +
    (c.qrImage ? `<img src="${c.qrImage}" class="w-32 h-32 rounded-lg border border-white/10 mt-2" alt="QR-Vorschau" />` : "");
}

function renderPuzzleFields(c) {
  typeFields.innerHTML =
    fieldWrap("Erfolgsnachricht", `<textarea id="f-successMessage" rows="2" class="${inputClass}">${escapeHtml(c.successMessage)}</textarea>`) +
    fieldWrap("Bild hochladen", `<input id="f-image" type="file" accept="image/*" class="${inputClass}" />`) +
    `<div id="f-puzzle-preview" class="mt-2 text-sm text-slate-400">${c.imageUrl ? 'Aktuell: Bild vorhanden' : ''}</div>`;
    
  document.getElementById("f-image").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { url } = await api.upload(file);
      currentContent.imageUrl = url;
      document.getElementById("f-puzzle-preview").textContent = "Neues Bild hochgeladen.";
    } catch (err) {
      alert("Upload fehlgeschlagen: " + err.message);
    }
  });
}

function renderGiveawayFields(c) {
  typeFields.innerHTML =
    fieldWrap("Titel des Gewinnspiels", `<input id="f-title" value="${escapeHtml(c.title)}" class="${inputClass}" />`) +
    fieldWrap("Beschreibung & Preis", `<textarea id="f-description" rows="3" class="${inputClass}">${escapeHtml(c.description)}</textarea>`) +
    fieldWrap("Erfolgsnachricht (nach Teilnahme)", `<textarea id="f-successMessage" rows="2" class="${inputClass}">${escapeHtml(c.successMessage)}</textarea>`);
}

function renderVideoFields(c) {
  const mode = c.mode || "youtube";
  typeFields.innerHTML = `
    ${fieldWrap(
      "Quelle",
      `<select id="f-vmode" class="${inputClass}">
        <option value="youtube" ${mode === "youtube" ? "selected" : ""}>YouTube / Vimeo</option>
        <option value="record" ${mode === "record" ? "selected" : ""}>Webcam-Aufnahme</option>
      </select>`
    )}
    ${fieldWrap("Beschriftung", `<input id="f-caption" value="${escapeHtml(c.caption)}" class="${inputClass}" />`)}
    <div id="f-vmode-youtube" class="${mode === "youtube" ? "" : "hidden"}">
      ${fieldWrap("Video-URL", `<input id="f-url" value="${escapeHtml(c.url)}" class="${inputClass}" placeholder="https://youtube.com/watch?v=..." />`)}
    </div>
    <div id="f-vmode-record" class="${mode === "record" ? "" : "hidden"}">
      <div class="mt-2 flex items-center gap-3">
        <button id="f-vrecord-btn" type="button" class="rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold px-4 py-2 transition-colors">Video aufnehmen</button>
        <div id="f-vrecord-status" class="text-xs text-slate-400">${c.url && mode === "record" ? "Video gespeichert." : ""}</div>
      </div>
      <video id="f-vpreview" class="w-full mt-2 rounded-lg hidden" autoplay muted playsinline></video>
    </div>
  `;

  document.getElementById("f-vmode").addEventListener("change", (e) => {
    const m = e.target.value;
    document.getElementById("f-vmode-youtube").classList.toggle("hidden", m !== "youtube");
    document.getElementById("f-vmode-record").classList.toggle("hidden", m !== "record");
  });

  // Recording logic for video
  let mediaRecorder;
  let videoChunks = [];
  const recBtn = document.getElementById("f-vrecord-btn");
  const recStatus = document.getElementById("f-vrecord-status");
  const preview = document.getElementById("f-vpreview");

  recBtn?.addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      recBtn.textContent = "Aufnahme starten";
      recBtn.classList.replace("bg-emerald-600", "bg-rose-600");
      recBtn.classList.replace("hover:bg-emerald-500", "hover:bg-rose-500");
      recStatus.textContent = "Verarbeite & lade hoch...";
      preview.srcObject = null;
      preview.classList.add("hidden");
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        preview.srcObject = stream;
        preview.classList.remove("hidden");
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        videoChunks = [];
        mediaRecorder.ondataavailable = e => videoChunks.push(e.data);
        mediaRecorder.onstop = async () => {
          const blob = new Blob(videoChunks, { type: "video/webm" });
          const file = new File([blob], "video-greeting.webm", { type: "video/webm" });
          try {
            const { url } = await api.upload(file);
            currentContent.url = url;
            recStatus.textContent = "Video gespeichert!";
          } catch (err) {
            recStatus.textContent = "Fehler: " + err.message;
          }
          stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        recBtn.textContent = "Aufnahme stoppen ⏹";
        recBtn.classList.replace("bg-rose-600", "bg-emerald-600");
        recBtn.classList.replace("hover:bg-rose-500", "hover:bg-emerald-500");
        recStatus.textContent = "Nimmt auf... 🔴";
      } catch (err) {
        alert("Kamera konnte nicht gestartet werden: " + err.message);
      }
    }
  });
}

function renderAudioFields(c) {
  const mode = c.mode || "spotify";
  typeFields.innerHTML = `
    ${fieldWrap(
      "Quelle",
      `<select id="f-mode" class="${inputClass}">
        <option value="spotify" ${mode === "spotify" ? "selected" : ""}>Spotify-Link</option>
        <option value="upload" ${mode === "upload" ? "selected" : ""}>MP3-Upload</option>
        <option value="record" ${mode === "record" ? "selected" : ""}>Mikrofon-Aufnahme</option>
      </select>`
    )}
    ${fieldWrap("Titel", `<input id="f-title" value="${escapeHtml(c.title)}" class="${inputClass}" />`)}
    <div id="f-mode-spotify" class="${mode === "spotify" ? "" : "hidden"}">
      ${fieldWrap("Spotify-Link", `<input id="f-spotifyUrl" value="${escapeHtml(c.spotifyUrl)}" class="${inputClass}" placeholder="https://open.spotify.com/track/..." />`)}
    </div>
    <div id="f-mode-upload" class="${mode === "upload" ? "" : "hidden"}">
      ${fieldWrap("MP3-Datei hochladen", `<input id="f-file" type="file" accept="audio/*" class="${inputClass}" />`)}
      <div id="f-file-status" class="text-xs text-slate-400 mt-1">${c.fileUrl ? `Aktuell: ${escapeHtml(c.fileUrl.split("/").pop())}` : "Noch keine Datei hochgeladen."}</div>
    </div>
    <div id="f-mode-record" class="${mode === "record" ? "" : "hidden"}">
      <div class="mt-2 flex items-center gap-3">
        <button id="f-record-btn" type="button" class="rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold px-4 py-2 transition-colors">Aufnahme starten</button>
        <div id="f-record-status" class="text-xs text-slate-400">${c.fileUrl && mode === "record" ? "Gespeichert." : ""}</div>
      </div>
    </div>
  `;

  document.getElementById("f-mode").addEventListener("change", (e) => {
    const m = e.target.value;
    document.getElementById("f-mode-spotify").classList.toggle("hidden", m !== "spotify");
    document.getElementById("f-mode-upload").classList.toggle("hidden", m !== "upload");
    document.getElementById("f-mode-record").classList.toggle("hidden", m !== "record");
  });

  document.getElementById("f-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById("f-file-status");
    statusEl.textContent = "Lädt hoch…";
    try {
      const { url } = await api.upload(file);
      currentContent.fileUrl = url;
      statusEl.textContent = `Hochgeladen: ${file.name}`;
    } catch (err) {
      statusEl.textContent = `Fehler: ${err.message}`;
    }
  });

  // Recording logic
  let mediaRecorder;
  let audioChunks = [];
  const recBtn = document.getElementById("f-record-btn");
  const recStatus = document.getElementById("f-record-status");

  recBtn.addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      recBtn.textContent = "Aufnahme starten";
      recBtn.classList.replace("bg-emerald-600", "bg-rose-600");
      recBtn.classList.replace("hover:bg-emerald-500", "hover:bg-rose-500");
      recStatus.textContent = "Verarbeite & lade hoch...";
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
          const blob = new Blob(audioChunks, { type: "audio/webm" });
          const file = new File([blob], "voice-note.webm", { type: "audio/webm" });
          try {
            const { url } = await api.upload(file);
            currentContent.fileUrl = url;
            recStatus.textContent = "Audio gespeichert!";
          } catch (err) {
            recStatus.textContent = "Fehler: " + err.message;
          }
          // Stop tracks
          stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        recBtn.textContent = "Aufnahme stoppen ⏹";
        recBtn.classList.replace("bg-rose-600", "bg-emerald-600");
        recBtn.classList.replace("hover:bg-rose-500", "hover:bg-emerald-500");
        recStatus.textContent = "Nimmt auf... 🔴";
      } catch (err) {
        alert("Mikrofon konnte nicht gestartet werden: " + err.message);
      }
    }
  });
}

function renderGalleryFields(c) {
  currentContent.images = c.images || [];
  typeFields.innerHTML =
    fieldWrap("Beschriftung", `<input id="f-caption" value="${escapeHtml(c.caption)}" class="${inputClass}" />`) +
    fieldWrap("Bilder hochladen (Mehrfachauswahl möglich)", `<input id="f-images" type="file" accept="image/*" multiple class="${inputClass}" />`) +
    `<div id="f-gallery-preview" class="flex flex-wrap gap-2 mt-2"></div>`;

  renderGalleryPreview();

  document.getElementById("f-images").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const { url } = await api.upload(file);
        currentContent.images.push(url);
        renderGalleryPreview();
      } catch (err) {
        alert(`Upload fehlgeschlagen (${file.name}): ${err.message}`);
      }
    }
    e.target.value = "";
  });
}

function renderGalleryPreview() {
  const preview = document.getElementById("f-gallery-preview");
  if (!preview) return;
  preview.innerHTML = "";
  currentContent.images.forEach((url, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "relative";
    wrap.innerHTML = `
      <img src="${url}" class="w-16 h-16 object-cover rounded-lg border border-white/10" />
      <button type="button" class="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full w-5 h-5 text-xs leading-none">✕</button>
    `;
    wrap.querySelector("button").addEventListener("click", () => {
      currentContent.images.splice(idx, 1);
      renderGalleryPreview();
    });
    preview.appendChild(wrap);
  });
}

function renderScratchcardFields(c) {
  typeFields.innerHTML =
    fieldWrap("Versteckte Botschaft (wird freigerubbelt)", `<textarea id="f-message" rows="3" class="${inputClass}">${escapeHtml(c.message)}</textarea>`) +
    fieldWrap(
      "Rubbel-Hinweistext",
      `<input id="f-revealLabel" value="${escapeHtml(c.revealLabel || "Hier rubbeln!")}" class="${inputClass}" />`
    );
}

function renderQuizFields(c) {
  const opts = c.options || [];
  typeFields.innerHTML =
    fieldWrap("Frage", `<input id="f-question" value="${escapeHtml(c.question)}" class="${inputClass}" />`) +
    fieldWrap("Antwort A", `<input id="f-option1" value="${escapeHtml(opts[0])}" class="${inputClass}" />`) +
    fieldWrap("Antwort B", `<input id="f-option2" value="${escapeHtml(opts[1])}" class="${inputClass}" />`) +
    fieldWrap("Antwort C (optional)", `<input id="f-option3" value="${escapeHtml(opts[2])}" class="${inputClass}" />`) +
    fieldWrap("Antwort D (optional)", `<input id="f-option4" value="${escapeHtml(opts[3])}" class="${inputClass}" />`) +
    fieldWrap(
      "Richtige Antwort",
      `<select id="f-correctIndex" class="${inputClass}">
        ${["A", "B", "C", "D"].map((l, i) => `<option value="${i + 1}" ${c.correctIndex === i ? "selected" : ""}>${l}</option>`).join("")}
      </select>`
    ) +
    fieldWrap("Nachricht bei richtiger Antwort", `<textarea id="f-successMessage" rows="2" class="${inputClass}">${escapeHtml(c.successMessage)}</textarea>`) +
    fieldWrap("Nachricht bei falscher Antwort", `<textarea id="f-failMessage" rows="2" class="${inputClass}">${escapeHtml(c.failMessage)}</textarea>`) +
    `<div class="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
      <p class="text-sm font-semibold text-amber-300">🏆 Preis für die richtige Antwort (optional)</p>
      ${fieldWrap('Preis-Beschreibung (z. B. "Ein Glas selbstgemachte Marmelade!")', `<input id="f-prizeText" value="${escapeHtml(c.prizeText)}" class="${inputClass}" placeholder="Leer lassen = kein Preis anzeigen" />`)}
      ${fieldWrap("Bonus-Münzen bei richtiger Antwort (0 = keine)", `<input id="f-prizeCoins" type="number" min="0" max="1000" value="${c.prizeCoins ?? 0}" class="${inputClass}" />`)}
    </div>`;
}

function renderCountdownFields(c) {
  typeFields.innerHTML =
    fieldWrap("Event-Titel", `<input id="f-eventTitle" value="${escapeHtml(c.eventTitle)}" class="${inputClass}" />`) +
    fieldWrap("Datum", `<input id="f-eventDate" type="date" value="${escapeHtml(c.eventDate)}" class="${inputClass}" />`) +
    fieldWrap("Beschreibung", `<textarea id="f-description" rows="3" class="${inputClass}">${escapeHtml(c.description)}</textarea>`);
}

function renderMemoryFields(c) {
  currentContent.images = c.images || [];
  typeFields.innerHTML =
    fieldWrap("Gratulationstext (wenn gelöst)", `<textarea id="f-successMessage" rows="2" class="${inputClass}">${escapeHtml(c.successMessage)}</textarea>`) +
    fieldWrap("Bilder hochladen (Lade 4 bis 8 Bilder hoch. Sie werden automatisch als Paare verwendet.)", `<input id="f-images" type="file" accept="image/*" multiple class="${inputClass}" />`) +
    `<div id="f-gallery-preview" class="flex flex-wrap gap-2 mt-2"></div>`;

  renderGalleryPreview(); // Reusing the same preview logic as gallery

  document.getElementById("f-images").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const { url } = await api.upload(file);
        currentContent.images.push(url);
        renderGalleryPreview();
      } catch (err) {
        alert(`Upload fehlgeschlagen (${file.name}): ${err.message}`);
      }
    }
    e.target.value = "";
  });
}

function renderChallengeFields(c) {
  typeFields.innerHTML =
    fieldWrap("Tages-Aufgabe", `<textarea id="f-task" rows="3" class="${inputClass}" placeholder="z. B. Umarme heute jemanden für 10 Sekunden.">${escapeHtml(c.task)}</textarea>`) +
    fieldWrap("Button-Text", `<input id="f-btnText" value="${escapeHtml(c.btnText || "Erledigt!")}" class="${inputClass}" />`) +
    fieldWrap("Erfolgsnachricht", `<textarea id="f-successMessage" rows="2" class="${inputClass}">${escapeHtml(c.successMessage)}</textarea>`);
}

document.getElementById("f-sensorLock").addEventListener("change", (e) => {
  document.getElementById("geoAR-inputs").classList.toggle("hidden", e.target.value !== "geoAR");
});

window.sendPushBroadcast = async function() {
  const msg = document.getElementById("push-msg").value.trim();
  if (!msg) return alert("Bitte Nachricht eingeben!");
  try {
    const res = await fetch(`/api/admin/calendars/${calendarId}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg })
    });
    if (!res.ok) throw new Error("Fehler beim Senden");
    alert("Benachrichtigung wurde gesendet!");
    document.getElementById("push-msg").value = "";
  } catch (err) {
    alert("Fehler: " + err.message);
  }
};

// ---------- Collecting data per type on save ----------

function collectFieldsData(type) {
  switch (type) {
    case "text":
      return { message: val("f-message"), sender: val("f-sender") };
    case "voucher":
      return { title: val("f-title"), code: val("f-code"), description: val("f-description") };
    case "qrcode":
      return { label: val("f-label"), data: val("f-data") };
    case "video": {
      const mode = val("f-vmode") || "youtube";
      return { mode, url: mode === "youtube" ? val("f-url") : (currentContent.url || null), caption: val("f-caption") };
    }
    case "audio": {
      const mode = val("f-mode");
      return {
        mode,
        title: val("f-title"),
        spotifyUrl: mode === "spotify" ? val("f-spotifyUrl") : "",
        fileUrl: (mode === "upload" || mode === "record") ? currentContent.fileUrl || null : null,
      };
    }
    case "gallery":
      return { caption: val("f-caption"), images: currentContent.images || [] };
    case "scratchcard":
      return { message: val("f-message"), revealLabel: val("f-revealLabel") };
    case "quiz": {
      const options = [1, 2, 3, 4].map((i) => val(`f-option${i}`)).filter((v) => v);
      return {
        question: val("f-question"),
        options,
        correctIndex: parseInt(val("f-correctIndex"), 10) - 1,
        successMessage: val("f-successMessage"),
        failMessage: val("f-failMessage"),
        prizeText: val("f-prizeText") || "",
        prizeCoins: parseInt(val("f-prizeCoins") || "0", 10) || 0,
      };
    }
    case "countdown":
      return { eventTitle: val("f-eventTitle"), eventDate: val("f-eventDate"), description: val("f-description") };
    case "memory":
      return { successMessage: val("f-successMessage"), images: currentContent.images || [] };
    case "challenge":
      return { task: val("f-task"), btnText: val("f-btnText"), successMessage: val("f-successMessage") };
    case "location":
      return { hint: val("f-hint"), lat: parseFloat(val("f-lat")), lng: parseFloat(val("f-lng")), successMessage: val("f-successMessage") };
    case "puzzle":
      return { successMessage: val("f-successMessage"), imageUrl: currentContent.imageUrl || null };
    case "giveaway":
      return { title: val("f-title"), description: val("f-description"), successMessage: val("f-successMessage") };
    case "ar":
      return { title: val("f-title"), modelUrl: val("f-modelUrl") };
    case "catcher":
      return { title: val("f-title"), targetScore: parseInt(val("f-targetScore") || 20, 10) };
    case "product":
      return { 
        title: val("f-title"), 
        image: val("f-image"), 
        oldPrice: val("f-oldPrice"), 
        newPrice: val("f-newPrice"), 
        discount: val("f-discount"), 
        url: val("f-url") 
      };
    case "choice":
      return {
        question: val("f-question"),
        optionA: val("f-optionA"),
        optionB: val("f-optionB")
      };
    case "coins": return { coinAmount: parseInt(val("f-coinAmount"), 10) || 50 };
    case "diary": return { diaryQuestion: val("f-diaryQuestion") };
    case "printplay": return { ppTitle: val("f-ppTitle"), ppImage: val("f-ppImage") };
    case "duel":
    case "timecapsule":
      return {};
    default:
      return {};
  }
}

document.getElementById("modal-save").addEventListener("click", async () => {
  const type = activeType || null;
  const content = type ? collectFieldsData(type) : null;
  
  if (content) {
    content.lockPassword = document.getElementById("f-lockPassword").value.trim();
    content.lockHint = document.getElementById("f-lockHint").value.trim();
    content.sensorLock = document.getElementById("f-sensorLock").value;
    content.geoLat = document.getElementById("f-geoLat").value.trim();
    content.geoLon = document.getElementById("f-geoLon").value.trim();
    const rd = parseInt(document.getElementById("f-reqChoiceDay").value, 10);
    content.reqChoiceDay = isNaN(rd) ? null : rd;
    content.reqChoiceOpt = document.getElementById("f-reqChoiceOpt").value;
  }

  try {
    const updatedDoor = await api.saveDay(calendarId, currentDay, { contentType: type, content });
    const idx = calendar.days.findIndex((d) => d.day === currentDay);
    calendar.days[idx] = updatedDoor;
    renderDoorGrid();
    closeModal();
  } catch (err) {
    alert(err.message);
  }
});

const wBtn = document.getElementById("wichtel-link-btn");
if (wBtn) {
  wBtn.addEventListener("click", async () => {
    try {
      const res = await api.generateWichtelLink(calendarId, currentDay);
      
      const modal = document.getElementById("wichtel-link-modal");
      const urlInput = document.getElementById("wichtel-url");
      const copyBtn = document.getElementById("wichtel-copy-btn");
      const closeBtn = document.getElementById("wichtel-close");
      
      urlInput.value = res.url;
      modal.classList.remove("hidden");
      
      const copyHandler = async () => {
        await navigator.clipboard.writeText(res.url);
        const span = copyBtn.querySelector("span");
        span.textContent = "Kopiert! ✓";
        setTimeout(() => span.textContent = "Kopieren", 2000);
      };
      
      const closeHandler = () => {
        modal.classList.add("hidden");
        copyBtn.removeEventListener("click", copyHandler);
        closeBtn.removeEventListener("click", closeHandler);
      };
      
      copyBtn.addEventListener("click", copyHandler);
      closeBtn.addEventListener("click", closeHandler);
      
    } catch (err) {
      alert("Fehler beim Erstellen des Wichtel-Links: " + err.message);
    }
  });
}

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  
  if (fd.get("theme") === "firma") {
    if (!calendar.customConfig) calendar.customConfig = {};
    calendar.customConfig.firmaColor = document.getElementById("firma-color").value;
  }
  
  const cd = fd.get("customDomain");
  if (cd) {
    if (!calendar.customConfig) calendar.customConfig = {};
    calendar.customConfig.customDomain = cd;
  }

  // Save daily push reminder settings
  if (!calendar.customConfig) calendar.customConfig = {};
  calendar.customConfig.dailyReminderEnabled = document.getElementById("dailyReminderEnabled").checked;
  calendar.customConfig.dailyReminderTime = document.getElementById("dailyReminderTime").value || "08:00";

  await api.updateCalendar(calendarId, {
    recipientName: fd.get("recipientName"),
    recipientEmail: fd.get("recipientEmail"),
    theme: fd.get("theme"),
    year: fd.get("year"),
    strictMode: document.getElementById("strictMode").checked,
    randomLayout: document.getElementById("randomLayout").checked,
    syncOpen: document.getElementById("syncOpen").checked,
    metaPuzzle: document.getElementById("metaPuzzle").checked,
    metaPassword: document.getElementById("metaPassword").value,
    customConfig: calendar.customConfig,
  });
  await loadCalendar();
  const saved = document.getElementById("settings-saved");
  saved.classList.remove("hidden");
  setTimeout(() => saved.classList.add("hidden"), 1500);
});

document.getElementById("copy-link-btn").addEventListener("click", async () => {
  const shareUrl = `${window.location.origin}/c/${calendar.token}`;
  await navigator.clipboard.writeText(shareUrl);
  const btn = document.getElementById("copy-link-btn");
  const original = btn.textContent;
  btn.textContent = "Kopiert!";
  setTimeout(() => (btn.textContent = original), 1500);
});

init();
