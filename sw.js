// FinanzasVE — Service Worker simple y seguro (actualización automática)

self.addEventListener("install", () => {
  // Activar inmediatamente
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Tomar control de todas las pestañas
  event.waitUntil(clients.claim());
});

// Importante: NO interceptamos fetch
// Importante: NO cacheamos nada
