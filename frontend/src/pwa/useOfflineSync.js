/**
 * Smart360 PWA - Offline queue sync when back online
 * Call from App or layout; uses getPendingRequests + fetch + markSynced
 */
import { useState, useEffect, useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { getPendingRequests, markSynced, removeSynced } from './offlineQueue';

export function useOfflineSync(apiBaseUrl = '') {
  const isOnline = useOnlineStatus();
  const [syncing, setSyncing] = useState(false);

  const runSync = useCallback(async () => {
    const pending = await getPendingRequests();
    if (pending.length === 0) return;

    setSyncing(true);
    const base = apiBaseUrl || (process.env.REACT_APP_API_URL || '');

    for (const rec of pending) {
      try {
        const url = rec.url.startsWith('http') ? rec.url : base + rec.url;
        const opts = {
          method: rec.method || 'GET',
          headers: { 'Content-Type': 'application/json', ...rec.headers },
        };
        if (rec.body && rec.method !== 'GET') opts.body = JSON.stringify(rec.body);
        const res = await fetch(url, opts);
        if (res.ok) await markSynced(rec.id);
      } catch (_) {}
    }

    await removeSynced();
    setSyncing(false);
  }, [apiBaseUrl]);

  useEffect(() => {
    if (isOnline) runSync();
  }, [isOnline, runSync]);

  return { syncing, runSync };
}
