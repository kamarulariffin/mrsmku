/**
 * Smart360 PWA Service Worker
 * - Cache First: static assets (js, css, images, fonts)
 * - Network First: API calls
 * - Offline fallback for navigation
 * - Auto-update: skipWaiting when new version deployed
 * - Push notifications (FCM)
 */

const CACHE_STATIC = 'smart360-static-v1';
const CACHE_API = 'smart360-api-v1';
const VERSION_CHECK_URL = '/api/pwa/version';

// Static extensions → Cache First
const STATIC_PATTERNS = [
  /\.js$/,
  /\.css$/,
  /\.woff2?$/,
  /\.ttf$/,
  /\.ico$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.svg$/,
  /\.webp$/,
  /\.gif$/,
];

function isStaticRequest(url) {
  try {
    const path = new URL(url).pathname;
    return STATIC_PATTERNS.some((re) => re.test(path));
  } catch {
    return false;
  }
}

function isApiRequest(url) {
  try {
    return new URL(url).pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

// Install: precache critical static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
      ]).catch(() => {});
    })
  );
});

// Activate: claim clients, clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n.startsWith('smart360-') && n !== CACHE_STATIC && n !== CACHE_API)
          .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Cache First (static) / Network First (API)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_API).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (isStaticRequest(url)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then((c) => c.put(request, clone));
          return res;
        })
      )
    );
    return;
  }

  event.respondWith(fetch(request));
});

// Push (FCM)
self.addEventListener('push', (event) => {
  let data = {
    title: 'Smart 360 AI Edition',
    body: 'Anda mempunyai notifikasi baru',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: 'default',
    data: { url: '/' },
  };
  try {
    if (event.data) data = { ...data, ...event.data.json(); };
  } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192x192.png',
      badge: data.badge || '/icons/icon-192x192.png',
      tag: data.tag || 'n-' + Date.now(),
      vibrate: [200, 100, 200],
      requireInteraction: data.priority === 'urgent' || data.priority === 'high',
      data: data.data || { url: '/' },
      actions: data.actions || [
        { action: 'view', title: 'Lihat' },
        { action: 'dismiss', title: 'Tutup' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.postMessage({ type: 'NOTIFICATION_CLICK', url, data: event.notification.data });
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
