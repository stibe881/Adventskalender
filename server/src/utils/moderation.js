/* Content safety for everything users write to each other: a word filter for
 * the obvious cases (insults, slurs, sexual content) plus helpers shared by
 * the routes. The filter is deliberately conservative: it blocks clear hits
 * on word boundaries and leaves the rest to reports and moderation. */

// Normalised stems; plurals and common endings are matched by the regex.
const BLOCKLIST = [
  // German / Swiss German
  "arschloch", "arschlöcher", "arschgeige", "arschkriecher", "fick", "ficken", "fickt", "gefickt", "ficker", "fotze", "fotzen", "hurensohn", "hurensöhne", "hure", "huren", "nutte", "nutten",
  "wichser", "wixer", "wixxer", "schlampe", "schlampen", "missgeburt", "missgeburten", "spast", "spasti", "spasten", "mongo", "behindi", "schwuchtel", "schwuchteln", "kanake", "kanaken", "neger", "nigger",
  "drecksau", "dreckssau", "drecksvieh", "bastard", "bastarde", "scheisskerl", "scheißkerl", "pisser", "kackbratze", "votze", "votzen", "schwanzlutscher", "muschi", "titten", "blasen",
  "bring dich um", "bringdichum", "verreck", "verrecke", "stirb", "ich bring dich um", "ich töte dich", "ich tote dich",
  // English
  "fuck", "fucking", "fucker", "motherfucker", "cunt", "cunts", "bitch", "bitches", "asshole", "assholes", "dick", "dicks", "cock", "cocks", "pussy", "whore", "whores", "slut", "sluts",
  "faggot", "faggots", "fag", "retard", "retarded", "nigga", "niggas", "kys", "kill yourself", "rape", "rapist",
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[äà]/g, "a").replace(/[öò]/g, "o").replace(/[üù]/g, "u").replace(/ß/g, "ss").replace(/é|è|ê/g, "e")
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/@/g, "a").replace(/\$/g, "s")
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PATTERNS = BLOCKLIST.map((w) => new RegExp(`(^|\\s)${normalize(w).replace(/\s+/g, "\\s+")}(e|en|er|s|es|in|innen)?(?=\\s|$)`, "i"));

/** Returns the offending term, or null when the text is fine. */
function findObjectionable(text) {
  const n = normalize(text);
  if (!n) return null;
  for (let i = 0; i < PATTERNS.length; i++) if (PATTERNS[i].test(n)) return BLOCKLIST[i];
  return null;
}

const REJECT_MESSAGE = "Dieser Text enthält Begriffe, die hier nicht erlaubt sind. Bitte formuliere ihn anders.";

/** 400 and false when any of the given texts is objectionable. */
function assertClean(res, ...texts) {
  for (const t of texts) {
    if (t && findObjectionable(t)) {
      res.status(400).json({ error: REJECT_MESSAGE, filtered: true });
      return false;
    }
  }
  return true;
}

const REPORT_KINDS = ["wichteln-message", "wichteln-photo", "wichteln-thanks", "wichteln-wishlist", "wichteltuer-letter", "calendar", "calendar-reply", "canvas", "other"];
const REPORT_REASONS = { abuse: "Beleidigung oder Belästigung", inappropriate: "Unangemessener oder anstössiger Inhalt", spam: "Spam oder Werbung", other: "Anderes" };

module.exports = { findObjectionable, assertClean, normalize, REJECT_MESSAGE, REPORT_KINDS, REPORT_REASONS };
