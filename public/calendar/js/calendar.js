const pathParts = window.location.pathname.split("/").filter(Boolean); // ["c", "TOKEN"] or ["c","preview","ID"]
const isPreview = pathParts[1] === "preview";
// routeId is resolved either from the URL (/c/:token) or,
// for custom-domain deployments, fetched from the server by Host header.
let routeId = isPreview ? pathParts[2] : pathParts[1];
// Will be replaced before init() runs if we're on a custom domain (no token in URL).
async function resolveRouteId() {
  if (routeId) return; // already have a token from the URL
  try {
    const data = await fetch("/api/calendar/by-domain", { credentials: "include" }).then(r => r.json());
    if (data.token) {
      routeId = data.token;
    } else {
      document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a1a;color:#fff;font-family:sans-serif;text-align:center;padding:2rem;"><div><h1 style="font-size:2rem;margin-bottom:1rem">🎄 Kalender nicht gefunden</h1><p style="color:#94a3b8;">Diese Domain ist keinem Adventskalender zugeordnet.</p></div></div>`;
    }
  } catch (e) {
    console.error("Custom domain resolution failed:", e);
  }
}
const params = new URLSearchParams(window.location.search);
const isRef = params.get("ref") === "1";

let calendarMeta = null;
let days = []; // { day, unlockDate, unlocked, opened, filled, contentType, content }
let themeKey = null;
let theme = null;
let field = null;
let countdownInterval = null;
let socket = null;
let partnerReady = {}; // Track which days partner is ready to open
let pendingBody = {}; // Track request bodies for doors waiting to open

const doorGrid = document.getElementById("door-grid");
const canvas = document.getElementById("particle-canvas");
const lockToast = document.getElementById("lock-toast");
const contentModal = document.getElementById("content-modal");
const modalBody = document.getElementById("modal-body");

async function fetchJson(url, opts = {}) {
  const pwd = sessionStorage.getItem(`calendar_pwd_${routeId}`);
  if (pwd) {
    opts.headers = { ...opts.headers, "X-Calendar-Password": pwd };
  }
  
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

let effectsEnabled = true;

let userCoins = 0;
let userInventory = [];

function updateCoinDisplay() {
  const cd = document.getElementById("coin-display");
  if (cd) cd.textContent = userCoins;
  const sb = document.getElementById("shop-balance");
  if (sb) sb.textContent = userCoins;
  
  // Sync to leaderboard if name is set
  const lbName = localStorage.getItem("lb_name");
  if (lbName && typeof routeId !== "undefined") {
    fetchJson(`/api/calendar/${routeId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: lbName, game: "Gesamt-Münzen", score: userCoins, day: "Alle" })
    }).catch(() => {});
  }
}

function saveUserCoins() {
  localStorage.setItem(`coins_${routeId}`, userCoins);
  updateCoinDisplay();
}

function updateProgress() {
  const progressContainer = document.getElementById("progress-container");
  const progressText = document.getElementById("progress-text");
  const progressBar = document.getElementById("progress-bar");
  
  if (!progressContainer || !days || days.length === 0) return;
  
  // Show it once we have data
  progressContainer.classList.remove("hidden");
  
  const filledDays = days.filter(d => d.contentType && d.contentType !== "none").length;
  if (filledDays === 0) return; // Don't show progress if calendar is empty
  
  const openedDays = days.filter(d => d.opened).length;
  const percent = Math.round((openedDays / filledDays) * 100);
  
  progressText.textContent = `${openedDays}/${filledDays} Türchen geöffnet`;
  progressBar.style.width = `${percent}%`;
}

async function init() {
  userCoins = parseInt(localStorage.getItem(`coins_${routeId}`) || "0", 10);
  try { userInventory = JSON.parse(localStorage.getItem(`inventory_${routeId}`) || "[]"); } catch(e) {}
  updateCoinDisplay();
  try {
    if (isPreview) {
      const data = await fetchJson(`/api/admin/calendars/${routeId}/preview`);
      calendarMeta = data;
      days = data.days.map((d) => ({ ...d, unlocked: true }));
    } else {
      if (isRef) {
        // Increment referral logic silently
        fetchJson(`/api/calendar/${routeId}/refer`, { method: "POST" }).catch(console.error);
        
        // Remove ?ref=1 from URL so they can share their own clean link
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      
      const user = localStorage.getItem(`adventskalender_user_${routeId}`) || "";
      const data = await fetchJson(`/api/calendar/${routeId}?user=${encodeURIComponent(user)}`);
      
      if (data.companyMode && !user) {
        showCorporateLoginModal(data);
        return;
      }
      
      if (data.companyMode && user) {
        // Add a small logout button to the top right
        const logoutBtn = document.createElement("button");
        logoutBtn.className = "fixed top-4 right-4 bg-slate-800/80 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-full z-50 backdrop-blur-sm border border-white/10";
        logoutBtn.innerHTML = `Als ${user} abmelden`;
        logoutBtn.onclick = () => {
          localStorage.removeItem(`adventskalender_user_${routeId}`);
          window.location.reload();
        };
        document.body.appendChild(logoutBtn);
      }
      
      calendarMeta = data;
      days = data.days;
    }
  } catch (err) {
    if (err.data && err.data.requirePassword) {
      document.body.setAttribute("data-theme", "modern");
      document.getElementById("app-root").innerHTML = `
        <div class="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-white">
          <div class="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl p-6 text-center border border-white/10">
            <div class="text-5xl mb-4">🔒</div>
            <h1 class="text-xl font-bold mb-2">Passwort erforderlich</h1>
            <p class="text-sm text-slate-400 mb-6">Dieser Kalender ist durch ein Passwort geschützt.</p>
            <form id="pwd-form" class="flex flex-col gap-3">
              <input type="password" id="pwd-input" class="rounded-lg bg-slate-900 border border-white/10 px-4 py-3 text-center text-lg focus:outline-none focus:border-emerald-500" placeholder="Passwort eingeben..." required />
              <button type="submit" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg">Entsperren</button>
            </form>
          </div>
        </div>
      `;
      document.getElementById("pwd-form").addEventListener("submit", (e) => {
        e.preventDefault();
        sessionStorage.setItem(`calendar_pwd_${routeId}`, document.getElementById("pwd-input").value);
        window.location.reload();
      });
      return;
    }
    renderFatalError(err);
    return;
  }
  
  if (calendarMeta.referrals >= 3 && !days.find(d => d.day === 25)) {
    days.push({
      day: 25,
      unlocked: true,
      opened: false,
      filled: true,
      contentType: "text",
      content: { message: "Wahnsinn! Du hast 3 Freunde eingeladen! Als Dankeschön: Hier ist dein geheimes 25. Türchen 🎄✨", sender: "Team Adventskalender" }
    });
  }

  themeKey = calendarMeta.theme;
  theme = getThemeConfig(themeKey);
  document.body.setAttribute("data-theme", themeKey);
  document.title = `${calendarMeta.recipientName}s Adventskalender`;

  document.getElementById("scene").innerHTML = buildScene(themeKey, calendarMeta);
  renderGarland();
  renderHeader(themeKey, theme, calendarMeta);
  renderFooter(calendarMeta);
  if (isPreview) {
    document.getElementById("preview-banner").classList.remove("hidden");
  }

  // Load economy
  userCoins = parseInt(localStorage.getItem(`coins_${routeId}`) || "0", 10);
  try {
    userInventory = JSON.parse(localStorage.getItem(`inventory_${routeId}`) || "[]");
  } catch(e) { userInventory = []; }
  
  updateCoinDisplay();
  
  field = new ParticleField(canvas);
  field.setAmbient(theme.ambient);
  field.start();
  
  if (calendarMeta.customConfig && calendarMeta.customConfig.snowfall) {
    const snowContainer = document.createElement("div");
    snowContainer.className = "snow-container pointer-events-none fixed inset-0 z-50 overflow-hidden";
    for (let i = 0; i < 50; i++) {
      const flake = document.createElement("div");
      flake.className = "snow";
      flake.style.left = `${Math.random() * 100}vw`;
      flake.style.animationDuration = `${Math.random() * 6 + 6}s`;
      flake.style.animationDelay = `${Math.random() * 8}s`;
      flake.style.opacity = Math.random() * 0.5 + 0.3;
      snowContainer.appendChild(flake);
    }
    document.body.appendChild(snowContainer);
  }

  applyEffects(localStorage.getItem(`effects_${routeId}`) !== "0");
  document.getElementById("toggle-effects-btn").addEventListener("click", () => applyEffects(!effectsEnabled));

  // The shop only makes sense when the calendar hands out coins somewhere.
  document.getElementById("shop-btn").classList.toggle("hidden", !calendarMeta.hasCoins);
  
  if (typeof io !== "undefined") {
    socket = io();
    socket.emit("join_calendar", routeId);
    
    socket.on("trigger_push", (data) => {
      if (Notification.permission === "granted") {
        new Notification("Kalender Update", { body: data.message, icon: "/icons/icon-192x192.png" });
      } else {
        alert("WICHTIGE NACHRICHT:\n" + data.message);
      }
    });

    socket.on("partner_ready", (day) => {
      partnerReady[day] = true;
      showLockToast(`Dein Partner ist bereit, Türchen ${day} zu öffnen!`);
      // Update UI if we were already waiting
      const el = document.querySelector(`.door-scene[data-day="${day}"]`);
      if (el && el.dataset.waiting === "true") {
        el.dataset.waiting = "false";
        tryOpenDoor(day, el, pendingBody[day] || {});
        delete pendingBody[day];
      }
    });
    
    socket.on("door_opened_sync", (data) => {
      // The partner successfully opened the door, let's reflect that locally
      const idx = days.findIndex((d) => d.day === data.day);
      if (idx !== -1 && !days[idx].opened) {
        days[idx] = { ...days[idx], ...data.result, opened: true };
        const el = document.querySelector(`.door-scene[data-day="${data.day}"]`);
        if (el) {
          applyDoorState(el, days[idx]);
          openDoorAnimation(el, days[idx]);
        }
      }
    });
  }
  
  if (!isPreview) {
    initPet(calendarMeta.streak || 0);
    initPixelArt();
    initGlobalAudioPlayer();
    
    // Request Notification Permission and Web Push
    if ("serviceWorker" in navigator && "PushManager" in window) {
      if (Notification.permission === "default" || Notification.permission === "granted") {
        setTimeout(() => {
          Notification.requestPermission().then(permission => {
            if (permission === "granted") subscribeUserToPush();
          });
        }, 2000);
      }
    }
  }

  renderDoorGrid();
  animateEntrance();
}

// Convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeUserToPush() {
  try {
    const swReg = await navigator.serviceWorker.ready;
    const existing = await swReg.pushManager.getSubscription();
    if (existing) return; // already subbed

    const res = await fetch(`/api/calendar/${routeId}/vapidPublicKey`);
    const { publicKey } = await res.json();
    if (!publicKey) return;

    const sub = await swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await fetch(`/api/calendar/${routeId}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub)
    });
    console.log("Web Push abonniert!");
  } catch (err) {
    console.error("Web Push Error:", err);
  }
}

function renderFatalError(err) {
  document.body.setAttribute("data-theme", "modern");
  document.getElementById("app-root").innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-white">
      <div class="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-rose-500/30 text-center">
        <div class="bg-rose-500/10 p-6 border-b border-rose-500/30">
          <div class="text-6xl mb-2 text-rose-500">❌</div>
          <h1 class="text-2xl font-black text-rose-400">Ein Fehler ist aufgetreten</h1>
        </div>
        <div class="p-6">
          <p class="text-slate-300 mb-6">${err.message}</p>
        </div>
      </div>
    </div>
  `;
}

function applyEffects(enabled) {
  effectsEnabled = enabled;
  if (enabled) {
    canvas.classList.remove("hidden");
    field.start();
  } else {
    canvas.classList.add("hidden");
    field.stop();
  }
  document.querySelectorAll(".snow-container").forEach((el) => el.classList.toggle("hidden", !enabled));
  const btn = document.getElementById("toggle-effects-btn");
  if (btn) {
    btn.style.opacity = enabled ? "1" : "0.45";
    btn.title = enabled ? "Effekte ausschalten (Batterie sparen)" : "Effekte einschalten";
    btn.setAttribute("aria-pressed", String(!enabled));
  }
  localStorage.setItem(`effects_${routeId}`, enabled ? "1" : "0");
}

// ---------- Tamagotchi reindeer ----------

const SHOP_ITEMS = [
  { id: "bow", name: "Schleife", emoji: "🎀", slot: "neck", price: 20, desc: "Hübsch verpackt." },
  { id: "scarf", name: "Kuschelschal", emoji: "🧣", slot: "neck", price: 30, desc: "Gegen kalte Nordpol-Nächte." },
  { id: "santahat", name: "Weihnachtsmütze", emoji: "🎅", slot: "head", price: 40, desc: "Der Klassiker." },
  { id: "hat", name: "Zylinder", emoji: "🎩", slot: "head", price: 50, desc: "Für den eleganten Auftritt." },
  { id: "bell", name: "Glöckchen", emoji: "🔔", slot: "neck", price: 60, desc: "Kling, Glöckchen, klingelingeling." },
  { id: "skis", name: "Skier", emoji: "🎿", slot: "ride", price: 90, desc: "Ab auf die Piste." },
  { id: "glasses", name: "Sonnenbrille", emoji: "🕶️", slot: "face", price: 100, desc: "Cool bleiben, auch bei Schnee." },
  { id: "lights", name: "Lichterkette", emoji: "✨", slot: "aura", price: 120, desc: "Funkelt bei jedem Schritt." },
  { id: "sleigh", name: "Schlitten", emoji: "🛷", slot: "ride", price: 150, desc: "Rentiere ziehen, Rentiere fahren." },
  { id: "wings", name: "Engelsflügel", emoji: "🪽", slot: "aura", price: 180, desc: "Fast schon himmlisch." },
  { id: "crown", name: "Krone", emoji: "👑", slot: "head", price: 200, desc: "König der Weihnachtswiese." },
  { id: "star", name: "Weihnachtsstern", emoji: "🌟", slot: "aura", price: 250, desc: "Das seltenste Stück im Shop." },
];

// The most valuable owned item per slot is worn.
function petOutfit() {
  const worn = {};
  SHOP_ITEMS.filter((i) => userInventory.includes(i.id)).forEach((i) => {
    if (!worn[i.slot] || worn[i.slot].price < i.price) worn[i.slot] = i;
  });
  const e = (slot) => (worn[slot] ? worn[slot].emoji : "");
  return { text: `${e("head")}${e("face")}🦌${e("neck")}${e("ride")}${e("aura")}`, hasAura: Boolean(worn.aura) };
}

function initPet(streak) {
  const petEl = document.getElementById("digital-pet");
  const emoji = document.getElementById("pet-emoji");
  const status = document.getElementById("pet-status");
  if (!petEl) return;
  petEl.classList.remove("hidden");

  let petState = "sleepy";
  if (streak > 0 && streak <= 5) petState = "happy";
  if (streak > 5) petState = "glowing";

  if (!petEl.dataset.wired) {
    petEl.dataset.wired = "1";
    petEl.addEventListener("click", () => {
      emoji.style.transform = "translateY(-14px)";
      setTimeout(() => (emoji.style.transform = "translateY(0)"), 220);
      const opened24 = days.find((d) => d.day === 24 && d.opened);
      if (opened24) alert("AR Feature: Das Rentier wartet auf dich! (Feature in Entwicklung)");
    });
  }

  const outfit = petOutfit();
  emoji.style.filter = "";
  emoji.style.opacity = "1";
  if (petState === "sleepy") {
    emoji.textContent = `${outfit.text}💤`;
    emoji.style.filter = "grayscale(0.45)";
    status.textContent = "Schläft – öffne ein Türchen!";
  } else if (petState === "happy") {
    emoji.textContent = outfit.text;
    status.textContent = `Glücklich · ${streak} Tage Streak`;
  } else {
    emoji.textContent = outfit.hasAura ? outfit.text : `${outfit.text}✨`;
    emoji.style.filter = "drop-shadow(0 0 12px rgba(250,204,21,0.85))";
    status.textContent = `On Fire! 🔥 ${streak} Tage Streak`;
  }
}

// ---------- Shop ----------

function renderShop() {
  const list = document.getElementById("shop-items");
  if (!list) return;
  list.innerHTML = SHOP_ITEMS.map((item) => {
    const owned = userInventory.includes(item.id);
    const affordable = userCoins >= item.price;
    return `
      <button type="button" onclick="buyItem('${item.id}')" ${owned ? "disabled" : ""}
        class="w-full text-left bg-white p-3 rounded-xl border shadow-sm flex justify-between items-center gap-3 transition-transform ${owned ? "border-emerald-400 opacity-80 cursor-default" : "border-amber-300 hover:scale-[1.02] active:scale-95 hover:bg-amber-50"}">
        <span class="flex items-center gap-3 min-w-0">
          <span class="text-3xl leading-none">${item.emoji}</span>
          <span class="min-w-0">
            <span class="block font-bold">${item.name}</span>
            <span class="block text-xs text-amber-700/80 truncate">${item.desc}</span>
          </span>
        </span>
        <span class="shrink-0 px-3 py-1 rounded-full font-bold text-sm ${owned ? "bg-emerald-500 text-white" : affordable ? "bg-amber-500 text-white" : "bg-amber-200 text-amber-800"}">${owned ? "✓ Im Besitz" : `${item.price} 🪙`}</span>
      </button>`;
  }).join("");
}

document.getElementById("shop-btn").onclick = () => {
  document.getElementById("shop-modal").classList.remove("hidden");
  updateCoinDisplay();
  renderShop();
};

document.getElementById("shop-close").onclick = () => {
  document.getElementById("shop-modal").classList.add("hidden");
};

window.buyItem = function(itemId) {
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) return;
  if (userInventory.includes(item.id)) {
    alert("Du besitzt dieses Item bereits!");
    return;
  }
  if (userCoins < item.price) {
    alert(`Nicht genug Münzen – dir fehlen noch ${item.price - userCoins} 🪙.`);
    return;
  }
  userCoins -= item.price;
  userInventory.push(item.id);
  saveUserCoins();
  localStorage.setItem(`inventory_${routeId}`, JSON.stringify(userInventory));
  updateCoinDisplay();
  renderShop();
  initPet(calendarMeta?.streak || 0);
  if (window.atmosphere) window.atmosphere.playMagicChime();
  if (effectsEnabled && field) field.burst(window.innerWidth / 2, window.innerHeight / 2, ["#f59e0b", "#fbbf24", "#fff", "#22c55e"]);
};

// ---------- Pixel Art ----------

let activeColor = "#ffffff";
let pixelCount = 0;
const gridSize = 50; // 50x50
const cellSize = 10; // 500px canvas / 50

function initPixelArt() {
  const btn = document.getElementById("pixel-art-btn");
  const modal = document.getElementById("pixel-modal");
  const close = document.getElementById("pixel-close");
  const canvas = document.getElementById("pixel-canvas");
  const ctx = canvas.getContext("2d");
  const countEl = document.getElementById("pixel-count");

  // Calculate available pixels (10 per opened door minus used)
  const openedDoors = days.filter(d => d.opened).length;
  const usedPixels = parseInt(localStorage.getItem(`pixels_${routeId}`) || "0", 10);
  pixelCount = Math.max(0, openedDoors * 10 - usedPixels);
  countEl.textContent = pixelCount;

  // Active color selection
  document.querySelectorAll(".pixel-color-btn").forEach(b => {
    b.onclick = () => {
      document.querySelectorAll(".pixel-color-btn").forEach(bb => bb.classList.remove("border-white"));
      b.classList.add("border-white");
      activeColor = b.dataset.color;
    };
  });
  document.querySelector('.pixel-color-btn').classList.add("border-white");

  // Draw grid
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  btn.onclick = () => {
    modal.classList.remove("hidden");
    if (socket) {
      socket.emit("get_pixels", routeId);
    }
  };

  close.onclick = () => modal.classList.add("hidden");

  // Socket handlers
  if (socket) {
    socket.on("pixels_state", (state) => {
      Object.entries(state).forEach(([coords, color]) => {
        const [x, y] = coords.split(",").map(Number);
        ctx.fillStyle = color;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      });
    });

    socket.on("pixel_update", (data) => {
      ctx.fillStyle = data.color;
      ctx.fillRect(data.x * cellSize, data.y * cellSize, cellSize, cellSize);
    });
  }

  // Drawing
  let isDrawing = false;
  
  const placePixel = (e) => {
    if (pixelCount <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.floor(((e.clientX - rect.left) * scaleX) / cellSize);
    const y = Math.floor(((e.clientY - rect.top) * scaleY) / cellSize);
    
    if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
      // Draw locally
      ctx.fillStyle = activeColor;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      
      // Emit
      if (socket) {
        socket.emit("put_pixel", { calendarId: routeId, x, y, color: activeColor });
      }
      
      // Update count
      pixelCount--;
      countEl.textContent = pixelCount;
      localStorage.setItem(`pixels_${routeId}`, usedPixels + (openedDoors * 10 - usedPixels - pixelCount));
    }
  };

  canvas.addEventListener("mousedown", (e) => {
    isDrawing = true;
    placePixel(e);
  });
  canvas.addEventListener("mousemove", (e) => {
    if (isDrawing) placePixel(e);
  });
  window.addEventListener("mouseup", () => {
    isDrawing = false;
  });
}

// ---------- Global Audio Player ----------

function initGlobalAudioPlayer() {
  const audioDocs = days.filter(d => d.opened && d.contentType === "audio" && d.content?.audioUrl).sort((a,b) => a.day - b.day);
  if (audioDocs.length === 0) return;

  const playerEl = document.getElementById("global-player");
  const audioEl = document.getElementById("gp-audio");
  const playBtn = document.getElementById("gp-play");
  const titleEl = document.getElementById("gp-title");
  const progEl = document.getElementById("gp-progress");
  const progContainer = document.getElementById("gp-progress-container");
  const closeBtn = document.getElementById("gp-close");
  
  playerEl.classList.remove("hidden");

  let currentIndex = parseInt(localStorage.getItem(`audioIdx_${routeId}`) || "0", 10);
  if (currentIndex >= audioDocs.length) currentIndex = 0;
  
  const loadTrack = (idx) => {
    const track = audioDocs[idx];
    titleEl.textContent = `Tag ${track.day}: ${track.content.title || "Audio"}`;
    audioEl.src = track.content.audioUrl;
    
    // Resume position if it's the exact same track
    const savedTime = parseFloat(localStorage.getItem(`audioTime_${routeId}`) || "0");
    const savedIdx = parseInt(localStorage.getItem(`audioIdx_${routeId}`) || "0", 10);
    if (idx === savedIdx && savedTime > 0) {
      audioEl.currentTime = savedTime;
    }
  };

  loadTrack(currentIndex);

  playBtn.onclick = () => {
    if (audioEl.paused) {
      audioEl.play();
      playBtn.textContent = "⏸️";
    } else {
      audioEl.pause();
      playBtn.textContent = "▶️";
    }
  };

  audioEl.ontimeupdate = () => {
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    progEl.style.width = (pct || 0) + "%";
    localStorage.setItem(`audioTime_${routeId}`, audioEl.currentTime);
  };

  audioEl.onended = () => {
    if (currentIndex < audioDocs.length - 1) {
      currentIndex++;
      localStorage.setItem(`audioIdx_${routeId}`, currentIndex);
      localStorage.setItem(`audioTime_${routeId}`, 0);
      loadTrack(currentIndex);
      audioEl.play();
    } else {
      playBtn.textContent = "▶️";
    }
  };

  progContainer.onclick = (e) => {
    const rect = progContainer.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioEl.currentTime = pct * audioEl.duration;
  };
  
  closeBtn.onclick = () => {
    playerEl.classList.add("hidden");
    audioEl.pause();
  };
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

let garlandWidth = 0;
function renderGarland() {
  const el = document.getElementById("garland");
  const width = el.clientWidth;
  if (width === garlandWidth) return;
  garlandWidth = width;
  el.innerHTML = buildGarlandForTheme(themeKey, width);
}

function spanSize(span) {
  if (span === "2x2") return [2, 2];
  if (span === "2x1") return [2, 1];
  if (span === "1x2") return [1, 2];
  return [1, 1];
}

function leafFrontHtml(door, cols, rows, house) {
  const number = `<span class="door-number">${door.day}</span>`;
  const lock = `<span class="door-lock">${iconSvg("lock")}</span>`;
  return `${number}${lock}`;
}

function showCorporateLoginModal(meta = {}) {
  // Styled inline on purpose: this gate must be usable even if the Tailwind
  // bundle is missing or stale on the server.
  const accent = meta.customConfig?.firmaColor || "#10b981";
  const logo = meta.customConfig?.logo;
  const company = meta.companyName || meta.recipientName || "";
  const modal = document.createElement("div");
  modal.style.cssText = "position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.9);padding:16px;backdrop-filter:blur(8px);font-family:Inter,system-ui,sans-serif;";
  modal.innerHTML = `
    <div style="background:#0f172a;border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:32px;max-width:420px;width:100%;box-sizing:border-box;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,0.6);position:relative;overflow:hidden;color:#fff;">
      <div style="position:absolute;top:0;left:0;width:100%;height:4px;background:${escapeHtml(accent)};"></div>
      ${logo
        ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(company)}" style="max-height:72px;max-width:220px;object-fit:contain;margin:4px auto 18px;display:block;">`
        : `<div style="font-size:3rem;margin-bottom:12px;">🏢</div>`}
      <h2 style="font-size:1.5rem;font-weight:900;margin:0 0 8px;">Willkommen!</h2>
      <p style="color:#cbd5e1;font-size:0.9rem;line-height:1.5;margin:0 0 20px;">Dies ist der Firmen-Adventskalender${company ? ` von <strong style="color:#fff;">${escapeHtml(company)}</strong>` : ""}. Melde dich mit deiner E-Mail-Adresse an um mitzumachen.<br>Wir wünschen dir eine besinnliche Adventszeit.</p>
      <form id="corp-login-form" novalidate style="display:flex;flex-direction:column;gap:12px;">
        <input type="email" id="corp-email" required autocomplete="email" inputmode="email" placeholder="vorname.nachname@firma.ch" style="width:100%;box-sizing:border-box;background:#1e293b;border:1px solid #475569;border-radius:12px;padding:12px 16px;color:#fff;font-size:1rem;outline:none;">
        <p id="corp-email-error" style="display:none;margin:-4px 0 0;color:#fda4af;font-size:0.85rem;">Bitte eine gültige E-Mail-Adresse eingeben.</p>
        <button type="submit" style="width:100%;background:${escapeHtml(accent)};color:#fff;font-weight:700;padding:12px;border-radius:12px;border:0;font-size:1rem;cursor:pointer;">Speichern &amp; Loslegen</button>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById("corp-email")?.focus(), 50);

  document.getElementById("corp-login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("corp-email");
    const val = input.value.trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
    document.getElementById("corp-email-error").style.display = valid ? "none" : "block";
    input.style.borderColor = valid ? "#475569" : "#f43f5e";
    if (!valid) return;
    localStorage.setItem(`adventskalender_user_${routeId}`, val);
    window.location.reload();
  });
}
function renderDoorGrid() {
  doorGrid.innerHTML = "";
  let order = theme.order || days.map((d) => d.day);

  if (calendarMeta.randomLayout) {
    const arr = [...order];
    let seed = calendarMeta.year + (calendarMeta.recipientName?.length || 0);
    // Seeded Fisher-Yates shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const r = seed / 233280;
      const j = Math.floor(r * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    order = arr;
  }

  order.forEach((dayNum, index) => {
    const door = days.find((d) => d.day === dayNum);
    if (!door) return;
    
    // Check choice requirement
    if (door.reqChoiceDay && door.reqChoiceOpt) {
      const requiredDay = door.reqChoiceDay;
      const requiredOpt = door.reqChoiceOpt;
      if (!calendarMeta.choices || calendarMeta.choices[requiredDay] !== requiredOpt) {
        return; // Don't render this door
      }
    }

    const scene = document.createElement("div");
    scene.className = "door-scene";
    scene.dataset.day = door.day;
    scene.style.setProperty("--i", index);

    const span = theme.spans?.[door.day];
    if (span) scene.classList.add(`span-${span}`);

    const tilt = theme.tilt ? ((seeded(door.day) * 2 - 1) * theme.tilt).toFixed(2) : 0;
    scene.style.setProperty("--tilt", `${tilt}deg`);

    let house = null;
    if (theme.palette) {
      house = theme.palette[(door.day * 5) % theme.palette.length];
      scene.style.setProperty("--house", house);
    }
    const [cols, rows] = spanSize(span);

    const cfg = calendarMeta.customConfig || {};
    let leafFrontStyle = "";
    let logoHtml = "";
    
    if (themeKey === "firma") {
      const styleConfig = cfg.doorStyle || "white";
      const hasLogo = styleConfig.includes("logo");
      const baseStyle = styleConfig.replace("-logo", "");
      const c = cfg.firmaColor || "#3b82f6";
      
      switch(baseStyle) {
        case "color":
          leafFrontStyle = `background: ${c}; border-color: ${c}; --number-color: #ffffff; --lock-color: rgba(255,255,255,0.7);`;
          break;
        case "outline":
          leafFrontStyle = `background: rgba(255,255,255,0.05); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); border: 2px solid ${c}; --number-color: ${c}; --lock-color: ${c};`;
          break;
        case "glass":
          leafFrontStyle = `background: rgba(255,255,255,0.3); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.6); box-shadow: 0 4px 15px rgba(0,0,0,0.1); --number-color: ${c}; --lock-color: ${c};`;
          break;
        case "dark":
          leafFrontStyle = `background: #0f172a; border: 1px solid ${c}; --number-color: ${c}; --lock-color: rgba(255,255,255,0.5); box-shadow: 0 4px 15px rgba(0,0,0,0.3);`;
          break;
        case "logo":
        case "white":
        default:
          // Default white style handles these cases (logo case gets hasLogo=true but baseStyle=logo->default)
          break;
      }
      
      if (hasLogo && cfg.logo) {
        logoHtml = `<img src="${cfg.logo}" class="door-logo" style="position:absolute; width:60%; height:60%; object-fit:contain; top:50%; left:50%; transform:translate(-50%, -50%); opacity:0.15; pointer-events:none;" />`;
      }
    }

    scene.innerHTML = `
      <div class="door-body">
        <div class="door-interior"><span class="interior-icon"></span></div>
        <div class="door-leaf">
          <div class="leaf-front" style="${leafFrontStyle}">
            ${logoHtml}
            ${leafFrontHtml(door, cols, rows, house)}
          </div>
          <div class="leaf-back"></div>
        </div>
      </div>
    `;

    scene.addEventListener("click", () => handleDoorClick(door.day, scene));
    doorGrid.appendChild(scene);
    applyDoorState(scene, door);

    if (calendarMeta.today?.month === 12 && calendarMeta.today?.day === door.day && !door.opened) {
      scene.classList.add("is-today");
    }
  });

  fitGridCells();
  updateProgress();
}

function applyDoorState(scene, door) {
  scene.classList.toggle("is-locked", !door.unlocked);
  scene.classList.toggle("is-ready", door.unlocked && !door.opened);
  scene.classList.toggle("is-open", Boolean(door.opened));

  // Challenge doors that have been completed get a green glow
  if (door.contentType === "challenge" && door.opened) {
    const isDone = localStorage.getItem(`challenge_done_${routeId}_${door.day}`) === "true";
    scene.classList.toggle("is-done", isDone);
  } else {
    scene.classList.remove("is-done");
  }

  scene.querySelector(".interior-icon").innerHTML = iconSvg(door.opened ? door.contentType || "empty" : theme.interiorIcon);
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
  if (themeKey) renderGarland();
}
new ResizeObserver(() => fitGridCells()).observe(doorGrid);

function animateEntrance() {
  if (!window.gsap || !effectsEnabled) return;
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
    onComplete: () => {
      const todayEl = document.querySelector(".is-today");
      if (todayEl) {
        setTimeout(() => todayEl.scrollIntoView({ behavior: "smooth", block: "center" }), 500);
      }
    }
  });
}

// ---------- Interaction ----------

async function handleDoorClick(dayNum, sceneEl) {
  const door = days.find((d) => d.day === dayNum);

  if (!door.unlocked) {
    if (window.atmosphere) window.atmosphere.playErrorSound();
    shakeDoor(sceneEl);
    showLockToast(`Noch nicht so weit! Türchen ${dayNum} öffnet sich erst am ${formatDateDe(door.unlockDate)}.`);
    return;
  }

  if (door.opened) {
    if (window.atmosphere) window.atmosphere.playClickSound();
    openContentModal(door);
    return;
  }

  let requestBody = {};
  
  if (dayNum === 24 && calendarMeta.metaPuzzle && !isPreview) {
    const pwd = prompt(`🔐 Das 24. Türchen ist durch das Meta-Rätsel versiegelt!\n\nSetze alle Buchstaben aus den Tagen 1-23 zusammen.\n\nPasswort eingeben:`);
    if (!pwd) return;
    requestBody.metaPassword = pwd;
  }

  if (door.isLocked) {
    const pwd = prompt(`🔒 Dieses Türchen ist durch ein Passwort geschützt!\n\nHinweis: ${door.lockHint || 'Kein Hinweis'}\n\nPasswort eingeben:`);
    if (!pwd) return;
    requestBody.password = pwd;
  }
  
  // Sensor Locks (Voice & Camera)
  if (door.sensorLock && !isPreview) {
    const sl = door.sensorLock;
    if (sl === "voice") {
      const success = await promptVoiceLock(sceneEl);
      if (!success) return;
    } else if (sl.startsWith("camera-")) {
      const color = sl.split("-")[1];
      const success = await promptCameraLock(sceneEl, color);
      if (!success) return;
    } else if (sl === "geoAR") {
      const success = await promptGeoAR(sceneEl, door.geoLat, door.geoLon);
      if (!success) return;
    }
  }

  if (door.requiresLocation && !isPreview) {
    if (!navigator.geolocation) {
      shakeDoor(sceneEl);
      showLockToast("Dein Browser unterstützt keine Standortabfrage.");
      return;
    }

    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      shakeDoor(sceneEl);
      showLockToast("Standortabfrage erfordert eine sichere Verbindung (HTTPS).");
      return;
    }

    showLockToast("Prüfe deinen Standort... Bitte erlaube den GPS-Zugriff.");
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
      });
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;
      const targetLat = door.targetLat;
      const targetLng = door.targetLng;
      
      // Calculate distance using Haversine
      const R = 6371e3; // metres
      const φ1 = userLat * Math.PI/180;
      const φ2 = targetLat * Math.PI/180;
      const Δφ = (targetLat-userLat) * Math.PI/180;
      const Δλ = (targetLng-userLng) * Math.PI/180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;

      if (distance > 50) { // 50 meters radius
        shakeDoor(sceneEl);
        showLockToast(`Du bist noch zu weit weg! (ca. ${Math.round(distance)}m). Hinweis: ${door.locationHint}`);
        return;
      }
    } catch (err) {
      shakeDoor(sceneEl);
      if (err.code === 1) {
        showLockToast("GPS-Zugriff wurde verweigert. Bitte erlaube den Standortzugriff in deinen Browser-Einstellungen.");
      } else if (err.code === 2) {
        showLockToast("Standort konnte nicht ermittelt werden. Bitte aktiviere GPS und versuche es erneut.");
      } else if (err.code === 3) {
        showLockToast("Zeitüberschreitung bei der GPS-Abfrage. Bitte versuche es nochmals.");
      } else {
        showLockToast("Standort konnte nicht ermittelt werden: " + err.message);
      }
      return;
    }
  }

  await tryOpenDoor(dayNum, sceneEl, requestBody);
}

// ---------- Sensor Locks ----------

async function promptVoiceLock(doorEl) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4";
    modal.innerHTML = `
      <div class="bg-slate-900 border border-indigo-500/50 rounded-2xl p-6 text-center max-w-sm w-full">
        <div class="text-6xl mb-4">🎤</div>
        <h3 class="text-xl font-bold text-white mb-2">Voice-Unlock aktiv!</h3>
        <p class="text-slate-300 mb-6 text-sm">Puste ins Mikrofon oder singe einen Weihnachtssong für 3 Sekunden, um das Türchen zu öffnen.</p>
        <div class="w-full h-4 bg-slate-800 rounded-full overflow-hidden mb-6 border border-white/10">
          <div id="volume-bar" class="h-full bg-emerald-500 transition-all duration-75" style="width: 0%"></div>
        </div>
        <button id="cancel-voice" class="text-slate-400 hover:text-white text-sm">Abbrechen</button>
      </div>
    `;
    document.body.appendChild(modal);

    let audioCtx, analyser, dataArray, source, stream, rafId;
    let thresholdCounter = 0;

    const cleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (audioCtx) audioCtx.close();
      modal.remove();
    };

    document.getElementById("cancel-voice").onclick = () => {
      cleanup();
      resolve(false);
    };

    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      stream = s;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);

      const bar = document.getElementById("volume-bar");

      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length; // 0-255

        bar.style.width = Math.min(100, (avg / 128) * 100) + "%";

        if (avg > 50) { // Threshold
          thresholdCounter++;
          bar.classList.replace("bg-emerald-500", "bg-rose-500");
        } else {
          thresholdCounter = Math.max(0, thresholdCounter - 1);
          bar.classList.replace("bg-rose-500", "bg-emerald-500");
        }

        if (thresholdCounter > 60) { // ~ 1-2 seconds at 60fps
          cleanup();
          resolve(true);
        } else {
          rafId = requestAnimationFrame(checkVolume);
        }
      };
      checkVolume();
    }).catch(err => {
      alert("Mikrofon konnte nicht aktiviert werden: " + err.message);
      cleanup();
      resolve(false);
    });
  });
}

async function promptCameraLock(doorEl, colorGoal) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4";
    modal.innerHTML = `
      <div class="bg-slate-900 border border-emerald-500/50 rounded-2xl p-4 text-center max-w-sm w-full">
        <h3 class="text-xl font-bold text-white mb-2">Kamera-Schnitzeljagd!</h3>
        <p class="text-slate-300 mb-4 text-sm">Finde einen Gegenstand, der <b class="text-${colorGoal === 'red' ? 'rose' : 'emerald'}-400">${colorGoal === 'red' ? 'ROT' : 'GRÜN'}</b> ist, und halte ihn in die Mitte der Kamera.</p>
        <div class="relative w-full aspect-square rounded-xl overflow-hidden bg-black mb-4 border-2 border-white/10">
          <video id="cam-video" class="w-full h-full object-cover" autoplay playsinline></video>
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="w-16 h-16 border-4 border-white/50 rounded-full"></div>
          </div>
        </div>
        <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-4 border border-white/10">
          <div id="color-match-bar" class="h-full bg-emerald-500 transition-all" style="width: 0%"></div>
        </div>
        <button id="cancel-cam" class="text-slate-400 hover:text-white text-sm">Abbrechen</button>
      </div>
    `;
    document.body.appendChild(modal);

    let stream, rafId;
    let matchCounter = 0;
    const video = document.getElementById("cam-video");
    const bar = document.getElementById("color-match-bar");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const cleanup = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      modal.remove();
    };

    document.getElementById("cancel-cam").onclick = () => {
      cleanup();
      resolve(false);
    };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((s) => {
      stream = s;
      video.srcObject = stream;
      video.onplay = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const scan = () => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          // Get center pixel region
          const cx = Math.floor(canvas.width / 2);
          const cy = Math.floor(canvas.height / 2);
          const size = 20;
          const frame = ctx.getImageData(cx - size/2, cy - size/2, size, size);
          const data = frame.data;
          
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < data.length; i += 4) {
            r += data[i]; g += data[i+1]; b += data[i+2];
          }
          const pixels = size * size;
          r /= pixels; g /= pixels; b /= pixels;
          
          let isMatch = false;
          if (colorGoal === 'red' && r > 150 && r > g * 1.5 && r > b * 1.5) isMatch = true;
          if (colorGoal === 'green' && g > 120 && g > r * 1.3 && g > b * 1.3) isMatch = true;
          
          if (isMatch) {
            matchCounter += 5;
          } else {
            matchCounter = Math.max(0, matchCounter - 2);
          }
          
          bar.style.width = Math.min(100, matchCounter) + "%";
          
          if (matchCounter >= 100) {
            cleanup();
            resolve(true);
          } else {
            rafId = requestAnimationFrame(scan);
          }
        };
        scan();
      };
    }).catch(err => {
      alert("Kamera konnte nicht aktiviert werden: " + err.message);
      cleanup();
      resolve(false);
    });
  });
}

async function promptGeoAR(doorEl, lat, lon) {
  return new Promise((resolve) => {
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      showLockToast("Dein Browser unterstützt keine Standortabfrage.");
      return resolve(false);
    }

    // HTTPS is required for geolocation on most browsers
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      showLockToast("Standortabfrage erfordert eine sichere Verbindung (HTTPS).");
      return resolve(false);
    }

    // Phase 1: GPS Check
    showLockToast("Prüfe GPS-Koordinaten...");
    navigator.geolocation.getCurrentPosition((pos) => {
      const userLat = pos.coords.latitude;
      const userLon = pos.coords.longitude;
      const targetLat = parseFloat(lat);
      const targetLon = parseFloat(lon);
      
      // Simple distance calc (approx)
      const R = 6371e3;
      const f1 = userLat * Math.PI/180;
      const f2 = targetLat * Math.PI/180;
      const df = (targetLat - userLat) * Math.PI/180;
      const dl = (targetLon - userLon) * Math.PI/180;
      const a = Math.sin(df/2) * Math.sin(df/2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dl/2) * Math.sin(dl/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      if (distance > 50 && targetLat && targetLon) {
        showLockToast(`Du bist noch ${Math.round(distance)}m entfernt!`);
        return resolve(false);
      }
      
      lockToast.classList.add("hidden");
      
      // Phase 2: AR Catch
      const modal = document.createElement("div");
      modal.className = "fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center";
      modal.innerHTML = `
        <h3 class="text-white text-xl font-bold mb-4 absolute top-10 text-center w-full">Fange das Geschenk!<br><span class="text-sm font-normal text-slate-300">Drehe dein Handy, um es zu finden.</span></h3>
        <div class="relative w-full h-full overflow-hidden">
          <div id="ar-target" class="absolute text-6xl cursor-pointer transition-transform transform -translate-x-1/2 -translate-y-1/2" style="left:50%; top:50%;">🎁</div>
        </div>
        <button id="ar-cancel" class="absolute bottom-10 bg-slate-800 text-white px-6 py-2 rounded-full">Abbrechen</button>
      `;
      document.body.appendChild(modal);
      
      const target = document.getElementById("ar-target");
      let rx = 0; let ry = 0;
      
      const handleOrientation = (e) => {
        rx = e.gamma || 0; // -90 to 90
        ry = e.beta || 0;  // -180 to 180
        
        const left = 50 + (rx * 2);
        const top = 50 + ((ry - 45) * 2);
        
        target.style.left = `${Math.max(-20, Math.min(120, left))}%`;
        target.style.top = `${Math.max(-20, Math.min(120, top))}%`;
      };
      
      window.addEventListener("deviceorientation", handleOrientation);
      
      target.onclick = () => {
        window.removeEventListener("deviceorientation", handleOrientation);
        modal.remove();
        resolve(true);
      };
      
      document.getElementById("ar-cancel").onclick = () => {
        window.removeEventListener("deviceorientation", handleOrientation);
        modal.remove();
        resolve(false);
      };
      
    }, (err) => {
      // Detailed error messages
      if (err.code === 1) {
        showLockToast("GPS-Zugriff wurde verweigert. Bitte erlaube den Standortzugriff in deinen Browser-Einstellungen.");
      } else if (err.code === 2) {
        showLockToast("Standort konnte nicht ermittelt werden. Bitte aktiviere GPS und versuche es erneut.");
      } else if (err.code === 3) {
        showLockToast("Zeitüberschreitung bei der GPS-Abfrage. Bitte versuche es nochmals.");
      } else {
        showLockToast("GPS-Zugriff nicht verfügbar: " + err.message);
      }
      resolve(false);
    }, { enableHighAccuracy: true, timeout: 15000 });
  });
}

async function tryOpenDoor(dayNum, sceneEl, body = {}) {
  const door = days.find((d) => d.day === dayNum);
  // If syncOpen is required and we aren't previewing
  if (calendarMeta.syncOpen && !isPreview) {
    if (!partnerReady[dayNum]) {
      sceneEl.dataset.waiting = "true";
      showLockToast("Warte auf Partner... (Beide müssen gleichzeitig hier sein und auf das Türchen klicken)");
      sceneEl.classList.add("pulse");
      
      // Tell partner we are ready
      pendingBody[dayNum] = body;
      if (socket) socket.emit("door_ready", { calendarId: routeId, day: dayNum });
      return;
    }
  }

  sceneEl.classList.remove("pulse");
  sceneEl.dataset.waiting = "false";
  
  try {
    // Inject current user (for corporate mode) into the request body
    const currentUser = localStorage.getItem(`adventskalender_user_${routeId}`) || null;
    const finalBody = currentUser ? { ...body, user: currentUser } : body;

    const result = isPreview
      ? { contentType: door.contentType || "empty", content: door.content }
      : await fetchJson(`/api/calendar/${routeId}/days/${dayNum}/open`, { 
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalBody)
        });
    const idx = days.findIndex((d) => d.day === dayNum);
    if (idx !== -1) {
      days[idx] = { ...days[idx], ...result };
    }
    const currentDoor = days.find((d) => d.day === dayNum) || door;
    
    // Notify partner that we successfully opened it so they can sync
    if (calendarMeta.syncOpen && !isPreview && socket) {
      socket.emit("door_opened_sync", { calendarId: routeId, day: dayNum, result });
    }
    
    currentDoor.opened = true;
    currentDoor.contentType = result.contentType;
    currentDoor.content = result.content;
  } catch (err) {
    if (err.status === 403) {
      door.unlocked = false;
      applyDoorState(sceneEl, door);
      shakeDoor(sceneEl);
      showLockToast(err.data.error);
      return;
    }
    showLockToast(err.message);
    return;
  }

  const updatedDoor = days.find((d) => d.day === dayNum) || door;
  openDoorAnimation(sceneEl, updatedDoor);
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
  
  // Apply door state in next frame to ensure any previous DOM updates don't swallow the CSS transition
  requestAnimationFrame(() => {
    applyDoorState(sceneEl, door);
    updateProgress();
    
    if (window.atmosphere) window.atmosphere.playMagicChime();
    if (effectsEnabled) setTimeout(() => field.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, theme.burstColors), 380);
    
    if (door.day === 24 && window.confetti && effectsEnabled) {
      setTimeout(() => {
        confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, zIndex: 9999 });
      }, 400);
    }
    
    setTimeout(() => openContentModal(door), 780);
  });
}

function formatDateDe(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ---------- Content modal ----------

function openContentModal(door) {
  let html = renderContent(door.contentType, door.content, door.day);
  if (door.content?.metaLetter) {
    html += `<div class="mt-8 p-4 bg-indigo-900/40 border border-indigo-500/30 rounded-xl text-center">
      <p class="text-indigo-300 text-xs uppercase tracking-widest font-bold mb-1">Hinweis für Tag 24:</p>
      <div class="text-3xl font-black text-white drop-shadow-md">${escapeHtml(door.content.metaLetter)}</div>
    </div>`;
  }
  
  if (door.content?.isScratchable) {
    html = `
      <div class="scratch-wrap">
        <div class="scratch-under">${html}</div>
        <canvas id="scratch-canvas"></canvas>
      </div>
      <p class="modal-muted" style="margin-top:10px">${escapeHtml(door.content.scratchLabel || "Hier rubbeln!")}</p>
    `;
  }
  
  modalBody.innerHTML = html;
  contentModal.classList.remove("hidden");
  
  if (door.opened && !isPreview) {
    document.getElementById("modal-feedback").classList.remove("hidden");
    setupFeedback(door.day);
  } else {
    document.getElementById("modal-feedback").classList.add("hidden");
  }

  requestAnimationFrame(() => contentModal.classList.add("modal-visible"));
  if (window.gsap && effectsEnabled) {
    gsap.fromTo("#modal-card", { y: 30, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" });
  }
  wireContentInteractions(door);
}

// Upload file helper for feedback
async function uploadFeedbackFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

function setupFeedback(dayNum) {
  const emojis = document.querySelectorAll(".feedback-emoji");
  emojis.forEach(btn => {
    // Clean old listeners
    const newBtn = btn.cloneNode(true);
    btn.replaceWith(newBtn);
    newBtn.addEventListener("click", async () => {
      newBtn.style.transform = "scale(1.5)";
      setTimeout(() => newBtn.style.transform = "", 200);
      try {
        await fetchJson(`/api/calendar/${routeId}/days/${dayNum}/reaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji: newBtn.textContent })
        });
        showLockToast("Reaktion gesendet!");
      } catch (e) {
        showLockToast("Fehler: " + e.message);
      }
    });
  });

  const voiceBtn = document.getElementById("feedback-voice");
  const newVoiceBtn = voiceBtn.cloneNode(true);
  voiceBtn.replaceWith(newVoiceBtn);
  
  let mediaRecorder;
  let audioChunks = [];
  
  newVoiceBtn.addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      newVoiceBtn.innerHTML = "🎙 Antworten";
      newVoiceBtn.classList.replace("bg-emerald-600/20", "bg-rose-600/20");
      newVoiceBtn.classList.replace("text-emerald-500", "text-rose-500");
      showLockToast("Wird gesendet...");
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
          const blob = new Blob(audioChunks, { type: "audio/webm" });
          const file = new File([blob], "reply.webm", { type: "audio/webm" });
          try {
            const { url } = await uploadFeedbackFile(file);
            await fetchJson(`/api/calendar/${routeId}/days/${dayNum}/reply`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "audio", url })
            });
            showLockToast("Sprachnachricht gesendet!");
          } catch (e) {
            showLockToast("Senden fehlgeschlagen: " + e.message);
          }
          stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        newVoiceBtn.innerHTML = "⏹ Stopp & Senden";
        newVoiceBtn.classList.replace("bg-rose-600/20", "bg-emerald-600/20");
        newVoiceBtn.classList.replace("text-rose-500", "text-emerald-500");
      } catch (err) {
        showLockToast("Kein Mikrofon-Zugriff möglich.");
      }
    }
  });
}

document.getElementById("modal-close").addEventListener("click", closeContentModal);
contentModal.addEventListener("click", (e) => {
  if (e.target === contentModal) closeContentModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !contentModal.classList.contains("hidden")) closeContentModal();
});

function openLeaderboardModal() {
  const lb = calendarMeta.leaderboard || [];
  
  let rows = `<p class="modal-muted">Noch keine Einträge.</p>`;
  if (lb.length > 0) {
    lb.sort((a, b) => b.score - a.score);
    // Limit to top 10
    const top10 = lb.slice(0, 10);
    rows = `<div class="space-y-2 mt-4">
      ${top10.map((entry, idx) => `
        <div class="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
          <div class="flex items-center gap-3">
            <span class="font-bold text-xl ${idx < 3 ? 'text-amber-400' : 'text-slate-400'}">#${idx + 1}</span>
            <div>
              <div class="font-bold text-white">${escapeHtml(entry.name)}</div>
              <div class="text-xs text-slate-400">${escapeHtml(entry.game)}</div>
            </div>
          </div>
          <div class="font-bold text-lg text-emerald-400">${entry.score} 🪙</div>
        </div>
      `).join("")}
    </div>`;
  }

  const lbName = localStorage.getItem("lb_name") || "";
  const nameForm = `
    <div class="mt-6 bg-slate-800 p-4 rounded-xl border border-white/10 text-left">
      <h4 class="font-bold text-white mb-2">Trage dich ein!</h4>
      <p class="text-xs text-slate-400 mb-3">Du hast aktuell ${userCoins} Münzen. Speichere deinen Namen, um auf der Rangliste zu erscheinen.</p>
      <div class="flex gap-2">
        <input type="text" id="lb-name-input" placeholder="Dein Spielername..." value="${escapeHtml(lbName)}" class="flex-1 bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <button id="lb-submit-btn" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors">Speichern</button>
      </div>
    </div>
  `;

  modalBody.innerHTML = cardWrap(
    "coins",
    "🏆 Top 10 Rangliste",
    `${rows}
     ${nameForm}
     <div class="mt-6 text-center">
       <button id="global-stats-btn" class="text-indigo-400 text-sm hover:text-indigo-300">Globale Statistik anzeigen</button>
       <div id="global-stats-result" class="hidden mt-2 text-sm text-slate-300"></div>
     </div>`
  );
  
  document.getElementById("modal-feedback").classList.add("hidden");
  contentModal.classList.remove("hidden");
  
  document.getElementById("lb-submit-btn").addEventListener("click", async () => {
    const name = document.getElementById("lb-name-input").value.trim();
    if (!name) return alert("Bitte gib einen Namen ein!");
    
    localStorage.setItem("lb_name", name);
    try {
      await fetchJson(`/api/calendar/${routeId}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, game: "Gesamt-Münzen", score: userCoins, day: "Alle" })
      });
      // Refresh calendarMeta leaderboard by fetching again
      const data = await fetchJson(isPreview ? `/api/admin/calendars/${routeId}/preview` : `/api/calendar/${routeId}`);
      calendarMeta.leaderboard = data.leaderboard || data.calendar?.leaderboard || [];
      openLeaderboardModal(); // Re-render modal
    } catch(err) {
      alert("Fehler beim Speichern: " + err.message);
    }
  });

  document.getElementById("global-stats-btn").addEventListener("click", async () => {
    try {
      const res = await fetchJson('/api/global-stats');
      const resEl = document.getElementById("global-stats-result");
      resEl.textContent = `Weltweit wurden bereits ${res.totalOpened} Türchen geöffnet! 🌍`;
      resEl.classList.remove("hidden");
    } catch (e) {
      console.error(e);
    }
  });

  requestAnimationFrame(() => contentModal.classList.add("modal-visible"));
  if (window.gsap && effectsEnabled) {
    gsap.fromTo("#modal-card", { y: 30, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" });
  }
}

function closeContentModal() {
  contentModal.classList.remove("modal-visible");
  clearInterval(countdownInterval);
  setTimeout(() => contentModal.classList.add("hidden"), 200);
}

function cardWrap(iconKey, title, innerHtml) {
  return `
    <div class="modal-head">
      <div class="modal-icon">${iconSvg(iconKey)}</div>
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
        "text",
        null,
        `<p class="modal-text">${escapeHtml(c.message)}</p>
         ${c.sender ? `<p class="modal-sender">– ${escapeHtml(c.sender)}</p>` : ""}`
      );

    case "voucher":
      return cardWrap(
        "voucher",
        c.title || "Gutschein",
        `<div class="voucher-box">
          ${c.code ? `<div class="voucher-code">${escapeHtml(c.code)}</div>` : ""}
          <div class="modal-muted">${escapeHtml(c.description)}</div>
        </div>`
      );

    case "qrcode":
      return cardWrap(
        "qrcode",
        c.label || "Scan mich",
        c.qrImage ? `<img src="${c.qrImage}" class="qr-img" alt="QR-Code" />` : `<p class="modal-muted">${escapeHtml(c.data)}</p>`
      );

    case "video":
      return cardWrap(
        "video",
        c.caption,
        `<div class="media-frame">
          <iframe src="${toVideoEmbed(c.url)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>`
      );

    case "audio": {
      if (c.mode === "spotify") {
        const embed = toSpotifyEmbed(c.spotifyUrl);
        return cardWrap(
          "audio",
          c.title,
          embed
            ? `<iframe src="${embed}" width="100%" height="152" style="border:0;border-radius:12px;margin-bottom:8px" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
               <a href="${escapeHtml(c.spotifyUrl)}" target="_blank" class="text-xs text-green-400 hover:text-green-300 underline flex items-center justify-center gap-1">Auf Spotify öffnen</a>`
            : `<p class="modal-muted">Spotify-Link konnte nicht eingebettet werden.</p>`
        );
      }
      return cardWrap(
        "audio",
        c.title,
        c.fileUrl ? `<audio controls autoplay class="audio-player"><source src="${c.fileUrl}" /></audio>` : `<p class="modal-muted">Keine Audiodatei hinterlegt.</p>`
      );
    }

    case "gallery":
      return cardWrap(
        "gallery",
        c.caption,
        `<div class="gallery-grid">${(c.images || []).map((url) => `<img src="${url}" class="gallery-img" alt="" />`).join("")}</div>`
      );

    case "scratchcard":
      return cardWrap(
        "scratchcard",
        null,
        `<div class="scratch-wrap">
          <div class="scratch-under">${escapeHtml(c.message)}</div>
          <canvas id="scratch-canvas"></canvas>
        </div>
        <p class="modal-muted" style="margin-top:10px">${escapeHtml(c.revealLabel || "Hier rubbeln!")}</p>`
      );

    case "quiz":
      return cardWrap(
        "quiz",
        c.question,
        `<div id="quiz-options">
          ${(c.options || []).map((opt, i) => `<button data-idx="${i}" class="quiz-option">${escapeHtml(opt)}</button>`).join("")}
        </div>
        <p id="quiz-result" class="quiz-result hidden"></p>
        ${c.prizeText ? `
        <div id="quiz-prize" class="quiz-prize hidden">
          <div class="quiz-prize-icon">🏆</div>
          <div class="quiz-prize-text">${escapeHtml(c.prizeText)}</div>
          ${c.prizeCoins ? `<div class="quiz-prize-coins">+${c.prizeCoins} Münzen</div>` : ''}
        </div>` : ''}`
      );

    case "countdown":
      return cardWrap(
        "countdown",
        c.eventTitle,
        `<p class="modal-muted" style="margin-bottom:12px">${escapeHtml(c.description)}</p>
         <div id="countdown-display" class="countdown-num">…</div>`
      );

    case "challenge":
      return cardWrap(
        "challenge",
        "Tages-Aufgabe",
        `<div style="background: var(--modal-accent, rgba(128,128,128,0.1)); color: var(--modal-bg, #fff); padding: 24px; border-radius: 12px; margin-bottom: 24px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
           <p class="modal-text" style="font-weight: 700; font-size: 1.25rem; margin: 0;">${escapeHtml(c.task)}</p>
         </div>
         <button id="challenge-btn" class="challenge-btn" style="width: 100%; padding: 16px; border-radius: 12px; font-weight: bold; background: var(--modal-text, #333); color: var(--modal-bg, #fff); border: none; font-size: 1.1rem; transition: transform 0.2s; cursor: pointer;">${escapeHtml(c.btnText || "Erledigt!")}</button>
         <p id="challenge-success" class="modal-muted hidden mt-4" style="color: #10b981; font-weight: bold; text-align: center; font-size: 1.1rem;">${escapeHtml(c.successMessage)}</p>`
      );

    case "memory": {
      const allImages = [...(c.images || []), ...(c.images || [])];
      // Shuffle
      for (let i = allImages.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allImages[i], allImages[j]] = [allImages[j], allImages[i]];
      }
      return cardWrap(
        "memory",
        "Memory",
        `<p class="modal-muted mb-4">Finde alle Pärchen!</p>
         <div id="memory-grid" class="memory-grid">
           ${allImages.map((src, idx) => `
             <div class="memory-card" data-idx="${idx}" data-src="${src}">
               <div class="memory-card-inner">
                 <div class="memory-card-front">?</div>
                 <div class="memory-card-back"><img src="${src}" alt="memory img"/></div>
               </div>
             </div>
           `).join("")}
         </div>
         <p id="memory-success" class="modal-muted hidden mt-4" style="color: #10b981; font-weight: bold;">${escapeHtml(c.successMessage)}</p>`
      );
    }

    case "location":
      return cardWrap(
        "location",
        "Gefunden!",
        `<p class="modal-muted mb-4">Du warst am richtigen Ort.</p>
         <p class="modal-text" style="color: #10b981; font-weight: bold;">${escapeHtml(c.successMessage)}</p>`
      );

    case "giveaway":
      return cardWrap(
        "giveaway",
        c.title,
        `<p class="modal-muted mb-4" style="text-align: center; margin-bottom: 24px;">${escapeHtml(c.description)}</p>
         <div id="giveaway-form" style="display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 300px; margin: 0 auto;">
           <input type="email" id="giveaway-email" placeholder="Deine E-Mail Adresse" style="width: 100%; padding: 14px 16px; border-radius: 12px; border: 2px solid rgba(128,128,128,0.2); background: rgba(128,128,128,0.05); color: var(--modal-text); font-family: inherit; font-size: 1rem; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='var(--modal-accent)'" onblur="this.style.borderColor='rgba(128,128,128,0.2)'" />
           <button id="giveaway-btn" style="width: 100%; padding: 16px; border-radius: 12px; border: none; background: var(--modal-text, #333); color: var(--modal-bg, #fff); font-weight: bold; font-size: 1.1rem; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">Am Gewinnspiel teilnehmen</button>
         </div>
         <p id="giveaway-success" class="modal-muted hidden mt-4" style="color: #10b981; font-weight: bold; text-align: center;">${escapeHtml(c.successMessage)}</p>`
      );

    case "puzzle":
      return cardWrap(
        "puzzle",
        "Schiebepuzzle",
        `<p class="modal-muted mb-4 text-center" style="text-align: center;">Löse das Puzzle, um das ganze Bild zu sehen!</p>
         <div id="puzzle-container" style="width: 280px; height: 280px; position: relative; margin: 0 auto; background: rgba(128,128,128,0.1); padding: 8px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);"></div>
         <p id="puzzle-success" class="modal-muted hidden mt-4" style="color: #10b981; font-weight: bold; text-align: center;">${escapeHtml(c.successMessage)}</p>`
      );

    case "ar":
      return cardWrap(
        "ar",
        c.title,
        `<p class="modal-muted mb-4" style="text-align: center;">Tippe auf das AR-Symbol unten rechts, um das Modell im echten Raum zu platzieren!<br><span style="font-size: 0.85em; opacity: 0.8;">(Hinweis: Das AR-Symbol erscheint nur auf Smartphones und Tablets)</span></p>
         <div style="width:100%;height:300px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,0.1)">
           <model-viewer src="${escapeHtml(c.modelUrl)}" ar ar-modes="webxr scene-viewer quick-look" camera-controls auto-rotate style="width:100%;height:100%;"></model-viewer>
         </div>`
      );

    case "catcher":
      return cardWrap(
        "catcher",
        c.title,
        `<p class="modal-muted mb-2">Fange ${c.targetScore} Geschenke!</p>
         <div id="catcher-container" style="position:relative;width:100%;height:300px;background:#1e293b;border-radius:12px;overflow:hidden;touch-action:none;">
           <canvas id="catcher-canvas" style="width:100%;height:100%;display:block;"></canvas>
           <div id="catcher-score" style="position:absolute;top:10px;left:10px;font-weight:bold;color:white;font-size:1.2rem;">0 / ${c.targetScore}</div>
         </div>
         <p id="catcher-success" class="modal-muted hidden mt-4" style="color: #10b981; font-weight: bold;">Gewonnen! 🎉</p>`
      );

    case "product":
      return cardWrap(
        "product",
        "Für Dich",
        `<div style="background: rgba(128,128,128,0.05); border: 1px solid rgba(128,128,128,0.2); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; padding: 24px; margin: 0 auto; max-width: 320px;">
           ${c.image ? `<img src="${escapeHtml(c.image)}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 12px; margin-bottom: 20px;" onerror="this.style.display='none'" />` : ''}
           <h3 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 12px; text-align: center;">${escapeHtml(c.title)}</h3>
           <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 20px;">
             ${c.oldPrice ? `<span style="color: #ef4444; text-decoration: line-through; font-size: 1rem;">${escapeHtml(c.oldPrice)} CHF</span>` : ''}
             ${c.newPrice ? `<span style="font-size: 1.75rem; font-weight: 900; color: #10b981;">${escapeHtml(c.newPrice)} CHF</span>` : ''}
           </div>
           ${c.discount ? `<div style="background: rgba(99, 102, 241, 0.1); color: #6366f1; border: 2px dashed rgba(99, 102, 241, 0.5); font-family: monospace; padding: 8px 16px; border-radius: 8px; margin-bottom: 24px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 8px;"><span>🏷️</span> ${escapeHtml(c.discount)}</div>` : ''}
           ${c.url ? `<a href="${escapeHtml(c.url)}" target="_blank" style="width: 100%; text-align: center; background: var(--modal-accent, #10b981); color: var(--modal-bg, #fff); font-weight: bold; padding: 14px 24px; border-radius: 12px; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">Zum Shop <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg></a>` : ''}
         </div>`
      );

    case "choice": {
      const alreadyChosen = calendarMeta.choices && calendarMeta.choices[dayNum];
      return cardWrap(
        "choice",
        "Wähle weise...",
        `<p class="modal-muted mb-6 text-lg" style="text-align: center; margin-bottom: 24px; font-size: 1.1rem;">${escapeHtml(c.question)}</p>
         ${alreadyChosen ? 
            `<div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 16px; border-radius: 12px; text-align: center; color: var(--modal-text);">Du hast dich für <b>Option ${alreadyChosen}</b> entschieden.</div>` :
            `<div style="display: flex; flex-direction: column; gap: 12px;">
               <button onclick="submitChoice(${dayNum}, 'A')" style="width: 100%; text-align: left; background: rgba(128,128,128,0.05); border: 2px solid rgba(128,128,128,0.2); color: var(--modal-text); font-weight: bold; padding: 16px; border-radius: 12px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 16px; font-size: 1.1rem;" onmouseover="this.style.background='var(--modal-accent)'; this.style.color='var(--modal-bg)'; this.style.borderColor='var(--modal-accent)'" onmouseout="this.style.background='rgba(128,128,128,0.05)'; this.style.color='var(--modal-text)'; this.style.borderColor='rgba(128,128,128,0.2)'"><span style="background: rgba(128,128,128,0.2); border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">A</span> ${escapeHtml(c.optionA)}</button>
               <button onclick="submitChoice(${dayNum}, 'B')" style="width: 100%; text-align: left; background: rgba(128,128,128,0.05); border: 2px solid rgba(128,128,128,0.2); color: var(--modal-text); font-weight: bold; padding: 16px; border-radius: 12px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 16px; font-size: 1.1rem;" onmouseover="this.style.background='var(--modal-accent)'; this.style.color='var(--modal-bg)'; this.style.borderColor='var(--modal-accent)'" onmouseout="this.style.background='rgba(128,128,128,0.05)'; this.style.color='var(--modal-text)'; this.style.borderColor='rgba(128,128,128,0.2)'"><span style="background: rgba(128,128,128,0.2); border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">B</span> ${escapeHtml(c.optionB)}</button>
             </div>`
         }`
      );
    }

    case "coins": {
      if (!isPreview && !door.coinsClaimed) {
        door.coinsClaimed = true;
        userCoins += (c.coinAmount || 50);
        saveUserCoins();
      }
      updateCoinDisplay();
      return cardWrap(
        "coins",
        "Münz-Schatz gefunden!",
        `<div style="text-align: center; padding: 32px; background: rgba(245, 158, 11, 0.1); border-radius: 16px; border: 1px solid rgba(245, 158, 11, 0.3);">
          <div style="font-size: 3.75rem; margin-bottom: 16px;">🪙</div>
          <h3 style="font-size: 1.5rem; font-weight: 900; color: #f59e0b; margin-bottom: 8px;">+${escapeHtml(c.coinAmount || 50)} Münzen</h3>
          <p class="modal-muted">Du kannst diese Münzen oben rechts im Nordpol-Shop ausgeben!</p>
         </div>`
      );
    }
    
    case "diary": {
      const savedAns = localStorage.getItem(`diary_${routeId}_${dayNum}`) || "";
      let html = `<p class="modal-muted mb-4" style="text-align: center; margin-bottom: 24px; font-size: 1.1rem; font-style: italic;">${escapeHtml(c.diaryQuestion)}</p>
         <div style="display: flex; flex-direction: column; gap: 12px; width: 100%; margin: 0 auto;">
           <textarea id="diary-ans-${dayNum}" rows="4" placeholder="Deine Antwort..." style="width: 100%; padding: 16px; border-radius: 12px; border: 2px solid rgba(128,128,128,0.2); background: rgba(128,128,128,0.05); color: var(--modal-text); font-family: inherit; font-size: 1rem; outline: none; transition: border-color 0.2s; resize: vertical;" onfocus="this.style.borderColor='var(--modal-accent)'" onblur="this.style.borderColor='rgba(128,128,128,0.2)'">${escapeHtml(savedAns)}</textarea>
           <button onclick="saveDiary(${dayNum})" style="width: 100%; padding: 16px; border-radius: 12px; border: none; background: var(--modal-accent, #10b981); color: var(--modal-bg, #fff); font-weight: bold; font-size: 1.1rem; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">Eintrag speichern ✍🏽</button>`;
      
      if (dayNum === 24) {
        html += `<button onclick="printDiaryPdf()" style="width: 100%; padding: 16px; border-radius: 12px; border: 2px dashed var(--modal-accent); background: transparent; color: var(--modal-text); font-weight: bold; font-size: 1.1rem; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 4px;" onmouseover="this.style.background='rgba(128,128,128,0.1)'" onmouseout="this.style.background='transparent'"><span>🖨️</span> Gesamtes Tagebuch drucken</button>`;
      }
      
      html += `</div>`;
      return cardWrap("diary", "Dein Advents-Tagebuch", html);
    }

    case "printplay": {
      return cardWrap(
        "printplay",
        escapeHtml(c.ppTitle || "Spielteil"),
        `<div class="text-center">
           <img src="${escapeHtml(c.ppImage)}" class="w-full max-w-sm mx-auto rounded-xl border-4 border-white/20 mb-4" />
           <button onclick="window.print()" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-xl w-full shadow-lg">🖨️ Ausdrucken (Print & Play)</button>
         </div>`
      );
    }

    case "timecapsule": {
      return cardWrap(
        "timecapsule",
        "Zeitreise ins nächste Jahr ⏳",
        `<p class="modal-muted mb-4">Hinterlasse eine Nachricht für dich selbst. Wir speichern sie sicher und erinnern dich nächstes Jahr am 1. Dezember daran!</p>
         <textarea id="tc-msg" rows="4" class="w-full bg-slate-800 border border-white/10 rounded-xl p-3 text-white mb-4" placeholder="Liebes Zukunfts-Ich..."></textarea>
         <button onclick="saveTimeCapsule(${dayNum})" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">Nachricht in die Zukunft senden 🚀</button>`
      );
    }

    case "duel": {
      return cardWrap(
        "duel",
        "Schneeball-Duell! ⛄",
        `<div id="duel-ui" class="text-center p-6 bg-blue-900/30 rounded-2xl border border-blue-500/30">
          <p class="mb-4 text-blue-200">Suche Gegner für ein Live-Duell...</p>
          <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <button onclick="startDuelSearch(${dayNum})" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95">Spielersuche starten</button>
        </div>`
      );
    }

    case "iot-box": {
      return cardWrap(
        "iot-box",
        "Die physische Schatztruhe 📦",
        `<div id="iot-ui" style="text-align: center; padding: 24px; background: rgba(128,128,128,0.1); border-radius: 16px; border: 1px solid rgba(128,128,128,0.2);">
          <p class="modal-muted" style="margin-bottom: 16px;">Dieser Inhalt ist an eine echte Bluetooth-Schatzkiste gekoppelt!</p>
          <div style="font-size: 3.75rem; margin-bottom: 24px;">🧲</div>
          <button onclick="connectIotBox()" style="width: 100%; padding: 16px; border-radius: 12px; border: none; background: #0ea5e9; color: #fff; font-weight: bold; font-size: 1.1rem; cursor: pointer; transition: transform 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
            <span>Bluetooth Scanner starten</span>
          </button>
        </div>`
      );
    }

    case "spotify-collab": {
      const playlist = calendarMeta.playlist || [];
      const hasAdded = localStorage.getItem(`spotify_${routeId}_${dayNum}`) === "true";
      
      let html = `<div style="background: rgba(0,0,0,0.5); padding: 24px; border-radius: 16px; border: 1px solid rgba(16, 185, 129, 0.3); color: #fff;">
        <h3 style="font-size: 1.25rem; font-weight: bold; color: #4ade80; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;"><span>🎵</span> Familien-Playlist</h3>`;
        
      if (!hasAdded || isPreview) {
        html += `<div style="margin-bottom: 24px;">
          <p style="font-size: 0.875rem; color: #cbd5e1; margin-bottom: 8px;">Suche einen Song auf Spotify und füge ihn zur gemeinsamen Playlist hinzu!${calendarMeta.spotifyConnected ? " Er landet direkt in der echten Spotify-Playlist." : ""}</p>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="spotify-search" data-day="${dayNum}" placeholder="z.B. Last Christmas..." style="flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 9999px; padding: 8px 16px; color: #fff; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#10b981'" onblur="this.style.borderColor='rgba(255,255,255,0.2)'">
            <button onclick="searchSpotify(${dayNum})" style="background: #10b981; color: #000; font-weight: bold; padding: 8px 16px; border-radius: 9999px; border: none; cursor: pointer;">Suchen</button>
          </div>
          <div id="spotify-results" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;"></div>
        </div>`;
      } else {
        html += `<p class="text-sm text-green-300 mb-6 font-bold">Du hast bereits einen Song beigetragen!</p>`;
      }
      
      if (c.playlistUrl) {
        html += `<a href="${escapeHtml(c.playlistUrl)}" target="_blank" rel="noopener" style="display: flex; align-items: center; justify-content: center; gap: 8px; box-sizing: border-box; width: 100%; margin: 0 auto; background: #1DB954; color: #000; font-weight: bold; text-align: center; padding: 12px 16px; border-radius: 9999px; text-decoration: none; box-shadow: 0 4px 15px rgba(0,0,0,0.2); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
           <svg style="width: 20px; height: 20px;" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.47-.077-.334.132-.67.47-.745 3.808-.87 7.076-.496 9.712 1.115.293.18.386.563.207.856zm1.2-3.15c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.13-9.965-1.166-.413.127-.848-.106-.973-.517-.125-.413.108-.848.52-.973 3.632-1.1 8.147-.568 11.234 1.328.366.226.48.706.256 1.072zm.106-3.297C14.67 8 10.513 7.784 7.234 8.78c-.487.148-1-.13-1.148-.616-.148-.488.13-1 .616-1.15C10.457 5.88 15.115 6.13 18.733 8.275c.427.25.57.81.318 1.237-.253.427-.81.57-1.238.318z"/></svg>
           Playlist auf Spotify öffnen
         </a>`;
      }
      
      html += `<div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; margin-top: 16px;">
        <h4 style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.08em;">Aktuelle Playlist (${playlist.length} Songs)</h4>
        <div class="slim-scroll" style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; padding-right: 6px;">`;

      if (playlist.length === 0) {
        html += `<p style="color: #64748b; font-style: italic; font-size: 0.875rem; margin: 0;">Die Playlist ist noch leer.</p>`;
      } else {
        playlist.forEach((song, i) => {
          html += `<div style="display: flex; align-items: center; gap: 12px; background: rgba(30,41,59,0.6); padding: 8px; border-radius: 10px;">
            <div style="color: #64748b; width: 16px; text-align: right; font-size: 0.75rem; font-family: ui-monospace, monospace; flex-shrink: 0;">${i + 1}</div>
            ${song.image
              ? `<img src="${escapeHtml(song.image)}" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex-shrink:0;">`
              : `<div style="width:36px;height:36px;border-radius:6px;background:#334155;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;">♪</div>`}
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 700; font-size: 0.875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${song.url ? `<a href="${escapeHtml(song.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${escapeHtml(song.title)}</a>` : escapeHtml(song.title)}</div>
              <div style="font-size: 0.75rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(song.artist)}</div>
            </div>
            <div style="font-size: 0.7rem; background: #334155; color: #cbd5e1; padding: 3px 8px; border-radius: 6px; flex-shrink: 0;">Tag ${song.day}</div>
          </div>`;
        });
      }

      html += `</div></div></div>`;
      return cardWrap("spotify-collab", "Gemeinsame Playlist", html);
    }

    case "empty":
    default:
      return cardWrap("empty", null, `<p class="modal-muted">Für Türchen ${dayNum} wurde noch keine Überraschung hinterlegt.</p>`);
  }
}

function wireContentInteractions(door) {
  const c = door.content || {};

  if (door.contentType === "gallery") {
    modalBody.querySelectorAll(".gallery-img").forEach((img) => {
      img.addEventListener("click", () => window.open(img.src, "_blank"));
    });
  }
  
  if (c.isScratchable || door.contentType === "scratchcard") {
    setupScratchcard();
  }
  
  if (door.contentType === "quiz") setupQuiz(c, door);
  if (door.contentType === "challenge") setupChallenge(door);
  if (door.contentType === "memory") setupMemory();
  if (door.contentType === "giveaway") setupGiveaway(c, door.day);
  if (door.contentType === "puzzle") setupPuzzle(c);
  if (door.contentType === "catcher") setupCatcher(c, door.day);

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

function setupQuiz(c, door) {
  const buttons = modalBody.querySelectorAll(".quiz-option");
  const resultEl = document.getElementById("quiz-result");
  const prizeEl = document.getElementById("quiz-prize");
  
  // Check if coins were already awarded for this door
  const prizeKey = door ? `quiz_prize_${routeId}_${door.day}` : null;
  const alreadyAwarded = prizeKey && localStorage.getItem(prizeKey) === "true";

  if (alreadyAwarded && prizeEl) {
    buttons.forEach((b) => (b.disabled = true));
    resultEl.textContent = "Bereits gelöst! 🌟";
    resultEl.classList.remove("hidden");
    prizeEl.classList.remove("hidden");
    return;
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => (b.disabled = true));
      const idx = parseInt(btn.dataset.idx, 10);
      const correct = idx === c.correctIndex;
      btn.classList.add(correct ? "correct" : "wrong");
      if (!correct && c.correctIndex >= 0 && c.correctIndex < buttons.length) {
        buttons[c.correctIndex].classList.add("correct");
      }
      resultEl.textContent = correct ? c.successMessage || "Richtig! ✨" : c.failMessage || "Leider falsch 😢 aber schön geraten!";
      resultEl.classList.remove("hidden");
      if (correct) {
        const rect = btn.getBoundingClientRect();
        field.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, theme.burstColors);
        
        if (prizeEl) {
          prizeEl.classList.remove("hidden");
        }
        
        if (c.prizeCoins && !alreadyAwarded) {
          const coins = parseInt(c.prizeCoins, 10);
          if (!isNaN(coins) && coins > 0) {
            userCoins += coins;
            saveUserCoins();
            updateCoinDisplay();
          }
          if (prizeKey) localStorage.setItem(prizeKey, "true");
        }
      }
    });
  });
}

function setupChallenge(door) {
  const btn = document.getElementById("challenge-btn");
  const success = document.getElementById("challenge-success");
  if (!btn) return;

  // Use the exact day of the door currently shown in the modal
  const dayNum = door ? door.day : null;
  const doorScene = dayNum ? document.querySelector(`.door-scene[data-day="${dayNum}"]`) : null;
  const completedKey = dayNum ? `challenge_done_${routeId}_${dayNum}` : null;

  // Restore completed state from localStorage (e.g. after page reload)
  if (completedKey && localStorage.getItem(completedKey) === "true") {
    btn.classList.add("hidden");
    success.classList.remove("hidden");
    if (doorScene) doorScene.classList.add("is-done");
  }

  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.classList.add("hidden");
    success.classList.remove("hidden");
    const rect = success.getBoundingClientRect();
    field.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, theme.burstColors);
    if (window.atmosphere) window.atmosphere.playMagicChime();

    // Mark the door green and persist
    if (doorScene) doorScene.classList.add("is-done");
    if (completedKey) localStorage.setItem(completedKey, "true");
  });
}

function setupMemory() {
  const cards = document.querySelectorAll(".memory-card");
  const success = document.getElementById("memory-success");
  let flipped = [];
  let matchedCount = 0;

  cards.forEach(card => {
    card.addEventListener("click", () => {
      if (flipped.length === 2 || card.classList.contains("flipped") || card.classList.contains("matched")) return;
      
      card.classList.add("flipped");
      flipped.push(card);
      if (window.atmosphere) window.atmosphere.playClickSound();

      if (flipped.length === 2) {
        const src1 = flipped[0].dataset.src;
        const src2 = flipped[1].dataset.src;

        if (src1 === src2) {
          flipped.forEach(c => c.classList.add("matched"));
          flipped = [];
          matchedCount += 2;
          
          const rect = card.getBoundingClientRect();
          field.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, theme.burstColors);
          if (window.atmosphere) window.atmosphere.playMagicChime();

          if (matchedCount === cards.length) {
            setTimeout(() => {
              success.classList.remove("hidden");
            }, 500);
          }
        } else {
          setTimeout(() => {
            flipped.forEach(c => c.classList.remove("flipped"));
            flipped = [];
          }, 1000);
        }
      }
    });
  });
}

function setupGiveaway(c, dayNum) {
  const btn = document.getElementById("giveaway-btn");
  const emailInput = document.getElementById("giveaway-email");
  const success = document.getElementById("giveaway-success");
  const form = document.getElementById("giveaway-form");
  
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) return showLockToast("Bitte E-Mail eingeben.");
    btn.disabled = true;
    try {
      await fetchJson(`/api/calendar/${routeId}/days/${dayNum}/giveaway`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      form.classList.add("hidden");
      success.classList.remove("hidden");
      const rect = success.getBoundingClientRect();
      field.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, theme.burstColors);
      if (window.atmosphere) window.atmosphere.playMagicChime();
    } catch (e) {
      showLockToast(e.message);
      btn.disabled = false;
    }
  });
}

function setupPuzzle(c) {
  const container = document.getElementById("puzzle-container");
  const success = document.getElementById("puzzle-success");
  if (!container || !c.imageUrl) return;

  const size = 3;
  let tiles = [];
  let emptyTile = { x: size - 1, y: size - 1 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x === size - 1 && y === size - 1) continue;
      tiles.push({ x, y, bgX: x, bgY: y });
    }
  }

  // Shuffle
  for (let i = 0; i < 50; i++) {
    const movable = tiles.filter(t => Math.abs(t.x - emptyTile.x) + Math.abs(t.y - emptyTile.y) === 1);
    if (movable.length > 0) {
      const tile = movable[Math.floor(Math.random() * movable.length)];
      const tx = emptyTile.x;
      const ty = emptyTile.y;
      emptyTile.x = tile.x;
      emptyTile.y = tile.y;
      tile.x = tx;
      tile.y = ty;
    }
  }

  const render = () => {
    container.innerHTML = "";
    tiles.forEach(t => {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.width = "33.33%";
      el.style.height = "33.33%";
      el.style.left = `${t.x * 33.33}%`;
      el.style.top = `${t.y * 33.33}%`;
      el.style.backgroundImage = `url(${c.imageUrl})`;
      el.style.backgroundSize = "300% 300%";
      el.style.backgroundPosition = `${t.bgX * 50}% ${t.bgY * 50}%`;
      el.style.transition = "all 0.2s ease";
      el.style.borderRadius = "4px";
      el.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.2)";
      el.style.cursor = "pointer";

      el.addEventListener("click", () => {
        if (Math.abs(t.x - emptyTile.x) + Math.abs(t.y - emptyTile.y) === 1) {
          const tx = emptyTile.x;
          const ty = emptyTile.y;
          emptyTile.x = t.x;
          emptyTile.y = t.y;
          t.x = tx;
          t.y = ty;
          render();
          checkWin();
        }
      });
      container.appendChild(el);
    });
  };

  const checkWin = () => {
    const isWin = tiles.every(t => t.x === t.bgX && t.y === t.bgY);
    if (isWin) {
      setTimeout(() => {
        container.style.pointerEvents = "none";
        const el = document.createElement("div");
        el.style.position = "absolute";
        el.style.width = "33.33%";
        el.style.height = "33.33%";
        el.style.left = `${emptyTile.x * 33.33}%`;
        el.style.top = `${emptyTile.y * 33.33}%`;
        el.style.backgroundImage = `url(${c.imageUrl})`;
        el.style.backgroundSize = "300% 300%";
        el.style.backgroundPosition = "100% 100%";
        el.style.borderRadius = "4px";
        container.appendChild(el);
        success.classList.remove("hidden");
        const rect = container.getBoundingClientRect();
        field.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, theme.burstColors);
        if (window.atmosphere) window.atmosphere.playMagicChime();
      }, 300);
    }
  };

  render();
}

function setupCatcher(c, dayNum) {
  const canvas = document.getElementById("catcher-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const parent = canvas.parentElement;
  
  canvas.width = parent.clientWidth;
  canvas.height = parent.clientHeight;
  
  let score = 0;
  const target = c.targetScore || 20;
  const scoreEl = document.getElementById("catcher-score");
  const success = document.getElementById("catcher-success");
  
  let basket = { x: canvas.width / 2 - 25, y: canvas.height - 40, w: 50, h: 30 };
  let items = [];
  let isRunning = true;
  let raf;

  // Move basket
  const moveBasket = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    basket.x = Math.max(0, Math.min(canvas.width - basket.w, x - basket.w / 2));
  };
  canvas.addEventListener("mousemove", moveBasket);
  canvas.addEventListener("touchmove", (e) => { e.preventDefault(); moveBasket(e); }, { passive: false });

  const loop = () => {
    if (!isRunning) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw basket
    ctx.fillStyle = "#10b981";
    ctx.fillRect(basket.x, basket.y, basket.w, basket.h);
    
    // Spawn item
    if (Math.random() < 0.03) {
      items.push({ x: Math.random() * (canvas.width - 20), y: -20, w: 20, h: 20, speed: 2 + Math.random() * 3 });
    }
    
    // Update items
    for (let i = items.length - 1; i >= 0; i--) {
      let item = items[i];
      item.y += item.speed;
      
      // Draw item (gift)
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(item.x, item.y, item.w, item.h);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(item.x + 8, item.y, 4, item.h);
      ctx.fillRect(item.x, item.y + 8, item.w, 4);
      
      // Collision
      if (item.y + item.h >= basket.y && item.y <= basket.y + basket.h &&
          item.x + item.w >= basket.x && item.x <= basket.x + basket.w) {
        score++;
        scoreEl.textContent = `${score} / ${target}`;
        items.splice(i, 1);
        if (score >= target) {
          isRunning = false;
          success.classList.remove("hidden");
          const rect = canvas.getBoundingClientRect();
          field.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, theme.burstColors);
          if (window.atmosphere) window.atmosphere.playMagicChime();
          
          fetchJson(`/api/calendar/${routeId}/score`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: calendarMeta.recipientName, game: "Catcher", score: target, day: dayNum })
          }).catch(console.error);
        }
      } else if (item.y > canvas.height) {
        items.splice(i, 1);
      }
    }
    if (isRunning) raf = requestAnimationFrame(loop);
  };
  
  // Cleanup on modal close
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.attributeName === "class" && contentModal.classList.contains("hidden")) {
        isRunning = false;
        cancelAnimationFrame(raf);
        observer.disconnect();
      }
    });
  });
  observer.observe(contentModal, { attributes: true });
  
  loop();
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
      const list = u.searchParams.get("list");
      const listParam = list ? `?list=${list}` : "";
      return id ? `https://www.youtube.com/embed/${id}${listParam}` : url;
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

window.submitChoice = async function(day, option) {
  if (isPreview) return alert("Vorschau: Option " + option + " gewählt.");
  try {
    await fetchJson(`/api/calendar/${routeId}/choice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, option })
    });
    if (!calendarMeta.choices) calendarMeta.choices = {};
    calendarMeta.choices[day] = option;
    
    // Re-render modal to show selection
    const door = days.find((d) => d.day === day);
    openContentModal(door);
    
    // Re-render grid to apply any condition updates
    renderDoorGrid();
  } catch (err) {
    alert("Fehler beim Speichern: " + err.message);
  }
};

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

window.saveDiary = function(day) {
  const ans = document.getElementById(`diary-ans-${day}`).value;
  localStorage.setItem(`diary_${routeId}_${day}`, ans);
  alert("Tagebucheintrag gespeichert!");
};

window.printDiaryPdf = function() {
  const printWin = window.open('', '_blank');
  let html = `<html><head><title>Jahresrückblick</title><style>body{font-family:serif;padding:40px;line-height:1.6;}h1{text-align:center;} .entry{margin-bottom:30px;} .q{font-weight:bold;margin-bottom:10px;} .a{font-style:italic;color:#333;}</style></head><body><h1>Mein Advents-Tagebuch</h1>`;
  
  days.filter(d => d.contentType === "diary").sort((a,b) => a.day - b.day).forEach(d => {
    const ans = localStorage.getItem(`diary_${routeId}_${d.day}`) || "(kein Eintrag)";
    html += `<div class="entry"><div class="q">Tag ${d.day}: ${escapeHtml(d.content.diaryQuestion || '')}</div><div class="a">${escapeHtml(ans)}</div></div>`;
  });
  
  html += `</body></html>`;
  printWin.document.write(html);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => printWin.print(), 500);
};

window.saveTimeCapsule = async function(day) {
  const msg = document.getElementById("tc-msg").value;
  if (!msg.trim()) return alert("Bitte schreibe eine Nachricht!");
  try {
    await fetchJson(`/api/calendar/${routeId}/capsule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg })
    });
    alert("Deine Nachricht wurde sicher verschlossen und wird dir in exakt 1 Jahr zugestellt! 🚀");
  } catch (err) {
    alert("Fehler: " + err.message);
  }
};

window.startDuelSearch = function(day) {
  if (isPreview) return alert("Vorschau: Duell wird übersprungen.");
  const ui = document.getElementById("duel-ui");
  ui.innerHTML = `<p class="mb-4 text-blue-200">Warte auf Gegner...</p><div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>`;
  
  if (socket) {
    socket.emit("join_duel", { calendarId: routeId, day });
    
    socket.once("start_duel", () => {
      let myScore = 0;
      let oppScore = 0;
      let timeLeft = 10;
      let intv;
      
      const renderDuel = () => {
        ui.innerHTML = `
          <h3 class="text-2xl font-black text-white mb-2">SCHNEEBALLSCHLACHT!</h3>
          <div class="text-4xl font-mono text-emerald-400 mb-4">00:${timeLeft.toString().padStart(2, '0')}</div>
          <div class="flex justify-between items-center bg-black/30 rounded-xl p-4 mb-6">
            <div class="text-center w-1/2 border-r border-white/10">
              <div class="text-xs text-blue-300 uppercase font-bold">Du</div>
              <div class="text-3xl font-black text-white" id="duel-me">${myScore}</div>
            </div>
            <div class="text-center w-1/2">
              <div class="text-xs text-rose-300 uppercase font-bold">Gegner</div>
              <div class="text-3xl font-black text-white" id="duel-opp">${oppScore}</div>
            </div>
          </div>
          <button id="duel-throw" class="w-full h-24 bg-blue-500 hover:bg-blue-400 active:bg-white active:scale-95 text-white font-black text-2xl rounded-2xl shadow-[0_10px_0_#1e3a8a] active:shadow-[0_0px_0_#1e3a8a] active:translate-y-[10px] transition-all">❄️ WIRF!</button>
        `;
        
        document.getElementById("duel-throw").onclick = () => {
          myScore++;
          document.getElementById("duel-me").textContent = myScore;
          socket.emit("snowball_hit", { calendarId: routeId, day });
        };
      };
      
      socket.on("opponent_hit", () => {
        oppScore++;
        const oppEl = document.getElementById("duel-opp");
        if (oppEl) oppEl.textContent = oppScore;
      });
      
      renderDuel();
      
      intv = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
          clearInterval(intv);
          socket.off("opponent_hit");
          if (myScore > oppScore) {
            ui.innerHTML = `<h3 class="text-3xl font-black text-emerald-400 mb-4">GEWONNEN! 🏆</h3><p class="text-white mb-4">Du hast deinen Gegner besiegt.</p><button onclick="alert('Inhalt freigeschaltet! (Dies ist eine Simulation)')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg w-full">Geschenk öffnen</button>`;
          } else if (myScore < oppScore) {
            ui.innerHTML = `<h3 class="text-3xl font-black text-rose-400 mb-4">VERLOREN! 🧊</h3><p class="text-white">Dein Gegner war schneller. Komm morgen wieder oder nutze den Shop.</p>`;
          } else {
            ui.innerHTML = `<h3 class="text-3xl font-black text-amber-400 mb-4">UNENTSCHIEDEN! 🤝</h3><p class="text-white">Beide waren gleich schnell.</p>`;
          }
        } else {
          renderDuel();
        }
      }, 1000);
    });
  } else {
    alert("Keine Live-Verbindung zum Server.");
  }
};

window.connectIotBox = async function() {
  if (!navigator.bluetooth) {
    alert("Dein Browser unterstützt Web-Bluetooth nicht. Versuche es mit Google Chrome auf Android oder Desktop!");
    return;
  }
  
  try {
    const ui = document.getElementById("iot-ui");
    ui.innerHTML = `<p class="mb-4 text-emerald-300 animate-pulse">Suche nach Geräten...</p>`;
    
    // We request ANY device for simulation purposes, using battery_service as a common filter
    // Note: User MUST click a device in the native OS prompt to proceed
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['battery_service']
    });
    
    // Simulate connection and sending unlock command
    ui.innerHTML = `<p class="mb-4 text-emerald-300">Verbinde mit ${escapeHtml(device.name || "Schatztruhe")}...</p>`;
    
    setTimeout(() => {
      ui.innerHTML = `
        <div class="text-6xl mb-6 animate-bounce">🔓</div>
        <h3 class="text-2xl font-black text-emerald-400 mb-2">Truhe geöffnet!</h3>
        <p class="text-slate-300">Das Bluetooth-Signal (0xFF) wurde erfolgreich gesendet.</p>
      `;
    }, 2000);
    
  } catch (err) {
    const ui = document.getElementById("iot-ui");
    ui.innerHTML = `<p class="text-rose-400 font-bold mb-4">Verbindung abgebrochen.</p><button onclick="connectIotBox()" class="bg-emerald-600 text-white py-2 px-4 rounded-xl">Nochmal versuchen</button>`;
    console.error(err);
  }
};

let spotifySearchResults = [];

window.searchSpotify = async function(day) {
  const query = document.getElementById("spotify-search").value.trim();
  const resEl = document.getElementById("spotify-results");
  if (query.length < 2) return;

  resEl.innerHTML = `<div class="animate-pulse text-sm text-green-300">Suche auf Spotify...</div>`;

  const auth = isPreview ? `calendarId=${encodeURIComponent(routeId)}` : `cal=${encodeURIComponent(routeId)}`;
  try {
    const data = await fetchJson(`/api/spotify/search?q=${encodeURIComponent(query)}&${auth}`);
    spotifySearchResults = data.tracks || [];
  } catch (err) {
    resEl.innerHTML = `<p class="text-sm text-rose-300">${escapeHtml(err.message)}</p>`;
    return;
  }

  if (spotifySearchResults.length === 0) {
    resEl.innerHTML = `<p class="text-sm text-rose-300">Nichts gefunden – probier einen anderen Suchbegriff.</p>`;
    return;
  }

  resEl.innerHTML = spotifySearchResults.map((s, i) => `
    <div class="flex items-center gap-3 bg-slate-800 p-2 rounded-lg border border-white/5 hover:border-green-500/50 transition-colors">
      ${s.image ? `<img src="${escapeHtml(s.image)}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;">` : `<div style="width:40px;height:40px;border-radius:6px;background:#334155;flex-shrink:0;"></div>`}
      <div class="flex-1 min-w-0 mr-2">
        <div class="font-bold text-sm truncate text-white">${escapeHtml(s.title)}</div>
        <div class="text-xs text-slate-400 truncate">${escapeHtml(s.artist)}${s.album ? ` · ${escapeHtml(s.album)}` : ""}</div>
      </div>
      <button onclick="addSpotifySong(${day}, ${i})" style="flex-shrink:0;background:#1DB954;color:#000;font-size:0.75rem;font-weight:700;padding:6px 16px;border-radius:9999px;border:none;cursor:pointer;letter-spacing:0.04em;box-shadow:0 2px 8px rgba(29,185,84,0.35);transition:transform 0.15s,box-shadow 0.15s;" onmouseover="this.style.transform='scale(1.07)'" onmouseout="this.style.transform='scale(1)'">+ Hinzufügen</button>
    </div>
  `).join("");
};

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target?.id === "spotify-search") {
    e.preventDefault();
    const day = parseInt(document.getElementById("spotify-search").dataset.day, 10);
    if (day) searchSpotify(day);
  }
});

window.addSpotifySong = async function(day, index) {
  const track = spotifySearchResults[index];
  if (!track) return;
  try {
    const playlistUrl = isPreview
      ? `/api/admin/calendars/${routeId}/playlist`
      : `/api/calendar/${routeId}/playlist`;
    const data = await fetchJson(playlistUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, title: track.title, artist: track.artist, trackUri: track.uri, url: track.url, image: track.image }),
    });

    localStorage.setItem(`spotify_${routeId}_${day}`, "true");
    if (!calendarMeta.playlist) calendarMeta.playlist = [];
    calendarMeta.playlist.push({ day, title: track.title, artist: track.artist, url: track.url, image: track.image });

    const door = days.find((d) => d.day === day);
    openContentModal(door);

    const result = data.spotify || {};
    if (isPreview && !result.added) {
      showLockToast(`Nicht in Spotify eingetragen: ${result.reason || "unbekannter Fehler"} (Details im Editor)`);
    }
  } catch (err) {
    alert("Fehler: " + err.message);
  }
};

// Bootstrap: resolve custom-domain token first, then initialise the calendar.
(async () => {
  await resolveRouteId();
  if (routeId) init();
})();
