/**
 * Smart360 PWA - Service Worker registration & version check
 * Auto-update: fetch /api/pwa/version and skipWaiting if newer
 */

const SW_URL = `${process.env.PUBLIC_URL || ''}/service-worker.js`;
const VERSION_URL = `${process.env.REACT_APP_API_URL || ''}/api/pwa/version`;

export function register(config = {}) {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);

  return window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: process.env.PUBLIC_URL || '/' })
      .then((registration) => {
        registration.onupdatefound = () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.onstatechange = () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              config.onUpdate?.();
            }
          };
        };
        checkVersion(registration, config);
        return registration;
      })
      .catch((err) => {
        config.onError?.(err);
      });
  });
}

async function checkVersion(registration, config) {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    const serverVersion = data.version || data.build_id;
    const currentVersion = process.env.REACT_APP_VERSION || process.env.REACT_APP_BUILD_ID || '1';
    if (serverVersion && serverVersion !== currentVersion && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      config.onUpdate?.();
    }
  } catch (_) {}
}

export function unregister() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((registration) => registration.unregister());
}
