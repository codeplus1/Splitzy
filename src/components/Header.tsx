import React from 'react';
import {
  Settings,
  Cloud,
  CloudOff,
  RefreshCw,
  Lock,
  LogOut,
} from 'lucide-react';
import { Member, SupportedLanguage } from '../types';
import { SyncStatus } from '../services/firebase';
import { PWAInstallButton } from './PWAInstallButton';
import { MemberAvatar } from './MemberAvatar';
import { SplitzeLogo } from './SplitzeLogo';

interface HeaderProps {
  language: SupportedLanguage;
  onCreateGroupClick: () => void;
  onJoinGroupClick?: () => void;
  onOpenSettings: () => void;
  onHomeClick?: () => void;
  onLockAppClick?: () => void;
  onLogoutClick?: () => void;
  currentMember?: Member;
  onEditUserClick?: () => void;
  syncStatus?: SyncStatus;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onHomeClick,
  onLockAppClick,
  onLogoutClick,
  currentMember,
  onEditUserClick,
  syncStatus = 'connected',
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--border)] transition-colors">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        {/* Left: Splitze Brand Logo + Wordmark */}
        <button
          onClick={onHomeClick}
          className="group flex items-center gap-2.5 focus:outline-none hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all cursor-pointer shrink-0"
          title="Splitze — Split smart. Stay even."
          aria-label="Splitze Home"
        >
          <SplitzeLogo
            variant="horizontal"
            size="sm"
            markClassName="group-hover:border-[#63E6BE] group-hover:shadow-xs transition-all"
          />
        </button>

        {/* Right Controls: Sync Status, User Profile Pill, Install Button, Lock, Settings */}
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
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#63E6BE] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#12B886] dark:bg-[#63E6BE]"></span>
                </span>
                <Cloud className="w-3 h-3 text-[#087F5B] dark:text-[#63E6BE]" />
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
                className="w-6 h-6 ring-1 ring-[#63E6BE]/60 group-hover:scale-105 transition-transform"
              />
              <span className="max-w-[80px] sm:max-w-[110px] truncate tracking-tight">
                {currentMember.name}
              </span>
            </button>
          )}

          {/* PWA Install Button */}
          <PWAInstallButton variant="header" />

          {/* Quick Lock Button (when App Lock PIN is enabled) */}
          {onLockAppClick && (
            <button
              id="header-lock-app-btn"
              onClick={onLockAppClick}
              className="group w-8 h-8 flex items-center justify-center rounded-lg text-[var(--ink-secondary)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all border border-[var(--border)] cursor-pointer shrink-0"
              title="Lock App"
              aria-label="Lock App"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          )}

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

          {/* Direct Logout Button (no confirmation, goes straight to Login page) */}
          {onLogoutClick && (
            <button
              id="header-logout-btn"
              type="button"
              onClick={onLogoutClick}
              className="group w-8 h-8 flex items-center justify-center rounded-lg text-[var(--ink-secondary)] bg-[var(--surface-subtle)] hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-800 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all border border-[var(--border)] cursor-pointer shrink-0"
              title="Log Out"
              aria-label="Log Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

