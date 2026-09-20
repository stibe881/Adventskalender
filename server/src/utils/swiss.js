/* "Schweizer Modus": in Switzerland the Christkind brings the presents and
 * the Samichlaus comes on 6 December. These helpers swap the figures in door
 * texts, in both directions, with the German articles kept correct. */

const TO_SWISS = [
  [/\bDer Weihnachtsmann\b/g, "Das Christkind"],
  [/\bder Weihnachtsmann\b/g, "das Christkind"],
  [/\bDen Weihnachtsmann\b/g, "Das Christkind"],
  [/\bden Weihnachtsmann\b/g, "das Christkind"],
  [/\bDem Weihnachtsmann\b/g, "Dem Christkind"],
  [/\bdem Weihnachtsmann\b/g, "dem Christkind"],
  [/\bvom Weihnachtsmann\b/g, "vom Christkind"],
  [/\bWeihnachtsmanns\b/g, "Christkinds"],
  [/\bWeihnachtsmann\b/g, "Christkind"],
  [/\bWeihnachtsmänner\b/g, "Christkinder"],
  [/\bSanta Claus\b/g, "Samichlaus"],
  [/\bNikolaustag\b/g, "Samichlaustag"],
  [/\bNikolaus\b/g, "Samichlaus"],
  // The Christkind has wings, not a sleigh.
  [/\bdas Christkind durch die Luft\b/g, "das Christkind zu den Kindern"],
];

const TO_GERMAN = [
  [/\bDas Christkind\b/g, "Der Weihnachtsmann"],
  [/\bdas Christkind\b/g, "der Weihnachtsmann"],
  [/\bDem Christkind\b/g, "Dem Weihnachtsmann"],
  [/\bdem Christkind\b/g, "dem Weihnachtsmann"],
  [/\bvom Christkind\b/g, "vom Weihnachtsmann"],
  [/\bChristkinds\b/g, "Weihnachtsmanns"],
  [/\bChristkind\b/g, "Weihnachtsmann"],
  [/\bSamichlaustag\b/g, "Nikolaustag"],
  [/\bSamichlaus\b/g, "Nikolaus"],
];

function convertText(text, toSwiss) {
  let out = String(text);
  for (const [re, rep] of toSwiss ? TO_SWISS : TO_GERMAN) out = out.replace(re, rep);
  return out;
}

/** Walks a content object and converts every string in it. */
function convertContent(value, toSwiss) {
  if (typeof value === "string") return convertText(value, toSwiss);
  if (Array.isArray(value)) return value.map((v) => convertContent(v, toSwiss));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      // Never touch uploaded files, links or codes.
      out[k] = ["url", "fileUrl", "image", "images", "imageUrl", "qrImage", "modelUrl", "playlistUrl", "spotifyUrl", "data", "code", "ppImage"].includes(k) ? v : convertContent(v, toSwiss);
    }
    return out;
  }
  return value;
}

function convertDays(days, toSwiss) {
  for (const d of days || []) if (d.content) d.content = convertContent(d.content, toSwiss);
  return days;
}

module.exports = { convertText, convertContent, convertDays };
