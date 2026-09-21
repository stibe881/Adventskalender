/* Rudi, the Tamagotchi reindeer, drawn as SVG.
 * Everything lives in one 64x64 coordinate system so gear from the Nordpol-Shop
 * can be composed onto him. Overflows are used for large items like the sleigh. */
(function () {
  // Front-facing chubby cute reindeer
  const BODY_FRONT = `
    <style>
      @keyframes rudi-breathe-front {
        0%, 100% { transform: scaleY(1) translateY(0); }
        50% { transform: scaleY(0.98) translateY(1px); }
      }
      @keyframes rudi-head-bob-front {
        0%, 100% { transform: rotate(0deg) translateY(0); }
        50% { transform: rotate(1deg) translateY(0.5px); }
      }
      @keyframes rudi-ear-twitch-l {
        0%, 90%, 100% { transform: rotate(0deg); }
        93% { transform: rotate(-15deg); }
        96% { transform: rotate(10deg); }
      }
      @keyframes rudi-ear-twitch-r {
        0%, 90%, 100% { transform: rotate(0deg); }
        93% { transform: rotate(15deg); }
        96% { transform: rotate(-10deg); }
      }
      @keyframes rudi-blink-front {
        0%, 92%, 96%, 100% { transform: scaleY(1); }
        94% { transform: scaleY(0.1); }
      }

      .rudi-anim-body-front { transform-origin: 32px 42px; animation: rudi-breathe-front 3s ease-in-out infinite; }
      .rudi-anim-head-front { transform-origin: 32px 28px; animation: rudi-head-bob-front 3s ease-in-out infinite; }
      .rudi-anim-ear-l { transform-origin: 20px 16px; animation: rudi-ear-twitch-l 5s infinite; }
      .rudi-anim-ear-r { transform-origin: 44px 16px; animation: rudi-ear-twitch-r 6s infinite; }
      .rudi-anim-eye-front { transform-origin: 32px 16px; animation: rudi-blink-front 5s infinite; }
    </style>
    
    <g class="rudi-anim-body-front">
      <!-- Tail (on the left) -->
      <path d="M18 40 Q 14 38 15 44 Q 18 44 20 42 Z" fill="#A5745A"/>
      
      <!-- Main Body -->
      <circle cx="32" cy="42" r="16" fill="#A5745A"/>
      
      <!-- Belly -->
      <ellipse cx="32" cy="47" rx="9" ry="8" fill="#C89F82"/>
      
      <!-- Front Legs -->
      <rect x="25" y="47" width="4" height="12" rx="2" fill="#C89F82"/>
      <rect x="35" y="47" width="4" height="12" rx="2" fill="#C89F82"/>
      
      <!-- Hooves -->
      <path d="M 25 57 H 29 V 58 Q 27 59 25 58 Z" fill="#3E2723"/>
      <path d="M 35 57 H 39 V 58 Q 37 59 35 58 Z" fill="#3E2723"/>
    </g>

    <!-- Head Group -->
    <g class="rudi-anim-head-front">
      <!-- Antlers -->
      <path d="M28 8 L24 2 L23 3 L25 5 L22 6 L23 7 L26 7 L28 10 Z" fill="#5D4037"/>
      <path d="M36 8 L40 2 L41 3 L39 5 L42 6 L41 7 L38 7 L36 10 Z" fill="#5D4037"/>

      <!-- Ears -->
      <g class="rudi-anim-ear-l"><path d="M 22 14 Q 14 10 16 17 Q 18 19 22 17 Z" fill="#A5745A"/></g>
      <g class="rudi-anim-ear-r"><path d="M 42 14 Q 50 10 48 17 Q 46 19 42 17 Z" fill="#A5745A"/></g>

      <!-- Head Base -->
      <ellipse cx="32" cy="18" rx="12" ry="11" fill="#A5745A"/>
      
      <!-- Muzzle -->
      <ellipse cx="32" cy="23" rx="7.5" ry="5.5" fill="#C89F82"/>
      
      <!-- Nose -->
      <circle cx="32" cy="22" r="3" fill="#E63946"/>
      <circle cx="31" cy="21" r="0.8" fill="#FFF" opacity="0.9"/>

      <!-- Eyes -->
      <g class="rudi-anim-eye-front">
        <ellipse cx="27" cy="16" rx="1.5" ry="2.5" fill="#3E2723"/>
        <circle cx="26.5" cy="15" r="0.6" fill="#FFF"/>
        
        <ellipse cx="37" cy="16" rx="1.5" ry="2.5" fill="#3E2723"/>
        <circle cx="36.5" cy="15" r="0.6" fill="#FFF"/>
      </g>
      
      <!-- Sleepy eye lines (hidden by default) -->
      <g id="rudi-eyes-sleepy" style="display:none" fill="none" stroke="#3E2723" stroke-width="1.2" stroke-linecap="round">
        <path d="M25,16 Q27,17 29,16" />
        <path d="M35,16 Q37,17 39,16" />
      </g>
    </g>
  `;

  // Perfectly calibrated shop items drawn from a FRONT perspective!
  const FRONT_GEAR = {
    bow: { box: "24 24 16 16", svg: `<g transform="translate(32, 28)"><path d="M0 0 L-6 -4 L-6 4 Z" fill="#f472b6"/><path d="M0 0 L6 -4 L6 4 Z" fill="#f472b6"/><circle r="2.5" fill="#fbcfe8" stroke="#be185d" stroke-width="0.8"/></g>` },
    scarf: { box: "20 22 24 24", svg: `
      <g transform="translate(32, 27)">
        <path d="M-8 -2 Q 0 -6 8 -2 C 10 2 0 6 -8 2 C -10 0 -10 -4 -8 -2 Z" fill="#FFF"/>
        <path d="M -4 -3 L -4 4 M 4 -3 L 4 4" stroke="#DC2626" stroke-width="3"/>
        <path d="M -4 4 L -6 16 L 0 14 Z" fill="#FFF"/>
        <path d="M -5 8 L -2 7.5 M -5.5 12 L -2 11.5" stroke="#DC2626" stroke-width="3"/>
      </g>` 
    },
    bell: { box: "24 24 16 16", svg: `<g transform="translate(32, 29)"><circle cy="2" r="3" fill="#fbbf24" stroke="#b45309" stroke-width="0.8"/><rect x="-4" y="-2" width="8" height="2" rx="1" fill="#d97706"/><circle cy="3" r="1.5" fill="#b45309"/><path d="M0 -2 L0 -5" stroke="#b45309" stroke-width="1.5"/></g>` },
    hat: { box: "20 -4 24 24", svg: `<g transform="translate(32, 6)"><rect x="-9" y="-12" width="18" height="11" rx="2" fill="#111827"/><rect x="-9" y="-3" width="18" height="2.5" fill="#dc2626"/><rect x="-12" y="-1" width="24" height="2.5" rx="1" fill="#111827"/></g>` },
    crown: { box: "20 -2 24 24", svg: `<g transform="translate(32, 7)"><path d="M-10 0 L-10 -7 L-5 -3 L0 -8 L5 -3 L10 -7 L10 0 Z" fill="#fbbf24" stroke="#b45309" stroke-width="0.8" stroke-linejoin="round"/><rect x="-10" y="0" width="20" height="2.5" fill="#f59e0b"/><circle cx="-5" cy="-3" r="1.2" fill="#ef4444"/><circle cx="0" cy="-6" r="1.2" fill="#3b82f6"/><circle cx="5" cy="-3" r="1.2" fill="#22c55e"/></g>` },
    glasses: { box: "20 8 24 24", svg: `<g transform="translate(32, 16)"><rect x="-9" y="-3" width="7" height="5" rx="1.5" fill="#0f172a" fill-opacity="0.9"/><rect x="2" y="-3" width="7" height="5" rx="1.5" fill="#0f172a" fill-opacity="0.9"/><path d="M -2 -1 L 2 -1" stroke="#0f172a" stroke-width="1.5"/><path d="M -7 -1 L -5 -1 M 4 -1 L 6 -1" stroke="#93c5fd" stroke-width="0.8" opacity="0.8"/></g>` },
    skis: { box: "16 48 32 32", svg: `<g fill="none" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"><path d="M 22 45 L 22 62 Q 22 64 20 65"/><path d="M 42 45 L 42 62 Q 42 64 44 65"/></g>` },
    lights: { box: "16 26 32 32", svg: `<path d="M 18 35 Q 32 45 46 35" fill="none" stroke="#166534" stroke-width="1.5"/><g><circle cx="24" cy="38" r="2" fill="#ef4444"/><circle cx="32" cy="40" r="2" fill="#facc15"/><circle cx="40" cy="38" r="2" fill="#3b82f6"/></g>` },
    sleigh: { box: "12 20 40 40", svg: `
      <!-- Backrest of sleigh seen from front -->
      <path d="M 16 25 H 48 V 40 C 48 50 16 50 16 40 Z" fill="#8B0000"/>
      <path d="M 14 25 H 50 V 28 H 14 Z" fill="#FFD700"/>
      <!-- Sleigh runners sticking out sides -->
      <path d="M 10 50 L 10 55 L 54 55 L 54 50" fill="none" stroke="#C0C0C0" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="16" y1="45" x2="16" y2="55" stroke="#C0C0C0" stroke-width="2"/>
      <line x1="48" y1="45" x2="48" y2="55" stroke="#C0C0C0" stroke-width="2"/>
    ` },
    wings: { box: "8 20 48 48", svg: `<g fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" stroke-linejoin="round">
      <path d="M 17 38 C 10 38 5 32 5 25 C 10 28 15 32 17 35 Z"/>
      <path d="M 47 38 C 54 38 59 32 59 25 C 54 28 49 32 47 35 Z"/>
    </g>` },
    star: { box: "20 -10 24 24", svg: `<g transform="translate(32, -2)"><circle r="12" fill="#fde047" opacity="0.25"/><path d="M0 -10 L2.5 -3.5 L10 -3.5 L4 1.5 L6 9 L0 4.5 L-6 9 L-4 1.5 L-10 -3.5 L-2.5 -3.5 Z" fill="#fbbf24" stroke="#b45309" stroke-width="0.8" stroke-linejoin="round"/><path d="M0 -10 L2.5 -3.5 L0 -1 Z" fill="#fff" opacity="0.55"/></g>` },
    santahat: { box: "20 -2 24 24", svg: `
      <g transform="translate(32, 6)">
        <path d="M -8 -8 C -4 -20 4 -20 8 -8 Z" fill="#D32F2F"/>
        <rect x="-9" y="-8" width="18" height="4" rx="2" fill="#FFF"/>
        <circle cx="8" cy="-18" r="3.5" fill="#FFF"/>
      </g>
    ` },
  };

  const DUST = `<g fill="#cbd5e1" opacity="0.8"><circle cx="20" cy="40" r="5"/><circle cx="30" cy="44" r="7"/><circle cx="42" cy="40" r="5.5"/><circle cx="35" cy="34" r="4"/></g>`;
  const ZZZ = `<g font-family="Inter, system-ui, sans-serif" font-weight="800" fill="#cbd5e1"><text x="12" y="4" font-size="7">z</text><text x="16" y="-2" font-size="9">z</text><text x="22" y="-10" font-size="11">Z</text></g>`;
  const SPARKLES = `<g fill="#fde047"><path d="M8 8 L9.2 11 L12 12 L9.2 13 L8 16 L6.8 13 L4 12 L6.8 11 Z"/><path d="M56 26 L57 28.5 L59.5 29.5 L57 30.5 L56 33 L55 30.5 L52.5 29.5 L55 28.5 Z"/><path d="M6 44 L6.8 46 L8.8 46.8 L6.8 47.6 L6 49.6 L5.2 47.6 L3.2 46.8 L5.2 46 Z"/></g>`;

  // Front items
  const FRONT_HEAD_ITEMS = ["bow", "bell", "glasses", "hat", "crown", "scarf"];
  const FRONT_BODY_ITEMS = ["wings", "sleigh", "lights", "skis", "star", "santahat"];
  const FRONT_BACK_SLOTS = ["wings", "sleigh", "star"];

  function open(cls, box) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" class="${cls}" aria-hidden="true" focusable="false" style="overflow:visible">`;
  }

  /** Rudi with gear. state: "sleepy" | "happy" | "glowing" | "dust". view: "front" | "side" */
  function rudi({ worn = [], extras = [], state = "happy", view = "front", cls = "" } = {}) {
    if (state === "dust") return `${open("rudi-svg " + cls, "0 0 64 64")}${DUST}</svg>`;
    
    // Fallback to side gear if we eventually add it, but currently everything is front
    const GEAR = FRONT_GEAR; 
    const items = new Set([...worn, ...extras]);
    const layer = (ids) => ids.filter((id) => items.has(id) && GEAR[id]).map((id) => GEAR[id].svg).join("");
    
    // Front View Rendering
    let headGear = layer(FRONT_HEAD_ITEMS);
    let backGear = layer(FRONT_BACK_SLOTS);
    let frontBodyGear = layer(FRONT_BODY_ITEMS.filter(id => !FRONT_BACK_SLOTS.includes(id)));

    let bodyStr = BODY_FRONT;
    
    // Inject back gear behind the body
    bodyStr = bodyStr.replace('<g class="rudi-anim-body-front">', `<g class="rudi-anim-body-front">${backGear}`);
    // Inject front body gear inside body group
    bodyStr = bodyStr.replace('</g>\n\n    <!-- Head Group -->', `${frontBodyGear}\n    </g>\n\n    <!-- Head Group -->`);
    // Inject head items right after eyes
    bodyStr = bodyStr.replace('</g>\n      \n      <!-- Sleepy eye', `</g>${headGear}\n      \n      <!-- Sleepy eye`);

    if (state === "sleepy") {
      bodyStr = bodyStr.replace('<g class="rudi-anim-eye-front"', '<g class="rudi-anim-eye-front" style="display:none"');
      bodyStr = bodyStr.replace('<g id="rudi-eyes-sleepy" style="display:none"', '<g id="rudi-eyes-sleepy"');
    }

    return `${open("rudi-svg " + cls, "0 0 64 64")}${bodyStr}${state === "sleepy" ? ZZZ : ""}${state === "glowing" ? SPARKLES : ""}</svg>`;
  }

  /** A single gear item as an icon. */
  function gear(id) {
    if (!FRONT_GEAR[id]) return "";
    return open("rudi-gear-icon", FRONT_GEAR[id].box) + FRONT_GEAR[id].svg + "</svg>";
  }

  window.RudiArt = { rudi, gear, GEAR: FRONT_GEAR };
})();
