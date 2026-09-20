// Children's page of the Wichteltür: the door, a candle countdown, letters
// from the elf, reactions, voice messages and a way to write back. Served at /k/:token.
const token = window.location.pathname.split("/").filter(Boolean)[1] || "";
const API = `/api/wichteltuer/k/${encodeURIComponent(token)}`;
const app = document.getElementById("app");
let data = null;
let childId = null;
let recorder = null;
let chunks = [];
let recTimer = null;
try { childId = localStorage.getItem(`wichteltuer_kid_${token}`); } catch (_) {}

const esc = (s) => UI.esc(s);
function formatDate(iso) {
  const [y, m, d] = String(iso).split("-");
  return `${Number(d)}.${Number(m)}.`;
}
async function req(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (isForm) opts.body = body;
    else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  }
  const r = await fetch(`${API}${path}`, opts);
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `Fehler ${r.status}`);
  return json;
}
const haptic = (s) => { if (typeof window.nativeHaptic === "function") window.nativeHaptic(s); };
const doorHtml = (character) => `<div class="t-door t-door--${esc(character)} ${data.arrived && !data.gone ? "" : "is-closed"}" aria-hidden="true"><div class="t-door__frame"></div><div class="t-door__window"><span class="t-door__eyes"></span></div><div class="t-door__knob"></div><div class="t-door__wreath"></div><div class="t-door__sign">Psst!</div><div class="t-door__sock"></div><div class="t-door__mat"></div></div>`;
const canRecord = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

function candles() {
  const d = data;
  const lit = d.gone ? 24 : d.arrived ? d.dayNumber : 0;
  return `<div class="t-candles" aria-label="${lit} von 24 Kerzen brennen">${Array.from({ length: 24 }, (_, i) => `<span class="t-candle ${i < lit ? "is-lit" : ""} ${i + 1 === lit && !d.gone ? "is-today" : ""}"></span>`).join("")}</div>`;
}

function render() {
  const d = data;
  const elf = d.elf.name;
  const status = d.gone ? `${elf} ist wieder am Nordpol. Bis nächstes Jahr!` : d.arrived ? `Heute ist der ${d.dayNumber}. Dezember.` : `${elf} kommt am 1. Dezember.`;
  const myChild = d.children.find((c) => c.id === childId) || null;
  const R = d.reactions || { heart: "❤️", laugh: "😂", wow: "😮" };
  const myReaction = (l) => (l.reactions || []).find((r) => (r.childId || null) === (childId || null))?.kind || null;
  app.innerHTML = `
    <div class="w-card text-center">
      ${doorHtml(d.elf.character)}
      <p class="text-xs text-amber-300 uppercase tracking-widest font-semibold mt-8">Hier wohnt</p>
      <h1 class="t-big">${esc(elf)}</h1>
      <p class="text-lg text-slate-200 mt-2">${esc(status)}</p>
      ${!d.gone ? `<div class="t-count t-count--big mt-4"><b>${d.daysLeft}</b><span>${d.daysLeft === 1 ? "Mal schlafen bis Weihnachten" : "Mal schlafen bis Weihnachten"}</span></div>` : ""}
      ${candles()}
    </div>

    ${d.hint ? `<div class="w-card t-hint"><p class="text-xs text-amber-200 uppercase tracking-widest font-semibold">Ein Tipp von ${esc(elf)}</p><p class="mt-1">${esc(d.hint.text)}</p></div>` : ""}

    ${d.children.length > 1 ? `<div class="w-card"><p class="text-center text-sm text-slate-300 mb-2">Wer bist du?</p><div class="flex flex-wrap justify-center gap-2" id="who">${d.children.map((c) => `<button type="button" class="t-kid-btn ${c.id === childId ? "is-active" : ""}" data-child="${esc(c.id)}">${esc(c.name)}</button>`).join("")}</div></div>` : ""}

    <div class="w-card">
      <h2 class="w-title text-xl"><i data-icon="mail"></i> Post von ${esc(elf)}</h2>
      <div class="space-y-4 mt-3" id="letters">
        ${d.letters.length ? d.letters.map((l) => l.from === "elf"
          ? `<div class="t-letter t-letter--elf">${l.photo ? `<img src="${esc(l.photo)}" alt="" style="width:100%;border-radius:8px;margin-bottom:8px">` : ""}${esc(l.text)}<small>${esc(elf)} · ${formatDate(l.date)}</small>
              ${!d.gone ? `<div class="t-react">${Object.entries(R).map(([k, emoji]) => `<button type="button" class="${myReaction(l) === k ? "is-on" : ""}" data-react="${k}" data-letter="${esc(l.id)}" aria-label="${k}">${emoji}</button>`).join("")}</div>` : ""}
              ${(l.reactions || []).length ? `<div class="t-react-list">${l.reactions.map((r) => `<span>${r.emoji} ${esc(r.childName || "")}</span>`).join("")}</div>` : ""}</div>`
          : l.kind === "voice"
            ? `<div class="t-letter t-letter--kid"><b><i data-icon="mic"></i> Sprachnachricht</b><audio controls preload="none" src="${esc(l.audio)}" class="t-audio mt-2"></audio><small>${esc(l.childName || "Ihr")} an ${esc(elf)} · ${formatDate(l.date)}</small></div>`
            : `<div class="t-letter t-letter--kid">${esc(l.text)}<small>${esc(l.childName || "Ihr")} an ${esc(elf)} · ${formatDate(l.date)}</small></div>`).join("")
          : `<div class="ui-empty"><div class="ui-empty__art"><i data-icon="mail"></i></div>Noch keine Post. ${d.arrived ? "Schreibt dem Wichtel doch zuerst!" : "Ab dem 1. Dezember geht es los."}</div>`}
      </div>
    </div>

    ${!d.gone ? `<div class="w-card">
      <h2 class="w-title text-xl text-center"><i data-icon="mic"></i> Dem Wichtel etwas sagen</h2>
      <div class="t-voice mt-3">
        ${canRecord() ? `<button type="button" class="t-voice__btn" id="rec-btn" aria-label="Aufnehmen"><i data-icon="mic"></i></button><p class="text-sm text-slate-300" id="rec-hint">Halten und sprechen – loslassen zum Schicken.</p>`
          : `<label class="w-btn w-btn--primary"><i data-icon="mic"></i> Aufnahme schicken<input type="file" accept="audio/*" capture class="sr-only" id="rec-file"></label><p class="text-xs text-slate-400">Nimm mit dem Handy oder Tablet etwas auf und schicke es ${esc(elf)}.</p>`}
      </div>
    </div>
    <form id="write" class="w-card space-y-3">
      <h2 class="w-title text-xl"><i data-icon="pen-line"></i> Dem Wichtel schreiben</h2>
      <textarea name="text" rows="3" maxlength="800" required class="w-input" placeholder="Lieber ${esc(elf)} …"></textarea>
      <button class="w-btn w-btn--primary w-full"><i data-icon="mail"></i> Abschicken</button>
    </form>` : ""}
    <p class="text-center text-xs text-slate-500 pb-6">Wichteltür · Advently</p>`;
  if (!myChild && d.children.length === 1) childId = d.children[0].id;
  const who = document.getElementById("who");
  if (who) who.addEventListener("click", (e) => {
    const b = e.target.closest("[data-child]");
    if (!b) return;
    childId = b.dataset.child;
    try { localStorage.setItem(`wichteltuer_kid_${token}`, childId); } catch (_) {}
    haptic("light");
    render();
  });
  const needChild = () => { if (d.children.length > 1 && !childId) { UI.toast("Wer bist du? Tippe zuerst auf deinen Namen.", { error: true }); document.getElementById("who")?.scrollIntoView({ block: "center" }); return true; } return false; };
  document.getElementById("letters").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-react]");
    if (!b || needChild()) return;
    try {
      haptic("success");
      data = await req("POST", "/reactions", { letterId: b.dataset.letter, kind: b.dataset.react, childId });
      render();
      UI.toast(`${b.textContent.trim()} ${data.elf.name} freut sich!`);
    } catch (err) { UI.toast(err.message, { error: true }); }
  });
  const form = document.getElementById("write");
  if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (needChild()) return;
    try {
      data = await req("POST", "/letters", { childId, text: form.elements.text.value });
      haptic("success");
      render();
      UI.toast("Der Brief liegt vor der Wichteltür.");
    } catch (err) {
      UI.toast(err.message, { error: true });
    }
  });
  bindVoice(needChild);
}

// Hold to record, release to send. Falls back to a file input where recording is not possible.
function bindVoice(needChild) {
  const btn = document.getElementById("rec-btn");
  const file = document.getElementById("rec-file");
  if (file) file.addEventListener("change", () => { if (file.files[0]) sendVoice(file.files[0], needChild); });
  if (!btn) return;
  const hint = document.getElementById("rec-hint");
  const start = async (e) => {
    e.preventDefault();
    if (recorder || needChild()) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks = [];
      recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        recorder = null;
        btn.classList.remove("is-rec");
        hint.textContent = "Halten und sprechen – loslassen zum Schicken.";
        if (blob.size > 2000) sendVoice(blob, needChild); else UI.toast("Das war zu kurz – halte den Knopf gedrückt, während du sprichst.", { error: true });
      };
      recorder.start();
      btn.classList.add("is-rec");
      hint.textContent = "Ich höre zu … loslassen zum Schicken.";
      haptic("medium");
      recTimer = setTimeout(stop, 60000);
    } catch (_) {
      UI.toast("Das Mikrofon ist nicht erlaubt. Frag Mama oder Papa.", { error: true });
    }
  };
  const stop = () => { clearTimeout(recTimer); if (recorder && recorder.state === "recording") recorder.stop(); };
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointerleave", stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}
async function sendVoice(blob, needChild) {
  if (needChild()) return;
  const fd = new FormData();
  const ext = /mp4|m4a/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : /mpeg/.test(blob.type) ? "mp3" : "webm";
  fd.append("audio", blob, `aufnahme.${ext}`);
  fd.append("childId", childId || "");
  UI.toast("Schicke die Nachricht …");
  try {
    data = await req("POST", "/voice", fd, true);
    haptic("success");
    render();
    UI.toast(`${data.elf.name} hört sich das heute Nacht an.`);
  } catch (err) { UI.toast(err.message, { error: true }); }
}

(async () => {
  try {
    data = await req("GET", "");
    document.title = `${data.elf.name} – Wichtelpost`;
    render();
    setInterval(async () => {
      if (document.hidden || recorder || document.activeElement?.tagName === "TEXTAREA") return;
      try { const fresh = await req("GET", ""); if (JSON.stringify(fresh) !== JSON.stringify(data)) { data = fresh; render(); } } catch (_) {}
    }, 60000);
  } catch (err) {
    app.innerHTML = `<div class="w-card text-center"><div class="ui-empty__art"><i data-icon="eye-off"></i></div><h1 class="w-title text-xl mb-2">Diese Tür ist verschlossen</h1><p class="text-slate-400">${esc(err.message)}</p></div>`;
  }
})();
