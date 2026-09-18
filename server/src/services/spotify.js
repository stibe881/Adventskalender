const config = require("../config");
const db = require("../db");

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const SCOPES = ["playlist-modify-public", "playlist-modify-private", "playlist-read-private", "playlist-read-collaborative"];

function isConfigured() {
  return Boolean(config.spotify.clientId && config.spotify.clientSecret);
}

function basicAuthHeader() {
  return "Basic " + Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString("base64");
}

async function tokenRequest(params) {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Spotify Token-Fehler (${res.status})`);
  }
  return data;
}

async function apiRequest(accessToken, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Spotify API-Fehler (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- App token (client credentials) for public track search ----------

let appToken = null;
let appTokenExpiresAt = 0;

async function getAppToken() {
  if (appToken && Date.now() < appTokenExpiresAt - 30000) return appToken;
  const data = await tokenRequest({ grant_type: "client_credentials" });
  appToken = data.access_token;
  appTokenExpiresAt = Date.now() + data.expires_in * 1000;
  return appToken;
}

function normalizeTrack(t) {
  return {
    id: t.id,
    uri: t.uri,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album?.name || "",
    image: t.album?.images?.[t.album.images.length - 1]?.url || null,
    url: t.external_urls?.spotify || null,
    durationMs: t.duration_ms,
  };
}

async function searchTracks(query, limit = 8) {
  const token = await getAppToken();
  const params = new URLSearchParams({ q: query, type: "track", limit: String(limit), market: "CH" });
  const data = await apiRequest(token, "GET", `/search?${params}`);
  return (data.tracks?.items || []).map(normalizeTrack);
}

// ---------- User authorization (OAuth authorization code) ----------

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.spotify.clientId,
    response_type: "code",
    redirect_uri: config.spotify.redirectUri,
    scope: SCOPES.join(" "),
    state,
    show_dialog: "false",
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

async function exchangeCode(code) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: config.spotify.redirectUri });
}

async function getProfile(accessToken) {
  return apiRequest(accessToken, "GET", "/me");
}

/**
 * Returns a valid user access token for the calendar's linked Spotify
 * account, refreshing (and persisting) it when it is about to expire.
 */
async function getUserToken(calendar) {
  const link = calendar.spotify;
  if (!link || !link.refreshToken) {
    const err = new Error("Dieser Kalender ist nicht mit Spotify verbunden.");
    err.code = "NOT_CONNECTED";
    throw err;
  }
  if (link.accessToken && Date.now() < (link.expiresAt || 0) - 60000) return link.accessToken;

  const data = await tokenRequest({ grant_type: "refresh_token", refresh_token: link.refreshToken });
  const updated = await db.updateCalendar(calendar.id, (cal) => {
    cal.spotify = {
      ...cal.spotify,
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      refreshToken: data.refresh_token || cal.spotify.refreshToken,
    };
    return cal;
  });
  calendar.spotify = updated.spotify;
  return updated.spotify.accessToken;
}

async function listOwnPlaylists(accessToken, spotifyUserId) {
  const items = [];
  let path = "/me/playlists?limit=50";
  while (path) {
    const data = await apiRequest(accessToken, "GET", path);
    items.push(...(data.items || []));
    path = data.next ? data.next.replace(API, "") : null;
    if (items.length >= 200) break;
  }
  return items
    .filter((p) => p.owner?.id === spotifyUserId || p.collaborative)
    .map((p) => ({
      id: p.id,
      name: p.name,
      url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
      tracks: p.tracks?.total ?? 0,
      image: p.images?.[p.images.length - 1]?.url || null,
    }));
}

async function createPlaylist(accessToken, spotifyUserId, name, description) {
  const data = await apiRequest(accessToken, "POST", `/users/${encodeURIComponent(spotifyUserId)}/playlists`, {
    name,
    description,
    public: false,
  });
  return {
    id: data.id,
    name: data.name,
    url: data.external_urls?.spotify || `https://open.spotify.com/playlist/${data.id}`,
  };
}

async function addTrackToPlaylist(accessToken, playlistId, trackUri) {
  return apiRequest(accessToken, "POST", `/playlists/${encodeURIComponent(playlistId)}/tracks`, { uris: [trackUri] });
}

function extractPlaylistId(urlOrId) {
  if (!urlOrId) return null;
  const value = String(urlOrId).trim();
  const m = value.match(/playlist[/:]([A-Za-z0-9]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{16,}$/.test(value) ? value : null;
}

/**
 * Pushes a track into the real Spotify playlist behind a "spotify-collab"
 * door. Never throws: the in-app playlist entry must succeed even when
 * Spotify is unavailable, so the caller gets a status object instead.
 */
async function addTrackForCalendar(calendar, playlistUrl, trackUri) {
  if (!trackUri) return { added: false, reason: "Kein Spotify-Track ausgewählt." };
  if (!calendar.spotify?.refreshToken) return { added: false, reason: "Kalender ist nicht mit Spotify verbunden." };
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) return { added: false, reason: "Im Türchen ist keine gültige Spotify-Playlist hinterlegt." };
  try {
    const token = await getUserToken(calendar);
    await addTrackToPlaylist(token, playlistId, trackUri);
    console.log(`[spotify] ${trackUri} → Playlist ${playlistId} (Kalender ${calendar.id})`);
    return { added: true };
  } catch (err) {
    console.error(`[spotify] Track ${trackUri} konnte nicht in Playlist ${playlistId} eingetragen werden (Kalender ${calendar.id}):`, err.message);
    return { added: false, reason: err.message };
  }
}

module.exports = {
  SCOPES,
  isConfigured,
  searchTracks,
  buildAuthorizeUrl,
  exchangeCode,
  getProfile,
  getUserToken,
  listOwnPlaylists,
  createPlaylist,
  addTrackToPlaylist,
  extractPlaylistId,
  addTrackForCalendar,
};
