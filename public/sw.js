// Flashcards offline support – cache app and data when you have signal
const CACHE_NAME = "flashcards-offline-v2";

// On install: cache app shell and all data (categories + CSV files)
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(["index.html", "styles.css", "app.js", "manifest.json", "data/categories.json"]);

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
    })(),
  );
});

// Take control of clients as soon as the new SW is active
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => {
        return Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
      })
      .then(() => self.clients.claim()),
  );
});

// Try network first with a timeout; fall back to cache if:
// - the network is offline / errors, or
// - the network request takes longer than the timeout (e.g. 10 seconds)
async function networkFirstWithTimeout(request, timeoutMs = 10000) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (e) {
    if (cachedResponse) {
      return cachedResponse;
    }
    throw e;
  }
}

async function cacheFirstThenRevalidate(request, timeoutMs = 2500) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const fetchAndUpdate = (async () => {
    try {
      const networkResponse = await fetch(request, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (networkResponse && networkResponse.status === 200) {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (e) {
      clearTimeout(timeoutId);
      return null;
    }
  })();

  if (cachedResponse) {
    // Update in background; serve cached immediately for "poor connection" cases.
    return { response: cachedResponse, revalidatePromise: fetchAndUpdate };
  }

  // No cache available: try network (with short timeout), then fall back to whatever cache match exists.
  const networkResponse = await fetchAndUpdate;
  if (networkResponse) return { response: networkResponse, revalidatePromise: Promise.resolve() };

  const fallbackCached = await cache.match(request);
  if (fallbackCached) return { response: fallbackCached, revalidatePromise: Promise.resolve() };

  throw new Error("No cached response and network failed.");
}

// Serve: network first with timeout, fallback to cache/offline
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.registration.scope)) return;

  event.respondWith(
    (async () => {
      try {
        const url = new URL(event.request.url);
        const isDataRequest = url.pathname.includes("/data/") && (url.pathname.endsWith(".csv") || url.pathname.endsWith(".json"));

        if (isDataRequest) {
          const { response, revalidatePromise } = await cacheFirstThenRevalidate(event.request, 2500);
          event.waitUntil(revalidatePromise);
          return response;
        }

        // App shell: still prefer network (but with timeout) so updates propagate.
        return await networkFirstWithTimeout(event.request, 8000);
      } catch (e) {
        const cached = await caches.match(event.request);
        return cached || new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })(),
  );
});
