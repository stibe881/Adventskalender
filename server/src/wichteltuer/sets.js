/* Ready-made month plans: each set narrows the idea pool and, optionally,
 * changes the category rhythm of the automatic planner. Fixed days (arrival,
 * Nikolaus, farewell) are always kept. */
const SETS = [
  { id: "klassik", title: "Klassischer Dezember", desc: "Bunt gemischt aus allem, aufwendige Ideen am Wochenende, ein Ruhetag pro Woche.", filter: () => true },
  { id: "kleinkinder", title: "Kleinkinder (2–5)", desc: "Kurz, sichtbar und ohne Lesen: Spuren, Verstecke, kleine Geschenke.", filter: (i) => i.ageMin <= 3 && i.minutes <= 20 },
  { id: "schulkinder", title: "Schulkinder (6–12)", desc: "Rätsel, Aufgaben und Briefe, die man selbst lesen kann.", filter: (i) => i.ageMax >= 9, rotation: ["aufgabe", "streich", "brief", "aufgabe", "geschenk", "streich", "brief", "basteln", "aufgabe", "streich"] },
  { id: "wenig-aufwand", title: "Wenig Aufwand", desc: "Nichts über zehn Minuten, kaum Material, kein Vorbereiten am Vortag.", filter: (i) => i.minutes <= 10 && i.materials.length <= 2 && !i.prepDayBefore, maxMinutes: 10 },
  { id: "bastel", title: "Bastel-Dezember", desc: "Mehr Basteln und Backen, auch unter der Woche – für Familien, die gern am Tisch sitzen.", filter: () => true, rotation: ["basteln", "streich", "aufgabe", "basteln", "brief", "geschenk", "basteln", "streich", "aufgabe", "basteln"], allowLongOnWeekdays: true },
];
const byId = Object.fromEntries(SETS.map((s) => [s.id, s]));
const publicSets = () => SETS.map(({ id, title, desc }) => ({ id, title, desc }));

module.exports = { SETS, byId, publicSets };
