const jwt = require("jsonwebtoken");
const config = require("../config");

const COOKIE_NAME = "advent_session";

function signUserToken(user) {
  return jwt.sign({ role: "user", id: user.id, email: user.email, username: user.username, isPro: user.isPro }, config.jwtSecret, {
    expiresIn: "14d",
  });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    maxAge: 14 * 24 * 60 * 60 * 1000,
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

module.exports = { COOKIE_NAME, signUserToken, setAuthCookie, clearAuthCookie, requireAuth };
