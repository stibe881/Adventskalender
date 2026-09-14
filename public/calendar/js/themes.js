const THEME_CONFIG = {
  partner: {
    name: "Romantisch",
    greetingIcon: "💕",
    doorClosedIcon: "🎁",
    ambient: "hearts",
    burstColors: ["#d4af37", "#f2c94c", "#e0245e", "#ffffff"],
    bodyClass: "font-display",
  },
  kid: {
    name: "Verspielt",
    greetingIcon: "🎈",
    doorClosedIcon: "⭐",
    ambient: "snow",
    burstColors: ["#fde047", "#f472b6", "#38bdf8", "#4ade80", "#fb923c"],
    bodyClass: "",
  },
  parents: {
    name: "Klassisch",
    greetingIcon: "🌲",
    doorClosedIcon: "✨",
    ambient: "snow",
    burstColors: ["#c9a15f", "#e0c087", "#8fae8b", "#ffffff"],
    bodyClass: "font-display",
  },
  modern: {
    name: "Minimalistisch",
    greetingIcon: "✨",
    doorClosedIcon: "◆",
    ambient: "snow",
    burstColors: ["#38bdf8", "#7dd3fc", "#e2e8f0", "#94a3b8"],
    bodyClass: "",
  },
};

function getThemeConfig(theme) {
  return THEME_CONFIG[theme] || THEME_CONFIG.modern;
}
