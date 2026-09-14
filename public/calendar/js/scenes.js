// Builds the decorative backdrop, header and garland for each theme.
// Everything here is purely visual; state and interaction live in calendar.js.

function rand(seed) {
  return seeded(seed * 7.13 + 3);
}

function buildStars(count, seedOffset = 0) {
  let html = "";
  for (let i = 0; i < count; i++) {
    const left = (rand(i + seedOffset) * 100).toFixed(2);
    const top = (rand(i + seedOffset + 100) * 70).toFixed(2);
    const size = (1 + rand(i + seedOffset + 200) * 2.2).toFixed(1);
    const delay = (rand(i + seedOffset + 300) * 6).toFixed(2);
    const dur = (2.5 + rand(i + seedOffset + 400) * 4).toFixed(2);
    html += `<span class="star" style="left:${left}%;top:${top}%;--s:${size}px;--d:${delay}s;--t:${dur}s"></span>`;
  }
  return html;
}

function buildHills() {
  return `
    <svg class="hills hills-back" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0,224 C180,160 320,260 520,220 C720,180 860,120 1040,180 C1220,240 1340,200 1440,190 L1440,320 L0,320 Z"/>
    </svg>
    <svg class="hills hills-front" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0,270 C200,230 360,300 560,270 C760,240 900,290 1100,250 C1280,215 1380,260 1440,250 L1440,320 L0,320 Z"/>
    </svg>
    <div class="village" aria-hidden="true">
      ${[8, 22, 38, 61, 76, 90].map((x, i) => `<span class="tree" style="left:${x}%;--h:${(48 + rand(i) * 40).toFixed(0)}px"></span>`).join("")}
    </div>
  `;
}

function buildGarland(colors, count = 22) {
  const sag = 34;
  let bulbs = "";
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const left = (t * 100).toFixed(2);
    const top = (4 * sag * t * (1 - t) + 6).toFixed(1);
    const color = colors[i % colors.length];
    const delay = ((i * 0.37) % 2.4).toFixed(2);
    bulbs += `<span class="bulb" style="left:${left}%;top:${top}px;--c:${color};--d:${delay}s"></span>`;
  }
  return `
    <div class="garland" aria-hidden="true">
      <svg class="wire" viewBox="0 0 1000 60" preserveAspectRatio="none">
        <path d="M0,6 Q500,${sag * 2 + 6} 1000,6" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="2.5"/>
      </svg>
      ${bulbs}
    </div>
  `;
}

function buildScene(themeKey) {
  switch (themeKey) {
    case "partner":
      return `
        <div class="sky">${buildStars(90, 1)}</div>
        <div class="moon"></div>
        <div class="haze"></div>
      `;
    case "kid":
      return `
        <div class="sky">${buildStars(70, 5)}</div>
        <div class="moon moon-kid"></div>
        ${buildHills()}
      `;
    case "parents":
      return `
        <div class="wallpaper"></div>
        <div class="lamp-glow"></div>
      `;
    case "modern":
      return `
        <div class="paper-grain"></div>
        <div class="watermark" aria-hidden="true">24</div>
      `;
    default:
      return "";
  }
}

function buildGarlandForTheme(themeKey) {
  if (themeKey === "kid") return buildGarland(["#f43f5e", "#fde047", "#22c55e", "#3b82f6", "#f97316"]);
  if (themeKey === "parents") return buildGarland(["#f6d98a", "#ffe9b3", "#f3c766"], 26);
  return "";
}

function renderHeader(themeKey, theme, meta) {
  const header = document.getElementById("calendar-header");
  header.innerHTML = `
    <div class="hero-eyebrow">${escapeText(theme.eyebrow(meta))}</div>
    <h1 class="hero-title">${escapeText(theme.title(meta))}</h1>
    ${theme.ornament ? `<div class="hero-ornament" aria-hidden="true">${theme.ornament}</div>` : ""}
    <p class="hero-tagline">${escapeText(theme.tagline(meta))}</p>
  `;
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
    text = "Frohe Weihnachten! 🎄";
  } else if (year < meta.year || (year === meta.year && month < 12)) {
    text = `Das erste Türchen öffnet sich am 1. Dezember ${meta.year}.`;
  } else {
    text = "Alle Türchen sind offen – danke fürs Mitmachen.";
  }
  footer.textContent = text;
}

function escapeText(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
