self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Vitória Régia', body: event.data ? event.data.text() : '' }; }
  const critical = Boolean(data.critical || data.emergency || data.priority === 'critica');
  event.waitUntil(self.registration.showNotification(data.title || 'Vitória Régia', {
    body: data.body || '',
    icon: data.icon || '/logo-vitoria-regia.svg',
    badge: data.badge || '/logo-vitoria-regia.svg',
    tag: critical ? 'vr-emergencia' : (data.tag || 'vr-notificacao'),
    renotify: critical,
    requireInteraction: critical,
    silent: false,
    vibrate: critical ? [900, 220, 900, 220, 1400] : [200, 100, 200],
    data: { url: data.url || data.action_url || '/' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ('focus' in client) return client.focus().then(() => client.navigate(url));
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
