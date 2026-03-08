/**
 * Fetch tetapan PWA dari API (DB) dan kemas kini meta tag + manifest link.
 * Supaya nilai dari Tetapan → Smart 360 AI Edition dipaparkan pada PWA (theme, nama, ikon).
 */
import { useEffect } from 'react';
import api, { API_URL } from '../services/api';

function setMeta(name, content) {
  if (!content) return;
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setAppleTouchIcon(href) {
  if (!href) return;
  let el = document.querySelector('link[rel="apple-touch-icon"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'apple-touch-icon');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href.startsWith('http') ? href : `${window.location.origin}${href.startsWith('/') ? '' : '/'}${href}`);
}

const PWA_SETTINGS_TIMEOUT = 5000;

export function PwaMetaUpdater() {
  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PWA_SETTINGS_TIMEOUT);
    api.get('/api/public/settings/pwa', { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeoutId);
        const d = res.data || {};
        const name = d.name || 'Smart 360 AI Edition';
        const shortName = d.short_name || name;
        const themeColor = d.theme_color || '#0f766e';
        const desc = d.description || 'Sistem Pengurusan Maktab Bersepadu';
        const pageTitle = (d.page_title || '').trim();

        setMeta('theme-color', themeColor);
        setMeta('apple-mobile-web-app-title', shortName);
        setMeta('apple-mobile-web-app-status-bar-style', 'default');
        setMeta('description', desc);
        setAppleTouchIcon(d.icon_192_url || '/icons/icon-192x192.png');

        if (pageTitle) document.title = pageTitle;
        else document.title = `${shortName} - SMART360: Ai Edition`;

        // Manifest dinamik dari DB (nama, warna, ikon)
        const base = (API_URL || '').replace(/\/$/, '');
        const manifestUrl = base ? `${base}/api/manifest` : '/api/manifest';
        let link = document.querySelector('link[rel="manifest"]');
        if (!link) {
          link = document.createElement('link');
          link.setAttribute('rel', 'manifest');
          document.head.appendChild(link);
        }
        link.setAttribute('href', manifestUrl);
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timeoutId); });
  }, []);
  return null;
}
