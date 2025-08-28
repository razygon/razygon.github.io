// Basic offline-first service worker for Gym Tracker
const CACHE_NAME = 'gym-tracker-cache-v1';
const OFFLINE_ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css', // not used but safe
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  // CDN assets to cache for offline use (Chart.js)
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];

self.addEventListener('install', (event)=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(OFFLINE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event)=>{
  const req = event.request;
  // Strategy: try cache first, then network, then fallback to cache
  event.respondWith((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if(cached) return cached;
    try{
      const res = await fetch(req);
      // only cache GET and successful
      if(req.method==='GET' && res && res.status===200 && (new URL(req.url)).protocol.startsWith('http')){
        cache.put(req, res.clone());
      }
      return res;
    }catch(err){
      const fallback = await cache.match('./index.html');
      return fallback || Response.error();
    }
  })());
});
