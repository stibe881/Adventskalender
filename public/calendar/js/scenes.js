// Builds the decorative backdrop, header and garland for each theme.
// Everything here is purely visual; state and interaction live in calendar.js.

function rand(seed) {
  return seeded(seed * 7.13 + 3);
}

function buildStars(count, seedOffset = 0) {
  let html = "";
  for (let i = 0; i < count; i++) {
    const left = (rand(i + seedOffset) * 100).toFixed(2);
    const top = (rand(i + seedOffset + 100) * 65).toFixed(2);
    const size = (1 + rand(i + seedOffset + 200) * 2.2).toFixed(1);
    const delay = (rand(i + seedOffset + 300) * 6).toFixed(2);
    const dur = (2.5 + rand(i + seedOffset + 400) * 4).toFixed(2);
    const big = rand(i + seedOffset + 500) > 0.9;
    html += `<span class="star ${big ? "star-big" : ""}" style="left:${left}%;top:${top}%;--s:${size}px;--d:${delay}s;--t:${dur}s"></span>`;
  }
  return html;
}

function buildVillage() {
  const palette = ["#e0526b", "#f2a541", "#5aa9e6", "#8e6bd6", "#3fb27f", "#f26b6b"];
  const houses = [
    { x: 4, w: 62, seed: 11 },
    { x: 15, w: 48, seed: 12 },
    { x: 78, w: 70, seed: 13 },
    { x: 89, w: 46, seed: 14 },
  ];
  const trees = [
    { x: 1, h: 92 }, { x: 10, h: 70 }, { x: 24, h: 84 }, { x: 70, h: 78 }, { x: 84, h: 96 }, { x: 95, h: 72 },
  ];
  return `
    <div class="village" aria-hidden="true">
      ${houses.map((h, i) => `<div class="bg-house" style="left:${h.x}%;width:${h.w}px">${houseSvg(1, 1, palette[i % palette.length], h.seed)}</div>`).join("")}
      ${trees.map((t) => `<div class="bg-tree" style="left:${t.x}%;height:${t.h}px">${treeSvg()}</div>`).join("")}
      <div class="bg-snowman">${snowmanSvg()}</div>
    </div>
  `;
}

function buildLightString(colors, count = 22) {
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
    <div class="lights" aria-hidden="true">
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
        <div class="sky">${buildStars(110, 1)}</div>
        <div class="moon">${moonSvg(true)}</div>
        ${rooftopsSvg()}
        <div class="haze"></div>
      `;
    case "kid":
      return `
        <div class="sky">${buildStars(80, 5)}</div>
        <div class="moon moon-kid">${moonSvg(true)}</div>
        ${hillsSvg()}
        ${buildVillage()}
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

function buildGarlandForTheme(themeKey, width) {
  if (themeKey === "kid") return buildLightString(["#f43f5e", "#fde047", "#22c55e", "#3b82f6", "#f97316"]);
  if (themeKey === "parents") return pineGarlandSvg(Math.max(320, Math.round(width)), true);
  return "";
}

function renderHeader(themeKey, theme, meta) {
  const header = document.getElementById("calendar-header");
  header.innerHTML = `
    <div class="hero-eyebrow">${escapeText(theme.eyebrow(meta))}</div>
    <h1 class="hero-title">${escapeText(theme.title(meta))}</h1>
    ${theme.ornament ? `<div class="hero-ornament" aria-hidden="true">${ornamentSvg()}</div>` : ""}
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
    text = "Frohe Weihnachten!";
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
