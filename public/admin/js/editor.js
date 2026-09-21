const params = new URLSearchParams(window.location.search);
const calendarId = params.get("id");

let currentUser = null;
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
    currentUser = await api.me();
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
    if (meta.hidden) return;
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

  handleSpotifyReturn();
}

// After the Spotify OAuth round-trip we land back here with ?spotify=…&day=N.
function handleSpotifyReturn() {
  const state = params.get("spotify");
  if (!state) return;
  const day = parseInt(params.get("day"), 10);
  window.history.replaceState({}, "", `/admin/editor.html?id=${encodeURIComponent(calendarId)}`);
  if (state === "connected") {
    if (day) openModal(day);
  } else if (state === "denied") {
    alert("Die Spotify-Verbindung wurde abgebrochen.");
  } else {
    alert("Die Spotify-Verbindung ist fehlgeschlagen. Bitte erneut versuchen.");
  }
}

async function loadCalendar() {
  calendar = await api.getCalendar(calendarId);
  // Secret door 25 is stored separately (bonusDoor); show it as a 25th tile.
  if (!calendar.days.find((d) => d.day === 25)) {
    const b = calendar.bonusDoor || {};
    calendar.days.push({ day: 25, bonus: true, contentType: b.contentType || null, content: b.content || null, opened: Boolean(b.opened), openedAt: b.openedAt || null });
  }
  document.getElementById("cal-title").textContent = `Für ${calendar.recipientName}`;
  document.getElementById("cal-subtitle").textContent = `Dezember ${calendar.year} · ${THEME_META[calendar.theme]?.label || calendar.theme}`;

  // Without PRO the branding block is not shown at all; the header button
  // explains what PRO adds and leads to the checkout.
  const isPro = Boolean(calendar.isPro || currentUser.isPro);
  document.getElementById("branding-section").classList.toggle("hidden", !isPro);
  const upgradeBtn = document.getElementById("upgrade-btn");
  upgradeBtn.classList.toggle("hidden", isPro);
  upgradeBtn.innerHTML = UI.proButtonLabel(currentUser.proPrice || "");
  upgradeBtn.onclick = async () => {
    const ok = await UI.proDialog({
      title: "Kalender auf PRO upgraden",
      scope: `den Kalender für ${calendar.recipientName}`,
      price: currentUser.proPrice || "",
      points: [
        ["image", "Eigenes Logo auf dem Kalender (White-Labeling)"],
        ["palette", "Corporate Design: Firmenfarbe, Hintergrundbild und Türchen-Stil"],
        ["bar-chart-3", "Statistiken: wer wann welches Türchen geöffnet hat"],
      ],
    });
    if (!ok) return;
    try {
      const res = await api.checkoutFor("calendar", calendar.id);
      if (res.url) UI.openCheckout(res.url);
    } catch (err) {
      UI.toast(err.message, { error: true });
    }
  };

  const settingsForm = document.getElementById("settings-form");
  document.querySelector('input[name="recipientName"]').value = calendar.recipientName;
  document.querySelector('input[name="recipientEmail"]').value = calendar.recipientEmail || "";
  document.getElementById("theme-select").value = calendar.theme;
  document.querySelector('input[name="year"]').value = calendar.year;
  document.getElementById("strictMode").checked = calendar.strictMode;
  document.getElementById("randomLayout").checked = calendar.randomLayout;
  document.getElementById("syncOpen").checked = calendar.syncOpen || false;
  document.getElementById("companyMode").checked = calendar.companyMode || false;
  document.getElementById("communityCanvas").checked = calendar.communityCanvas !== false;
  document.getElementById("rudiEnabled").checked = calendar.rudiEnabled !== false;
  document.getElementById("swissMode").checked = Boolean(calendar.swissMode);
  
  const metaCheckbox = document.getElementById("metaPuzzle");
  const metaConfig = document.getElementById("metaPuzzleConfig");
  metaCheckbox.checked = calendar.metaPuzzle || false;
  document.getElementById("metaPassword").value = calendar.metaPassword || "";
  metaConfig.classList.toggle("hidden", !metaCheckbox.checked);
  
  metaCheckbox.addEventListener("change", (e) => {
    metaConfig.classList.toggle("hidden", !e.target.checked);
  });
  
  if (calendar.customConfig && calendar.customConfig.password) {
    document.getElementById("calendarPassword").value = calendar.customConfig.password;
  }
  if (calendar.customConfig && calendar.customConfig.snowfall) {
    document.getElementById("snowfall").checked = true;
  }
  
  if (calendar.customConfig && calendar.customConfig.logo) {
    document.getElementById("calendarLogo").value = calendar.customConfig.logo;
    document.getElementById("logoPreviewImg").src = calendar.customConfig.logo;
    document.getElementById("logoPreview").classList.remove("hidden");
  }

  document.getElementById("logoUpload").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await api.upload(file);
      document.getElementById("calendarLogo").value = res.url;
      document.getElementById("logoPreviewImg").src = res.url;
      document.getElementById("logoPreview").classList.remove("hidden");
    } catch(err) {
      alert("Fehler beim Logo-Upload: " + err.message);
    }
  });

  document.getElementById("removeLogoBtn").addEventListener("click", () => {
    document.getElementById("calendarLogo").value = "";
    document.getElementById("logoPreview").classList.add("hidden");
    document.getElementById("logoUpload").value = "";
  });

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
  if (calendar.customConfig?.doorStyle) {
    document.getElementById("firma-door-style").value = calendar.customConfig.doorStyle;
  }

  document.getElementById("preview-link").href = `/c/preview/${calendarId}`;

  const firmaSettings = document.getElementById("firma-settings");
  firmaSettings.classList.toggle("hidden", calendar.theme !== "firma");
  document.getElementById("company-mode-block").classList.toggle("hidden", calendar.theme !== "firma");
  document.getElementById("community-canvas-block").classList.toggle("hidden", calendar.theme !== "firma");

  // Keep reference to customConfig
  if (!calendar.customConfig) calendar.customConfig = {};

  renderDoorGrid();
}

function getPreviewText(c, type) {
  if (!c) return "Leer";
  switch(type) {
    case "text": return c.message || "Text";
    case "video": return c.url || "Video";
    case "audio": return c.url || "Audio";
    case "gallery": return c.caption || (c.images ? `${c.images.length} Bilder` : "Bilder");
    case "link": return c.url || "Link";
    case "quiz": return c.question || "Quiz";
    case "challenge": return c.task || "Aufgabe";
    case "countdown": return c.eventTitle || "Countdown";
    case "quote": return c.quote || "Zitat";
    case "voucher": return c.title || "Gutschein";
    case "recipe": return c.title || "Rezept";
    default: return "";
  }
}

function renderDoorGrid() {
  doorGrid.innerHTML = "";
  
  const tooltip = document.getElementById("door-tooltip");
  const tooltipTitle = document.getElementById("tooltip-title");
  const tooltipBody = document.getElementById("tooltip-body");
  
  calendar.days.forEach((door) => {
    const meta = door.contentType ? CONTENT_TYPE_META[door.contentType] : null;
    const btn = document.createElement("button");
    btn.type = "button";
    const isBonus = door.day === 25;
    btn.className = `relative aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 transition-colors ${
      isBonus
        ? (door.contentType ? "bg-amber-900/30 border-amber-400/70 hover:bg-amber-900/50" : "bg-slate-900/60 border-amber-400/40 border-dashed hover:bg-slate-800")
        : door.contentType
        ? "bg-emerald-900/30 border-emerald-700/60 hover:bg-emerald-900/50"
        : "bg-slate-900/60 border-white/10 hover:bg-slate-800"
    }`;
    btn.draggable = !isBonus;
    btn.dataset.day = door.day;
    if (isBonus) btn.title = `Geheimes Türchen 25 – ${bonusRuleLabel(calendar.bonusUnlock)}. Ohne eigenen Inhalt wird ein Standard-Dankeschön gezeigt.`;
    btn.innerHTML = `
      <span class="text-lg">${meta ? meta.icon : isBonus ? icon("star") : icon("door-open")}</span>
      <span class="text-xs font-semibold">${isBonus ? "25 · Geheim" : door.day}</span>
      ${door.opened ? '<span class="absolute top-1 right-1 text-[10px]" title="Bereits geöffnet"><i data-icon="eye"></i></span>' : ""}
      ${door.openedAt ? `<span class="absolute bottom-1 right-1 text-[8px] text-slate-400" title="Geöffnet am"><i data-icon="clock"></i> ${new Date(door.openedAt).toLocaleDateString()}</span>` : ""}
    `;
    
    // Hover Preview Logic
    btn.addEventListener("mouseenter", (e) => {
      if (meta) {
        tooltipTitle.innerHTML = `${meta.icon} ${meta.label}`;
        tooltipBody.textContent = getPreviewText(door.content, door.contentType);
        
        // Ensure tooltip is in body so document-relative positioning works perfectly
        if (tooltip.parentElement !== document.body) {
          document.body.appendChild(tooltip);
        }
        
        tooltip.classList.remove("hidden");
        // small delay for opacity transition
        requestAnimationFrame(() => tooltip.classList.remove("opacity-0"));
        
        // Position it below the button, relative to document
        const rect = btn.getBoundingClientRect();
        let leftPos = rect.left + window.scrollX + (rect.width / 2) - (tooltip.offsetWidth / 2);
        
        // Prevent going off left edge
        if (leftPos < 8) leftPos = 8;
        // Prevent going off right edge
        if (leftPos + tooltip.offsetWidth > window.innerWidth - 8) {
          leftPos = window.innerWidth - tooltip.offsetWidth - 8;
        }
        
        tooltip.style.left = `${leftPos}px`;
        tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;
      }
    });
    
    btn.addEventListener("mouseleave", () => {
      tooltip.classList.add("opacity-0");
      setTimeout(() => {
        if (tooltip.classList.contains("opacity-0")) tooltip.classList.add("hidden");
      }, 200);
    });
    
    btn.addEventListener("click", () => {
      tooltip.classList.add("hidden", "opacity-0");
      openModal(door.day);
    });
    
    // Drag & Drop
    btn.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", door.day);
      btn.classList.add("opacity-50");
      tooltip.classList.add("hidden", "opacity-0");
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
        <span class="text-4xl"><i data-icon="image"></i></span>
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
        <div class="w-full h-10 bg-emerald-100 rounded-xl border border-emerald-400 flex items-center px-4"><div class="w-1/3 h-3 bg-emerald-500 rounded"></div><span class="ml-auto text-emerald-600"><i data-icon="check"></i></span></div>
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
        ${Array(8).fill(0).map((_, i) => `<div class="aspect-square rounded-lg ${i===2 || i===5 ? 'bg-emerald-400 border-2 border-emerald-500' : 'bg-indigo-500 border-b-4 border-indigo-700'} flex items-center justify-center text-white text-xl">${i===2||i===5 ? icon('star') : '?'}</div>`).join('')}
      </div>`;
    case "catcher":
      return `<div class="w-full h-40 bg-sky-100 rounded-xl shadow-inner relative overflow-hidden border border-sky-200">
        <div class="absolute top-4 left-1/4 text-2xl animate-bounce"><i data-icon="gift"></i></div>
        <div class="absolute top-12 right-1/3 text-2xl animate-bounce" style="animation-delay: 0.2s"><i data-icon="snowflake"></i></div>
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
        <div class="text-5xl drop-shadow-xl transform hover:scale-110 transition-transform"><i data-icon="box"></i></div>
        <div class="absolute bottom-2 text-[10px] text-white/50 bg-black/50 px-2 py-1 rounded-full">AR Ansicht</div>
      </div>`;
    case "product":
      return `<div class="w-full bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden flex flex-col">
        <div class="h-24 bg-slate-200 flex items-center justify-center text-3xl"><i data-icon="footprints"></i></div>
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
          <div class="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-black text-xl"><i data-icon="music"></i></div>
          <div class="flex-1 space-y-2"><div class="w-3/4 h-3 bg-zinc-100 rounded-full"></div><div class="w-1/2 h-2 bg-zinc-400 rounded-full"></div></div>
        </div>
        <div class="w-full h-8 bg-zinc-800 rounded-full flex items-center px-3"><div class="w-4 h-4 rounded-full bg-zinc-500 mr-2"></div><div class="w-1/3 h-2 bg-zinc-600 rounded"></div></div>
      </div>`;
    case "voucher":
      return `<div class="w-full bg-gradient-to-r from-amber-200 to-yellow-400 p-6 rounded-xl shadow-lg border-2 border-dashed border-amber-600 text-center relative overflow-hidden">
        <div class="absolute -left-3 -top-3 w-8 h-8 bg-white rounded-full"></div>
        <div class="absolute -right-3 -top-3 w-8 h-8 bg-white rounded-full"></div>
        <div class="text-amber-800 font-black text-2xl uppercase tracking-widest border-y-2 border-amber-600 py-2">GUTSCHEIN</div>
        <div class="mt-4 text-4xl"><i data-icon="ticket"></i></div>
      </div>`;
    case "qrcode":
      return `<div class="w-full aspect-square max-w-[200px] bg-white p-4 rounded-xl shadow-md flex items-center justify-center border-4 border-slate-900 mx-auto">
        <div class="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTAgMGg4djhIMHptMTIgMGg4djhIMTJ6TTAgMTJoOHY4SDB6IiBmaWxsPSIjMGYxNzJhIi8+PC9zdmc+')] opacity-80"></div>
      </div>`;
    case "challenge":
      return `<div class="w-full bg-rose-100 p-6 rounded-xl border border-rose-300 text-center">
        <div class="text-4xl mb-3"><i data-icon="target"></i></div>
        <div class="w-5/6 h-5 bg-rose-200 rounded mx-auto mb-4"></div>
        <div class="w-full h-10 bg-rose-500 rounded-lg shadow-md flex items-center justify-center text-white font-bold">Aufgabe erledigt!</div>
      </div>`;
    case "location":
      return `<div class="w-full aspect-video bg-emerald-100 rounded-xl relative overflow-hidden border border-emerald-300 flex items-center justify-center">
        <div class="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTAgMEwyMCAyME0yMCAwTDAgMjAiIHN0cm9rZT0iIzA1OTY2OSIgc3Ryb2tlLXdpZHRoPSIwLjUiPjwvcGF0aD48L3N2Zz4=')]"></div>
        <div class="w-32 h-32 border-4 border-emerald-500 rounded-full absolute animate-ping opacity-30"></div>
        <div class="text-5xl drop-shadow-xl z-10 text-emerald-600"><i data-icon="map-pin"></i></div>
      </div>`;
    case "giveaway":
      return `<div class="w-full bg-indigo-600 p-6 rounded-xl text-center text-white relative overflow-hidden shadow-lg border-2 border-indigo-400">
        <div class="absolute -top-10 -right-10 text-8xl opacity-10"><i data-icon="clover"></i></div>
        <h3 class="font-black text-2xl mb-2 text-indigo-100 uppercase italic">GEWINNSPIEL</h3>
        <div class="w-full h-10 bg-white/20 rounded-lg mb-2 flex items-center px-3"><div class="w-1/2 h-3 bg-white/40 rounded"></div></div>
        <div class="w-full h-10 bg-white rounded-lg text-indigo-800 font-bold flex items-center justify-center">Jetzt teilnehmen</div>
      </div>`;
    case "coins":
      return `<div class="w-full h-32 bg-yellow-100 rounded-xl border border-yellow-300 flex flex-col items-center justify-center relative shadow-inner">
        <div class="absolute top-2 right-2 text-xl animate-bounce" style="animation-delay: 0.1s"><i data-icon="coins"></i></div>
        <div class="absolute bottom-4 left-4 text-2xl animate-bounce" style="animation-delay: 0.3s"><i data-icon="coins"></i></div>
        <div class="text-5xl drop-shadow-lg z-10"><i data-icon="wallet"></i></div>
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
        <div class="text-5xl z-10 drop-shadow-xl mb-2"><i data-icon="hourglass"></i></div>
        <div class="w-3/4 h-8 bg-black/40 backdrop-blur rounded-lg border border-purple-500/50 flex items-center justify-center text-purple-200 font-mono text-sm font-bold">Öffnet in 365 Tagen</div>
      </div>`;
    case "printplay":
      return `<div class="w-full aspect-[3/4] max-h-[250px] bg-white mx-auto rounded shadow-lg border border-slate-200 flex flex-col p-4">
        <div class="w-full h-1/2 border-2 border-dashed border-slate-300 rounded flex items-center justify-center mb-3"><i data-icon="scissors"></i></div>
        <div class="w-full h-3 bg-slate-200 rounded mb-2"></div>
        <div class="w-3/4 h-3 bg-slate-200 rounded mb-4"></div>
        <div class="w-full h-8 bg-slate-800 rounded mt-auto text-white flex items-center justify-center text-xs font-bold">PDF HERUNTERLADEN</div>
      </div>`;
    case "wichteln":
      return `<div class="w-full bg-emerald-950 rounded-xl p-4 text-white flex flex-col items-center gap-3 border border-emerald-800">
        <div class="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-3xl"><i data-icon="gift"></i></div>
        <div class="w-2/3 h-4 bg-emerald-800 rounded-full"></div>
        <div class="w-1/2 h-3 bg-emerald-900 rounded-full"></div>
        <div class="w-full h-9 bg-emerald-500 rounded-lg text-emerald-950 font-bold text-xs flex items-center justify-center">Zur Wichtel-Runde</div>
      </div>`;
    case "iot-box":
      return `<div class="w-full bg-slate-800 rounded-xl p-6 shadow-inner border border-slate-700 text-center relative">
        <div class="absolute top-4 right-4 w-3 h-3 bg-blue-500 rounded-full animate-ping"></div>
        <div class="text-6xl mb-4 drop-shadow-lg"><i data-icon="wrench"></i></div>
        <div class="w-full h-10 bg-blue-600 rounded-lg text-white font-bold flex items-center justify-center gap-2"><span>Bluetooth verbinden</span></div>
      </div>`;
    default:
      return `<div class="w-full h-8 bg-slate-200 rounded-lg animate-pulse mb-3"></div>
        <div class="w-3/4 h-8 bg-slate-200 rounded-lg animate-pulse mb-6"></div>
        <div class="w-full h-12 bg-emerald-500 rounded-xl shadow-lg opacity-80"></div>`;
  }
}

// Door 25: when it appears, in words.
function bonusRuleLabel(rule) {
  const r = rule || { mode: "referrals", count: 3 };
  const [y, m, d] = String(r.date || "").split("-");
  return { referrals: `erscheint nach ${r.count} Einladung${r.count === 1 ? "" : "en"}`, allOpened: "erscheint, wenn alle 24 Türchen offen sind", date: `erscheint ab ${Number(d)}.${Number(m)}.${y}`, always: "ist von Anfang an sichtbar", never: "ist ausgeschaltet" }[r.mode] || "";
}
function syncBonusRuleUi() {
  const mode = document.getElementById("f-bonusMode").value;
  document.getElementById("f-bonusCountRow").classList.toggle("hidden", mode !== "referrals");
  document.getElementById("f-bonusDateRow").classList.toggle("hidden", mode !== "date");
  document.getElementById("f-bonusHint").textContent = {
    referrals: "Der Beschenkte sieht unten einen Einladungs-Link. Jeder Besuch über diesen Link zählt als Einladung.",
    allOpened: "Belohnung fürs Durchhalten: Das Türchen taucht auf, sobald das 24. Türchen offen ist.",
    date: "Zum Beispiel am 25. Dezember – ein Türchen nach Heiligabend.",
    always: "Das Türchen steht von Anfang an neben den 24 anderen.",
    never: "Kein Türchen 25 – der Kalender endet am 24.",
  }[mode] || "";
}
document.getElementById("f-bonusMode").addEventListener("change", syncBonusRuleUi);

function openModal(day) {
  currentDay = day;
  const door = calendar.days.find((d) => d.day === day);
  currentContent = JSON.parse(JSON.stringify(door.content || {}));
  document.getElementById("modal-day").textContent = day === 25 ? "25 – Geheimes Bonus-Türchen" : day;
  document.getElementById("bonus-unlock").classList.toggle("hidden", day !== 25);
  if (day === 25) {
    const r = calendar.bonusUnlock || { mode: "referrals", count: 3, date: `${calendar.year}-12-25` };
    document.getElementById("f-bonusMode").value = r.mode || "referrals";
    document.getElementById("f-bonusCount").value = r.count || 3;
    document.getElementById("f-bonusDate").value = r.date || `${calendar.year}-12-25`;
    syncBonusRuleUi();
  }
  
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
  
  document.getElementById("f-isScratchable").checked = currentContent.isScratchable || false;
  document.getElementById("f-scratchLabel").value = currentContent.scratchLabel || "";
  document.getElementById("scratch-settings").classList.toggle("hidden", !currentContent.isScratchable);
  
  // Feedback
  const section = document.getElementById("feedback-section");
  if (door.feedback && (door.feedback.reactions?.length || door.feedback.replies?.length)) {
    section.classList.remove("hidden");
    const REACTION_ICONS = { heart: ["heart", "text-rose-400"], laugh: ["laugh", "text-amber-300"], touched: ["frown", "text-sky-300"], party: ["party-popper", "text-emerald-300"], "❤️": ["heart", "text-rose-400"], "😂": ["laugh", "text-amber-300"], "🥺": ["frown", "text-sky-300"], "🎉": ["party-popper", "text-emerald-300"] };
    document.getElementById("feedback-reactions").innerHTML = door.feedback.reactions?.map(e => { const r = REACTION_ICONS[e]; return `<span class="${r ? r[1] : ""}">${r ? icon(r[0]) : escapeHtml(e)}</span>`; }).join("") || "–";
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

document.getElementById("f-isScratchable").addEventListener("change", (e) => {
  document.getElementById("scratch-settings").classList.toggle("hidden", !e.target.checked);
});



themeSelect.addEventListener("change", (e) => {
  const isFirma = e.target.value === "firma";
  document.getElementById("firma-settings").classList.toggle("hidden", !isFirma);
  document.getElementById("company-mode-block").classList.toggle("hidden", !isFirma);
  document.getElementById("community-canvas-block").classList.toggle("hidden", !isFirma);
  if (!isFirma) document.getElementById("companyMode").checked = false;
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



function getDropzoneHtml(id, label, multiple, acceptsPdf = false) {
  const acceptStr = acceptsPdf ? "image/*,application/pdf" : "image/*";
  const descStr = acceptsPdf ? "Unterstützt JPG, PNG, GIF, WEBP, PDF" : "Unterstützt JPG, PNG, GIF, WEBP";
  return `
    <div class="mt-4">
      <label class="block text-sm text-slate-300 mb-2">${label}</label>
      <div id="${id}-dropzone" class="w-full border-2 border-dashed border-emerald-500/30 rounded-xl bg-slate-800/50 hover:bg-slate-800 hover:border-emerald-500/70 transition-all duration-200 p-8 flex flex-col items-center justify-center cursor-pointer text-center group">
        <div class="w-14 h-14 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </div>
        <p class="text-sm font-semibold text-white mb-1">Klicke hier oder ziehe Dateien in dieses Feld</p>
        <p class="text-xs text-slate-400">${descStr}</p>
        <input id="${id}-input" type="file" accept="${acceptStr}" ${multiple ? "multiple" : ""} class="hidden" />
      </div>
    </div>
  `;
}

function attachDropzone(id, onFiles, acceptsPdf = false) {
  const dropzone = document.getElementById(`${id}-dropzone`);
  const input = document.getElementById(`${id}-input`);

  if(!dropzone || !input) return;

  dropzone.addEventListener("click", () => input.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-emerald-500", "bg-slate-700");
  });

  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-emerald-500", "bg-slate-700");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-emerald-500", "bg-slate-700");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handle(e.dataTransfer.files);
    }
  });

  input.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handle(e.target.files);
    }
  });

  async function handle(files) {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/') || (acceptsPdf && f.type === 'application/pdf'));
    if (fileArray.length === 0) return;
    
    const statusText = dropzone.querySelector("p.text-sm");
    const prevText = statusText.textContent;
    statusText.textContent = "Lade hoch…";
    
    await onFiles(fileArray);
    
    statusText.textContent = prevText;
    input.value = "";
  }
}

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
    wichteln: renderWichtelnFields,
  };
  (renderers[type] || (() => {}))(content);
}

function renderSpotifyCollabFields(c) {
  typeFields.innerHTML =
    `<p class="text-sm text-slate-300 mb-4">Der Nutzer sucht einen Song auf Spotify und fügt ihn der gemeinsamen Playlist hinzu. Verbinde deinen Spotify-Account, damit die Songs automatisch in der echten Playlist landen.</p>` +
    `<div id="spotify-connect-box" class="rounded-xl border border-white/10 bg-slate-900/60 p-4 mb-4 text-sm text-slate-300">Spotify-Status wird geladen…</div>` +
    fieldWrap("Spotify-Playlist (Link oder ID)", `<input id="f-playlistUrl" value="${escapeHtml(c.playlistUrl || '')}" placeholder="https://open.spotify.com/playlist/..." class="${inputClass}" />`);
  loadSpotifyStatus();
}

function pendingSpotifyCount() {
  return (calendar.playlist || []).filter((s) => s.trackUri && !s.spotifySynced).length;
}

function renderSpotifyLog(log) {
  if (!log || log.length === 0) return "";
  const rows = log
    .map((e) => {
      const time = new Date(e.at).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      return `<li class="${e.ok ? "text-emerald-300" : "text-rose-300"}">${e.ok ? icon("check") : icon("circle-x")} ${time} · ${escapeHtml(e.track)}${e.ok ? "" : ` – ${escapeHtml(e.reason)}`}</li>`;
    })
    .join("");
  return `<details class="mt-3 text-xs"><summary class="cursor-pointer text-slate-400">Letzte Übertragungen (${log.length})</summary><ul class="mt-2 space-y-1 font-mono">${rows}</ul></details>`;
}

async function loadSpotifyStatus() {
  const box = document.getElementById("spotify-connect-box");
  if (!box) return;
  const connectUrl = `/api/spotify/connect?calendarId=${encodeURIComponent(calendarId)}&day=${currentDay}`;
  const btn = (label, extra = "") =>
    `<a href="${connectUrl}" class="inline-flex items-center gap-2 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-sm px-4 py-2 transition-colors ${extra}">
       <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.47-.077-.334.132-.67.47-.745 3.808-.87 7.076-.496 9.712 1.115.293.18.386.563.207.856zm1.2-3.15c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.13-9.965-1.166-.413.127-.848-.106-.973-.517-.125-.413.108-.848.52-.973 3.632-1.1 8.147-.568 11.234 1.328.366.226.48.706.256 1.072zm.106-3.297C14.67 8 10.513 7.784 7.234 8.78c-.487.148-1-.13-1.148-.616-.148-.488.13-1 .616-1.15C10.457 5.88 15.115 6.13 18.733 8.275c.427.25.57.81.318 1.237-.253.427-.81.57-1.238.318z"/></svg>
       ${label}
     </a>`;

  let status;
  try {
    status = await api.spotifyStatus(calendarId);
  } catch (err) {
    box.innerHTML = `<p class="text-rose-300">Spotify-Status konnte nicht geladen werden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (!status.configured) {
    box.innerHTML = `<p class="text-amber-300">Spotify ist auf dem Server nicht konfiguriert. Trage <code>SPOTIFY_CLIENT_ID</code> und <code>SPOTIFY_CLIENT_SECRET</code> in die <code>.env</code> ein.</p>`;
    return;
  }

  if (!status.connected) {
    box.innerHTML = `
      <p class="mb-3">Noch kein Spotify-Account verbunden – Songwünsche werden dann nur in der App gespeichert.</p>
      ${btn("Mit Spotify verbinden")}`;
    return;
  }

  const options = (status.playlists || [])
    .map((p) => `<option value="${escapeHtml(p.url)}">${escapeHtml(p.name)} (${p.tracks} Songs)</option>`)
    .join("");
  box.innerHTML = `
    <div class="flex items-center justify-between gap-3 mb-3">
      <p>Verbunden als <span class="font-semibold text-emerald-400">${escapeHtml(status.displayName)}</span></p>
      <button type="button" id="spotify-disconnect" class="text-xs text-slate-400 hover:text-rose-300 underline">Trennen</button>
    </div>
    ${status.error ? `<p class="text-rose-300 text-xs mb-2">Playlists konnten nicht geladen werden: ${escapeHtml(status.error)}</p>` : ""}
    <label class="block text-xs text-slate-400 mb-1">Playlist aus deinem Account wählen</label>
    <div class="flex flex-col sm:flex-row gap-2">
      <select id="spotify-playlist-select" class="${inputClass}">
        <option value="">– auswählen –</option>${options}
      </select>
      <button type="button" id="spotify-create-playlist" class="rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-3 py-2 whitespace-nowrap">+ Neue Playlist</button>
    </div>
    <p class="text-xs text-slate-500 mt-2">Neue Songs werden in die unten eingetragene Playlist geschrieben.</p>
    <div class="flex flex-wrap gap-2 mt-3">
      <button type="button" id="spotify-check" class="rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-3 py-2">Verbindung testen</button>
      ${pendingSpotifyCount() > 0 ? `<button type="button" id="spotify-sync" class="rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium px-3 py-2">↻ ${pendingSpotifyCount()} gespeicherte Songs übertragen</button>` : ""}
    </div>
    <div id="spotify-check-result" class="text-xs mt-2"></div>
    ${renderSpotifyLog(status.log)}`;

  const urlInput = document.getElementById("f-playlistUrl");
  document.getElementById("spotify-check").addEventListener("click", async () => {
    const out = document.getElementById("spotify-check-result");
    const playlistUrl = urlInput.value.trim();
    if (!playlistUrl) return (out.innerHTML = `<span class="text-amber-300">Bitte zuerst eine Playlist auswählen.</span>`);
    out.textContent = "Prüfe…";
    try {
      const r = await api.spotifyCheck(calendarId, playlistUrl);
      if (r.ok) {
        out.innerHTML = `<span class="text-emerald-300"><i data-icon="check"></i> Schreibzugriff auf „${escapeHtml(r.playlist.name)}“ (${r.playlist.tracks} Songs, Besitzer: ${escapeHtml(r.playlist.owner)}) als ${escapeHtml(r.account.displayName)}.</span>`;
      } else {
        out.innerHTML = `<span class="text-rose-300"><i data-icon="circle-x"></i> ${escapeHtml(r.problem)}</span>`;
      }
    } catch (err) {
      out.innerHTML = `<span class="text-rose-300"><i data-icon="circle-x"></i> ${escapeHtml(err.message)}</span>`;
    }
  });
  const syncBtn = document.getElementById("spotify-sync");
  if (syncBtn) {
    syncBtn.addEventListener("click", async () => {
      const playlistUrl = urlInput.value.trim();
      if (!playlistUrl) return alert("Bitte zuerst eine Playlist auswählen.");
      syncBtn.disabled = true;
      syncBtn.textContent = "Übertrage…";
      try {
        const r = await api.spotifySync(calendarId, playlistUrl);
        alert(`${r.synced} Songs übertragen${r.failed ? `, ${r.failed} fehlgeschlagen:\n${r.errors.join("\n")}` : "."}`);
        await loadCalendar();
        await loadSpotifyStatus();
      } catch (err) {
        alert(err.message);
        syncBtn.disabled = false;
      }
    });
  }
  const select = document.getElementById("spotify-playlist-select");
  if (urlInput.value) select.value = urlInput.value;
  select.addEventListener("change", () => {
    if (select.value) urlInput.value = select.value;
  });

  document.getElementById("spotify-create-playlist").addEventListener("click", async () => {
    const name = prompt("Name der neuen Playlist:", `Adventskalender für ${calendar.recipientName}`);
    if (!name) return;
    try {
      const playlist = await api.spotifyCreatePlaylist(calendarId, name);
      urlInput.value = playlist.url;
      await loadSpotifyStatus();
      document.getElementById("spotify-playlist-select").value = playlist.url;
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("spotify-disconnect").addEventListener("click", async () => {
    if (!confirm("Spotify-Verbindung für diesen Kalender trennen?")) return;
    await api.spotifyDisconnect(calendarId);
    await loadSpotifyStatus();
  });
}

function renderWichtelnFields(c) {
  typeFields.innerHTML =
    `<p class="text-sm text-slate-300 mb-4">Hinter diesem Türchen steckt die Einladung zu einer Wichtel-Runde. Kopiere den Einladungslink aus dem Wichtel-Editor (Bereich „Einladung“) hierher.</p>` +
    fieldWrap("Einladungslink der Wichtel-Runde", `<input id="f-wichtelUrl" value="${escapeHtml(c.wichtelUrl || '')}" placeholder="https://…/w/join/…" class="${inputClass}" />`) +
    fieldWrap("Überschrift", `<input id="f-wichtelTitle" value="${escapeHtml(c.wichtelTitle || '')}" placeholder="Du bist zum Wichteln eingeladen!" class="${inputClass}" />`) +
    fieldWrap("Text (optional)", `<textarea id="f-wichtelText" rows="3" placeholder="Budget, Motto, Termin …" class="${inputClass}">${escapeHtml(c.wichtelText || '')}</textarea>`) +
    `<p class="text-xs text-slate-400 mt-2">Tipp: <a href="/admin/wichteln.html" class="text-emerald-400 underline">Zum Wichtel-Bereich</a> – dort findest du Link und QR-Code jeder Runde.</p>`;
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
    getDropzoneHtml("f-printplay", "Bild / PDF hochladen (Drag & Drop)", false, true) +
    `<div id="f-printplay-preview" class="mt-2 text-sm text-emerald-400 font-bold">${c.ppImage ? 'Aktuell: Datei vorhanden' : ''}</div>`;

  attachDropzone("f-printplay", async (files) => {
    try {
      const { url } = await api.upload(files[0]);
      currentContent.ppImage = url;
      document.getElementById("f-printplay-preview").textContent = "Neue Datei hochgeladen.";
    } catch (err) {
      alert("Upload fehlgeschlagen: " + err.message);
    }
  }, true);
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
    getDropzoneHtml("f-product", "Produkt-Bild hochladen (Drag & Drop)", false) +
    `<div id="f-product-preview" class="mt-2 text-sm text-emerald-400 font-bold mb-4">${c.image ? 'Aktuell: Bild vorhanden' : ''}</div>` +
    fieldWrap("Streichpreis (z.B. 49,99 CHF)", `<input id="f-oldPrice" value="${escapeHtml(c.oldPrice || '')}" class="${inputClass}" />`) +
    fieldWrap("Aktionspreis (z.B. 29,99 CHF)", `<input id="f-newPrice" value="${escapeHtml(c.newPrice || '')}" class="${inputClass}" />`) +
    fieldWrap("Rabattcode (optional)", `<input id="f-discount" value="${escapeHtml(c.discount || '')}" placeholder="XMAS20" class="${inputClass}" />`) +
    fieldWrap("Kaufen-Button Link", `<input id="f-url" value="${escapeHtml(c.url || '')}" placeholder="https://..." class="${inputClass}" />`);

  attachDropzone("f-product", async (files) => {
    try {
      const { url } = await api.upload(files[0]);
      currentContent.image = url;
      document.getElementById("f-product-preview").textContent = "Neues Bild hochgeladen.";
    } catch (err) {
      alert("Upload fehlgeschlagen: " + err.message);
    }
  });
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
    getDropzoneHtml("f-puzzle", "Bild hochladen (Drag & Drop)", false) +
    `<div id="f-puzzle-preview" class="mt-2 text-sm text-emerald-400 font-bold">${c.imageUrl ? 'Aktuell: Bild vorhanden' : ''}</div>`;
    
  attachDropzone("f-puzzle", async (files) => {
    try {
      const { url } = await api.upload(files[0]);
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
        recBtn.innerHTML = `<i data-icon="square"></i> Aufnahme stoppen`;
        recBtn.classList.replace("bg-rose-600", "bg-emerald-600");
        recBtn.classList.replace("hover:bg-rose-500", "hover:bg-emerald-500");
        recStatus.innerHTML = `<i data-icon="circle-dot" class="text-rose-500"></i> Nimmt auf…`;
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
        recBtn.innerHTML = `<i data-icon="square"></i> Aufnahme stoppen`;
        recBtn.classList.replace("bg-rose-600", "bg-emerald-600");
        recBtn.classList.replace("hover:bg-rose-500", "hover:bg-emerald-500");
        recStatus.innerHTML = `<i data-icon="circle-dot" class="text-rose-500"></i> Nimmt auf…`;
      } catch (err) {
        alert("Mikrofon konnte nicht gestartet werden: " + err.message);
      }
    }
  });
}

function renderGalleryFields(c) {
  currentContent.images = c.images || [];
  typeFields.innerHTML =
    fieldWrap("Beschriftung", `<input id="f-caption" value="${escapeHtml(c.caption || "")}" class="${inputClass}" />`) +
    getDropzoneHtml("f-gallery", "Bilder hochladen (Drag & Drop, Mehrfachauswahl möglich)", true) +
    `<div id="f-gallery-preview" class="flex flex-wrap gap-2 mt-4"></div>`;

  renderGalleryPreview();

  attachDropzone("f-gallery", async (files) => {
    for (const file of files) {
      try {
        const { url } = await api.upload(file);
        currentContent.images.push(url);
        renderGalleryPreview();
      } catch (err) {
        alert(`Upload fehlgeschlagen (${file.name}): ${err.message}`);
      }
    }
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
      <button type="button" class="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full w-5 h-5 text-xs leading-none"><i data-icon="x"></i></button>
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
      <p class="text-sm font-semibold text-amber-300"><i data-icon="trophy"></i> Preis für die richtige Antwort (optional)</p>
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
    getDropzoneHtml("f-memory", "Bilder hochladen (Drag & Drop, lade 4 bis 8 Bilder hoch)", true) +
    `<div id="f-gallery-preview" class="flex flex-wrap gap-2 mt-2"></div>`;

  renderGalleryPreview(); // Reusing the same preview logic as gallery

  attachDropzone("f-memory", async (files) => {
    for (const file of files) {
      try {
        const { url } = await api.upload(file);
        currentContent.images.push(url);
        renderGalleryPreview();
      } catch (err) {
        alert(`Upload fehlgeschlagen (${file.name}): ${err.message}`);
      }
    }
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
        image: currentContent.image || null, 
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
    case "printplay": return { ppTitle: val("f-ppTitle"), ppImage: currentContent.ppImage || null };
    case "spotify-collab": return { playlistUrl: val("f-playlistUrl") };
    case "wichteln": return { wichtelUrl: val("f-wichtelUrl"), wichtelTitle: val("f-wichtelTitle"), wichtelText: val("f-wichtelText") };
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
    
    content.isScratchable = document.getElementById("f-isScratchable").checked;
    content.scratchLabel = document.getElementById("f-scratchLabel").value.trim();
  }

  try {
    const payload = { contentType: type, content };
    if (currentDay === 25) payload.bonusUnlock = { mode: document.getElementById("f-bonusMode").value, count: document.getElementById("f-bonusCount").value, date: document.getElementById("f-bonusDate").value };
    const updatedDoor = await api.saveDay(calendarId, currentDay, payload);
    if (updatedDoor.bonusUnlock) calendar.bonusUnlock = updatedDoor.bonusUnlock;
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
        span.textContent = "Kopiert!";
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
    calendar.customConfig.doorStyle = document.getElementById("firma-door-style").value;
  }
  
  // Subdomain is disabled for now on Hetzner Webhosting
  const pwd = fd.get("calendarPassword");
  if (pwd) {
    if (!calendar.customConfig) calendar.customConfig = {};
    calendar.customConfig.password = pwd;
  } else if (calendar.customConfig) {
    delete calendar.customConfig.password;
  }

  const logoUrl = document.getElementById("calendarLogo").value;
  if (logoUrl) {
    if (!calendar.customConfig) calendar.customConfig = {};
    calendar.customConfig.logo = logoUrl;
  } else if (calendar.customConfig) {
    delete calendar.customConfig.logo;
  }

  // Save daily push reminder settings
  if (!calendar.customConfig) calendar.customConfig = {};
  calendar.customConfig.dailyReminderEnabled = document.getElementById("dailyReminderEnabled").checked;
  calendar.customConfig.dailyReminderTime = document.getElementById("dailyReminderTime").value || "08:00";
  calendar.customConfig.snowfall = document.getElementById("snowfall").checked;

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
    companyMode: document.getElementById("companyMode").checked,
    communityCanvas: document.getElementById("communityCanvas").checked,
    rudiEnabled: document.getElementById("rudiEnabled").checked,
    swissMode: document.getElementById("swissMode").checked,
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
