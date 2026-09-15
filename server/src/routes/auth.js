const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const config = require("../config");
const { signUserToken, setAuthCookie, clearAuthCookie, requireAuth } = require("../middleware/auth");
const db = require("../db");
const crypto = require("crypto");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Loginversuche. Bitte später erneut versuchen." },
});

router.post("/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: "Benutzername (min. 3) und Passwort (min. 6) erforderlich." });
  }

  const existing = db.getUserByUsername(username);
  if (existing) {
    return res.status(400).json({ error: "Benutzername ist bereits vergeben." });
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  const newUser = db.createUser({
    id: crypto.randomUUID(),
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
    isPremium: false,
  });

  const token = signUserToken(newUser);
  setAuthCookie(res, token);
  res.json({ ok: true, username: newUser.username });
});

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Benutzername und Passwort erforderlich." });
  }

  const user = db.getUserByUsername(username);
  if (!user) {
    // If username is the admin user from config, allow it (fallback for migration/dev)
    if (username === config.admin.username) {
      const validAdmin = await bcrypt.compare(String(password), await bcrypt.hash(config.admin.password, 12));
      if (validAdmin) {
        // Create an admin user entry if it doesn't exist? Just sign token for now.
        const token = signUserToken({ id: "admin-id", username });
        setAuthCookie(res, token);
        return res.json({ ok: true, username });
      }
    }
    return res.status(401).json({ error: "Benutzername oder Passwort ist falsch." });
  }

  const validPassword = await bcrypt.compare(String(password), user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ error: "Benutzername oder Passwort ist falsch." });
  }

  const token = signUserToken(user);
  setAuthCookie(res, token);
  res.json({ ok: true, username: user.username });
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, username: req.user.username });
});

module.exports = router;
