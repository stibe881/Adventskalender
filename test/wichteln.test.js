const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { startApp } = require("./helpers/app");

const SRC = path.join(__dirname, "..", "server", "src");
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
  r = await anon("PUT", `/api/wichteln/p/${P.Anna.token}/wishlist`, { acceptTerms: true, wishlist: [{ id: "w1", url: "https://example.com/buch", title: "Ein Buch", price: "15 CHF" }, { title: "" }] });
  assert.equal(r.d.me.wishlist.length, 1);
  r = await anon("PUT", `/api/wichteln/p/${P.Anna.token}/profile`, { hints: { allergies: "Nüsse" }, notify: { email: false } });
  assert.equal(r.d.me.hints.allergies, "Nüsse");
  assert.equal(r.d.me.notify.email, false);
  r = await anon("POST", `/api/wichteln/p/${P.Anna.token}/messages`, { acceptTerms: true, channel: "recipient", text: "hi" });
  assert.equal(r.status, 400, "chat closed before the draw");
  r = await anon("POST", `/api/wichteln/p/${P.Anna.token}/thanks`, { acceptTerms: true, text: "Danke!" });
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
  r = await anon("POST", `/api/wichteln/p/${P.Anna.token}/messages`, { acceptTerms: true, channel: "recipient", text: "Magst du Tee?" });
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
  await anon("POST", `/api/wichteln/p/${P.Anna.token}/messages`, { acceptTerms: true, channel: "recipient", text: "Und Kaffee?" });
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
  r = await anon("POST", `/api/wichteln/p/${P.Anna.token}/thanks`, { acceptTerms: true, text: "Danke für das tolle Geschenk!" });
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
  r = await anon("POST", `/api/wichteln/join/${db.groups[copyId].inviteToken}`, { acceptTerms: true, name: "Eva", email: "eva@x.ch" });
  assert.equal(r.status, 201);
  assert.equal(r.d.pending, true);
  const eva = db.groups[copyId].participants.find((p) => p.name === "Eva");
  r = await call("POST", `/api/wichteln/groups/${copyId}/participants/${eva.id}/approve`);
  assert.ok(r.d.participants.find((p) => p.id === eva.id && !p.pending));
  r = await anon("POST", `/api/wichteln/join/${db.groups[gid].inviteToken}`, { acceptTerms: true, name: "Eva" });
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
  r = await anon("PUT", `/api/wichteln/p/${tok.Anna}/wishlist`, { acceptTerms: true, wishlist: [{ id: "w1", title: "Buch" }] });
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
  r = await anon("POST", `/api/wichteln/p/${tok.Anna}/messages`, { acceptTerms: true, to: "recipient", text: "Hallo?" });
  assert.equal(r.status, 402, "chat is PRO");

  // Upgrading the round (what the Stripe webhook does) unlocks everything for everybody.
  await db.updateWichtelGroup(gid, (g) => { g.isPro = true; return g; });
  r = await anon("GET", `/api/wichteln/p/${tok.Anna}`);
  assert.deepEqual(r.d.features, { wishlist: true, hints: true, chat: true });
  r = await anon("PUT", `/api/wichteln/p/${tok.Anna}/wishlist`, { acceptTerms: true, wishlist: [{ id: "w1", title: "Buch" }] });
  assert.equal(r.status, 200);
  assert.equal(r.d.me.wishlist.length, 1);
  r = await anon("PUT", `/api/wichteln/p/${tok.Anna}/profile`, { hints: { hobbies: "Lesen" } });
  assert.equal(r.d.me.hints.hobbies, "Lesen");
  r = await anon("POST", `/api/wichteln/p/${tok.Anna}/messages`, { acceptTerms: true, to: "recipient", text: "Hallo?" });
  assert.equal(r.status, 201);
  r = await call("GET", `/api/wichteln/groups/${gid}`);
  assert.equal(r.d.isPro, true);
});

test("Wichteln: Nutzungsbedingungen, Wortfilter, Melden, Blockieren und Löschen im Chat", async (t) => {
  const h = await startApp();
  h.app.use("/api/wichteln", require(path.join(SRC, "routes/wichteln")));
  h.app.use("/api/admin", require(path.join(SRC, "routes/admin")));
  const { call, anon, mails, db } = h;
  t.after(h.stop);
  let r = await call("POST", "/api/wichteln/groups", { title: "Team", organizerName: "Stefan", inviteMode: "email", organizerParticipates: true });
  const gid = r.d.id;
  for (const [name, email] of [["Anna", "anna@x.ch"], ["Ben", "ben@x.ch"]]) await call("POST", `/api/wichteln/groups/${gid}/participants`, { name, email });
  // Joining requires accepting the terms; names go through the filter
  const invite = db.groups[gid].inviteToken;
  r = await anon("POST", `/api/wichteln/join/${invite}`, { name: "Eva" });
  assert.equal(r.status, 400); assert.equal(r.d.terms, true);
  r = await anon("POST", `/api/wichteln/join/${invite}`, { name: "Arschloch", acceptTerms: true });
  assert.equal(r.status, 400); assert.equal(r.d.filtered, true);
  r = await anon("POST", `/api/wichteln/join/${invite}`, { name: "Eva", acceptTerms: true });
  assert.equal(r.status, 201);
  await call("POST", `/api/wichteln/groups/${gid}/draw`);
  const g = db.groups[gid];
  const tok = Object.fromEntries(g.participants.map((p) => [p.name, p.token]));
  const giverOf = (name) => g.participants.find((p) => p.assignedTo === g.participants.find((x) => x.name === name).id);
  // Anna writes to her recipient: first without terms (428), then with, then something filtered
  r = await anon("POST", `/api/wichteln/p/${tok.Anna}/messages`, { channel: "recipient", text: "Hallo!" });
  assert.equal(r.status, 428); assert.equal(r.d.terms, true);
  r = await anon("POST", `/api/wichteln/p/${tok.Anna}/messages`, { channel: "recipient", text: "Hallo!", acceptTerms: true });
  assert.equal(r.status, 201); assert.equal(r.d.me.termsAccepted, true);
  r = await anon("POST", `/api/wichteln/p/${tok.Anna}/messages`, { channel: "recipient", text: "Du bist ein Wichser" });
  assert.equal(r.status, 400); assert.equal(r.d.filtered, true);
  const annaTargetName = g.participants.find((p) => p.id === g.participants.find((x) => x.name === "Anna").assignedTo).name;
  // The recipient sees the message, reports it: hidden at once, report stored + mailed
  r = await anon("GET", `/api/wichteln/p/${tok[annaTargetName]}`);
  assert.equal(r.d.santa.messages.length, 1);
  const msgId = r.d.santa.messages[0].id;
  mails.length = 0;
  r = await anon("POST", `/api/wichteln/p/${tok[annaTargetName]}/messages/${msgId}/report`, { reason: "abuse", details: "unangenehm" });
  assert.equal(r.status, 200);
  assert.equal(r.d.santa.messages.length, 0, "hidden for the reporter immediately");
  assert.equal(db.reports.length, 1); assert.equal(db.reports[0].kind, "wichteln-message"); assert.equal(db.reports[0].status, "open");
  assert.ok(mails.some((m) => m.subject.includes("Moderation")), "moderation gets a mail");
  r = await anon("GET", `/api/wichteln/p/${tok.Anna}`);
  assert.equal(r.d.recipient.messages.length, 1, "still there for the sender");
  // Block the santa: no more messages get through
  r = await anon("PUT", `/api/wichteln/p/${tok[annaTargetName]}/block`, { channel: "santa", on: true });
  assert.equal(r.d.santa.blocked, true);
  r = await anon("POST", `/api/wichteln/p/${tok.Anna}/messages`, { channel: "recipient", text: "Noch da?" });
  assert.equal(r.status, 403);
  r = await anon("PUT", `/api/wichteln/p/${tok[annaTargetName]}/block`, { channel: "santa", on: false });
  assert.equal(r.d.santa.blocked, false);
  r = await anon("POST", `/api/wichteln/p/${tok.Anna}/messages`, { channel: "recipient", text: "Noch da?" });
  assert.equal(r.status, 201);
  // Delete own message
  const own = r.d.recipient.messages.find((m) => m.text === "Noch da?");
  r = await anon("DELETE", `/api/wichteln/p/${tok.Anna}/messages/${own.id}`);
  assert.equal(r.status, 200); assert.ok(!r.d.recipient.messages.some((m) => m.id === own.id));
  assert.equal((await anon("DELETE", `/api/wichteln/p/${tok[annaTargetName]}/messages/${msgId}`)).status, 404, "only own messages");
  // Moderator resolves the report by removing the content
  r = await call("GET", "/api/admin/moderation/reports");
  assert.equal(r.status, 403, "orga@example.ch is no moderator");
  h.config.moderation.admins.push("orga@example.ch");
  r = await call("GET", "/api/admin/moderation/reports");
  assert.equal(r.status, 200); assert.equal(r.d.length, 1);
  r = await call("POST", `/api/admin/moderation/reports/${db.reports[0].id}/resolve`, { action: "remove" });
  assert.equal(r.status, 200); assert.equal(r.d.status, "resolved"); assert.equal(r.d.outcome, "Inhalt entfernt");
  assert.ok(!db.groups[gid].messages.some((m) => m.id === msgId), "message gone for everybody");
  assert.equal((await call("GET", "/api/admin/moderation/reports")).d.length, 0);
  // Organizer can delete any photo/thanks/message too
  r = await anon("POST", `/api/wichteln/p/${tok.Anna}/thanks`, { text: "Danke!", acceptTerms: true });
  const thanksId = r.d.thanks[0].id;
  r = await call("DELETE", `/api/wichteln/groups/${gid}/thanks/${thanksId}`);
  assert.equal(r.status, 200); assert.equal(db.groups[gid].thanks.length, 0);
});

test("Wichteln: ein neues Foto an der Foto-Wand benachrichtigt alle anderen per Push und E-Mail", async (t) => {
  const h = await startApp();
  const { call, mails, pushed, db, base } = h;
  t.after(h.stop);
  let r = await call("POST", "/api/wichteln/groups", { title: "Team", organizerName: "Stefan", inviteMode: "email", organizerParticipates: true });
  const gid = r.d.id;
  for (const [name, email] of [["Anna", "anna@x.ch"], ["Ben", "ben@x.ch"]]) await call("POST", `/api/wichteln/groups/${gid}/participants`, { name, email });
  await call("POST", `/api/wichteln/groups/${gid}/draw`);
  const g = db.groups[gid];
  const anna = g.participants.find((p) => p.name === "Anna");
  const ben = g.participants.find((p) => p.name === "Ben");
  ben.subscriptions = [{ endpoint: "https://push.example/ben", keys: {} }];
  ben.notify = { email: true, push: true };
  anna.termsAcceptedAt = new Date().toISOString();
  await wait(150); // let fire-and-forget mails of the setup (and of earlier tests) land first
  mails.length = 0; pushed.length = 0;
  // 1x1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const fd = new FormData();
  fd.append("photo", new Blob([png], { type: "image/png" }), "foto.png");
  fd.append("caption", "Prost!");
  const res = await fetch(`${base}/api/wichteln/p/${anna.token}/photos`, { method: "POST", body: fd });
  assert.equal(res.status, 201);
  const view = await res.json();
  assert.equal(view.photos.length, 1);
  const toMail = mails.map((m) => m.to).sort();
  assert.deepEqual(toMail, ["ben@x.ch", "orga@example.ch"], "everybody but the uploader gets a mail");
  assert.ok(mails[0].subject.includes("Foto"), mails[0].subject);
  assert.ok(mails[0].text.includes("Anna") && mails[0].text.includes("Prost!"));
  assert.equal(pushed.length, 1, "Ben has a push subscription");
  assert.ok(pushed[0].payload.body.includes("Anna"));
  // Clean up the uploaded file
  const fs = require("fs");
  const config = require(path.join(SRC, "config"));
  for (const ph of db.groups[gid].photos) fs.rmSync(path.join(config.paths.uploadsDir, path.basename(ph.url)), { force: true });
});

test("Wichteln: Runden, in denen ich mitwichtle, per E-Mail-Adresse gefunden (eigene und fremde)", async (t) => {
  const h = await startApp();
  const { call, db } = h;
  t.after(h.stop);
  // Own round, organizer plays along
  let r = await call("POST", "/api/wichteln/groups", { title: "Eigene Runde", organizerName: "Stefan", inviteMode: "email", organizerParticipates: true });
  const own = r.d.id;
  await call("POST", `/api/wichteln/groups/${own}/participants`, { name: "Anna", email: "anna@x.ch" });
  // Own round without taking part
  r = await call("POST", "/api/wichteln/groups", { title: "Nur organisiert", organizerName: "Stefan", inviteMode: "email", organizerParticipates: false });
  // Somebody else's round where my address was entered
  db.groups.other = { id: "other", ownerId: "u2", title: "Firma Meier", organizerName: "Petra", status: "drawn", eventDate: "2026-12-18", inviteToken: "inv_other", participants: [
    { id: "p1", name: "Stefan G.", email: "orga@example.ch", token: "tok_me_other", assignedTo: "p2", lastRead: {} },
    { id: "p2", name: "Petra", email: "petra@x.ch", token: "tok_petra", assignedTo: "p1", isOrganizer: true, lastRead: {} },
  ], messages: [{ id: "m1", channel: "p2", from: "p2", text: "Hallo!", at: new Date().toISOString() }], exclusions: [], photos: [], thanks: [] };
  // Pending participant must not count
  db.groups.pending = { id: "pending", ownerId: "u3", title: "Warteraum", organizerName: "X", status: "draft", inviteToken: "inv_p", participants: [{ id: "q1", name: "S", email: "orga@example.ch", token: "tok_pending", pending: true }], exclusions: [], messages: [], photos: [], thanks: [] };
  r = await call("GET", "/api/wichteln/participations");
  assert.equal(r.status, 200);
  const titles = r.d.map((x) => x.title).sort();
  assert.deepEqual(titles, ["Eigene Runde", "Firma Meier"]);
  const mine = r.d.find((x) => x.title === "Eigene Runde");
  assert.equal(mine.isOwn, true); assert.ok(mine.link.includes("/w/"));
  const other = r.d.find((x) => x.title === "Firma Meier");
  assert.equal(other.isOwn, false); assert.equal(other.organizerName, "Petra"); assert.ok(other.link.endsWith("/w/tok_me_other"));
  assert.equal(other.unread, 1, "unread message from my secret santa");
  assert.equal(other.recipientName, "Petra");
  assert.equal((await h.anon("GET", "/api/wichteln/participations")).status, 401);
});
