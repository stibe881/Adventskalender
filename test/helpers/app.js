/* Test harness: mounts the real routers on an in-memory database stub so the
 * suite runs without MySQL, SMTP or a push gateway. */
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const SRC = path.join(__dirname, "..", "..", "server", "src");
const clone = (x) => JSON.parse(JSON.stringify(x));

function createStubDb() {
  const user = { id: "u1", email: "orga@example.ch", isPro: true, isVerified: true, username: "Stefan", company: "X", passwordHash: "x", defaultApp: "wichteln" };
  const groups = {};
  const calendars = {};
  const plans = {};
  const db = {
    user, groups, calendars, plans,
    getUserByEmail: async () => clone(user),
    getUserById: async () => clone(user),
    updateUser: async (id, fn) => { Object.assign(user, await fn(clone(user))); return user; },
    getUserByCompany: async () => null,
    getUserByUsername: async () => null,
    getAllCalendars: async () => Object.values(calendars).map(clone),
    getCalendarsByOwnerOrCollaborator: async (o, email) => Object.values(calendars).filter((c) => c.ownerId === o || (c.collaborators || []).some((x) => (x.email || x) === email)).map(clone),
    getCalendarById: async (id) => (calendars[id] ? clone(calendars[id]) : null),
    getCalendarByToken: async (t) => clone(Object.values(calendars).find((c) => c.token === t) || null),
    createCalendar: async (c) => { calendars[c.id] = clone(c); return c; },
    updateCalendar: async (id, fn) => { if (!calendars[id]) return null; calendars[id] = clone(await fn(clone(calendars[id]))); return calendars[id]; },
    deleteCalendar: async (id) => { const had = Boolean(calendars[id]); delete calendars[id]; return had; },
    getAllWichtelGroups: async () => Object.values(groups).map(clone),
    getWichtelGroupsByOwner: async (o) => Object.values(groups).filter((g) => g.ownerId === o).map(clone),
    getWichtelGroupById: async (id) => (groups[id] ? clone(groups[id]) : null),
    getWichtelGroupByInviteToken: async (t) => clone(Object.values(groups).find((g) => g.inviteToken === t) || null),
    getWichtelGroupByParticipantToken: async (t) => clone(Object.values(groups).find((g) => g.participants.some((p) => p.token === t)) || null),
    createWichtelGroup: async (g) => { groups[g.id] = clone(g); return g; },
    updateWichtelGroup: async (id, fn) => { if (!groups[id]) return null; const u = await fn(clone(groups[id])); groups[id] = clone(u); return u; },
    deleteWichtelGroup: async (id) => { const had = Boolean(groups[id]); delete groups[id]; return had; },
    getAllElfPlans: async () => Object.values(plans).map(clone),
    getElfPlansByOwner: async (o) => Object.values(plans).filter((p) => p.ownerId === o).map(clone),
    getElfPlanById: async (id) => (plans[id] ? clone(plans[id]) : null),
    getElfPlanByShareToken: async (t) => clone(Object.values(plans).find((p) => p.shareToken === t) || null),
    getElfPlanByKidToken: async (t) => clone(Object.values(plans).find((p) => p.kidToken === t) || null),
    createElfPlan: async (p) => { plans[p.id] = clone(p); return p; },
    updateElfPlan: async (id, fn) => { if (!plans[id]) return null; const u = await fn(clone(plans[id])); plans[id] = clone(u); return u; },
    deleteElfPlan: async (id) => { const had = Boolean(plans[id]); delete plans[id]; return had; },
  };
  return db;
}

function install(db) {
  const pushed = [];
  // Modules keep the exports object they required first, so a second
  // install() (one per test) swaps the functions inside that same object.
  const stub = (file, exports) => {
    const key = require.resolve(path.join(SRC, file));
    const existing = require.cache[key];
    if (existing) {
      for (const k of Object.keys(existing.exports)) delete existing.exports[k];
      Object.assign(existing.exports, exports);
    } else {
      require.cache[key] = { id: file, filename: file, loaded: true, exports };
    }
  };
  stub("db.js", db);
  stub("push.js", {
    sendPushNotification: async (sub, payload) => {
      pushed.push({ sub, payload });
      if (sub.endpoint === "expo:ExponentPushToken[dead]") { const e = new Error("gone"); e.statusCode = 410; throw e; }
    },
    isExpoPushToken: (v) => /^ExponentPushToken\[[\w-]+\]$/.test(v),
    getVapidPublicKey: () => "BPUBKEY",
    initWebPush() {},
  });
  const mails = [];
  stub("services/mail.js", {
    sendMail: async (m) => { mails.push(m); return true; },
    layout: (title, body) => `<html><body><h1>${title}</h1>${body}</body></html>`,
    escapeHtml: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  });
  return { pushed, mails };
}

async function startApp() {
  const db = createStubDb();
  const { pushed, mails } = install(db);
  const config = require(path.join(SRC, "config"));
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/auth", require(path.join(SRC, "routes/auth")));
  app.use("/api/wichteln", require(path.join(SRC, "routes/wichteln")));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const session = jwt.sign({ role: "user", id: db.user.id, email: db.user.email }, config.jwtSecret);
  const auth = { cookie: `advent_session=${session}` };
  const call = async (method, p, body, headers = auth) => {
    const r = await fetch(`${base}${p}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return { status: r.status, d };
  };
  const anon = (method, p, body) => call(method, p, body, {});
  const stop = () => new Promise((r) => server.close(r));
  return { app, base, db, pushed, mails, call, anon, stop, config, session };
}

module.exports = { startApp, createStubDb, install };
