/* First visit via a shared link (calendar, Wichteln, Wichteltür): ask once
 * whether to register (with the reasons) or go on without an account, and
 * offer the app. Self-contained styles, so it works on every page.
 * Skipped inside the app, when logged in, in the admin preview and after the
 * choice was made on this device. */
(function () {
  const KEY = "advently_welcome_seen";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };

  const INTRO = {
    calendar: { title: "Jemand hat dir einen Kalender geschenkt", text: "Du kannst ihn sofort öffnen – mit oder ohne Konto." },
    wichteln: { title: "Du bist zu einer Wichtel-Runde eingeladen", text: "Mitmachen geht sofort – mit oder ohne Konto." },
    wichteltuer: { title: "Jemand teilt eine Wichteltür mit dir", text: "Mitplanen geht sofort – mit oder ohne Konto." },
  };
  const BENEFITS = [
    ["Alles an einem Ort", "Kalender, Wichtel-Runden und Wichteltüren, die du bekommst, bleiben in deinem Konto – auf jedem Gerät."],
    ["Nichts verpassen", "Erinnerungen per Push oder E-Mail, wenn ein Türchen wartet oder es Neues gibt."],
    ["Selber verschenken", "Eigene Kalender, Runden und Wichteltüren anlegen und teilen – kostenlos."],
  ];

  function css() {
    if (document.getElementById("welcome-css")) return;
    const st = document.createElement("style");
    st.id = "welcome-css";
    st.textContent = `
      .wl-backdrop{position:fixed;inset:0;z-index:120;background:rgba(10,18,40,.7);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;padding:16px;opacity:0;transition:opacity .2s;font-family:Inter,system-ui,sans-serif}
      .wl-backdrop.is-open{opacity:1}
      .wl-card{width:100%;max-width:460px;background:#2b3f68;border:1px solid rgba(255,255,255,.16);border-radius:22px;padding:22px;color:#e2e8f0;box-shadow:0 30px 60px -20px rgba(0,0,0,.8);transform:translateY(16px);transition:transform .2s;max-height:calc(100vh - 32px);overflow-y:auto}
      .wl-backdrop.is-open .wl-card{transform:translateY(0)}
      .wl-eyebrow{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#fcd34d;font-weight:700}
      .wl-title{font-size:1.25rem;font-weight:800;color:#fff;margin:4px 0 4px;line-height:1.2}
      .wl-text{font-size:.9rem;color:#cbd5e1;margin:0 0 14px}
      .wl-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
      .wl-list li{display:flex;gap:10px;font-size:.85rem;line-height:1.35}
      .wl-list li span:first-child{flex-shrink:0;width:22px;height:22px;border-radius:999px;background:rgba(16,185,129,.25);color:#6ee7b7;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:.8rem}
      .wl-list b{color:#fff;display:block}
      .wl-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border-radius:14px;padding:13px 16px;font-weight:700;font-size:.95rem;border:1px solid transparent;cursor:pointer;text-decoration:none;color:#fff;box-sizing:border-box}
      .wl-btn--primary{background:#059669}.wl-btn--primary:hover{background:#10b981}
      .wl-btn--ghost{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.18);color:#e2e8f0;margin-top:8px}
      .wl-apps{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}
      .wl-apps p{font-size:.78rem;color:#94a3b8;margin:0 0 8px}
      .wl-apps div{display:flex;gap:8px}
      .wl-apps a{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:12px;padding:10px;background:#0f172a;color:#fff;font-size:.82rem;font-weight:600;text-decoration:none;border:1px solid rgba(255,255,255,.14)}
      @media(min-width:640px){.wl-backdrop{align-items:center}}`;
    document.head.appendChild(st);
  }

  async function loggedIn() {
    try { const r = await fetch("/api/auth/me", { cache: "no-store" }); return r.ok; } catch (_) { return false; }
  }

  async function maybeShow(kind = "calendar") {
    if (window.__NATIVE_APP || store.get(KEY) || /\/c\/preview\//.test(location.pathname)) return false;
    if (await loggedIn()) { store.set(KEY, "account"); return false; }
    css();
    const intro = INTRO[kind] || INTRO.calendar;
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    const links = window.APP_LINKS || {};
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const android = /Android/i.test(navigator.userAgent);
    const apps = [links.ios ? `<a href="${esc(links.ios)}" target="_blank" rel="noopener" data-app="ios"> App Store</a>` : "", links.android ? `<a href="${esc(links.android)}" target="_blank" rel="noopener" data-app="android">▶ Google Play</a>` : ""];
    if (android) apps.reverse();
    const wrap = document.createElement("div");
    wrap.className = "wl-backdrop";
    wrap.innerHTML = `<div class="wl-card" role="dialog" aria-modal="true" aria-labelledby="wl-title">
      <p class="wl-eyebrow">Advently</p>
      <h2 class="wl-title" id="wl-title">${esc(intro.title)}</h2>
      <p class="wl-text">${esc(intro.text)} Mit einem kostenlosen Konto hast du:</p>
      <ul class="wl-list">${BENEFITS.map(([b, t]) => `<li><span>✓</span><span><b>${esc(b)}</b>${esc(t)}</span></li>`).join("")}</ul>
      <div style="margin-top:16px">
        <a class="wl-btn wl-btn--primary" href="/admin/index.html?mode=register&next=${next}" data-act="register">Kostenlos registrieren</a>
        <button type="button" class="wl-btn wl-btn--ghost" data-act="skip">Ohne Registrierung weiter</button>
      </div>
      <div class="wl-apps"><p>Lieber in der App? Dort bleibt der Link gespeichert und Erinnerungen kommen als Push.</p><div>${apps.join("")}</div></div>
    </div>`;
    const close = (how) => { store.set(KEY, how); wrap.classList.remove("is-open"); setTimeout(() => wrap.remove(), 200); };
    wrap.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "skip" || e.target === wrap) close("skip");
      else if (act === "register") store.set(KEY, "register");
      else if (e.target.closest("[data-app]")) store.set(KEY, "app");
    });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("is-open"));
    return true;
  }

  window.Welcome = { maybeShow, KEY, ios: () => /iPhone|iPad|iPod/i.test(navigator.userAgent) };
})();
