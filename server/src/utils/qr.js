const QRCode = require("qrcode");

/**
 * Generates a QR code as a base64 data URL (PNG) so it can be stored
 * directly in the JSON content and rendered client-side without a
 * separate file/route.
 */
async function generateQrDataUrl(text) {
  if (!text || !String(text).trim()) return null;
  return QRCode.toDataURL(String(text), {
    margin: 1,
    width: 400,
    color: { dark: "#1a0509", light: "#ffffffff" },
  });
}

module.exports = { generateQrDataUrl };
