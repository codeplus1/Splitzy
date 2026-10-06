import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, CloudUpload } from 'lucide-react';

interface OfflineIndicatorProps {
  pendingCount?: number;
  onSyncNow?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  pendingCount = 0,
  onSyncNow,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showBackOnline, setShowBackOnline] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBackOnline(true);
      onSyncNow?.();
      const timer = setTimeout(() => setShowBackOnline(false), 4500);
      return () => clearTimeout(timer);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowBackOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onSyncNow]);

  if (isOnline && !showBackOnline && pendingCount === 0) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      {!isOnline ? (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-stone-900/95 dark:bg-stone-100/95 text-white dark:text-stone-900 text-xs font-medium rounded-xl shadow-lg backdrop-blur-md border border-amber-500/40">
          <WifiOff className="w-4 h-4 text-amber-400 dark:text-amber-600 shrink-0 animate-pulse" />
          <div className="leading-snug">
            <span className="font-bold block">
              Offline Mode — Add expenses with no signal
            </span>
            <span className="text-[11px] opacity-90">
              {pendingCount > 0
                ? `${pendingCount} queued item${pendingCount > 1 ? 's' : ''} saved on phone · Syncs to group phones automatically when online`
                : 'Everything saves on your phone & syncs to group members when back online'}
            </span>
          </div>
        </div>
      ) : showBackOnline ? (
        <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-950/95 text-emerald-100 text-xs font-medium rounded-xl shadow-lg backdrop-blur-md border border-emerald-600/60">
          <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Back online! Syncing queued expenses to group members&apos; phones...</span>
        </div>
      ) : pendingCount > 0 ? (
        <button
          type="button"
          onClick={onSyncNow}
          className="flex items-center gap-2 px-3.5 py-2 bg-stone-900/95 dark:bg-stone-100/95 text-white dark:text-stone-900 text-xs font-medium rounded-xl shadow-lg backdrop-blur-md border border-emerald-500/40 hover:opacity-95 transition-opacity cursor-pointer"
        >
          <CloudUpload className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>
            {pendingCount} offline item{pendingCount > 1 ? 's' : ''} syncing to group phones...
          </span>
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600 animate-spin ml-1" />
        </button>
      ) : null}
    </div>
  );
};
