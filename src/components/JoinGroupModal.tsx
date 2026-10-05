import React, { useState, useRef } from 'react';
import jsQR from 'jsqr';
import { X, KeyRound, QrCode, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { SupportedLanguage } from '../types';

export interface JoinGroupModalProps {
  isOpen: boolean;
  language: SupportedLanguage;
  onClose: () => void;
  onJoin: (code: string) => Promise<boolean>;
}

export const JoinGroupModal: React.FC<JoinGroupModalProps> = ({
  isOpen,
  language,
  onClose,
  onJoin,
}) => {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScanningQR, setIsScanningQR] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const isFrench = language === 'fr';

  const cleanCode = (input: string) => {
    return input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = cleanCode(code);
    if (!formatted) {
      setErrorMessage(isFrench ? 'Veuillez saisir un code valide' : 'Please enter a valid invite code');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const success = await onJoin(formatted);
      if (success) {
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to join group. Check code and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQRFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setIsScanningQR(true);

    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not initialize canvas');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

          if (qrCode && qrCode.data) {
            let foundCode = qrCode.data;
            try {
              const url = new URL(foundCode);
              const joinParam = url.searchParams.get('join');
              if (joinParam) {
                foundCode = joinParam;
              }
            } catch {
              // Not a full URL, treat as raw code
            }

            const cleaned = cleanCode(foundCode);
            if (cleaned) {
              setCode(cleaned);
              onJoin(cleaned)
                .then(success => {
                  if (success) onClose();
                })
                .catch(err => setErrorMessage(err.message));
            }
          } else {
            setErrorMessage('No valid Splitzy QR code detected in the selected image.');
          }
        } catch {
          setErrorMessage('Could not scan QR code from image.');
        } finally {
          setIsScanningQR(false);
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div
      id="join-group-modal-backdrop"
      className="ui-modal-backdrop"
      onClick={onClose}
    >
      <div
        id="join-group-modal-card"
        className="ui-modal-card max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ui-modal-header">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent-border)]">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base tracking-tight text-[var(--ink)]">
                {isFrench ? 'Rejoindre un groupe' : 'Join a Group'}
              </h3>
              <p className="text-xs text-[var(--ink-secondary)]">
                {isFrench ? 'Avec un code ou un QR code' : 'Via invite code or QR'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--ink-secondary)] block">
              {isFrench ? 'Code d’invitation (6 caractères)' : 'Invite Code (6 characters)'}
            </label>
            <div className="flex items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--accent)] focus-within:ring-3 focus-within:ring-[var(--accent)]/10 transition-all overflow-hidden">
              <span className="pl-3.5 pr-2 py-2.5 text-sm font-mono font-bold text-[var(--ink-muted)] bg-[var(--surface-subtle)] border-r border-[var(--border-subtle)] select-none flex items-center">
                #
              </span>
              <input
                id="join-group-code-input"
                type="text"
                autoFocus
                maxLength={10}
                placeholder="ABC123"
                value={code}
                onChange={e => setCode(cleanCode(e.target.value))}
                className="w-full px-3 py-2.5 bg-transparent text-base font-mono font-bold tracking-widest uppercase text-[var(--ink)] focus:outline-none"
              />
            </div>
            <p className="text-xs text-[var(--ink-secondary)]">
              {isFrench
                ? 'Demandez le code au créateur du groupe dans Partager.'
                : 'Ask the group creator for their 6-character invite code.'}
            </p>
          </div>

          {/* QR Scan alternative */}
          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs">
            <span className="text-[var(--ink-secondary)]">
              {isFrench ? 'Vous avez une photo QR ?' : 'Have a QR code image?'}
            </span>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleQRFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanningQR}
              className="ui-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              {isScanningQR ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <QrCode className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Scan QR Image</span>
                </>
              )}
            </button>
          </div>

          {/* Submit Button */}
          <button
            id="join-group-submit-btn"
            type="submit"
            disabled={isSubmitting || !code.trim()}
            className="ui-btn-primary w-full flex items-center justify-center gap-2 py-3 px-4 text-sm shadow-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isFrench ? 'Connexion en cours...' : 'Joining Group...'}</span>
              </>
            ) : (
              <>
                <span>{isFrench ? 'Rejoindre le groupe' : 'Join Group'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
