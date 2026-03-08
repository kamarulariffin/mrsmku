# Smart360 PWA – Panduan Deployment Production

## Ringkasan

Modul PWA (Progressive Web App) untuk **Sistem Bersepadu Smart360** dengan:
- **Frontend:** React (Create React App)
- **Backend:** FastAPI
- **Database:** MongoDB
- **Ciri:** Add to Home Screen, offline, cache strategy, push (FCM), version check, IndexedDB queue

---

## 1. Folder structure (PWA)

```
frontend/
├── public/
│   ├── manifest.json          # Smart360 name, theme_color, icons 192/512, display standalone
│   ├── service-worker.js      # Cache First (static), Network First (API), push, skipWaiting
│   ├── icons/
│   │   ├── icon-192x192.png   # Wajib untuk A2HS
│   │   └── icon-512x512.png   # Wajib untuk A2HS
│   └── index.html             # theme-color meta, apple-mobile-web-app
├── src/
│   ├── pwa/
│   │   ├── index.js
│   │   ├── registerServiceWorker.js   # Daftar SW, version check, onUpdate reload
│   │   ├── useOnlineStatus.js
│   │   ├── useOfflineSync.js           # Sync queue bila online
│   │   ├── offlineQueue.js             # IndexedDB: addToQueue, getPending, markSynced
│   │   ├── OnlineStatusIndicator.js
│   │   ├── SplashScreen.js
│   │   ├── SyncStatus.js
│   │   └── PwaMetaUpdater.js  # Meta + manifest dari DB
│   └── index.js               # register() SW in production
backend/
├── routes/
│   └── pwa.py                 # GET /api/pwa/version, POST /api/register-device-token, POST /api/send-notification
```

---

## 2. Tetapan Smart360 dari DB (manifest & meta)

Nilai PWA disimpan dalam **Tetapan Sistem → Smart360** dan dibaca dari pangkalan data. Backend: `GET /api/public/settings/pwa`, `GET /api/manifest`. Frontend `PwaMetaUpdater` mengemas kini meta (theme-color, apple-mobile-web-app-title, description, apple-touch-icon) dan pautan manifest ke `/api/manifest`. Nama aplikasi, warna bar status dan ikon A2HS ikut tetapan Ketetapan.

## 3. manifest.json (fallback statik)

- **name:** "Smart360"
- **short_name:** "Smart360"
- **theme_color:** #0f766e (teal – tukar ikut brand)
- **background_color:** #ffffff
- **display:** standalone
- **icons:** 192x192 dan 512x512 (format PNG, purpose any + maskable)

Pastikan fail `public/icons/icon-192x192.png` dan `public/icons/icon-512x512.png` wujud; jika tidak, “Add to Home Screen” mungkin gagal.

---

## 4. Service worker – strategi caching

- **Static (js, css, images, fonts):** Cache First (cache dulu, guna dari cache jika ada).
- **API (/api/*):** Network First (fetch dulu, simpan dalam cache API untuk fallback).
- **Navigate (halaman):** Fetch dulu, cache; jika offline guna cache atau index.html (SPA).
- **Auto-update:** Client panggil `GET /api/pwa/version`; jika version berbeza, SW boleh `skipWaiting()` dan app reload.

---

## 5. Offline & IndexedDB

- **offlineQueue.js:** Simpan permintaan API yang gagal (method, url, body, headers) ke IndexedDB (store `Smart360OfflineQueue`).
- **useOfflineSync:** Bila `navigator.onLine` true, baca pending dari IndexedDB, hantar semula request, mark synced dan buang yang sudah berjaya.

Dalam app, semasa offline anda boleh panggil `addToQueue('POST', '/api/...', body, headers)` selepas fetch gagal; sync akan berjalan automatik bila online.

---

## 6. HTTPS

PWA dan Service Worker **hendaklah** dihidangkan melalui **HTTPS** (kecuali localhost). Pastikan:

- Domain production guna TLS (contoh: Let’s Encrypt).
- `REACT_APP_API_URL` dan semua API juga melalui HTTPS.

---

## 7. Backend (FastAPI)

### GET /api/pwa/version (public)

- Return: `{ "version": "...", "name": "Smart360" }`
- `version` dari env `PWA_VERSION` atau `BUILD_ID`; set semasa deploy supaya SW tahu bila ada versi baharu.

### POST /api/register-device-token (JWT)

- Body (Pydantic): `fcm_token`, `device_type` (optional), `device_name` (optional).
- Simpan ke MongoDB collection `pwa_device_tokens` (lihat schema di bawah).

### POST /api/send-notification (JWT, admin)

- Body: `user_id` (optional), `title`, `body`, `data` (optional), `priority` (optional).
- Hanya role superadmin/admin. Rekod disimpan ke `notifications`; hantar push melalui FCM (integrate Firebase Admin SDK mengikut keperluan).

---

## 8. Schema MongoDB (cadangan)

```javascript
// Collection: pwa_device_tokens
{
  "_id": ObjectId,
  "user_id": ObjectId,      // rujuk users._id
  "fcm_token": String,      // FCM token dari client
  "device_type": String,   // "android" | "ios" | "web"
  "device_name": String,   // optional
  "updated_at": ISODate
}
// Index: { user_id: 1, fcm_token: 1 } unique (untuk upsert)
```

---

## 9. Firebase Cloud Messaging (FCM)

1. **Firebase Console:** Daftar projek, aktifkan Cloud Messaging, dapatkan **Web Push certificate / VAPID key** (atau FCM config).
2. **Frontend:**  
   - Tambah `firebase` SDK: `npm install firebase`  
   - Init Firebase app dan messaging; minta kebenaran notifikasi (`requestPermission`), dapatkan token dengan `getToken(messaging, vapidKey)`.  
   - Hantar token ke `POST /api/register-device-token` dengan header `Authorization: Bearer <JWT>` dan body `{ "fcm_token": "...", "device_type": "web" }`.
3. **Backend:**  
   - Install `firebase-admin`, init dengan service account JSON.  
   - Dalam `POST /api/send-notification`, baca token dari collection `pwa_device_tokens` dan hantar via `messaging.send_multicast()` atau `send()`.
4. **Service worker:** Event `push` dan `notificationclick` sudah ditangani dalam `service-worker.js`; pastikan icon path betul (contoh `/icons/icon-192x192.png`).

---

## 10. Build & deploy production

1. **Build frontend**
   - `npm run build`
   - Pastikan `service-worker.js` dan `manifest.json` ada dalam `build/` (CRA menyalin dari `public/`).

2. **Version / cache bust**
   - Set env `PWA_VERSION` atau `BUILD_ID` (contoh: git SHA atau timestamp) pada server.
   - Set `REACT_APP_VERSION` / `REACT_APP_BUILD_ID` semasa build jika mahu client baca versi.

3. **Hidangkan melalui HTTPS**
   - Nginx/Apache: proxy ke build static dan API ke FastAPI.
   - Header: `Cache-Control` sesuai untuk static (lama) dan API (no-store atau short).

4. **Lighthouse**
   - Target: Performance >90, first load <3s.
   - Pastikan lazy load, minify, dan precache kritikal sahaja; elak memuat terlalu banyak pada first load.

---

## 11. Checklist production

- [ ] HTTPS untuk frontend dan API
- [ ] Tetapan Smart360 (Ketetapan) disimpan; manifest & meta dari DB (/api/manifest, PwaMetaUpdater)
- [ ] Ikon 192x192 dan 512x512 wujud dan dirujuk dalam manifest
- [ ] Service worker didaftar (production), version check berfungsi
- [ ] Indikator online/offline dan splash screen dipasang
- [ ] IndexedDB offline queue + sync bila online (jika guna)
- [ ] FCM token disimpan di MongoDB; endpoint send-notification dilindungi (admin)
- [ ] PWA_VERSION / BUILD_ID diset pada deploy
- [ ] Lighthouse skor >90 dan first load <3s (optimize mengikut keperluan)
