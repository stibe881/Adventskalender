requireAdminOrRedirect();

const esc = (s) => UI.esc(s);
const field = "rounded-lg bg-slate-900/60 border border-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

async function init() {
  const user = await api.me();
  document.getElementById("admin-name").textContent = user.email;
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await api.logout();
    window.location.href = "/";
  });
  document.querySelector('#create-form [name="year"]').value = new Date().getFullYear();
  await loadPlans();
  loadShared().catch(() => {});
}

function planCard(p, shared) {
  const card = document.createElement("a");
  card.href = `/e/${encodeURIComponent(p.shareToken)}`;
  card.className = "block bg-white/5 border border-white/10 hover:border-amber-500/50 rounded-2xl p-5 transition-colors";
  const pct = Math.round((p.stats.planned / 24) * 100);
  card.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="font-display font-semibold text-lg text-white truncate">${esc(p.title)}</h3>
        <p class="text-xs text-slate-400 mt-1">Wichtel ${esc(p.elfName)} · ${p.children.length ? p.children.map(esc).join(", ") : "keine Kinder eingetragen"}</p>
      </div>
      <span class="flex items-center gap-1">${p.isPro ? `<span class="ui-pro-badge">PRO</span>` : ""}<span class="text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">${p.year}</span></span>
    </div>
    <div class="w-progress mt-4" style="height:8px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#dc2626,#f59e0b)"></div></div>
    <div class="flex items-center gap-4 mt-2 text-sm text-slate-300">
      <span>${p.stats.planned} von 24 Nächten geplant</span>
      ${p.stats.done ? `<span class="text-emerald-300"><i data-icon="circle-check"></i> ${p.stats.done} erledigt</span>` : ""}
      ${p.unreadPost ? `<span class="text-rose-300"><i data-icon="mail"></i> ${p.unreadPost} neue Post</span>` : ""}
    </div>
    ${shared ? `<p class="text-[11px] text-slate-500 mt-3">Mit dir geteilt</p>` : `<div class="mt-3 flex justify-end"><button type="button" class="text-xs text-amber-300 hover:text-white" data-rollover="${esc(p.id)}" data-year="${p.year}" data-title="${esc(p.title)}"><i data-icon="refresh-cw"></i> Ins nächste Jahr übernehmen</button></div>`}`;
  const roll = card.querySelector("[data-rollover]");
  if (roll) roll.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const r = await UI.form({
      title: "Ins nächste Jahr übernehmen",
      text: `Wichtel, Kinder (ein Jahr älter), Eltern, Einstellungen und eigene Ideen von „${p.title}“ werden übernommen. Der Plan bleibt leer oder wird gleich gefüllt.`,
      ok: "Neue Wichteltür anlegen",
      fields: [{ name: "year", type: "number", label: "Jahr", value: String(p.year + 1), required: true }, { name: "autoplan", type: "checkbox", label: "Alle 24 Nächte gleich automatisch planen", value: true }],
    });
    if (!r) return;
    try {
      const d = await api.rolloverElfPlan(p.id, { year: Number(r.year), autoplan: Boolean(r.autoplan) });
      window.location.href = `/e/${encodeURIComponent(d.shareLink.split("/").pop())}`;
    } catch (err) { UI.toast(err.message, { error: true }); }
  });
  return card;
}

function planRow(p, shared) {
  const row = document.createElement("tr");
  row.className = "hover:bg-white/5 transition-colors cursor-pointer";
  row.addEventListener("click", () => { window.location.href = `/e/${encodeURIComponent(p.shareToken)}`; });
  const kids = p.children.length ? p.children.map(esc).join(", ") : "keine Kinder eingetragen";
  row.innerHTML = `
    <td class="px-2 sm:px-4 py-3" style="max-width:0;width:100%">
      <div class="font-display font-semibold text-white flex items-center gap-2" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="truncate">${esc(p.title)}</span>${p.isPro ? `<span class="ui-pro-badge">PRO</span>` : ""}</div>
      <div class="text-xs text-slate-500" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Wichtel ${esc(p.elfName)}<span class="md:hidden"> · ${kids}</span>${shared ? " · Mit dir geteilt" : ""}</div>
    </td>
    <td class="px-2 sm:px-4 py-3 whitespace-nowrap"><span class="text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">${p.year}</span></td>
    <td class="px-2 sm:px-4 py-3 whitespace-nowrap">
      <div class="flex items-center gap-2">
        <span class="text-amber-300 font-bold">${p.stats.planned}/24</span>
        <div class="hidden sm:block w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="h-full" style="width:${Math.round((p.stats.planned / 24) * 100)}%;background:linear-gradient(90deg,#dc2626,#f59e0b)"></div></div>
        ${p.unreadPost ? `<span class="text-rose-300 text-xs whitespace-nowrap"><i data-icon="mail"></i> ${p.unreadPost}</span>` : ""}
      </div>
    </td>
    <td class="px-4 py-3 hidden md:table-cell">${kids}</td>`;
  return row;
}

// Fills either the card grid or the table of one section, depending on the chosen view.
function renderPlans(plans, shared, ids) {
  const list = document.getElementById(ids.list);
  const wrap = document.getElementById(ids.table);
  const body = document.getElementById(ids.body);
  list.innerHTML = "";
  body.innerHTML = "";
  const grid = view.get() === "grid";
  list.classList.toggle("hidden", !grid || !plans.length);
  wrap.classList.toggle("hidden", grid || !plans.length);
  for (const p of plans) (grid ? list : body).appendChild(grid ? planCard(p, shared) : planRow(p, shared));
}

let plansCache = [];
let sharedCache = [];
const view = UI.viewSwitch({ key: "wichteltuerView", gridBtn: document.getElementById("view-grid-btn"), tableBtn: document.getElementById("view-table-btn"), onChange: () => {
  renderPlans(plansCache, false, { list: "plan-list", table: "plan-table-container", body: "plan-table-body" });
  renderPlans(sharedCache, true, { list: "shared-list", table: "shared-table-container", body: "shared-table-body" });
} });

async function loadPlans() {
  plansCache = await api.listElfPlans();
  document.getElementById("empty-state").classList.toggle("hidden", plansCache.length > 0);
  renderPlans(plansCache, false, { list: "plan-list", table: "plan-table-container", body: "plan-table-body" });
  return plansCache;
}

// Plans that were shared with this device (opened via /e/… link) but belong to someone else.
async function loadShared() {
  let tokens = [];
  try { tokens = JSON.parse(localStorage.getItem("wichteltuer_tokens") || "[]"); } catch (_) {}
  if (!tokens.length) return;
  const mine = new Set(plansCache.map((p) => p.shareToken));
  sharedCache = [];
  for (const t of tokens) {
    if (mine.has(t)) continue;
    try {
      const r = await fetch(`/api/wichteltuer/s/${encodeURIComponent(t)}`);
      if (!r.ok) continue;
      const d = await r.json();
      sharedCache.push({ title: d.title, isPro: d.isPro, elfName: d.elf.name, children: d.children.map((c) => c.name), year: d.year, stats: d.stats, unreadPost: d.unreadPost, shareToken: t });
    } catch (_) { /* skip */ }
  }
  renderPlans(sharedCache, true, { list: "shared-list", table: "shared-table-container", body: "shared-table-body" });
  document.getElementById("shared-section").classList.toggle("hidden", !sharedCache.length);
}

const createModal = document.getElementById("create-modal");
document.getElementById("new-plan-btn").addEventListener("click", () => { createModal.classList.remove("hidden"); createModal.querySelector("[name=elfName]").focus(); });
document.getElementById("create-close").addEventListener("click", () => createModal.classList.add("hidden"));
document.getElementById("create-add-child").addEventListener("click", () => {
  document.getElementById("create-children").insertAdjacentHTML("beforeend", `<div class="flex gap-2"><input name="childName" maxlength="40" placeholder="Name" class="flex-1 ${field}" /><input name="childAge" type="number" min="0" max="18" placeholder="Alter" class="w-24 ${field}" /></div>`);
});
document.getElementById("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = document.getElementById("create-error");
  err.classList.add("hidden");
  const names = [...f.querySelectorAll("[name=childName]")].map((i) => i.value.trim());
  const ages = [...f.querySelectorAll("[name=childAge]")].map((i) => i.value);
  const children = names.map((name, i) => ({ name, age: ages[i] })).filter((c) => c.name);
  try {
    const plan = await api.createElfPlan({ elfName: f.elements.elfName.value, year: Number(f.elements.year.value), children, autoplan: f.elements.autoplan.checked, swissMode: f.elements.swissMode.checked, title: `Wichteltür ${f.elements.year.value}${children.length ? ` – ${children.map((c) => c.name).join(" & ")}` : ""}` });
    window.location.href = `/e/${encodeURIComponent(plan.shareLink.split("/").pop())}`;
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove("hidden");
  }
});

init().catch((e) => console.error(e));
