// Flashcards offline support – cache app and data when you have signal
const CACHE_NAME = "flashcards-offline-v1";

// On install: cache app shell and all data (categories + CSV files)
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([
        "index.html",
        "styles.css",
        "app.js",
        "manifest.json",
        "data/categories.json",
      ]);

      // Cache all category CSV files so they work offline
      try {
        const res = await fetch("data/categories.json");
        const data = await res.json();
        const categories = data.categories || [];
        const csvUrls = categories.map((c) => `data/${c}.csv`);
        await cache.addAll(csvUrls);
      } catch (e) {
        console.warn("SW: could not precache category CSVs", e);
      }

      self.skipWaiting();
    })()
  );
});

// Take control of clients as soon as the new SW is active
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Serve: network first, fallback to cache (so offline uses cached data)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.registration.scope)) return;

  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (e) {
        const cached = await caches.match(event.request);
        return cached || new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })()
  );
});
