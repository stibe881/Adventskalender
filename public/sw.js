const CACHE_NAME = "advent-cache-v2";
const ASSETS = [
  "/",
  "/shared/styles.css",
  "/vendor/gsap/gsap.min.js",
  "/calendar/themes.css",
  "/calendar/js/atmosphere.js",
  "/calendar/js/themes.js",
  "/calendar/js/art.js",
  "/calendar/js/particles.js",
  "/calendar/js/scenes.js",
  "/calendar/js/calendar.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  
  // Exclude API calls from caching entirely
  if (e.request.url.includes("/api/")) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((fetchRes) => {
        // Cache the latest version from network
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, fetchRes.clone());
          return fetchRes;
        });
      })
      .catch(() => {
        // If network fails (offline), fall back to cache
        return caches.match(e.request).then((res) => {
          return res || caches.match("/");
        });
      })
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "Neues Türchen!", body: "Es gibt etwas Neues zu entdecken." };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch(e) {
      payload.body = event.data.text();
    }
  }
  
  const options = {
    body: payload.body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    vibrate: [100, 50, 100],
    data: {
      url: payload.url || "/"
    }
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const target = (event.notification.data && event.notification.data.url) || "/";
      // Focus the page if it is already open
      for (const client of clientList) {
        if (client.url.includes(target) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(target);
      }
    })
  );
});
