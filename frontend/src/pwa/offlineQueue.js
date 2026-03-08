/**
 * Smart360 PWA - IndexedDB offline queue for failed API requests
 * Auto-sync when back online
 */

const DB_NAME = 'Smart360OfflineQueue';
const DB_VERSION = 1;
const STORE_NAME = 'requests';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }
    };
  });
}

export async function addToQueue(method, url, body = null, headers = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record = {
      method,
      url,
      body,
      headers: { ...headers },
      createdAt: Date.now(),
      synced: false,
    };
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingRequests() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('synced');
    const req = index.getAll();
    req.onsuccess = () => resolve((req.result || []).filter((r) => r.synced === false));
    req.onerror = () => reject(req.error);
  });
}

export async function markSynced(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => {
      const rec = req.result;
      if (rec) {
        rec.synced = true;
        tx.objectStore(STORE_NAME).put(rec);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeSynced() {
  const db = await openDB();
  const all = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    all.filter((r) => r.synced).forEach((r) => store.delete(r.id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCount() {
  const pending = await getPendingRequests();
  return pending.length;
}
