/* Link preview for wish-list entries. Fetches the page (bounded in size and
 * time) and extracts Open-Graph title, image and price. Private networks
 * are blocked so participants cannot probe the server's surroundings. */
const dns = require("dns").promises;
const net = require("net");
const { cfg, safeHttpUrl } = require("./shared");

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:");
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&(amp|lt|gt|quot|#39|#x27|apos|nbsp);/g, (m, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", apos: "'", nbsp: " " })[k])
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)));
}

function metaTag(html, names) {
  for (const n of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${n}["']`, "i");
    const m = html.match(re);
    if (m) return decodeEntities(m[1] || m[2]);
  }
  return "";
}

/** Pure part: extracts title/image/price from a HTML document. */
function parsePreview(html, baseUrl) {
  const u = new URL(baseUrl);
  const title = metaTag(html, ["og:title", "twitter:title"]) || decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "") || u.hostname;
  let image = metaTag(html, ["og:image", "og:image:url", "twitter:image"]);
  if (image && !/^https?:/i.test(image)) image = new URL(image, u.href).href;
  const amount = metaTag(html, ["product:price:amount", "og:price:amount"]);
  const currency = metaTag(html, ["product:price:currency", "og:price:currency"]);
  return { title: title.trim().slice(0, 140), image: safeHttpUrl(image) || "", price: amount ? `${amount}${currency ? ` ${currency}` : ""}` : "" };
}

async function fetchLinkPreview(url) {
  const u = new URL(url);
  if (/^(localhost|.*\.local)$/i.test(u.hostname)) throw new Error("blocked");
  const { address } = await dns.lookup(u.hostname);
  if (isPrivateAddress(address)) throw new Error("blocked");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.linkPreviewTimeoutMs);
  try {
    const r = await fetch(u.href, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; WichtelBot/1.0; +https://mein-adventskalender.ch)", Accept: "text/html,*/*;q=0.5", "Accept-Language": "de,en;q=0.7" } });
    const ct = r.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/.test(ct)) return { title: u.hostname, image: "", price: "" };
    const reader = r.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < cfg.linkPreviewMaxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    ctrl.abort();
    return parsePreview(Buffer.concat(chunks).toString("utf8"), u.href);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchLinkPreview, parsePreview, isPrivateAddress, decodeEntities };
