/* PRO status for Wichteln rounds and Wichteltür plans. Mirrors the calendar:
 * the item was upgraded (Stripe) or its owner has a PRO account. */
const db = require("../db");

async function ownerIsPro(ownerId) {
  if (!ownerId) return false;
  try {
    const owner = await db.getUserById(ownerId);
    return Boolean(owner?.isPro);
  } catch (_) {
    return false;
  }
}

async function isProItem(item) {
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

module.exports = { isProItem, ownerIsPro, proOrDeny, proPriceLabel };
