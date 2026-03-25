// FinanzasVE — Service Worker v1.1
const CACHE = 'finanzasve-v1.4';

self.addEventListener('install', e => {
  // NO skipWaiting aquí — esperamos confirmación del usuario
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([])));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// El cliente pide activar la nueva versión
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Network first — caché como fallback offline
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (!url.href.includes('github.io') && url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
