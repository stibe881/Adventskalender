/* Tunables of the Wichteltür module (the Christmas elf who plays pranks
 * for the kids). Everything a parent plans lives in one JSON document. */
module.exports = {
  // Sizes
  maxChildren: 8,
  maxParents: 4,
  maxLetters: 500,
  maxCustomShopping: 200,
  maxPushDevices: 10,
  maxEmails: 4,
  photoMaxBytes: 8 * 1024 * 1024,

  // Text limits
  titleMax: 80,
  nameMax: 40,
  placeMax: 80,
  dayTitleMax: 100,
  dayTextMax: 2000,
  materialMax: 60,
  noteMax: 500,
  letterMax: 2000,
  kidLetterMax: 800,
  shoppingMax: 80,
  stepMax: 120,
  maxSteps: 12,
  kidHintMax: 200,
  maxCustomIdeas: 60,
  voiceMaxBytes: 4 * 1024 * 1024,
  voiceMaxSeconds: 60,

  // Tokens
  shareTokenBytes: 18,
  kidTokenBytes: 12,
  viewTokenBytes: 12,

  // Season
  firstDay: 1,
  lastDay: 24,
  month: 12,
  reminderTimeDefault: "20:00",
  restDaysPerWeek: 1,

  // Rate limits (per minute)
  shareRequestsPerMinute: 240,
  kidRequestsPerMinute: 60,

  categories: {
    streich: "Streich",
    brief: "Brief",
    geschenk: "Kleinigkeit",
    aufgabe: "Aufgabe für die Kinder",
    basteln: "Basteln & Backen",
    ruhe: "Ruhetag",
  },
};
