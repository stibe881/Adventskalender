const pathParts = window.location.pathname.split("/").filter(Boolean); // ["c", "TOKEN"] or ["c","preview","ID"]
const isPreview = pathParts[1] === "preview";
const routeId = isPreview ? pathParts[2] : pathParts[1];

let calendarMeta = null;
let days = []; // unified shape: { day, unlockDate, unlocked, opened, filled, contentType, content }
let theme = null;
let field = null;
let countdownInterval = null;

const doorGrid = document.getElementById("door-grid");
const canvas = document.getElementById("particle-canvas");
const lockToast = document.getElementById("lock-toast");
const contentModal = document.getElementById("content-modal");
const modalBody = document.getElementById("modal-body");

async function fetchJson(url, opts) {
  const res = await fetch(url, { credentials: "include", ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Fehler ${res.status}`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function init() {
  try {
    if (isPreview) {
      const data = await fetchJson(`/api/admin/calendars/${routeId}/preview`);
      calendarMeta = data;
      days = data.days.map((d) => ({ ...d, unlocked: true }));
    } else {
      const data = await fetchJson(`/api/calendar/${routeId}`);
      calendarMeta = data;
      days = data.days;
    }
  } catch (err) {
    renderFatalError(err);
    return;
  }

  theme = getThemeConfig(calendarMeta.theme);
  document.body.setAttribute("data-theme", calendarMeta.theme);
  document.getElementById("recipient-name").textContent = calendarMeta.recipientName;
  document.getElementById("owner-name").textContent = calendarMeta.ownerName;
  document.getElementById("theme-icon").textContent = theme.greetingIcon;
  if (isPreview) {
    document.getElementById("preview-banner").classList.remove("hidden");
  }

  field = new ParticleField(canvas);
  field.setAmbient(theme.ambient);
  field.start();

  renderDoorGrid();
}

function renderFatalError(err) {
  document.getElementById("app-root").innerHTML = `
    <div class="min-h-screen flex items-center justify-center px-4 text-center">
      <div>
        <div class="text-5xl mb-4">🔒</div>
        <h1 class="text-xl font-semibold text-white mb-2">${err.status === 401 ? "Bitte anmelden" : "Kalender nicht gefunden"}</h1>
        <p class="text-slate-400 max-w-sm">${err.status === 401 ? "Diese Vorschau ist nur für den Schenker sichtbar." : "Der Link ist ungültig oder der Kalender wurde entfernt."}</p>
        ${err.status === 401 ? '<a href="/admin/" class="inline-block mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-white text-sm">Zum Login</a>' : ""}
      </div>
    </div>
  `;
}

function renderDoorGrid() {
  doorGrid.innerHTML = "";
  days.forEach((door) => {
    const scene = document.createElement("div");
    scene.className = "door-scene aspect-square";
    scene.dataset.day = door.day;

    const stateClasses = !door.unlocked
      ? "opacity-60 saturate-50 cursor-not-allowed"
      : door.opened
      ? "cursor-pointer"
      : "cursor-pointer animate-pulse-glow";

    scene.innerHTML = `
      <div class="door-panel relative w-full h-full ${stateClasses}">
        <div class="door-face absolute inset-0 rounded-xl border border-white/10 flex flex-col items-center justify-center gap-1 shadow-lg"
             style="background: linear-gradient(150deg, var(--theme-door), color-mix(in srgb, var(--theme-door) 60%, black));">
          <span class="text-xl sm:text-2xl">${door.unlocked ? theme.doorClosedIcon : "🔒"}</span>
          <span class="text-sm sm:text-lg font-bold" style="color: var(--theme-text)">${door.day}</span>
        </div>
        <div class="door-face door-back absolute inset-0 rounded-xl border border-white/10 flex items-center justify-center"
             style="background: var(--theme-door-open); color: #1a1a1a;">
          <span class="text-2xl">✓</span>
        </div>
      </div>
    `;

    scene.addEventListener("click", () => handleDoorClick(door.day, scene));
    doorGrid.appendChild(scene);
  });
}

async function handleDoorClick(dayNum, sceneEl) {
  const door = days.find((d) => d.day === dayNum);
  const panel = sceneEl.querySelector(".door-panel");

  if (!door.unlocked) {
    shakeDoor(panel);
    showLockToast(`🔒 Noch nicht so weit! Türchen ${dayNum} öffnet sich am ${formatDateDe(door.unlockDate)}.`);
    return;
  }

  if (!door.opened) {
    try {
      const result = isPreview ? { contentType: door.contentType || "empty", content: door.content } : await fetchJson(`/api/calendar/${routeId}/days/${dayNum}/open`, { method: "POST" });
      door.opened = true;
      door.contentType = result.contentType;
      door.content = result.content;
    } catch (err) {
      if (err.status === 403) {
        shakeDoor(panel);
        showLockToast(`🔒 ${err.data.error}`);
        return;
      }
      showLockToast(`⚠️ ${err.message}`);
      return;
    }
  }

  openDoorAnimation(panel, sceneEl);
}

function shakeDoor(panel) {
  panel.classList.remove("animate-shake");
  // eslint-disable-next-line no-unused-expressions
  void panel.offsetWidth; // restart animation
  panel.classList.add("animate-shake");
}

let toastTimeout = null;
function showLockToast(message) {
  lockToast.textContent = message;
  lockToast.classList.remove("hidden", "opacity-0");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    lockToast.classList.add("opacity-0");
    setTimeout(() => lockToast.classList.add("hidden"), 300);
  }, 3200);
}

function openDoorAnimation(panel, sceneEl) {
  const rect = sceneEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  panel.classList.add("is-open");
  field.burst(cx, cy, theme.burstColors);

  if (window.gsap) {
    gsap.fromTo(panel, { scale: 1 }, { scale: 1.06, duration: 0.35, yoyo: true, repeat: 1, ease: "power1.inOut" });
  }

  const door = days.find((d) => String(d.day) === String(sceneEl.dataset.day));
  renderDoorGrid(); // refresh checkmark state
  setTimeout(() => openContentModal(door), 450);
}

function formatDateDe(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ---------- Content modal ----------

function openContentModal(door) {
  modalBody.innerHTML = renderContent(door.contentType, door.content, door.day);
  contentModal.classList.remove("hidden");
  requestAnimationFrame(() => contentModal.classList.add("modal-visible"));
  if (window.gsap) {
    gsap.fromTo("#modal-card", { y: 30, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" });
  }
  wireContentInteractions(door);
}

document.getElementById("modal-close").addEventListener("click", closeContentModal);
contentModal.addEventListener("click", (e) => {
  if (e.target === contentModal) closeContentModal();
});

function closeContentModal() {
  contentModal.classList.remove("modal-visible");
  clearInterval(countdownInterval);
  setTimeout(() => contentModal.classList.add("hidden"), 200);
}

function cardWrap(icon, title, innerHtml) {
  return `
    <div class="text-center mb-4">
      <div class="text-4xl mb-2">${icon}</div>
      ${title ? `<h3 class="font-display text-xl font-semibold" style="color:var(--theme-text)">${escapeHtml(title)}</h3>` : ""}
    </div>
    ${innerHtml}
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function renderContent(type, c, dayNum) {
  c = c || {};
  switch (type) {
    case "text":
      return cardWrap(
        "💌",
        null,
        `<p class="text-lg leading-relaxed whitespace-pre-wrap">${escapeHtml(c.message)}</p>
         ${c.sender ? `<p class="text-right text-sm mt-4 opacity-70">– ${escapeHtml(c.sender)}</p>` : ""}`
      );

    case "voucher":
      return cardWrap(
        "🎟️",
        c.title || "Gutschein",
        `<div class="border-2 border-dashed rounded-xl p-4 text-center" style="border-color: var(--theme-accent)">
          ${c.code ? `<p class="font-mono text-xl tracking-widest mb-1" style="color: var(--theme-accent)">${escapeHtml(c.code)}</p>` : ""}
          <p class="text-sm opacity-80">${escapeHtml(c.description)}</p>
        </div>`
      );

    case "qrcode":
      return cardWrap(
        "📱",
        c.label || "Scan mich",
        `<div class="flex justify-center">
          ${c.qrImage ? `<img src="${c.qrImage}" class="w-48 h-48 rounded-xl bg-white p-2" alt="QR-Code" />` : `<p class="text-sm opacity-70">${escapeHtml(c.data)}</p>`}
        </div>`
      );

    case "video": {
      const embed = toVideoEmbed(c.url);
      return cardWrap(
        "🎬",
        c.caption,
        `<div class="aspect-video rounded-xl overflow-hidden bg-black">
          <iframe src="${embed}" class="w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>`
      );
    }

    case "audio": {
      if (c.mode === "spotify") {
        const embed = toSpotifyEmbed(c.spotifyUrl);
        return cardWrap(
          "🎵",
          c.title,
          embed
            ? `<iframe src="${embed}" width="100%" height="152" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" class="rounded-xl"></iframe>`
            : `<p class="text-sm opacity-70 text-center">Spotify-Link konnte nicht eingebettet werden.</p>`
        );
      }
      return cardWrap(
        "🎵",
        c.title,
        c.fileUrl
          ? `<audio controls autoplay class="w-full"><source src="${c.fileUrl}" /></audio>`
          : `<p class="text-sm opacity-70 text-center">Keine Audiodatei hinterlegt.</p>`
      );
    }

    case "gallery":
      return cardWrap(
        "🖼️",
        c.caption,
        `<div class="grid grid-cols-2 gap-2">
          ${(c.images || []).map((url) => `<img src="${url}" class="rounded-lg w-full h-28 object-cover cursor-zoom-in gallery-img" />`).join("")}
        </div>`
      );

    case "scratchcard":
      return cardWrap(
        "🎰",
        null,
        `<div class="relative rounded-xl overflow-hidden" style="height:160px">
          <div class="absolute inset-0 flex items-center justify-center text-center p-4 text-lg font-medium">${escapeHtml(c.message)}</div>
          <canvas id="scratch-canvas" class="absolute inset-0 w-full h-full scratch-surface"></canvas>
        </div>
        <p class="text-center text-xs opacity-70 mt-2">${escapeHtml(c.revealLabel || "Hier rubbeln!")}</p>`
      );

    case "quiz":
      return cardWrap(
        "❓",
        c.question,
        `<div id="quiz-options" class="space-y-2">
          ${(c.options || [])
            .map(
              (opt, i) =>
                `<button data-idx="${i}" class="quiz-option w-full text-left rounded-lg border border-white/15 px-4 py-2 hover:bg-white/10 transition-colors">${escapeHtml(opt)}</button>`
            )
            .join("")}
        </div>
        <p id="quiz-result" class="mt-3 text-center text-sm font-medium hidden"></p>`
      );

    case "countdown":
      return cardWrap(
        "⏳",
        c.eventTitle,
        `<p class="text-center text-sm opacity-80 mb-3">${escapeHtml(c.description)}</p>
         <div id="countdown-display" class="text-center text-2xl font-mono font-bold" style="color:var(--theme-accent)">…</div>`
      );

    case "empty":
    default:
      return cardWrap("🎄", null, `<p class="text-center opacity-70">Für Türchen ${dayNum} wurde noch keine Überraschung hinterlegt.</p>`);
  }
}

function wireContentInteractions(door) {
  const c = door.content || {};

  if (door.contentType === "gallery") {
    modalBody.querySelectorAll(".gallery-img").forEach((img) => {
      img.addEventListener("click", () => window.open(img.src, "_blank"));
    });
  }

  if (door.contentType === "scratchcard") {
    setupScratchcard();
  }

  if (door.contentType === "quiz") {
    setupQuiz(c);
  }

  if (door.contentType === "countdown" && c.eventDate) {
    const target = new Date(`${c.eventDate}T00:00:00`).getTime();
    const el = document.getElementById("countdown-display");
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        el.textContent = "Es ist soweit! 🎉";
        clearInterval(countdownInterval);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.textContent = `${d}T ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };
    tick();
    countdownInterval = setInterval(tick, 1000);
  }
}

function setupScratchcard() {
  const canvasEl = document.getElementById("scratch-canvas");
  const ctx = canvasEl.getContext("2d");
  const parent = canvasEl.parentElement;
  canvasEl.width = parent.clientWidth;
  canvasEl.height = parent.clientHeight;

  ctx.fillStyle = getComputedColor("--theme-primary") || "#8e1537";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("✨ Rubbeln zum Aufdecken ✨", canvasEl.width / 2, canvasEl.height / 2);

  let revealed = false;
  let drawing = false;

  const scratchAt = (x, y) => {
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
  };

  const posFromEvent = (e) => {
    const rect = canvasEl.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const checkRevealPercent = () => {
    const data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
    let cleared = 0;
    const step = 16; // sample every 4th pixel (RGBA)
    let total = 0;
    for (let i = 3; i < data.length; i += step) {
      total++;
      if (data[i] === 0) cleared++;
    }
    return cleared / total;
  };

  const start = (e) => {
    drawing = true;
    const { x, y } = posFromEvent(e);
    scratchAt(x, y);
  };
  const move = (e) => {
    if (!drawing || revealed) return;
    e.preventDefault();
    const { x, y } = posFromEvent(e);
    scratchAt(x, y);
    if (checkRevealPercent() > 0.55) {
      revealed = true;
      canvasEl.style.transition = "opacity 0.5s ease";
      canvasEl.style.opacity = "0";
      canvasEl.style.pointerEvents = "none";
      const rect = canvasEl.getBoundingClientRect();
      field.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, theme.burstColors);
    }
  };
  const end = () => (drawing = false);

  canvasEl.addEventListener("mousedown", start);
  canvasEl.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvasEl.addEventListener("touchstart", start, { passive: true });
  canvasEl.addEventListener("touchmove", move, { passive: false });
  canvasEl.addEventListener("touchend", end);
}

function getComputedColor(varName) {
  return getComputedStyle(document.body).getPropertyValue(varName)?.trim();
}

function setupQuiz(c) {
  const buttons = modalBody.querySelectorAll(".quiz-option");
  const resultEl = document.getElementById("quiz-result");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => (b.disabled = true));
      const idx = parseInt(btn.dataset.idx, 10);
      const correct = idx === c.correctIndex;
      btn.classList.add(correct ? "bg-emerald-600/40" : "bg-rose-600/40");
      if (!correct && c.correctIndex >= 0 && c.correctIndex < buttons.length) {
        buttons[c.correctIndex].classList.add("bg-emerald-600/40");
      }
      resultEl.textContent = correct ? c.successMessage || "Richtig! 🎉" : c.failMessage || "Leider falsch – aber schön geraten!";
      resultEl.classList.remove("hidden");
      if (correct) {
        const rect = btn.getBoundingClientRect();
        field.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, theme.burstColors);
      }
    });
  });
}

function toVideoEmbed(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu")) {
      let id = u.searchParams.get("v");
      if (!id && u.hostname.includes("youtu.be")) id = u.pathname.slice(1);
      if (!id) {
        const m = u.pathname.match(/\/embed\/([^/?]+)/);
        if (m) id = m[1];
      }
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : url;
    }
    if (u.hostname.includes("vimeo")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : url;
    }
  } catch (e) {
    /* fall through */
  }
  return url;
}

function toSpotifyEmbed(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("spotify")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const type = parts.find((p) => ["track", "album", "playlist", "episode"].includes(p));
    const idx = parts.indexOf(type);
    const id = parts[idx + 1];
    if (!type || !id) return null;
    return `https://open.spotify.com/embed/${type}/${id}`;
  } catch (e) {
    return null;
  }
}

init();
