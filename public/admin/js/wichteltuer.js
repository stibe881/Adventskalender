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
    ${shared ? `<p class="text-[11px] text-slate-500 mt-3">Mit dir geteilt</p>` : ""}`;
  return card;
}

async function loadPlans() {
  const plans = await api.listElfPlans();
  const list = document.getElementById("plan-list");
  list.innerHTML = "";
  document.getElementById("empty-state").classList.toggle("hidden", plans.length > 0);
  for (const p of plans) list.appendChild(planCard(p, false));
  return plans;
}

// Plans that were shared with this device (opened via /e/… link) but belong to someone else.
async function loadShared() {
  let tokens = [];
  try { tokens = JSON.parse(localStorage.getItem("wichteltuer_tokens") || "[]"); } catch (_) {}
  if (!tokens.length) return;
  const mine = new Set((await api.listElfPlans()).map((p) => p.shareToken));
  const list = document.getElementById("shared-list");
  list.innerHTML = "";
  for (const t of tokens) {
    if (mine.has(t)) continue;
    try {
      const r = await fetch(`/api/wichteltuer/s/${encodeURIComponent(t)}`);
      if (!r.ok) continue;
      const d = await r.json();
      list.appendChild(planCard({ title: d.title, isPro: d.isPro, elfName: d.elf.name, children: d.children.map((c) => c.name), year: d.year, stats: d.stats, unreadPost: d.unreadPost, shareToken: t }, true));
    } catch (_) { /* skip */ }
  }
  document.getElementById("shared-section").classList.toggle("hidden", !list.children.length);
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
