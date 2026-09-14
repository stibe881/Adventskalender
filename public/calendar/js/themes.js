// Per-theme "scene" configuration: how the 24 doors are arranged, how they
// feel, and what the header says. Visual styling lives in themes.css.
const THEME_CONFIG = {
  partner: {
    name: "Romantisch",
    ambient: "hearts",
    burstColors: ["#e9c76c", "#f6dfa4", "#c8324f", "#fbe9d7"],
    order: [7, 19, 3, 24, 12, 1, 15, 9, 21, 5, 17, 11, 2, 23, 8, 14, 20, 4, 10, 16, 22, 6, 13, 18],
    spans: { 24: "2x2", 12: "1x2", 3: "1x2" },
    tilt: 2.2,
    interiorIcon: "🕯️",
    eyebrow: (meta) => `Dezember ${meta.year}`,
    title: (meta) => `Für ${meta.recipientName}`,
    ornament: "❦",
    tagline: (meta) => `mit Liebe von ${meta.ownerName}`,
  },
  kid: {
    name: "Verspielt",
    ambient: "snow",
    burstColors: ["#fde047", "#f472b6", "#38bdf8", "#4ade80", "#fb923c", "#ffffff"],
    order: [5, 18, 2, 24, 11, 7, 20, 1, 14, 9, 22, 4, 16, 12, 3, 23, 8, 19, 6, 15, 21, 10, 17, 13],
    spans: { 24: "2x2", 10: "2x1", 5: "1x2" },
    tilt: 3,
    interiorIcon: "🎁",
    palette: ["#f43f5e", "#f97316", "#22c55e", "#3b82f6", "#a855f7", "#14b8a6", "#eab308", "#ec4899"],
    eyebrow: (meta) => `Dezember ${meta.year}`,
    title: (meta) => `Für ${meta.recipientName}`,
    ornament: "",
    tagline: (meta) => `gebastelt von ${meta.ownerName}`,
  },
  parents: {
    name: "Klassisch",
    ambient: "sparkle",
    burstColors: ["#e6c778", "#c9a15f", "#8fae8b", "#f6ecd8"],
    order: [11, 2, 20, 24, 6, 15, 1, 18, 9, 22, 4, 13, 17, 7, 23, 3, 12, 19, 5, 21, 10, 16, 8, 14],
    spans: { 24: "2x2", 6: "2x1", 17: "2x1" },
    tilt: 0.7,
    interiorIcon: "✨",
    eyebrow: (meta) => `Advent ${meta.year}`,
    title: (meta) => `Für ${meta.recipientName}`,
    ornament: "— ❦ —",
    tagline: (meta) => `in Dankbarkeit von ${meta.ownerName}`,
  },
  modern: {
    name: "Minimalistisch",
    ambient: null,
    burstColors: ["#1a2fd6", "#151515", "#f3efe6", "#8fa3ff"],
    order: Array.from({ length: 24 }, (_, i) => i + 1),
    spans: { 24: "2x2", 1: "2x1", 12: "1x2" },
    tilt: 0,
    interiorIcon: "●",
    eyebrow: (meta) => `N° 24 · Dezember ${meta.year}`,
    title: (meta) => `Für ${meta.recipientName}`,
    ornament: "",
    tagline: (meta) => `von ${meta.ownerName}`,
  },
};

function getThemeConfig(theme) {
  return THEME_CONFIG[theme] || THEME_CONFIG.modern;
}

// Deterministic pseudo-random in [0,1) so tilts stay stable across renders.
function seeded(n) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}
