import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Check, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PWAInstallButtonProps {
  variant?: 'header' | 'settings' | 'banner';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  className = '',
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showIOSGuide, setShowIOSGuide] = useState<boolean>(false);

  useEffect(() => {
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsInstalled(isStandalone);
    };

    checkInstalled();

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      return;
    }
    if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  if (variant === 'header') {
    if (isInstalled) return null;
    if (!deferredPrompt && !isIOS) return null;

    return (
      <>
        <button
          id="header-pwa-install-btn"
          onClick={handleInstallClick}
          className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#63E6BE]/20 text-[#101D2D] dark:text-[#63E6BE] border border-[#63E6BE]/40 transition-colors cursor-pointer ${className}`}
          title={deferredPrompt ? 'Install Splitze to your desktop or device' : 'Add to Home Screen'}
          aria-label="Install Splitze App"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Install App</span>
        </button>

        {showIOSGuide && (
          <div
            className="ui-modal-backdrop"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="ui-modal-card max-w-sm p-5 space-y-3"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <Share className="w-4 h-4 text-[var(--brand-text)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Install Splitze on iPhone / iPad
                </h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                1. Tap the <strong>Share</strong> button in the Safari toolbar.<br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="ui-btn ui-btn-primary w-full py-2 text-xs"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={`p-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] space-y-3 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[var(--brand-text)]" />
            <h4 className="text-xs font-semibold text-[var(--text-primary)]">
              Splitze Mobile &amp; Desktop PWA
            </h4>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Install Splitze as a fast, native-like app on your device for instant offline receipt logging and calculation access.
          </p>
        </div>

        {isInstalled ? (
          <span className="ui-badge ui-badge-success shrink-0">
            <Check className="w-3 h-3" />
            Installed
          </span>
        ) : deferredPrompt ? (
          <button
            id="settings-install-pwa-btn"
            onClick={handleInstallClick}
            className="ui-btn ui-btn-primary py-1.5 px-3 text-xs shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install Now</span>
          </button>
        ) : isIOS ? (
          <div className="shrink-0 text-right">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-text)]">
              <Share className="w-3 h-3" /> Safari Share
            </span>
          </div>
        ) : null}
      </div>

      {isIOS && !isInstalled && (
        <div className="text-xs p-2.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-default)] flex items-center gap-2">
          <Share className="w-3.5 h-3.5 shrink-0 text-[var(--brand-text)]" />
          <span>
            To install on iOS: tap the <strong>Share</strong> button in Safari, scroll down, and tap <strong>Add to Home Screen</strong>.
          </span>
        </div>
      )}
    </div>
  );
};
