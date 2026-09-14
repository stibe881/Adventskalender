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
  login: (username, password) => request("POST", "/auth/login", { username, password }),
  logout: () => request("POST", "/auth/logout"),
  me: () => request("GET", "/auth/me"),

  listCalendars: () => request("GET", "/admin/calendars"),
  createCalendar: (payload) => request("POST", "/admin/calendars", payload),
  getCalendar: (id) => request("GET", `/admin/calendars/${id}`),
  updateCalendar: (id, payload) => request("PUT", `/admin/calendars/${id}`, payload),
  deleteCalendar: (id) => request("DELETE", `/admin/calendars/${id}`),
  previewCalendar: (id) => request("GET", `/admin/calendars/${id}/preview`),
  saveDay: (id, day, payload) => request("PUT", `/admin/calendars/${id}/days/${day}`, payload),
  upload: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("POST", "/admin/upload", form, true);
  },
};

async function requireAdminOrRedirect() {
  try {
    await api.me();
  } catch (err) {
    window.location.href = "/admin/";
  }
}
