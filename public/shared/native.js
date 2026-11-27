/* Native bridge for the Expo app (mobile/). Harmless in a normal browser.
 * The app injects window.__NATIVE_APP = { platform, runtime } before the page loads
 * and listens to window.ReactNativeWebView.postMessage(JSON). Replies arrive as
 * "native-message" CustomEvents on window. */
(function () {
  const native = window.__NATIVE_APP;
  const rn = window.ReactNativeWebView;
  const isNative = Boolean(native && rn && typeof rn.postMessage === "function");
  document.documentElement.classList.toggle("is-native-app", isNative);
  if (!isNative) return;
  const platform = native.platform || "unknown";
  document.documentElement.classList.add(`is-${platform}`);
  const send = (msg) => { try { rn.postMessage(JSON.stringify(msg)); } catch (_) {} };

  // Layout tweaks for the app: the status bar area is handled natively, the
  // home indicator (iOS) still needs room for fixed elements.
  const style = document.createElement("style");
  style.textContent = `
    html.is-native-app body { padding-bottom: env(safe-area-inset-bottom); }
    html.is-native-app #digital-pet { bottom: calc(env(safe-area-inset-bottom) + 16px) !important; }
    html.is-native-app .w-toast, html.is-native-app .toast { bottom: calc(env(safe-area-inset-bottom) + 24px) !important; }
    html.is-native-app a { -webkit-touch-callout: none; }
    /* App Store 3.1.1: no purchase flow outside In-App Purchase – PRO is bought on the web only. */
    html.is-native-app .ui-pro-badge, html.is-native-app #upgrade-btn, html.is-native-app .btn-pro, html.is-native-app .w-btn--pro, html.is-native-app .ui-btn--pro, html.is-native-app [data-act="upgrade"] { display: none !important; }
    html.is-native-app * { -webkit-tap-highlight-color: transparent; }
  `;
  document.head.appendChild(style);

  // External links (shops on the wish list etc.) open in the system browser.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!/^https?:/i.test(href)) return;
    let u;
    try { u = new URL(href, window.location.href); } catch (_) { return; }
    if (u.origin === window.location.origin) {
      // Downloads (ICS) don't work inside the WebView – hand them to the system.
      if (/\.ics$/i.test(u.pathname) || a.hasAttribute("download")) {
        e.preventDefault();
        send({ type: "download", url: u.href });
      }
      return;
    }
    e.preventDefault();
    send({ type: "openExternal", url: u.href });
  }, true);

  // No browser tabs inside the app: links that would open a new tab navigate in place.
  document.querySelectorAll('a[target="_blank"]').forEach((a) => {
    if (a.getAttribute("href") && new URL(a.href, location.href).origin === location.origin) a.removeAttribute("target");
  });

  // The app keeps you signed in permanently – no need to ask.
  const rememberRow = document.getElementById("remember-row");
  if (rememberRow) {
    rememberRow.style.display = "none";
    const cb = document.getElementById("remember-me");
    if (cb) cb.checked = true;
  }

  // Helpers the web app can call.
  window.nativeShare = async ({ title, text, url }) => { send({ type: "share", title, text, url }); return true; };
  window.nativeHaptic = (style = "light") => send({ type: "haptic", style });
  window.nativeOpen = (url) => send({ type: "openExternal", url });
  // Stripe checkout in a browser sheet that returns to the app afterwards.
  window.nativeCheckout = (url) => send({ type: "checkout", url });

  // Push: the app fetches an Expo push token and answers with { type: "pushToken", token }.
  window.nativeRequestPushToken = () => new Promise((resolve) => {
    const onMsg = (ev) => {
      if (ev.detail?.type !== "pushToken") return;
      window.removeEventListener("native-message", onMsg);
      resolve(ev.detail.token || null);
    };
    window.addEventListener("native-message", onMsg);
    send({ type: "requestPushToken" });
    setTimeout(() => { window.removeEventListener("native-message", onMsg); resolve(null); }, 15000);
  });

  // Print views write their HTML into window.open("") – a pop-up the WebView can't show
  // (blank page). Collect the HTML instead: the app prints it natively (expo-print),
  // older builds show it in an in-page preview with a share button.
  function showPrintPreview(html) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:#fff;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top)";
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:8px;justify-content:space-between;padding:10px 12px;background:#0b1120;border-bottom:1px solid #1e293b";
    const mk = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.style.cssText = "background:#334155;color:#fff;border:0;border-radius:10px;padding:10px 16px;font:600 15px system-ui"; b.onclick = fn; return b; };
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", ""); // no scripts: the auto-print script of the page must not run
    frame.style.cssText = "flex:1;border:0;width:100%;background:#fff";
    const fit = '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:14px!important}.letter,.letter--big{width:auto!important;max-width:100%!important;box-sizing:border-box}table{display:block;overflow-x:auto}img{max-width:100%}</style>';
    frame.srcdoc = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<\/head>/i, fit + "</head>");
    const close = mk("Schließen", () => wrap.remove());
    const share = mk("Teilen", () => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      send({ type: "share", title: doc.title || "Advently", text: (doc.body.innerText || doc.body.textContent || "").trim() });
    });
    bar.append(close, share);
    wrap.append(bar, frame);
    document.body.appendChild(wrap);
  }
  function printWindowStub() {
    let html = "";
    const stub = {
      document: { open() {}, write(h) { html += String(h); }, writeln(h) { html += String(h) + "\n"; }, close() {
        if (!html) return;
        const out = html; html = "";
        if (native.print) send({ type: "print", html: out }); else showPrintPreview(out);
      } },
      focus() {}, print() {}, close() {}, closed: false,
    };
    return stub;
  }

  // Other pop-ups: open them as normal navigation instead.
  const origOpen = window.open;
  window.open = function (url, target, features) {
    if (!url || url === "" || url === "about:blank") return printWindowStub();
    try {
      const u = new URL(url, window.location.href);
      if (u.origin === window.location.origin) { window.location.href = u.href; return null; }
      send({ type: "openExternal", url: u.href });
      return null;
    } catch (_) {
      return origOpen.call(window, url, target, features);
    }
  };
})();
