// Hand-drawn SVG artwork for the calendar scenes. Everything is vector so it
// stays crisp at any size; colours come from the theme via currentColor or
// CSS custom properties where useful.

const ART_DEFS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <radialGradient id="g-moon" cx="0.36" cy="0.34" r="0.75">
      <stop offset="0" stop-color="#fffbe9"/>
      <stop offset="0.55" stop-color="#f4e3a6"/>
      <stop offset="1" stop-color="#d6b96a"/>
    </radialGradient>
    <linearGradient id="g-window" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff5c2"/>
      <stop offset="1" stop-color="#f7b955"/>
    </linearGradient>
    <linearGradient id="g-wood" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8a5732"/>
      <stop offset="0.45" stop-color="#a26b3f"/>
      <stop offset="1" stop-color="#7a4a27"/>
    </linearGradient>
    <linearGradient id="g-brass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f8e6ad"/>
      <stop offset="0.5" stop-color="#d7b566"/>
      <stop offset="1" stop-color="#a27d2c"/>
    </linearGradient>
    <linearGradient id="g-flame" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff8a1f"/>
      <stop offset="0.6" stop-color="#ffc857"/>
      <stop offset="1" stop-color="#fff5c2"/>
    </linearGradient>
    <linearGradient id="g-snow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#dfe8ff"/>
    </linearGradient>
    <linearGradient id="g-hill-back" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c9d7ff"/>
      <stop offset="1" stop-color="#a9bbf0"/>
    </linearGradient>
    <filter id="f-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="f-soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
    <symbol id="sprig" viewBox="-24 -24 48 48">
      <g stroke="#2f6b3d" stroke-width="2.4" stroke-linecap="round" fill="none">
        <line x1="0" y1="0" x2="-20" y2="-8"/><line x1="0" y1="0" x2="-18" y2="6"/>
        <line x1="0" y1="0" x2="-8" y2="-19"/><line x1="0" y1="0" x2="6" y2="-20"/>
        <line x1="0" y1="0" x2="19" y2="-9"/><line x1="0" y1="0" x2="20" y2="5"/>
        <line x1="0" y1="0" x2="8" y2="18"/><line x1="0" y1="0" x2="-7" y2="19"/>
      </g>
      <g stroke="#4c9a5a" stroke-width="1.6" stroke-linecap="round" fill="none">
        <line x1="0" y1="0" x2="-14" y2="-15"/><line x1="0" y1="0" x2="14" y2="-14"/>
        <line x1="0" y1="0" x2="15" y2="12"/><line x1="0" y1="0" x2="-15" y2="13"/>
      </g>
    </symbol>
    <symbol id="pinecone" viewBox="-8 -12 16 24">
      <ellipse rx="6.5" ry="10" fill="#6b4423"/>
      <g fill="none" stroke="#3f2612" stroke-width="1.1">
        <path d="M-5,-6 q5,3 10,0 M-6,-1 q6,3 12,0 M-5,4 q5,3 10,0 M-3,8 q3,2 6,0"/>
      </g>
    </symbol>
  </defs>
</svg>`;

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const t = amount < 0 ? 0 : 255;
    const p = Math.abs(amount);
    return Math.round(v + (t - v) * p);
  });
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/* ---------- Kid theme: houses ---------- */

function houseSvg(cols, rows, color, seed) {
  const W = cols * 100;
  const H = rows * 100;
  const r = (n) => seeded(seed * 17 + n);
  const roofH = Math.round(H * (rows > cols ? 0.24 : 0.36));
  const bodyTop = roofH + 2;
  const dark = shade(color, -0.3);
  const roofColors = ["#7a3b2e", "#4a3a6b", "#2f5d57", "#6b3f2a", "#8a2f45"];
  const roof = roofColors[Math.floor(r(1) * roofColors.length)];
  const slopeY = (x) => (x <= W / 2 ? bodyTop - (x / (W / 2)) * roofH : bodyTop - ((W - x) / (W / 2)) * roofH);

  // chimney on the right slope
  const cx = W * 0.7;
  const cw = Math.max(10, W * 0.07);
  const cTop = slopeY(cx) - H * 0.16;
  const chimney = `
    <rect x="${cx}" y="${cTop}" width="${cw}" height="${slopeY(cx + cw / 2) - cTop + 6}" fill="#5a3a2a"/>
    <rect x="${cx - 2}" y="${cTop - 4}" width="${cw + 4}" height="5" rx="2" fill="#fff"/>
    <g class="smoke" fill="#fff">
      <circle cx="${cx + cw / 2}" cy="${cTop - 12}" r="4" opacity=".7"/>
      <circle cx="${cx + cw / 2 + 4}" cy="${cTop - 22}" r="5.5" opacity=".5"/>
      <circle cx="${cx + cw / 2 + 1}" cy="${cTop - 34}" r="7" opacity=".3"/>
    </g>`;

  // windows
  const winSize = Math.min(W, H) * 0.17;
  const winY = bodyTop + H * 0.09;
  const winCount = cols === 2 ? 3 : 2;
  let windows = "";
  for (let i = 0; i < winCount; i++) {
    const wx = W * (0.14 + (0.72 / (winCount - 1)) * i) - winSize / 2;
    windows += `
      <rect x="${wx - 3}" y="${winY - 3}" width="${winSize + 6}" height="${winSize + 6}" rx="3" fill="#ffe89a" opacity=".55" filter="url(#f-soft)"/>
      <rect x="${wx}" y="${winY}" width="${winSize}" height="${winSize}" rx="2" fill="url(#g-window)" stroke="${dark}" stroke-width="2"/>
      <path d="M${wx + winSize / 2},${winY} v${winSize} M${wx},${winY + winSize / 2} h${winSize}" stroke="${dark}" stroke-width="1.6"/>`;
  }
  // door with wreath (bigger houses only)
  let door = "";
  if (cols === 2 || rows === 2) {
    const dw = Math.min(W, H) * 0.2;
    const dh = dw * 1.5;
    const dx = W * 0.5 - dw / 2;
    const dy = H - 6 - dh;
    door = `
      <path d="M${dx},${H - 6} v${-(dh - dw / 2)} a${dw / 2},${dw / 2} 0 0 1 ${dw},0 v${dh - dw / 2} z" fill="#5a3a2a" stroke="${dark}" stroke-width="2"/>
      <circle cx="${dx + dw * 0.78}" cy="${dy + dh * 0.6}" r="1.8" fill="#f8e6ad"/>
      <circle cx="${dx + dw / 2}" cy="${dy + dw * 0.55}" r="${dw * 0.26}" fill="none" stroke="#2f7a3f" stroke-width="${dw * 0.14}"/>
      <circle cx="${dx + dw / 2 - dw * 0.2}" cy="${dy + dw * 0.4}" r="1.6" fill="#e0263c"/>
      <circle cx="${dx + dw / 2 + dw * 0.22}" cy="${dy + dw * 0.5}" r="1.6" fill="#e0263c"/>
      <circle cx="${dx + dw / 2}" cy="${dy + dw * 0.8}" r="1.6" fill="#e0263c"/>`;
  }

  // snow drips along the roof
  let drips = "";
  for (let i = 0; i < 4; i++) {
    const t = 0.18 + i * 0.2;
    const x = W * t;
    drips += `<circle cx="${x}" cy="${slopeY(x) + 4}" r="${2.5 + r(i + 5) * 2}" fill="#fff"/>`;
  }

  return `
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="house-art" aria-hidden="true">
    ${chimney}
    <rect x="6" y="${bodyTop}" width="${W - 12}" height="${H - bodyTop - 4}" fill="${color}"/>
    <rect x="${W - 6 - W * 0.1}" y="${bodyTop}" width="${W * 0.1}" height="${H - bodyTop - 4}" fill="${dark}" opacity=".85"/>
    <rect x="8" y="${bodyTop + 2}" width="${W * 0.05}" height="${H - bodyTop - 8}" fill="#fff" opacity=".14"/>
    <polygon points="-2,${bodyTop + 2} ${W / 2},${bodyTop - roofH} ${W + 2},${bodyTop + 2}" fill="${roof}"/>
    <path d="M2,${bodyTop} L${W / 2},${bodyTop - roofH + 2} L${W - 2},${bodyTop}" fill="none" stroke="url(#g-snow)" stroke-width="${Math.max(9, H * 0.09)}" stroke-linecap="round" stroke-linejoin="round"/>
    ${drips}
    ${windows}
    ${door}
    <rect x="0" y="${H - 7}" width="${W}" height="7" rx="3" fill="#fff"/>
  </svg>`;
}

/* ---------- Kid theme: scenery ---------- */

function treeSvg() {
  const tier = (y, w, fill) => {
    const half = w / 2;
    let d = `M50,${y - w * 0.62} L${50 + half},${y}`;
    const n = 4;
    const dx = w / n;
    for (let i = 0; i < n; i++) d += ` q${-dx / 2},6 ${-dx},0`;
    return `<path d="${d} z" fill="${fill}"/>
            <path d="M50,${y - w * 0.62} L${50 + half * 0.55},${y - w * 0.28} M50,${y - w * 0.62} L${50 - half * 0.55},${y - w * 0.28}" stroke="#fff" stroke-width="4.5" stroke-linecap="round" fill="none"/>`;
  };
  return `
  <svg viewBox="0 0 100 140" class="tree-art" aria-hidden="true">
    <rect x="44" y="112" width="12" height="26" rx="2" fill="#5b3a21"/>
    ${tier(116, 84, "#1c5c33")}
    ${tier(88, 68, "#227040")}
    ${tier(62, 50, "#2a874d")}
    <path d="M50,26 l3,7 7,1 -5,5 1,7 -6,-3 -6,3 1,-7 -5,-5 7,-1z" fill="#ffd94a"/>
  </svg>`;
}

function snowmanSvg() {
  return `
  <svg viewBox="0 0 100 130" class="snowman-art" aria-hidden="true">
    <ellipse cx="50" cy="126" rx="40" ry="5" fill="#000" opacity=".12"/>
    <circle cx="50" cy="98" r="28" fill="#fff" stroke="#d9e2f5" stroke-width="2"/>
    <circle cx="50" cy="58" r="21" fill="#fff" stroke="#d9e2f5" stroke-width="2"/>
    <circle cx="50" cy="27" r="15" fill="#fff" stroke="#d9e2f5" stroke-width="2"/>
    <path d="M18,60 L36,48 M82,60 L64,48" stroke="#6b4423" stroke-width="3" stroke-linecap="round"/>
    <path d="M18,60 l-5,-4 M18,60 l-6,2" stroke="#6b4423" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="34" y="11" width="32" height="4" rx="2" fill="#222"/>
    <rect x="40" y="-4" width="20" height="16" rx="2" fill="#222"/>
    <rect x="40" y="8" width="20" height="4" fill="#e0263c"/>
    <circle cx="45" cy="24" r="1.8" fill="#222"/><circle cx="55" cy="24" r="1.8" fill="#222"/>
    <polygon points="50,28 62,31 50,33" fill="#ff8a1f"/>
    <path d="M44,34 q6,4 12,0" stroke="#222" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M36,44 q14,10 28,0 l4,10 q-8,3 -12,-2" fill="#e0263c"/>
    <circle cx="50" cy="52" r="2" fill="#222"/><circle cx="50" cy="62" r="2" fill="#222"/><circle cx="50" cy="90" r="2.2" fill="#222"/><circle cx="50" cy="102" r="2.2" fill="#222"/>
  </svg>`;
}

function moonSvg(craters = true) {
  return `
  <svg viewBox="0 0 100 100" class="moon-art" aria-hidden="true">
    <circle cx="50" cy="50" r="46" fill="url(#g-moon)"/>
    ${craters ? `
    <circle cx="34" cy="40" r="7" fill="#e6cf86" opacity=".8"/>
    <circle cx="62" cy="63" r="10" fill="#e6cf86" opacity=".75"/>
    <circle cx="60" cy="30" r="4" fill="#e6cf86" opacity=".8"/>
    <circle cx="42" cy="68" r="3" fill="#e6cf86" opacity=".8"/>` : ""}
  </svg>`;
}

function hillsSvg() {
  return `
  <svg class="hills-art" viewBox="0 0 1440 360" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0,200 C220,130 380,240 600,190 C820,140 960,90 1160,160 C1320,215 1400,180 1440,175 L1440,360 L0,360 Z" fill="url(#g-hill-back)"/>
    <path d="M0,270 C200,220 380,300 600,265 C820,230 940,290 1140,250 C1300,218 1390,262 1440,255 L1440,360 L0,360 Z" fill="url(#g-snow)"/>
    <g fill="#fff" opacity=".9">
      <circle cx="220" cy="292" r="2"/><circle cx="640" cy="300" r="1.6"/><circle cx="980" cy="284" r="2.2"/><circle cx="1290" cy="300" r="1.8"/>
    </g>
  </svg>`;
}

/* ---------- Partner theme ---------- */

function rooftopsSvg() {
  let d = "M0,200 L0,140";
  let x = 0;
  let windows = "";
  let i = 0;
  while (x < 1460) {
    const w = 70 + seeded(i * 3 + 1) * 90;
    const h = 60 + seeded(i * 3 + 2) * 90;
    const top = 200 - h;
    const gable = seeded(i * 3 + 3) > 0.45;
    if (gable) {
      d += ` L${x},${top + 26} L${x + w / 2},${top} L${x + w},${top + 26}`;
    } else {
      d += ` L${x},${top} L${x + w * 0.3},${top} L${x + w * 0.3},${top - 18} L${x + w * 0.38},${top - 18} L${x + w * 0.38},${top} L${x + w},${top}`;
    }
    const rows = Math.floor(h / 30);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < Math.floor(w / 26); c++) {
        if (seeded(i * 97 + r * 13 + c * 7) < 0.4) {
          windows += `<rect x="${x + 10 + c * 26}" y="${top + 36 + r * 28}" width="10" height="14" rx="1" fill="#ffc46b" opacity="${0.5 + seeded(i + r + c) * 0.5}"/>`;
        }
      }
    }
    x += w;
    i++;
  }
  d += " L1460,200 Z";
  return `
  <svg class="rooftops-art" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d}" fill="#12030a"/>
    <path d="${d}" fill="none" stroke="#fbe9d7" stroke-opacity=".55" stroke-width="3"/>
    <g filter="url(#f-glow)">${windows}</g>
  </svg>`;
}

function candleSvg() {
  return `
  <svg viewBox="0 0 40 64" class="candle-art" aria-hidden="true">
    <ellipse cx="20" cy="20" rx="14" ry="16" fill="#ffb347" opacity=".35" filter="url(#f-soft)"/>
    <rect x="13" y="28" width="14" height="32" rx="2" fill="#f7ecd2"/>
    <path d="M13,30 q3,8 0,14 M27,32 q-3,6 0,12" stroke="#e8d9b5" stroke-width="2" fill="none"/>
    <path d="M20,28 v-4" stroke="#333" stroke-width="1.5"/>
    <g class="flame">
      <path d="M20,8 c5,6 7,10 7,13.5 a7,7 0 0 1 -14,0 c0,-3.5 2,-7.5 7,-13.5z" fill="url(#g-flame)"/>
      <path d="M20,15 c2,3 3,5 3,6.5 a3,3 0 0 1 -6,0 c0,-1.5 1,-3.5 3,-6.5z" fill="#fff8d8" opacity=".9"/>
    </g>
  </svg>`;
}

function windowFrameSvg() {
  return `
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="frame-art" aria-hidden="true">
    <g fill="none" stroke="#d8b25a" stroke-width="1.2" opacity=".85">
      <path d="M50,60 v32 M14,60 h72"/>
      <path d="M50,9 c-4,5 -8,4 -10,0 M50,9 c4,5 8,4 10,0" stroke-width="1.5"/>
      <path d="M12,92 c4,-8 2,-12 -4,-12 M88,92 c-4,-8 -2,-12 4,-12" stroke-width="1.6"/>
      <circle cx="50" cy="60" r="3"/>
    </g>
  </svg>`;
}

/* ---------- Parents theme ---------- */

function woodPanelSvg(seed) {
  const r = (n) => seeded(seed * 31 + n);
  let grain = "";
  for (let i = 0; i < 6; i++) {
    const y = 8 + i * 15 + r(i) * 8;
    grain += `<path d="M0,${y} C25,${y - 4 + r(i + 10) * 8} 50,${y + 4 - r(i + 20) * 8} 100,${y}" stroke="#4d2c12" stroke-opacity=".28" stroke-width="${1 + r(i + 30)}" fill="none"/>`;
  }
  const kx = 25 + r(40) * 50;
  const ky = 25 + r(41) * 50;
  return `
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="wood-art" aria-hidden="true">
    <rect width="100" height="100" fill="url(#g-wood)"/>
    ${grain}
    <ellipse cx="${kx}" cy="${ky}" rx="5" ry="3.2" fill="#5a3416" opacity=".6"/>
    <ellipse cx="${kx}" cy="${ky}" rx="8" ry="5.5" fill="none" stroke="#4d2c12" stroke-opacity=".35"/>
    <ellipse cx="${kx}" cy="${ky}" rx="11" ry="8" fill="none" stroke="#4d2c12" stroke-opacity=".2"/>
  </svg>`;
}

function pineGarlandSvg(width, withLights = true) {
  const sag = 44;
  const top = 14;
  const n = Math.max(14, Math.round(width / 19));
  let sprigs = "";
  let extras = "";
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t * width;
    const y = 4 * sag * t * (1 - t) + top;
    const angle = Math.atan2(4 * sag * (1 - 2 * t), width) * (180 / Math.PI);
    const s = 44 + seeded(i) * 16;
    const wobble = seeded(i + 50) * 50 - 25;
    sprigs += `<use href="#sprig" x="${x - s / 2}" y="${y - s / 2 + 6}" width="${s}" height="${s}" transform="rotate(${angle + wobble} ${x} ${y + 6})"/>`;
    if (i % 2 === 0) {
      const s2 = s * 0.7;
      sprigs += `<use href="#sprig" x="${x - s2 / 2 + 8}" y="${y - s2 / 2 + 14}" width="${s2}" height="${s2}" transform="rotate(${angle - wobble} ${x + 8} ${y + 14})" opacity=".9"/>`;
    }
    if (i % 4 === 2) {
      extras += `<circle cx="${x + 5}" cy="${y + 10}" r="4.4" fill="#d81e34"/><circle cx="${x + 3.6}" cy="${y + 8.6}" r="1.4" fill="#fff" opacity=".75"/>
                 <circle cx="${x - 5}" cy="${y + 6}" r="3.8" fill="#b3122a"/><circle cx="${x - 6}" cy="${y + 4.8}" r="1.2" fill="#fff" opacity=".6"/>
                 <circle cx="${x}" cy="${y + 15}" r="3.6" fill="#c8172f"/>`;
    }
    if (i % 7 === 4) {
      extras += `<use href="#pinecone" x="${x - 8}" y="${y + 8}" width="16" height="26" transform="rotate(${seeded(i) * 40 - 20} ${x} ${y + 20})"/>`;
    }
    if (withLights && i % 3 === 1) {
      extras += `<g class="bulb-svg" style="--d:${((i * 0.41) % 2.2).toFixed(2)}s">
        <circle cx="${x}" cy="${y + 22}" r="10" fill="#ffd77a" opacity=".4" filter="url(#f-soft)"/>
        <rect x="${x - 2.2}" y="${y + 13}" width="4.4" height="5" rx="1" fill="#3a2a12"/>
        <ellipse cx="${x}" cy="${y + 23}" rx="4" ry="5.6" fill="#ffe9b0"/>
      </g>`;
    }
  }
  return `
  <svg class="garland-art" viewBox="0 0 ${width} 100" width="${width}" height="100" aria-hidden="true">
    <path d="M0,${top} Q${width / 2},${top + sag * 2} ${width},${top}" fill="none" stroke="#3a2a12" stroke-width="3"/>
    ${sprigs}
    ${extras}
  </svg>`;
}

/* ---------- Icons (24x24, stroke = currentColor) ---------- */

const ICON_PATHS = {
  text: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>`,
  voucher: `<path d="M3 9a2 2 0 0 0 2-2V6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v1a2 2 0 0 0 2 2v6a2 2 0 0 0-2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1a2 2 0 0 0-2-2z"/><path d="M14 5v14" stroke-dasharray="2 2"/>`,
  qrcode: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v3M17 21h4M14 20v1"/>`,
  video: `<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>`,
  audio: `<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>`,
  gallery: `<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 8"/>`,
  scratchcard: `<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>`,
  quiz: `<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><circle cx="12" cy="17" r=".7" fill="currentColor"/>`,
  countdown: `<path d="M7 3h10M7 21h10M8 3c0 5 4 5 4 9s-4 4-4 9M16 3c0 5-4 5-4 9s4 4 4 9"/>`,
  gift: `<rect x="3" y="8" width="18" height="4"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2 0-4-1-4-3s3-2 4 3c1-5 4-5 4-3s-2 3-4 3"/>`,
  candle: `<rect x="9" y="10" width="6" height="11" rx="1"/><path d="M12 10V8"/><path d="M12 2c1.5 2 2.5 3.5 2.5 5a2.5 2.5 0 0 1-5 0c0-1.5 1-3 2.5-5z" fill="currentColor" stroke="none"/>`,
  sparkle: `<path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill="currentColor" stroke="none"/>`,
  dot: `<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>`,
  tree: `<path d="M12 3l4 6h-2l4 6h-3l3 5H6l3-5H6l4-6H8z"/><path d="M12 20v2"/>`,
  lock: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  empty: `<path d="M12 3l4 6h-2l4 6h-3l3 5H6l3-5H6l4-6H8z"/><path d="M12 20v2"/>`,
};

function iconSvg(type, cls = "") {
  const body = ICON_PATHS[type] || ICON_PATHS.gift;
  return `<svg viewBox="0 0 24 24" class="icon ${cls}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function ornamentSvg() {
  return `
  <svg viewBox="0 0 220 24" class="ornament-art" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <path d="M4,12 h70 M146,12 h70"/>
      <path d="M78,12 c6,-8 14,-8 18,0 c-4,8 -12,8 -18,0z M124,12 c6,-8 14,-8 18,0 c-4,8 -12,8 -18,0z"/>
      <path d="M96,12 c4,-4 8,-4 12,0 c-4,4 -8,4 -12,0z" fill="currentColor"/>
      <path d="M110,4 l2,5 5,2 -5,2 -2,5 -2,-5 -5,-2 5,-2z" fill="currentColor" stroke="none"/>
    </g>
  </svg>`;
}
