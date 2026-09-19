/* Native bridge for the Capacitor apps (iOS/Android). Harmless in a normal browser.
 * Capacitor injects window.Capacitor into pages loaded from the configured server.url,
 * so this file can use the native plugins without any build step. */
(function () {
  const cap = window.Capacitor;
  const isNative = Boolean(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
  document.documentElement.classList.toggle("is-native-app", isNative);
  if (!isNative) return;
  const P = cap.Plugins || {};
  const platform = cap.getPlatform();
  document.documentElement.classList.add(`is-${platform}`);

  // Safe areas (notch / home indicator) for fixed elements.
  const style = document.createElement("style");
  style.textContent = `
    html.is-native-app body { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
    html.is-native-app header.sticky { top: env(safe-area-inset-top); }
    html.is-native-app #controls { top: calc(env(safe-area-inset-top) + 8px) !important; }
    html.is-native-app #digital-pet { bottom: calc(env(safe-area-inset-bottom) + 16px) !important; }
    html.is-native-app .w-toast, html.is-native-app .toast { bottom: calc(env(safe-area-inset-bottom) + 24px) !important; }
    html.is-native-app a[href^="http"] { -webkit-touch-callout: none; }
  `;
  document.head.appendChild(style);

  // Status bar + splash
  try { P.StatusBar && P.StatusBar.setStyle({ style: "DARK" }); } catch (_) {}
  try { P.StatusBar && platform === "android" && P.StatusBar.setBackgroundColor({ color: "#0b1120" }); } catch (_) {}
  window.addEventListener("load", () => { try { P.SplashScreen && P.SplashScreen.hide(); } catch (_) {} });

  // Android hardware back button: go back in history, otherwise minimise the app.
  if (P.App && P.App.addListener) {
    P.App.addListener("backButton", ({ canGoBack }) => {
      const openModal = document.querySelector(".fixed.inset-0:not(.hidden), #content-modal:not(.hidden), #shop-modal:not(.hidden)");
      if (openModal) { openModal.classList.add("hidden"); return; }
      if (canGoBack && window.history.length > 1) window.history.back();
      else P.App.exitApp();
    });
    // Deep links (https://deine-domain/c/… or /w/…) opened from outside land here.
    P.App.addListener("appUrlOpen", ({ url }) => {
      try {
        const u = new URL(url);
        if (u.origin === window.location.origin) window.location.href = u.pathname + u.search;
      } catch (_) {}
    });
  }

  // External links open in the system browser; Spotify OAuth stays in-app (allowed in capacitor.config).
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!/^https?:/i.test(href)) return;
    let u;
    try { u = new URL(href, window.location.href); } catch (_) { return; }
    if (u.origin === window.location.origin) return;
    e.preventDefault();
    if (P.Browser) P.Browser.open({ url: u.href, presentationStyle: "popover" });
    else window.open(u.href, "_blank");
  }, true);

  // Native share sheet for anything the web app wants to share.
  window.nativeShare = async ({ title, text, url }) => {
    if (P.Share) { await P.Share.share({ title, text, url, dialogTitle: title }); return true; }
    if (navigator.share) { await navigator.share({ title, text, url }); return true; }
    return false;
  };
  window.nativeHaptic = (type = "light") => { try { P.Haptics && P.Haptics.impact({ style: type.toUpperCase() }); } catch (_) {} };

  // Downloads (ICS, PDF prints) don't work inside the WebView – hand them to the system browser.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href$='.ics'], a[download]");
    if (!a) return;
    e.preventDefault();
    const url = new URL(a.getAttribute("href"), window.location.href).href;
    if (P.Browser) P.Browser.open({ url }); else window.open(url, "_blank");
  }, true);
})();
