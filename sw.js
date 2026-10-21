/* Service worker — fonctionnement hors ligne.
   Stratégie : « stale-while-revalidate » sur les fichiers de l'app (même origine uniquement).
   Pour publier une mise à jour, incrémente VERSION ci-dessous. */
const VERSION = 'v1.0.0';
const CACHE = `mon-budget-${VERSION}`;

// Chemins relatifs : compatibles avec https://<utilisateur>.github.io/<depot>/
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('mon-budget-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // jamais de requête tierce

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    const network = fetch(req)
      .then(res => {
        if (res && res.ok && res.type === 'basic' && !res.redirected) cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(network); // met à jour le cache en arrière-plan
      return cached;
    }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return Response.error();
  })());
});
