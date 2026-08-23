const CACHE = "moharambake-delivery-v2";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /*
   * Never cache Google Apps Script API responses.
   * This is critical for the delivery dashboard because
   * Refresh must show newly created orders.
   */
  if (
    url.hostname.includes("script.google.com") ||
    url.hostname.includes("googleusercontent.com")
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();

        caches.open(CACHE).then(cache => {
          cache.put(request, copy);
        });

        return response;
      })
      .catch(() => caches.match(request))
  );
});
