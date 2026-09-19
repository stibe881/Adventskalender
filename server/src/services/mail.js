const nodemailer = require("nodemailer");
const config = require("../config");

// Shared mail helper. Without a real SMTP configuration mails are printed to
// the server log instead, so every flow still works in development.
let transporter = null;

function smtpConfigured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.user !== "dein_ethereal_user@ethereal.email");
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Simple festive HTML wrapper so every mail looks the same.
function layout(title, bodyHtml) {
  return `<!doctype html><html lang="de"><body style="margin:0;background:#0f172a;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e2e8f0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#1e293b;border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:hidden">
    <div style="background:#065f46;padding:18px 24px;font-size:18px;font-weight:700;color:#fff">🎁 ${escapeHtml(title)}</div>
    <div style="padding:24px;font-size:15px;line-height:1.55">${bodyHtml}</div>
    <div style="padding:14px 24px;font-size:12px;color:#94a3b8;border-top:1px solid rgba(255,255,255,.08)">Diese Nachricht wurde automatisch vom Wichtel-Tool verschickt.</div>
  </div></body></html>`;
}

async function sendMail({ to, subject, text, html }) {
  if (!to) return false;
  if (!smtpConfigured()) {
    console.log(`\n📨 E-MAIL SIMULATION → ${to}\nBetreff: ${subject}\n${text}\n`);
    return false;
  }
  try {
    await getTransporter().sendMail({ from: config.smtp.from, to, subject, text, html });
    return true;
  } catch (err) {
    console.error(`[MAIL] Fehler beim Senden an ${to}:`, err.message);
    return false;
  }
}

module.exports = { sendMail, smtpConfigured, layout, escapeHtml };
