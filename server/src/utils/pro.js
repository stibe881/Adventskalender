/* PRO status for Wichteln rounds and Wichteltür plans. Mirrors the calendar:
 * the item was upgraded (Stripe) or its owner has a PRO account. */
const { AsyncLocalStorage } = require("async_hooks");
const db = require("../db");

/* The store apps (identified by their user agent) show every feature to everyone:
 * App Store rules forbid selling PRO outside In-App Purchase, so inside the app
 * there is no difference between PRO and free. On the web PRO stays purchasable. */
const requestCtx = new AsyncLocalStorage();
const nativeAppMiddleware = (req, _res, next) => {
  const app = /AdventskalenderApp\//.test(String(req.headers["user-agent"] || ""));
  requestCtx.run({ app }, next);
};
const inNativeApp = () => Boolean(requestCtx.getStore()?.app);
const effectivePro = (isPro) => Boolean(isPro) || inNativeApp();

async function ownerIsPro(ownerId) {
  if (inNativeApp()) return true;
  if (!ownerId) return false;
  try {
    const owner = await db.getUserById(ownerId);
    return Boolean(owner?.isPro);
  } catch (_) {
    return false;
  }
}

async function isProItem(item) {
  if (inNativeApp()) return true;
  if (!item) return false;
  if (item.isPro) return true;
  return ownerIsPro(item.ownerId);
}

/** Answers 402 with a hint the frontend understands; returns false when the feature is locked. */
/** "CHF 4.50" – what one Wichtel-Runde or Wichteltür costs, for the UI. */
function proPriceLabel() {
  const { currency, moduleAmount } = require("../config").stripe;
  return `${currency.toUpperCase()} ${(moduleAmount / 100).toFixed(2)}`;
}

function proOrDeny(pro, res, feature) {
  if (pro) return true;
  res.status(402).json({ error: `${feature} gibt es in der PRO-Version.`, pro: true });
  return false;
}

module.exports = { nativeAppMiddleware, inNativeApp, effectivePro, isProItem, ownerIsPro, proOrDeny, proPriceLabel };
