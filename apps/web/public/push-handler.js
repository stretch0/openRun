/* eslint-disable no-restricted-globals -- in a service worker, `self` is the global. */
// Loaded into the Workbox service worker (see vite.config.mts): shows Web
// Push notifications from openRun and opens the right page when tapped.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'openRun', {
      body: data.body,
      tag: data.tag,
      icon: '/pwa-192x192.png',
      badge: '/favicon.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        await open.focus();
        try {
          await open.navigate(url);
          return;
        } catch {
          // Not controlled by this worker yet; open a new window instead.
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
