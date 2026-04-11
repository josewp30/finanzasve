// version 3 - 2024-04-10 (Forzar refresco tras corregir bug loading)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          return caches.delete(cacheName); // Limpiar cachés viejos
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Estrategia: Network only para evitar cacheo de datos obsoletos en esta etapa de corrección
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
