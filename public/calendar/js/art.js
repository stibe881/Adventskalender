// Abstract Vector Graphics & Icons
// Old hand-drawn themes have been completely replaced with modern abstractions.

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
