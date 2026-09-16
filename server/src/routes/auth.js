const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const config = require("../config");
const { signUserToken, setAuthCookie, clearAuthCookie, requireAuth } = require("../middleware/auth");
const db = require("../db");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Loginversuche. Bitte später erneut versuchen." },
});

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

router.post("/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || email.length < 5 || password.length < 6 || !email.includes("@")) {
    return res.status(400).json({ error: "Gültige E-Mail und Passwort (min. 6 Zeichen) erforderlich." });
  }

  const existing = await db.getUserByEmail(email);
  if (existing) {
    return res.status(400).json({ error: "Diese E-Mail ist bereits registriert." });
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  const verificationToken = crypto.randomBytes(32).toString("hex");

  const newUser = await db.createUser({
    id: crypto.randomUUID(),
    email,
    passwordHash,
    createdAt: new Date().toISOString(),
    isPremium: false,
    isVerified: false,
    verificationToken,
  });

  const verifyLink = `${config.baseUrl}/api/auth/verify?token=${verificationToken}`;
  try {
    if (config.smtp.host && config.smtp.user && config.smtp.user !== "dein_ethereal_user@ethereal.email") {
      await transporter.sendMail({
        from: config.smtp.from,
        to: email,
        subject: "Bitte bestätige deine E-Mail-Adresse",
        text: `Hallo!\n\nBitte klicke auf den folgenden Link, um deine E-Mail-Adresse für den Adventskalender zu bestätigen:\n\n${verifyLink}\n\nViele Grüße!`,
        html: `<p>Hallo!</p><p>Bitte klicke auf den folgenden Link, um deine E-Mail-Adresse für den Adventskalender zu bestätigen:</p><p><a href="${verifyLink}">${verifyLink}</a></p><p>Viele Grüße!</p>`,
      });
    } else {
      console.log("\n=======================================================");
      console.log("📨 E-MAIL SIMULATION (Kein echter SMTP-Server in .env konfiguriert)");
      console.log("An:", email);
      console.log("Klicke diesen Link, um die Registrierung abzuschließen:");
      console.log("👉", verifyLink);
      console.log("=======================================================\n");
    }
  } catch (err) {
    console.error("Fehler beim Senden der Bestätigungs-E-Mail:", err);
  }

  res.json({ ok: true, email: newUser.email, message: "Bitte überprüfe deine E-Mails, um deinen Account zu aktivieren." });
});

router.get("/verify", async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send("Kein Token angegeben.");
  }

  const user = await db.getUserByVerificationToken(token);
  if (!user) {
    return res.status(400).send("Ungültiger oder abgelaufener Token.");
  }

  await db.updateUser(user.id, (u) => ({
    ...u,
    isVerified: true,
    verificationToken: null,
  }));

  res.redirect("/admin/index.html?verified=1");
});

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "E-Mail und Passwort erforderlich." });
  }

  const user = await db.getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: "E-Mail oder Passwort ist falsch." });
  }

  if (!user.isVerified) {
    return res.status(403).json({ error: "Bitte bestätige zuerst deine E-Mail-Adresse (siehe Posteingang)." });
  }

  const validPassword = await bcrypt.compare(String(password), user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ error: "E-Mail oder Passwort ist falsch." });
  }

  user.username = user.email.split("@")[0];

  const token = signUserToken(user);
  setAuthCookie(res, token);
  res.json({ ok: true, email: user.email });
});

// DEV-LOGIN BYPASS (disabled in production)
router.post("/dev-login", (req, res) => {
  return res.status(404).json({ error: "Not found." });
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, email: req.user.email || req.user.username, isPro: req.user.isPro });
});

module.exports = router;
