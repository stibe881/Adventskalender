/* Rudi, the Tamagotchi reindeer, drawn as SVG.
 * Everything lives in one 64x64 coordinate system so gear from the Nordpol-Shop
 * can be composed onto him. Overflows are used for large items like the sleigh. */
(function () {
  // Base reindeer, side view facing left. Cute, detailed cartoon style!
  const BODY = `
    <!-- Antlers -->
    <g id="rudi-antlers" fill="none" stroke="#E6C280" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 22 20 L 26 10 L 34 6 M 28 14 L 34 14"/>
      <path d="M 16 18 L 14 8 L 20 2 M 15 12 L 10 6"/>
    </g>
    
    <!-- Back Legs -->
    <path d="M 40 45 Q 38 55 40 62" fill="none" stroke="#6B4226" stroke-width="4" stroke-linecap="round"/>
    <path d="M 48 45 Q 50 55 48 62" fill="none" stroke="#6B4226" stroke-width="4" stroke-linecap="round"/>
    <!-- Hooves back -->
    <path d="M 38 62 H 42 L 41 64 H 39 Z" fill="#222"/>
    <path d="M 46 62 H 50 L 49 64 H 47 Z" fill="#222"/>

    <!-- Tail -->
    <path d="M 54 34 Q 60 36 58 40 Q 54 38 52 36 Z" fill="#8B5A2B"/>

    <!-- Body -->
    <path d="M 26 30 C 36 26 50 26 56 36 C 58 42 52 48 40 46 C 28 44 20 40 26 30 Z" fill="#8B5A2B"/>
    <path d="M 26 30 C 36 26 50 26 56 36 C 58 42 52 48 40 46 C 28 44 20 40 26 30 Z" fill="none" stroke="#5C3A21" stroke-width="1.5"/>
    
    <!-- Belly (lighter) -->
    <path d="M 30 36 C 38 34 46 36 50 40 C 48 44 38 44 30 42 C 26 40 26 38 30 36 Z" fill="#D2B48C"/>

    <!-- Front Legs -->
    <path d="M 30 44 Q 28 55 30 63" fill="none" stroke="#8B5A2B" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M 36 44 Q 34 55 36 63" fill="none" stroke="#8B5A2B" stroke-width="4.5" stroke-linecap="round"/>
    <!-- Hooves front -->
    <path d="M 28 63 H 32 L 31 65 H 29 Z" fill="#111"/>
    <path d="M 34 63 H 38 L 37 65 H 35 Z" fill="#111"/>

    <!-- Neck -->
    <path d="M 30 32 Q 26 24 22 20 L 16 24 Q 20 32 24 36 Z" fill="#8B5A2B"/>

    <!-- Ears -->
    <path d="M 21 16 Q 28 12 30 16 Q 26 18 21 16 Z" fill="#8B5A2B"/>
    <path d="M 11 12 Q 7 6 3 8 Q 5 12 11 12 Z" fill="#8B5A2B"/>

    <!-- Head -->
    <ellipse cx="16" cy="24" rx="9" ry="11" fill="#8B5A2B" transform="rotate(-15 16 24)"/>
    <ellipse cx="10" cy="26" rx="6" ry="4.5" fill="#D2B48C" transform="rotate(-15 10 26)"/>
    
    <!-- Red Nose -->
    <circle cx="5" cy="27" r="3.5" fill="#FF0000"/>
    <circle cx="4" cy="26" r="1.2" fill="#FFC0C0"/>

    <!-- Eyes -->
    <g id="rudi-eyes">
      <circle cx="12" cy="20" r="2" fill="#111"/>
      <circle cx="11.5" cy="19.5" r="0.8" fill="#FFF"/>
      <circle cx="19" cy="19" r="2" fill="#111"/>
      <circle cx="18.5" cy="18.5" r="0.8" fill="#FFF"/>
    </g>
    <!-- Sleepy eyes -->
    <g id="rudi-eyes-sleepy" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round">
      <path d="M 10 20 Q 12 21.5 14 20"/>
      <path d="M 17 19 Q 19 20.5 21 19"/>
    </g>
  `;

  // Gear in Rudi coordinates. `box` is the viewBox used when the item is shown alone.
  const GEAR = {
    bow: { box: "16 28 16 16", svg: `<g transform="translate(24, 36)"><path d="M0 0 L-5 -4 L-5 4 Z" fill="#f472b6"/><path d="M0 0 L5 -4 L5 4 Z" fill="#f472b6"/><circle r="2.5" fill="#fbcfe8" stroke="#be185d" stroke-width="0.8"/></g>` },
    scarf: { box: "16 28 16 16", svg: `<g transform="translate(24, 34)"><path d="M-6 -2 Q 0 -4 6 -2 L 5 4 Q 0 6 -5 4 Z" fill="#dc2626"/><path d="M 2 2 L 4 14 L -2 14 L 0 2 Z" fill="#dc2626"/><path d="M-2 14 L4 14" stroke="#fca5a5" stroke-width="1.5"/><path d="M -5 2 Q 0 4 5 2" fill="none" stroke="#fca5a5" stroke-width="1"/></g>` },
    bell: { box: "18 32 12 12", svg: `<g transform="translate(24, 40)"><circle cy="2" r="3" fill="#fbbf24" stroke="#b45309" stroke-width="0.8"/><rect x="-4" y="-2" width="8" height="2" rx="1" fill="#d97706"/><circle cy="3" r="1.5" fill="#b45309"/><path d="M0 -2 L0 -5" stroke="#b45309" stroke-width="1.5"/></g>` },
    hat: { box: "5 -2 22 22", svg: `<g transform="translate(16, 11) rotate(-15)"><rect x="-7" y="-12" width="14" height="11" rx="1" fill="#111827"/><rect x="-7" y="-3" width="14" height="2.5" fill="#dc2626"/><rect x="-10" y="-1" width="20" height="2.5" rx="1" fill="#111827"/></g>` },
    crown: { box: "6 0 20 16", svg: `<g transform="translate(16, 12) rotate(-10)"><path d="M-8 0 L-8 -7 L-4 -3 L0 -8 L4 -3 L8 -7 L8 0 Z" fill="#fbbf24" stroke="#b45309" stroke-width="0.8" stroke-linejoin="round"/><rect x="-8" y="0" width="16" height="2.5" fill="#f59e0b"/><circle cx="-4" cy="-3" r="1.2" fill="#ef4444"/><circle cx="0" cy="-6" r="1.2" fill="#3b82f6"/><circle cx="4" cy="-3" r="1.2" fill="#22c55e"/></g>` },
    glasses: { box: "6 14 20 12", svg: `<g transform="translate(15, 19) rotate(-15)"><rect x="-6" y="-3" width="6.5" height="5" rx="1.5" fill="#0f172a" fill-opacity="0.9"/><rect x="2" y="-3" width="6.5" height="5" rx="1.5" fill="#0f172a" fill-opacity="0.9"/><path d="M 0.5 -1.5 L 2 -1.5 M -6 -1.5 L -8 -1.5" stroke="#0f172a" stroke-width="1.5"/><path d="M -4 -1 L -2 -1 M 4 -1 L 6 -1" stroke="#93c5fd" stroke-width="0.8" opacity="0.8"/></g>` },
    skis: { box: "20 56 38 12", svg: `<g fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"><path d="M 22 65 L 56 65 Q 60 65 60 62"/></g><g fill="#e2e8f0"><rect x="28" y="62" width="6" height="2.5" rx="1"/><rect x="34" y="62" width="6" height="2.5" rx="1"/><rect x="46" y="62" width="6" height="2.5" rx="1"/><rect x="52" y="62" width="6" height="2.5" rx="1"/></g>` },
    lights: { box: "16 20 36 28", svg: `<path d="M 20 36 Q 30 20 50 36" fill="none" stroke="#166534" stroke-width="1.5"/><g><circle cx="23" cy="32" r="2" fill="#ef4444"/><circle cx="28" cy="27" r="2" fill="#facc15"/><circle cx="35" cy="24" r="2" fill="#3b82f6"/><circle cx="42" cy="27" r="2" fill="#22c55e"/><circle cx="47" cy="32" r="2" fill="#f97316"/></g>` },
    sleigh: { box: "65 25 50 40", svg: `
      <path d="M 32 38 Q 50 44 70 42" fill="none" stroke="#B22222" stroke-width="2" stroke-dasharray="4 2"/>
      <path d="M 28 32 Q 50 40 70 38" fill="none" stroke="#B22222" stroke-width="2" stroke-dasharray="4 2"/>
      <g transform="translate(70, 30)">
        <path d="M 0 25 L 30 25 L 35 12 L 45 12 L 42 28 L -5 28 Z" fill="#8B0000"/>
        <path d="M 0 25 L 30 25 L 35 12 L 45 12 L 42 28 L -5 28 Z" fill="none" stroke="#5C0000" stroke-width="1.5"/>
        <path d="M -10 32 L 50 32" stroke="#C0C0C0" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M 50 32 Q 55 32 55 28" fill="none" stroke="#C0C0C0" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="2" y1="28" x2="2" y2="32" stroke="#C0C0C0" stroke-width="2"/>
        <line x1="15" y1="28" x2="15" y2="32" stroke="#C0C0C0" stroke-width="2"/>
        <line x1="28" y1="28" x2="28" y2="32" stroke="#C0C0C0" stroke-width="2"/>
        <line x1="40" y1="28" x2="40" y2="32" stroke="#C0C0C0" stroke-width="2"/>
        <rect x="5" y="8" width="14" height="17" fill="#228B22" rx="1"/>
        <rect x="10" y="8" width="4" height="17" fill="#FFD700"/>
        <rect x="5" y="14" width="14" height="4" fill="#FFD700"/>
        <rect x="22" y="14" width="11" height="11" fill="#1E90FF" rx="1"/>
        <rect x="26" y="14" width="3" height="11" fill="#FFF"/>
      </g>
    ` },
    wings: { box: "30 15 26 26", svg: `<g transform="translate(38, 25)" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" stroke-linejoin="round"><path d="M 0 5 C 4 -5 12 -10 18 -10 C 16 -4 14 0 12 4 C 14 4 16 3 18 3 C 15 7 12 9 9 10 C 11 10 12 10 14 10 C 10 14 5 15 2 13 Z"/><path d="M 2 11 C 3 4 7 -2 12 -4" fill="none"/></g>` },
    star: { box: "45 -5 26 26", svg: `<g transform="translate(56, 8)"><circle r="12" fill="#fde047" opacity="0.25"/><path d="M0 -10 L2.5 -3.5 L10 -3.5 L4 1.5 L6 9 L0 4.5 L-6 9 L-4 1.5 L-10 -3.5 L-2.5 -3.5 Z" fill="#fbbf24" stroke="#b45309" stroke-width="0.8" stroke-linejoin="round"/><path d="M0 -10 L2.5 -3.5 L0 -1 Z" fill="#fff" opacity="0.55"/></g>` },
    santahat: { box: "28 8 26 26", svg: `
      <g transform="translate(42, 28)">
        <rect x="-8" y="-18" width="16" height="20" rx="6" fill="#D32F2F"/>
        <rect x="-8" y="-5" width="16" height="3" fill="#111"/>
        <rect x="-2" y="-6" width="4" height="5" fill="none" stroke="#FFD700" stroke-width="1.2"/>
        <circle cx="0" cy="-24" r="7" fill="#FFCDD2"/>
        <circle cx="-2" cy="-26" r="1" fill="#111"/>
        <circle cx="2" cy="-26" r="1" fill="#111"/>
        <path d="M -7 -22 Q 0 -12 7 -22 Q 0 -16 -7 -22 Z" fill="#FFF"/>
        <path d="M -7 -26 L 0 -38 L 7 -26 Z" fill="#D32F2F"/>
        <rect x="-8" y="-27" width="16" height="3.5" rx="1.5" fill="#FFF"/>
        <circle cx="0" cy="-38" r="3.5" fill="#FFF"/>
        <path d="M -4 0 L -2 12 L -6 12 Z" fill="#D32F2F"/>
        <rect x="-7" y="12" width="6" height="5" rx="1.5" fill="#111"/>
        <rect x="-6" y="11" width="4" height="2" fill="#FFF"/>
        <path d="M -2 -12 L -12 -5" stroke="#D32F2F" stroke-width="3" stroke-linecap="round"/>
        <circle cx="-12" cy="-5" r="2.5" fill="#111"/>
      </g>
    ` },
  };

  const DUST = `<g fill="#cbd5e1" opacity="0.8"><circle cx="20" cy="40" r="5"/><circle cx="30" cy="44" r="7"/><circle cx="42" cy="40" r="5.5"/><circle cx="35" cy="34" r="4"/></g>`;
  const ZZZ = `<g font-family="Inter, system-ui, sans-serif" font-weight="800" fill="#cbd5e1"><text x="36" y="22" font-size="7">z</text><text x="42" y="15" font-size="9">z</text><text x="50" y="7" font-size="11">Z</text></g>`;
  const SPARKLES = `<g fill="#fde047"><path d="M8 8 L9.2 11 L12 12 L9.2 13 L8 16 L6.8 13 L4 12 L6.8 11 Z"/><path d="M56 26 L57 28.5 L59.5 29.5 L57 30.5 L56 33 L55 30.5 L52.5 29.5 L55 28.5 Z"/><path d="M6 44 L6.8 46 L8.8 46.8 L6.8 47.6 L6 49.6 L5.2 47.6 L3.2 46.8 L5.2 46 Z"/></g>`;

  // Layer order: things behind Rudi first, then Rudi, then things in front.
  const BACK_SLOTS = ["wings", "sleigh", "lights"];
  const FRONT_SLOTS = ["scarf", "bow", "bell", "glasses", "hat", "crown", "santahat", "skis", "star"];

  function open(cls, box) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" class="${cls}" aria-hidden="true" focusable="false" style="overflow:visible">`;
  }

  /** Rudi with gear. state: "sleepy" | "happy" | "glowing" | "dust". */
  function rudi({ worn = [], extras = [], state = "happy", cls = "" } = {}) {
    if (state === "dust") return `${open("rudi-svg " + cls, "0 0 64 64")}${DUST}</svg>`;
    const items = new Set([...worn, ...extras]);
    const layer = (ids) => ids.filter((id) => items.has(id) && GEAR[id]).map((id) => GEAR[id].svg).join("");
    let body = BODY;
    body = state === "sleepy"
      ? body.replace('<g id="rudi-eyes">', '<g id="rudi-eyes" style="display:none">')
      : body.replace('<g id="rudi-eyes-sleepy"', '<g id="rudi-eyes-sleepy" style="display:none"');
    return `${open("rudi-svg " + cls, "0 0 64 64")}${layer(BACK_SLOTS)}${body}${layer(FRONT_SLOTS)}${state === "sleepy" ? ZZZ : ""}${state === "glowing" ? SPARKLES : ""}</svg>`;
  }

  /** A single gear item as an icon. */
  function gear(id, cls = "") {
    const g = GEAR[id];
    if (!g) return "";
    return `${open("rudi-gear " + cls, g.box)}${g.svg}</svg>`;
  }

  window.RudiArt = { rudi, gear, GEAR };
})();
