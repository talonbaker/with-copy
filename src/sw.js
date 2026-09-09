// sw.js — service worker (spec §10). Precache the whole app shell by
// root-absolute URL, serve precached URLs cache-first, everything else
// network-only. On activate, drop every other cache and take over open
// clients, then tell them a new version is active so the app can toast.
//
// VERSION is the literal string 'dev' in source. The deploy workflow
// (.github/workflows/pages.yml) replaces it with the commit SHA via `sed`
// before the Pages upload — a string substitution, not a build step — so
// every deploy gets its own cache name and old caches are cleaned up on the
// next activate.

const VERSION = 'dev';
const CACHE_NAME = `wcopy-${VERSION}`;

// Every file under src/ that the app needs to run offline, as the
// root-absolute paths clients actually request, except src/probe.html,
// src/js/probe.js, and src/css/probe.css (the probe is temporary and never
// needs to work offline) and sw.js itself (the browser manages the service
// worker script's own update checks outside Cache Storage; precaching it
// here would add nothing and risks confusing that mechanism).
//
// Keep this list exact: cache.addAll rejects, and the install fails, if any
// URL 404s. Every task that adds a file under src/ appends it here.
const PRECACHE_URLS = [
  '/',
  '/app/',
  '/manifest.webmanifest',
  '/css/tokens.css',
  '/css/app.css',
  '/js/main.js',
  '/js/store.js',
  '/js/schema.js',
  '/js/merge.js',
  '/js/clipboard.js',
  '/js/link.js',
  '/js/ui/toast.js',
  '/js/ui/undo.js',
  '/js/ui/stack-view.js',
  '/js/ui/piece-card.js',
  '/js/ui/variants.js',
  '/js/ui/expand.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'WCOPY_UPDATE_ACTIVATED', version: VERSION });
        }
      })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // not ours to serve
  if (!PRECACHE_URLS.includes(url.pathname)) return; // network-only

  event.respondWith(
    caches.match(request, { cacheName: CACHE_NAME }).then((cached) => cached || fetch(request))
  );
});
