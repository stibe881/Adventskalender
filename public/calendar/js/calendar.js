const pathParts = window.location.pathname.split("/").filter(Boolean); // ["c", "TOKEN"] or ["c","preview","ID"]
const isPreview = pathParts[1] === "preview";
const routeId = isPreview ? pathParts[2] : pathParts[1];

const CONTENT_ICONS = {
  text: "💌",
  voucher: "🎟️",
  qrcode: "📱",
  video: "🎬",
  audio: "🎵",
  gallery: "🖼️",
  scratchcard: "🎰",
  quiz: "❓",
  countdown: "⏳",
  empty: "🎄",
};

let calendarMeta = null;
let days = []; // { day, unlockDate, unlocked, opened, filled, contentType, content }
let themeKey = null;
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

  themeKey = calendarMeta.theme;
  theme = getThemeConfig(themeKey);
  document.body.setAttribute("data-theme", themeKey);
  document.title = `${calendarMeta.recipientName}s Adventskalender`;

  document.getElementById("scene").innerHTML = buildScene(themeKey);
  document.getElementById("garland").innerHTML = buildGarlandForTheme(themeKey);
  renderHeader(themeKey, theme, calendarMeta);
  renderFooter(calendarMeta);
  if (isPreview) document.getElementById("preview-banner").classList.remove("hidden");

  field = new ParticleField(canvas);
  field.setAmbient(theme.ambient);
  field.start();

  renderDoorGrid();
  animateEntrance();
}

function renderFatalError(err) {
  document.body.setAttribute("data-theme", "modern");
  document.getElementById("app-root").innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px">
      <div>
        <div style="font-size:3rem;margin-bottom:12px">🔒</div>
        <h1 class="modal-title" style="margin-bottom:8px">${err.status === 401 ? "Bitte anmelden" : "Kalender nicht gefunden"}</h1>
        <p class="modal-muted">${err.status === 401 ? "Diese Vorschau ist nur für den Schenker sichtbar." : "Der Link ist ungültig oder der Kalender wurde entfernt."}</p>
        ${err.status === 401 ? '<a href="/admin/" style="display:inline-block;margin-top:16px;padding:8px 16px;background:#151515;color:#fff;border-radius:6px;text-decoration:none">Zum Login</a>' : ""}
      </div>
    </div>
  `;
}

// ---------- Grid ----------

function renderDoorGrid() {
  doorGrid.innerHTML = "";
  const order = theme.order || days.map((d) => d.day);

  order.forEach((dayNum, index) => {
    const door = days.find((d) => d.day === dayNum);
    if (!door) return;

    const scene = document.createElement("div");
    scene.className = "door-scene";
    scene.dataset.day = door.day;
    scene.style.setProperty("--i", index);

    const span = theme.spans?.[door.day];
    if (span) scene.classList.add(`span-${span}`);

    const tilt = theme.tilt ? ((seeded(door.day) * 2 - 1) * theme.tilt).toFixed(2) : 0;
    scene.style.setProperty("--tilt", `${tilt}deg`);

    if (theme.palette) {
      scene.style.setProperty("--house", theme.palette[(door.day * 5) % theme.palette.length]);
    }

    scene.innerHTML = `
      <div class="door-body">
        <div class="door-interior"><span class="interior-icon"></span></div>
        <div class="door-leaf">
          <div class="leaf-front">
            <span class="door-number">${door.day}</span>
            <span class="door-lock">🔒</span>
          </div>
          <div class="leaf-back"></div>
        </div>
      </div>
    `;

    scene.addEventListener("click", () => handleDoorClick(door.day, scene));
    doorGrid.appendChild(scene);
    applyDoorState(scene, door);
  });

  fitGridCells();
}

function applyDoorState(scene, door) {
  scene.classList.toggle("is-locked", !door.unlocked);
  scene.classList.toggle("is-ready", door.unlocked && !door.opened);
  scene.classList.toggle("is-open", Boolean(door.opened));
  scene.querySelector(".interior-icon").textContent = door.opened
    ? CONTENT_ICONS[door.contentType] || CONTENT_ICONS.empty
    : theme.interiorIcon;
  scene.setAttribute(
    "aria-label",
    door.unlocked ? `Türchen ${door.day}${door.opened ? " (geöffnet)" : ""}` : `Türchen ${door.day}, gesperrt bis ${formatDateDe(door.unlockDate)}`
  );
}

// Rows are sized to match column width so spans stay square-based.
function fitGridCells() {
  const styles = getComputedStyle(doorGrid);
  const cols = styles.gridTemplateColumns.split(" ").length;
  const gap = parseFloat(styles.columnGap) || 0;
  const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const width = doorGrid.clientWidth - padX;
  const cell = (width - gap * (cols - 1)) / cols;
  document.documentElement.style.setProperty("--cell", `${Math.max(40, cell)}px`);
}
new ResizeObserver(() => fitGridCells()).observe(doorGrid);

function animateEntrance() {
  if (!window.gsap) return;
  gsap.from("#calendar-header > *", { opacity: 0, y: 14, duration: 0.7, stagger: 0.08, ease: "power2.out" });
  gsap.from(".door-scene", {
    opacity: 0,
    y: 26,
    scale: 0.92,
    duration: 0.55,
    stagger: { each: 0.028, from: "random" },
    ease: "back.out(1.5)",
    delay: 0.15,
    clearProps: "transform",
  });
}

// ---------- Interaction ----------

async function handleDoorClick(dayNum, sceneEl) {
  const door = days.find((d) => d.day === dayNum);

  if (!door.unlocked) {
    shakeDoor(sceneEl);
    showLockToast(`🔒 Noch nicht so weit! Türchen ${dayNum} öffnet sich am ${formatDateDe(door.unlockDate)}.`);
    return;
  }

  if (door.opened) {
    openContentModal(door);
    return;
  }

  try {
    const result = isPreview
      ? { contentType: door.contentType || "empty", content: door.content }
      : await fetchJson(`/api/calendar/${routeId}/days/${dayNum}/open`, { method: "POST" });
    door.opened = true;
    door.contentType = result.contentType;
    door.content = result.content;
  } catch (err) {
    if (err.status === 403) {
      door.unlocked = false;
      applyDoorState(sceneEl, door);
      shakeDoor(sceneEl);
      showLockToast(`🔒 ${err.data.error}`);
      return;
    }
    showLockToast(`⚠️ ${err.message}`);
    return;
  }

  openDoorAnimation(sceneEl, door);
}

function shakeDoor(sceneEl) {
  sceneEl.classList.remove("is-shaking");
  void sceneEl.offsetWidth; // restart animation
  sceneEl.classList.add("is-shaking");
  sceneEl.addEventListener("animationend", () => sceneEl.classList.remove("is-shaking"), { once: true });
}

let toastTimeout = null;
function showLockToast(message) {
  lockToast.textContent = message;
  lockToast.classList.remove("hidden", "opacity-0");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    lockToast.classList.add("opacity-0");
    setTimeout(() => lockToast.classList.add("hidden"), 300);
  }, 3400);
}

function openDoorAnimation(sceneEl, door) {
  const rect = sceneEl.getBoundingClientRect();
  applyDoorState(sceneEl, door);
  setTimeout(() => field.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, theme.burstColors), 380);
  setTimeout(() => openContentModal(door), 780);
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
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !contentModal.classList.contains("hidden")) closeContentModal();
});

function closeContentModal() {
  contentModal.classList.remove("modal-visible");
  clearInterval(countdownInterval);
  setTimeout(() => contentModal.classList.add("hidden"), 200);
}

function cardWrap(icon, title, innerHtml) {
  return `
    <div class="modal-head">
      <div class="modal-icon">${icon}</div>
      ${title ? `<h3 class="modal-title">${escapeHtml(title)}</h3>` : ""}
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
        `<p class="modal-text">${escapeHtml(c.message)}</p>
         ${c.sender ? `<p class="modal-sender">– ${escapeHtml(c.sender)}</p>` : ""}`
      );

    case "voucher":
      return cardWrap(
        "🎟️",
        c.title || "Gutschein",
        `<div class="voucher-box">
          ${c.code ? `<div class="voucher-code">${escapeHtml(c.code)}</div>` : ""}
          <div class="modal-muted">${escapeHtml(c.description)}</div>
        </div>`
      );

    case "qrcode":
      return cardWrap(
        "📱",
        c.label || "Scan mich",
        c.qrImage ? `<img src="${c.qrImage}" class="qr-img" alt="QR-Code" />` : `<p class="modal-muted">${escapeHtml(c.data)}</p>`
      );

    case "video":
      return cardWrap(
        "🎬",
        c.caption,
        `<div class="media-frame">
          <iframe src="${toVideoEmbed(c.url)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>`
      );

    case "audio": {
      if (c.mode === "spotify") {
        const embed = toSpotifyEmbed(c.spotifyUrl);
        return cardWrap(
          "🎵",
          c.title,
          embed
            ? `<iframe src="${embed}" width="100%" height="152" style="border:0;border-radius:12px" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`
            : `<p class="modal-muted">Spotify-Link konnte nicht eingebettet werden.</p>`
        );
      }
      return cardWrap(
        "🎵",
        c.title,
        c.fileUrl ? `<audio controls autoplay class="audio-player"><source src="${c.fileUrl}" /></audio>` : `<p class="modal-muted">Keine Audiodatei hinterlegt.</p>`
      );
    }

    case "gallery":
      return cardWrap(
        "🖼️",
        c.caption,
        `<div class="gallery-grid">${(c.images || []).map((url) => `<img src="${url}" class="gallery-img" alt="" />`).join("")}</div>`
      );

    case "scratchcard":
      return cardWrap(
        "🎰",
        null,
        `<div class="scratch-wrap">
          <div class="scratch-under">${escapeHtml(c.message)}</div>
          <canvas id="scratch-canvas"></canvas>
        </div>
        <p class="modal-muted" style="margin-top:10px">${escapeHtml(c.revealLabel || "Hier rubbeln!")}</p>`
      );

    case "quiz":
      return cardWrap(
        "❓",
        c.question,
        `<div id="quiz-options">
          ${(c.options || []).map((opt, i) => `<button data-idx="${i}" class="quiz-option">${escapeHtml(opt)}</button>`).join("")}
        </div>
        <p id="quiz-result" class="quiz-result hidden"></p>`
      );

    case "countdown":
      return cardWrap(
        "⏳",
        c.eventTitle,
        `<p class="modal-muted" style="margin-bottom:12px">${escapeHtml(c.description)}</p>
         <div id="countdown-display" class="countdown-num">…</div>`
      );

    case "empty":
    default:
      return cardWrap("🎄", null, `<p class="modal-muted">Für Türchen ${dayNum} wurde noch keine Überraschung hinterlegt.</p>`);
  }
}

function wireContentInteractions(door) {
  const c = door.content || {};

  if (door.contentType === "gallery") {
    modalBody.querySelectorAll(".gallery-img").forEach((img) => {
      img.addEventListener("click", () => window.open(img.src, "_blank"));
    });
  }
  if (door.contentType === "scratchcard") setupScratchcard();
  if (door.contentType === "quiz") setupQuiz(c);

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

  ctx.fillStyle = getComputedColor("--scratch") || "#888";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("✨ Rubbeln zum Aufdecken ✨", canvasEl.width / 2, canvasEl.height / 2 + 6);

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
  const revealPercent = () => {
    const data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
    let cleared = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 16) {
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
    if (revealPercent() > 0.55) {
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
      btn.classList.add(correct ? "correct" : "wrong");
      if (!correct && c.correctIndex >= 0 && c.correctIndex < buttons.length) {
        buttons[c.correctIndex].classList.add("correct");
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
        const m = u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
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
    const id = parts[parts.indexOf(type) + 1];
    if (!type || !id) return null;
    return `https://open.spotify.com/embed/${type}/${id}`;
  } catch (e) {
    return null;
  }
}

init();
