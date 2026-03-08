import React, { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, Check, X, Smartphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

const PushNotificationManager = ({ onStatusChange, onSubscribeSuccess }) => {
  const [permission, setPermission] = useState('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [supported, setSupported] = useState(true);
  const [vapidPublicKey, setVapidPublicKey] = useState('');
  const [loadingVapid, setLoadingVapid] = useState(false);

  // Check current subscription status
  const checkSubscriptionStatus = useCallback(async () => {
    try {
      const res = await api.get('/api/notifications/push/status');
      setIsSubscribed(res.data.is_subscribed);
      setDeviceCount(res.data.device_count || 0);
      onStatusChange?.(res.data.is_subscribed);
    } catch (err) {
      console.error('Failed to check push status:', err);
    }
  }, [onStatusChange]);

  // Load VAPID public key from backend
  const fetchVapidPublicKey = useCallback(async () => {
    setLoadingVapid(true);
    try {
      const res = await api.get('/api/notifications/push/public-key');
      const publicKey = String(res.data?.public_key || '').trim();
      setVapidPublicKey(publicKey);
      return publicKey;
    } catch (err) {
      console.error('Failed to load VAPID public key:', err);
      setVapidPublicKey('');
      return '';
    } finally {
      setLoadingVapid(false);
    }
  }, []);

  // Check if push notifications are supported
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupported(false);
      return;
    }
    setPermission(Notification.permission);
    fetchVapidPublicKey();
    checkSubscriptionStatus();
  }, [fetchVapidPublicKey, checkSubscriptionStatus]);

  // Register service worker
  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      return registration;
    } catch (err) {
      console.error('Service worker registration failed:', err);
      throw err;
    }
  };

  // Subscribe to push notifications
  const subscribeToPush = async () => {
    setLoading(true);
    try {
      // Request notification permission
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      
      if (permissionResult !== 'granted') {
        toast.error('Kebenaran notifikasi ditolak');
        return;
      }

      let activePublicKey = vapidPublicKey;
      if (!activePublicKey) {
        activePublicKey = await fetchVapidPublicKey();
      }
      if (!activePublicKey) {
        toast.error('Push belum dikonfigurasi. Sila hubungi pentadbir sistem.');
        return;
      }

      // Register service worker
      const registration = await registerServiceWorker();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(activePublicKey)
      });

      // Get device info
      const deviceInfo = getDeviceInfo();

      // Send subscription to backend
      const subscriptionJson = subscription.toJSON();
      await api.post('/api/notifications/push/subscribe', {
        endpoint: subscriptionJson.endpoint,
        keys: subscriptionJson.keys,
        device_info: deviceInfo
      });

      setIsSubscribed(true);
      setDeviceCount(prev => prev + 1);
      onStatusChange?.(true);
      toast.success('Berjaya melanggan notifikasi push!');
      onSubscribeSuccess?.();
    } catch (err) {
      console.error('Push subscription failed:', err);
      toast.error('Gagal melanggan notifikasi');
    } finally {
      setLoading(false);
    }
  };

  // Get device info
  const getDeviceInfo = () => {
    const ua = navigator.userAgent;
    let device = 'Unknown Device';
    
    if (/iPhone|iPad|iPod/.test(ua)) {
      device = 'iOS Device';
    } else if (/Android/.test(ua)) {
      device = 'Android Device';
    } else if (/Windows/.test(ua)) {
      device = 'Windows PC';
    } else if (/Mac/.test(ua)) {
      device = 'Mac';
    } else if (/Linux/.test(ua)) {
      device = 'Linux PC';
    }
    
    const browser = /Chrome/.test(ua) ? 'Chrome' : 
                    /Firefox/.test(ua) ? 'Firefox' : 
                    /Safari/.test(ua) ? 'Safari' : 
                    /Edge/.test(ua) ? 'Edge' : 'Browser';
    
    return `${device} - ${browser}`;
  };

  // Convert VAPID key
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  if (!supported) {
    return (
      <div className="bg-slate-50 rounded-xl p-4 text-center">
        <BellOff className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm text-slate-500">
          Push notification tidak disokong pada pelayar ini
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 p-4 ${isSubscribed ? 'bg-emerald-50 border-emerald-200' : 'bg-gradient-to-r from-pastel-mint to-pastel-lavender border-pastel-lilac'}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${isSubscribed ? 'bg-emerald-500' : 'bg-gradient-to-br from-teal-500 to-violet-500'}`}>
            {isSubscribed ? (
              <Bell className="w-6 h-6 text-white" />
            ) : (
              <BellOff className="w-6 h-6 text-white" />
            )}
          </div>
          <div>
            <h4 className="font-bold text-slate-800">Push Notification</h4>
            <p className="text-sm text-slate-600">
              {isSubscribed 
                ? `Aktif pada ${deviceCount} peranti` 
                : permission === 'denied' 
                  ? 'Kebenaran ditolak oleh pelayar' 
                  : 'Terima notifikasi walaupun tidak buka website'}
            </p>
          </div>
        </div>

        {permission === 'denied' ? (
          <span className="px-3 py-1.5 bg-red-100 text-red-700 text-xs rounded-lg font-medium flex items-center gap-1 flex-shrink-0">
            <X size={14} /> Ditolak
          </span>
        ) : isSubscribed ? (
          <span className="px-3 py-2 bg-emerald-500 text-white text-sm rounded-lg font-semibold flex items-center gap-1 flex-shrink-0">
            <Check size={16} /> Sudah Aktif
          </span>
        ) : (
          <button
            onClick={subscribeToPush}
            disabled={loading || loadingVapid || !vapidPublicKey}
            data-testid="activate-push-btn"
            className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-violet-500 hover:from-teal-600 hover:to-violet-600 text-white text-sm rounded-xl font-semibold transition-all shadow-pastel disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Mengaktifkan...
              </>
            ) : (
              <>
                <Bell size={18} />
                {loadingVapid ? 'Mengesan konfigurasi...' : 'Aktifkan Sekarang'}
              </>
            )}
          </button>
        )}
      </div>
      
      {/* Info box for non-subscribed users */}
      {!isSubscribed && permission !== 'denied' && (
        <div className="mt-3 p-3 bg-white/70 rounded-lg border border-pastel-lilac">
          <p className="text-xs text-slate-600">
            <strong>Apa itu Push Notification?</strong> Anda akan terima pemberitahuan segera di telefon/komputer apabila guru menghantar mesej atau pengumuman penting, walaupun anda tidak membuka Portal MRSMKU.
          </p>
        </div>
      )}

      {!isSubscribed && permission !== 'denied' && !loadingVapid && !vapidPublicKey && (
        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-800">
            Push notification belum diaktifkan pada server. Sila beritahu Administrator untuk tetapkan `WEB_PUSH_VAPID_PUBLIC_KEY` dan `WEB_PUSH_VAPID_PRIVATE_KEY`.
          </p>
        </div>
      )}

      {isSubscribed && deviceCount > 0 && (
        <div className="mt-3 pt-3 border-t border-emerald-200">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <Smartphone size={16} />
            <span>Notifikasi akan dihantar ke {deviceCount} peranti anda</span>
          </div>
        </div>
      )}

      {permission === 'denied' && (
        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-800">
            <strong>Cara mengaktifkan semula:</strong> Klik ikon kunci di bar alamat pelayar → Cari "Notifications" → Tukar ke "Allow"
          </p>
        </div>
      )}
    </div>
  );
};

export default PushNotificationManager;
