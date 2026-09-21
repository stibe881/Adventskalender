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

test("Kalender: a template can be applied later; it replaces every door's content and keeps opened flags", async (t) => {
  const h = await startApp();
  h.app.use("/api/admin", require(path.join(SRC, "routes/admin")));
  const { call, db } = h;
  t.after(h.stop);
  let r = await call("POST", "/api/admin/calendars", { recipientName: "Lian", theme: "kid", year: 2026, swissMode: true });
  const id = r.d.id;
  await call("PUT", `/api/admin/calendars/${id}/days/3`, { contentType: "text", content: { message: "Eigener Text", sender: "Ich" } });
  await db.updateCalendar(id, (c) => { c.days[0].opened = true; c.days[0].openedAt = "2026-12-01T07:00:00.000Z"; return c; });
  r = await call("POST", `/api/admin/calendars/${id}/apply-template`, { template: "bogus" });
  assert.equal(r.status, 400);
  r = await call("POST", `/api/admin/calendars/${id}/apply-template`, { template: "kids_mix" });
  assert.equal(r.status, 200);
  assert.equal(r.d.filledDoors, 24);
  const cal = db.calendars[id];
  assert.notEqual(cal.days[2].content.message, "Eigener Text", "own content replaced");
  assert.equal(cal.days[0].opened, true, "opened flag kept");
  assert.equal(cal.days[0].openedAt, "2026-12-01T07:00:00.000Z");
  assert.match(cal.days[0].content.message, /Christkind/, "Swiss mode applied to the template");
  assert.equal(cal.days.length, 24);
});

test("Kalender: a self-chosen period gives one door per day, unlocks by date, and has no door 25", async (t) => {
  const h = await startApp();
  h.app.use("/api/admin", require(path.join(SRC, "routes/admin")));
  h.app.use("/api/calendar", require(path.join(SRC, "routes/calendar")));
  const { call, anon, db } = h;
  t.after(h.stop);
  const T = require(path.join(SRC, "utils/time"));
  const today = T.todayIso();
  const start = T.addDaysIso(today, -2);
  const end = T.addDaysIso(today, 6);

  let r = await call("POST", "/api/admin/calendars", { recipientName: "Lian", theme: "kid", period: { start, end: start } });
  assert.equal(r.status, 400, "at least two days");
  r = await call("POST", "/api/admin/calendars", { recipientName: "Lian", theme: "kid", period: { start, end: T.addDaysIso(start, 70) } });
  assert.equal(r.status, 400, "at most 62 days");
  r = await call("POST", "/api/admin/calendars", { recipientName: "Lian", theme: "kid", period: { start, end }, template: "kids_mix", strictMode: true });
  assert.equal(r.status, 201);
  assert.equal(r.d.dayCount, 9);
  assert.deepEqual(r.d.period, { start, end });
  assert.equal(r.d.filledDoors, 9, "template filled every door of the period");
  assert.equal(r.d.year, Number(start.slice(0, 4)));
  const cal = r.d;

  r = await anon("GET", `/api/calendar/${cal.token}`);
  assert.equal(r.d.days.length, 9);
  assert.equal(r.d.todayDoor, 3);
  assert.equal(r.d.lastDay, 9);
  assert.equal(r.d.firstDate, start);
  assert.equal(r.d.days[2].unlockDate, today);
  assert.equal(r.d.days[2].unlocked, true);
  assert.equal(r.d.days[3].unlocked, false, "tomorrow's door stays shut in strict mode");
  assert.equal(r.d.bonus.mode, "never", "no door 25 outside Advent");
  assert.ok(!r.d.days.some((d) => d.day === 25));
  r = await anon("POST", `/api/calendar/${cal.token}/days/4/open`, {});
  assert.equal(r.status, 403);
  r = await anon("POST", `/api/calendar/${cal.token}/days/3/open`, {});
  assert.equal(r.status, 200);

  // Shortening the period drops the last doors, extending adds empty ones; back to Advent gives 24 again.
  r = await call("PUT", `/api/admin/calendars/${cal.id}`, { period: { start, end: T.addDaysIso(start, 3) } });
  assert.equal(r.d.dayCount, 4);
  assert.equal(db.calendars[cal.id].days.length, 4);
  r = await call("PUT", `/api/admin/calendars/${cal.id}`, { period: { start, end: T.addDaysIso(start, 5) } });
  assert.equal(db.calendars[cal.id].days.length, 6);
  assert.equal(db.calendars[cal.id].days[5].contentType, null);
  r = await call("PUT", `/api/admin/calendars/${cal.id}`, { period: null });
  assert.equal(r.d.dayCount, 24);
  assert.equal(r.d.period, null);
  assert.equal(db.calendars[cal.id].days.length, 24);

  // An Advent calendar is untouched by all this.
  r = await call("POST", "/api/admin/calendars", { recipientName: "Bine", theme: "partner", year: 2026 });
  assert.equal(r.d.dayCount, 24);
  assert.equal(r.d.period, null);
  assert.equal(T.doorDateISO({ year: 2026 }, 24), "2026-12-24");
});
