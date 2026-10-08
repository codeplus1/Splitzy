import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => {
          let icon = <Info className="w-4 h-4 text-[var(--brand-text)] shrink-0" />;
          let borderClass = 'border-[var(--border-default)]';

          if (toast.type === 'success') {
            icon = <CheckCircle2 className="w-4 h-4 text-[var(--success-text)] shrink-0" />;
            borderClass = 'border-[var(--success-border)]';
          } else if (toast.type === 'error') {
            icon = <AlertCircle className="w-4 h-4 text-[var(--danger-text)] shrink-0" />;
            borderClass = 'border-[var(--danger-border)]';
          }

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className={`pointer-events-auto w-full flex items-start gap-2.5 p-3 rounded-xl shadow-lg border ${borderClass} bg-[var(--bg-surface)] text-[var(--text-primary)]`}
              role="alert"
            >
              <div className="pt-0.5">{icon}</div>
              <p className="text-xs sm:text-sm font-medium leading-snug flex-1 select-text">
                {toast.message}
              </p>
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 rounded-lg transition-colors cursor-pointer"
                title="Dismiss notification"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
