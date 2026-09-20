const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const express = require("express");
const { startApp } = require("./helpers/app");

const SRC = path.join(__dirname, "..", "server", "src");

test("Wichteltür: owner creates a plan, co-parent edits via share link, kids write letters, reminders go out", async (t) => {
  const h = await startApp();
  h.app.use("/api/wichteltuer", require(path.join(SRC, "routes/wichteltuer")));
  const { call, anon, db, pushed, mails } = h;
  t.after(h.stop);

  // Owner creates a plan with two children and lets the planner fill December.
  let r = await call("POST", "/api/wichteltuer/plans", { title: "Wichtel bei uns", elfName: "Pixi", year: 2026, children: [{ name: "Mia", age: 5 }, { name: "Ben", age: 8 }], autoplan: true });
  assert.equal(r.status, 201);
  assert.equal(r.d.elf.name, "Pixi");
  assert.equal(r.d.stats.planned, 24);
  assert.equal(r.d.owner, true);
  assert.equal(r.d.days[0].entry.ideaId, "ankunft", "arrival letter on the 1st");
  assert.equal(r.d.days[23].entry.ideaId, "abschied", "farewell on the 24th");
  assert.equal(r.d.days[5].entry.ideaId, "nikolaus");
  assert.ok(r.d.days[0].entry.letter.includes("Mia und Ben"), "placeholders filled with the children's names");
  assert.equal(r.d.parents.length, 1, "owner's username becomes the first parent");
  const planId = r.d.id;
  const share = r.d.shareLink.split("/").pop();
  const kid = r.d.kidLink.split("/").pop();
  assert.ok(r.d.shopping.length > 5, "shopping list derived from the ideas");

  r = await call("GET", "/api/wichteltuer/plans");
  assert.equal(r.d.length, 1);
  assert.equal(r.d[0].shareToken, share);

  // Co-parent without account: full access through the share link.
  r = await anon("GET", `/api/wichteltuer/s/${share}`);
  assert.equal(r.status, 200);
  assert.equal(r.d.owner, false);
  r = await anon("PUT", `/api/wichteltuer/s/${share}/settings`, { parents: [{ id: r.d.parents[0].id, name: "Stefan" }, { name: "Nina" }], elf: { doorPlace: "Flur", character: "lieb" }, notify: { time: "21:00", emails: ["nina@example.ch", "kaputt"] } });
  assert.equal(r.d.parents.length, 2);
  assert.equal(r.d.elf.doorPlace, "Flur");
  assert.equal(r.d.notify.time, "21:00");
  assert.deepEqual(r.d.notify.emails, ["nina@example.ch"]);
  const nina = r.d.parents[1].id;

  // Replace a day with a custom prank and assign it.
  r = await anon("PUT", `/api/wichteltuer/s/${share}/days/2026-12-02`, { ideaId: null, title: "Wichtel im Kühlschrank", category: "streich", materials: ["Mini-Schal", "Mehl"], minutes: 5, assignee: nina, note: "Kamera bereitlegen" });
  const d2 = r.d.days.find((d) => d.date === "2026-12-02");
  assert.equal(d2.entry.title, "Wichtel im Kühlschrank");
  assert.equal(d2.entry.assigneeName, "Nina");
  assert.equal(d2.entry.ideaId, null);
  r = await anon("PUT", `/api/wichteltuer/s/${share}/days/2026-11-30`, { title: "x" });
  assert.equal(r.status, 400, "outside the season");
  r = await anon("PUT", `/api/wichteltuer/s/${share}/days/2026-12-02`, { done: true, reaction: "Mia hat gekreischt" });
  assert.equal(r.d.days[1].entry.done, true);
  assert.equal(r.d.stats.done, 1);
  const shoppingKeys = r.d.shopping.map((i) => i.key);
  assert.ok(!shoppingKeys.includes("mini-schal"), "materials of finished days leave the list");

  // Swap two days, clear one.
  const t3 = r.d.days[2].entry.title;
  r = await anon("POST", `/api/wichteltuer/s/${share}/days/swap`, { a: "2026-12-03", b: "2026-12-04" });
  assert.equal(r.d.days[3].entry.title, t3);
  r = await anon("DELETE", `/api/wichteltuer/s/${share}/days/2026-12-10`);
  assert.equal(r.d.days[9].entry, null);
  assert.equal(r.d.stats.open, 1);
  r = await anon("POST", `/api/wichteltuer/s/${share}/autoplan`, {});
  assert.ok(r.d.days[9].entry, "autoplan fills the gap without touching the rest");
  assert.equal(r.d.days[1].entry.title, "Wichtel im Kühlschrank");

  // Shopping list: check, custom items, clear.
  const first = r.d.shopping[0];
  r = await anon("PUT", `/api/wichteltuer/s/${share}/shopping/check`, { key: first.key, checked: true });
  assert.equal(r.d.shopping.find((i) => i.key === first.key).checked, true);
  r = await anon("POST", `/api/wichteltuer/s/${share}/shopping/custom`, { text: "Batterien" });
  assert.equal(r.status, 201);
  assert.ok(r.d.shopping.some((i) => i.custom && i.text === "Batterien"));
  r = await anon("POST", `/api/wichteltuer/s/${share}/shopping/clear-checked`);
  assert.equal(r.d.shopping.find((i) => i.key === first.key).checked, false);

  // Letters: templates render in the elf's voice.
  r = await anon("GET", `/api/wichteltuer/s/${share}/letters/templates`);
  assert.ok(r.d.templates.length >= 10);
  r = await anon("POST", `/api/wichteltuer/s/${share}/letters/render`, { templateId: "lob", free: "Ihr habt das Zimmer aufgeräumt." });
  assert.ok(r.d.text.startsWith("Mia und Ben, ich habe etwas beobachtet"));
  assert.ok(r.d.text.includes("euer Pixi"));
  r = await anon("PUT", `/api/wichteltuer/s/${share}/days/2026-12-05`, { letter: r.d.text, letterVisibleToKids: true });
  assert.ok(r.d.days[4].entry.letterVisibleToKids);

  // Kids page: elf, countdown, only letters up to today; a kid writes back.
  r = await anon("GET", `/api/wichteltuer/k/${kid}`);
  assert.equal(r.status, 200);
  assert.equal(r.d.elf.name, "Pixi");
  assert.deepEqual(r.d.children.map((c) => c.name), ["Mia", "Ben"]);
  assert.equal(r.d.letters.length, 0, "nothing visible before December");
  const mia = r.d.children[0].id;
  pushed.length = 0;
  await anon("POST", `/api/wichteltuer/s/${share}/push`, { expoToken: "ExponentPushToken[papa]", who: "Stefan" });
  r = await anon("POST", `/api/wichteltuer/k/${kid}/letters`, { childId: mia, text: "Lieber Pixi, magst du Kekse?" });
  assert.equal(r.status, 201);
  assert.equal(r.d.letters[0].from, "kid");
  assert.equal(r.d.letters[0].childName, "Mia");
  await new Promise((res) => setTimeout(res, 100));
  assert.equal(pushed.length, 1, "parents get a push about the letter");
  assert.ok(pushed[0].payload.url.endsWith("#post"));
  r = await anon("GET", `/api/wichteltuer/s/${share}`);
  assert.equal(r.d.unreadPost, 1);
  assert.equal(r.d.notify.pushDevices, 1);
  r = await anon("POST", `/api/wichteltuer/s/${share}/post`, { childId: mia, text: "Liebe Mia, ja, am liebsten Zimtsterne!" });
  assert.equal(r.status, 201);
  r = await anon("POST", `/api/wichteltuer/s/${share}/post/read-all`);
  assert.equal(r.d.unreadPost, 0);
  r = await anon("GET", `/api/wichteltuer/k/${kid}`);
  assert.equal(r.d.letters.length, 2, "kids see their letter and the elf's answer");
  assert.equal(r.d.letters[0].from, "elf");

  // Evening reminder: tonight's task and tomorrow's preparation.
  const { runElfReminders } = require(path.join(SRC, "cron"));
  const plan = db.plans[planId];
  plan.notify.time = "20:00";
  const at = (iso, hhmm) => new Date(`${iso}T${hhmm}:00+01:00`);
  mails.length = 0;
  pushed.length = 0;
  // Evening of the 2nd: the night for the 3rd is planned and open.
  let jobs = await runElfReminders(at("2026-12-02", "20:00"));
  assert.equal(jobs.sent, 1);
  assert.equal(mails.length, 1);
  assert.ok(!mails[0].text.includes("Wichtel im Kühlschrank"), "the finished day is not repeated");
  assert.ok(pushed[0].payload.body.includes("3. Dezember"));
  assert.ok(pushed[0].payload.url.endsWith("#tag-2026-12-03"));
  jobs = await runElfReminders(at("2026-12-02", "20:00"));
  assert.equal(jobs.sent, 0, "only once per evening");
  jobs = await runElfReminders(at("2026-12-03", "20:00"));
  assert.equal(jobs.sent, 1);
  assert.ok(mails[1].text.includes("4. Dezember"));
  jobs = await runElfReminders(at("2026-12-24", "20:00"));
  assert.equal(jobs.sent, 0, "season over");

  // Owner-only: rotate share link, delete.
  r = await anon("POST", `/api/wichteltuer/plans/${planId}/rotate-share`);
  assert.equal(r.status, 401);
  r = await call("POST", `/api/wichteltuer/plans/${planId}/rotate-share`);
  assert.notEqual(r.d.shareLink.split("/").pop(), share);
  r = await anon("GET", `/api/wichteltuer/s/${share}`);
  assert.equal(r.status, 404, "old share link is dead");
  r = await call("DELETE", `/api/wichteltuer/plans/${planId}`);
  assert.equal(r.d.ok, true);
  r = await anon("GET", `/api/wichteltuer/k/${kid}`);
  assert.equal(r.status, 404);
});

test("Wichteltür: without PRO the idea library, letters and shopping list stay locked", async (t) => {
  const h = await startApp();
  h.app.use("/api/wichteltuer", require(path.join(SRC, "routes/wichteltuer")));
  const { call, anon, db } = h;
  t.after(h.stop);
  db.user.isPro = false;

  let r = await call("POST", "/api/wichteltuer/plans", { title: "Wichtel", elfName: "Pixi", year: 2026, children: [{ name: "Mia", age: 5 }], autoplan: true });
  assert.equal(r.status, 201);
  assert.equal(r.d.isPro, false);
  assert.deepEqual(r.d.features, { ideas: false, letters: false, shopping: false });
  assert.equal(r.d.stats.planned, 0, "autoplan needs the library");
  assert.deepEqual(r.d.shopping, []);
  const share = r.d.shareLink.split("/").pop();
  const kid = r.d.kidLink.split("/").pop();
  r = await call("GET", "/api/wichteltuer/plans");
  assert.equal(r.d[0].isPro, false);

  for (const [method, p, body] of [
    ["GET", "/ideas"], ["GET", "/letters/templates"], ["POST", "/autoplan", {}],
    ["PUT", "/days/2026-12-03", { ideaId: "nikolaus" }], ["PUT", "/days/2026-12-03", { title: "x", letter: "Hallo" }],
    ["POST", "/letters/render", { templateId: "ankunft" }], ["POST", "/post", { text: "Hallo Mia" }],
    ["PUT", "/shopping/check", { key: "mehl", checked: true }], ["POST", "/shopping/custom", { text: "Batterien" }], ["POST", "/shopping/clear-checked", {}],
  ]) {
    r = await anon(method, `/api/wichteltuer/s/${share}${p}`, body);
    assert.equal(r.status, 402, `${method} ${p} is PRO`);
    assert.equal(r.d.pro, true);
  }

  // Own ideas, notes, photos, the kids' page and their letters stay free.
  r = await anon("PUT", `/api/wichteltuer/s/${share}/days/2026-12-03`, { title: "Mehlspuren", category: "streich", materials: ["Mehl"], note: "abends" });
  assert.equal(r.status, 200);
  assert.equal(r.d.days[2].entry.title, "Mehlspuren");
  assert.deepEqual(r.d.shopping, [], "no shopping list without PRO");
  r = await anon("POST", `/api/wichteltuer/k/${kid}/letters`, { text: "Lieber Pixi" });
  assert.equal(r.status, 201);
  r = await anon("GET", `/api/wichteltuer/s/${share}`);
  assert.equal(r.d.unreadPost, 1);

  // The upgrade (Stripe webhook) unlocks it for everybody with the link.
  await db.updateElfPlan(r.d.id, (p) => { p.isPro = true; return p; });
  r = await anon("GET", `/api/wichteltuer/s/${share}`);
  assert.equal(r.d.isPro, true);
  assert.deepEqual(r.d.features, { ideas: true, letters: true, shopping: true });
  assert.ok(r.d.shopping.some((i) => i.key === "mehl"));
  r = await anon("GET", `/api/wichteltuer/s/${share}/ideas`);
  assert.equal(r.d.ideas.length > 50, true);
  r = await anon("POST", `/api/wichteltuer/s/${share}/autoplan`, {});
  assert.equal(r.d.stats.planned, 24);
  r = await anon("POST", `/api/wichteltuer/s/${share}/post`, { text: "Hallo Mia" });
  assert.equal(r.status, 201);
});
