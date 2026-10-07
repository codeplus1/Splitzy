import React, { useState } from 'react';
import { X, Trash2, Users, AtSign, UserPlus } from 'lucide-react';
import {
  Group,
  Member,
  SupportedLanguage,
  CalendarType,
  RetentionPeriod,
  createGuestParticipant,
} from '../types';
import { SUPPORTED_CURRENCIES } from '../core/currency';
import { translate } from '../core/i18n';
import { MemberAvatar } from './MemberAvatar';
import { cloudLookupRegisteredUser } from '../services/firebase';
import { DEFAULT_RETENTION_OPTION, RETENTION_PERIOD_OPTIONS } from '../core/retention';

interface CreateGroupModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onGroupCreated: (newGroup: Group, newMembers: Member[]) => void;
  currentUserMember?: Member;
  language: SupportedLanguage;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  onClose,
  onGroupCreated,
  currentUserMember,
  language,
}) => {
  const [groupName, setGroupName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('NPR');
  const [preferredCalendar, setPreferredCalendar] = useState<CalendarType>('BS');
  const [retentionPeriod, setRetentionPeriod] = useState<RetentionPeriod>(DEFAULT_RETENTION_OPTION);

  const isTemporaryUser = Boolean(
    currentUserMember?.isTemporary || !currentUserMember?.username
  );

  const ownerEntry: Member & { isOwner?: boolean } = currentUserMember
    ? {
        ...currentUserMember,
        avatar: currentUserMember.avatar || '👨‍💻',
        color: currentUserMember.color || '#101D2D',
        accountType: currentUserMember.username ? 'registered' : 'guest',
        isOwner: true,
      }
    : {
        id: `m_owner_${Date.now()}`,
        name: 'Guest',
        avatar: '👨‍💻',
        color: '#101D2D',
        accountType: 'guest',
        isTemporary: true,
        createdAt: new Date().toISOString(),
        isOwner: true,
      };

  // Dynamic additional member list (owner is automatically included)
  const [members, setMembers] = useState<(Member & { isOwner?: boolean })[]>([ownerEntry]);

  const [newMemberIdentifier, setNewMemberIdentifier] = useState('');
  const [addMode, setAddMode] = useState<'guest' | 'username'>(() =>
    isTemporaryUser ? 'guest' : 'guest'
  );
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isFrench = language === 'fr';

  const addGuestByName = (rawName: string): Member | null => {
    const cleanName = rawName.trim();
    if (!cleanName) return null;
    const guest = createGuestParticipant(cleanName, undefined, members.length);
    return guest;
  };

  const handleAddMember = async () => {
    if (isLookingUp) return;
    const trimmed = newMemberIdentifier.trim();
    if (!trimmed) return;

    setErrorMessage(null);
    setStatusMessage(null);

    const shouldLookupUsername =
      !isTemporaryUser && (addMode === 'username' || trimmed.startsWith('@'));

    if (!shouldLookupUsername) {
      const cleanGuestName = trimmed.replace(/^@+/, '').trim();
      if (!cleanGuestName) return;
      const guestMember = addGuestByName(cleanGuestName);
      if (guestMember) {
        setMembers(prev => [...prev, guestMember]);
        setNewMemberIdentifier('');
        setStatusMessage(
          isFrench
            ? `${guestMember.name} ajouté(e) comme participant invité`
            : `Added ${guestMember.name} as guest`
        );
      }
      return;
    }

    setIsLookingUp(true);
    try {
      const lookup = await cloudLookupRegisteredUser(trimmed);
      if (!lookup.found || !lookup.member) {
        setErrorMessage(lookup.message);
        return;
      }

      const foundMember: Member = {
        ...lookup.member,
        accountType: 'registered',
        userId: lookup.member.uid ?? null,
      };
      if (
        members.some(
          m =>
            m.id === foundMember.id ||
            (m.username &&
              foundMember.username &&
              m.username.toLowerCase() === foundMember.username.toLowerCase())
        )
      ) {
        setErrorMessage(`${foundMember.name} is already in this list.`);
        return;
      }

      setMembers(prev => [...prev, foundMember]);
      setNewMemberIdentifier('');
      setStatusMessage(`Verified & added @${foundMember.username} (${foundMember.name})`);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleRemoveMember = (id: string) => {
    if (id === ownerEntry.id) return;
    setMembers(members.filter(m => m.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isLookingUp) return;
    setErrorMessage(null);

    if (!groupName.trim()) {
      setErrorMessage('Please provide a group name.');
      return;
    }

    let effectiveMembers = [...members];
    const pendingIdentifier = newMemberIdentifier.trim();
    if (pendingIdentifier) {
      const shouldLookupUsername =
        !isTemporaryUser && (addMode === 'username' || pendingIdentifier.startsWith('@'));
      if (!shouldLookupUsername) {
        const cleanGuestName = pendingIdentifier.replace(/^@+/, '').trim();
        if (cleanGuestName) {
          const guestMember = createGuestParticipant(
            cleanGuestName,
            undefined,
            effectiveMembers.length
          );
          effectiveMembers.push(guestMember);
        }
      } else {
        setIsLookingUp(true);
        const lookup = await cloudLookupRegisteredUser(pendingIdentifier);
        setIsLookingUp(false);
        if (!lookup.found || !lookup.member) {
          setErrorMessage(lookup.message);
          return;
        }
        if (!effectiveMembers.some(m => m.id === lookup.member!.id)) {
          effectiveMembers.push({
            ...lookup.member,
            accountType: 'registered',
            userId: lookup.member.uid ?? null,
          });
        }
      }
    }

    setIsSubmitting(true);

    if (effectiveMembers.length === 0) {
      effectiveMembers = [ownerEntry];
    }

    const memberUids = Array.from(
      new Set(
        effectiveMembers
          .map(m => m.uid)
          .filter((u): u is string => Boolean(u))
      )
    );

    const groupId = `g_${Date.now()}`;
    const newGroup: Group = {
      id: groupId,
      name: groupName.trim(),
      baseCurrency,
      preferredCalendar,
      language,
      memberUserIds: memberUids.length > 0 ? memberUids : undefined,
      retentionPeriod,
      settled: false,
      createdAt: new Date().toISOString(),
    };

    const finalMembers: Member[] = effectiveMembers.map(m => ({
      id: m.id,
      username: m.username,
      uid: m.uid ?? null,
      userId: m.userId ?? m.uid ?? null,
      accountType: m.accountType || (m.username ? 'registered' : 'guest'),
      isTemporary: m.isTemporary ?? !m.username,
      groupId,
      name: m.name.trim(),
      avatar: m.avatar,
      color: m.color,
      createdAt: m.createdAt || new Date().toISOString(),
    }));

    onGroupCreated(newGroup, finalMembers);
    onClose();
  };

  return (
    <div
      id="create-group-modal-backdrop"
      className="ui-modal-backdrop"
      onClick={onClose}
    >
      <div
        id="create-group-modal-card"
        className="ui-modal-card max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="ui-modal-header">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center font-semibold border border-[var(--accent-border)]">
              <Users className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold font-display tracking-tight text-[var(--ink)]">
              {translate(language, 'createGroup')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
              {errorMessage}
            </div>
          )}

          {/* Group Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--ink-secondary)]">
              Group Name *
            </label>
            <input
              id="create-group-name-input"
              type="text"
              required
              placeholder="e.g. Pokhara Trip, Flat 402 Rent, Goa Vacation..."
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              className="ui-input"
            />
          </div>

          {/* Base Currency & Calendar Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--ink-secondary)] block mb-1">
                {translate(language, 'baseCurrency')}
              </label>
              <select
                id="create-group-currency-select"
                value={baseCurrency}
                onChange={e => setBaseCurrency(e.target.value)}
                className="ui-input text-xs"
              >
                {SUPPORTED_CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--ink-secondary)] block mb-1">
                {translate(language, 'calendarPref')}
              </label>
              <select
                id="create-group-calendar-select"
                value={preferredCalendar}
                onChange={e => setPreferredCalendar(e.target.value as CalendarType)}
                className="ui-input text-xs"
              >
                <option value="BS">Bikram Sambat (BS)</option>
                <option value="AD">Gregorian (AD)</option>
              </select>
            </div>
          </div>

          {/* Auto-Delete Retention After Settled */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--ink-secondary)] block">
              {isFrench
                ? 'Suppression auto après règlement complet'
                : 'Auto-Delete After Group Settled'}
            </label>
            <select
              id="create-group-retention-select"
              value={retentionPeriod}
              onChange={e => setRetentionPeriod(e.target.value as RetentionPeriod)}
              className="ui-input text-xs"
            >
              {RETENTION_PERIOD_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {isFrench ? opt.labelFr : opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Members List */}
          <div className="space-y-2 border-t border-[var(--border)] pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--ink)]">
                Group Members ({members.length})
              </label>
              <span className="text-[11px] text-[var(--ink-muted)]">
                {isFrench ? 'Vous êtes inclus automatiquement' : 'You are automatically included'}
              </span>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {members.map(m => (
                <div
                  key={m.id}
                  className="ui-subcard flex items-center justify-between p-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MemberAvatar name={m.name} avatar={m.avatar} color={m.color} size="sm" />
                    <span className="text-xs font-semibold text-[var(--ink)] truncate">
                      {m.name}
                    </span>
                    {m.username && (
                      <span className="text-[10px] font-mono text-[var(--ink-secondary)]">
                        @{m.username}
                      </span>
                    )}
                    {m.isOwner ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]">
                        {isFrench ? 'Vous' : 'You'}
                      </span>
                    ) : m.accountType === 'guest' || !m.username ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface-subtle)] text-[var(--ink-secondary)] border border-[var(--border)]">
                        {isFrench ? 'Invité' : 'Guest'}
                      </span>
                    ) : null}
                  </div>
                  {!m.isOwner && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.id)}
                      className="text-[var(--ink-muted)] hover:text-rose-500 p-1 transition-colors cursor-pointer"
                      title="Remove member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add People to Group */}
            <div className="space-y-1.5 pt-1">
              {!isTemporaryUser && (
                <div className="flex items-center justify-between gap-2 pb-0.5">
                  <span className="text-[11px] font-semibold text-[var(--ink-secondary)]">
                    {isFrench ? 'Ajouter des personnes au groupe' : 'Add people to your group'}
                  </span>
                  <div className="inline-flex rounded-lg bg-[var(--surface-subtle)] p-0.5 border border-[var(--border)] text-[10px] font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setAddMode('guest');
                        setErrorMessage(null);
                      }}
                      className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                        addMode === 'guest'
                          ? 'bg-[var(--surface)] text-[var(--ink)] shadow-2xs'
                          : 'text-[var(--ink-secondary)]'
                      }`}
                    >
                      {isFrench ? 'Par nom (Invité)' : 'By Name (Guest)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddMode('username');
                        setErrorMessage(null);
                      }}
                      className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                        addMode === 'username'
                          ? 'bg-[var(--surface)] text-[var(--ink)] shadow-2xs'
                          : 'text-[var(--ink-secondary)]'
                      }`}
                    >
                      @username
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="flex items-center grow rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--accent)] focus-within:ring-3 focus-within:ring-[var(--accent)]/10 transition-all overflow-hidden">
                  <span className="pl-2.5 pr-1.5 py-1.5 text-xs font-mono font-bold text-[var(--ink-muted)] bg-[var(--surface-subtle)] border-r border-[var(--border-subtle)] select-none flex items-center">
                    {!isTemporaryUser && addMode === 'username' ? (
                      <AtSign className="w-3.5 h-3.5" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <input
                    id="create-group-add-member-input"
                    type="text"
                    placeholder={
                      !isTemporaryUser && addMode === 'username'
                        ? isFrench
                          ? 'Entrer le @username d’un utilisateur inscrit...'
                          : "Enter registered user's @username..."
                        : isFrench
                        ? 'Entrer un prénom (ex. Abc, Rahul, Sarah)...'
                        : 'Enter name (e.g. Abc, Rahul, Sarah)...'
                    }
                    value={newMemberIdentifier}
                    onChange={e => {
                      setNewMemberIdentifier(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                      if (statusMessage) setStatusMessage(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMember();
                      }
                    }}
                    className="w-full px-2.5 py-1.5 bg-transparent text-xs text-[var(--ink)] focus:outline-none"
                  />
                </div>
                <button
                  id="create-group-add-member-btn"
                  type="button"
                  disabled={isLookingUp}
                  onClick={handleAddMember}
                  className="px-3 py-1.5 text-xs font-bold text-[var(--accent)] bg-[var(--accent-soft)] hover:opacity-90 rounded-lg border border-[var(--accent-border)] transition-colors cursor-pointer shrink-0"
                >
                  {isLookingUp
                    ? '...'
                    : !isTemporaryUser && addMode === 'username'
                    ? '+ Verify'
                    : '+ Add'}
                </button>
              </div>
              {statusMessage && (
                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  ✓ {statusMessage}
                </p>
              )}
              <p className="text-[10px] text-[var(--ink-muted)]">
                {!isTemporaryUser && addMode === 'username'
                  ? 'Add a registered Splitze user by their @username, or switch to "By Name (Guest)" to add someone without an account.'
                  : isFrench
                  ? 'Entrez un nom pour ajouter quelqu’un à ce groupe. Aucun compte Splitze n’est requis.'
                  : "Enter a name to add someone to this group. They don't need a Splitze account."}
              </p>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn-secondary px-4 py-2 text-xs"
            >
              {translate(language, 'cancel')}
            </button>
            <button
              id="create-group-submit-btn"
              type="submit"
              disabled={isSubmitting}
              className="ui-btn-primary px-5 py-2.5 text-xs shadow-xs"
            >
              {isSubmitting ? 'Creating...' : translate(language, 'createGroup')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
