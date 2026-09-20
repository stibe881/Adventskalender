const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { startApp } = require("./helpers/app");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isoIn = (config, days) => new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date(Date.now() + days * 86400000));

test("Wichteln: organizer flow, draw, chat, reminders", async (t) => {
  const h = await startApp();
  const { call, anon, db, pushed, mails } = h;
  t.after(h.stop);

  // Organizer creates a round and adds people
  let r = await call("POST", "/api/wichteln/groups", { title: "Weihnachtsfeier", organizerName: "Stefan", inviteMode: "email", organizerParticipates: true });
  assert.equal(r.status, 201);
  assert.equal(r.d.participants.length, 1);
  assert.ok(r.d.participants[0].isOrganizer);
  const gid = r.d.id;
  for (const [name, email] of [["Anna", "anna@x.ch"], ["Ben", "ben@x.ch"], ["Clara", "clara@x.ch"], ["Dario", "dario@x.ch"]]) {
    r = await call("POST", `/api/wichteln/groups/${gid}/participants`, { name, email });
    assert.equal(r.status, 201);
  }
  r = await call("POST", `/api/wichteln/groups/${gid}/participants`, { name: "anna", email: "other@x.ch" });
  assert.equal(r.status, 400, "duplicate names are rejected");

  const view = (await call("GET", `/api/wichteln/groups/${gid}`)).d;
  assert.equal(view.participants[0].token, undefined, "organizer view hides tokens");
  const P = Object.fromEntries(view.participants.map((p) => [p.name, { ...p, token: p.link.split("/").pop() }]));

  r = await call("PUT", `/api/wichteln/groups/${gid}/exclusions`, { exclusions: [[P.Anna.id, P.Ben.id], [P.Anna.id, P.Anna.id], ["bogus", P.Ben.id]] });
  assert.equal(r.d.exclusions.length, 1);
  r = await call("PUT", `/api/wichteln/groups/${gid}`, { budget: "20 CHF", eventDate: "2026-12-18", eventTime: "17:30", eventPlace: "Küche", retentionDays: 30, wishlistsShared: true });
  assert.equal(r.d.budget, "20 CHF");
  assert.ok(r.d.deleteAt.startsWith("2027-01-17"));
  assert.equal(r.d.wishlistsShared, true);

  // Checklist before the draw
  r = await call("GET", `/api/wichteln/groups/${gid}/checklist`);
  assert.equal(r.d.ready, true);
  assert.ok(r.d.items.find((i) => i.key === "invited" && !i.ok), "nobody invited yet");

  // Participant before the draw
  r = await anon("GET", `/api/wichteln/p/${P.Anna.token}`);
  assert.equal(r.status, 200);
  assert.equal(r.d.recipient, null);
  assert.equal(r.d.wishlists.length, 4, "shared wish lists list everybody else");
  r = await anon("PUT", `/api/wichteln/p/${P.Anna.token}/wishlist`, { wishlist: [{ id: "w1", url: "https://example.com/buch", title: "Ein Buch", price: "15 CHF" }, { title: "" }] });
  assert.equal(r.d.me.wishlist.length, 1);
  r = await anon("PUT", `/api/wichteln/p/${P.Anna.token}/profile`, { hints: { allergies: "Nüsse" }, notify: { email: false } });
  assert.equal(r.d.me.hints.allergies, "Nüsse");
  assert.equal(r.d.me.notify.email, false);
  r = await anon("POST", `/api/wichteln/p/${P.Anna.token}/messages`, { channel: "recipient", text: "hi" });
  assert.equal(r.status, 400, "chat closed before the draw");
  r = await anon("POST", `/api/wichteln/p/${P.Anna.token}/thanks`, { text: "Danke!" });
  assert.equal(r.status, 400, "thanks only after the draw");

  // Draw
  mails.length = 0;
  r = await call("POST", `/api/wichteln/groups/${gid}/draw`);
  assert.equal(r.status, 200);
  assert.equal(r.d.status, "drawn");
  assert.equal(r.d.mailsSent, 4, "everybody with mail notifications on gets the draw mail");
  const stored = db.groups[gid];
  const map = Object.fromEntries(stored.participants.map((p) => [p.id, p.assignedTo]));
  const ids = stored.participants.map((p) => p.id);
  assert.ok(ids.every((id) => map[id] && map[id] !== id));
  assert.equal(new Set(Object.values(map)).size, ids.length);
  assert.ok(map[P.Anna.id] !== P.Ben.id && map[P.Ben.id] !== P.Anna.id, "exclusion respected");
  assert.ok(r.d.participants.every((p) => p.assignedTo === null), "organizer cannot see the draw");
  r = await call("DELETE", `/api/wichteln/groups/${gid}/participants/${P.Ben.id}`);
  assert.equal(r.status, 409);

  // Chat with unread counters and read receipts
  const annaTarget = stored.participants.find((p) => p.id === map[P.Anna.id]);
  const annaSanta = stored.participants.find((p) => p.assignedTo === P.Anna.id);
  r = await anon("POST", `/api/wichteln/p/${P.Anna.token}/messages`, { channel: "recipient", text: "Magst du Tee?" });
  assert.equal(r.status, 201);
  assert.equal(r.d.recipient.messages.length, 1);
  assert.equal(r.d.recipient.messages[0].read, false, "not read yet by the recipient");
  r = await anon("GET", `/api/wichteln/p/${annaTarget.token}`);
  assert.equal(r.d.santa.unread, 1);
  assert.equal(r.d.santa.messages[0].from, "Dein geheimer Wichtel");
  r = await anon("PUT", `/api/wichteln/p/${annaTarget.token}/read`, { channel: "santa" });
  assert.equal(r.d.santa.unread, 0);
  r = await anon("GET", `/api/wichteln/p/${P.Anna.token}`);
  assert.equal(r.d.recipient.messages[0].read, true, "read receipt reaches the sender");
  assert.equal(r.d.recipient.unread, 0);

  // Push to the app: message pushes to every device, dead tokens are dropped
  r = await anon("POST", `/api/wichteln/p/${annaTarget.token}/push`, { expoToken: "ExponentPushToken[abc123]", platform: "ios" });
  assert.equal(r.status, 201);
  await anon("POST", `/api/wichteln/p/${annaTarget.token}/push`, { expoToken: "ExponentPushToken[dead]" });
  r = await anon("POST", `/api/wichteln/p/${annaTarget.token}/push`, { expoToken: "nope" });
  assert.equal(r.status, 400);
  pushed.length = 0;
  await anon("POST", `/api/wichteln/p/${P.Anna.token}/messages`, { channel: "recipient", text: "Und Kaffee?" });
  await wait(150);
  const toTarget = pushed.filter((x) => x.payload.url.includes(annaTarget.token));
  assert.equal(toTarget.length, 2);
  assert.ok(toTarget[0].payload.url.endsWith("#chat"), "push deep-links to the chat");
  assert.ok(toTarget[0].payload.body.includes("Und Kaffee?"));
  assert.equal(db.groups[gid].participants.find((p) => p.id === annaTarget.id).subscriptions.length, 1);
  r = await anon("DELETE", `/api/wichteln/p/${annaTarget.token}/push`, { expoToken: "ExponentPushToken[abc123]" });
  assert.equal(db.groups[gid].participants.find((p) => p.id === annaTarget.id).subscriptions.length, 0);

  // Gift status + santa's view
  r = await anon("PUT", `/api/wichteln/p/${P.Anna.token}/gift-status`, { method: "post", steps: ["bought", "wrapped", "bogus"] });
  assert.equal(r.d.me.giftStatus.done, 2);
  r = await anon("GET", `/api/wichteln/p/${annaTarget.token}`);
  assert.equal(r.d.santa.progress.done, 2);
  r = await anon("GET", `/api/wichteln/p/${annaSanta.token}`);
  assert.equal(r.d.recipient.name, "Anna");
  assert.equal(r.d.recipient.wishlist[0].title, "Ein Buch");

  // Thanks after the draw
  r = await anon("POST", `/api/wichteln/p/${P.Anna.token}/thanks`, { text: "Danke für das tolle Geschenk!" });
  assert.equal(r.status, 201);
  assert.equal(r.d.thanks.length, 1);
  assert.equal(r.d.thanks[0].from, "Anna");
  const thanksId = r.d.thanks[0].id;
  r = await anon("DELETE", `/api/wichteln/p/${annaTarget.token}/thanks/${thanksId}`);
  assert.equal(r.status, 404, "only the author deletes");
  r = await anon("DELETE", `/api/wichteln/p/${P.Anna.token}/thanks/${thanksId}`);
  assert.equal(r.d.thanks.length, 0);

  // ICS
  const raw = await fetch(`${h.base}/api/wichteln/p/${P.Anna.token}/event.ics`);
  const ics = await raw.text();
  assert.equal(raw.status, 200);
  assert.match(ics, /DTSTART:20261218T173000/);
  assert.ok(ics.includes(`Du beschenkst: ${annaTarget.name}`));

  // Reveal is organizer-only and reversible
  r = await call("POST", `/api/wichteln/groups/${gid}/reveal`);
  assert.ok(r.d.participants.every((p) => p.assignedToName));
  r = await anon("GET", `/api/wichteln/p/${P.Anna.token}`);
  assert.equal(r.d.reveal, null);
  r = await anon("GET", `/api/wichteln/p/${P.Stefan.token}`);
  assert.equal(r.d.reveal.length, 5);
  r = await call("POST", `/api/wichteln/groups/${gid}/unreveal`);
  assert.equal(r.d.status, "drawn");

  // Duplicate as a template for next year
  r = await call("POST", `/api/wichteln/groups/${gid}/duplicate`, {});
  assert.equal(r.status, 201);
  assert.equal(r.d.title, "Weihnachtsfeier (Kopie)");
  assert.equal(r.d.status, "draft");
  assert.equal(r.d.participants.length, 5);
  assert.equal(r.d.exclusions.length, 1, "exclusions are remapped to the new ids");
  assert.equal(r.d.eventDate, "", "date is not copied");
  assert.equal(r.d.budget, "20 CHF");
  const copyId = r.d.id;
  assert.notEqual(db.groups[copyId].inviteToken, db.groups[gid].inviteToken);

  // Join via link into the waiting room, then approve
  r = await anon("GET", `/api/wichteln/join/${db.groups[copyId].inviteToken}`);
  assert.equal(r.d.waitingRoom, true);
  r = await anon("POST", `/api/wichteln/join/${db.groups[copyId].inviteToken}`, { name: "Eva", email: "eva@x.ch" });
  assert.equal(r.status, 201);
  assert.equal(r.d.pending, true);
  const eva = db.groups[copyId].participants.find((p) => p.name === "Eva");
  r = await call("POST", `/api/wichteln/groups/${copyId}/participants/${eva.id}/approve`);
  assert.ok(r.d.participants.find((p) => p.id === eva.id && !p.pending));
  r = await anon("POST", `/api/wichteln/join/${db.groups[gid].inviteToken}`, { name: "Eva" });
  assert.equal(r.status, 409, "no joining after the draw");

  // Cron: reminder the day before, gift reminder a week before, auto delete
  const { runWichtelJobs } = require(path.join(__dirname, "..", "server", "src", "cron"));
  db.groups[gid].eventDate = isoIn(h.config, 1);
  db.groups[copyId].deleteAt = new Date(Date.now() - 1000).toISOString();
  mails.length = 0;
  let jobs = await runWichtelJobs();
  assert.equal(jobs.reminders, 5, "all active participants (push or mail)");
  assert.equal(mails.length, 4, "Anna opted out of mails");
  assert.equal(jobs.deleted, 1);
  assert.equal(db.groups[copyId], undefined);
  jobs = await runWichtelJobs();
  assert.equal(jobs.reminders, 0, "not sent twice");
  db.groups[gid].eventDate = isoIn(h.config, 7);
  jobs = await runWichtelJobs();
  assert.equal(jobs.giftReminders, 4, "everybody except Anna, who already started");
});

test("Wichteln: without PRO the wishlist, hints and chat stay locked until the round is upgraded", async (t) => {
  const h = await startApp();
  const { call, anon, db } = h;
  t.after(h.stop);
  db.user.isPro = false;

  let r = await call("POST", "/api/wichteln/groups", { title: "Büro", organizerName: "Stefan", inviteMode: "names", organizerParticipates: true, chatEnabled: true });
  assert.equal(r.status, 201);
  assert.equal(r.d.isPro, false);
  assert.deepEqual(r.d.features, { wishlist: false, hints: false, chat: false });
  const gid = r.d.id;
  for (const name of ["Anna", "Ben"]) await call("POST", `/api/wichteln/groups/${gid}/participants`, { name });
  const view = (await call("GET", `/api/wichteln/groups/${gid}`)).d;
  const tok = Object.fromEntries(view.participants.map((p) => [p.name, p.link.split("/").pop()]));
  r = await call("GET", "/api/wichteln/groups");
  assert.equal(r.d[0].isPro, false, "list shows the PRO state");

  // Locked features answer 402 with a hint that PRO unlocks them.
  r = await anon("PUT", `/api/wichteln/p/${tok.Anna}/wishlist`, { wishlist: [{ id: "w1", title: "Buch" }] });
  assert.equal(r.status, 402);
  assert.equal(r.d.pro, true);
  assert.match(r.d.error, /PRO/);
  r = await anon("PUT", `/api/wichteln/p/${tok.Anna}/profile`, { hints: { hobbies: "Lesen" } });
  assert.equal(r.status, 402);
  r = await anon("PUT", `/api/wichteln/p/${tok.Anna}/profile`, { email: "anna@x.ch" });
  assert.equal(r.status, 200, "e-mail and notifications stay free");
  assert.equal(r.d.me.email, "anna@x.ch");
  assert.deepEqual(r.d.features, { wishlist: false, hints: false, chat: false });
  assert.ok(!r.d.wishlists, "shared wishlists stay hidden without PRO");

  r = await call("POST", `/api/wichteln/groups/${gid}/draw`);
  assert.equal(r.status, 200);
  r = await anon("POST", `/api/wichteln/p/${tok.Anna}/messages`, { to: "recipient", text: "Hallo?" });
  assert.equal(r.status, 402, "chat is PRO");

  // Upgrading the round (what the Stripe webhook does) unlocks everything for everybody.
  await db.updateWichtelGroup(gid, (g) => { g.isPro = true; return g; });
  r = await anon("GET", `/api/wichteln/p/${tok.Anna}`);
  assert.deepEqual(r.d.features, { wishlist: true, hints: true, chat: true });
  r = await anon("PUT", `/api/wichteln/p/${tok.Anna}/wishlist`, { wishlist: [{ id: "w1", title: "Buch" }] });
  assert.equal(r.status, 200);
  assert.equal(r.d.me.wishlist.length, 1);
  r = await anon("PUT", `/api/wichteln/p/${tok.Anna}/profile`, { hints: { hobbies: "Lesen" } });
  assert.equal(r.d.me.hints.hobbies, "Lesen");
  r = await anon("POST", `/api/wichteln/p/${tok.Anna}/messages`, { to: "recipient", text: "Hallo?" });
  assert.equal(r.status, 201);
  r = await call("GET", `/api/wichteln/groups/${gid}`);
  assert.equal(r.d.isPro, true);
});
