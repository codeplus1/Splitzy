import React from 'react';
import {
  Settings,
  Cloud,
  CloudOff,
  RefreshCw,
  KeyRound,
} from 'lucide-react';
import { Member, SupportedLanguage } from '../types';
import { SyncStatus } from '../services/firebase';
import { PWAInstallButton } from './PWAInstallButton';
import { MemberAvatar } from './MemberAvatar';

interface HeaderProps {
  language: SupportedLanguage;
  onCreateGroupClick: () => void;
  onJoinGroupClick?: () => void;
  onOpenSettings: () => void;
  onHomeClick?: () => void;
  currentMember?: Member;
  onEditUserClick?: () => void;
  syncStatus?: SyncStatus;
}

export const Header: React.FC<HeaderProps> = ({
  onJoinGroupClick,
  onOpenSettings,
  onHomeClick,
  currentMember,
  onEditUserClick,
  syncStatus = 'connected',
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--border)] transition-colors">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        {/* Left: Splitzy Logo Badge + Splitzy Soft Rose Pill */}
        <div className="flex items-center gap-2">
          {/* Stylized Splitzy Logo Badge */}
          <button
            onClick={onHomeClick}
            className="w-8 h-8 rounded-[10px] bg-gradient-to-b from-[#6E0D25] to-[#3B0412] border border-[#7D1831] text-white flex flex-col items-center justify-center shadow-2xs hover:-translate-y-0.5 hover:shadow-xs active:translate-y-0 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Splitzy Home"
            aria-label="Splitzy Home"
          >
            <div className="relative leading-none">
              <span className="font-sans font-extrabold text-sm text-white tracking-tight">
                S
              </span>
              <span className="absolute -top-0.5 -right-1.5 text-[7px] text-[#EDA6B4]">✦</span>
            </div>
            <span className="text-[6px] font-bold tracking-tight text-white/90">
              Splitzy
            </span>
          </button>

          {/* Splitzy Home Soft Rose Pill */}
          <button
            onClick={onHomeClick}
            className="flex items-center justify-center px-2.5 py-1 text-xs font-bold tracking-tight text-[var(--ink)] bg-[var(--accent-soft)] hover:bg-[var(--accent-border)]/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 rounded-lg border border-[var(--accent-border)] transition-all cursor-pointer"
          >
            Splitzy
          </button>
        </div>

        {/* Right Controls: Sync Status, Join Pill, User Pill, Settings Button */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Cloud Sync Status Badge (Desktop only) */}
          <div
            id="cloud-sync-status-badge"
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--ink-secondary)]"
            title="Real-time multi-device cloud synchronization"
          >
            {syncStatus === 'connected' && (
              <>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                <Cloud className="w-3 h-3 text-[var(--accent)]" />
                <span className="text-[11px] font-semibold text-[var(--ink)]">
                  Synced
                </span>
              </>
            )}
            {syncStatus === 'syncing' && (
              <>
                <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  Syncing
                </span>
              </>
            )}
            {syncStatus === 'saving' && (
              <>
                <RefreshCw className="w-3 h-3 text-[var(--accent)] animate-spin" />
                <span className="text-[11px] font-semibold text-[var(--accent)]">
                  Saving
                </span>
              </>
            )}
            {(syncStatus === 'offline' || syncStatus === 'error') && (
              <>
                <CloudOff className="w-3 h-3 text-rose-500" />
                <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                  Offline
                </span>
              </>
            )}
          </div>

          {/* Join Button */}
          {onJoinGroupClick && (
            <button
              id="header-join-group-btn"
              onClick={onJoinGroupClick}
              className="ui-btn-secondary px-2.5 py-1.5 text-xs group"
              title="Join group with code"
            >
              <KeyRound className="w-3.5 h-3.5 text-[var(--accent)] group-hover:rotate-12 transition-transform" />
              <span>Join</span>
            </button>
          )}

          {/* Active User Profile Pill (Edit Own Profile Only) */}
          {currentMember && (
            <button
              id="header-user-btn"
              onClick={() => onEditUserClick?.()}
              className="group flex items-center gap-1.5 pl-1 pr-2.5 py-1 text-xs font-semibold rounded-full bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 text-[var(--ink)] border border-[var(--border)] transition-all cursor-pointer"
              title="Edit Your Profile"
            >
              <MemberAvatar
                name={currentMember.name}
                avatar={currentMember.avatar}
                color={currentMember.color}
                size="xs"
                className="w-6 h-6 ring-1 ring-[var(--accent-border)] group-hover:scale-105 transition-transform"
              />
              <span className="max-w-[80px] sm:max-w-[110px] truncate tracking-tight">
                {currentMember.name}
              </span>
            </button>
          )}

          {/* PWA Install Button */}
          <PWAInstallButton variant="header" />

          {/* Settings Button */}
          <button
            id="header-settings-btn"
            onClick={onOpenSettings}
            className="group w-8 h-8 flex items-center justify-center rounded-lg text-[var(--ink-secondary)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all border border-[var(--border)] cursor-pointer shrink-0"
            title="Settings & Recovery"
            aria-label="Settings & Recovery"
          >
            <Settings className="w-3.5 h-3.5 group-hover:rotate-45 transition-transform duration-200" />
          </button>
        </div>
      </div>
    </header>
  );
};

