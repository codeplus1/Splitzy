import React, { useState, useRef } from 'react';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  User,
  Upload,
  Trash2,
  Camera,
  AtSign,
  ShieldCheck,
  LogOut,
  Lock,
  LogIn,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { Member, SupportedLanguage } from '../types';
import { MemberAvatar } from './MemberAvatar';
import { SplitzeLogo } from './SplitzeLogo';
import { processAvatarImage } from '../core/receipt';
import { normalizeUsername, generateDefaultUsername } from '../services/firebase';

interface UserOnboardingModalProps {
  isOpen: boolean;
  initialName?: string;
  initialUsername?: string;
  initialAvatar?: string;
  initialColor?: string;
  initialAuthTab?: 'register' | 'login';
  hasPassword?: boolean;
  isEditing?: boolean;
  isTemporaryUser?: boolean;
  onStartTemporaryUse?: () => void;
  onSaveUser: (
    name: string,
    username: string,
    avatar: string,
    color: string,
    password?: string
  ) => Promise<{ success: boolean; error?: string; usernameTaken?: boolean }> | void;
  onLoginAccount?: (
    username: string,
    passwordOrPin: string
  ) => Promise<{
    success: boolean;
    requiresPasswordCreation?: boolean;
    verifiedPinHash?: string;
    pendingMember?: Member;
    error?: string;
  }>;
  onCompletePinPasswordSetup?: (
    username: string,
    newPassword: string,
    verifiedPinHash: string,
    pendingMember?: Member
  ) => Promise<{ success: boolean; error?: string }>;
  onOpenRecoveryCenter?: () => void;
  onLogoutAccount?: () => Promise<void> | void;
  onDeleteAccount?: () => Promise<void> | void;
  onClose?: () => void;
  language: SupportedLanguage;
}

export const UserOnboardingModal: React.FC<UserOnboardingModalProps> = ({
  isOpen,
  initialName = '',
  initialUsername = '',
  initialAvatar = '👨‍💻',
  initialColor = '#101D2D',
  initialAuthTab = 'register',
  hasPassword = false,
  isEditing = false,
  isTemporaryUser = false,
  onStartTemporaryUse,
  onSaveUser,
  onLoginAccount,
  onCompletePinPasswordSetup,
  onOpenRecoveryCenter,
  onLogoutAccount,
  onDeleteAccount,
  onClose,
  language,
}) => {
  const [onboardingStep, setOnboardingStep] = useState<'choose_mode' | 'auth'>(() =>
    isEditing || initialAuthTab === 'login' ? 'auth' : 'choose_mode'
  );
  const [authTab, setAuthTab] = useState<'register' | 'login'>(initialAuthTab);
  const [name, setName] = useState(
    isTemporaryUser && (initialName === 'Guest' || initialName === 'You') ? '' : initialName
  );
  const [username, setUsername] = useState(isTemporaryUser ? '' : initialUsername);
  const [hasEditedUsernameManually, setHasEditedUsernameManually] = useState(
    Boolean(!isTemporaryUser && initialUsername)
  );
  const [avatar, setAvatar] = useState(initialAvatar === '👤' ? '👨‍💻' : initialAvatar);
  const [color] = useState(initialColor);

  // Registration / Profile Update password state
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Login state (Password or App Lock PIN -> Mandatory Password Setup)
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPasswordOrPin, setLoginPasswordOrPin] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [pinVerifiedStep, setPinVerifiedStep] = useState<{
    username: string;
    verifiedPinHash: string;
    pendingMember?: Member;
  } | null>(null);
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [confirmNewAccountPassword, setConfirmNewAccountPassword] = useState('');
  const [showNewAccountPassword, setShowNewAccountPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isUsernameTaken, setIsUsernameTaken] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const wasOpenRef = useRef(false);

  React.useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      setOnboardingStep(isEditing || initialAuthTab === 'login' ? 'auth' : 'choose_mode');
      setAuthTab(initialAuthTab);
      const effectiveInitialName =
        isTemporaryUser && (initialName === 'Guest' || initialName === 'You')
          ? ''
          : initialName;
      const effectiveInitialUsername = isTemporaryUser ? '' : initialUsername;
      setName(effectiveInitialName);
      setUsername(effectiveInitialUsername);
      setHasEditedUsernameManually(Boolean(effectiveInitialUsername));
      setAvatar(initialAvatar === '👤' ? '👨‍💻' : initialAvatar);
      setPassword('');
      setLoginUsername(effectiveInitialUsername || '');
      setLoginPasswordOrPin('');
      setPinVerifiedStep(null);
      setNewAccountPassword('');
      setConfirmNewAccountPassword('');
      setError(null);
      setIsUsernameTaken(false);
      setIsSaving(false);
      setIsLoggingOut(false);
      setShowDeleteConfirm(false);
      setIsDeleting(false);
    } else if (!isOpen) {
      wasOpenRef.current = false;
    }
  }, [
    isOpen,
    initialName,
    initialUsername,
    initialAvatar,
    initialColor,
    initialAuthTab,
    isEditing,
    isTemporaryUser,
  ]);

  // If user just logged out while modal opens or transitions to onboarding, switch immediately to login tab with their @username pre-filled
  React.useEffect(() => {
    if (isOpen && !isEditing && initialAuthTab === 'login') {
      setOnboardingStep('auth');
      setAuthTab('login');
      if (initialUsername) {
        setLoginUsername(initialUsername);
      }
      setLoginPasswordOrPin('');
      setPinVerifiedStep(null);
      setError(null);
    }
  }, [isOpen, isEditing, initialAuthTab, initialUsername]);

  if (!isOpen) return null;

  const isFrench = language === 'fr';
  const hasCustomPhoto = Boolean(avatar && avatar.startsWith('data:image/'));

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    setError(null);
    try {
      const processedDataUrl = await processAvatarImage(file);
      setAvatar(processedDataUrl);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload profile photo.');
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError(
        isFrench
          ? 'Veuillez entrer votre nom pour continuer.'
          : 'Please enter your name to continue.'
      );
      return;
    }

    const cleanUser = normalizeUsername(username || generateDefaultUsername(trimmed));
    if (cleanUser.length < 2) {
      setError(
        isFrench
          ? 'Veuillez choisir un identifiant @username unique (min. 2 caractères).'
          : 'Please choose a unique @username ID (at least 2 characters).'
      );
      return;
    }

    const trimmedPassword = password.trim();
    // Require a password when creating a new account, or when an existing user without a password saves their profile, or if they typed a new password
    if ((!isEditing || !hasPassword || trimmedPassword.length > 0) && trimmedPassword.length < 4) {
      setError(
        isFrench
          ? 'Veuillez créer un mot de passe de compte (au moins 4 caractères) pour vous connecter.'
          : 'Please create an account password (at least 4 characters) for login.'
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    setIsUsernameTaken(false);
    try {
      const result = await onSaveUser(
        trimmed,
        cleanUser,
        avatar,
        color,
        trimmedPassword || undefined
      );
      if (result && !result.success) {
        if (result.usernameTaken) {
          setIsUsernameTaken(true);
          setLoginUsername(cleanUser);
        }
        if (result.error) {
          setError(result.error);
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !onLoginAccount) return;

    const cleanUser = normalizeUsername(loginUsername);
    if (cleanUser.length < 2) {
      setError(
        isFrench
          ? 'Veuillez entrer votre @username enregistré.'
          : 'Please enter your registered @username.'
      );
      return;
    }

    if (!loginPasswordOrPin.trim()) {
      setError(
        isFrench
          ? 'Veuillez entrer votre mot de passe ou votre code PIN à 4 chiffres.'
          : 'Please enter your password or your 4-digit App Lock PIN.'
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const res = await onLoginAccount(cleanUser, loginPasswordOrPin);
      if (!res.success) {
        setError(
          res.error ||
            (isFrench
              ? 'Mot de passe ou code PIN incorrect.'
              : 'Incorrect password or App Lock PIN.')
        );
      } else if (res.requiresPasswordCreation && res.verifiedPinHash) {
        setPinVerifiedStep({
          username: cleanUser,
          verifiedPinHash: res.verifiedPinHash,
          pendingMember: res.pendingMember,
        });
        setNewAccountPassword('');
        setConfirmNewAccountPassword('');
        setError(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompletePinPasswordSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !pinVerifiedStep || !onCompletePinPasswordSetup) return;

    const trimmedNew = newAccountPassword.trim();
    if (trimmedNew.length < 4) {
      setError(
        isFrench
          ? 'Le mot de passe doit contenir au moins 4 caractères.'
          : 'Password must be at least 4 characters long.'
      );
      return;
    }
    if (trimmedNew !== confirmNewAccountPassword.trim()) {
      setError(
        isFrench
          ? 'Les mots de passe ne correspondent pas.'
          : 'Passwords do not match. Please re-enter.'
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const res = await onCompletePinPasswordSetup(
        pinVerifiedStep.username,
        trimmedNew,
        pinVerifiedStep.verifiedPinHash,
        pinVerifiedStep.pendingMember
      );
      if (!res.success) {
        setError(res.error || 'Failed to save new password.');
      } else {
        setPinVerifiedStep(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="user-onboarding-modal-backdrop"
      className="ui-modal-backdrop"
      onClick={isEditing && onClose ? onClose : undefined}
    >
      <div
        id="user-onboarding-modal-card"
        className="ui-modal-card max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Splitze Navy Header */}
        <div className="bg-gradient-to-br from-[#101D2D] via-[#152436] to-[#0B1420] p-4 sm:p-5 text-white border-b border-[#63E6BE]/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <SplitzeLogo variant="mark" size={40} />
              <div>
                <h2 className="inline-flex items-center gap-1.5 text-sm sm:text-base font-bold font-display tracking-tight text-white leading-snug">
                  <Sparkles className="w-3.5 h-3.5 text-[#63E6BE]" />
                  <span>
                    {pinVerifiedStep
                      ? isFrench
                        ? 'Créer votre mot de passe'
                        : 'Create Account Password'
                      : onboardingStep === 'choose_mode' && !isEditing
                      ? isFrench
                        ? 'Comment voulez-vous utiliser Splitzy ?'
                        : 'How do you want to use Splitzy?'
                      : isEditing && isTemporaryUser
                      ? isFrench
                        ? 'Passer à une utilisation à long terme'
                        : 'Switch to Long-Term Use'
                      : isEditing
                      ? isFrench
                        ? 'Profil Utilisateur'
                        : 'Your Profile'
                      : authTab === 'login'
                      ? isFrench
                        ? 'Connexion à Splitze'
                        : 'Log In to Splitze'
                      : isFrench
                      ? 'Créer votre compte Splitze'
                      : 'Create Your Splitzy Account'}
                  </span>
                </h2>
                <p className="text-xs font-medium text-[#8B9AAF] mt-0.5 leading-snug">
                  {pinVerifiedStep
                    ? isFrench
                      ? `PIN vérifié pour @${pinVerifiedStep.username}`
                      : `PIN verified for @${pinVerifiedStep.username} — set a password for login`
                    : onboardingStep === 'choose_mode' && !isEditing
                    ? isFrench
                      ? 'Choisissez comment démarrer. Vous pourrez créer un compte plus tard.'
                      : 'Choose how to get started. You can create an account later anytime.'
                    : isEditing && isTemporaryUser
                    ? isFrench
                      ? 'Créez un compte pour conserver vos groupes et dépenses'
                      : 'Create an account & keep all your existing groups and expenses'
                    : isEditing
                    ? isFrench
                      ? 'Modifier votre profil et mot de passe'
                      : 'Update your profile & login password'
                    : authTab === 'login'
                    ? isFrench
                      ? 'Connectez-vous avec votre mot de passe ou PIN'
                      : 'Sign in with your password or App Lock PIN'
                    : 'Split smart. Stay even.'}
                </p>
              </div>
            </div>

            {!isEditing && !pinVerifiedStep && onboardingStep === 'auth' && (
              <button
                id="onboarding-back-to-choice-btn"
                type="button"
                onClick={() => {
                  setOnboardingStep('choose_mode');
                  setError(null);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-[#63E6BE] transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{isFrench ? 'Options' : 'Back'}</span>
              </button>
            )}
          </div>

          {/* Mode Tabs when in auth step (either new user or temporary user upgrading to Long-Term Use) */}
          {onboardingStep === 'auth' && (!isEditing || isTemporaryUser) && !pinVerifiedStep && (
            <div className="grid grid-cols-2 gap-1.5 p-1 mt-3.5 bg-[#0B1420]/80 rounded-xl border border-white/10">
              <button
                id="onboarding-tab-register-btn"
                type="button"
                onClick={() => {
                  setAuthTab('register');
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  authTab === 'register'
                    ? 'bg-[#63E6BE] text-[#101D2D] shadow-xs'
                    : 'text-[#8B9AAF] hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isFrench ? 'Créer un compte' : 'Create Account'}</span>
              </button>
              <button
                id="onboarding-tab-login-btn"
                type="button"
                onClick={() => {
                  setAuthTab('login');
                  if (username && !loginUsername) {
                    setLoginUsername(username);
                  }
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  authTab === 'login'
                    ? 'bg-[#63E6BE] text-[#101D2D] shadow-xs'
                    : 'text-[#8B9AAF] hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{isFrench ? 'Se connecter' : 'Account Login'}</span>
              </button>
            </div>
          )}
        </div>

        {/* STEP 1: HOW DO YOU WANT TO USE SPLITZY? (Temporary Use vs Long-Term Use) */}
        {onboardingStep === 'choose_mode' && !isEditing && !pinVerifiedStep ? (
          <div className="p-4 sm:p-5 space-y-3.5">
            {/* Option 1: Temporary Use */}
            <button
              id="onboarding-choose-temporary-btn"
              type="button"
              onClick={() => {
                if (onStartTemporaryUse) {
                  onStartTemporaryUse();
                }
              }}
              className="group w-full text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all cursor-pointer flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#63E6BE]/20 text-[#101D2D] dark:text-[#63E6BE] flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-[var(--ink)] flex items-center gap-2">
                    <span>{isFrench ? 'Utilisation temporaire' : 'Temporary Use'}</span>
                    <span aria-hidden="true" className="text-[var(--ink-muted)] font-normal">·</span>
                    <span className="text-xs font-medium text-[var(--ink-secondary)]">
                      {isFrench ? 'Sans compte' : 'No Account'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {isFrench
                      ? 'Utilisez l’application immédiatement sans créer de compte. Créez des groupes, ajoutez des dépenses et partagez les factures normalement.'
                      : 'Use the app without creating an account. Enter immediately to create groups, add expenses, invite friends, and settle bills.'}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--ink-muted)] group-hover:text-[var(--ink)] group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </button>

            {/* Option 2: Long-Term Use */}
            <button
              id="onboarding-choose-long-term-btn"
              type="button"
              onClick={() => {
                setOnboardingStep('auth');
                setAuthTab('register');
                setError(null);
              }}
              className="group w-full text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all cursor-pointer flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#101D2D] text-[#63E6BE] flex items-center justify-center shrink-0 mt-0.5">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-[var(--ink)] flex items-center gap-2">
                    <span>{isFrench ? 'Utilisation à long terme' : 'Long-Term Use'}</span>
                    <span aria-hidden="true" className="text-[var(--ink-muted)] font-normal">·</span>
                    <span className="text-xs font-medium text-[var(--brand-text)]">
                      {isFrench ? 'Créer un compte' : 'Personal Profile'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {isFrench
                      ? 'Créez un compte avec votre @username personnel et un mot de passe pour conserver votre profil et synchroniser vos groupes.'
                      : 'Create an account to keep using the app with a personal profile, unique @username, and password protection.'}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--ink-muted)] group-hover:text-[var(--ink)] group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </button>

            {/* Existing Account Login Link */}
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>
                {isFrench ? 'Vous avez déjà un compte ?' : 'Already have an account?'}
              </span>
              <button
                id="onboarding-choice-login-btn"
                type="button"
                onClick={() => {
                  setOnboardingStep('auth');
                  setAuthTab('login');
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 font-semibold text-[var(--ink)] hover:underline cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>{isFrench ? 'Se connecter' : 'Log In'}</span>
              </button>
            </div>
          </div>
        ) : pinVerifiedStep ? (
          <form onSubmit={handleCompletePinPasswordSetup} className="p-4 sm:p-5 space-y-4">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {isFrench
                    ? `Code PIN vérifié pour @${pinVerifiedStep.username}`
                    : `App Lock PIN Verified for @${pinVerifiedStep.username}`}
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                {isFrench
                  ? 'Votre code PIN a permis de vérifier votre compte existant. Veuillez maintenant créer un mot de passe pour vos prochaines connexions.'
                  : 'Your App Lock PIN unlocked your existing account. Please create a password now — you will use this password the next time you log in.'}
              </p>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-[var(--danger-subtle)] border border-[var(--danger-border)] text-[var(--danger-text)] text-xs font-medium">
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="pin-migration-new-password-input"
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)]"
              >
                <KeyRound className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>{isFrench ? 'Nouveau mot de passe *' : 'New Account Password *'}</span>
              </label>
              <div className="relative">
                <input
                  id="pin-migration-new-password-input"
                  type={showNewAccountPassword ? 'text' : 'password'}
                  autoFocus
                  required
                  placeholder={
                    isFrench ? 'Au moins 4 caractères...' : 'Create password (min 4 characters)'
                  }
                  value={newAccountPassword}
                  onChange={e => {
                    setNewAccountPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  className="ui-input w-full pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowNewAccountPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                >
                  {showNewAccountPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="pin-migration-confirm-password-input"
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)]"
              >
                <Lock className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>{isFrench ? 'Confirmer le mot de passe *' : 'Confirm New Password *'}</span>
              </label>
              <input
                id="pin-migration-confirm-password-input"
                type={showNewAccountPassword ? 'text' : 'password'}
                required
                placeholder={
                  isFrench ? 'Ressaisissez le mot de passe...' : 'Re-enter your new password'
                }
                value={confirmNewAccountPassword}
                onChange={e => {
                  setConfirmNewAccountPassword(e.target.value);
                  if (error) setError(null);
                }}
                className="ui-input w-full"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                id="pin-migration-save-password-btn"
                type="submit"
                disabled={isSaving}
                className="ui-btn ui-btn-primary w-full px-4 py-2 text-xs"
              >
                <span>
                  {isSaving
                    ? isFrench
                      ? 'Enregistrement...'
                      : 'Saving Password...'
                    : isFrench
                    ? 'Enregistrer le mot de passe et continuer'
                    : 'Save Password & Log In'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        ) : authTab === 'login' && (!isEditing || isTemporaryUser) ? (
          /* ACCOUNT LOGIN TAB */
          <form onSubmit={handleLoginSubmit} className="p-4 sm:p-5 space-y-4">
            {isTemporaryUser && (
              <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-xs text-[var(--text-secondary)] leading-relaxed">
                {isFrench
                  ? 'Vos groupes et dépenses temporaires actuels seront automatiquement associés à votre compte après connexion.'
                  : 'Your current temporary groups and expenses will be automatically preserved and associated with your account when you log in.'}
              </div>
            )}
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isFrench
                ? 'Entrez votre @username et votre mot de passe. Si vous étiez déjà inscrit avant l’ajout des mots de passe, utilisez votre code PIN à 4 chiffres pour cette connexion.'
                : 'Enter your registered @username and password. Already registered before passwords were added? Use your 4-digit App Lock PIN for now, then create a password right after.'}
            </p>

            {error && (
              <div className="p-2.5 rounded-lg bg-[var(--danger-subtle)] border border-[var(--danger-border)] text-[var(--danger-text)] text-xs font-medium space-y-2">
                <p>{error}</p>
                {onOpenRecoveryCenter && (
                  <button
                    type="button"
                    onClick={onOpenRecoveryCenter}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#101D2D] dark:text-[#63E6BE] underline underline-offset-2 hover:opacity-80 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {isFrench
                        ? 'Mot de passe oublié ? Restaurer via le centre de récupération'
                        : 'Forgot password or PIN? Restore with Recovery Code'}
                    </span>
                  </button>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="login-username-input"
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)]"
              >
                <AtSign className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>{isFrench ? 'Votre @username *' : 'Registered @username *'}</span>
              </label>
              <div className="flex items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--accent)] focus-within:ring-3 focus-within:ring-[var(--accent)]/10 transition-all overflow-hidden">
                <span className="pl-3 pr-1.5 py-2 text-xs font-mono font-bold text-[var(--ink-muted)] bg-[var(--surface-subtle)] border-r border-[var(--border-subtle)] select-none">
                  @
                </span>
                <input
                  id="login-username-input"
                  type="text"
                  autoFocus={!loginUsername}
                  required
                  placeholder="saroj_88"
                  value={loginUsername}
                  onChange={e => {
                    setLoginUsername(normalizeUsername(e.target.value));
                    if (error) setError(null);
                  }}
                  className="w-full px-2.5 py-2 bg-transparent text-xs font-mono text-[var(--ink)] focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="login-password-or-pin-input"
                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)]"
              >
                <Lock className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>
                  {isFrench ? 'Mot de passe ou Code PIN *' : 'Password or App Lock PIN *'}
                </span>
              </label>
              <div className="relative">
                <input
                  id="login-password-or-pin-input"
                  type={showLoginPassword ? 'text' : 'password'}
                  autoFocus={Boolean(loginUsername)}
                  required
                  placeholder={
                    isFrench
                      ? 'Entrez votre mot de passe ou PIN à 4 chiffres'
                      : 'Enter password or 4-digit App Lock PIN'
                  }
                  value={loginPasswordOrPin}
                  onChange={e => {
                    setLoginPasswordOrPin(e.target.value);
                    if (error) setError(null);
                  }}
                  className="ui-input w-full pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                >
                  {showLoginPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                id="onboarding-login-submit-btn"
                type="submit"
                disabled={isSaving}
                className="ui-btn ui-btn-primary w-full px-4 py-2 text-xs"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>
                  {isSaving
                    ? isFrench
                      ? 'Vérification...'
                      : 'Verifying...'
                    : isFrench
                    ? 'Se connecter'
                    : 'Log In to Account'}
                </span>
              </button>

              {onOpenRecoveryCenter && (
                <button
                  type="button"
                  onClick={onOpenRecoveryCenter}
                  className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)] py-1 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>
                    {isFrench
                      ? 'Restaurer avec un code de récupération ou une sauvegarde'
                      : 'Restore with Recovery Code or Encrypted Backup'}
                  </span>
                </button>
              )}
            </div>
          </form>
        ) : (
          /* CREATE ACCOUNT / EDIT PROFILE FORM */
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isFrench
                ? 'Votre nom et votre photo seront utilisés automatiquement lorsque vous créerez ou rejoindrez des groupes.'
                : 'Your name, @username, and password protect your account and sync your groups across devices.'}
            </p>

            {error && (
              <div className="p-2.5 rounded-lg bg-[var(--danger-subtle)] border border-[var(--danger-border)] text-[var(--danger-text)] text-xs font-medium space-y-2">
                <p>{error}</p>
                {isUsernameTaken && !isEditing && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginUsername(normalizeUsername(username));
                        setAuthTab('login');
                        setError(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#101D2D] text-[#63E6BE] text-[11px] font-bold hover:opacity-90 cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>
                        {isFrench
                          ? `Se connecter à @${normalizeUsername(username)}`
                          : `Log In to @${normalizeUsername(username)} with Password / PIN`}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Profile Picture Upload + Preview */}
            <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="relative group rounded-full cursor-pointer shrink-0 focus:outline-none"
                  title={isFrench ? 'Télécharger une photo' : 'Upload profile picture'}
                >
                  <MemberAvatar
                    name={name.trim() || 'You'}
                    avatar={avatar}
                    color={color}
                    size="lg"
                    className="ring-2 ring-[var(--accent)]/30 group-hover:opacity-90 transition-opacity"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-xs border border-white dark:border-stone-900">
                    <Camera className="w-2.5 h-2.5" />
                  </span>
                </button>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-[var(--ink)] block truncate">
                    {isFrench ? 'Photo de profil' : 'Profile Picture'}
                  </span>
                  <span className="text-[11px] text-[var(--ink-secondary)] block">
                    {hasCustomPhoto
                      ? isFrench
                        ? 'Photo personnalisée active'
                        : 'Custom photo uploaded'
                      : isFrench
                      ? 'Téléchargez une photo de profil (optionnel)'
                      : 'Upload a profile picture (optional)'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="ui-btn-secondary px-2.5 py-1.5 text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3 h-3 text-[var(--accent)]" />
                  <span>
                    {isUploadingPhoto
                      ? '...'
                      : hasCustomPhoto
                      ? isFrench
                        ? 'Changer'
                        : 'Change'
                      : isFrench
                      ? 'Photo'
                      : 'Upload'}
                  </span>
                </button>
                {hasCustomPhoto && (
                  <button
                    type="button"
                    onClick={() => setAvatar('👨‍💻')}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                    title={isFrench ? 'Supprimer la photo' : 'Remove photo'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Name Input & Unique @Username Input */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="onboarding-user-name-input"
                  className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)]"
                >
                  <User className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>{isFrench ? 'Votre Nom *' : 'Your Name *'}</span>
                </label>
                <input
                  id="onboarding-user-name-input"
                  type="text"
                  autoFocus
                  required
                  placeholder={isFrench ? 'Ex. Saroj, Alex...' : 'e.g. Saroj, Alex...'}
                  value={name}
                  onChange={e => {
                    const val = e.target.value;
                    setName(val);
                    if (!hasEditedUsernameManually) {
                      setUsername(normalizeUsername(val));
                    }
                    if (error) setError(null);
                  }}
                  className="ui-input w-full"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="onboarding-username-input"
                  className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)]"
                >
                  <AtSign className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>{isFrench ? 'ID Unique (@username) *' : 'Unique ID (@username) *'}</span>
                </label>
                <div className="flex items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--accent)] focus-within:ring-3 focus-within:ring-[var(--accent)]/10 transition-all overflow-hidden">
                  <span className="pl-3 pr-1.5 py-1.5 text-xs font-mono font-bold text-[var(--ink-muted)] bg-[var(--surface-subtle)] border-r border-[var(--border-subtle)] select-none">
                    @
                  </span>
                  <input
                    id="onboarding-username-input"
                    type="text"
                    required
                    placeholder="saroj_88"
                    value={username}
                    onChange={e => {
                      setHasEditedUsernameManually(true);
                      setUsername(normalizeUsername(e.target.value));
                      if (error) setError(null);
                      if (isUsernameTaken) setIsUsernameTaken(false);
                    }}
                    className="w-full px-2.5 py-1.5 bg-transparent text-xs font-mono text-[var(--ink)] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Password Input for Account Login */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="onboarding-password-input"
                  className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)]"
                >
                  <Lock className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>
                    {isEditing
                      ? hasPassword
                        ? isFrench
                          ? 'Changer le mot de passe (optionnel)'
                          : 'Change Account Password (Optional)'
                        : isFrench
                        ? 'Créer un mot de passe de compte *'
                        : 'Create Account Password *'
                      : isFrench
                      ? 'Mot de passe du compte *'
                      : 'Account Password *'}
                  </span>
                </label>
                {isEditing && !hasPassword && (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    {isFrench ? 'Requis pour la connexion' : 'Required for login'}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  id="onboarding-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required={!isEditing || !hasPassword}
                  placeholder={
                    isEditing && hasPassword
                      ? isFrench
                        ? 'Laisser vide pour garder le mot de passe actuel'
                        : 'Leave blank to keep your current password'
                      : isFrench
                      ? 'Créez un mot de passe (min. 4 caractères)'
                      : 'Create a password for login (min 4 characters)'
                  }
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  className="ui-input w-full pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-[var(--ink-muted)] leading-snug">
              {isFrench
                ? 'Les autres utilisateurs ne peuvent vous ajouter à un groupe qu’avec votre @username unique vérifié.'
                : 'Others can only add you to a group using your verified unique @username or via group invite.'}
            </p>

            {isEditing && !isTemporaryUser && (onLogoutAccount || onDeleteAccount) && (
              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2.5">
                {!showDeleteConfirm && (
                  <div className="flex items-center justify-between gap-3">
                    {onLogoutAccount && (
                      <button
                        id="profile-modal-logout-account-btn"
                        type="button"
                        disabled={isLoggingOut}
                        onClick={async () => {
                          setIsLoggingOut(true);
                          try {
                            await onLogoutAccount();
                          } finally {
                            setIsLoggingOut(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)] hover:underline cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{isFrench ? 'Se déconnecter' : 'Log Out'}</span>
                      </button>
                    )}

                    {onDeleteAccount && (
                      <button
                        id="profile-modal-delete-account-btn"
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isFrench ? 'Supprimer mon compte' : 'Delete My Account'}</span>
                      </button>
                    )}
                  </div>
                )}

                {showDeleteConfirm && onDeleteAccount && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2.5">
                    <p className="text-xs font-medium text-rose-700 dark:text-rose-300 leading-snug">
                      {isFrench
                        ? 'Supprimer définitivement votre compte et libérer votre @username ?'
                        : 'Permanently delete your account and release your @username?'}
                    </p>
                    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setShowDeleteConfirm(false)}
                        className="ui-btn ui-btn-secondary w-full sm:w-auto py-1.5 px-2.5 text-xs justify-center"
                      >
                        {isFrench ? 'Annuler' : 'Cancel'}
                      </button>
                      <button
                        id="profile-modal-confirm-delete-account-btn"
                        type="button"
                        disabled={isDeleting}
                        onClick={async () => {
                          setIsDeleting(true);
                          try {
                            await onDeleteAccount();
                          } finally {
                            setIsDeleting(false);
                          }
                        }}
                        className="ui-btn ui-btn-danger w-full sm:w-auto py-1.5 px-3 text-xs justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {isDeleting
                            ? isFrench
                              ? 'Suppression...'
                              : 'Deleting...'
                            : isFrench
                            ? 'Oui, supprimer'
                            : 'Yes, Delete Account'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              {isEditing && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="ui-btn ui-btn-ghost text-xs"
                >
                  {isFrench ? 'Annuler' : 'Cancel'}
                </button>
              )}
              <button
                id="onboarding-save-user-btn"
                type="submit"
                disabled={isSaving}
                className="ui-btn ui-btn-primary w-full sm:w-auto px-4 py-2 text-xs"
              >
                <span>
                  {isEditing && !isTemporaryUser
                    ? isFrench
                      ? 'Enregistrer'
                      : 'Save Profile'
                    : isTemporaryUser
                    ? isFrench
                      ? 'Créer mon compte et conserver mes données'
                      : 'Create Account & Keep Data'
                    : isFrench
                    ? 'Continuer vers Splitze'
                    : 'Continue to Splitze'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
