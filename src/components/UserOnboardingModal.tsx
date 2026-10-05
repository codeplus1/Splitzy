import React, { useState, useRef } from 'react';
import { Sparkles, ArrowRight, User, Upload, Trash2, Camera, AtSign } from 'lucide-react';
import { SupportedLanguage } from '../types';
import { MemberAvatar } from './MemberAvatar';
import { processAvatarImage } from '../core/receipt';
import { normalizeUsername, generateDefaultUsername } from '../services/firebase';

interface UserOnboardingModalProps {
  isOpen: boolean;
  initialName?: string;
  initialUsername?: string;
  initialAvatar?: string;
  initialColor?: string;
  isEditing?: boolean;
  onSaveUser: (name: string, username: string, avatar: string, color: string) => Promise<{ success: boolean; error?: string }> | void;
  onClose?: () => void;
  language: SupportedLanguage;
}

const AVATAR_OPTIONS = ['👨‍💻', '👩‍💻', '🧗', '👩‍🎨', '📸', '🎒', '✈️', '🎸', '🍜', '☕', '🏕️', '🌟'];
const COLOR_OPTIONS = ['#670B27', '#059669', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];

export const UserOnboardingModal: React.FC<UserOnboardingModalProps> = ({
  isOpen,
  initialName = '',
  initialUsername = '',
  initialAvatar = '👨‍💻',
  initialColor = '#670B27',
  isEditing = false,
  onSaveUser,
  onClose,
  language,
}) => {
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [hasEditedUsernameManually, setHasEditedUsernameManually] = useState(Boolean(initialUsername));
  const [avatar, setAvatar] = useState(initialAvatar);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setUsername(initialUsername);
      setHasEditedUsernameManually(Boolean(initialUsername));
      setAvatar(initialAvatar);
      setColor(initialColor);
      setError(null);
      setIsSaving(false);
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
    try {
      const result = await onSaveUser(trimmed, cleanUser, avatar, color);
      if (result && !result.success && result.error) {
        setError(result.error);
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
        {/* Top Burgundy Header */}
        <div className="bg-[var(--brand-primary)] dark:bg-[#240B16] p-4 sm:p-5 text-white border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex flex-col items-center justify-center shrink-0">
              <div className="relative leading-none">
                <span className="font-display font-bold text-base text-white tracking-tight">
                  S
                </span>
                <span className="absolute -top-0.5 -right-2 text-[7px] text-[#F7A8B7]">✦</span>
              </div>
              <span className="text-[6px] font-semibold tracking-wider text-[#F7A8B7]">
                Splitzy
              </span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#F7A8B7]">
                <Sparkles className="w-3 h-3" />
                {isEditing
                  ? isFrench
                    ? 'Profil Utilisateur'
                    : 'Your Profile'
                  : isFrench
                  ? 'Bienvenue sur Splitzy'
                  : 'Welcome to Splitzy'}
              </span>
              <h2 className="text-base font-semibold font-display tracking-tight text-white leading-snug">
                {isEditing
                  ? isFrench
                    ? 'Modifier votre profil'
                    : 'Update your profile'
                  : isFrench
                  ? 'Comment vous appelez-vous ?'
                  : "What's your name?"}
              </h2>
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
            <div className="p-2.5 rounded-lg bg-[var(--danger-subtle)] border border-[var(--danger-border)] text-[var(--danger-text)] text-xs font-medium">
              {error}
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
                    ? 'Téléchargez une photo ou choisissez un emoji'
                    : 'Upload a photo or pick an emoji below'}
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

          {/* Choose Emoji Avatar */}
          <div className="space-y-1.5">
            <label className="ui-label mb-0">
              {isFrench ? 'Ou choisir un emoji' : 'Or Choose an Emoji Avatar'}
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {AVATAR_OPTIONS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  className={`h-8 rounded-lg text-base flex items-center justify-center border transition-all cursor-pointer active:scale-95 ${
                    avatar === emoji
                      ? 'bg-[var(--brand-subtle)] border-[var(--brand-border)] scale-105 shadow-2xs'
                      : 'bg-[var(--bg-subtle)] border-[var(--border-default)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Choose Badge Color */}
          <div className="space-y-1.5">
            <label className="ui-label mb-0">
              {isFrench ? 'Couleur du profil' : 'Profile Color'}
            </label>
            <div className="flex items-center gap-2">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform cursor-pointer active:scale-90 ${
                    color === c ? 'scale-110 ring-2 ring-offset-2 ring-[var(--brand-primary)]' : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>

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
                  ? 'Continuer vers Splitzy'
                  : 'Continue to Splitzy'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
