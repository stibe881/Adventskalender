/* Shared safety UI: the house-rules dialog before somebody posts for the
 * first time, the "report" dialog, and the contact line for page footers.
 * Needs ui.js. */
(function () {
  const CONTACT = "stefan.gross@gross-ict.ch";
  const TERMS_URL = "/nutzungsbedingungen.html";
  const REASONS = [
    { value: "abuse", label: "Beleidigung oder Belästigung" },
    { value: "inappropriate", label: "Unangemessener oder anstössiger Inhalt" },
    { value: "spam", label: "Spam oder Werbung" },
    { value: "other", label: "Anderes" },
  ];
  const esc = (s) => (window.UI ? UI.esc(s) : String(s));
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) {} return null; };

  const rulesHtml = () => `
    <ul class="mod-rules">
      <li>Respektvoll bleiben: keine Beleidigungen, Drohungen oder Belästigung – auch nicht anonym.</li>
      <li>Keine Hassrede, keine sexuellen oder gewaltverherrlichenden Inhalte, keine fremden persönlichen Daten.</li>
      <li>Verstösse werden innerhalb von 24 Stunden entfernt und führen zum Ausschluss.</li>
    </ul>
    <p class="ui-field__hint">Du kannst Beiträge anderer jederzeit melden, Gesprächspartner blockieren und eigene Beiträge löschen. Es gelten die <a href="${TERMS_URL}" target="_blank" rel="noopener" class="underline">Nutzungsbedingungen</a>.</p>`;

  // Resolves true once the person has accepted the rules (remembered per device + context).
  async function gate(key, { already = false } = {}) {
    if (already || store(`terms_${key}`) === "1") return true;
    const ok = await UI.confirm({ title: "Kurz vorab: unsere Regeln", body: rulesHtml(), ok: "Einverstanden, weiter", cancel: "Abbrechen" });
    if (ok) store(`terms_${key}`, "1");
    return Boolean(ok);
  }
  const accepted = (key) => store(`terms_${key}`) === "1";

  // Report dialog. `send(payload)` posts it; defaults to the public endpoint.
  async function report({ kind = "other", ref = {}, label = "diesen Inhalt", excerpt = "", send } = {}) {
    const r = await UI.form({
      title: "Inhalt melden",
      text: `Du meldest ${label}. Gemeldete Inhalte werden für dich sofort ausgeblendet und von uns innerhalb von 24 Stunden geprüft.`,
      ok: "Melden",
      fields: [
        { name: "reason", type: "select", label: "Grund", options: REASONS, value: "abuse" },
        { name: "details", type: "textarea", label: "Was ist passiert? (optional)", rows: 3, placeholder: "Je genauer, desto schneller können wir handeln." },
        { name: "contact", type: "email", label: "Deine E-Mail für Rückfragen (optional)", placeholder: "name@beispiel.ch" },
      ],
    });
    if (!r) return null;
    const payload = { kind, ref, excerpt: String(excerpt || "").slice(0, 400), reason: r.reason, details: r.details, contact: r.contact };
    try {
      if (send) await send(payload);
      else {
        const res = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Meldung fehlgeschlagen");
      }
      UI.toast("Danke – wir prüfen das innerhalb von 24 Stunden.");
      return payload;
    } catch (err) {
      UI.toast(err.message, { error: true });
      return null;
    }
  }

  // Footer line for every page with user content.
  function footer({ kind = "other", ref = {}, label = "Inhalte auf dieser Seite" } = {}) {
    return `<p class="mod-footer text-center text-xs text-slate-500 pb-6">
      <a href="${TERMS_URL}" target="_blank" rel="noopener" class="underline">Nutzungsbedingungen</a> ·
      <button type="button" class="underline" data-mod-report='${esc(JSON.stringify({ kind, ref, label }))}'>Inhalt melden</button> ·
      Kontakt: <a href="mailto:${CONTACT}" class="underline">${CONTACT}</a>
    </p>`;
  }
  // One delegated listener handles every footer's report button.
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mod-report]");
    if (!b) return;
    e.preventDefault();
    let cfg = {};
    try { cfg = JSON.parse(b.dataset.modReport); } catch (_) {}
    report(cfg);
  });

  window.Moderation = { gate, accepted, report, footer, rulesHtml, CONTACT, TERMS_URL, REASONS };
})();
