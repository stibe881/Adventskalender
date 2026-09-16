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
  login: (email, password) => request("POST", "/auth/login", { email, password }),
  register: (email, password) => request("POST", "/auth/register", { email, password }),
  devLogin: () => request("POST", "/auth/dev-login"),
  logout: () => request("POST", "/auth/logout"),
  me: () => request("GET", "/auth/me"),

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
};

async function requireAdminOrRedirect() {
  try {
    await api.me();
  } catch (err) {
    window.location.href = "/admin/";
  }
}
