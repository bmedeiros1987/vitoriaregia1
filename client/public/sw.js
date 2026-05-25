
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title:'Vitória Régia', body: event.data ? event.data.text() : '' }; }
  const text = (data.title || '') + ' ' + (data.body || '');
  const critical = /incêndio|fogo|invasão|emergência/i.test(text);
  const options = {
    body: data.body || '',
    tag: data.tag || 'vitoria-regia',
    requireInteraction: critical,
    silent: false,
    vibrate: critical ? [1200, 300, 1200, 300, 1200] : [250, 100, 250],
    data: { url: data.url || data.action_url || '/' }
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Vitória Régia', options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
    for (const client of list) { if ('focus' in client) { client.navigate(url); return client.focus(); } }
    return clients.openWindow(url);
  }));
});
