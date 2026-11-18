// Offline support for the installed app (Add to Home Screen). Network first, so a new deploy is picked up straight away;
// the cache is only the fallback when there is no connection.
const CACHE = 'pbd-v1';
const CORE = [
  './', './index.html', './manifest.webmanifest', './favicon.svg', './icon-192.png', './apple-touch-icon.png',
  './vendor/three.module.js', './src/styles.css', './src/main.js', './src/input.js', './src/replay.js',
  './src/sim/index.js', './src/sim/constants.js', './src/sim/rng.js', './src/sim/util.js', './src/sim/physics.js',
  './src/sim/shots.js', './src/sim/rules.js', './src/sim/ai.js', './src/sim/sim.js',
  './src/render/index.js', './src/render/character.js', './src/render/pose.js', './src/render/court.js',
  './src/render/effects.js', './src/render/util.js',
  './src/ui/menu.js', './src/ui/hud.js', './src/ui/audio.js', './src/ui/voice.js', './src/ui/i18n.js', './src/ui/store.js',
  './src/ui/text.js', './src/ui/dom.js', './src/ui/touch.js', './src/ui/device.js', './src/ui/wake.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') { const home = await cache.match('./index.html'); if (home) return home; }
      throw err;
    }
  })());
});
