import React, { useState } from 'react';
import { X, Trash2, Users, AtSign, ArrowRight, Loader2, Check } from 'lucide-react';
import {
  Group,
  Member,
  SupportedLanguage,
  CalendarType,
} from '../types';
import { translate } from '../core/i18n';
import { DEFAULT_RETENTION_OPTION } from '../core/retention';
import { MemberAvatar } from './MemberAvatar';
import {
  cloudLookupRegisteredUser,
  generateDefaultUsername,
} from '../services/firebase';

interface CreateGroupModalProps {
  onClose: () => void;
  onGroupCreated: (group: Group, initialMembers: Member[]) => void;
  currentUserMember?: Member;
  language: SupportedLanguage;
  defaultCurrency?: string;
  defaultCalendar?: CalendarType;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  onClose,
  onGroupCreated,
  currentUserMember,
  language: currentAppLang,
  defaultCurrency = 'NPR',
  defaultCalendar = 'BS' as CalendarType,
}) => {
  const [groupName, setGroupName] = useState('');

  // Only include the current user (Group Creator) by default.
  const ownerEntry: Member = {
    id: currentUserMember?.id || 'm_owner',
    username:
      currentUserMember?.username ||
      generateDefaultUsername(currentUserMember?.name || 'You', currentUserMember?.uid),
    uid: currentUserMember?.uid,
    name: currentUserMember?.name || 'You',
    avatar: currentUserMember?.avatar || '👨‍💻',
    color: currentUserMember?.color || '#059669',
    createdAt: currentUserMember?.createdAt || new Date().toISOString(),
  };

  const [membersList, setMembersList] = useState<Member[]>([ownerEntry]);
  const [newMemberIdentifier, setNewMemberIdentifier] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddMember = async () => {
    if (isLookingUp) return;
    const trimmed = newMemberIdentifier.trim();
    if (!trimmed) return;

    setErrorMsg(null);
    setIsLookingUp(true);

    try {
      const lookup = await cloudLookupRegisteredUser(trimmed);
      if (!lookup.found || !lookup.member) {
        setErrorMsg(lookup.message);
        return;
      }

      const verifiedUser = lookup.member;
      if (
        membersList.some(
          m =>
            m.id === verifiedUser.id ||
            (m.username &&
              verifiedUser.username &&
              m.username.toLowerCase() === verifiedUser.username.toLowerCase())
        )
      ) {
        setErrorMsg(
          `@${verifiedUser.username || verifiedUser.name} is already added to this group.`
        );
        return;
      }

      setMembersList(prev => [...prev, verifiedUser]);
      setNewMemberIdentifier('');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleRemoveMember = (id: string) => {
    if (membersList.length <= 1) return;
    setMembersList(prev => prev.filter(m => m.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!groupName.trim()) {
      setErrorMsg('Please enter a group name.');
      return;
    }

    let effectiveMembers = [...membersList];
    if (effectiveMembers.length === 0) {
      effectiveMembers = [ownerEntry];
    }

    const memberUids: string[] = Array.from(
      new Set(
        effectiveMembers
          .map(m => m.uid)
          .filter((u): u is string => typeof u === 'string' && u.length > 0)
      )
    );

    const groupId = `g_${Date.now()}`;
    const newGroup: Group = {
      id: groupId,
      name: groupName.trim(),
      baseCurrency: defaultCurrency,
      preferredCalendar: defaultCalendar,
      language: currentAppLang,
      memberUserIds: memberUids.length > 0 ? memberUids : undefined,
      settled: false,
      settledAt: null,
      retentionOption: DEFAULT_RETENTION_OPTION,
      scheduledDeleteAt: null,
      keepGroup: false,
      createdAt: new Date().toISOString(),
    };

    const finalMembers: Member[] = effectiveMembers.map(m => ({
      id: m.id,
      username: m.username,
      uid: m.uid,
      name: m.name.trim(),
      avatar: m.avatar,
      color: m.color,
      groupId,
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
        className="ui-modal-card max-w-[460px]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3 bg-[var(--surface)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--surface-subtle)] text-[var(--ink)] flex items-center justify-center border border-[var(--border)] shrink-0">
              <Users className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold font-display text-[var(--ink)] tracking-tight leading-tight">
                {translate(currentAppLang, 'createGroup')}
              </h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5 truncate">
                Defaults · {defaultCurrency} · {defaultCalendar} Calendar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] transition-colors cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 text-xs font-medium leading-relaxed">
              {errorMsg}
            </div>
          )}

          {/* Group Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="create-group-name-input"
              className="text-xs font-semibold text-[var(--ink)] flex items-center justify-between"
            >
              <span>{translate(currentAppLang, 'groupName')}</span>
              <span className="text-[11px] font-normal text-[var(--ink-muted)]">Required</span>
            </label>
            <input
              id="create-group-name-input"
              type="text"
              required
              autoFocus
              placeholder="e.g. Pokhara Trip, Flat 402 Rent, Weekend Dinner"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[13px] font-medium text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent-mint)]/20 transition-all"
            />
          </div>

          {/* Members List & Direct Username Lookup */}
          <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-semibold text-[var(--ink)]">
                Participants <span className="font-mono text-[var(--ink-muted)] ml-0.5">({membersList.length})</span>
              </label>
              <span className="text-[11px] text-[var(--ink-muted)]">
                Creator included automatically
              </span>
            </div>

            {/* Clean Divider List (No nested box clutter) */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)]/45 divide-y divide-[var(--border-subtle)] max-h-44 overflow-y-auto">
              {membersList.map((m, idx) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-3.5 py-2.5 gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MemberAvatar
                      name={m.name}
                      avatar={m.avatar}
                      color={m.color}
                      size="xs"
                    />
                    <div className="min-w-0 flex items-baseline gap-1.5 truncate">
                      <span className="text-[13px] font-semibold text-[var(--ink)] truncate">
                        {m.name}
                      </span>
                      {m.username && (
                        <span className="text-[11px] font-mono text-[var(--ink-muted)] truncate">
                          · @{m.username}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {idx === 0 ? (
                      <span className="text-[11px] font-medium text-[var(--ink-secondary)] flex items-center gap-1">
                        <Check className="w-3 h-3 text-[#087F5B] dark:text-[#63E6BE]" />
                        <span>Owner</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.id)}
                        className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        aria-label={`Remove ${m.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Registered User by Unique @username */}
            <div className="space-y-1.5 pt-1">
              <label
                htmlFor="create-group-add-member-input"
                className="text-[11px] font-semibold text-[var(--ink-secondary)] block"
              >
                Add friend by unique @username
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex items-center grow">
                  <AtSign className="w-3.5 h-3.5 text-[var(--ink-muted)] absolute left-3.5 pointer-events-none" />
                  <input
                    id="create-group-add-member-input"
                    type="text"
                    placeholder="username"
                    value={newMemberIdentifier}
                    onChange={e => setNewMemberIdentifier(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMember();
                      }
                    }}
                    className="w-full h-9 pl-8 pr-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent-mint)]/20 transition-all"
                  />
                </div>
                <button
                  type="button"
                  disabled={isLookingUp || !newMemberIdentifier.trim()}
                  onClick={handleAddMember}
                  className="h-9 px-3.5 text-xs font-semibold rounded-xl bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-[var(--ink)] border border-[var(--border)] transition-all cursor-pointer shrink-0 disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  {isLookingUp ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Checking</span>
                    </>
                  ) : (
                    <span>Add User</span>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-[var(--ink-muted)] leading-normal">
                Or create the group now and share its 6-character invite code later.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl text-xs font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] transition-colors cursor-pointer"
            >
              {translate(currentAppLang, 'cancel')}
            </button>
            <button
              id="create-group-submit-btn"
              type="submit"
              className="ui-btn-primary h-10 px-5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
            >
              <span>{translate(currentAppLang, 'createGroup')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
