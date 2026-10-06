import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Delete, ShieldCheck } from 'lucide-react';
import { SupportedLanguage } from '../types';

const APP_LOCK_PIN_HASH_KEY = 'splitzy_app_lock_pin_hash';
const APP_LOCK_ENABLED_KEY = 'splitzy_app_lock_enabled';
const APP_LOCK_TIMEOUT_MS_KEY = 'splitzy_app_lock_timeout_ms';

export const DEFAULT_AUTO_LOCK_TIMEOUT_MS = 60_000; // Default: 1 minute

export const AUTO_LOCK_TIMEOUT_OPTIONS: Array<{
  valueMs: number;
  labelEn: string;
  labelFr: string;
}> = [
  { valueMs: 30_000, labelEn: 'After 30 seconds', labelFr: 'Après 30 secondes' },
  { valueMs: 60_000, labelEn: 'After 1 minute (Default)', labelFr: 'Après 1 minute (Par défaut)' },
  { valueMs: 300_000, labelEn: 'After 5 minutes', labelFr: 'Après 5 minutes' },
  { valueMs: 900_000, labelEn: 'After 15 minutes', labelFr: 'Après 15 minutes' },
  { valueMs: 1_800_000, labelEn: 'After 30 minutes', labelFr: 'Après 30 minutes' },
  { valueMs: 0, labelEn: 'Never (Manual / App restart only)', labelFr: 'Jamais (Manuel / redémarrage)' },
];

export function getAppLockTimeoutMs(): number {
  try {
    const raw = localStorage.getItem(APP_LOCK_TIMEOUT_MS_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore
  }
  return DEFAULT_AUTO_LOCK_TIMEOUT_MS;
}

export function setAppLockTimeoutMs(timeoutMs: number): void {
  try {
    localStorage.setItem(APP_LOCK_TIMEOUT_MS_KEY, String(timeoutMs));
    window.dispatchEvent(new Event('splitzy-autolock-config-changed'));
  } catch {
    // Ignore
  }
}

/**
 * Computes a deterministic salted hash of a 4-digit PIN for local verification.
 */
export async function hashPin(pin: string): Promise<string> {
  const clean = pin.trim();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`splitzy_pin_v1:${clean}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic hash if SubtleCrypto is unavailable
  let h = 2166136261;
  const salted = `splitzy_pin_v1:${clean}`;
  for (let i = 0; i < salted.length; i++) {
    h ^= salted.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function isAppLockEnabled(): boolean {
  try {
    return (
      localStorage.getItem(APP_LOCK_ENABLED_KEY) === 'true' &&
      Boolean(localStorage.getItem(APP_LOCK_PIN_HASH_KEY))
    );
  } catch {
    return false;
  }
}

export async function saveAppLockPin(pin: string): Promise<void> {
  const hashed = await hashPin(pin);
  try {
    localStorage.setItem(APP_LOCK_PIN_HASH_KEY, hashed);
    localStorage.setItem(APP_LOCK_ENABLED_KEY, 'true');
    if (localStorage.getItem(APP_LOCK_TIMEOUT_MS_KEY) === null) {
      localStorage.setItem(APP_LOCK_TIMEOUT_MS_KEY, String(DEFAULT_AUTO_LOCK_TIMEOUT_MS));
    }
    window.dispatchEvent(new Event('splitzy-autolock-config-changed'));
  } catch {
    // Ignore storage errors
  }
}

export function disableAppLockPin(): void {
  try {
    localStorage.removeItem(APP_LOCK_PIN_HASH_KEY);
    localStorage.removeItem(APP_LOCK_ENABLED_KEY);
    window.dispatchEvent(new Event('splitzy-autolock-config-changed'));
  } catch {
    // Ignore
  }
}

export async function verifyAppLockPin(pin: string): Promise<boolean> {
  try {
    const storedHash = localStorage.getItem(APP_LOCK_PIN_HASH_KEY);
    if (!storedHash) return true;
    const candidateHash = await hashPin(pin);
    return storedHash === candidateHash;
  } catch {
    return false;
  }
}

interface AppLockScreenProps {
  onUnlock: () => void;
  userName?: string;
  language?: SupportedLanguage;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({
  onUnlock,
  userName,
  language = 'en',
}) => {
  const isFrench = language === 'fr';
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleDigit = useCallback(
    (digit: string) => {
      if (isVerifying) return;
      setError(false);
      setPin(prev => {
        if (prev.length >= 4) return prev;
        return prev + digit;
      });
    },
    [isVerifying]
  );

  const handleBackspace = useCallback(() => {
    if (isVerifying) return;
    setError(false);
    setPin(prev => prev.slice(0, -1));
  }, [isVerifying]);

  useEffect(() => {
    if (pin.length === 4) {
      setIsVerifying(true);
      verifyAppLockPin(pin).then(valid => {
        if (valid) {
          onUnlock();
        } else {
          setError(true);
          setTimeout(() => {
            setPin('');
            setIsVerifying(false);
          }, 380);
        }
      });
    }
  }, [pin, onUnlock]);

  // Support physical keyboard entry (0-9 and Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace]);

  const keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div
      id="app-lock-screen"
      className="fixed inset-0 z-[100] bg-[var(--bg)] flex flex-col items-center justify-center p-4 select-none"
    >
      <div className="w-full max-w-xs bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 shadow-[var(--shadow-modal)] flex flex-col items-center space-y-6">
        {/* Splitzy Brand & Lock Badge */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-[14px] bg-gradient-to-b from-[#6E0D25] to-[#3B0412] border border-[#7D1831] text-white flex flex-col items-center justify-center shadow-md">
            <div className="relative leading-none">
              <span className="font-sans font-extrabold text-xl text-white tracking-tight">
                S
              </span>
              <span className="absolute -top-0.5 -right-2 text-[9px] text-[#EDA6B4]">✦</span>
            </div>
            <span className="text-[8px] font-bold tracking-tight text-white/90 mt-0.5">
              Splitzy
            </span>
          </div>
          <h1 className="text-base font-bold font-display text-[var(--ink)] tracking-tight">
            {isFrench ? 'Splitzy est verrouillé' : 'Splitzy App Lock'}
          </h1>
          <p className="text-xs text-[var(--ink-secondary)]">
            {userName
              ? isFrench
                ? `Bonjour ${userName}, entrez votre code PIN à 4 chiffres`
                : `Welcome back, ${userName}. Enter your 4-digit PIN`
              : isFrench
              ? 'Entrez votre code PIN à 4 chiffres pour déverrouiller'
              : 'Enter your 4-digit PIN to unlock'}
          </p>
        </div>

        {/* 4-Digit PIN Dots Indicator */}
        <div className="flex items-center justify-center gap-4 py-1">
          {[0, 1, 2, 3].map(idx => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  error
                    ? 'bg-rose-500 scale-110'
                    : isFilled
                    ? 'bg-[var(--accent)] scale-110 shadow-xs'
                    : 'bg-[var(--surface-subtle)] border-2 border-[var(--border-strong)]'
                }`}
              />
            );
          })}
        </div>

        {/* Error feedback */}
        <div className="h-4 flex items-center justify-center">
          {error ? (
            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              {isFrench ? 'Code PIN incorrect. Réessayez.' : 'Incorrect PIN. Please try again.'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--ink-muted)]">
              <ShieldCheck className="w-3 h-3 text-[var(--accent)]" />
              {isFrench ? 'Protégé par code PIN' : 'Protected by PIN Lock'}
            </span>
          )}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {keypadDigits.map(digit => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-13 rounded-2xl bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] active:scale-95 border border-[var(--border)] text-base font-bold font-mono text-[var(--ink)] flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            >
              {digit}
            </button>
          ))}

          <div />

          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-13 rounded-2xl bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] active:scale-95 border border-[var(--border)] text-base font-bold font-mono text-[var(--ink)] flex items-center justify-center transition-all cursor-pointer shadow-2xs"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            disabled={pin.length === 0}
            aria-label="Backspace"
            className="h-13 rounded-2xl bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] active:scale-95 disabled:opacity-40 border border-[var(--border)] text-[var(--ink-secondary)] flex items-center justify-center transition-all cursor-pointer"
          >
            <Delete className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
