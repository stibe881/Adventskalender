const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const config = require("../config");
const db = require("../db");
const spotify = require("../services/spotify");
const { requireAuth, COOKIE_NAME } = require("../middleware/auth");
const { hasAccess } = require("../utils/access");

const router = express.Router();

function editorUrl(calendarId, extra = {}) {
  const params = new URLSearchParams({ id: calendarId, ...extra });
  return `/admin/editor.html?${params}`;
}

function requireConfigured(req, res, next) {
  if (!spotify.isConfigured()) {
    return res.status(503).json({ error: "Spotify ist auf dem Server nicht konfiguriert (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET)." });
  }
  next();
}

async function loadOwnedCalendar(req, res) {
  const calendarId = req.query.calendarId || req.body?.calendarId;
  if (!calendarId) {
    res.status(400).json({ error: "calendarId fehlt." });
    return null;
  }
  const calendar = await db.getCalendarById(calendarId);
  if (!hasAccess(calendar, req.user)) {
    res.status(404).json({ error: "Kalender nicht gefunden." });
    return null;
  }
  return calendar;
}

// ---------- OAuth: connect a calendar to the owner's Spotify account ----------

router.get("/connect", requireConfigured, requireAuth, async (req, res) => {
  const calendar = await loadOwnedCalendar(req, res);
  if (!calendar) return;
  const state = jwt.sign(
    { calendarId: calendar.id, userId: req.user.id, day: req.query.day || null, purpose: "spotify-oauth" },
    config.jwtSecret,
    { expiresIn: "15m" }
  );
  res.redirect(spotify.buildAuthorizeUrl(state));
});

router.get("/callback", requireConfigured, async (req, res) => {
  const { code, state, error } = req.query;
  let payload;
  try {
    payload = jwt.verify(String(state || ""), config.jwtSecret);
    if (payload.purpose !== "spotify-oauth") throw new Error("bad purpose");
  } catch (_) {
    return res.status(400).send("Ungültiger oder abgelaufener Spotify-Login-Status. Bitte erneut verbinden.");
  }

  if (error || !code) {
    return res.redirect(editorUrl(payload.calendarId, { spotify: "denied" }));
  }

  try {
    const tokens = await spotify.exchangeCode(String(code));
    const profile = await spotify.getProfile(tokens.access_token);
    await db.updateCalendar(payload.calendarId, (cal) => {
      cal.spotify = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        scope: tokens.scope,
        spotifyUserId: profile.id,
        displayName: profile.display_name || profile.id,
        connectedAt: new Date().toISOString(),
        connectedBy: payload.userId,
      };
      return cal;
    });
    const extra = { spotify: "connected" };
    if (payload.day) extra.day = payload.day;
    res.redirect(editorUrl(payload.calendarId, extra));
  } catch (err) {
    console.error("[spotify] OAuth-Callback fehlgeschlagen:", err.message);
    res.redirect(editorUrl(payload.calendarId, { spotify: "error" }));
  }
});

router.get("/status", requireAuth, async (req, res) => {
  const calendar = await loadOwnedCalendar(req, res);
  if (!calendar) return;
  const link = calendar.spotify;
  if (!spotify.isConfigured()) return res.json({ configured: false, connected: false });
  if (!link?.refreshToken) return res.json({ configured: true, connected: false });

  const log = (calendar.spotifyLog || []).slice(0, 10);
  try {
    const token = await spotify.getUserToken(calendar);
    const playlists = await spotify.listOwnPlaylists(token, link.spotifyUserId);
    res.json({ configured: true, connected: true, displayName: link.displayName, scope: link.scope || "", playlists, log });
  } catch (err) {
    console.error("[spotify] Status-Abfrage fehlgeschlagen:", err.message);
    res.json({ configured: true, connected: true, displayName: link.displayName, scope: link.scope || "", playlists: [], log, error: err.message });
  }
});

// Verifies that the linked account can actually write into the given playlist.
router.get("/check", requireConfigured, requireAuth, async (req, res) => {
  const calendar = await loadOwnedCalendar(req, res);
  if (!calendar) return;
  const link = calendar.spotify;
  if (!link?.refreshToken) return res.json({ ok: false, problem: "Kalender ist nicht mit Spotify verbunden." });
  const playlistId = spotify.extractPlaylistId(req.query.playlistUrl);
  if (!playlistId) return res.json({ ok: false, problem: `Keine gültige Playlist-URL/ID: "${req.query.playlistUrl || ""}"` });

  const scopes = String(link.scope || "").split(" ").filter(Boolean);
  const missing = ["playlist-modify-public", "playlist-modify-private"].filter((s) => !scopes.includes(s));
  try {
    const token = await spotify.getUserToken(calendar);
    const p = await spotify.getPlaylist(token, playlistId);
    const ownerIsMe = p.owner?.id === link.spotifyUserId;
    const problem = !ownerIsMe && !p.collaborative
      ? `Die Playlist gehört "${p.owner?.display_name || p.owner?.id}", nicht dem verbundenen Account "${link.displayName}" – Spotify erlaubt das Schreiben nur in eigene oder kollaborative Playlists.`
      : missing.length
        ? `Der Spotify-Login hat die Rechte ${missing.join(", ")} nicht erteilt – bitte trennen und neu verbinden.`
        : null;
    res.json({
      ok: !problem,
      problem,
      playlist: { id: p.id, name: p.name, owner: p.owner?.display_name || p.owner?.id, ownerIsMe, collaborative: p.collaborative, public: p.public, tracks: p.tracks?.total ?? null, url: p.external_urls?.spotify },
      account: { displayName: link.displayName, spotifyUserId: link.spotifyUserId, scopes },
    });
  } catch (err) {
    res.json({ ok: false, problem: `Spotify antwortet: ${err.message}${err.status ? ` (HTTP ${err.status})` : ""}`, account: { displayName: link.displayName, scopes } });
  }
});

router.post("/disconnect", requireAuth, async (req, res) => {
  const calendar = await loadOwnedCalendar(req, res);
  if (!calendar) return;
  await db.updateCalendar(calendar.id, (cal) => {
    delete cal.spotify;
    return cal;
  });
  res.json({ ok: true });
});

router.post("/playlists", requireConfigured, requireAuth, async (req, res) => {
  const calendar = await loadOwnedCalendar(req, res);
  if (!calendar) return;
  if (!calendar.spotify?.refreshToken) return res.status(400).json({ error: "Kalender ist nicht mit Spotify verbunden." });
  const name = (req.body?.name || `Adventskalender für ${calendar.recipientName}`).trim().slice(0, 100);
  try {
    const token = await spotify.getUserToken(calendar);
    const playlist = await spotify.createPlaylist(token, calendar.spotify.spotifyUserId, name, "Gemeinsame Playlist aus dem Adventskalender");
    res.status(201).json(playlist);
  } catch (err) {
    res.status(502).json({ error: `Playlist konnte nicht angelegt werden: ${err.message}` });
  }
});

// Pushes every stored song wish that has a Spotify URI but was never
// synced (e.g. added before the account was linked) into the playlist.
router.post("/sync", requireConfigured, requireAuth, async (req, res) => {
  const calendar = await loadOwnedCalendar(req, res);
  if (!calendar) return;
  if (!calendar.spotify?.refreshToken) return res.status(400).json({ error: "Kalender ist nicht mit Spotify verbunden." });
  const playlistId = spotify.extractPlaylistId(req.body?.playlistUrl);
  if (!playlistId) return res.status(400).json({ error: "Keine gültige Playlist angegeben." });

  const pending = (calendar.playlist || []).filter((s) => s.trackUri && !s.spotifySynced);
  if (pending.length === 0) return res.json({ synced: 0, failed: 0, skipped: (calendar.playlist || []).length });

  let token;
  try {
    token = await spotify.getUserToken(calendar);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  const syncedUris = [];
  const errors = [];
  for (const song of pending) {
    try {
      const r = await spotify.addTrackToPlaylist(token, playlistId, song.trackUri);
      syncedUris.push(song.trackUri);
      await spotify.appendLog(calendar.id, { ok: true, track: `${song.title} – ${song.artist}`, playlistId, snapshot: r?.snapshot_id || null, via: "sync" });
    } catch (err) {
      const reason = `${err.message}${err.status ? ` (HTTP ${err.status})` : ""}`;
      errors.push(`${song.title}: ${reason}`);
      await spotify.appendLog(calendar.id, { ok: false, track: `${song.title} – ${song.artist}`, playlistId, reason, via: "sync" });
    }
  }
  if (syncedUris.length) {
    await db.updateCalendar(calendar.id, (cal) => {
      (cal.playlist || []).forEach((s) => {
        if (syncedUris.includes(s.trackUri)) s.spotifySynced = true;
      });
      return cal;
    });
  }
  res.json({
    synced: syncedUris.length,
    failed: errors.length,
    skipped: (calendar.playlist || []).length - pending.length,
    errors,
  });
});

// ---------- Track search (recipients + admin preview) ----------

const searchLimiter = rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });

// Access is granted either by a valid recipient token (`cal`) or, for the
// admin preview, by the session cookie plus calendar id.
async function authorizeSearch(req) {
  if (req.query.cal) {
    const calendar = await db.getCalendarByToken(String(req.query.cal));
    return Boolean(calendar);
  }
  if (req.query.calendarId && req.cookies?.[COOKIE_NAME]) {
    try {
      const user = jwt.verify(req.cookies[COOKIE_NAME], config.jwtSecret);
      const calendar = await db.getCalendarById(String(req.query.calendarId));
      return hasAccess(calendar, user);
    } catch (_) {
      return false;
    }
  }
  return false;
}

router.get("/search", requireConfigured, searchLimiter, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.status(400).json({ error: "Suchbegriff zu kurz." });
  if (!(await authorizeSearch(req))) return res.status(403).json({ error: "Kein Zugriff." });
  try {
    const tracks = await spotify.searchTracks(q, 8);
    res.json({ tracks });
  } catch (err) {
    console.error("[spotify] Suche fehlgeschlagen:", err.message);
    res.status(502).json({ error: "Spotify-Suche derzeit nicht möglich." });
  }
});

module.exports = router;
