// Abstract Vector Graphics & Icons
// Old hand-drawn themes have been completely replaced with modern abstractions.

const ICON_PATHS = {
  // existing
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
  // content types that were missing → all fell back to "gift"
  image: `<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 8"/>`,
  giveaway: `<path d="M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0"/><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 6v2M12 16v2M6 12h2M14 12h4"/>`,
  product: `<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>`,
  choice: `<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>`,
  diary: `<path d="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><path d="M8 10h8M8 14h5"/>`,
  challenge: `<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>`,
  location: `<path d="M12 2a7 7 0 0 1 7 7c0 4.9-7 13-7 13S5 13.9 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/>`,
  ar: `<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12H4M20 12h2"/>`,
  duel: `<path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/><path d="M20.5 10c-.83 0-1.5-.67-1.5-1.5v-1c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v1c0 .83-.67 1.5-1.5 1.5z"/><path d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z"/><path d="M3.5 14c.83 0 1.5.67 1.5 1.5v1c0 .83-.67 1.5-1.5 1.5S2 17.33 2 16.5v-1C2 14.67 2.67 14 3.5 14z"/><path d="M14 16.5v-11a2 2 0 0 0-4 0v11a2 2 0 0 0 4 0z"/><path d="M10 8.5v11a2 2 0 0 0 4 0v-11a2 2 0 0 0-4 0z"/>`,
  wichtel: `<path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2z"/><path d="M2 21a10 10 0 0 1 20 0"/><path d="M8 9l4 4 4-4"/>`,
  "spotify-collab": `<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>`,
  "iot-box": `<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>`,
  timecapsule: `<path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>`,
  printplay: `<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>`,
};

function iconSvg(type, cls = "") {
  const body = ICON_PATHS[type] || ICON_PATHS.gift;
  return `<svg viewBox="0 0 24 24" class="icon ${cls}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function ornamentSvg() {
  return `
  <svg viewBox="0 0 220 24" class="ornament-art" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <path d="M4,12 h212"/>
      <circle cx="110" cy="12" r="4" fill="currentColor"/>
      <circle cx="110" cy="12" r="10"/>
    </g>
  </svg>`;
}

// Abstract Geometric Shapes for doors (if needed)
function geometricShapeSvg(type) {
  if (type === 'diamond') {
    return `<svg viewBox="0 0 100 100" class="geom-art" aria-hidden="true"><polygon points="50,5 95,50 50,95 5,50" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  }
  return '';
}
