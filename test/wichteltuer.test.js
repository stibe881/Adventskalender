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

test("Wichteltür: Schweizer Modus – Christkind and Samichlaus in ideas, templates and written letters, both ways", async (t) => {
  const h = await startApp();
  h.app.use("/api/wichteltuer", require(path.join(SRC, "routes/wichteltuer")));
  const { call, anon } = h;
  t.after(h.stop);

  let r = await call("POST", "/api/wichteltuer/plans", { title: "Wichtel", elfName: "Pixi", year: 2026, children: [{ name: "Mia", age: 5 }], autoplan: true, swissMode: true });
  assert.equal(r.status, 201);
  assert.equal(r.d.swissMode, true);
  const share = r.d.shareLink.split("/").pop();
  const day = (d, n) => d.days.find((x) => x.date === `2026-12-${n}`).entry;
  assert.match(day(r.d, "06").title, /Samichlaus/);
  assert.match(day(r.d, "06").letter, /Samichlaus/);
  assert.match(day(r.d, "24").letter, /Christkind/);
  assert.doesNotMatch(day(r.d, "24").letter, /Weihnachtsmann/);

  r = await anon("GET", `/api/wichteltuer/s/${share}/ideas`);
  assert.match(r.d.ideas.find((i) => i.id === "nikolaus").text, /Samichlaus/);
  r = await anon("GET", `/api/wichteltuer/s/${share}/letters/templates`);
  assert.match(r.d.templates.find((i) => i.id === "lob").text, /dem Christkind/);
  r = await anon("POST", `/api/wichteltuer/s/${share}/letters/render`, { templateId: "abschied" });
  assert.match(r.d.text, /dem Christkind erzählt/);
  r = await anon("PUT", `/api/wichteltuer/s/${share}/days/2026-12-10`, { ideaId: "wunschzettel" });
  assert.match(day(r.d, "10").text, /für das Christkind/);

  // Switching back rewrites what is already there.
  r = await anon("POST", `/api/wichteltuer/s/${share}/post`, { text: "Das Christkind lässt grüssen." });
  r = await anon("PUT", `/api/wichteltuer/s/${share}/settings`, { swissMode: false });
  assert.equal(r.d.swissMode, false);
  assert.match(day(r.d, "24").letter, /dem Weihnachtsmann/);
  assert.match(day(r.d, "06").title, /Nikolaus/);
  assert.match(r.d.post[0].text, /Der Weihnachtsmann lässt/);
  r = await anon("GET", `/api/wichteltuer/s/${share}/ideas`);
  assert.match(r.d.ideas.find((i) => i.id === "nikolaus").text, /Nikolaus/);
});

test("Wichteltür: planning helpers – sets, duty rule, steps, own ideas, stock, budget, hints, reactions, voice, read-only link, ICS, rollover, undo", async (t) => {
  const h = await startApp();
  h.app.use("/api/wichteltuer", require(path.join(SRC, "routes/wichteltuer")));
  const { call, anon, db, mails, pushed } = h;
  t.after(h.stop);

  let r = await call("POST", "/api/wichteltuer/plans", { title: "Wichtel", elfName: "Pixi", year: 2026, children: [{ name: "Mia", age: 4 }] });
  const planId = r.d.id;
  const share = r.d.shareLink.split("/").pop();
  const kid = r.d.kidLink.split("/").pop();
  const S = `/api/wichteltuer/s/${share}`;

  // Ready-made month plan: "wenig Aufwand" keeps weekdays short.
  r = await anon("GET", `${S}/ideas`);
  assert.ok(r.d.sets.some((s) => s.id === "wenig-aufwand"));
  r = await anon("POST", `${S}/autoplan`, { set: "wenig-aufwand" });
  assert.equal(r.d.stats.planned, 24);
  const heavy = r.d.days.filter((x) => !x.weekend && !["ankunft", "nikolaus", "abschied"].includes(x.entry.ideaId) && x.entry.minutes > 10);
  assert.equal(heavy.length, 0, "no long ideas on weekdays in the low-effort set");

  // Duty rule: alternate between two parents, only open days.
  r = await anon("PUT", `${S}/settings`, { parents: [{ id: r.d.parents[0].id, name: "Stefan" }, { name: "Nina" }] });
  const [stefan, nina] = r.d.parents.map((p) => p.id);
  r = await anon("PUT", `${S}/days/2026-12-03`, { assignee: nina });
  r = await anon("POST", `${S}/assign`, { rule: { mode: "alternate" } });
  assert.equal(r.d.assignRule.mode, "alternate");
  assert.equal(r.d.days[0].entry.assignee, stefan);
  assert.equal(r.d.days[1].entry.assignee, nina);
  assert.equal(r.d.days[2].entry.assignee, nina, "hand-picked day stays");
  r = await anon("POST", `${S}/assign`, { rule: { mode: "weekdays", weekdays: { [stefan]: [1, 2, 3], [nina]: [4, 5, 6, 0] } }, all: true });
  const tue = r.d.days.find((x) => x.weekday === "Di");
  const sat = r.d.days.find((x) => x.weekday === "Sa");
  assert.equal(tue.entry.assignee, stefan);
  assert.equal(sat.entry.assignee, nina);

  // Steps, price, kid hint on a day; budget in the settings.
  r = await anon("PUT", `${S}/days/2026-12-05`, { steps: ["Teig vorbereiten", "Zettel schreiben"], price: "12.50", kidHint: "Schaut mal in die Küche!" });
  const d5 = r.d.days.find((x) => x.date === "2026-12-05").entry;
  assert.equal(d5.steps.length, 2);
  assert.equal(d5.price, 12.5);
  assert.equal(d5.kidHint, "Schaut mal in die Küche!");
  r = await anon("PUT", `${S}/days/2026-12-05/steps/${d5.steps[0].id}`, { done: true });
  assert.equal(r.d.days.find((x) => x.date === "2026-12-05").entry.steps[0].done, true);
  r = await anon("PUT", `${S}/settings`, { budget: "80" });
  assert.equal(r.d.stats.budget, 80);
  assert.equal(r.d.stats.spent, 12.5);

  // Own idea saved from a day, then planned on another day and kept in the library.
  r = await anon("POST", `${S}/ideas`, { fromDate: "2026-12-05", title: "Mehlspuren deluxe", letter: "Hallo {kinder}!" });
  const own = r.d.customIdeas[0];
  assert.match(own.id, /^own-/);
  assert.equal(own.title, "Mehlspuren deluxe");
  assert.deepEqual(own.steps, ["Teig vorbereiten", "Zettel schreiben"]);
  r = await anon("PUT", `${S}/days/2026-12-20`, { ideaId: own.id });
  const d20 = r.d.days.find((x) => x.date === "2026-12-20").entry;
  assert.equal(d20.title, "Mehlspuren deluxe");
  assert.equal(d20.letter, "Hallo Mia!");
  r = await anon("GET", `${S}/ideas`);
  assert.equal(r.d.ideas[0].id, own.id, "own ideas come first");

  // Stock: what we already have leaves the open list.
  r = await anon("GET", S);
  const item = r.d.shopping.find((i) => !i.custom);
  r = await anon("PUT", `${S}/shopping/have`, { key: item.key, have: true });
  assert.equal(r.d.shopping.find((i) => i.key === item.key).have, true);

  // Kids: reaction on the arrival letter, voice message, morning hint.
  const { kidView } = require(path.join(SRC, "routes/wichteltuer/shared"));
  await db.updateElfPlan(planId, (p) => { p.days["2026-12-01"].letterVisibleToKids = true; return p; });
  r = await anon("GET", `/api/wichteltuer/k/${kid}`);
  const kv = kidView(await db.getElfPlanById(planId), new Date("2026-12-05T09:00:00+01:00"));
  assert.equal(kv.hint.text, "Schaut mal in die Küche!");
  assert.equal(kidView(await db.getElfPlanById(planId), new Date("2026-12-05T05:00:00+01:00")).hint, null, "not before six");
  assert.equal(kidView(await db.getElfPlanById(planId), new Date("2026-12-06T09:00:00+01:00")).hint, null, "only on the day itself");
  const letter = kv.letters.find((l) => l.id === "day-2026-12-01");
  assert.ok(letter, "arrival letter visible");
  const childId = kv.children[0].id;
  r = await anon("POST", `/api/wichteltuer/k/${kid}/reactions`, { letterId: "day-2026-12-01", kind: "heart", childId });
  assert.equal(r.status, 201);
  r = await anon("POST", `/api/wichteltuer/k/${kid}/reactions`, { letterId: "day-2026-12-01", kind: "laugh", childId });
  const plan = await db.getElfPlanById(planId);
  assert.equal(plan.post.filter((l) => l.kind === "reaction").length, 1, "a new tap replaces the old reaction");
  assert.equal(kidView(plan, new Date("2026-12-05T09:00:00+01:00")).letters.find((l) => l.id === "day-2026-12-01").reactions[0].emoji, "😂");
  r = await anon("GET", S);
  assert.equal(r.d.unreadPost, 1);
  assert.equal(r.d.post[0].kind, "reaction");
  assert.match(r.d.post[0].refLabel, /1\. Dezember/);
  const fd = new FormData();
  fd.append("audio", new Blob([new Uint8Array(3000)], { type: "audio/webm" }), "aufnahme.webm");
  fd.append("childId", childId);
  const vr = await fetch(`${h.base}/api/wichteltuer/k/${kid}/voice`, { method: "POST", body: fd });
  assert.equal(vr.status, 201);
  const vd = await vr.json();
  assert.ok(vd.letters.some((l) => l.kind === "voice" && l.audio.startsWith("/uploads/elf-voice-")));
  assert.ok(pushed.length === 0 && mails.length === 0, "no devices yet, nothing sent");

  // Read-only link.
  r = await anon("GET", S);
  assert.equal(r.d.viewLink, null);
  r = await anon("POST", `${S}/rotate-view-link`);
  const view = r.d.viewLink.split("/").pop();
  r = await anon("GET", `/api/wichteltuer/v/${view}`);
  assert.equal(r.status, 200);
  assert.equal(r.d.elf.name, "Pixi");
  assert.ok(r.d.days.length === 24 && r.d.post.length >= 2);
  assert.equal(r.d.shareLink, undefined, "no links leak");
  r = await anon("DELETE", `${S}/view-link`);
  r = await anon("GET", `/api/wichteltuer/v/${view}`);
  assert.equal(r.status, 404);

  // ICS with an alarm the evening before.
  const ics = await fetch(`${h.base}${S}/plan.ics`);
  assert.equal(ics.status, 200);
  const text = await ics.text();
  assert.match(text, /DTSTART;VALUE=DATE:20261205/);
  assert.match(text, /TRIGGER:-PT240M/);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 24);

  // Undo: clear a day, restore it; delete a letter, restore it.
  const backup = (await anon("GET", S)).d.days.find((x) => x.date === "2026-12-05").entry;
  r = await anon("DELETE", `${S}/days/2026-12-05`);
  assert.equal(r.d.days.find((x) => x.date === "2026-12-05").entry, null);
  r = await anon("PUT", `${S}/days/2026-12-05/restore`, { entry: backup });
  const restored = r.d.days.find((x) => x.date === "2026-12-05").entry;
  assert.equal(restored.title, backup.title);
  assert.equal(restored.kidHint, backup.kidHint);
  assert.equal(restored.steps.length, 2);
  const postId = r.d.post.find((l) => l.kind === "voice").id;
  r = await anon("DELETE", `${S}/post/${postId}`);
  assert.ok(!r.d.post.some((l) => l.id === postId));
  r = await anon("POST", `${S}/post/${postId}/restore`);
  assert.ok(r.d.post.some((l) => l.id === postId));

  // Reminder mail carries the "Erledigt" link.
  await anon("PUT", `${S}/settings`, { notify: { time: "20:00", emails: ["nina@example.ch"] } });
  const { runElfReminders } = require(path.join(SRC, "cron"));
  await runElfReminders(new Date("2026-12-02T20:00:00+01:00"));
  assert.equal(mails.length, 1);
  assert.match(mails[0].html, /\?done=2026-12-03#tag-2026-12-03/);

  // Rollover to next year: family a year older, own ideas kept, plan empty.
  r = await call("POST", `/api/wichteltuer/plans/${planId}/rollover`, { year: 2027 });
  assert.equal(r.status, 201);
  assert.equal(r.d.year, 2027);
  assert.equal(r.d.children[0].age, 5);
  assert.equal(r.d.parents.length, 2);
  assert.equal(r.d.customIdeas[0].id, own.id);
  assert.equal(r.d.stats.planned, 0);
  assert.equal(r.d.assignRule.mode, "weekdays");
  assert.equal(r.d.budget, 80);
  assert.notEqual(r.d.id, planId);
  r = await call("GET", "/api/wichteltuer/plans");
  assert.equal(r.d.length, 2);
  assert.equal(r.d[0].year, 2027);
});
