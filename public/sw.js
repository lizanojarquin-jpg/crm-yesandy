// Service worker del CRM Yesandy: solo notificaciones. No guarda páginas en caché,
// así nadie ve conversaciones viejas o de otra sesión.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { titulo: "CRM Yesandy", cuerpo: event.data ? event.data.text() : "" };
  }
  const titulo = data.titulo || "CRM Yesandy";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: data.cuerpo || "",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      // Mismo "tag" = reemplaza el aviso anterior de esa conversación en vez de amontonarlos,
      // pero vuelve a sonar y vibrar (renotify).
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      silent: false,
      vibrate: [250, 120, 250, 120, 250],
      timestamp: Date.now(),
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Si el CRM ya está abierto, se usa esa ventana.
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin && "focus" in v) {
          await v.navigate(destino).catch(() => null);
          return v.focus();
        }
      }
      return self.clients.openWindow(destino);
    })(),
  );
});
