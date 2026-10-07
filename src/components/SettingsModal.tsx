import React, { useState } from 'react';
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
  User,
  Pencil,
  Calendar,
  Coins,
  Lock,
  Unlock,
  Trash2,
  AlertTriangle,
  LogOut,
} from 'lucide-react';
import { CalendarType, Member, SupportedLanguage } from '../types';
import { translate, LANGUAGE_OPTIONS } from '../core/i18n';
import { SUPPORTED_CURRENCIES } from '../core/currency';
import { SyncStatus } from '../services/firebase';
import { PWAInstallButton } from './PWAInstallButton';
import { MemberAvatar } from './MemberAvatar';
import {
  isAppLockEnabled,
  saveAppLockPin,
  disableAppLockPin,
  verifyAppLockPin,
  AUTO_LOCK_TIMEOUT_OPTIONS,
  getAppLockTimeoutMs,
  setAppLockTimeoutMs,
} from './AppLockScreen';

interface SettingsModalProps {
  isOpen?: boolean;
  onClose: () => void;
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  defaultCurrency?: string;
  onCurrencyChange?: (currency: string) => void;
  defaultCalendar?: CalendarType;
  onCalendarChange?: (calendar: CalendarType) => void;
  onOpenSecurityCenter: () => void;
  onExportData: () => void;
  onImportData: () => void;
  onManualSync?: () => void;
  onOpenTestRunner?: () => void;
  onEditProfile?: () => void;
  onLockAppNow?: () => void;
  onLogoutAccount?: () => Promise<void> | void;
  onDeleteAccount?: () => Promise<void> | void;
  currentMember?: Member;
  syncStatus?: SyncStatus;
  userId?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen = true,
  onClose,
  language,
  onLanguageChange,
  defaultCurrency = 'NPR',
  onCurrencyChange,
  defaultCalendar = 'BS',
  onCalendarChange,
  onOpenSecurityCenter,
  onExportData,
  onImportData,
  onManualSync,
  onOpenTestRunner,
  onEditProfile,
  onLockAppNow,
  onLogoutAccount,
  onDeleteAccount,
  currentMember,
  syncStatus = 'connected',
  userId,
}) => {
  const [pinEnabled, setPinEnabled] = useState<boolean>(() => isAppLockEnabled());
  const [autoLockTimeoutMs, setAutoLockTimeoutMsState] = useState<number>(() => getAppLockTimeoutMs());
  const [pinMode, setPinMode] = useState<'idle' | 'setup' | 'change' | 'disable'>('idle');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinMessage, setPinMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isConfirmingDeleteAccount, setIsConfirmingDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  if (!isOpen) return null;

  const resetPinForm = () => {
    setPinMode('idle');
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMessage(null);

    if (pinMode === 'change' || pinMode === 'disable') {
      const validCurrent = await verifyAppLockPin(currentPinInput);
      if (!validCurrent) {
        setPinMessage({ text: 'Current PIN is incorrect.', type: 'error' });
        return;
      }
    }

    if (pinMode === 'disable') {
      disableAppLockPin();
      setPinEnabled(false);
      resetPinForm();
      setPinMessage({ text: 'App Lock PIN disabled.', type: 'success' });
      return;
    }

    if (!/^\d{4}$/.test(newPinInput)) {
      setPinMessage({ text: 'Please enter a 4-digit numeric PIN.', type: 'error' });
      return;
    }

    if (newPinInput !== confirmPinInput) {
      setPinMessage({ text: 'New PIN and confirmation do not match.', type: 'error' });
      return;
    }

    await saveAppLockPin(newPinInput);
    setPinEnabled(true);
    resetPinForm();
    setPinMessage({ text: '4-digit App Lock PIN saved!', type: 'success' });
  };

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
          {/* SECTION 0: USER PROFILE & USERNAME */}
          {currentMember && (
            <section id="settings-section-profile" className="space-y-3 pb-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[var(--brand-text)]" />
                  <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                    {currentMember.isTemporary
                      ? language === 'fr'
                        ? 'Mode d’utilisation · Temporaire'
                        : 'Usage Mode · Temporary Use'
                      : 'Profile & Unique Username'}
                  </h3>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <MemberAvatar
                    name={currentMember.name}
                    avatar={currentMember.avatar}
                    color={currentMember.color}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {currentMember.name}
                    </div>
                    {currentMember.isTemporary ? (
                      <div className="text-xs text-[var(--text-secondary)] truncate">
                        {language === 'fr'
                          ? 'Utilisation temporaire sans compte'
                          : 'Temporary Use · No account required'}
                      </div>
                    ) : currentMember.username ? (
                      <div className="text-xs font-mono font-semibold text-[var(--brand-text)] truncate">
                        @{currentMember.username}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onEditProfile && (
                    <button
                      id={
                        currentMember.isTemporary
                          ? 'settings-upgrade-long-term-btn'
                          : 'settings-edit-profile-btn'
                      }
                      type="button"
                      onClick={() => {
                        onClose();
                        onEditProfile();
                      }}
                      className={
                        currentMember.isTemporary
                          ? 'ui-btn ui-btn-primary py-1.5 px-3 text-xs shrink-0'
                          : 'ui-btn ui-btn-secondary py-1.5 px-3 text-xs shrink-0'
                      }
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>
                        {currentMember.isTemporary
                          ? language === 'fr'
                            ? 'Créer un compte'
                            : 'Create Account'
                          : language === 'fr'
                          ? 'Modifier'
                          : 'Edit Profile'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

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

            {/* CURRENCY & CALENDAR PREFERENCES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                  <Coins className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                  <span>{translate(language, 'baseCurrency')}</span>
                </label>
                <select
                  value={defaultCurrency}
                  onChange={e => onCurrencyChange?.(e.target.value)}
                  className="ui-input"
                >
                  {SUPPORTED_CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.symbol}) — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                  <Calendar className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                  <span>{translate(language, 'calendarPref')}</span>
                </label>
                <select
                  value={defaultCalendar}
                  onChange={e => onCalendarChange?.(e.target.value as CalendarType)}
                  className="ui-input"
                >
                  <option value="BS">{translate(language, 'calendarBS')}</option>
                  <option value="AD">{translate(language, 'calendarAD')}</option>
                </select>
              </div>
            </div>
          </section>

          {/* SECTION 2: APP LOCK (PIN UNLOCK) & SECURITY CENTER */}
          <section id="settings-section-security" className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[var(--brand-text)]" />
                <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                  App Lock (PIN Unlock) & Security
                </h3>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  pinEnabled
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-default)]'
                }`}
              >
                {pinEnabled ? 'PIN Active' : 'Off'}
              </span>
            </div>

            {/* App Lock PIN Card */}
            <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      4-Digit PIN App Lock
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Require a 4-digit PIN to unlock Splitze whenever you open the app or lock it manually.
                  </p>
                </div>

                {pinEnabled && onLockAppNow && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLockAppNow();
                    }}
                    className="ui-btn ui-btn-secondary py-1.5 px-2.5 text-xs shrink-0"
                    title="Lock App Immediately"
                  >
                    <Lock className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                    <span>Lock Now</span>
                  </button>
                )}
              </div>

              {/* Auto-Lock Timer Preference */}
              <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <label
                    htmlFor="auto-lock-timeout-select"
                    className="text-xs font-semibold text-[var(--text-primary)] block"
                  >
                    {language === 'fr' ? 'Délai de verrouillage automatique' : 'Auto-Lock Timer'}
                  </label>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {language === 'fr'
                      ? 'Verrouille automatiquement après inactivité'
                      : 'Automatically lock Splitze after inactivity'}
                  </p>
                </div>

                <select
                  id="auto-lock-timeout-select"
                  value={autoLockTimeoutMs}
                  onChange={e => {
                    const nextMs = Number(e.target.value);
                    setAutoLockTimeoutMsState(nextMs);
                    setAppLockTimeoutMs(nextMs);
                    setPinMessage({
                      text:
                        nextMs === 0
                          ? 'Auto-lock timer turned off (manual lock only).'
                          : `Auto-lock timer updated to ${
                              AUTO_LOCK_TIMEOUT_OPTIONS.find(o => o.valueMs === nextMs)?.labelEn || ''
                            }.`,
                      type: 'success',
                    });
                  }}
                  className="ui-input sm:w-56 text-xs font-semibold"
                >
                  {AUTO_LOCK_TIMEOUT_OPTIONS.map(opt => (
                    <option key={opt.valueMs} value={opt.valueMs}>
                      {language === 'fr' ? opt.labelFr : opt.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              {pinMessage && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-medium border ${
                    pinMessage.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {pinMessage.text}
                </div>
              )}

              {pinMode === 'idle' ? (
                <div className="flex flex-wrap items-center gap-2">
                  {!pinEnabled ? (
                    <button
                      id="enable-pin-lock-btn"
                      type="button"
                      onClick={() => {
                        setPinMessage(null);
                        setPinMode('setup');
                      }}
                      className="ui-btn ui-btn-primary py-2 px-3.5 text-xs"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Set 4-Digit PIN</span>
                    </button>
                  ) : (
                    <>
                      <button
                        id="change-pin-lock-btn"
                        type="button"
                        onClick={() => {
                          setPinMessage(null);
                          setPinMode('change');
                        }}
                        className="ui-btn ui-btn-secondary py-1.5 px-3 text-xs"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                        <span>Change PIN</span>
                      </button>
                      <button
                        id="disable-pin-lock-btn"
                        type="button"
                        onClick={() => {
                          setPinMessage(null);
                          setPinMode('disable');
                        }}
                        className="ui-btn ui-btn-danger py-1.5 px-3 text-xs"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Remove PIN</span>
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSavePin} className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
                  {(pinMode === 'change' || pinMode === 'disable') && (
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                        Current 4-Digit PIN
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="••••"
                        value={currentPinInput}
                        onChange={e => setCurrentPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="ui-input font-mono tracking-widest text-center text-sm"
                        required
                      />
                    </div>
                  )}

                  {(pinMode === 'setup' || pinMode === 'change') && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                          New 4-Digit PIN
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="••••"
                          value={newPinInput}
                          onChange={e => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="ui-input font-mono tracking-widest text-center text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                          Confirm PIN
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="••••"
                          value={confirmPinInput}
                          onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="ui-input font-mono tracking-widest text-center text-sm"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={resetPinForm}
                      className="ui-btn ui-btn-secondary py-1.5 px-3 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="ui-btn ui-btn-primary py-1.5 px-3.5 text-xs"
                    >
                      {pinMode === 'disable' ? 'Confirm Disable' : 'Save PIN'}
                    </button>
                  </div>
                </form>
              )}
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
                {syncStatus === 'offline' ? (
                  <span className="flex items-center gap-1 text-[var(--danger-text)]">
                    <CloudOff className="w-3.5 h-3.5" />
                    Offline Mode
                  </span>
                ) : syncStatus === 'syncing' || syncStatus === 'saving' ? (
                  <span className="flex items-center gap-1 text-[var(--warning-text)]">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Syncing automatically...
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[var(--success-text)]">
                    <Cloud className="w-3.5 h-3.5" />
                    Auto-Sync Active
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
                  All expenses, settlements, and member changes sync automatically to your cloud database in real time.
                </p>
              </div>

              <span className="ui-badge ui-badge-success shrink-0">
                <Check className="w-3 h-3" />
                <span>{syncStatus === 'offline' ? 'Queued Offline' : 'Live Sync'}</span>
              </span>
            </div>

            {userId && (
              <div className="px-3 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] font-mono truncate">
                Session UID: <span className="text-[var(--text-primary)] font-semibold">{userId}</span>
              </div>
            )}
          </section>

          {/* SECTION 4: APP INSTALLATION (PWA) — Automatically hidden once installed */}
          <PWAInstallButton variant="settings" />

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
          </section>

          {/* SECTION 6: DANGER ZONE — DELETE ACCOUNT */}
          {onDeleteAccount && (
            <section
              id="settings-section-delete-account"
              className="space-y-3 pt-4 border-t border-[var(--border-subtle)]"
            >
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <h3 className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {language === 'fr' ? 'Zone de danger · Supprimer le compte' : 'Danger Zone · Delete Account'}
                </h3>
              </div>

              <div className="p-4 rounded-xl bg-rose-50/60 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/60 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-rose-800 dark:text-rose-200">
                      {language === 'fr'
                        ? 'Supprimer définitivement mon compte'
                        : 'Permanently Delete My Account'}
                    </p>
                    <p className="text-xs text-rose-700/90 dark:text-rose-300/80 leading-relaxed">
                      {language === 'fr'
                        ? `Supprime votre profil${currentMember?.username ? ` (@${currentMember.username})` : ''}, libère votre identifiant @username, supprime vos données locales et réinitialise l'application.`
                        : `Deletes your profile${currentMember?.username ? ` (@${currentMember.username})` : ''}, releases your unique @username so it can be used again, removes your cloud profile & recovery data, and resets this device.`}
                    </p>
                  </div>
                </div>

                {!isConfirmingDeleteAccount ? (
                  <button
                    id="settings-delete-account-btn"
                    type="button"
                    onClick={() => {
                      setIsConfirmingDeleteAccount(true);
                      setDeleteConfirmText('');
                    }}
                    className="ui-btn ui-btn-danger py-2 px-3.5 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {language === 'fr' ? 'Supprimer le compte' : 'Delete Account'}
                    </span>
                  </button>
                ) : (
                  <div className="p-3 rounded-lg bg-[var(--surface)] border border-rose-300 dark:border-rose-800 space-y-3">
                    <div className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                      <p className="leading-snug font-medium">
                        {language === 'fr'
                          ? 'Cette action est irréversible. Tapez DELETE ci-dessous pour confirmer la suppression de votre compte :'
                          : 'This action cannot be undone. Type DELETE below to confirm permanent account deletion:'}
                      </p>
                    </div>

                    <input
                      id="settings-delete-account-confirm-input"
                      type="text"
                      value={deleteConfirmText}
                      onChange={e => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE to confirm"
                      className="ui-input text-xs font-mono uppercase"
                      autoFocus
                    />

                    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
                      <button
                        type="button"
                        disabled={isDeletingAccount}
                        onClick={() => {
                          setIsConfirmingDeleteAccount(false);
                          setDeleteConfirmText('');
                        }}
                        className="ui-btn ui-btn-secondary w-full sm:w-auto py-2 sm:py-1.5 px-3 text-xs justify-center"
                      >
                        {language === 'fr' ? 'Annuler' : 'Cancel'}
                      </button>
                      <button
                        id="settings-confirm-delete-account-btn"
                        type="button"
                        disabled={
                          isDeletingAccount ||
                          deleteConfirmText.trim().toUpperCase() !== 'DELETE'
                        }
                        onClick={async () => {
                          setIsDeletingAccount(true);
                          try {
                            await onDeleteAccount();
                            setIsConfirmingDeleteAccount(false);
                            setDeleteConfirmText('');
                            onClose();
                          } finally {
                            setIsDeletingAccount(false);
                          }
                        }}
                        className="ui-btn ui-btn-danger w-full sm:w-auto py-2 sm:py-1.5 px-3.5 text-xs disabled:opacity-50 justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {isDeletingAccount
                            ? language === 'fr'
                              ? 'Suppression...'
                              : 'Deleting...'
                            : language === 'fr'
                            ? 'Confirmer la suppression'
                            : 'Permanently Delete Account'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
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
