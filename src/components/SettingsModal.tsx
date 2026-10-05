import React from 'react';
import {
  X,
  Settings,
  Languages,
  ShieldCheck,
  KeyRound,
  Download,
  Upload,
  RefreshCw,
  Sparkles,
  Check,
  Cloud,
  CloudOff,
  ChevronRight,
  Database,
} from 'lucide-react';
import { SupportedLanguage } from '../types';
import { translate, LANGUAGE_OPTIONS } from '../core/i18n';
import { SyncStatus } from '../services/firebase';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsModalProps {
  isOpen?: boolean;
  onClose: () => void;
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  onOpenSecurityCenter: () => void;
  onExportData: () => void;
  onImportData: () => void;
  onManualSync?: () => void;
  onOpenTestRunner?: () => void;
  syncStatus?: SyncStatus;
  userId?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen = true,
  onClose,
  language,
  onLanguageChange,
  onOpenSecurityCenter,
  onExportData,
  onImportData,
  onManualSync,
  onOpenTestRunner,
  syncStatus = 'connected',
  userId,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="settings-modal-backdrop"
      className="ui-modal-backdrop"
      onClick={onClose}
    >
      <div
        id="settings-modal-card"
        className="ui-modal-card max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ui-modal-header">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-display tracking-tight text-[var(--text-primary)]">
                {translate(language, 'settings')}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Preferences, security, and data controls
              </p>
            </div>
          </div>
          <button
            id="close-settings-modal-btn"
            onClick={onClose}
            className="ui-icon-btn w-8 h-8"
            title="Close"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-6 max-h-[calc(85vh-120px)] overflow-y-auto">
          {/* SECTION 1: LANGUAGE SELECTION */}
          <section id="settings-section-language" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-[var(--brand-text)]" />
                <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                  {translate(language, 'languagePref')}
                </h3>
              </div>
              <span className="text-xs font-semibold text-[var(--brand-text)]">
                {LANGUAGE_OPTIONS.find(l => l.code === language)?.nativeLabel || language}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {LANGUAGE_OPTIONS.map(opt => {
                const isSelected = language === opt.code;
                return (
                  <button
                    key={opt.code}
                    id={`settings-lang-${opt.code}`}
                    onClick={() => onLanguageChange(opt.code)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[var(--brand-border)] bg-[var(--brand-subtle)] text-[var(--text-primary)]'
                        : 'border-[var(--border-default)] hover:border-[var(--border-strong)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold leading-tight">{opt.label}</div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {opt.nativeLabel}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-[var(--brand-primary)] text-white flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* SECTION 2: SECURITY & RECOVERY CENTER */}
          <section id="settings-section-security" className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--brand-text)]" />
              <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                Security & Recovery Center
              </h3>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      Private Recovery & Encrypted Backups
                    </span>
                    <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
                    <span className="text-xs font-medium text-[var(--brand-text)]">
                      Zero-Knowledge
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Protect your groups with a recovery code, encrypted cloud backups, and cross-device account restoration.
                  </p>
                </div>
              </div>

              <button
                id="settings-open-security-center-btn"
                onClick={() => {
                  onClose();
                  onOpenSecurityCenter();
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg-surface)] hover:bg-[var(--brand-subtle)] text-[var(--brand-text)] font-semibold text-xs sm:text-sm rounded-xl border border-[var(--border-default)] shadow-2xs transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[var(--brand-text)]" />
                  <span>Open Security & Recovery Center</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            </div>
          </section>

          {/* SECTION 3: CLOUD DATABASE AUTO-SYNC STATUS */}
          <section id="settings-section-sync" className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[var(--brand-text)]" />
                <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                  Cloud Database & Auto-Sync
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium">
                {syncStatus === 'connected' && (
                  <span className="flex items-center gap-1 text-[var(--success-text)]">
                    <Cloud className="w-3.5 h-3.5" />
                    Auto-Sync Active
                  </span>
                )}
                {syncStatus === 'syncing' && (
                  <span className="flex items-center gap-1 text-[var(--warning-text)]">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Syncing changes...
                  </span>
                )}
                {(syncStatus === 'offline' || syncStatus === 'error') && (
                  <span className="flex items-center gap-1 text-[var(--danger-text)]">
                    <CloudOff className="w-3.5 h-3.5" />
                    Offline / Retrying
                  </span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Automatic Firestore Cloud Sync
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  All expenses, settlements, and member changes sync instantly to your cloud database.
                </p>
              </div>

              {onManualSync && (
                <button
                  id="settings-manual-sync-btn"
                  onClick={onManualSync}
                  className="ui-btn ui-btn-secondary py-2 px-3 text-xs shrink-0"
                  title="Force refresh synchronization with cloud"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[var(--success-text)]" />
                  <span>Sync Now</span>
                </button>
              )}
            </div>

            {userId && (
              <div className="px-3 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] font-mono truncate">
                Session UID: <span className="text-[var(--text-primary)] font-semibold">{userId}</span>
              </div>
            )}
          </section>

          {/* SECTION 4: APP INSTALLATION (PWA) */}
          <section id="settings-section-pwa" className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
              App Installation & Offline Access
            </h3>
            <PWAInstallButton variant="settings" />
          </section>

          {/* SECTION 5: DATA BACKUP & TOOLS */}
          <section id="settings-section-data" className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
              Data & Maintenance
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                id="settings-export-data-btn"
                onClick={onExportData}
                className="ui-btn ui-btn-secondary py-2.5 text-xs"
              >
                <Download className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                <span>{translate(language, 'exportJSON')}</span>
              </button>

              <button
                id="settings-import-data-btn"
                onClick={onImportData}
                className="ui-btn ui-btn-secondary py-2.5 text-xs"
              >
                <Upload className="w-3.5 h-3.5 text-[var(--success-text)]" />
                <span>{translate(language, 'importJSON')}</span>
              </button>
            </div>

            {onOpenTestRunner && (
              <button
                id="settings-open-test-runner-btn"
                onClick={() => {
                  onClose();
                  onOpenTestRunner();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)] text-[var(--text-primary)] text-xs font-semibold transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                  <span>Run Verification Test Suite (Calculations & Cloud)</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </button>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border-default)] bg-[var(--bg-subtle)] flex justify-end">
          <button
            id="settings-done-btn"
            onClick={onClose}
            className="ui-btn ui-btn-primary px-5 py-2 text-xs sm:text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
