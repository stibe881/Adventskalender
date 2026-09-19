/* Rudi, the Tamagotchi reindeer, drawn as SVG (no emojis).
 * Everything lives in one 64×64 coordinate system so gear from the Nordpol-Shop
 * can be composed onto him: RudiArt.rudi({ worn, state, extras }) renders Rudi
 * with whatever he wears; RudiArt.gear(id) renders a single item as an icon. */
(function () {
  // Base reindeer, side view facing left. Slots are just documented positions.
  const BODY = `
    <g id="rudi-antlers" fill="none" stroke="#5b3a1a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 15 C15 9 13 7 10 5 M16 11 L12 10 M15 8 L13 4"/>
      <path d="M26 15 C28 9 30 7 33 5 M27 11 L31 10 M28 8 L30 4"/>
    </g>
    <path d="M30 34 C36 28 50 28 52 40 C53 48 46 52 38 52 L30 52 Z" fill="#8b5a2b"/>
    <path d="M30 34 C36 30 46 30 50 38 C50 42 44 46 38 46 L30 46 Z" fill="#a0693a" opacity="0.55"/>
    <g fill="#6b4423">
      <rect x="31" y="49" width="4.5" height="10" rx="1.5"/><rect x="37" y="49" width="4.5" height="10" rx="1.5"/>
      <rect x="43" y="49" width="4.5" height="10" rx="1.5"/><rect x="48" y="47" width="4.5" height="12" rx="1.5"/>
    </g>
    <g fill="#3b2412">
      <rect x="31" y="57" width="4.5" height="2.5" rx="1"/><rect x="37" y="57" width="4.5" height="2.5" rx="1"/>
      <rect x="43" y="57" width="4.5" height="2.5" rx="1"/><rect x="48" y="57" width="4.5" height="2.5" rx="1"/>
    </g>
    <path d="M52 40 C56 38 58 41 55 44 Z" fill="#6b4423"/>
    <path d="M26 30 C26 24 30 22 32 26 L31 36 Z" fill="#8b5a2b"/>
    <ellipse cx="21.5" cy="26" rx="10" ry="9.5" fill="#a0693a"/>
    <ellipse cx="14" cy="21" rx="3.2" ry="1.9" transform="rotate(-30 14 21)" fill="#a0693a"/>
    <ellipse cx="29" cy="21" rx="3.2" ry="1.9" transform="rotate(30 29 21)" fill="#a0693a"/>
    <ellipse cx="16.5" cy="31" rx="6.5" ry="4.8" fill="#c98d5a"/>
    <circle cx="12.5" cy="30.5" r="3.4" fill="#e11d48"/>
    <circle cx="11.5" cy="29.5" r="1.1" fill="#fecdd3" opacity="0.9"/>
    <g id="rudi-eyes">
      <circle cx="19" cy="23.5" r="1.7" fill="#1f1209"/><circle cx="25" cy="23.5" r="1.7" fill="#1f1209"/>
      <circle cx="19.6" cy="22.9" r="0.55" fill="#fff"/><circle cx="25.6" cy="22.9" r="0.55" fill="#fff"/>
    </g>
    <g id="rudi-eyes-sleepy" fill="none" stroke="#1f1209" stroke-width="1.4" stroke-linecap="round">
      <path d="M17.3 24 Q19 25.4 20.7 24"/><path d="M23.3 24 Q25 25.4 26.7 24"/>
    </g>
    <path d="M17 34.5 Q19 36 21 34.5" fill="none" stroke="#7a4a22" stroke-width="1.1" stroke-linecap="round"/>`;

  // Gear in Rudi coordinates. `box` is the viewBox used when the item is shown alone.
  const GEAR = {
    bow: { box: "24 30 14 12", svg: `<g transform="translate(31 36)"><path d="M0 0 L-6 -4.5 L-6 4.5 Z" fill="#f472b6"/><path d="M0 0 L6 -4.5 L6 4.5 Z" fill="#f472b6"/><path d="M0 0 L-6 -4.5 L-4 0 Z" fill="#be185d" opacity="0.5"/><path d="M0 0 L6 -4.5 L4 0 Z" fill="#be185d" opacity="0.5"/><circle r="2" fill="#fbcfe8" stroke="#be185d" stroke-width="0.8"/></g>` },
    scarf: { box: "22 30 16 16", svg: `<path d="M24 33 Q31 38 37 34 L37 38 Q31 42 24 37 Z" fill="#dc2626"/><path d="M33 37 L35 45 L30 45 L30 38 Z" fill="#dc2626"/><path d="M30 42 L35 42" stroke="#fca5a5" stroke-width="1"/><path d="M24 35 Q31 40 37 36" fill="none" stroke="#fca5a5" stroke-width="1"/>` },
    bell: { box: "26 32 12 12", svg: `<g transform="translate(32 38)"><path d="M-4 3 Q-4 -3 0 -4 Q4 -3 4 3 Z" fill="#fbbf24" stroke="#b45309" stroke-width="0.8"/><rect x="-4.8" y="2.5" width="9.6" height="1.6" rx="0.8" fill="#d97706"/><circle cy="4.8" r="1.2" fill="#b45309"/><path d="M0 -4 L0 -6" stroke="#b45309" stroke-width="1"/></g>` },
    hat: { box: "9 -1 26 18", svg: `<g transform="translate(22 12) rotate(-6)"><rect x="-6" y="-11" width="12" height="10" rx="1" fill="#111827"/><rect x="-6" y="-4" width="12" height="2.2" fill="#dc2626"/><rect x="-9" y="-1.6" width="18" height="2.6" rx="1.3" fill="#111827"/></g>` },
    crown: { box: "12 2 20 14", svg: `<g transform="translate(22 12)"><path d="M-7 1 L-7 -6 L-3.5 -2 L0 -7 L3.5 -2 L7 -6 L7 1 Z" fill="#fbbf24" stroke="#b45309" stroke-width="0.8" stroke-linejoin="round"/><rect x="-7" y="0" width="14" height="2.4" fill="#f59e0b"/><circle cx="-3.5" cy="-2" r="1" fill="#ef4444"/><circle cx="0" cy="-5" r="1" fill="#3b82f6"/><circle cx="3.5" cy="-2" r="1" fill="#22c55e"/></g>` },
    glasses: { box: "13 18 18 10", svg: `<g fill="#0f172a" stroke="#0f172a" stroke-width="1"><rect x="15.5" y="21" width="7" height="4.8" rx="2" fill-opacity="0.9"/><rect x="24" y="21" width="7" height="4.8" rx="2" fill-opacity="0.9"/><path d="M22.5 23 L24 23" fill="none"/><path d="M13.5 22.5 L15.5 22"/></g><path d="M17 22 L20 22" stroke="#93c5fd" stroke-width="0.7" opacity="0.8"/><path d="M25.5 22 L28.5 22" stroke="#93c5fd" stroke-width="0.7" opacity="0.8"/>` },
    skis: { box: "28 54 28 8", svg: `<g fill="none" stroke="#94a3b8" stroke-width="1.6" stroke-linecap="round"><path d="M29 60.5 L42 60.5"/><path d="M42 60.5 Q45 60.5 45 58"/><path d="M42 60.5 L55 60.5"/><path d="M55 60.5 Q58 60.5 58 58"/></g><g fill="#e2e8f0"><rect x="30.5" y="58" width="5.5" height="2.2" rx="0.6"/><rect x="36.5" y="58" width="5.5" height="2.2" rx="0.6"/><rect x="42.5" y="58" width="5.5" height="2.2" rx="0.6"/><rect x="47.5" y="58" width="5.5" height="2.2" rx="0.6"/></g>` },
    lights: { box: "24 22 34 26", svg: `<path d="M27 40 Q40 22 56 40" fill="none" stroke="#166534" stroke-width="1"/><g><circle cx="29" cy="37.5" r="1.7" fill="#ef4444"/><circle cx="34" cy="32" r="1.7" fill="#facc15"/><circle cx="40" cy="28.5" r="1.7" fill="#3b82f6"/><circle cx="46" cy="28.8" r="1.7" fill="#22c55e"/><circle cx="51.5" cy="33" r="1.7" fill="#f97316"/><circle cx="55" cy="38.5" r="1.7" fill="#a855f7"/></g>` },
    sleigh: { box: "36 36 28 24", svg: `<g transform="translate(40 40)"><path d="M0 4 L18 4 L20 -2 L22 -2 L22 8 Q22 12 18 12 L2 12 Q-2 12 -2 8 Z" fill="#dc2626"/><path d="M-1 8 L20 8" stroke="#fca5a5" stroke-width="1"/><path d="M22 -2 Q24 -4 22 -6" fill="none" stroke="#dc2626" stroke-width="2"/><path d="M-3 15 L21 15 Q25 15 26 12" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round"/><path d="M0 12 L0 15 M18 12 L18 15" stroke="#fbbf24" stroke-width="1.5"/></g>` },
    wings: { box: "34 14 22 24", svg: `<g fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.8" stroke-linejoin="round"><path d="M38 32 C40 22 48 16 55 16 C52 21 50 24 48 27 C50 27 52 26 54 26 C51 30 48 32 45 33 C47 33 48 33 50 33 C46 36 41 37 38 35 Z"/><path d="M38 33 C39 26 43 21 48 19" fill="none"/></g>` },
    star: { box: "40 0 22 22", svg: `<g transform="translate(51 10)"><circle r="9" fill="#fde047" opacity="0.18"/><path d="M0 -8 L2 -2.7 L7.6 -2.5 L3.2 1 L4.7 6.5 L0 3.3 L-4.7 6.5 L-3.2 1 L-7.6 -2.5 L-2 -2.7 Z" fill="#fbbf24" stroke="#b45309" stroke-width="0.8" stroke-linejoin="round"/><path d="M0 -8 L2 -2.7 L0 -0.8 Z" fill="#fff" opacity="0.55"/></g>` },
    santahat: { box: "28 6 22 26", svg: `<g transform="translate(39 22)"><rect x="-5" y="-2" width="10" height="9" rx="2.5" fill="#dc2626"/><rect x="-5" y="5" width="10" height="2" fill="#f8fafc"/><circle cy="-5" r="4" fill="#fcd9b6"/><path d="M-4 -4 Q0 -2 4 -4 L4 -1 Q0 3 -4 -1 Z" fill="#f8fafc"/><path d="M-4.5 -6.5 Q0 -13 5.5 -7 L-4.5 -6.5 Z" fill="#dc2626"/><rect x="-5" y="-7.4" width="10.5" height="1.8" rx="0.9" fill="#f8fafc"/><circle cx="5.6" cy="-11" r="1.5" fill="#f8fafc"/><circle cx="-1.2" cy="-5.5" r="0.6" fill="#1f1209"/><circle cx="1.2" cy="-5.5" r="0.6" fill="#1f1209"/><circle cy="-4.2" r="0.9" fill="#f87171"/></g>` },
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
