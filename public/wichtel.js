const params = new URLSearchParams(window.location.search);
const token = params.get("token");

const loading = document.getElementById("loading");
const error = document.getElementById("error");
const container = document.getElementById("editor-container");
const typeSelect = document.getElementById("content-type-select");
const typeFields = document.getElementById("type-fields");
const form = document.getElementById("wichtel-form");

let currentData = null;
let currentContent = {};

const inputClass = "w-full rounded-lg bg-slate-900 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
function fieldWrap(labelText, inputHtml) {
  return `<div><label class="block text-sm text-slate-300 mb-1">${labelText}</label>${inputHtml}</div>`;
}

async function init() {
  if (!token) {
    showError("Kein Wichtel-Token angegeben.");
    return;
  }
  
  try {
    const res = await fetch(`/api/wichtel/${token}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Fehler beim Laden.");
    }
    currentData = await res.json();
    currentContent = currentData.content || {};
    
    document.getElementById("door-title").textContent = `Du gestaltest Türchen ${currentData.day}!`;
    typeSelect.value = currentData.contentType || "";
    renderFields(typeSelect.value);
    
    loading.classList.add("hidden");
    container.classList.remove("hidden");
  } catch (err) {
    showError(err.message);
  }
}

function showError(msg) {
  loading.classList.add("hidden");
  error.textContent = msg;
  error.classList.remove("hidden");
}

typeSelect.addEventListener("change", () => {
  currentContent = {};
  renderFields(typeSelect.value);
});

function renderFields(type) {
  typeFields.innerHTML = "";
  if (type === "text") {
    typeFields.innerHTML =
      fieldWrap("Nachricht", `<textarea id="f-message" rows="4" class="${inputClass}">${escapeHtml(currentContent.message)}</textarea>`) +
      fieldWrap("Von (Dein Name)", `<input id="f-sender" value="${escapeHtml(currentContent.sender)}" class="${inputClass}" />`);
  } else if (type === "gallery") {
    currentContent.images = currentContent.images || [];
    typeFields.innerHTML =
      fieldWrap("Beschriftung", `<input id="f-caption" value="${escapeHtml(currentContent.caption)}" class="${inputClass}" />`) +
      fieldWrap("Bilder hochladen", `<input id="f-images" type="file" accept="image/*" multiple class="${inputClass}" />`) +
      `<div id="f-gallery-preview" class="flex flex-wrap gap-2 mt-2"></div>`;
    renderGalleryPreview();
    document.getElementById("f-images").addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        try {
          const res = await fetch(`/api/wichtel/${token}/upload`, { method: "POST", body: form });
          if (!res.ok) throw new Error("Upload fehlgeschlagen");
          const data = await res.json();
          currentContent.images.push(data.url);
          renderGalleryPreview();
        } catch(err) {
          alert(err.message);
        }
      }
    });
  } else if (type === "video") {
    typeFields.innerHTML =
      fieldWrap("YouTube-URL", `<input id="f-url" value="${escapeHtml(currentContent.url)}" class="${inputClass}" />`) +
      fieldWrap("Beschriftung", `<input id="f-caption" value="${escapeHtml(currentContent.caption)}" class="${inputClass}" />`);
  } else if (type === "audio") {
    typeFields.innerHTML =
      fieldWrap("Spotify-Link", `<input id="f-url" value="${escapeHtml(currentContent.url)}" class="${inputClass}" />`) +
      fieldWrap("Zusatztext", `<input id="f-message" value="${escapeHtml(currentContent.message)}" class="${inputClass}" />`);
  } else if (type === "link") {
    typeFields.innerHTML =
      fieldWrap("Web-URL", `<input id="f-url" value="${escapeHtml(currentContent.url)}" class="${inputClass}" />`) +
      fieldWrap("Button-Text", `<input id="f-label" value="${escapeHtml(currentContent.label || 'Hier klicken')}" class="${inputClass}" />`);
  } else if (type === "joke") {
    typeFields.innerHTML =
      fieldWrap("Setup / Frage", `<textarea id="f-setup" rows="2" class="${inputClass}">${escapeHtml(currentContent.setup)}</textarea>`) +
      fieldWrap("Punchline / Antwort", `<textarea id="f-punchline" rows="2" class="${inputClass}">${escapeHtml(currentContent.punchline)}</textarea>`);
  } else if (type === "quote") {
    typeFields.innerHTML =
      fieldWrap("Zitat", `<textarea id="f-quote" rows="3" class="${inputClass}">${escapeHtml(currentContent.quote)}</textarea>`) +
      fieldWrap("Autor", `<input id="f-author" value="${escapeHtml(currentContent.author)}" class="${inputClass}" />`);
  } else if (type === "recipe") {
    typeFields.innerHTML =
      fieldWrap("Rezept-Name", `<input id="f-title" value="${escapeHtml(currentContent.title)}" class="${inputClass}" />`) +
      fieldWrap("Zutaten & Anleitung", `<textarea id="f-recipe" rows="5" class="${inputClass}">${escapeHtml(currentContent.recipe)}</textarea>`);
  } else if (type === "countdown") {
    typeFields.innerHTML =
      fieldWrap("Was wird gefeiert?", `<input id="f-eventTitle" value="${escapeHtml(currentContent.eventTitle)}" class="${inputClass}" />`) +
      fieldWrap("Datum (YYYY-MM-DD)", `<input id="f-targetDate" type="date" value="${escapeHtml(currentContent.targetDate)}" class="${inputClass}" />`);
  } else if (type === "challenge") {
    typeFields.innerHTML =
      fieldWrap("Aufgabe / Mutprobe", `<textarea id="f-task" rows="3" class="${inputClass}">${escapeHtml(currentContent.task)}</textarea>`);
  } else if (type === "quiz") {
    typeFields.innerHTML =
      fieldWrap("Frage", `<textarea id="f-question" rows="2" class="${inputClass}">${escapeHtml(currentContent.question)}</textarea>`) +
      fieldWrap("Richtige Antwort", `<input id="f-correct" value="${escapeHtml(currentContent.options ? currentContent.options[0] : '')}" class="${inputClass}" />`) +
      fieldWrap("Falsche Antwort 1", `<input id="f-wrong1" value="${escapeHtml(currentContent.options ? currentContent.options[1] : '')}" class="${inputClass}" />`) +
      fieldWrap("Falsche Antwort 2", `<input id="f-wrong2" value="${escapeHtml(currentContent.options ? currentContent.options[2] : '')}" class="${inputClass}" />`);
  } else if (type === "voucher") {
    typeFields.innerHTML =
      fieldWrap("Gutschein für", `<input id="f-title" value="${escapeHtml(currentContent.title)}" class="${inputClass}" />`) +
      fieldWrap("Code (optional)", `<input id="f-code" value="${escapeHtml(currentContent.code)}" class="${inputClass}" />`) +
      fieldWrap("Beschreibung", `<textarea id="f-description" rows="2" class="${inputClass}">${escapeHtml(currentContent.description)}</textarea>`);
  }
}

function renderGalleryPreview() {
  const preview = document.getElementById("f-gallery-preview");
  if (!preview) return;
  preview.innerHTML = "";
  currentContent.images.forEach((url, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "relative";
    wrap.innerHTML = `<img src="${url}" class="w-16 h-16 object-cover rounded-lg border border-white/10" />`;
    preview.appendChild(wrap);
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = typeSelect.value;
  let content = {};
  
  if (type === "text") {
    content = { message: document.getElementById("f-message").value, sender: document.getElementById("f-sender").value };
  } else if (type === "gallery") {
    content = { caption: document.getElementById("f-caption").value, images: currentContent.images };
  } else if (type === "video") {
    content = { url: document.getElementById("f-url").value, caption: document.getElementById("f-caption").value };
  } else if (type === "audio") {
    content = { url: document.getElementById("f-url").value, message: document.getElementById("f-message").value };
  } else if (type === "link") {
    content = { url: document.getElementById("f-url").value, label: document.getElementById("f-label").value };
  } else if (type === "joke") {
    content = { setup: document.getElementById("f-setup").value, punchline: document.getElementById("f-punchline").value };
  } else if (type === "quote") {
    content = { quote: document.getElementById("f-quote").value, author: document.getElementById("f-author").value };
  } else if (type === "recipe") {
    content = { title: document.getElementById("f-title").value, recipe: document.getElementById("f-recipe").value };
  } else if (type === "countdown") {
    content = { eventTitle: document.getElementById("f-eventTitle").value, targetDate: document.getElementById("f-targetDate").value };
  } else if (type === "challenge") {
    content = { task: document.getElementById("f-task").value };
  } else if (type === "quiz") {
    content = { 
      question: document.getElementById("f-question").value, 
      options: [
        document.getElementById("f-correct").value,
        document.getElementById("f-wrong1").value,
        document.getElementById("f-wrong2").value
      ].filter(Boolean)
    };
  } else if (type === "voucher") {
    content = { title: document.getElementById("f-title").value, code: document.getElementById("f-code").value, description: document.getElementById("f-description").value };
  }
  
  document.getElementById("save-btn").disabled = true;
  document.getElementById("save-btn").textContent = "Speichere...";
  
  try {
    const res = await fetch(`/api/wichtel/${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: type, content })
    });
    if (!res.ok) throw new Error("Speichern fehlgeschlagen.");
    document.getElementById("success-msg").classList.remove("hidden");
    document.getElementById("save-btn").textContent = "Türchen speichern";
    document.getElementById("save-btn").disabled = false;
  } catch (err) {
    alert(err.message);
    document.getElementById("save-btn").disabled = false;
    document.getElementById("save-btn").textContent = "Türchen speichern";
  }
});

init();
