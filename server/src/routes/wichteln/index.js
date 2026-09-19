/* Wichteln module: mounted at /api/wichteln.
 *
 *   organizer.js   – /groups…            (logged-in owners)
 *   participant.js – /join/…, /p/:token… (via personal links)
 *   preview.js     – link preview helper
 *   notify.js      – every e-mail / push text
 *   shared.js      – helpers and view builders
 *   ../../wichteln/config.js – all limits
 */
const express = require("express");
const { notify } = require("./notify");
const { eventLine, removePhotoFiles } = require("./shared");

const router = express.Router();
router.use(require("./organizer"));
router.use(require("./participant"));

module.exports = router;
module.exports.notify = notify;
module.exports.eventLine = eventLine;
module.exports.removePhotoFiles = removePhotoFiles;
