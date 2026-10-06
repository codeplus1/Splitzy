import React, { useState, useRef } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Download,
  Upload,
  RefreshCw,
  Copy,
  Check,
  Eye,
  EyeOff,
  X,
  FileText,
} from 'lucide-react';
import { AppState, saveLocalRecoveryCode, loadLocalRecoveryCode } from '../services/storage';
import {
  generateSecureRecoveryCode,
  hashRecoveryCode,
  encryptDataWithPassphrase,
  decryptDataWithPassphrase,
  EncryptedBackupPayload,
} from '../core/security';
import {
  cloudSaveRecoveryVerifier,
  cloudLookupRecoveryVerifier,
  cloudLinkAccountToRecovery,
  cloudUploadFullState,
  AppUser,
} from '../services/firebase';
import { SupportedLanguage } from '../types';

interface SecurityCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser | null;
  appState: AppState;
  onRestoreState: (restoredState: AppState) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  language: SupportedLanguage;
}

export const SecurityCenterModal: React.FC<SecurityCenterModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  appState,
  onRestoreState,
  onShowToast,
  language,
}) => {
  const [activeTab, setActiveTab] = useState<'recovery' | 'backup' | 'identity'>('recovery');

  // Recovery Code state
  const [recoveryCode, setRecoveryCode] = useState<string | null>(() => loadLocalRecoveryCode());
  const [isCodeVisible, setIsCodeVisible] = useState(false);
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  // Account Restore state
  const [inputRecoveryCode, setInputRecoveryCode] = useState('');
  const [isRestoringAccount, setIsRestoringAccount] = useState(false);

  // Encrypted Backup state
  const [backupPassword, setBackupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [restorePayload, setRestorePayload] = useState<EncryptedBackupPayload | null>(null);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [isDecryptingBackup, setIsDecryptingBackup] = useState(false);

  const backupFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  /* ========================================================================
     1. RECOVERY CODE ACTIONS
     ======================================================================== */

  const handleGenerateRecoveryCode = async () => {
    if (!currentUser) return;
    setIsGeneratingCode(true);
    try {
      const newCode = generateSecureRecoveryCode();
      const hash = await hashRecoveryCode(newCode);

      // Save verifier to Firestore
      const res = await cloudSaveRecoveryVerifier(hash, currentUser.uid);
      if (!res.success) {
        throw new Error(res.error || 'Failed to register recovery code on cloud.');
      }

      // Save locally
      saveLocalRecoveryCode(newCode);
      setRecoveryCode(newCode);
      setIsCodeVisible(true);
      onShowToast('New 20-character recovery code generated and secured!', 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Failed to generate recovery code.', 'error');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCopyCode = async () => {
    if (!recoveryCode) return;
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setHasCopiedCode(true);
      setTimeout(() => setHasCopiedCode(false), 2000);
      onShowToast('Recovery code copied to clipboard!', 'success');
    } catch {
      onShowToast('Failed to copy. Please select and copy manually.', 'error');
    }
  };

  const handleDownloadRecoveryFile = () => {
    if (!recoveryCode || !currentUser) return;
    const text = `=====================================================
HISAB SATHI — ACCOUNT RECOVERY CODE
=====================================================
Created: ${new Date().toISOString()}
User ID: ${currentUser.uid}

YOUR RECOVERY CODE:
${recoveryCode}

IMPORTANT:
- Store this code in a secure place (password manager or offline vault).
- This code allows you to recover your groups and expenses on any new device or browser.
- Never share this code with anyone.
=====================================================`;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hisab-sathi-recovery-code-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Recovery code text file downloaded!', 'success');
  };

  const handleRestoreWithRecoveryCode = async () => {
    if (!currentUser) return;
    const cleanCode = inputRecoveryCode.trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 10) {
      onShowToast('Please enter your full 20-character recovery code.', 'error');
      return;
    }

    setIsRestoringAccount(true);
    try {
      const hash = await hashRecoveryCode(cleanCode);
      const lookup = await cloudLookupRecoveryVerifier(hash);

      if (!lookup.success || !lookup.uid) {
        throw new Error(lookup.error || 'Invalid recovery code. No matching account found.');
      }

      if (lookup.uid === currentUser.uid) {
        saveLocalRecoveryCode(cleanCode);
        setRecoveryCode(cleanCode);
        setInputRecoveryCode('');
        onShowToast('Recovery code verified! This device is connected to your account.', 'success');
        setIsRestoringAccount(false);
        return;
      }

      // Link current session to the recovered account's groups
      const localCodes = appState.groups
        .map(g => g.inviteCode)
        .filter((c): c is string => Boolean(c));
      const linkRes = await cloudLinkAccountToRecovery(
        lookup.uid,
        currentUser.uid,
        localCodes
      );
      if (!linkRes.success) {
        throw new Error(linkRes.error || 'Failed to restore account groups.');
      }

      // Save restored recovery code locally
      saveLocalRecoveryCode(cleanCode);
      setRecoveryCode(cleanCode);
      setInputRecoveryCode('');

      onShowToast(
        `Account restored! Successfully recovered ${linkRes.recoveredGroupCount} group(s).`,
        'success'
      );
      onClose();
    } catch (err: any) {
      onShowToast(err.message || 'Account recovery failed.', 'error');
    } finally {
      setIsRestoringAccount(false);
    }
  };

  /* ========================================================================
     2. ENCRYPTED BACKUP (AES-GCM 256-bit) ACTIONS
     ======================================================================== */

  const handleExportEncryptedBackup = async () => {
    if (!backupPassword || backupPassword.length < 4) {
      onShowToast('Passphrase must be at least 4 characters long.', 'error');
      return;
    }
    if (backupPassword !== confirmPassword) {
      onShowToast('Passphrases do not match.', 'error');
      return;
    }

    setIsCreatingBackup(true);
    try {
      const payload = await encryptDataWithPassphrase(appState, backupPassword);
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hisab-sathi-encrypted-backup-${new Date().toISOString().split('T')[0]}.hsbackup`;
      a.click();
      URL.revokeObjectURL(url);

      setBackupPassword('');
      setConfirmPassword('');
      onShowToast('Encrypted backup (.hsbackup) generated and downloaded!', 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Failed to create encrypted backup.', 'error');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreFileName(file.name);
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text) as EncryptedBackupPayload;
        if (parsed && parsed.format === 'hisab_sathi_encrypted_backup') {
          setRestorePayload(parsed);
          onShowToast('Encrypted backup file loaded. Enter passphrase to decrypt.', 'info');
        } else {
          onShowToast('Invalid backup file. Not a Hisab Sathi encrypted backup (.hsbackup).', 'error');
        }
      } catch {
        onShowToast('Failed to read encrypted backup file.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDecryptAndRestore = async () => {
    if (!restorePayload) {
      onShowToast('Please select a backup file first.', 'error');
      return;
    }
    if (!restorePassword) {
      onShowToast('Please enter the encryption passphrase.', 'error');
      return;
    }

    setIsDecryptingBackup(true);
    try {
      const decrypted = await decryptDataWithPassphrase<AppState>(restorePayload, restorePassword);

      if (!decrypted || !Array.isArray(decrypted.groups)) {
        throw new Error('Decrypted content does not match Hisab Sathi database schema.');
      }

      // Safely restore state and sync normalized state to cloud via onRestoreState
      await onRestoreState(decrypted);

      setRestorePassword('');
      setRestorePayload(null);
      setRestoreFileName('');
      onShowToast(
        `Restored successfully! Loaded ${decrypted.groups.length} group(s) and ${decrypted.expenses.length} expense(s).`,
        'success'
      );
      onClose();
    } catch (err: any) {
      onShowToast(err.message || 'Decryption failed. Check your passphrase.', 'error');
    } finally {
      setIsDecryptingBackup(false);
    }
  };

  return (
    <div
      className="ui-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="ui-modal-card max-w-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="ui-modal-header">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center border border-[var(--brand-border)]">
              <ShieldCheck className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-display tracking-tight text-[var(--text-primary)]">
                Security & Recovery Center
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Zero-Trust security, cryptographically isolated cloud sync & account recovery
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ui-icon-btn w-8 h-8"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] flex overflow-x-auto gap-1.5">
          <button
            onClick={() => setActiveTab('recovery')}
            className={`ui-segmented-btn flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'recovery' ? 'ui-segmented-btn-active' : ''
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Recovery Code</span>
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`ui-segmented-btn flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'backup' ? 'ui-segmented-btn-active' : ''
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Encrypted Backup</span>
          </button>
          <button
            onClick={() => setActiveTab('identity')}
            className={`ui-segmented-btn flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'identity' ? 'ui-segmented-btn-active' : ''
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Cloud Identity</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* TAB 1: RECOVERY CODE */}
          {activeTab === 'recovery' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-[var(--brand-subtle)] border border-[var(--brand-border)]">
                <div className="flex items-start gap-3">
                  <KeyRound className="w-5 h-5 text-[var(--brand-text)] shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1 text-[var(--text-primary)]">
                    <p className="font-semibold text-sm">Instant Account Recovery Anywhere</p>
                    <p className="text-[var(--text-secondary)] leading-relaxed">
                      Because Splitzy requires <strong>no password, no email, and no phone number</strong>, your cryptographically generated 20-character recovery code is the key to restoring your account on another phone, laptop, or browser.
                    </p>
                    <p className="text-[var(--brand-text)] text-xs font-medium pt-0.5">
                      Zero-Knowledge: Only a SHA-256 hash verifier is saved to Firestore. Your raw recovery code is never exposed on the cloud.
                    </p>
                  </div>
                </div>
              </div>

              {/* Current Code Display or Generate Button */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                    Your Recovery Code
                  </h3>
                  {recoveryCode && (
                    <span className="ui-badge ui-badge-success">
                      <Check className="w-3 h-3" /> Active on this device
                    </span>
                  )}
                </div>

                {recoveryCode ? (
                  <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-base sm:text-lg font-bold tracking-wider text-[var(--text-primary)]">
                        {isCodeVisible ? recoveryCode : '••••-••••-••••-••••-••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsCodeVisible(!isCodeVisible)}
                        className="ui-icon-btn w-8 h-8"
                        title={isCodeVisible ? 'Hide code' : 'Show code'}
                      >
                        {isCodeVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                      <button
                        onClick={handleCopyCode}
                        className="ui-btn ui-btn-secondary py-1.5 px-3 text-xs"
                      >
                        {hasCopiedCode ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[var(--success-text)]" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                            <span>Copy Code</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleDownloadRecoveryFile}
                        className="ui-btn ui-btn-secondary py-1.5 px-3 text-xs"
                      >
                        <Download className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                        <span>Download Backup (.txt)</span>
                      </button>

                      <button
                        onClick={handleGenerateRecoveryCode}
                        disabled={isGeneratingCode}
                        className="ui-btn ui-btn-ghost py-1.5 px-3 text-xs ml-auto"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingCode ? 'animate-spin' : ''}`} />
                        <span>Rotate Code</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 px-4 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-subtle)] space-y-3">
                    <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                      You have not generated a recovery code yet. Generate one now to protect your data if you switch devices or clear browser storage.
                    </p>
                    <button
                      onClick={handleGenerateRecoveryCode}
                      disabled={isGeneratingCode}
                      className="ui-btn ui-btn-primary py-2 px-4 text-xs"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>{isGeneratingCode ? 'Generating...' : 'Generate 20-Character Recovery Code'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Restore Section */}
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                  Restore Account on this Device
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Moving from another phone or browser? Enter your 20-character recovery code below to link your existing groups and records immediately.
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputRecoveryCode}
                    onChange={e => setInputRecoveryCode(e.target.value)}
                    placeholder="e.g. HS8K-39AF-92M1-78BC-54DE"
                    className="ui-input grow font-mono uppercase text-xs"
                  />
                  <button
                    onClick={handleRestoreWithRecoveryCode}
                    disabled={isRestoringAccount || !inputRecoveryCode.trim()}
                    className="ui-btn ui-btn-primary py-2.5 px-4 text-xs shrink-0"
                  >
                    {isRestoringAccount ? 'Restoring...' : 'Restore Account'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ENCRYPTED BACKUP */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)]">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-[var(--brand-text)] shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1 text-[var(--text-secondary)]">
                    <p className="font-semibold text-sm text-[var(--text-primary)]">
                      Client-Side AES-GCM 256-Bit Encryption
                    </p>
                    <p className="leading-relaxed">
                      Uses <strong>AES-GCM 256-bit</strong> with PBKDF2 (100,000 rounds of SHA-256) and fresh random salts. Your passphrase never leaves your device and is never stored in Firestore.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section A: Create Encrypted Backup */}
              <div className="p-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                    Create Encrypted Backup (.hsbackup)
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Export your entire database into an encrypted snapshot protected by a passphrase.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="ui-label">
                      Encryption Passphrase
                    </label>
                    <input
                      type="password"
                      value={backupPassword}
                      onChange={e => setBackupPassword(e.target.value)}
                      placeholder="Minimum 4 characters"
                      className="ui-input text-xs py-2"
                    />
                  </div>
                  <div>
                    <label className="ui-label">
                      Confirm Passphrase
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repeat passphrase"
                      className="ui-input text-xs py-2"
                    />
                  </div>
                </div>

                <button
                  onClick={handleExportEncryptedBackup}
                  disabled={isCreatingBackup || !backupPassword}
                  className="ui-btn ui-btn-primary py-2 px-4 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isCreatingBackup ? 'Encrypting with Web Crypto...' : 'Download Encrypted Backup'}</span>
                </button>
              </div>

              {/* Section B: Restore Encrypted Backup */}
              <div className="p-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                    Restore From Encrypted Backup
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Select your <code>.hsbackup</code> file and enter the original passphrase.
                  </p>
                </div>

                <input
                  type="file"
                  ref={backupFileInputRef}
                  onChange={handleBackupFileSelect}
                  accept=".hsbackup,.json"
                  className="hidden"
                />

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => backupFileInputRef.current?.click()}
                    className="ui-btn ui-btn-secondary py-2 px-3 text-xs"
                  >
                    <Upload className="w-3.5 h-3.5 text-[var(--brand-text)]" />
                    <span>Select .hsbackup File</span>
                  </button>

                  {restoreFileName && (
                    <span className="text-xs font-mono text-[var(--success-text)] flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" /> {restoreFileName}
                    </span>
                  )}
                </div>

                {restorePayload && (
                  <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3 animate-in fade-in duration-150">
                    <div>
                      <label className="ui-label">
                        Passphrase to Decrypt File
                      </label>
                      <input
                        type="password"
                        value={restorePassword}
                        onChange={e => setRestorePassword(e.target.value)}
                        placeholder="Enter encryption passphrase"
                        className="ui-input text-xs py-2"
                      />
                    </div>

                    <button
                      onClick={handleDecryptAndRestore}
                      disabled={isDecryptingBackup || !restorePassword}
                      className="ui-btn ui-btn-primary py-2 px-4 text-xs"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{isDecryptingBackup ? 'Decrypting AES-GCM...' : 'Decrypt & Restore Database'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CLOUD IDENTITY */}
          {activeTab === 'identity' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">
                    Authoritative Cloud User ID
                  </h4>
                  <span className="ui-badge ui-badge-success">
                    Anonymous Auth Session
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] font-mono text-xs text-[var(--text-primary)] break-all select-all">
                  {currentUser?.uid || 'Initializing...'}
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  This cryptographic UID is assigned by Firebase Authentication. It is stored permanently across sessions in local storage to prevent identity race conditions.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] space-y-2">
                <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                  Data Privacy Guarantees
                </h4>
                <ul className="text-xs text-[var(--text-secondary)] space-y-1.5 list-disc list-inside leading-relaxed">
                  <li><strong>Zero PII Collected:</strong> We never ask for your email address, phone number, or government credentials.</li>
                  <li><strong>Isolated Firestore Queries:</strong> All cloud database queries are restricted using <code>array-contains</code> on your user UID. Unrelated users cannot discover or read your expenses.</li>
                  <li><strong>Invite-Only Group Access:</strong> Other participants can only join your group if you explicitly provide them your 6-character private invite code.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border-default)] bg-[var(--bg-subtle)] flex justify-end">
          <button
            onClick={onClose}
            className="ui-btn ui-btn-secondary px-4 py-2 text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
