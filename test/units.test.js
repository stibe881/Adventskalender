const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const SRC = path.join(__dirname, "..", "server", "src");
const { createStubDb, install } = require("./helpers/app");

// Keep the real db module (and its MySQL pool) out of unit tests.
install(createStubDb());

test("drawAssignments respects exclusions and finds hard cycles", () => {
  const { drawAssignments } = require(path.join(SRC, "utils/wichtel"));
  const ids = ["a", "b", "c", "d"];
  for (let i = 0; i < 50; i++) {
    const map = drawAssignments(ids, [["a", "b"], ["c", "d"]]);
    assert.ok(map, "a valid draw exists");
    assert.ok(ids.every((id) => map[id] !== id));
    assert.equal(new Set(Object.values(map)).size, 4);
    assert.ok(map.a !== "b" && map.b !== "a" && map.c !== "d" && map.d !== "c");
  }
  assert.equal(drawAssignments(["a", "b", "c"], [["a", "b"], ["a", "c"]]), null, "impossible exclusions");
  assert.equal(drawAssignments(["a"]), null);
});

test("migrations complete old records and map legacy emoji reactions", () => {
  const { normalizeReactions, completeWichtelGroup } = require(path.join(SRC, "migrations"));
  const cal = { days: [{ day: 1, feedback: { reactions: ["❤️", "party", "😂"] } }, { day: 2 }] };
  assert.equal(normalizeReactions(cal), true);
  assert.deepEqual(cal.days[0].feedback.reactions, ["heart", "party", "laugh"]);
  assert.equal(normalizeReactions(cal), false, "idempotent");
  const group = { participants: [{ id: "p1", notify: { email: false }, giftStatus: { method: "post", steps: ["bought"] } }, { id: "p2" }] };
  assert.equal(completeWichtelGroup(group), true);
  assert.deepEqual(group.thanks, []);
  assert.equal(group.participants[0].notify.push, true);
  assert.equal(group.participants[0].notify.email, false);
  assert.deepEqual(group.participants[0].giftStatus, { method: "post", steps: ["bought"], updatedAt: null });
  assert.deepEqual(group.participants[1].notify, { email: true, push: true });
  assert.deepEqual(group.participants[1].lastRead, {});
  assert.equal(completeWichtelGroup(group), false);
});

test("link preview parses Open Graph data and blocks private networks", () => {
  const { parsePreview, isPrivateAddress } = require(path.join(SRC, "routes/wichteln/preview"));
  const html = `<html><head><title>Fallback &amp; Co</title><meta property="og:title" content="Sch&#246;nes Buch"><meta content="/img.jpg" property="og:image"><meta property="product:price:amount" content="19.90"><meta property="product:price:currency" content="CHF"></head></html>`;
  assert.deepEqual(parsePreview(html, "https://shop.example.com/x"), { title: "Schönes Buch", image: "https://shop.example.com/img.jpg", price: "19.90 CHF" });
  assert.equal(parsePreview("<html></html>", "https://shop.example.com/x").title, "shop.example.com");
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "169.254.1.1", "::1", "fd00::1"]) assert.equal(isPrivateAddress(ip), true, ip);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
});

test("buildIcs writes a timed event with alarm", () => {
  const { buildIcs } = require(path.join(SRC, "utils/wichtel"));
  const ics = buildIcs({ uid: "x@advently", title: "Wichteln: Team", description: "Budget: 20", date: "2026-12-18", time: "17:30", location: "Küche, Bern" });
  assert.match(ics, /DTSTART:20261218T173000/);
  assert.match(ics, /DTEND:20261218T193000/);
  assert.match(ics, /LOCATION:Küche\\, Bern/);
  assert.match(ics, /TRIGGER:-P1D/);
});

test("Schweizer Modus converts door texts both ways and leaves links alone", () => {
  const { convertText, convertDays } = require(path.join(SRC, "utils/swiss"));
  assert.equal(convertText("Der Weihnachtsmann kommt. Ein Brief vom Weihnachtsmann für den Weihnachtsmann-Fan. Am Nikolaustag war der Nikolaus da.", true),
    "Das Christkind kommt. Ein Brief vom Christkind für das Christkind-Fan. Am Samichlaustag war der Samichlaus da.");
  assert.equal(convertText("Das Christkind und der Samichlaus.", false), "Der Weihnachtsmann und der Nikolaus.");
  const days = [{ day: 1, content: { message: "Grüße vom Weihnachtsmann", sender: "Der Weihnachtsmann", url: "https://weihnachtsmann.example/Weihnachtsmann", images: ["Weihnachtsmann.png"] } }, { day: 2, content: null }];
  convertDays(days, true);
  assert.equal(days[0].content.sender, "Das Christkind");
  assert.equal(days[0].content.url, "https://weihnachtsmann.example/Weihnachtsmann", "links stay untouched");
  assert.deepEqual(days[0].content.images, ["Weihnachtsmann.png"]);
  convertDays(days, false);
  assert.equal(days[0].content.message, "Grüße vom Weihnachtsmann");
});
