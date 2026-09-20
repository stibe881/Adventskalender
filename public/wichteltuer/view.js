// Read-only page for grandparents and helpers: what the elf did, photos, the
// children's reactions and the Wichtelpost. Nothing can be changed here. Served at /v/:token.
const token = window.location.pathname.split("/").filter(Boolean)[1] || "";
const app = document.getElementById("app");
const esc = (s) => UI.esc(s);
const fmt = (iso) => { const [y, m, d] = String(iso).split("-"); return `${Number(d)}.${Number(m)}.${y}`; };
const catIcon = { streich: "drama", brief: "mail", geschenk: "gift", aufgabe: "clipboard-list", basteln: "scissors", ruhe: "clock" };

function render(d) {
  const after = d.today > `${d.year}-12-24`;
  const R = d.reactions || {};
  const days = d.days.filter((x) => x.entry && (after || x.date <= d.today));
  const withStuff = days.filter((x) => x.entry.done || x.entry.photo || x.entry.reaction || x.entry.letter);
  app.innerHTML = `
    <div class="w-card text-center">
      <div class="t-door t-door--${esc(d.elf.character)}" aria-hidden="true"><div class="t-door__frame"></div><div class="t-door__window"><span class="t-door__eyes"></span></div><div class="t-door__knob"></div><div class="t-door__wreath"></div><div class="t-door__sign">Psst!</div><div class="t-door__sock"></div><div class="t-door__mat"></div></div>
      <p class="text-xs text-amber-300 uppercase tracking-widest font-semibold mt-8">${after ? "Das Album" : "Zum Mitschauen"}</p>
      <h1 class="t-big">${esc(d.elf.name)}</h1>
      <p class="text-slate-300 mt-2">${esc(d.title)} · ${d.children.length ? `für ${d.children.map(esc).join(" und ")}` : ""}</p>
      <p class="text-xs text-slate-400 mt-1">${d.stats.done} von 24 Nächten erledigt${after ? "" : " – die Seite wächst jeden Morgen."}</p>
      <button type="button" class="w-btn w-btn--ghost w-btn--sm mt-3 no-print" onclick="window.print()"><i data-icon="printer"></i> Drucken / als PDF sichern</button>
    </div>

    <div class="w-card">
      <h2 class="w-title text-xl"><i data-icon="camera"></i> Was ${esc(d.elf.name)} angestellt hat</h2>
      ${withStuff.length ? `<div class="grid sm:grid-cols-2 gap-3 mt-3">${withStuff.map((x) => `<div class="t-idea">
          <div class="t-idea__head"><div class="t-idea__title">${x.day}. Dezember</div><span class="t-cat t-cat--${esc(x.entry.category)}"><i data-icon="${catIcon[x.entry.category] || "gift"}"></i> ${esc(x.entry.categoryLabel)}</span></div>
          <div class="text-white font-semibold">${esc(x.entry.title)}</div>
          ${x.entry.photo ? `<img src="${esc(x.entry.photo)}" alt="" style="width:100%;border-radius:10px;max-height:260px;object-fit:cover">` : ""}
          ${x.entry.reaction ? `<div class="t-idea__text">„${esc(x.entry.reaction)}“</div>` : ""}
          ${x.entry.letter ? `<div class="t-letter t-letter--elf mt-1" style="font-size:1rem">${esc(x.entry.letter)}</div>` : ""}
        </div>`).join("")}</div>` : `<p class="text-sm text-slate-400 mt-2">Noch nichts – ab dem 1. Dezember geht es los.</p>`}
    </div>

    <div class="w-card">
      <h2 class="w-title text-xl"><i data-icon="calendar"></i> Der Plan</h2>
      <p class="text-xs text-slate-400 mt-1">${after ? "So war der Dezember." : "Nur die schon vergangenen Tage – der Rest bleibt eine Überraschung."}</p>
      <div class="space-y-2 mt-3">${days.map((x) => `<div class="t-day t-day--${esc(x.entry.category)} ${x.entry.done ? "is-done" : ""}" style="cursor:default"><div class="t-day__num">${x.day}<small>${x.weekday}</small></div><div class="min-w-0"><div class="t-day__title">${esc(x.entry.title)}</div><div class="t-day__meta">${esc(x.entry.categoryLabel)}</div></div><div class="t-day__right">${x.entry.done ? `<i data-icon="circle-check" class="text-emerald-300"></i>` : ""}</div></div>`).join("") || `<p class="text-sm text-slate-400">Noch nichts.</p>`}</div>
    </div>

    <div class="w-card">
      <h2 class="w-title text-xl"><i data-icon="mail"></i> Wichtelpost</h2>
      <div class="space-y-3 mt-3">${d.post.length ? d.post.map((l) => l.from === "elf"
        ? `<div class="t-letter t-letter--elf">${esc(l.text)}<small>${esc(d.elf.name)}${l.childName ? ` an ${esc(l.childName)}` : ""} · ${fmt(l.at.slice(0, 10))}</small></div>`
        : l.kind === "reaction" ? `<div class="t-letter t-letter--kid t-letter--reaction"><span class="t-reaction-big">${R[l.reaction] || "❤️"}</span> ${esc(l.childName || "Ein Kind")} auf den ${esc(l.refLabel || "Brief")}<small>${fmt(l.at.slice(0, 10))}</small></div>`
        : l.kind === "voice" ? `<div class="t-letter t-letter--kid"><b><i data-icon="mic"></i> Sprachnachricht</b><audio controls preload="none" src="${esc(l.audio)}" class="t-audio mt-2"></audio><small>${esc(l.childName || "Kind")} · ${fmt(l.at.slice(0, 10))}</small></div>`
        : `<div class="t-letter t-letter--kid">${esc(l.text)}<small>${esc(l.childName || "Kind")} · ${fmt(l.at.slice(0, 10))}</small></div>`).join("") : `<p class="text-sm text-slate-400">Noch keine Briefe.</p>`}</div>
    </div>
    <p class="text-center text-xs text-slate-500 pb-6">Wichteltür · Advently · nur zum Lesen</p>`;
}

(async () => {
  try {
    const r = await fetch(`/api/wichteltuer/v/${encodeURIComponent(token)}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Fehler ${r.status}`);
    document.title = `${d.elf.name} – Wichtel-Album`;
    render(d);
  } catch (err) {
    app.innerHTML = `<div class="w-card text-center"><div class="ui-empty__art"><i data-icon="eye-off"></i></div><h1 class="w-title text-xl mb-2">Link ungültig</h1><p class="text-slate-400">${esc(err.message)}</p></div>`;
  }
})();
