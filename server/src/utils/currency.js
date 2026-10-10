/* Amounts are shown in the owner's currency: Swiss francs by default, euro on request. */
const CURRENCIES = ["CHF", "EUR"];
const normCurrency = (c) => (CURRENCIES.includes(String(c || "").toUpperCase()) ? String(c).toUpperCase() : "CHF");
module.exports = { CURRENCIES, normCurrency };
