const CACHE = 'fooddesk-shell-v1';
const SHELL = ['/', '/?mode=cashier', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const cacheable = request.mode === 'navigate' || url.pathname.startsWith('/_next/static/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/sw.js';
  if (request.method !== 'GET' || url.origin !== self.location.origin || !cacheable) return;
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached ?? caches.match('/')))
  );
});
