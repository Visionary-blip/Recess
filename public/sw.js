// Service worker: shows push notifications and keeps the app shell available offline.
const CACHE = "recess-shell-v3";
const PENDING = "recess-pending"; // holds the page a tapped notification wants to open

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("recess-shell-") && k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Network first, cache as the offline fallback. API calls are never cached.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { /* non-JSON push */ }
  e.waitUntil(
    self.registration.showNotification(data.title || "New booking request", {
      body: data.body || "Someone just sent an inquiry.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "booking-request",
      renotify: true,
      data: { url: data.url || "/" },
    })
  );
});

// Tapping a notification must land on the page it's about. Phones differ in what they allow
// (navigating an open window, opening a window inside the installed app), so three things happen:
//  1. the target is written to a small cache the page reads on launch or when it comes to the front,
//  2. any open window is told to go there, and is focused,
//  3. if no window is open, a new one is opened at that address.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const path = (e.notification.data && e.notification.data.url) || "/";
  const url = new URL(path, self.location.origin).href;
  e.waitUntil(
    (async () => {
      const cache = await caches.open(PENDING);
      await cache.put("/pending", new Response(url));
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        w.postMessage({ type: "open", url });
        try { await w.focus(); return; } catch { /* try the next window */ }
      }
      await self.clients.openWindow(url);
    })()
  );
});
