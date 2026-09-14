const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const config = require("../config");
const { signAdminToken, setAuthCookie, clearAuthCookie, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Hash the configured admin password once at startup so the plaintext
// never touches disk and login comparisons happen in constant time.
const passwordHashPromise = bcrypt.hash(config.admin.password, 12);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Loginversuche. Bitte später erneut versuchen." },
});

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Benutzername und Passwort erforderlich." });
  }

  const validUsername = username === config.admin.username;
  const passwordHash = await passwordHashPromise;
  const validPassword = await bcrypt.compare(String(password), passwordHash);

  if (!validUsername || !validPassword) {
    return res.status(401).json({ error: "Benutzername oder Passwort ist falsch." });
  }

  const token = signAdminToken();
  setAuthCookie(res, token);
  res.json({ ok: true, username: config.admin.username });
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAdmin, (req, res) => {
  res.json({ ok: true, username: req.admin.username });
});

module.exports = router;
