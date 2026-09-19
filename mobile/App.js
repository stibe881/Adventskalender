// Adventskalender & Wichteln – native Hülle mit Expo.
// Lädt die gehostete Web-App (extra.serverUrl in app.json) und ergänzt sie um
// Deep Links, Zurück-Taste, Teilen, Haptik, externe Links, Downloads und Push.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as SplashScreen from "expo-splash-screen";
import Constants from "expo-constants";
import NetInfo from "@react-native-community/netinfo";

SplashScreen.preventAutoHideAsync().catch(() => {});

const SERVER_URL = String(Constants.expoConfig?.extra?.serverUrl || "https://adventskalender.example.ch").replace(/\/+$/, "");
const SERVER_ORIGIN = new URL(SERVER_URL).origin;
const BG = "#0b1120";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Runs inside the page before anything else: tells native.js it lives in the app.
const INJECTED_BEFORE_LOAD = `
  window.__NATIVE_APP = { platform: ${JSON.stringify(Platform.OS)}, runtime: "expo" };
  true;
`;

// Turns an incoming deep link (https://server/c/…, adventskalender://c/…) into a path on the server.
function pathFromDeepLink(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.origin === SERVER_ORIGIN) return u.pathname + u.search;
    if (u.protocol === "adventskalender:") {
      const path = `/${(u.host || "") + u.pathname}`.replace(/\/{2,}/g, "/");
      return path + u.search;
    }
  } catch (_) { /* ignore */ }
  return null;
}

async function registerForPush() {
  if (!Device.isDevice) return null;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", { name: "Erinnerungen", importance: Notifications.AndroidImportance.DEFAULT, sound: "default" });
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token?.data || null;
  } catch (err) {
    console.warn("Push-Registrierung fehlgeschlagen:", err?.message);
    return null;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

function Shell() {
  const webRef = useRef(null);
  const [initialPath, setInitialPath] = useState(null); // null = still resolving the launch URL
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(null);
  const [offline, setOffline] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const pushToken = useRef(null);

  // Launch URL (cold start via deep link or notification) decides the first page.
  useEffect(() => {
    (async () => {
      const launchUrl = await Linking.getInitialURL();
      const lastNotification = await Notifications.getLastNotificationResponseAsync();
      const fromNotification = lastNotification?.notification?.request?.content?.data?.url;
      setInitialPath(pathFromDeepLink(launchUrl) || (typeof fromNotification === "string" ? fromNotification : null) || "/");
    })();
  }, []);

  // Deep links while running.
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      const path = pathFromDeepLink(url);
      if (path) navigateTo(path);
    });
    return () => sub.remove();
  }, [navigateTo]);

  // Tapping a notification opens the page it points to.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const url = resp.notification.request.content.data?.url;
      if (typeof url === "string") navigateTo(url);
    });
    return () => sub.remove();
  }, [navigateTo]);

  // Offline banner.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => setOffline(state.isConnected === false));
    return () => unsub();
  }, []);

  // Android hardware back button: let the page handle modals first, then history.
  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const handler = () => {
      webRef.current?.injectJavaScript(`
        (function(){
          var m = document.querySelector(".fixed.inset-0:not(.hidden), #content-modal:not(.hidden), #shop-modal:not(.hidden)");
          if (m) { m.classList.add("hidden"); window.ReactNativeWebView.postMessage(JSON.stringify({ type: "backHandled" })); return; }
          if (${canGoBack ? "true" : "false"}) history.back(); else window.ReactNativeWebView.postMessage(JSON.stringify({ type: "exit" }));
        })(); true;`);
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", handler);
    return () => sub.remove();
  }, [canGoBack]);

  const navigateTo = useCallback((path) => {
    const target = path.startsWith("http") ? path : `${SERVER_URL}${path.startsWith("/") ? "" : "/"}${path}`;
    webRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(target)}; true;`);
  }, []);

  const sendToPage = useCallback((msg) => {
    webRef.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent("native-message", { detail: ${JSON.stringify(msg)} })); true;`);
  }, []);

  // Messages from native.js inside the page.
  const onMessage = useCallback(async (event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch (_) { return; }
    switch (msg.type) {
      case "share":
        try { await Share.share({ title: msg.title, message: [msg.text, msg.url].filter(Boolean).join("\n"), url: msg.url }); } catch (_) {}
        break;
      case "haptic": {
        const style = { light: Haptics.ImpactFeedbackStyle.Light, medium: Haptics.ImpactFeedbackStyle.Medium, heavy: Haptics.ImpactFeedbackStyle.Heavy }[msg.style] || Haptics.ImpactFeedbackStyle.Light;
        Haptics.impactAsync(style).catch(() => {});
        break;
      }
      case "openExternal":
        if (typeof msg.url === "string") WebBrowser.openBrowserAsync(msg.url).catch(() => Linking.openURL(msg.url));
        break;
      case "download":
        // ICS / PDF: hand over to the system so the OS offers the right app.
        if (typeof msg.url === "string") Linking.openURL(msg.url).catch(() => WebBrowser.openBrowserAsync(msg.url));
        break;
      case "requestPushToken": {
        if (!pushToken.current) pushToken.current = await registerForPush();
        sendToPage({ type: "pushToken", token: pushToken.current, platform: Platform.OS });
        break;
      }
      case "exit":
        BackHandler.exitApp();
        break;
      default:
        break;
    }
  }, [sendToPage]);

  const onNavigationStateChange = useCallback((nav) => {
    setCanGoBack(nav.canGoBack);
  }, []);

  // Everything outside the server (shops, Spotify login result pages, mailto) leaves the WebView.
  const onShouldStartLoadWithRequest = useCallback((req) => {
    if (!req.url) return true;
    if (req.url.startsWith(SERVER_ORIGIN) || req.url.startsWith("about:")) return true;
    if (/^https?:\/\/(accounts\.spotify\.com|.*\.spotify\.com)/.test(req.url)) return true; // OAuth stays in-app
    if (/^(mailto|tel|sms):/.test(req.url) || req.url.startsWith("http")) {
      Linking.openURL(req.url).catch(() => {});
      return false;
    }
    return true;
  }, []);

  const source = useMemo(() => (initialPath === null ? null : { uri: `${SERVER_URL}${initialPath}` }), [initialPath]);

  const hideSplash = useCallback(() => { SplashScreen.hideAsync().catch(() => {}); }, []);

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <StatusBar style="light" backgroundColor={BG} />
      {offline && (
        <View style={styles.offline}><Text style={styles.offlineText}>Keine Internetverbindung</Text></View>
      )}
      {source && !failed && (
        <WebView
          key={reloadKey}
          ref={webRef}
          source={source}
          style={styles.web}
          originWhitelist={["*"]}
          injectedJavaScriptBeforeContentLoaded={INJECTED_BEFORE_LOAD}
          onMessage={onMessage}
          onNavigationStateChange={onNavigationStateChange}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onLoadEnd={() => { setLoading(false); hideSplash(); }}
          onError={({ nativeEvent }) => { setFailed(nativeEvent.description || "Server nicht erreichbar"); hideSplash(); }}
          onHttpError={({ nativeEvent }) => { if (nativeEvent.statusCode >= 500) setFailed(`Serverfehler ${nativeEvent.statusCode}`); }}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          pullToRefreshEnabled
          applicationNameForUserAgent="AdventskalenderApp/1.0"
          startInLoadingState={false}
          decelerationRate="normal"
          contentInsetAdjustmentBehavior="never"
          // Geolocation for "Standort"-Türchen, file input for photo uploads
          geolocationEnabled
          allowFileAccess
        />
      )}
      {(loading && !failed) && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color="#34d399" />
        </View>
      )}
      {failed && (
        <View style={styles.center}>
          <Text style={styles.icon}>🎄</Text>
          <Text style={styles.title}>Adventskalender & Wichteln</Text>
          <Text style={styles.msg}>{offline ? "Keine Internetverbindung. Bitte prüfe dein Netz." : `Der Server ist gerade nicht erreichbar.\n${failed}`}</Text>
          <Pressable style={styles.btn} onPress={() => { setFailed(null); setLoading(true); setReloadKey((k) => k + 1); }}>
            <Text style={styles.btnText}>Erneut versuchen</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  web: { flex: 1, backgroundColor: BG },
  center: { ...StyleSheet.absoluteFillObject, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 32 },
  icon: { fontSize: 56, marginBottom: 8 },
  title: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  msg: { color: "#94a3b8", fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 320 },
  btn: { marginTop: 22, backgroundColor: "#059669", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  offline: { backgroundColor: "#b91c1c", paddingVertical: 6, alignItems: "center" },
  offlineText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
