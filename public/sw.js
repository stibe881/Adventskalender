const CACHE_NAME = "advent-cache-v1";
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

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request).then((fetchRes) => {
        return caches.open(CACHE_NAME).then((cache) => {
          // Cache dynamic assets too, except API calls
          if (!e.request.url.includes("/api/")) {
            cache.put(e.request, fetchRes.clone());
          }
          return fetchRes;
        });
      });
    }).catch(() => caches.match("/"))
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
      url: "/"
    }
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus if already open
      for (const client of clientList) {
        if (client.url.includes("/c/") && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new tab
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
