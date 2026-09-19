// Children's page of the Wichteltür: the door, a countdown, letters from the
// elf and a way to write back. Served at /k/:token.
const token = window.location.pathname.split("/").filter(Boolean)[1] || "";
const API = `/api/wichteltuer/k/${encodeURIComponent(token)}`;
const app = document.getElementById("app");
let data = null;
let childId = null;
try { childId = localStorage.getItem(`wichteltuer_kid_${token}`); } catch (_) {}

const esc = (s) => UI.esc(s);
function formatDate(iso) {
  const [y, m, d] = String(iso).split("-");
  return `${Number(d)}.${Number(m)}.`;
}
async function req(method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `Fehler ${r.status}`);
  return json;
}

function render() {
  const d = data;
  const elf = d.elf.name;
  const status = d.gone
    ? `${elf} ist zurück am Nordpol. Bis nächstes Jahr!`
    : d.arrived
      ? `Heute ist der ${d.dayNumber}. Dezember. ${elf} wohnt bei euch!`
      : `${elf} kommt am 1. Dezember zu euch.`;
  const myChild = d.children.find((c) => c.id === childId) || null;
  app.innerHTML = `
    <div class="w-card text-center">
      <div class="t-door ${d.arrived && !d.gone ? "" : "is-closed"}" aria-hidden="true"><div class="t-door__frame"></div><div class="t-door__window"></div><div class="t-door__knob"></div><div class="t-door__mat"></div></div>
      <p class="text-xs text-amber-300 uppercase tracking-widest font-semibold mt-8">Hier wohnt</p>
      <h1 class="t-big">${esc(elf)}</h1>
      <p class="text-slate-300 mt-2">${esc(status)}</p>
      ${d.elf.doorPlace ? `<p class="text-xs text-slate-500 mt-1">Seine Tür findet ihr: ${esc(d.elf.doorPlace)}</p>` : ""}
      ${!d.gone ? `<div class="t-count mt-4"><b>${d.daysLeft}</b><span>${d.daysLeft === 1 ? "Tag" : "Tage"} bis Weihnachten</span></div>` : ""}
    </div>

    <div class="w-card">
      <h2 class="w-title text-xl"><i data-icon="mail"></i> Post von ${esc(elf)}</h2>
      <div class="space-y-3 mt-3" id="letters">
        ${d.letters.length ? d.letters.map((l) => l.from === "elf"
          ? `<div class="t-letter t-letter--elf">${l.photo ? `<img src="${esc(l.photo)}" alt="" style="width:100%;border-radius:8px;margin-bottom:8px">` : ""}${esc(l.text)}<small>${esc(elf)} · ${formatDate(l.date)}</small></div>`
          : `<div class="t-letter t-letter--kid">${esc(l.text)}<small>${esc(l.childName || "Ihr")} an ${esc(elf)} · ${formatDate(l.date)}</small></div>`).join("")
          : `<div class="ui-empty"><div class="ui-empty__art"><i data-icon="mail"></i></div>Noch keine Post. ${d.arrived ? "Schreibt dem Wichtel doch zuerst!" : "Ab dem 1. Dezember geht es los."}</div>`}
      </div>
    </div>

    ${!d.gone ? `<form id="write" class="w-card space-y-3">
      <h2 class="w-title text-xl"><i data-icon="pen-line"></i> Dem Wichtel schreiben</h2>
      ${d.children.length > 1 ? `<div class="flex flex-wrap gap-2" id="who">${d.children.map((c) => `<button type="button" class="t-kid-btn ${c.id === childId ? "is-active" : ""}" data-child="${esc(c.id)}">${esc(c.name)}</button>`).join("")}</div>` : ""}
      <textarea name="text" rows="3" maxlength="800" required class="w-input" placeholder="Lieber ${esc(elf)} …"></textarea>
      <button class="w-btn w-btn--primary w-full"><i data-icon="mail"></i> Abschicken</button>
      <p class="text-xs text-slate-500 text-center">${esc(elf)} liest nachts und antwortet, wenn er Zeit hat.</p>
    </form>` : ""}
    <p class="text-center text-xs text-slate-500 pb-6">Wichteltür · Advently</p>`;
  if (!myChild && d.children.length === 1) childId = d.children[0].id;
  const who = document.getElementById("who");
  if (who) who.addEventListener("click", (e) => {
    const b = e.target.closest("[data-child]");
    if (!b) return;
    childId = b.dataset.child;
    try { localStorage.setItem(`wichteltuer_kid_${token}`, childId); } catch (_) {}
    who.querySelectorAll("button").forEach((x) => x.classList.toggle("is-active", x === b));
  });
  const form = document.getElementById("write");
  if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (d.children.length > 1 && !childId) return UI.toast("Wer schreibt? Tippe zuerst auf deinen Namen.", { error: true });
    try {
      data = await req("POST", "/letters", { childId, text: form.elements.text.value });
      if (typeof window.nativeHaptic === "function") window.nativeHaptic("success");
      render();
      UI.toast("Der Brief liegt vor der Wichteltür.");
    } catch (err) {
      UI.toast(err.message, { error: true });
    }
  });
}

(async () => {
  try {
    data = await req("GET", "");
    document.title = `${data.elf.name} – Wichtelpost`;
    render();
    setInterval(async () => {
      if (document.hidden || document.activeElement?.tagName === "TEXTAREA") return;
      try { const fresh = await req("GET", ""); if (JSON.stringify(fresh) !== JSON.stringify(data)) { data = fresh; render(); } } catch (_) {}
    }, 60000);
  } catch (err) {
    app.innerHTML = `<div class="w-card text-center"><div class="ui-empty__art"><i data-icon="eye-off"></i></div><h1 class="w-title text-xl mb-2">Diese Tür ist verschlossen</h1><p class="text-slate-400">${esc(err.message)}</p></div>`;
  }
})();
