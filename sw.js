// Bump this version whenever a static application file changes.
const CACHE_PREFIX = `law-office-static-${self.registration.scope}-`;
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const BASE = self.registration.scope;
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './assets/styles.css', './assets/app.js', './assets/register-sw.js',
  './assets/icon.svg', './assets/accountant-signature.png'
].map(path => new URL(path, BASE).href);
const SHELL_URLS = new Set(FILES);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(BASE)) return;
  const navigation = event.request.mode === 'navigate';
  if (!navigation && !SHELL_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok && !response.redirected && SHELL_URLS.has(url.href)) {
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (navigation) {
        const index = await cache.match(new URL('./index.html', BASE).href);
        if (index) return index;
      }
      throw error;
    }
  })());
});
