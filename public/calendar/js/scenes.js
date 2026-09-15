// Builds the physical/realistic backdrop layers for each theme.
// Background images are now real high-res assets generated via AI.

function buildScene(themeKey, meta) {
  const hour = new Date().getHours();
  let timeOverlay = "";
  if (hour < 7 || hour >= 20) {
    timeOverlay = `<div style="position:absolute;inset:0;background:rgba(0,10,30,0.5);mix-blend-mode:multiply;pointer-events:none;z-index:0;"></div>`; // Night
  } else if (hour >= 7 && hour < 10) {
    timeOverlay = `<div style="position:absolute;inset:0;background:rgba(255,200,150,0.2);mix-blend-mode:overlay;pointer-events:none;z-index:0;"></div>`; // Dawn
  } else if (hour >= 17 && hour < 20) {
    timeOverlay = `<div style="position:absolute;inset:0;background:rgba(255,100,50,0.2);mix-blend-mode:color-burn;pointer-events:none;z-index:0;"></div>`; // Dusk
  }

  switch (themeKey) {
    case "partner": // Romantisch (Sternenhimmel)
      return `
        <div class="theme-bg" style="background-image: url('/calendar/img/romantic.png');"></div>
        <div class="ambient-glow"></div>
        ${timeOverlay}
      `;
    case "kid": // Verspielt (Winterdorf)
      return `
        <div class="theme-bg" style="background-image: url('/calendar/img/village.png');"></div>
        ${timeOverlay}
      `;
    case "parents": // Klassisch (Holz)
      return `
        <div class="theme-bg" style="background-image: url('/calendar/img/wood.png');"></div>
        <div class="vignette-overlay"></div>
        ${timeOverlay}
      `;
    case "modern": // Apple-style Glassmorphism
      return `
        <div class="theme-bg" style="background-image: url('/calendar/img/modern.png');"></div>
        ${timeOverlay}
      `;
    case "firma": // Corporate
      const bg = meta?.customConfig?.bgUrl || "";
      return (bg ? `<div class="theme-bg" style="background-image: url('${escapeText(bg)}');"></div>` : `<div class="theme-bg" style="background-color: #f8fafc;"></div>`) + timeOverlay;
    default:
      return "";
  }
}

function buildGarlandForTheme(themeKey, width) {
  // We removed the old SVG garlands in favor of the clean real-image look.
  return "";
}

function renderHeader(themeKey, theme, meta) {
  const header = document.getElementById("calendar-header");
  const logo = meta?.customConfig?.logoUrl;
  const logoHtml = logo && themeKey === "firma" ? `<img src="${escapeText(logo)}" alt="Firmenlogo" class="firma-logo mx-auto mb-4" style="max-height: 80px; max-width: 200px; object-fit: contain;" />` : "";

  let headerTopHtml = `<div class="flex items-center justify-center gap-3 mb-4">`;
  if (meta.streak > 1) {
    headerTopHtml += `<div class="inline-flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full text-sm font-bold text-orange-400 border border-orange-400/30 backdrop-blur">
      🔥 ${meta.streak} Tage Streak!
    </div>`;
  }
  headerTopHtml += `<button id="btn-leaderboard" class="inline-flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full text-sm font-bold text-white border border-white/30 backdrop-blur hover:bg-white/20 transition-colors">
    🏆 Rangliste
  </button>`;
  headerTopHtml += `</div>`;

  if (theme.ornament) {
    header.innerHTML = `
      ${logoHtml}
      ${headerTopHtml}
      <div class="hero-eyebrow ornament">${escapeText(theme.eyebrow(meta))}</div>
      <h1 class="hero-title ornament-title">${escapeText(theme.title(meta))}</h1>
      <p class="hero-tagline">${escapeText(theme.tagline(meta))}</p>
    `;
  } else {
    header.innerHTML = `
      ${logoHtml}
      ${headerTopHtml}
      <div class="hero-eyebrow">${escapeText(theme.eyebrow(meta))}</div>
      <h1 class="hero-title">${escapeText(theme.title(meta))}</h1>
      <p class="hero-tagline">${escapeText(theme.tagline(meta))}</p>
    `;
  }
}

function renderFooter(meta) {
  const footer = document.getElementById("calendar-footer");
  if (!meta.today) {
    footer.textContent = "";
    return;
  }
  const { year, month, day } = meta.today;
  let text;
  if (year === meta.year && month === 12 && day < 24) {
    const left = 24 - day;
    text = left === 1 ? "Morgen ist Heiligabend." : `Noch ${left} Tage bis Heiligabend.`;
  } else if (year === meta.year && month === 12) {
    text = "Frohe Weihnachten!";
  } else if (year < meta.year || (year === meta.year && month < 12)) {
    text = `Das erste Türchen öffnet sich am 1. Dezember ${meta.year}.`;
  } else {
    text = "Alle Türchen sind offen – danke fürs Mitmachen.";
  }
  
  footer.innerHTML = text;
  
  if (meta.referrals !== undefined) {
    const refs = meta.referrals || 0;
    const refLink = `${window.location.origin}/c/${meta.id}?ref=1`;
    footer.innerHTML += `<div class="mt-4">
      <button onclick="prompt('Teile diesen Link mit 3 Freunden, um ein geheimes Türchen 25 freizuschalten!', '${refLink}')" class="bg-indigo-600/30 hover:bg-indigo-500/50 text-indigo-200 border border-indigo-500/30 px-4 py-2 rounded-full text-sm font-bold backdrop-blur transition-colors">
        🌟 Lade Freunde ein (${refs}/3) für Türchen 25
      </button>
    </div>`;
  }
}

function escapeText(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
