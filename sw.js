const CACHE_NAME = 'fve-static-v2';
const PRECACHE_URLS = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json',
    './icon.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests from same origin (assets)
    if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
        return event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // Save a copy of the response to the cache for future requests
                if (response && response.status === 200 && response.type === 'basic') {
                    const respClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, respClone));
                }
                return response;
            }).catch(() => caches.match('./index.html'));
        })
    );
});
