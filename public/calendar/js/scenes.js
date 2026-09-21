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
    case "firma": { // Corporate
      const bg = meta?.customConfig?.bgUrl || "";
      // A company photo stays as it is: no blend-mode tint (blend modes over a fixed image flicker on iOS).
      return bg ? `<div class="theme-bg" style="background-image: url('${escapeText(bg)}');"></div>` : `<div class="theme-bg" style="background-color: #f8fafc;"></div>${timeOverlay}`;
    }
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
  const logoUrl = meta?.customConfig?.logo;
  const logoHtml = logoUrl ? `<img src="${escapeText(logoUrl)}" alt="Logo" class="mx-auto mb-4" style="max-height: 80px; max-width: 250px; object-fit: contain;" />` : "";

  let headerTopHtml = `<div class="flex items-center justify-center gap-3 mb-4">`;
  if (meta.streak > 1) {
    headerTopHtml += `<div class="inline-flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full text-sm font-bold text-orange-400 border border-orange-400/30 backdrop-blur">
      <i data-icon="flame"></i> ${meta.streak} Tage Streak!
    </div>`;
  }
  headerTopHtml += `</div>`;

  const titleHtml = logoUrl ? logoHtml : `<h1 class="text-4xl md:text-6xl font-black mb-4 drop-shadow-lg leading-tight tracking-tight">${escapeText(meta.recipientName)}</h1>`;

  if (themeKey === "modern" || themeKey === "neon") {
    header.innerHTML = `
      ${headerTopHtml}
      ${titleHtml}
      <p class="text-xl md:text-2xl text-slate-300 font-medium">Dezember ${meta.year}</p>
    `;
  } else if (themeKey === "classic") {
    header.innerHTML = `
      ${headerTopHtml}
      ${titleHtml}
      <p class="text-xl md:text-2xl font-serif text-amber-200/90 italic drop-shadow">Weihnachten ${meta.year}</p>
    `;
  } else if (themeKey === "playful") {
    header.innerHTML = `
      ${headerTopHtml}
      ${titleHtml}
      <p class="text-xl md:text-2xl font-black text-rose-300 tracking-wider">Macht euch bereit! (${meta.year})</p>
    `;
  } else if (themeKey === "firma") {
    header.innerHTML = `
      ${headerTopHtml}
      ${titleHtml}
      <p class="text-xl md:text-2xl font-bold opacity-80" style="color: var(--accent-light)">Dezember ${meta.year}</p>
    `;
  } else if (themeKey === "space") {
    header.innerHTML = `
      ${headerTopHtml}
      ${titleHtml}
      <p class="text-xl md:text-2xl font-mono text-cyan-300 tracking-[0.2em] uppercase">Expedition ${meta.year}</p>
    `;
  } else if (themeKey === "nature") {
    header.innerHTML = `
      ${headerTopHtml}
      ${titleHtml}
      <p class="text-xl md:text-2xl font-medium text-emerald-200 drop-shadow">Winterwald ${meta.year}</p>
    `;
  } else {
    header.innerHTML = `
      ${headerTopHtml}
      ${titleHtml}
      <p class="text-xl md:text-2xl opacity-90 drop-shadow">Dezember ${meta.year}</p>
    `;
  }
}

function renderFooter(meta) {
  const footer = document.getElementById("calendar-footer");
  // The public API and the share link work with the token from the page URL, not the calendar id.
  const calToken = typeof routeId !== "undefined" && routeId ? routeId : meta.token || meta.id;
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
  
  // Morning e-mail reminder – the recipient's own choice.
  if (meta.reminder) {
    const r = meta.reminder;
    footer.innerHTML += `<div class="mt-3 text-sm">${r.enabled
      ? `<span class="opacity-80"><i data-icon="bell"></i> Erinnerung morgens an ${escapeText(r.email)}</span> <button type="button" data-reminder="off" class="underline opacity-80 hover:opacity-100">abbestellen</button>`
      : `<button type="button" data-reminder="on" class="bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2 rounded-full text-sm font-semibold backdrop-blur transition-colors"><i data-icon="bell"></i> Morgens per E-Mail erinnern lassen</button>`}</div>`;
    // Delegated and assigned (not added): the footer's HTML is rebuilt below and on every render.
    footer.onclick = async (e) => {
      const btn = e.target.closest("[data-reminder]");
      if (!btn) return;
      const on = btn.dataset.reminder === "on";
      let email = null;
      if (on) { email = prompt("An welche E-Mail-Adresse sollen wir dich morgens erinnern, wenn dein Türchen noch zu ist?"); if (!email) return; }
      try {
        const res = await fetch(`/api/calendar/${calToken}/reminder`, { method: on ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: on ? JSON.stringify({ email }) : undefined });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Fehler");
        meta.reminder = d;
        renderFooter(meta);
      } catch (err) { alert(err.message); }
    };
  }

  // Door 25: what the recipient can do to unlock it (rule chosen by the owner).
  const bonus = meta.bonus || (meta.referrals !== undefined ? { mode: "referrals", count: meta.bonusReferralsNeeded || 3, unlocked: false, referrals: meta.referrals || 0 } : null);
  if (bonus && !bonus.unlocked) {
    if (bonus.mode === "referrals") {
      const refLink = `${window.location.origin}/c/${calToken}?ref=1`;
      footer.innerHTML += `<div class="mt-4">
        <button onclick="prompt('Teile diesen Link mit ${bonus.count} Freunden, um ein geheimes Türchen 25 freizuschalten!', '${refLink}')" class="bg-indigo-600/30 hover:bg-indigo-500/50 text-indigo-200 border border-indigo-500/30 px-4 py-2 rounded-full text-sm font-bold backdrop-blur transition-colors">
          <i data-icon="star"></i> Lade Freunde ein (${bonus.referrals || 0}/${bonus.count}) für Türchen 25
        </button>
      </div>`;
    } else if (bonus.hint) {
      footer.innerHTML += `<p class="mt-3 text-sm opacity-80"><i data-icon="star"></i> ${escapeText(bonus.hint)}</p>`;
    }
  }
}

function escapeText(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
