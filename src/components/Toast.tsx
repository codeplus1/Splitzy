import React from 'react';
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
  if (!toasts.length) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0"
    >
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
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl shadow-lg border ${borderClass} bg-[var(--bg-surface)] text-[var(--text-primary)] transition-all animate-in fade-in slide-in-from-bottom-2 duration-150`}
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
          </div>
        );
      })}
    </div>
  );
};
