const express = require("express");
const stripe = require("stripe");
const config = require("../config");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { proPriceLabel } = require("../utils/pro");

const router = express.Router();
let stripeClient = null;

if (config.stripe.secretKey) {
  stripeClient = stripe(config.stripe.secretKey);
}

/* What can be upgraded to PRO: a calendar, a Wichteln round or a Wichteltür.
 * Each kind knows how to load and own-check its item, where to send the
 * buyer afterwards and how to flip the PRO flag once Stripe confirms. */
const KINDS = {
  calendar: {
    load: (id) => db.getCalendarById(id),
    owns: (item, user) => item.ownerId === user.id,
    successUrl: () => "/admin/index.html?payment=success",
    cancelUrl: () => "/admin/index.html?payment=cancelled",
    markPro: (id) => db.updateCalendar(id, (c) => { c.isPro = true; return c; }),
    label: "Kalender",
    lineItem: () => (config.stripe.priceId ? { price: config.stripe.priceId, quantity: 1 } : null),
  },
  wichteln: {
    load: (id) => db.getWichtelGroupById(id),
    owns: (item, user) => item.ownerId === user.id,
    successUrl: (item) => `/admin/wichteln-editor.html?id=${encodeURIComponent(item.id)}&payment=success`,
    cancelUrl: (item) => `/admin/wichteln-editor.html?id=${encodeURIComponent(item.id)}&payment=cancelled`,
    markPro: (id) => db.updateWichtelGroup(id, (g) => { g.isPro = true; return g; }),
    label: "Wichtel-Runde",
    lineItem: (item) => modulePrice(`Wichteln PRO – ${item.title}`, "Wunschzettel, Hinweise für den Wichtel und anonymer Chat für alle Teilnehmenden dieser Runde."),
  },
  wichteltuer: {
    load: (id) => db.getElfPlanById(id),
    owns: (item, user) => item.ownerId === user.id,
    successUrl: (item) => `/e/${encodeURIComponent(item.shareToken)}?payment=success`,
    cancelUrl: (item) => `/e/${encodeURIComponent(item.shareToken)}?payment=cancelled`,
    markPro: (id) => db.updateElfPlan(id, (p) => { p.isPro = true; return p; }),
    label: "Wichteltür",
    lineItem: (item) => modulePrice(`Wichteltür PRO – ${item.title}`, "Ideen-Bibliothek, Briefe und Einkaufsliste für alle mit dem Link dieser Wichteltür."),
  },
};

// One flat price per round or Wichteltür, no Stripe price object needed.
function modulePrice(name, description) {
  return { price_data: { currency: config.stripe.currency, unit_amount: config.stripe.moduleAmount, product_data: { name: name.slice(0, 120), description } }, quantity: 1 };
}

// Checkout Session erstellen
router.post("/checkout", express.json(), requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const kind = body.kind || (body.calendarId ? "calendar" : "");
    const id = body.id || body.calendarId;
    const def = KINDS[kind];
    if (!def || !id) {
      return res.status(400).json({ error: "Kein Kalender angegeben." });
    }
    const item = await def.load(id);
    if (!item || !def.owns(item, req.user)) {
      return res.status(404).json({ error: `${def.label} nicht gefunden.` });
    }
    if (item.isPro) {
      return res.status(400).json({ error: `${def.label} ist bereits PRO.` });
    }

    const lineItem = stripeClient ? def.lineItem(item) : null;
    if (!lineItem) {
      return res.status(500).json({ error: "Stripe ist noch nicht konfiguriert." });
    }

    const session = await stripeClient.checkout.sessions.create({
      mode: "payment",
      line_items: [lineItem],
      client_reference_id: `${req.user.id}:${kind}:${item.id}`,
      success_url: `${config.baseUrl}${def.successUrl(item)}`,
      cancel_url: `${config.baseUrl}${def.cancelUrl(item)}`,
      customer_email: req.user.email,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkout Error:", error);
    res.status(500).json({ error: "Fehler beim Erstellen der Bezahlseite: " + error.message });
  }
});

// Webhook
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    if (!stripeClient || !config.stripe.webhookSecret) {
      return res.status(500).send("Stripe Webhook nicht konfiguriert.");
    }

    let event;
    try {
      event = stripeClient.webhooks.constructEvent(
        req.body,
        sig,
        config.stripe.webhookSecret
      );
    } catch (err) {
      console.error("Stripe Webhook Error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const refId = session.client_reference_id;

      if (refId && refId.includes(":")) {
        // "user:kind:id" – older sessions carried "user:calendarId".
        const parts = refId.split(":");
        const kind = parts.length >= 3 ? parts[1] : "calendar";
        const id = parts.length >= 3 ? parts.slice(2).join(":") : parts[1];
        const def = KINDS[kind];
        try {
          if (!def) throw new Error(`Unbekannte Art "${kind}"`);
          await def.markPro(id);
          console.log(`${def.label} ${id} wurde nach Zahlung auf PRO geupgradet.`);
        } catch (err) {
          console.error(`Fehler beim Upgraden von ${kind} ${id}:`, err);
        }
      }
    }

    res.json({ received: true });
  }
);

module.exports = router;
