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
];

const THEMES = ["partner", "kid", "parents", "modern"];

module.exports = { CONTENT_TYPES, THEMES };
