// sw.js — FinanzasVE
// Regla crítica: NUNCA interceptar URLs de auth de Supabase
// El SW solo cachea assets estáticos, deja pasar todo lo de red en auth/DB

const CACHE_NAME = 'fve-static-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './chart.umd.min.js',
  './supabase.min.js',
  './main.js',
  './manifest.json',
];

// Patrones que SIEMPRE van a la red (nunca al caché)
const NETWORK_ONLY_PATTERNS = [
  /supabase\.co/,
  /supabase\.in/,
  /dolarapi\.com/,
  /googleapis\.com/,
  /fonts\.gstatic\.com/,
  /\?code=/,       // PKCE callback
  /token\?grant/,  // token exchange
  /auth\/v1/,      // cualquier auth endpoint
  /rest\/v1/,      // cualquier DB endpoint
  /realtime\/v1/,  // realtime
  /storage\/v1/,   // storage
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Pre-cachear assets estáticos, ignorando errores individuales
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((e) => console.warn('[SW] Could not cache', url, e))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Cualquier patrón de "solo red" — pasar directo, SIN tocar el caché
  const isNetworkOnly = NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(url));
  if (isNetworkOnly) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para el resto: Cache-first con fallback a red
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Solo cachear respuestas válidas de GET
        if (
          event.request.method === 'GET' &&
          response &&
          response.status === 200 &&
          response.type !== 'opaque'
        ) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      });
    }).catch(() => fetch(event.request))
  );
});

// Mensaje desde la app para forzar update
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
