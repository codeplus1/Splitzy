import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { WifiOff, Wifi, RefreshCw, CloudUpload } from 'lucide-react';

interface OfflineIndicatorProps {
  pendingCount?: number;
  onSyncNow?: () => void;
}

const OFFLINE_TOAST_DURATION_MS = 3500;

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  pendingCount = 0,
  onSyncNow,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showOfflineBanner, setShowOfflineBanner] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [showBackOnline, setShowBackOnline] = useState<boolean>(false);
  const [showPendingBanner, setShowPendingBanner] = useState<boolean>(false);

  // Auto-hide the offline popup after a few seconds whenever it is shown
  useEffect(() => {
    if (!showOfflineBanner) return;
    const timer = setTimeout(() => {
      setShowOfflineBanner(false);
    }, OFFLINE_TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [showOfflineBanner]);

  // Auto-hide the back-online popup after a few seconds
  useEffect(() => {
    if (!showBackOnline) return;
    const timer = setTimeout(() => {
      setShowBackOnline(false);
    }, OFFLINE_TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [showBackOnline]);

  // Show pending sync indicator briefly when online and pendingCount > 0, then fade up
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      setShowPendingBanner(true);
      const timer = setTimeout(() => {
        setShowPendingBanner(false);
      }, OFFLINE_TOAST_DURATION_MS);
      return () => clearTimeout(timer);
    } else {
      setShowPendingBanner(false);
    }
  }, [isOnline, pendingCount]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineBanner(false);
      setShowBackOnline(true);
      onSyncNow?.();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowBackOnline(false);
      setShowOfflineBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onSyncNow]);

  const activeKey =
    !isOnline && showOfflineBanner
      ? 'offline'
      : showBackOnline
      ? 'back-online'
      : isOnline && pendingCount > 0 && showPendingBanner
      ? 'pending-sync'
      : null;

  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] pointer-events-none flex justify-center"
    >
      <AnimatePresence mode="wait">
        {activeKey === 'offline' && (
          <motion.div
            key="offline-banner"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={() => setShowOfflineBanner(false)}
            className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 bg-stone-900/95 dark:bg-stone-100/95 text-white dark:text-stone-900 text-xs font-medium rounded-xl shadow-lg backdrop-blur-md border border-amber-500/40 cursor-pointer"
          >
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
          </motion.div>
        )}

        {activeKey === 'back-online' && (
          <motion.div
            key="back-online-banner"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={() => setShowBackOnline(false)}
            className="pointer-events-auto flex items-center gap-2 px-3.5 py-2 bg-emerald-950/95 text-emerald-100 text-xs font-medium rounded-xl shadow-lg backdrop-blur-md border border-emerald-600/60 cursor-pointer"
          >
            <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Back online! Syncing queued expenses to group members&apos; phones...</span>
          </motion.div>
        )}

        {activeKey === 'pending-sync' && (
          <motion.button
            key="pending-sync-banner"
            type="button"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={onSyncNow}
            className="pointer-events-auto flex items-center gap-2 px-3.5 py-2 bg-stone-900/95 dark:bg-stone-100/95 text-white dark:text-stone-900 text-xs font-medium rounded-xl shadow-lg backdrop-blur-md border border-emerald-500/40 hover:opacity-95 transition-opacity cursor-pointer"
          >
            <CloudUpload className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
            <span>
              {pendingCount} offline item{pendingCount > 1 ? 's' : ''} syncing to group phones...
            </span>
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600 animate-spin ml-1" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
