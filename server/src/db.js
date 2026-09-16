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
}

initDB().catch(console.error);

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
