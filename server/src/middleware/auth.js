const jwt = require("jsonwebtoken");
const config = require("../config");

const COOKIE_NAME = "advent_session";

// "Angemeldet bleiben": a persistent cookie that survives browser restarts for
// two weeks. Without it the cookie is a session cookie (gone when the browser
// closes) and the token itself is capped at one day as a safety net.
const REMEMBER_MS = 14 * 24 * 60 * 60 * 1000;
// The native app (mobile/) identifies itself in the User-Agent. There the user
// stays signed in permanently: one-year cookie, renewed on every visit.
const APP_MS = 365 * 24 * 60 * 60 * 1000;

function isNativeApp(req) {
  return /AdventskalenderApp/i.test(String(req?.headers?.["user-agent"] || ""));
}

function signUserToken(user, { remember = false, app = false } = {}) {
  return jwt.sign(
    { role: "user", id: user.id, email: user.email, username: user.username, isPro: user.isPro, remember: Boolean(remember || app), app: Boolean(app) },
    config.jwtSecret,
    { expiresIn: app ? "365d" : remember ? "14d" : "1d" }
  );
}

function setAuthCookie(res, token) {
  // The token carries the "remember" choice, so re-issued cookies (profile
  // update, pro toggle, refresh) keep whatever the user picked at login.
  const payload = jwt.decode(token) || {};
  const maxAge = payload.app ? APP_MS : payload.remember ? REMEMBER_MS : null;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    ...(maxAge ? { maxAge } : {}),
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Nicht angemeldet." });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.role !== "user" && payload.role !== "admin") throw new Error("invalid role");
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Sitzung ungültig oder abgelaufen." });
  }
}

module.exports = { COOKIE_NAME, signUserToken, setAuthCookie, clearAuthCookie, requireAuth, isNativeApp };
