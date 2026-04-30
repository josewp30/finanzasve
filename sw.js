self.addEventListener('install', (event) => {
    self.skipWaiting(); // Bypass waiting to immediately update the SW
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => caches.delete(cacheName))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Development mode: Network only, completely bypass cache
    event.respondWith(fetch(event.request));
});
