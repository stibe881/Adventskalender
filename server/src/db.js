const fs = require("fs");
const path = require("path");
const config = require("./config");

const DATA_FILE = config.paths.dataFile;

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ calendars: [] }, null, 2));
  }
}

function load() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.calendars)) parsed.calendars = [];
    if (!Array.isArray(parsed.users)) parsed.users = [];
    return parsed;
  } catch (err) {
    throw new Error(`db.json ist beschädigt oder ungültig: ${err.message}`);
  }
}

function save(data) {
  ensureDataFile();
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, DATA_FILE);
}

function getAllCalendars() {
  return load().calendars;
}

function getCalendarsByOwnerOrCollaborator(userId, email) {
  return load().calendars.filter((c) => {
    if (c.ownerId === userId) return true;
    if (c.collaborators && c.collaborators.includes(email)) return true;
    return false;
  });
}

function getCalendarById(id) {
  return load().calendars.find((c) => c.id === id) || null;
}

function getCalendarByToken(token) {
  return load().calendars.find((c) => c.token === token) || null;
}

function createCalendar(calendar) {
  const data = load();
  data.calendars.push(calendar);
  save(data);
  return calendar;
}

function updateCalendar(id, updaterFn) {
  const data = load();
  const idx = data.calendars.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const updated = updaterFn(data.calendars[idx]);
  data.calendars[idx] = updated;
  save(data);
  return updated;
}

function deleteCalendar(id) {
  const data = load();
  const before = data.calendars.length;
  data.calendars = data.calendars.filter((c) => c.id !== id);
  save(data);
  return data.calendars.length < before;
}

function updateUser(id, updater) {
  const data = load();
  const idx = data.users.findIndex(u => u.id === id);
  if (idx !== -1) {
    data.users[idx] = updater(data.users[idx]);
    save(data);
    return data.users[idx];
  }
  return null;
}

function getCalendarsByOwnerOrCollaborator(ownerId, email) {
  return load().calendars.filter((c) => {
    if (c.ownerId === ownerId) return true;
    if (c.collaborators && c.collaborators.includes(email)) return true;
    return false;
  });
}

function getUserByEmail(email) {
  return load().users.find((u) => u.email === email) || null;
}

function getUserByVerificationToken(token) {
  return load().users.find((u) => u.verificationToken === token) || null;
}

function updateUser(id, updaterFn) {
  const data = load();
  const idx = data.users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const updated = updaterFn(data.users[idx]);
  data.users[idx] = updated;
  save(data);
  return updated;
}

function createUser(user) {
  const data = load();
  if (user.isPro === undefined) {
    user.isPro = false;
  }
  data.users.push(user);
  save(data);
  return user;
}

function getCalendarBySubdomain(subdomain) {
  if (!subdomain) return null;
  const normalized = subdomain.toLowerCase().trim();
  return (
    load().calendars.find(
      (c) =>
        c.customConfig &&
        c.customConfig.subdomain &&
        c.customConfig.subdomain.toLowerCase().trim() === normalized
    ) || null
  );
}

module.exports = {
  getAllCalendars,
  getCalendarsByOwnerOrCollaborator,
  getCalendarById,
  getCalendarByToken,
  getCalendarBySubdomain,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  getUserByEmail,
  getUserByVerificationToken,
  createUser,
  updateUser,
};
