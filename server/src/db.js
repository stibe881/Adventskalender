const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

// Read .env file directly to bypass Hetzner's environment variable injection
// which overrides process.env even with dotenv override:true
function readEnvFile() {
  try {
    const envPath = path.join(__dirname, "..", "..", ".env");
    const content = fs.readFileSync(envPath, "utf8");
    const env = {};
    content.split("\n").forEach((line) => {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    });
    return env;
  } catch (e) {
    return {};
  }
}

const envVars = readEnvFile();

const pool = mysql.createPool({
  host: envVars.DB_HOST || process.env.DB_HOST || "localhost",
  user: envVars.DB_USER || process.env.DB_USER || "root",
  password: envVars.DB_PASS || envVars.DB_PASSWORD || process.env.DB_PASS || "",
  database: envVars.DB_NAME || process.env.DB_NAME || "adventskalender",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});


async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      verificationToken VARCHAR(255),
      isPro BOOLEAN DEFAULT FALSE,
      data JSON
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendars (
      id VARCHAR(255) PRIMARY KEY,
      ownerId VARCHAR(255),
      token VARCHAR(255) UNIQUE,
      subdomain VARCHAR(255),
      data JSON
    )
  `);

  // Wichtel-Runden (Secret Santa groups). Participant tokens live inside the
  // JSON document; lookups use JSON_SEARCH so no extra table is needed.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wichtel_groups (
      id VARCHAR(255) PRIMARY KEY,
      ownerId VARCHAR(255),
      inviteToken VARCHAR(255) UNIQUE,
      data JSON,
      INDEX idx_wichtel_owner (ownerId)
    )
  `);

  // Wichteltür (Christmas elf planner). Parents share the plan via shareToken,
  // children get a read-mostly page via kidToken.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elf_plans (
      id VARCHAR(255) PRIMARY KEY,
      ownerId VARCHAR(255),
      shareToken VARCHAR(255) UNIQUE,
      kidToken VARCHAR(255) UNIQUE,
      data JSON,
      INDEX idx_elf_owner (ownerId)
    )
  `);
}

initDB().catch(console.error);

// ── Wichteln ────────────────────────────────────────────────────────────────
async function getAllWichtelGroups() {
  const [rows] = await pool.query("SELECT * FROM wichtel_groups");
  return rows.map((r) => r.data);
}

async function getWichtelGroupsByOwner(ownerId) {
  const [rows] = await pool.query("SELECT * FROM wichtel_groups WHERE ownerId = ?", [ownerId]);
  return rows.map((r) => r.data);
}

async function getWichtelGroupById(id) {
  const [rows] = await pool.query("SELECT * FROM wichtel_groups WHERE id = ?", [id]);
  return rows.length ? rows[0].data : null;
}

async function getWichtelGroupByInviteToken(token) {
  const [rows] = await pool.query("SELECT * FROM wichtel_groups WHERE inviteToken = ?", [token]);
  return rows.length ? rows[0].data : null;
}

async function getWichtelGroupByParticipantToken(token) {
  const [rows] = await pool.query(
    "SELECT * FROM wichtel_groups WHERE JSON_SEARCH(data, 'one', ?, NULL, '$.participants[*].token') IS NOT NULL LIMIT 1",
    [token]
  );
  return rows.length ? rows[0].data : null;
}

async function createWichtelGroup(group) {
  await pool.query("INSERT INTO wichtel_groups (id, ownerId, inviteToken, data) VALUES (?, ?, ?, ?)", [
    group.id,
    group.ownerId,
    group.inviteToken,
    JSON.stringify(group),
  ]);
  return group;
}

async function updateWichtelGroup(id, updaterFn) {
  const group = await getWichtelGroupById(id);
  if (!group) return null;
  const updated = await updaterFn(group);
  await pool.query("UPDATE wichtel_groups SET ownerId = ?, inviteToken = ?, data = ? WHERE id = ?", [
    updated.ownerId,
    updated.inviteToken,
    JSON.stringify(updated),
    id,
  ]);
  return updated;
}

async function deleteWichtelGroup(id) {
  const [result] = await pool.query("DELETE FROM wichtel_groups WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

async function getAllCalendars() {
  const [rows] = await pool.query("SELECT * FROM calendars");
  return rows.map(r => r.data);
}

async function getCalendarsByOwnerOrCollaborator(ownerId, email) {
  const calendars = await getAllCalendars();
  return calendars.filter(c => {
    if (c.ownerId === ownerId) return true;
    if (c.collaborators && c.collaborators.includes(email)) return true;
    return false;
  });
}

async function getCalendarById(id) {
  const [rows] = await pool.query("SELECT * FROM calendars WHERE id = ?", [id]);
  return rows.length ? rows[0].data : null;
}

async function getCalendarByToken(token) {
  const [rows] = await pool.query("SELECT * FROM calendars WHERE token = ?", [token]);
  return rows.length ? rows[0].data : null;
}

async function getCalendarBySubdomain(subdomain) {
  if (!subdomain) return null;
  const [rows] = await pool.query("SELECT * FROM calendars WHERE subdomain = ?", [subdomain.toLowerCase().trim()]);
  return rows.length ? rows[0].data : null;
}

async function createCalendar(calendar) {
  await pool.query(
    "INSERT INTO calendars (id, ownerId, token, subdomain, data) VALUES (?, ?, ?, ?, ?)",
    [
      calendar.id,
      calendar.ownerId,
      calendar.token,
      calendar.customConfig?.subdomain?.toLowerCase().trim() || null,
      JSON.stringify(calendar)
    ]
  );
  return calendar;
}

async function updateCalendar(id, updaterFn) {
  const cal = await getCalendarById(id);
  if (!cal) return null;
  const updated = await updaterFn(cal);
  await pool.query(
    "UPDATE calendars SET ownerId = ?, token = ?, subdomain = ?, data = ? WHERE id = ?",
    [
      updated.ownerId,
      updated.token,
      updated.customConfig?.subdomain?.toLowerCase().trim() || null,
      JSON.stringify(updated),
      id
    ]
  );
  return updated;
}

async function deleteCalendar(id) {
  const [result] = await pool.query("DELETE FROM calendars WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

// ── Wichteltür ──────────────────────────────────────────────────────────────
async function getAllElfPlans() {
  const [rows] = await pool.query("SELECT * FROM elf_plans");
  return rows.map((r) => r.data);
}

async function getElfPlansByOwner(ownerId) {
  const [rows] = await pool.query("SELECT * FROM elf_plans WHERE ownerId = ?", [ownerId]);
  return rows.map((r) => r.data);
}

async function getElfPlanById(id) {
  const [rows] = await pool.query("SELECT * FROM elf_plans WHERE id = ?", [id]);
  return rows.length ? rows[0].data : null;
}

async function getElfPlanByShareToken(token) {
  const [rows] = await pool.query("SELECT * FROM elf_plans WHERE shareToken = ?", [token]);
  return rows.length ? rows[0].data : null;
}

async function getElfPlanByKidToken(token) {
  const [rows] = await pool.query("SELECT * FROM elf_plans WHERE kidToken = ?", [token]);
  return rows.length ? rows[0].data : null;
}

async function createElfPlan(plan) {
  await pool.query("INSERT INTO elf_plans (id, ownerId, shareToken, kidToken, data) VALUES (?, ?, ?, ?, ?)", [
    plan.id, plan.ownerId, plan.shareToken, plan.kidToken, JSON.stringify(plan),
  ]);
  return plan;
}

async function updateElfPlan(id, updaterFn) {
  const plan = await getElfPlanById(id);
  if (!plan) return null;
  const updated = await updaterFn(plan);
  await pool.query("UPDATE elf_plans SET ownerId = ?, shareToken = ?, kidToken = ?, data = ? WHERE id = ?", [
    updated.ownerId, updated.shareToken, updated.kidToken, JSON.stringify(updated), id,
  ]);
  return updated;
}

async function deleteElfPlan(id) {
  const [result] = await pool.query("DELETE FROM elf_plans WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

// User operations
async function getUserByEmail(email) {
  const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
  if (!rows.length) return null;
  const u = rows[0].data;
  u.id = rows[0].id;
  u.email = rows[0].email;
  u.password = rows[0].password;
  u.verificationToken = rows[0].verificationToken;
  u.isPro = Boolean(rows[0].isPro);
  return u;
}

async function getUserById(id) {
  const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
  if (!rows.length) return null;
  const u = rows[0].data;
  u.id = rows[0].id;
  u.email = rows[0].email;
  u.isPro = Boolean(rows[0].isPro);
  return u;
}

async function getUserByUsername(username) {
  const [rows] = await pool.query("SELECT * FROM users WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(data, '$.username'))) = ?", [username.toLowerCase()]);
  return rows.length ? rows[0].data : null;
}

async function getUserByCompany(company) {
  const [rows] = await pool.query("SELECT * FROM users WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(data, '$.company'))) = ?", [company.toLowerCase()]);
  return rows.length ? rows[0].data : null;
}

async function getUserByVerificationToken(token) {
  const [rows] = await pool.query("SELECT * FROM users WHERE verificationToken = ?", [token]);
  if (!rows.length) return null;
  const u = rows[0].data;
  u.id = rows[0].id;
  u.email = rows[0].email;
  u.password = rows[0].password;
  u.verificationToken = rows[0].verificationToken;
  u.isPro = Boolean(rows[0].isPro);
  return u;
}

async function createUser(user) {
  if (user.isPro === undefined) user.isPro = false;
  const data = { ...user };
  await pool.query(
    "INSERT INTO users (id, email, password, verificationToken, isPro, data) VALUES (?, ?, ?, ?, ?, ?)",
    [
      user.id,
      user.email,
      user.password,
      user.verificationToken || null,
      user.isPro,
      JSON.stringify(data)
    ]
  );
  return user;
}

async function updateUser(idOrEmail, updaterFn) {
  let rows;
  // Try by ID first
  [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [idOrEmail]);
  
  // Fallback to email if not found by ID (useful during migration where JWT token ID doesn't match)
  if (!rows.length && typeof idOrEmail === "string" && idOrEmail.includes("@")) {
    [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [idOrEmail.toLowerCase().trim()]);
  }
  
  if (!rows.length) return null;
  
  const user = rows[0].data;
  user.id = rows[0].id;
  user.email = rows[0].email;
  user.password = rows[0].password;
  user.verificationToken = rows[0].verificationToken;
  user.isPro = Boolean(rows[0].isPro);

  const updated = await updaterFn(user);
  const data = { ...updated };
  
  await pool.query(
    "UPDATE users SET email = ?, password = ?, verificationToken = ?, isPro = ?, data = ? WHERE id = ?",
    [
      updated.email,
      updated.password,
      updated.verificationToken || null,
      updated.isPro,
      JSON.stringify(data),
      user.id
    ]
  );
  return updated;
}

async function deleteUser(id) {
  const [result] = await pool.query("DELETE FROM users WHERE id = ?", [id]);
  return result.affectedRows > 0;
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
  getUserById,
  getUserByUsername,
  getUserByCompany,
  getUserByVerificationToken,
  createUser,
  updateUser,
  deleteUser,
  getAllWichtelGroups,
  getWichtelGroupsByOwner,
  getWichtelGroupById,
  getWichtelGroupByInviteToken,
  getWichtelGroupByParticipantToken,
  createWichtelGroup,
  updateWichtelGroup,
  deleteWichtelGroup,
  getAllElfPlans,
  getElfPlansByOwner,
  getElfPlanById,
  getElfPlanByShareToken,
  getElfPlanByKidToken,
  createElfPlan,
  updateElfPlan,
  deleteElfPlan,
};
