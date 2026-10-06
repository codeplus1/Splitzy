import React, { useState, useRef } from 'react';
import { Sparkles, ArrowRight, User, Upload, Trash2, Camera, AtSign, ShieldCheck, LogOut } from 'lucide-react';
import { SupportedLanguage } from '../types';
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
  isEditing?: boolean;
  onSaveUser: (
    name: string,
    username: string,
    avatar: string,
    color: string
  ) => Promise<{ success: boolean; error?: string; usernameTaken?: boolean }> | void;
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
  isEditing = false,
  onSaveUser,
  onOpenRecoveryCenter,
  onLogoutAccount,
  onDeleteAccount,
  onClose,
  language,
}) => {
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [hasEditedUsernameManually, setHasEditedUsernameManually] = useState(Boolean(initialUsername));
  const [avatar, setAvatar] = useState(initialAvatar);
  const [color] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [isUsernameTaken, setIsUsernameTaken] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setUsername(initialUsername);
      setHasEditedUsernameManually(Boolean(initialUsername));
      setAvatar(initialAvatar);
      setError(null);
      setIsUsernameTaken(false);
      setIsSaving(false);
      setShowLogoutConfirm(false);
      setIsLoggingOut(false);
      setShowDeleteConfirm(false);
      setIsDeleting(false);
    }
  }, [isOpen, initialName, initialUsername, initialAvatar, initialColor]);

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

    setIsSaving(true);
    setError(null);
    setIsUsernameTaken(false);
    try {
      const result = await onSaveUser(trimmed, cleanUser, avatar, color);
      if (result && !result.success) {
        if (result.usernameTaken) {
          setIsUsernameTaken(true);
        }
        if (result.error) {
          setError(result.error);
        }
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
                    {isEditing
                      ? isFrench
                        ? 'Profil Utilisateur'
                        : 'Your Profile'
                      : isFrench
                      ? 'Bienvenue sur Splitze'
                      : 'Welcome to Splitze'}
                  </span>
                </h2>
                <p className="text-xs font-medium text-[#8B9AAF] mt-0.5 leading-snug">
                  {isEditing
                    ? isFrench
                      ? 'Modifier votre profil'
                      : 'Update your profile'
                    : 'Split smart. Stay even.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {isFrench
              ? 'Votre nom et votre photo seront utilisés automatiquement lorsque vous créerez ou rejoindrez des groupes.'
              : 'Your name and profile picture will be used automatically whenever you create or join groups.'}
          </p>

          {error && (
            <div className="p-2.5 rounded-lg bg-[var(--danger-subtle)] border border-[var(--danger-border)] text-[var(--danger-text)] text-xs font-medium space-y-2">
              <p>{error}</p>
              {isUsernameTaken && onOpenRecoveryCenter && (
                <button
                  type="button"
                  onClick={onOpenRecoveryCenter}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#101D2D] dark:text-[#63E6BE] underline underline-offset-2 hover:opacity-80 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    {isFrench
                      ? 'Restaurer avec un code de récupération ou une sauvegarde chiffrée'
                      : 'Restore account with Recovery Code or Encrypted Backup'}
                  </span>
                </button>
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
          <p className="text-[11px] text-[var(--ink-muted)] leading-snug">
            {isFrench
              ? 'Les autres utilisateurs ne peuvent vous ajouter à un groupe qu’avec votre @username unique vérifié.'
              : 'Others can only add you to a group using your verified unique @username or via group invite.'}
          </p>

          {isEditing && (onLogoutAccount || onDeleteAccount) && (
            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2.5">
              {!showLogoutConfirm && !showDeleteConfirm && (
                <div className="flex items-center justify-between gap-3">
                  {onLogoutAccount && (
                    <button
                      id="profile-modal-logout-account-btn"
                      type="button"
                      onClick={() => setShowLogoutConfirm(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)] hover:underline cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>
                        {isFrench ? 'Se déconnecter' : 'Log Out'}
                      </span>
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
                      <span>
                        {isFrench ? 'Supprimer mon compte' : 'Delete My Account'}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {showLogoutConfirm && onLogoutAccount && (
                <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] space-y-2.5">
                  <p className="text-xs font-medium text-[var(--ink)] leading-snug">
                    {isFrench
                      ? 'Se déconnecter de cet appareil ? Votre compte cloud est conservé.'
                      : 'Log out of your account on this device? Your cloud account and @username remain saved.'}
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isLoggingOut}
                      onClick={() => setShowLogoutConfirm(false)}
                      className="ui-btn ui-btn-secondary py-1 px-2.5 text-xs"
                    >
                      {isFrench ? 'Annuler' : 'Cancel'}
                    </button>
                    <button
                      id="profile-modal-confirm-logout-account-btn"
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
                      className="ui-btn ui-btn-primary py-1 px-3 text-xs"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>
                        {isLoggingOut
                          ? isFrench
                            ? 'Déconnexion...'
                            : 'Logging out...'
                          : isFrench
                          ? 'Oui, me déconnecter'
                          : 'Yes, Log Out'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {showDeleteConfirm && onDeleteAccount && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2.5">
                  <p className="text-xs font-medium text-rose-700 dark:text-rose-300 leading-snug">
                    {isFrench
                      ? 'Supprimer définitivement votre compte et libérer votre @username ?'
                      : 'Permanently delete your account and release your @username?'}
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => setShowDeleteConfirm(false)}
                      className="ui-btn ui-btn-secondary py-1 px-2.5 text-xs"
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
                      className="ui-btn ui-btn-danger py-1 px-3 text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
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
              className="ui-btn ui-btn-primary w-full sm:w-auto px-4 py-2 text-xs"
            >
              <span>
                {isEditing
                  ? isFrench
                    ? 'Enregistrer'
                    : 'Save Profile'
                  : isFrench
                  ? 'Continuer vers Splitze'
                  : 'Continue to Splitze'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
