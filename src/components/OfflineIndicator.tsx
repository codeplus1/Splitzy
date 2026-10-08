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
      className="fixed top-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg z-40 pointer-events-none flex justify-center"
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
            className="pointer-events-auto w-full flex items-center justify-between gap-3 px-4 py-3 bg-stone-900/95 dark:bg-stone-100/95 text-white dark:text-stone-900 text-xs sm:text-sm font-semibold rounded-2xl shadow-lg backdrop-blur-md border border-amber-500/40 cursor-pointer active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <WifiOff className="w-4 h-4 text-amber-400 dark:text-amber-600 shrink-0 animate-pulse" />
              <span className="truncate">
                Offline Mode — Add expenses with no signal
              </span>
            </div>
            {pendingCount > 0 && (
              <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 dark:text-amber-700 border border-amber-500/30">
                {pendingCount} queued
              </span>
            )}
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
            className="pointer-events-auto w-full flex items-center justify-between gap-3 px-4 py-3 bg-emerald-950/95 text-emerald-100 text-xs sm:text-sm font-semibold rounded-2xl shadow-lg backdrop-blur-md border border-emerald-600/60 cursor-pointer active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Back online — Syncing expenses...</span>
            </div>
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
            className="pointer-events-auto w-full flex items-center justify-between gap-3 px-4 py-3 bg-stone-900/95 dark:bg-stone-100/95 text-white dark:text-stone-900 text-xs sm:text-sm font-semibold rounded-2xl shadow-lg backdrop-blur-md border border-emerald-500/40 hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <CloudUpload className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
              <span className="truncate">
                Syncing {pendingCount} offline item{pendingCount > 1 ? 's' : ''}...
              </span>
            </div>
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600 animate-spin shrink-0" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
