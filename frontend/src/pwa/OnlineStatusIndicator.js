/**
 * Smart360 PWA - Online/offline status indicator
 */
import React from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { WifiOff } from 'lucide-react';

export function OnlineStatusIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] bg-amber-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2"
      role="status"
      aria-live="polite"
    >
      <WifiOff size={18} />
      Anda offline. Data akan disimpan sementara dan disegerakkan apabila sambungan pulih.
    </div>
  );
}
