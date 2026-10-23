// Service worker: makes the app start without internet.
//
// tools/build-pages.mjs stamps BUILD with a build id and writes asset-manifest.json (the list of all files)
// when the site is deployed. Every build gets its own cache; the new one is filled completely before it
// takes over, so the page never mixes files of two versions. An unstamped sw.js (local development with
// `python3 -m http.server`) does not cache anything, so edits show up immediately.

const BUILD = '__BUILD__';
const DEV = BUILD.startsWith('__');
const PREFIX = 'qcv-';
const CACHE = PREFIX + BUILD;

self.addEventListener('install', (event) => {
  if (DEV) {
    self.skipWaiting();
    return;
  }
  event.waitUntil((async () => {
    const response = await fetch('asset-manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`asset-manifest.json: HTTP ${response.status}`);
    const { files } = await response.json();
    const cache = await caches.open(CACHE);
    // addAll is all-or-nothing: if one file fails, this build is not installed and the old one keeps running
    await cache.addAll(files.map((file) => new Request(file, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (DEV || request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (hit) return hit;
    try {
      return await fetch(request);
    } catch (error) {
      if (request.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
