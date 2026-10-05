import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-2 bg-stone-900/90 dark:bg-stone-100/90 text-white dark:text-stone-900 text-xs font-medium rounded-xl shadow-lg backdrop-blur-md border border-stone-700/50 dark:border-stone-300/50 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <WifiOff className="w-4 h-4 text-amber-400 dark:text-amber-600 shrink-0" />
      <span>Working Offline — All changes saved locally and will sync when back online.</span>
    </div>
  );
};
