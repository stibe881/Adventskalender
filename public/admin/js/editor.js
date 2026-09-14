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

  Object.entries(CONTENT_TYPE_META).forEach(([key, meta]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${meta.icon} ${meta.label}`;
    contentTypeSelect.appendChild(opt);
  });

  await loadCalendar();
}

async function loadCalendar() {
  calendar = await api.getCalendar(calendarId);
  document.getElementById("cal-title").textContent = `Für ${calendar.recipientName}`;
  document.getElementById("cal-subtitle").textContent = `Dezember ${calendar.year} · ${THEME_META[calendar.theme]?.label || calendar.theme}`;

  const settingsForm = document.getElementById("settings-form");
  settingsForm.recipientName.value = calendar.recipientName;
  settingsForm.year.value = calendar.year;
  themeSelect.value = calendar.theme;

  document.getElementById("preview-link").href = `/c/preview/${calendarId}`;

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
    btn.innerHTML = `
      <span class="text-lg">${meta ? meta.icon : "—"}</span>
      <span class="text-xs font-semibold">${door.day}</span>
      ${door.opened ? '<span class="absolute top-1 right-1 text-[10px]" title="Bereits geöffnet">✓</span>' : ""}
    `;
    btn.addEventListener("click", () => openModal(door.day));
    doorGrid.appendChild(btn);
  });
}

function openModal(day) {
  currentDay = day;
  const door = calendar.days.find((d) => d.day === day);
  currentContent = JSON.parse(JSON.stringify(door.content || {}));
  document.getElementById("modal-day").textContent = day;
  contentTypeSelect.value = door.contentType || "";
  renderTypeFields(door.contentType, currentContent);
  modalBackdrop.classList.remove("hidden");
}

function closeModal() {
  modalBackdrop.classList.add("hidden");
  currentDay = null;
}

contentTypeSelect.addEventListener("change", () => {
  currentContent = {};
  renderTypeFields(contentTypeSelect.value, currentContent);
});

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
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
  };
  (renderers[type] || (() => {}))(content);
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

function renderVideoFields(c) {
  typeFields.innerHTML =
    fieldWrap("Video-URL (YouTube oder Vimeo)", `<input id="f-url" value="${escapeHtml(c.url)}" class="${inputClass}" placeholder="https://youtube.com/watch?v=..." />`) +
    fieldWrap("Beschriftung", `<input id="f-caption" value="${escapeHtml(c.caption)}" class="${inputClass}" />`);
}

function renderAudioFields(c) {
  const mode = c.mode || "spotify";
  typeFields.innerHTML = `
    ${fieldWrap(
      "Quelle",
      `<select id="f-mode" class="${inputClass}">
        <option value="spotify" ${mode === "spotify" ? "selected" : ""}>Spotify-Link</option>
        <option value="upload" ${mode === "upload" ? "selected" : ""}>MP3-Upload</option>
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
  `;

  document.getElementById("f-mode").addEventListener("change", (e) => {
    const m = e.target.value;
    document.getElementById("f-mode-spotify").classList.toggle("hidden", m !== "spotify");
    document.getElementById("f-mode-upload").classList.toggle("hidden", m !== "upload");
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
    fieldWrap("Nachricht bei falscher Antwort", `<textarea id="f-failMessage" rows="2" class="${inputClass}">${escapeHtml(c.failMessage)}</textarea>`);
}

function renderCountdownFields(c) {
  typeFields.innerHTML =
    fieldWrap("Event-Titel", `<input id="f-eventTitle" value="${escapeHtml(c.eventTitle)}" class="${inputClass}" />`) +
    fieldWrap("Datum", `<input id="f-eventDate" type="date" value="${escapeHtml(c.eventDate)}" class="${inputClass}" />`) +
    fieldWrap("Beschreibung", `<textarea id="f-description" rows="3" class="${inputClass}">${escapeHtml(c.description)}</textarea>`);
}

// ---------- Collecting data per type on save ----------

function collectFieldsData(type) {
  switch (type) {
    case "text":
      return { message: val("f-message"), sender: val("f-sender") };
    case "voucher":
      return { title: val("f-title"), code: val("f-code"), description: val("f-description") };
    case "qrcode":
      return { label: val("f-label"), data: val("f-data") };
    case "video":
      return { url: val("f-url"), caption: val("f-caption") };
    case "audio": {
      const mode = val("f-mode");
      return {
        mode,
        title: val("f-title"),
        spotifyUrl: mode === "spotify" ? val("f-spotifyUrl") : "",
        fileUrl: mode === "upload" ? currentContent.fileUrl || null : null,
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
      };
    }
    case "countdown":
      return { eventTitle: val("f-eventTitle"), eventDate: val("f-eventDate"), description: val("f-description") };
    default:
      return {};
  }
}

document.getElementById("modal-save").addEventListener("click", async () => {
  const type = contentTypeSelect.value || null;
  const content = type ? collectFieldsData(type) : null;
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

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api.updateCalendar(calendarId, {
    recipientName: fd.get("recipientName"),
    theme: fd.get("theme"),
    year: fd.get("year"),
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
  btn.textContent = "✅ Kopiert!";
  setTimeout(() => (btn.textContent = original), 1500);
});

init();
