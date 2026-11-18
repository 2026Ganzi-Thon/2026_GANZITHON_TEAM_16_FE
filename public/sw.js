// Online app: never store API responses, user pages, OAuth codes or photos.
const CACHE = 'mowoo-pwa-v1';
const OFFLINE = '/offline.html';
const STATIC = [OFFLINE, '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)));
  // Let the current version finish; do not force-reload an active conversation.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mowoo-pwa-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin
    || url.pathname.startsWith('/api/') || url.pathname.startsWith('/login/oauth2/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match(OFFLINE))));
  } else if (STATIC.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fetch(request)));
  }
});
