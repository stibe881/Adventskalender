/* Shared UI building blocks: toast, dialogs (confirm / prompt / form), share
 * and copy helpers. Works in the browser and inside the native app (native.js
 * exposes window.nativeShare). No dependencies; styles live in ui.css. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  let toastTimer = null;
  // opts.action = { label, onClick } adds a button (e.g. "Rückgängig") and keeps the toast longer.
  function toast(msg, opts = {}) {
    const isError = opts === true || opts.error === true;
    let el = document.getElementById("ui-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "ui-toast";
      el.className = "ui-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    if (opts.action) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ui-toast__action";
      b.textContent = opts.action.label;
      b.addEventListener("click", () => { el.classList.remove("is-open"); clearTimeout(toastTimer); opts.action.onClick(); });
      el.appendChild(b);
    }
    el.classList.toggle("is-error", isError);
    el.classList.add("is-open");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-open"), opts.ms || (opts.action ? 6000 : isError ? 4000 : 2600));
  }

  // ── Dialogs ───────────────────────────────────────────────────────────────
  function openDialog({ title, text, body = "", ok = "OK", cancel = "Abbrechen", danger = false, hideCancel = false }) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "ui-backdrop";
      wrap.innerHTML = `
        <div class="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-dialog-title">
          ${title ? `<h2 id="ui-dialog-title" class="ui-dialog__title">${esc(title)}</h2>` : ""}
          ${text ? `<p class="ui-dialog__text">${esc(text)}</p>` : ""}
          <form class="ui-dialog__body">${body}</form>
          <div class="ui-dialog__actions">
            ${hideCancel ? "" : `<button type="button" class="ui-btn ui-btn--ghost" data-cancel>${esc(cancel)}</button>`}
            <button type="button" class="ui-btn ${danger ? "ui-btn--danger" : "ui-btn--primary"}" data-ok>${esc(ok)}</button>
          </div>
        </div>`;
      const form = wrap.querySelector("form");
      const previous = document.activeElement;
      const close = (value) => {
        document.removeEventListener("keydown", onKey);
        wrap.classList.remove("is-open");
        setTimeout(() => wrap.remove(), 160);
        if (previous && typeof previous.focus === "function") previous.focus();
        resolve(value);
      };
      const collect = () => {
        const data = {};
        new FormData(form).forEach((v, k) => { data[k] = typeof v === "string" ? v.trim() : v; });
        form.querySelectorAll("input[type=checkbox]").forEach((c) => { data[c.name] = c.checked; });
        return data;
      };
      const submit = () => {
        if (!form.reportValidity()) return;
        close(collect());
      };
      const onKey = (e) => {
        if (e.key === "Escape") close(null);
      };
      wrap.querySelector("[data-ok]").addEventListener("click", submit);
      form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
      const cancelBtn = wrap.querySelector("[data-cancel]");
      if (cancelBtn) cancelBtn.addEventListener("click", () => close(null));
      wrap.addEventListener("click", (e) => { if (e.target === wrap) close(null); });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(wrap);
      requestAnimationFrame(() => {
        wrap.classList.add("is-open");
        const first = form.querySelector("input, textarea, select") || wrap.querySelector("[data-ok]");
        first.focus();
        if (first.select) first.select();
      });
    });
  }

  const confirm = (opts) => openDialog(typeof opts === "string" ? { text: opts } : opts).then((r) => r !== null);
  const alert = (opts) => openDialog({ ...(typeof opts === "string" ? { text: opts } : opts), hideCancel: true }).then(() => true);

  function fieldHtml(f) {
    const attrs = `name="${esc(f.name)}" ${f.required ? "required" : ""} ${f.maxlength ? `maxlength="${f.maxlength}"` : ""} placeholder="${esc(f.placeholder || "")}"`;
    let input;
    if (f.type === "textarea") input = `<textarea class="ui-input" rows="${f.rows || 3}" ${attrs}>${esc(f.value || "")}</textarea>`;
    else if (f.type === "checkbox") return `<label class="ui-check"><input type="checkbox" name="${esc(f.name)}" ${f.value ? "checked" : ""}> <span>${esc(f.label)}</span></label>`;
    else if (f.type === "select") input = `<select class="ui-input" name="${esc(f.name)}">${(f.options || []).map((o) => `<option value="${esc(o.value)}" ${o.value === f.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
    else input = `<input class="ui-input" type="${esc(f.type || "text")}" value="${esc(f.value || "")}" ${attrs}>`;
    return `<label class="ui-field">${f.label ? `<span class="ui-field__label">${esc(f.label)}</span>` : ""}${input}${f.hint ? `<span class="ui-field__hint">${esc(f.hint)}</span>` : ""}</label>`;
  }

  const form = (opts) => openDialog({ ...opts, body: (opts.fields || []).map(fieldHtml).join("") });
  const prompt = (opts) => {
    const o = typeof opts === "string" ? { text: opts } : opts;
    return form({ ...o, fields: [{ name: "value", label: o.label, value: o.value, placeholder: o.placeholder, type: o.type, required: o.required !== false, maxlength: o.maxlength }] })
      .then((r) => (r ? r.value : null));
  };

  // ── Share / copy ──────────────────────────────────────────────────────────
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Kopiert");
      return true;
    } catch (_) {
      const r = await prompt({ title: "Kopieren", label: "Markieren und kopieren:", value: text, ok: "Fertig" });
      return r !== null;
    }
  }

  async function share({ title, text, url }) {
    if (typeof window.nativeShare === "function") {
      await window.nativeShare({ title, text, url });
      return "shared";
    }
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return "shared";
      } catch (err) {
        if (err && err.name === "AbortError") return false;
      }
    }
    return (await copy(url || text)) ? "copied" : false;
  }

  const canShare = () => typeof window.nativeShare === "function" || Boolean(navigator.share);

  // ── PRO ───────────────────────────────────────────────────────────────────
  // The same "what do I get" dialog for calendars, Wichteln and Wichteltür.
  // points: [[icon, text], …]; resolves true when the person wants to pay.
  function proDialog({ title = "PRO freischalten", scope = "", price = "", points = [], ok = "Weiter zur Bezahlung" } = {}) {
    const body = `<p class="ui-dialog__text">Einmalig${price ? ` ${esc(price)}` : ""}${scope ? ` für ${esc(scope)}` : ""} – alle Funktionen zusammen, nicht je Funktion.</p>
      <ul class="w-pro-list">${points.map(([ic, t]) => `<li><i data-icon="${esc(ic)}"></i><span>${esc(t)}</span></li>`).join("")}</ul>`;
    return openDialog({ title, body, ok: price ? `${ok} – ${price}` : ok }).then((r) => r !== null);
  }
  const proButtonLabel = (price) => `<i data-icon="star"></i> PRO freischalten${price ? ` · ${esc(price)}` : ""}`;

  // ── Offline hint ──────────────────────────────────────────────────────────
  // Shown after a real offline signal (event or failed request), never merely
  // because navigator.onLine starts out false in some embedded browsers.
  let offlineBar = null;
  function showBar(off) {
    if (!offlineBar) {
      offlineBar = document.createElement("div");
      offlineBar.id = "ui-offline";
      offlineBar.className = "ui-offline";
      offlineBar.textContent = "Du bist offline – Änderungen werden erst gespeichert, wenn die Verbindung zurück ist.";
      document.body.appendChild(offlineBar);
    }
    offlineBar.classList.toggle("is-open", Boolean(off));
  }
  // Only a failed round trip to the server counts as offline; some embedded
  // browsers report "offline" while everything works.
  async function setOffline(off) {
    if (!off) return showBar(false);
    try {
      await fetch("/manifest.json", { method: "HEAD", cache: "no-store" });
      showBar(false);
    } catch (_) {
      // An aborted request during navigation is not an outage.
      showBar(navigator.onLine === false);
    }
  }
  let watching = false;
  function watchOffline() {
    if (watching) return;
    watching = true;
    window.addEventListener("online", () => showBar(false));
    window.addEventListener("offline", () => setOffline(true));
  }

  window.UI = { toast, confirm, alert, prompt, form, dialog: openDialog, copy, share, canShare, watchOffline, setOffline, esc, proDialog, proButtonLabel };
})();
