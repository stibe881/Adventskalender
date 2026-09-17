const express = require("express");
const stripe = require("stripe");
const config = require("../config");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
let stripeClient = null;

if (config.stripe.secretKey) {
  stripeClient = stripe(config.stripe.secretKey);
}

// Checkout Session erstellen
router.post("/checkout", express.json(), requireAuth, async (req, res) => {
  try {
    const { calendarId } = req.body || {};
    if (!calendarId) {
      return res.status(400).json({ error: "Kein Kalender angegeben." });
    }

    if (!stripeClient || !config.stripe.priceId) {
      return res.status(500).json({ error: "Stripe ist noch nicht konfiguriert." });
    }

    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ["card", "paypal"],
      mode: "payment",
      line_items: [
        {
          price: config.stripe.priceId,
          quantity: 1,
        },
      ],
      client_reference_id: `${req.user.id}:${calendarId}`,
      success_url: `${config.baseUrl}/admin/index.html?payment=success`,
      cancel_url: `${config.baseUrl}/admin/index.html?payment=cancelled`,
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
        const [userId, calendarId] = refId.split(":");
        try {
          await db.updateCalendar(calendarId, (cal) => {
            cal.isPro = true;
            return cal;
          });
          console.log(`Kalender ${calendarId} wurde nach Zahlung auf PRO geupgradet.`);
        } catch (err) {
          console.error(`Fehler beim Upgraden von Kalender ${calendarId}:`, err);
        }
      }
    }

    res.json({ received: true });
  }
);

module.exports = router;
