const CACHE_NAME = 'garage-master-v1';
const ASSETS = [
    './',
    './index.html',
    './script.js',
    './styles.css',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/dexie/dist/dexie.js',
    'https://unpkg.com/lucide@latest',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install Event - Caching Assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            console.log('Caching assets...');
            for (const asset of ASSETS) {
                try {
                    await cache.add(asset);
                } catch (e) {
                    console.warn('Failed to cache asset:', asset, e);
                }
            }
        })
    );
});

// Activate Event - Cleaning old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
});

// Fetch Event - Serve from cache or network
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});
