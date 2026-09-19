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

  // Print views can't open pop-ups in the WebView: open them as normal navigation instead.
  const origOpen = window.open;
  window.open = function (url, target, features) {
    if (!url || url === "" || url === "about:blank") return origOpen.call(window, url, target, features);
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
