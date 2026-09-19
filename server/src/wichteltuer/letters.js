/* Letter templates in the elf's voice. Placeholders: {wichtel}, {kinder},
 * {kind}, {tag}, {frei} (free text the parent fills in). */
const TEMPLATES = [
  { id: "ankunft", title: "Ankunft", text: "Hallo {kinder}!\n\nIch bin {wichtel} und wohne ab heute hinter dieser kleinen Tür. Nachts bin ich wach, tagsüber schlafe ich – bitte nicht klopfen!\n\nIch freue mich auf euch.\nEuer {wichtel}" },
  { id: "abschied", title: "Abschied", text: "Liebe {kinder},\n\nheute Nacht reise ich zurück zum Nordpol. Danke für die schöne Zeit! Ich habe dem Weihnachtsmann erzählt, wie toll ihr wart.\n\nBis nächstes Jahr!\nEuer {wichtel}" },
  { id: "lob", title: "Lob", text: "{kinder}, ich habe etwas beobachtet, das mir sehr gefallen hat: {frei}\n\nDas erzähle ich sofort dem Weihnachtsmann!\nStolz, euer {wichtel}" },
  { id: "ermahnung", title: "Sanfte Erinnerung", text: "{kinder}, kleiner Tipp vom Wichtel: {frei}\n\nIch weiß, ihr schafft das. Ich glaube an euch!\n{wichtel}" },
  { id: "aufgabe", title: "Aufgabe", text: "{kinder}, heute habe ich eine Aufgabe für euch: {frei}\n\nIch schaue heute Nacht nach, wie es gelaufen ist.\n{wichtel}" },
  { id: "entschuldigung", title: "Entschuldigung für den Streich", text: "{kinder}, es tut mir leid wegen gestern. {frei}\n\nIch habe schon angefangen aufzuräumen – es ist nur schwer mit so kurzen Armen.\n{wichtel}" },
  { id: "antwort", title: "Antwort auf einen Kinderbrief", text: "Liebe/r {kind},\n\ndanke für deinen Brief! {frei}\n\nSchreib mir bald wieder.\nDein {wichtel}" },
  { id: "krank", title: "Erkältet", text: "Hatschi! {kinder}, ich bin erkältet und bleibe heute im Bett. Könnt ihr leise sein? Ein Tee vor der Tür wäre wunderbar.\n{wichtel}" },
  { id: "dienstreise", title: "Dienstreise", text: "{kinder}, ich muss kurz zum Nordpol – der Weihnachtsmann ruft. Morgen bin ich zurück!\n{wichtel}" },
  { id: "raetsel", title: "Rätsel", text: "Rätsel für {kinder}: {frei}\n\nDie Antwort verrate ich morgen!\n{wichtel}" },
  { id: "geschenk", title: "Kleinigkeit", text: "{kinder}, heute Nacht habe ich etwas für euch mitgebracht: {frei}\n\nViel Freude damit!\n{wichtel}" },
  { id: "geburtstag", title: "Geburtstag", text: "Alles Gute zum Geburtstag, {kind}!\n\nDie Rentiere haben extra für dich getanzt. {frei}\n\nDein {wichtel}" },
  { id: "frei", title: "Leerer Brief", text: "{kinder},\n\n{frei}\n\nEuer {wichtel}" },
];

function render(text, ctx) {
  const kids = (ctx.children || []).map((c) => c.name).filter(Boolean);
  const kinder = kids.length > 1 ? `${kids.slice(0, -1).join(", ")} und ${kids[kids.length - 1]}` : kids[0] || "Kinder";
  return String(text || "")
    .replace(/\{wichtel\}/g, ctx.elfName || "Euer Wichtel")
    .replace(/\{kinder\}/g, kinder)
    .replace(/\{kind\}/g, ctx.childName || kids[0] || "Kind")
    .replace(/\{tag\}/g, ctx.day || "")
    .replace(/\{frei\}/g, ctx.free || "…");
}

module.exports = { TEMPLATES, render };
