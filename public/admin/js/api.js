const API_BASE = "/api";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, url, body, isForm = false) {
  const opts = {
    method,
    credentials: "include",
    cache: "no-store",
    headers: {},
  };
  if (body !== undefined) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(`${API_BASE}${url}`, opts);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* no body */
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Fehler ${res.status}`, res.status);
  }
  return data;
}

const api = {
  login: (email, password, remember = false) => request("POST", "/auth/login", { email, password, remember }),
  register: (email, password, username, company) => request("POST", "/auth/register", { email, password, username, company }),
  devLogin: () => request("POST", "/auth/dev-login"),
  logout: () => request("POST", "/auth/logout"),
  me: () => request("GET", "/auth/me"),
  updateProfile: (username, company, defaultApp) => request("PUT", "/auth/profile", { username, company, defaultApp }),
  changePassword: (currentPassword, newPassword) => request("POST", "/auth/change-password", { currentPassword, newPassword }),
  deleteAccount: (password) => request("DELETE", "/auth/delete-account", { password }),
  checkout: (calendarId) => request("POST", "/payment/checkout", { calendarId }),
  refreshToken: () => request("POST", "/admin/refresh"),
  devTogglePro: () => request("POST", "/admin/dev-toggle-pro"),

  listCalendars: () => request("GET", "/admin/calendars"),
  getCalendar: (id) => request("GET", `/admin/calendars/${id}`),
  createCalendar: (data) => request("POST", "/admin/calendars", data),
  updateCalendar: (id, data) => request("PUT", `/admin/calendars/${id}`, data),
  deleteCalendar: (id) => request("DELETE", `/admin/calendars/${id}`),
  duplicateCalendar: (id) => request("POST", `/admin/calendars/${id}/duplicate`),
  previewCalendar: (id) => request("GET", `/admin/calendars/${id}/preview`),
  addCollaborator: (id, email) => request("POST", `/admin/calendars/${id}/collaborators`, { email }),
  swapDays: (id, dayA, dayB) => request("POST", `/admin/calendars/${id}/swap`, { dayA, dayB }),
  saveDay: (id, day, payload) => request("PUT", `/admin/calendars/${id}/days/${day}`, payload),
  upload: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("POST", "/admin/upload", form, true);
  },
  generateWichtelLink: (id, day) => request("POST", `/admin/calendars/${id}/days/${day}/wichtel-link`),

  // Wichteln (Secret Santa)
  listWichtelGroups: () => request("GET", "/wichteln/groups"),
  createWichtelGroup: (data) => request("POST", "/wichteln/groups", data),
  getWichtelGroup: (id) => request("GET", `/wichteln/groups/${id}`),
  updateWichtelGroup: (id, data) => request("PUT", `/wichteln/groups/${id}`, data),
  deleteWichtelGroup: (id) => request("DELETE", `/wichteln/groups/${id}`),
  addWichtelParticipant: (id, data) => request("POST", `/wichteln/groups/${id}/participants`, data),
  updateWichtelParticipant: (id, pid, data) => request("PUT", `/wichteln/groups/${id}/participants/${pid}`, data),
  removeWichtelParticipant: (id, pid) => request("DELETE", `/wichteln/groups/${id}/participants/${pid}`),
  approveWichtelParticipant: (id, pid) => request("POST", `/wichteln/groups/${id}/participants/${pid}/approve`),
  inviteWichtelParticipant: (id, pid) => request("POST", `/wichteln/groups/${id}/participants/${pid}/invite`),
  inviteAllWichtel: (id) => request("POST", `/wichteln/groups/${id}/invite-all`),
  setWichtelExclusions: (id, exclusions) => request("PUT", `/wichteln/groups/${id}/exclusions`, { exclusions }),
  drawWichtel: (id) => request("POST", `/wichteln/groups/${id}/draw`),
  revealWichtel: (id) => request("POST", `/wichteln/groups/${id}/reveal`),
  wichtelInviteCard: (id) => request("GET", `/wichteln/groups/${id}/invite-card`),
  rotateWichtelInvite: (id) => request("POST", `/wichteln/groups/${id}/rotate-invite`),

  spotifyStatus: (id) => request("GET", `/spotify/status?calendarId=${encodeURIComponent(id)}`),
  spotifyDisconnect: (id) => request("POST", "/spotify/disconnect", { calendarId: id }),
  spotifyCreatePlaylist: (id, name) => request("POST", "/spotify/playlists", { calendarId: id, name }),
  spotifySync: (id, playlistUrl) => request("POST", "/spotify/sync", { calendarId: id, playlistUrl }),
  spotifyCheck: (id, playlistUrl) => request("GET", `/spotify/check?calendarId=${encodeURIComponent(id)}&playlistUrl=${encodeURIComponent(playlistUrl)}`),
};

async function requireAdminOrRedirect() {
  try {
    await api.me();
  } catch (err) {
    window.location.href = "/admin/";
  }
}
