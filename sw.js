// FinanzasVE — Service Worker con aviso de actualización

self.addEventListener("install", () => {
  // Instalar inmediatamente
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Tomar control de todas las pestañas
  event.waitUntil(clients.claim());
});

// Escuchar mensajes desde la app
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
