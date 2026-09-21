const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { startApp } = require("./helpers/app");

const SRC = path.join(__dirname, "..", "server", "src");

test("Kalender: the recipient switches the morning e-mail reminder on and off, with a one-click unsubscribe link", async (t) => {
  const h = await startApp();
  h.app.use("/api/admin", require(path.join(SRC, "routes/admin")));
  const calRoutes = require(path.join(SRC, "routes/calendar"));
  h.app.use("/api/calendar", calRoutes);
  const { call, anon, db } = h;
  t.after(h.stop);

  let r = await call("POST", "/api/admin/calendars", { recipientName: "Lian", theme: "kid", year: 2026 });
  const cal = r.d;
  assert.ok(!cal.recipientEmail, "the owner does not enter the recipient's address");

  r = await anon("GET", `/api/calendar/${cal.token}`);
  assert.deepEqual(r.d.reminder, { enabled: false, email: null });
  r = await anon("POST", `/api/calendar/${cal.token}/reminder`, { email: "kaputt" });
  assert.equal(r.status, 400);
  r = await anon("POST", `/api/calendar/${cal.token}/reminder`, { email: "Lian@Example.ch" });
  assert.equal(r.status, 201);
  assert.deepEqual(r.d, { enabled: true, email: "l***@example.ch" });
  assert.equal(db.calendars[cal.id].recipientEmail, "lian@example.ch");

  // Unsubscribe link: wrong key does nothing, right key clears the address.
  const link = calRoutes.unsubscribeLink(db.calendars[cal.id]);
  assert.match(link, /\/reminder\/unsubscribe\?key=[a-f0-9]{24}$/);
  let res = await fetch(`${h.base}/api/calendar/${cal.token}/reminder/unsubscribe?key=wrong`);
  assert.equal(res.status, 400);
  assert.equal(db.calendars[cal.id].recipientEmail, "lian@example.ch");
  res = await fetch(`${h.base}${link.slice(link.indexOf("/api/"))}`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Abbestellt/);
  assert.equal(db.calendars[cal.id].recipientEmail, null);

  r = await anon("POST", `/api/calendar/${cal.token}/reminder`, { email: "lian@example.ch" });
  r = await anon("DELETE", `/api/calendar/${cal.token}/reminder`);
  assert.deepEqual(r.d, { enabled: false, email: null });
});
