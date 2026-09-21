/* Rudi, the Tamagotchi reindeer, drawn as SVG.
 * Everything lives in one 64x64 coordinate system so gear from the Nordpol-Shop
 * can be composed onto him. Overflows are used for large items like the sleigh. */
(function () {
  // Base reindeer, side view facing left. Cute, detailed cartoon style!
  const BODY = `
    <style>
      @keyframes rudi-breathe {
        0%, 100% { transform: scaleY(1) translateY(0); }
        50% { transform: scaleY(0.98) translateY(1px); }
      }
      @keyframes rudi-head-bob {
        0%, 100% { transform: rotate(0deg) translateY(0); }
        50% { transform: rotate(-2deg) translateY(1px); }
      }
      @keyframes rudi-ear-twitch {
        0%, 90%, 100% { transform: rotate(0deg); }
        93% { transform: rotate(-15deg); }
        96% { transform: rotate(10deg); }
      }
      @keyframes rudi-blink {
        0%, 92%, 96%, 100% { transform: scaleY(1); }
        94% { transform: scaleY(0.1); }
      }
      @keyframes rudi-tail-wag {
        0%, 100% { transform: rotate(0deg); }
        25% { transform: rotate(-15deg); }
        75% { transform: rotate(10deg); }
      }

      .rudi-anim-body { transform-origin: 32px 50px; animation: rudi-breathe 3s ease-in-out infinite; }
      .rudi-anim-head { transform-origin: 22px 28px; animation: rudi-head-bob 3s ease-in-out infinite; }
      .rudi-anim-ear { transform-origin: 26px 8px; animation: rudi-ear-twitch 6s infinite; }
      .rudi-anim-eye { transform-origin: 19px 15px; animation: rudi-blink 5s infinite; }
      .rudi-anim-tail { transform-origin: 44px 34px; animation: rudi-tail-wag 4s ease-in-out infinite; }
    </style>
    
    <g class="rudi-anim-body">
      <!-- Tail -->
      <g class="rudi-anim-tail">
        <path d="M44,34 Q48,22 52,24 Q48,32 46,36 Z" fill="#9B6C55"/>
        <path d="M47,33 Q50,25 51,26 Q49,32 47,34 Z" fill="#BB8B6F"/>
      </g>
      
      <!-- Far Back Leg -->
      <path d="M42,42 Q40,54 39,58" fill="none" stroke="#875841" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M37,58 H41 L40,61 H37 Z" fill="#222"/>

      <!-- Far Front Leg -->
      <path d="M28,42 Q26,54 25,58" fill="none" stroke="#875841" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M23,58 H27 L26,61 H23 Z" fill="#222"/>
      
      <!-- Main Body -->
      <path d="M24,34 Q34,26 44,32 Q48,38 46,44 Q36,46 26,42 Z" fill="#A5745A"/>
      
      <!-- Lighter Underbelly -->
      <path d="M25,38 Q34,36 44,40 Q45,43 40,44 Q32,44 26,42 Z" fill="#D2A684"/>

      <!-- Near Back Leg -->
      <path d="M46,40 Q44,54 44,60" fill="none" stroke="#A5745A" stroke-width="5" stroke-linecap="round"/>
      <path d="M42,59 H47 Q47,63 45,63 H42 Q41,63 42,59 Z" fill="#111"/>

      <!-- Near Front Leg -->
      <path d="M30,40 Q28,54 29,60" fill="none" stroke="#A5745A" stroke-width="5" stroke-linecap="round"/>
      <path d="M26,59 H31 Q31,63 29,63 H27 Q25,63 26,59 Z" fill="#111"/>
      
      <!-- Neck -->
      <path d="M25,28 Q24,36 29,40 L34,36 Q28,26 28,24 Z" fill="#A5745A"/>
    </g>

    <!-- Head Group (animates independently) -->
    <g class="rudi-anim-head">
      <!-- Far Antler -->
      <path d="M20,6 L18,1 L20,0 L22,4" fill="#5F432B"/>
      <!-- Near Antler -->
      <path d="M25,8 L24,2 L26,1 L27,6" fill="#4A3421"/>

      <!-- Far Ear -->
      <path d="M22,12 Q32,4 32,8 Q28,12 24,14 Z" fill="#875841"/>

      <!-- Head Base -->
      <ellipse cx="21" cy="16" rx="9" ry="11" fill="#A5745A" transform="rotate(-15 21 16)"/>
      
      <!-- Near Ear (twitches) -->
      <g class="rudi-anim-ear">
        <path d="M26,14 Q36,8 35,12 Q30,16 26,16 Z" fill="#A5745A"/>
        <path d="M27,15 Q34,10 34,12 Q30,15 27,15 Z" fill="#D2A684"/>
      </g>

      <!-- Snout (Lighter) -->
      <path d="M14,14 C8,14 6,20 6,24 C6,28 14,26 20,24 Z" fill="#D2A684"/>
      
      <!-- Red Nose -->
      <circle cx="6" cy="20" r="3.5" fill="#DC2626"/>
      <circle cx="5" cy="19" r="1" fill="#FECACA"/>
      
      <!-- Mouth -->
      <path d="M8,24 Q11,26 14,24" fill="none" stroke="#991B1B" stroke-width="1"/>

      <!-- Scarf (built-in, accurately drawn) -->
      <g transform="translate(24, 28)">
        <!-- Back wrap -->
        <path d="M-4 -4 Q 4 -8 10 -2 C 12 2 4 6 -4 2 C -8 0 -8 -6 -4 -4 Z" fill="#FFF"/>
        <!-- Red Stripes -->
        <path d="M -2 -5 L 0 3 M 4 -4 L 6 3 M 10 0 L 8 1" stroke="#DC2626" stroke-width="3"/>
        <!-- Dangling part -->
        <path d="M 0 3 L 2 16 L -6 14 Z" fill="#FFF"/>
        <!-- Red Stripes on dangle -->
        <path d="M -1 8 L 3 9 M -2 12 L 2 13" stroke="#DC2626" stroke-width="3"/>
        <!-- Fringes -->
        <path d="M -6 14 L -6 16 M -4 14.5 L -4 16.5 M -2 15 L -2 17 M 0 15.5 L 0 17.5" stroke="#FFF" stroke-width="1.5"/>
      </g>

      <!-- Big Cute Eye -->
      <g id="rudi-eyes" class="rudi-anim-eye">
        <ellipse cx="18" cy="15" rx="4" ry="5.5" fill="#FFF" transform="rotate(10 18 15)"/>
        <ellipse cx="17.5" cy="15.5" rx="2.5" ry="4" fill="#111" transform="rotate(10 17.5 15.5)"/>
        <circle cx="16.5" cy="13.5" r="1.2" fill="#FFF"/>
      </g>
      <!-- Sleepy eye (hidden by default) -->
      <g id="rudi-eyes-sleepy" style="display:none" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round">
        <path d="M15,16 Q18,18 21,16"/>
      </g>
    </g>
  `;

  // Perfectly calibrated to the new image. `box` is always square (width=height) for perfect shop tiles.
  const GEAR = {
    bow: { box: "16 24 16 16", svg: `<g transform="translate(24, 32)"><path d="M0 0 L-5 -4 L-5 4 Z" fill="#f472b6"/><path d="M0 0 L5 -4 L5 4 Z" fill="#f472b6"/><circle r="2.5" fill="#fbcfe8" stroke="#be185d" stroke-width="0.8"/></g>` },
    // Scarf looks like a scarf in shop, but when worn it just adds a magical sparkle to his built-in scarf!
    scarf: { 
      box: "0 0 20 20", 
      svg: `<g transform="translate(10, 10)"><path d="M-6 -2 Q 2 -6 8 0 C 10 4 2 8 -6 4 C -10 2 -10 -4 -6 -2 Z" fill="#FFF"/><path d="M -4 -3 L -2 4 M 2 -2 L 4 5 M 8 1 L 6 3" stroke="#DC2626" stroke-width="3"/><path d="M 0 4 L 4 16 L -4 14 Z" fill="#FFF"/><path d="M -1 8 L 3 9 M -2 12 L 2 13" stroke="#DC2626" stroke-width="3"/></g>`,
      wornSvg: `<g transform="translate(22, 30)"><circle r="1" fill="#fde047"/><path d="M0 -3 L1 -1 L3 0 L1 1 L0 3 L-1 1 L-3 0 L-1 -1 Z" fill="#fbbf24"/></g>`
    },
    bell: { box: "16 26 16 16", svg: `<g transform="translate(24, 34)"><circle cy="2" r="3" fill="#fbbf24" stroke="#b45309" stroke-width="0.8"/><rect x="-4" y="-2" width="8" height="2" rx="1" fill="#d97706"/><circle cy="3" r="1.5" fill="#b45309"/><path d="M0 -2 L0 -5" stroke="#b45309" stroke-width="1.5"/></g>` },
    hat: { box: "14 -6 20 20", svg: `<g transform="translate(24, 4) rotate(15)"><rect x="-7" y="-12" width="14" height="11" rx="1" fill="#111827"/><rect x="-7" y="-3" width="14" height="2.5" fill="#dc2626"/><rect x="-10" y="-1" width="20" height="2.5" rx="1" fill="#111827"/></g>` },
    crown: { box: "14 -3 20 20", svg: `<g transform="translate(24, 7)"><path d="M-8 0 L-8 -7 L-4 -3 L0 -8 L4 -3 L8 -7 L8 0 Z" fill="#fbbf24" stroke="#b45309" stroke-width="0.8" stroke-linejoin="round"/><rect x="-8" y="0" width="16" height="2.5" fill="#f59e0b"/><circle cx="-4" cy="-3" r="1.2" fill="#ef4444"/><circle cx="0" cy="-6" r="1.2" fill="#3b82f6"/><circle cx="4" cy="-3" r="1.2" fill="#22c55e"/></g>` },
    glasses: { box: "9 4 20 20", svg: `<g transform="translate(19, 14) rotate(-5)"><rect x="-5" y="-3" width="6" height="5" rx="1.5" fill="#0f172a" fill-opacity="0.9"/><rect x="3" y="-3" width="6" height="5" rx="1.5" fill="#0f172a" fill-opacity="0.9"/><path d="M 1 -1.5 L 3 -1.5 M -5 -1.5 L -7 -1.5" stroke="#0f172a" stroke-width="1.5"/><path d="M -3 -1 L -1 -1 M 5 -1 L 7 -1" stroke="#93c5fd" stroke-width="0.8" opacity="0.8"/></g>` },
    skis: { box: "12 40 40 40", svg: `<g fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"><path d="M 16 60 L 52 60 Q 56 60 56 57"/></g><g fill="#e2e8f0"><rect x="20" y="57" width="6" height="2.5" rx="1"/><rect x="28" y="57" width="6" height="2.5" rx="1"/><rect x="40" y="57" width="6" height="2.5" rx="1"/><rect x="48" y="57" width="6" height="2.5" rx="1"/></g>` },
    lights: { box: "20 20 32 32", svg: `<path d="M 28 35 Q 38 20 50 35" fill="none" stroke="#166534" stroke-width="1.5"/><g><circle cx="32" cy="28" r="2" fill="#ef4444"/><circle cx="38" cy="25" r="2" fill="#facc15"/><circle cx="44" cy="28" r="2" fill="#3b82f6"/><circle cx="48" cy="32" r="2" fill="#22c55e"/><circle cx="35" cy="32" r="2" fill="#f97316"/></g>` },
    sleigh: { box: "45 5 50 50", svg: `
      <path d="M 32 32 Q 50 35 60 35" fill="none" stroke="#B22222" stroke-width="2" stroke-dasharray="4 2"/>
      <path d="M 28 28 Q 50 30 60 30" fill="none" stroke="#B22222" stroke-width="2" stroke-dasharray="4 2"/>
      <g transform="translate(60, 26)">
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
    wings: { box: "24 14 24 24", svg: `<g transform="translate(36, 26)" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" stroke-linejoin="round"><path d="M 0 5 C 4 -5 12 -10 18 -10 C 16 -4 14 0 12 4 C 14 4 16 3 18 3 C 15 7 12 9 9 10 C 11 10 12 10 14 10 C 10 14 5 15 2 13 Z"/><path d="M 2 11 C 3 4 7 -2 12 -4" fill="none"/></g>` },
    star: { box: "36 -2 24 24", svg: `<g transform="translate(48, 10)"><circle r="12" fill="#fde047" opacity="0.25"/><path d="M0 -10 L2.5 -3.5 L10 -3.5 L4 1.5 L6 9 L0 4.5 L-6 9 L-4 1.5 L-10 -3.5 L-2.5 -3.5 Z" fill="#fbbf24" stroke="#b45309" stroke-width="0.8" stroke-linejoin="round"/><path d="M0 -10 L2.5 -3.5 L0 -1 Z" fill="#fff" opacity="0.55"/></g>` },
    santahat: { box: "24 0 24 24", svg: `
      <g transform="translate(36, 24)">
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
  const ZZZ = `<g font-family="Inter, system-ui, sans-serif" font-weight="800" fill="#cbd5e1"><text x="10" y="6" font-size="7">z</text><text x="16" y="-2" font-size="9">z</text><text x="24" y="-10" font-size="11">Z</text></g>`;
  const SPARKLES = `<g fill="#fde047"><path d="M8 8 L9.2 11 L12 12 L9.2 13 L8 16 L6.8 13 L4 12 L6.8 11 Z"/><path d="M56 26 L57 28.5 L59.5 29.5 L57 30.5 L56 33 L55 30.5 L52.5 29.5 L55 28.5 Z"/><path d="M6 44 L6.8 46 L8.8 46.8 L6.8 47.6 L6 49.6 L5.2 47.6 L3.2 46.8 L5.2 46 Z"/></g>`;

  // Items that attach to the head (will bob with the head)
  const HEAD_ITEMS = ["bow", "bell", "glasses", "hat", "crown", "scarf"];
  // Items that attach to the body (will breathe with the body)
  const BODY_ITEMS = ["wings", "sleigh", "lights", "skis", "star", "santahat"];

  function open(cls, box) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" class="${cls}" aria-hidden="true" focusable="false" style="overflow:visible">`;
  }

  /** Rudi with gear. state: "sleepy" | "happy" | "glowing" | "dust". */
  function rudi({ worn = [], extras = [], state = "happy", cls = "" } = {}) {
    if (state === "dust") return `${open("rudi-svg " + cls, "0 0 64 64")}${DUST}</svg>`;
    const items = new Set([...worn, ...extras]);
    const layer = (ids) => ids.filter((id) => items.has(id) && GEAR[id]).map((id) => GEAR[id].wornSvg || GEAR[id].svg).join("");
    
    let headGear = layer(HEAD_ITEMS);
    let bodyGear = layer(BODY_ITEMS);

    let bodyStr = BODY;
    // Inject head items right after the eye group
    bodyStr = bodyStr.replace('</g>\n      <!-- Sleepy eye (hidden by default) -->', `</g>${headGear}\n      <!-- Sleepy eye (hidden by default) -->`);
    // Inject body items right before the Neck
    bodyStr = bodyStr.replace('<!-- Neck -->', `${bodyGear}\n      <!-- Neck -->`);

    if (state === "sleepy") {
      bodyStr = bodyStr.replace('<g id="rudi-eyes"', '<g id="rudi-eyes" style="display:none"');
      bodyStr = bodyStr.replace('<g id="rudi-eyes-sleepy" style="display:none"', '<g id="rudi-eyes-sleepy"');
    }

    return `${open("rudi-svg " + cls, "0 0 64 64")}${bodyStr}${state === "sleepy" ? ZZZ : ""}${state === "glowing" ? SPARKLES : ""}</svg>`;
  }

  /** A single gear item as an icon. */
  function gear(id, cls = "") {
    const g = GEAR[id];
    if (!g) return "";
    return `${open("rudi-gear " + cls, g.box)}${g.svg}</svg>`;
  }

  window.RudiArt = { rudi, gear, GEAR };
})();
