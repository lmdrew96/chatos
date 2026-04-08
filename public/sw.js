// Cha(t)os Service Worker — Push Notifications

const SW_VERSION = "1.0.0";

self.addEventListener("install", (event) => {
  console.log(`[SW ${SW_VERSION}] Install`);
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log(`[SW ${SW_VERSION}] Activate`);
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  console.log(`[SW ${SW_VERSION}] Push received`);
  if (!event.data) return;

  const data = event.data.json();
  const { title, body, url, tag } = data;

  event.waitUntil(
    self.registration.showNotification(title || "Cha(t)os", {
      body: body || "New activity",
      icon: "/web-app-manifest-192x192.png",
      badge: "/web-app-manifest-192x192.png",
      tag: tag || "chatos-default",
      renotify: true,
      data: { url: url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  console.log(`[SW ${SW_VERSION}] Notification clicked`);
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (new URL(client.url).origin === self.location.origin) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
