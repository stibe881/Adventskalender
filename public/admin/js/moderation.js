requireAdminOrRedirect();
const esc = (s) => UI.esc(s);
const REASONS = { abuse: "Beleidigung oder Belästigung", inappropriate: "Unangemessener Inhalt", spam: "Spam oder Werbung", other: "Anderes" };

async function load() {
  const all = document.getElementById("show-all").checked;
  let reports;
  try { reports = await api.listReports(all ? "all" : ""); }
  catch (err) { document.getElementById("list").innerHTML = `<p class="text-rose-400">${esc(err.message)}</p>`; return; }
  const list = document.getElementById("list");
  list.innerHTML = "";
  document.getElementById("empty").classList.toggle("hidden", reports.length > 0);
  for (const r of reports) {
    const open = r.status === "open";
    const age = Math.round((Date.now() - new Date(r.createdAt).getTime()) / 3600000);
    const card = document.createElement("div");
    card.className = `bg-white/5 border ${open && age >= 20 ? "border-rose-500/60" : "border-white/10"} rounded-2xl p-5 space-y-2`;
    card.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div><span class="ui-badge ${open ? "" : "ui-badge--soft"}">${open ? "Offen" : "Erledigt"}</span> <b class="ml-2">${esc(REASONS[r.reason] || r.reason)}</b> <span class="text-xs text-slate-400">· ${esc(r.kind)}</span></div>
        <span class="text-xs ${open && age >= 20 ? "text-rose-300 font-semibold" : "text-slate-400"}">vor ${age} h · ${new Date(r.createdAt).toLocaleString("de-CH")}</span>
      </div>
      ${r.excerpt ? `<blockquote class="text-sm text-white bg-black/30 rounded-lg px-3 py-2 whitespace-pre-wrap">${esc(r.excerpt)}</blockquote>` : ""}
      ${r.details ? `<p class="text-sm text-slate-300">${esc(r.details)}</p>` : ""}
      <p class="text-xs text-slate-500">Referenz: <code>${esc(JSON.stringify(r.ref))}</code>${r.reporter ? ` · gemeldet von ${esc(r.reporter)}` : ""}${r.contact ? ` · Kontakt ${esc(r.contact)}` : ""}</p>
      ${open ? `<div class="flex flex-wrap gap-2 pt-1">
        <button data-act="remove" class="bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">Inhalt entfernen</button>
        <button data-act="dismiss" class="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">Keine Massnahme</button>
      </div>` : `<p class="text-xs text-emerald-300">${esc(r.outcome || "")} · ${esc(r.resolvedBy || "")} · ${r.resolvedAt ? new Date(r.resolvedAt).toLocaleString("de-CH") : ""}</p>`}`;
    card.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
      try { const res = await api.resolveReport(r.id, b.dataset.act); UI.toast(res.outcome || "Erledigt"); await load(); }
      catch (err) { UI.toast(err.message, { error: true }); }
    }));
    list.appendChild(card);
  }
}
document.getElementById("show-all").addEventListener("change", load);
load();
