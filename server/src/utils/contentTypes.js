/**
 * Single source of truth for allowed door content types.
 * (Mirrored on the frontend in public/admin/js/contentTypes.js for form rendering.)
 */
const CONTENT_TYPES = [
  "text",
  "voucher",
  "qrcode",
  "video",
  "audio",
  "gallery",
  "scratchcard",
  "quiz",
  "countdown",
  "memory",
  "challenge",
  "location",
  "giveaway",
  "puzzle",
  "ar",
  "catcher",
  "product",
  "choice",
  "coins",
  "diary",
  "duel",
  "timecapsule",
  "printplay",
  "spotify-collab",
  "iot-box",
  "wichteln"
];

const THEMES = ["partner", "kid", "parents", "modern", "firma"];

module.exports = { CONTENT_TYPES, THEMES };
