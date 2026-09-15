// Builds the physical/realistic backdrop layers for each theme.
// Background images are now real high-res assets generated via AI.

function buildScene(themeKey, meta) {
  switch (themeKey) {
    case "partner": // Romantisch (Sternenhimmel)
      return `
        <div class="theme-bg" style="background-image: url('/calendar/img/romantic.png');"></div>
        <div class="ambient-glow"></div>
      `;
    case "kid": // Verspielt (Winterdorf)
      return `
        <div class="theme-bg" style="background-image: url('/calendar/img/village.png');"></div>
      `;
    case "parents": // Klassisch (Holz)
      return `
        <div class="theme-bg" style="background-image: url('/calendar/img/wood.png');"></div>
        <div class="vignette-overlay"></div>
      `;
    case "modern": // Apple-style Glassmorphism
      return `
        <div class="theme-bg" style="background-image: url('/calendar/img/modern.png');"></div>
      `;
    case "firma": // Corporate
      const bg = meta?.customConfig?.bgUrl || "";
      return bg ? `<div class="theme-bg" style="background-image: url('${escapeText(bg)}');"></div>` : `<div class="theme-bg" style="background-color: #f8fafc;"></div>`;
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

  header.innerHTML = `
    ${logoHtml}
    <div class="hero-eyebrow">${escapeText(theme.eyebrow(meta))}</div>
    <h1 class="hero-title">${escapeText(theme.title(meta))}</h1>
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
