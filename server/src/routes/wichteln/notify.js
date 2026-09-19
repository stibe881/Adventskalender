/* Every notification of the Wichteln module in one place: what is said by
 * e-mail (subject, text, html) and by push (title, body) for each event. */
const db = require("../../db");
const { sendMail, layout, escapeHtml } = require("../../services/mail");
const { participantLink, eventLine, findParticipant } = require("./shared");

const esc = escapeHtml;

/* ctx: { group, p (recipient of the notification), ...event specific } */
const EVENTS = {
  invitation: ({ group, p }) => {
    const intro = group.organizerName ? `${group.organizerName} lädt dich zum Wichteln ein.` : "Du bist zum Wichteln eingeladen.";
    const details = [group.motto && `Motto: ${group.motto}`, group.budget && `Budget: ${group.budget}`, group.eventDate && `Bescherung: ${eventLine(group)}`].filter(Boolean);
    return {
      subject: "Einladung zum Wichteln",
      text: `Hallo ${p.name}!\n\n${intro}\nRunde: ${group.title}\n${details.join("\n")}\n\nÜber deinen persönlichen Link kannst du deinen Wunschzettel pflegen und siehst nach der Auslosung, wen du beschenkst.`,
      html: `<p>Hallo ${esc(p.name)}!</p><p>${esc(intro)}</p><p><strong>${esc(group.title)}</strong></p><ul>${details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul><p>Über deinen persönlichen Link kannst du deinen Wunschzettel pflegen und siehst nach der Auslosung, wen du beschenkst.</p>`,
      push: `${intro} Tippe, um beizutreten.`,
      anchor: "",
    };
  },
  draw: ({ group, p }) => {
    const target = findParticipant(group, p.assignedTo);
    return {
      subject: "Dein Los ist da",
      text: `Hallo ${p.name}!\n\nDie Auslosung ist erledigt. Du beschenkst: ${target?.name}\n${group.budget ? `Budget: ${group.budget}\n` : ""}${group.eventDate ? `Bescherung: ${eventLine(group)}\n` : ""}\nPsst – das bleibt unter uns.`,
      html: `<p>Hallo ${esc(p.name)}!</p><p>Die Auslosung ist erledigt. Du beschenkst:</p><p style="font-size:22px;font-weight:700;color:#34d399">${esc(target?.name)}</p>${group.budget ? `<p>Budget: ${esc(group.budget)}</p>` : ""}${group.eventDate ? `<p>Bescherung: ${esc(eventLine(group))}</p>` : ""}<p>Psst – das bleibt unter uns.</p>`,
      push: "Die Auslosung ist erledigt – tippe, um dein Wichtelkind zu sehen.",
      anchor: "#wichtelkind",
    };
  },
  approved: ({ p }) => ({
    subject: "Du bist dabei!",
    text: `Hallo ${p.name}!\n\nDer Organisator hat dich in die Wichtel-Runde aufgenommen.`,
    html: `<p>Hallo ${esc(p.name)}!</p><p>Der Organisator hat dich in die Wichtel-Runde aufgenommen.</p>`,
    push: "Du bist in der Wichtel-Runde aufgenommen.",
    anchor: "",
  }),
  dateChanged: ({ group, p }) => {
    const line = eventLine(group);
    return {
      subject: "Neuer Termin für die Bescherung",
      text: `Hallo ${p.name}!\n\nDer Termin für die Bescherung wurde geändert:\n${line}`,
      html: `<p>Hallo ${esc(p.name)}!</p><p>Der Termin für die Bescherung wurde geändert:</p><p><strong>${esc(line)}</strong></p>`,
      push: `Neuer Termin: ${line}`,
      anchor: "",
    };
  },
  wishlistChanged: ({ p, by }) => ({
    subject: "Wunschzettel aktualisiert",
    text: `Hallo ${p.name}!\n\n${by.name} hat den Wunschzettel geändert. Schau mal rein.`,
    html: `<p>Hallo ${esc(p.name)}!</p><p><strong>${esc(by.name)}</strong> hat den Wunschzettel geändert. Schau mal rein.</p>`,
    push: `${by.name} hat den Wunschzettel geändert.`,
    anchor: "#wichtelkind",
  }),
  message: ({ p, who, text }) => ({
    subject: "Neue anonyme Nachricht",
    text: `Hallo ${p.name}!\n\n${who} hat dir geschrieben:\n„${text}“\n\nAntworten kannst du direkt in deinem Wichtel-Bereich.`,
    html: `<p>Hallo ${esc(p.name)}!</p><p><strong>${esc(who)}</strong> hat dir geschrieben:</p><blockquote style="border-left:3px solid #34d399;padding-left:12px;color:#cbd5e1">${esc(text)}</blockquote><p>Antworten kannst du direkt in deinem Wichtel-Bereich.</p>`,
    push: `${who}: ${text.slice(0, 120)}`,
    anchor: "#chat",
  }),
  reminderTomorrow: ({ group, p }) => {
    const target = group.status !== "draft" ? findParticipant(group, p.assignedTo) : null;
    const line = eventLine(group);
    return {
      subject: "Morgen ist Bescherung!",
      text: `Hallo ${p.name}!\n\nMorgen ist es so weit: ${line}${target ? `\nDu beschenkst: ${target.name}` : ""}`,
      html: `<p>Hallo ${esc(p.name)}!</p><p>Morgen ist es so weit: <strong>${esc(line)}</strong></p>${target ? `<p>Du beschenkst: <strong>${esc(target.name)}</strong></p>` : ""}`,
      push: `Morgen ist Bescherung: ${line}`,
      anchor: "",
    };
  },
  giftReminder: ({ group, p }) => {
    const target = findParticipant(group, p.assignedTo);
    return {
      subject: "In einer Woche ist Bescherung",
      text: `Hallo ${p.name}!\n\nIn einer Woche ist Bescherung (${eventLine(group)}) und dein Geschenk für ${target?.name} steht noch auf null. Zeit, loszulegen!`,
      html: `<p>Hallo ${esc(p.name)}!</p><p>In einer Woche ist Bescherung (<strong>${esc(eventLine(group))}</strong>) und dein Geschenk für <strong>${esc(target?.name)}</strong> steht noch auf null. Zeit, loszulegen!</p>`,
      push: `Noch eine Woche – dein Geschenk für ${target?.name} wartet.`,
      anchor: "#wichtelkind",
    };
  },
  thanks: ({ p, by, text }) => ({
    subject: "Ein Dankeschön für die Runde",
    text: `Hallo ${p.name}!\n\n${by.name} hat sich bedankt:\n„${text}“`,
    html: `<p>Hallo ${esc(p.name)}!</p><p><strong>${esc(by.name)}</strong> hat sich bedankt:</p><blockquote style="border-left:3px solid #34d399;padding-left:12px;color:#cbd5e1">${esc(text)}</blockquote>`,
    push: `${by.name}: ${text.slice(0, 120)}`,
    anchor: "#rueckblick",
  }),
};

async function pushParticipant(group, p, title, body, url) {
  const subs = p.subscriptions || [];
  if (!subs.length || p.notify?.push === false) return;
  const { sendPushNotification } = require("../../push");
  const dead = [];
  for (const sub of subs) {
    try {
      await sendPushNotification(sub, { title: `${group.title}: ${title}`, body, url });
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) dead.push(sub.endpoint);
      else console.warn("[Wichteln] Push fehlgeschlagen:", err.message);
    }
  }
  if (dead.length) {
    await db.updateWichtelGroup(group.id, (g) => {
      const x = findParticipant(g, p.id);
      if (x) x.subscriptions = (x.subscriptions || []).filter((s) => !dead.includes(s.endpoint));
      return g;
    });
  }
}

/** Sends the e-mail and the push for one event to one participant. */
async function notify(event, ctx) {
  const build = EVENTS[event];
  if (!build) throw new Error(`Unbekanntes Ereignis: ${event}`);
  const { group, p } = ctx;
  if (!p) return false;
  const n = build(ctx);
  const link = participantLink(p);
  pushParticipant(group, p, n.subject, n.push, link + (n.anchor || "")).catch(() => {});
  if (!p.email || p.notify?.email === false) return false;
  const text = `${n.text}\n\nDein persönlicher Wichtel-Bereich (dein Link):\n${link}`;
  const html = layout(group.title, `${n.html}<p style="margin-top:20px"><a href="${link}" style="background:#059669;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Zum Wichtel-Bereich</a></p><p style="font-size:12px;color:#94a3b8">Dein persönlicher Link: <a href="${link}" style="color:#6ee7b7">${link}</a></p>`);
  return sendMail({ to: p.email, subject: `[${group.title}] ${n.subject}`, text, html });
}

module.exports = { notify, EVENTS };
