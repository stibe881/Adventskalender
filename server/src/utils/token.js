const crypto = require("crypto");

function generateToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function generateId() {
  return crypto.randomUUID();
}

module.exports = { generateToken, generateId };
