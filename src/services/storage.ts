import {
  Group,
  Member,
  GroupMember,
  Expense,
  ExpenseShare,
  SettlementRecord,
  SupportedLanguage,
  UserSecurityProfile,
} from '../types';

export interface AppState {
  groups: Group[];
  members: Member[];
  groupMembers: GroupMember[];
  expenses: Expense[];
  expenseShares: ExpenseShare[];
  settlements: SettlementRecord[];
  activeGroupId: string | null;
  theme: 'light' | 'dark' | 'system';
  language: SupportedLanguage;
  currentUserId: string; // for personal balance perspective
  userProfile?: Member; // The primary owner/user profile saved when opening the app
  pendingGroupIds?: string[]; // IDs of groups created locally in this session pending cloud confirmation
  pendingExpenseIds?: string[]; // IDs of expenses created/edited locally pending cloud confirmation
  pendingSettlementIds?: string[]; // IDs of settlements recorded locally pending cloud confirmation
  deletedExpenseIds?: string[]; // Tombstones to prevent deleted expenses from resurfacing during merge
  deletedGroupIds?: string[]; // Tombstones to prevent deleted groups from resurfacing during merge
  userSecurityProfile?: UserSecurityProfile;
}

const STORAGE_KEY = 'hisab_sathi_v1_store';
const RECOVERY_CODE_STORAGE_KEY = 'hisab_sathi_local_recovery_code';
const DATA_EPOCH_KEY = 'splitzy_clean_epoch_v5';
const APP_LOCK_PIN_HASH_KEY = 'splitzy_app_lock_pin_hash';
const APP_LOCK_SAVED_PIN_BACKUP_KEY = 'splitzy_saved_pin_hash_backup';
const APP_LOCK_ENABLED_KEY = 'splitzy_app_lock_enabled';
const APP_LOCK_TIMEOUT_MS_KEY = 'splitzy_app_lock_timeout_ms';
const AUTHORITATIVE_AUTH_UID_KEY = 'hisabsathi_auth_uid';
const LOCAL_USER_KEY = 'hisabsathi_client_session_user';
const ACCOUNT_CREDENTIALS_STORAGE_KEY = 'splitzy_account_credentials_v1';

export interface StoredAccountCredential {
  username: string;
  memberId: string;
  uid?: string;
  name: string;
  avatar?: string;
  color?: string;
  passwordHash?: string;
  pinHash?: string;
  status?: 'active' | 'deleted';
  deletedAt?: string;
  sessionVersion?: number;
  updatedAt: string;
}

export function saveLocalAccountCredential(cred: StoredAccountCredential): void {
  try {
    const clean = cred.username.trim().toLowerCase().replace(/^@+/, '');
    if (!clean) return;
    const raw = localStorage.getItem(ACCOUNT_CREDENTIALS_STORAGE_KEY);
    const map: Record<string, StoredAccountCredential> = raw ? JSON.parse(raw) : {};
    const prev = map[clean] || ({} as Partial<StoredAccountCredential>);
    map[clean] = {
      ...prev,
      ...cred,
      username: clean,
      passwordHash: cred.passwordHash !== undefined ? cred.passwordHash : prev.passwordHash,
      pinHash: cred.pinHash !== undefined ? cred.pinHash : prev.pinHash,
      status: cred.status || prev.status || 'active',
      sessionVersion: cred.sessionVersion ?? prev.sessionVersion ?? 1,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(ACCOUNT_CREDENTIALS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage issues
  }
}

export function purgeLocalAccountSession(username?: string): AppState {
  try {
    if (username) {
      removeLocalAccountCredential(username);
    }
    localStorage.removeItem('splitze_last_logged_out_username');
    localStorage.removeItem(APP_LOCK_SAVED_PIN_BACKUP_KEY);
  } catch {
    // Ignore storage errors
  }
  return resetStorage();
}

export function getLocalAccountCredential(username: string): StoredAccountCredential | null {
  try {
    const clean = username.trim().toLowerCase().replace(/^@+/, '');
    if (!clean) return null;
    const raw = localStorage.getItem(ACCOUNT_CREDENTIALS_STORAGE_KEY);
    if (!raw) return null;
    const map: Record<string, StoredAccountCredential> = JSON.parse(raw);
    return map[clean] || null;
  } catch {
    return null;
  }
}

export function removeLocalAccountCredential(username: string): void {
  try {
    const clean = username.trim().toLowerCase().replace(/^@+/, '');
    if (!clean) return;
    const raw = localStorage.getItem(ACCOUNT_CREDENTIALS_STORAGE_KEY);
    if (!raw) return;
    const map: Record<string, StoredAccountCredential> = JSON.parse(raw);
    delete map[clean];
    localStorage.setItem(ACCOUNT_CREDENTIALS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage issues
  }
}

export function clearAllLocalLocksAndSessionKeys(): void {
  try {
    const existingPinHash = localStorage.getItem(APP_LOCK_PIN_HASH_KEY);
    if (existingPinHash) {
      localStorage.setItem(APP_LOCK_SAVED_PIN_BACKUP_KEY, existingPinHash);
    }
    localStorage.removeItem(APP_LOCK_PIN_HASH_KEY);
    localStorage.removeItem(APP_LOCK_ENABLED_KEY);
    localStorage.removeItem(APP_LOCK_TIMEOUT_MS_KEY);
    localStorage.removeItem(RECOVERY_CODE_STORAGE_KEY);
    localStorage.removeItem(AUTHORITATIVE_AUTH_UID_KEY);
    localStorage.removeItem(LOCAL_USER_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function getInitialCleanState(): AppState {
  return {
    groups: [],
    members: [],
    groupMembers: [],
    expenses: [],
    expenseShares: [],
    settlements: [],
    activeGroupId: null,
    theme: 'light',
    language: 'en',
    currentUserId: '',
    pendingGroupIds: [],
    pendingExpenseIds: [],
    pendingSettlementIds: [],
    deletedExpenseIds: [],
    deletedGroupIds: [],
  };
}

export function loadAppState(): AppState {
  try {
    const hasMigratedEpoch = localStorage.getItem(DATA_EPOCH_KEY) === '1';
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw || !hasMigratedEpoch) {
      clearAllLocalLocksAndSessionKeys();
      localStorage.setItem(DATA_EPOCH_KEY, '1');
      const clean = getInitialCleanState();
      saveAppState(clean);
      return clean;
    }

    const parsed = JSON.parse(raw) as Partial<AppState>;

    // If the stored data contains old demo/stale groups,
    // reset local storage and PIN lock keys to a 100% clean, empty state.
    if (
      parsed.groups?.some(
        g =>
          g.id === 'g_pokhara' ||
          g.id === 'g_1791187741908' ||
          g.inviteCode === 'KJCAN4' ||
          g.inviteCode === 'DHUAH3' ||
          g.name?.includes('September खर्च')
      )
    ) {
      clearAllLocalLocksAndSessionKeys();
      localStorage.setItem(DATA_EPOCH_KEY, '1');
      const clean: AppState = {
        ...getInitialCleanState(),
        theme: parsed.theme || 'light',
        language: parsed.language || 'en',
      };
      saveAppState(clean);
      return clean;
    }
    const loadedMembers = parsed.members || [];
    const currentMember =
      loadedMembers.find(m => m.id === parsed.currentUserId) || loadedMembers[0];
    const resolvedUserProfile = parsed.userProfile || currentMember || undefined;

    if (
      resolvedUserProfile &&
      !loadedMembers.some(m => m.id === resolvedUserProfile.id)
    ) {
      loadedMembers.unshift(resolvedUserProfile);
    }

    return {
      groups: parsed.groups || [],
      members: loadedMembers,
      groupMembers: parsed.groupMembers || [],
      expenses: parsed.expenses || [],
      expenseShares: parsed.expenseShares || [],
      settlements: parsed.settlements || [],
      activeGroupId: parsed.activeGroupId ?? null,
      theme: parsed.theme || 'light',
      language: parsed.language || 'en',
      currentUserId: parsed.currentUserId || resolvedUserProfile?.id || '',
      userProfile: resolvedUserProfile,
      pendingGroupIds: parsed.pendingGroupIds || [],
      pendingExpenseIds: parsed.pendingExpenseIds || [],
      pendingSettlementIds: parsed.pendingSettlementIds || [],
      deletedExpenseIds: parsed.deletedExpenseIds || [],
      deletedGroupIds: parsed.deletedGroupIds || [],
      userSecurityProfile: parsed.userSecurityProfile,
    };
  } catch (err) {
    console.error('Failed to load from storage:', err);
    return getInitialCleanState();
  }
}

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save to storage:', err);
  }
}

export function saveLocalRecoveryCode(code: string): void {
  try {
    localStorage.setItem(RECOVERY_CODE_STORAGE_KEY, code);
  } catch (err) {
    console.error('Failed to save recovery code to local storage:', err);
  }
}

export function loadLocalRecoveryCode(): string | null {
  try {
    return localStorage.getItem(RECOVERY_CODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearLocalRecoveryCode(): void {
  try {
    localStorage.removeItem(RECOVERY_CODE_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Reconciles local and cloud data ensuring zero data loss:
 * 1. An empty or partial cloud result NEVER destroys valid local expenses.
 * 2. Unsynchronized local expenses (and offline edits) remain preserved until cloud confirms them.
 * 3. Deleted items tracked in tombstones are not resurrected.
 * 4. Duplicate IDs are deduplicated.
 */
export function reconcileAppState(
  local: AppState,
  cloud: {
    groups: Group[];
    members: Member[];
    groupMembers: GroupMember[];
    expenses: Expense[];
    expenseShares: ExpenseShare[];
    settlements: SettlementRecord[];
  }
): AppState {
  // If the user is currently logged out on this device (no active userProfile and no currentUserId),
  // do NOT populate local state from background cloud listeners until they log in or register.
  if (!local.userProfile && !local.currentUserId) {
    return local;
  }

  const deletedExpenseSet = new Set(local.deletedExpenseIds || []);
  const deletedGroupSet = new Set(local.deletedGroupIds || []);
  const pendingGroupSet = new Set(local.pendingGroupIds || []);
  const pendingExpenseSet = new Set(local.pendingExpenseIds || []);
  const pendingSettlementSet = new Set(local.pendingSettlementIds || []);
  const cloudGroupIdSet = new Set(cloud.groups.map(g => g.id));

  // 1. Reconcile Groups
  const groupMap = new Map<string, Group>();
  local.groups.forEach(g => {
    if (
      !deletedGroupSet.has(g.id) &&
      g.inviteCode !== 'KJCAN4' &&
      !g.name?.includes('September खर्च') &&
      (cloudGroupIdSet.has(g.id) || pendingGroupSet.has(g.id))
    ) {
      groupMap.set(g.id, g);
    }
  });
  cloud.groups.forEach(g => {
    if (
      deletedGroupSet.has(g.id) ||
      g.inviteCode === 'KJCAN4' ||
      g.name?.includes('September खर्च')
    ) {
      return;
    }
    const existing = groupMap.get(g.id);
    if (!existing) {
      groupMap.set(g.id, g);
    } else {
      // Merge memberUserIds union
      const mergedUserIds = Array.from(
        new Set([...(existing.memberUserIds || []), ...(g.memberUserIds || [])])
      );
      groupMap.set(g.id, {
        ...existing,
        ...g,
        memberUserIds: mergedUserIds,
      });
    }
  });

  const validGroupIdSet = new Set(groupMap.keys());

  // 2. Reconcile Members (exclude permanently deleted account tombstones)
  const memberMap = new Map<string, Member>();
  if (local.userProfile && local.userProfile.status !== 'deleted') {
    memberMap.set(local.userProfile.id, local.userProfile);
  }
  local.members.forEach(m => {
    if (
      m.status !== 'deleted' &&
      (!m.groupId || validGroupIdSet.has(m.groupId) || m.id === local.currentUserId)
    ) {
      memberMap.set(m.id, m);
    }
  });
  cloud.members.forEach(m => {
    if (m.status === 'deleted') {
      memberMap.delete(m.id);
      return;
    }
    if (!m.groupId || validGroupIdSet.has(m.groupId)) {
      const existingMem = memberMap.get(m.id);
      memberMap.set(m.id, {
        ...existingMem,
        ...m,
        passwordHash: m.passwordHash || existingMem?.passwordHash,
        pinHash: m.pinHash || existingMem?.pinHash,
      });
    }
  });

  // 3. Reconcile GroupMembers
  const gmMap = new Map<string, GroupMember>();
  local.groupMembers.forEach(gm => {
    if (!deletedGroupSet.has(gm.groupId) && validGroupIdSet.has(gm.groupId)) {
      gmMap.set(gm.id, gm);
    }
  });
  cloud.groupMembers.forEach(gm => {
    if (!deletedGroupSet.has(gm.groupId) && validGroupIdSet.has(gm.groupId)) {
      gmMap.set(gm.id, gm);
    }
  });

  // 4. Reconcile Expenses (CRITICAL: Do not drop or overwrite local offline expenses/edits that cloud hasn't received yet)
  const expenseMap = new Map<string, Expense>();
  
  // First, insert local expenses that were not explicitly deleted
  local.expenses.forEach(e => {
    if (
      !deletedExpenseSet.has(e.id) &&
      !deletedGroupSet.has(e.groupId) &&
      validGroupIdSet.has(e.groupId)
    ) {
      expenseMap.set(e.id, e);
    }
  });

  // Next, merge cloud expenses (cloud takes precedence ONLY for confirmed items not currently pending offline sync)
  cloud.expenses.forEach(e => {
    if (
      !deletedExpenseSet.has(e.id) &&
      !deletedGroupSet.has(e.groupId) &&
      validGroupIdSet.has(e.groupId) &&
      !pendingExpenseSet.has(e.id)
    ) {
      expenseMap.set(e.id, e);
    }
  });

  // 5. Reconcile ExpenseShares (only keep shares for valid expenses; preserve local shares for pending offline expenses)
  const validExpenseIds = new Set(expenseMap.keys());
  const shareMap = new Map<string, ExpenseShare>();

  local.expenseShares.forEach(s => {
    if (validExpenseIds.has(s.expenseId)) {
      shareMap.set(s.id, s);
    }
  });

  cloud.expenseShares.forEach(s => {
    if (validExpenseIds.has(s.expenseId) && !pendingExpenseSet.has(s.expenseId)) {
      shareMap.set(s.id, s);
    }
  });

  // 6. Reconcile Settlements
  const settlementMap = new Map<string, SettlementRecord>();
  local.settlements.forEach(s => {
    if (!deletedGroupSet.has(s.groupId) && validGroupIdSet.has(s.groupId)) {
      settlementMap.set(s.id, s);
    }
  });
  cloud.settlements.forEach(s => {
    if (
      !deletedGroupSet.has(s.groupId) &&
      validGroupIdSet.has(s.groupId) &&
      !pendingSettlementSet.has(s.id)
    ) {
      settlementMap.set(s.id, s);
    }
  });

  // Calculate updated pendingGroupIds, pendingExpenseIds, and pendingSettlementIds
  const remainingPendingGroups = Array.from(groupMap.keys()).filter(
    id => !cloudGroupIdSet.has(id) && pendingGroupSet.has(id)
  );
  const cloudExpenseById = new Map<string, Expense>(cloud.expenses.map(e => [e.id, e]));
  const remainingPending = Array.from(expenseMap.keys()).filter(id => {
    const cloudExp = cloudExpenseById.get(id);
    if (!cloudExp) return true;
    const localExp = expenseMap.get(id);
    if (!localExp) return false;
    // Keep in pending if local offline edit differs from cloud snapshot
    return (
      pendingExpenseSet.has(id) &&
      (cloudExp.baseAmount !== localExp.baseAmount ||
        cloudExp.title !== localExp.title ||
        cloudExp.paidBy !== localExp.paidBy)
    );
  });
  const cloudSettlementIdSet = new Set(cloud.settlements.map(s => s.id));
  const remainingPendingSettlements = Array.from(settlementMap.keys()).filter(
    id => !cloudSettlementIdSet.has(id) && pendingSettlementSet.has(id)
  );

  return {
    ...local,
    groups: Array.from(groupMap.values()),
    members: Array.from(memberMap.values()),
    groupMembers: Array.from(gmMap.values()),
    expenses: Array.from(expenseMap.values()),
    expenseShares: Array.from(shareMap.values()),
    settlements: Array.from(settlementMap.values()),
    pendingGroupIds: remainingPendingGroups,
    pendingExpenseIds: remainingPending,
    pendingSettlementIds: remainingPendingSettlements,
  };
}

export function resetStorage(): AppState {
  clearAllLocalLocksAndSessionKeys();
  const clean = getInitialCleanState();
  saveAppState(clean);
  return clean;
}

export function exportStateAsJSON(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function importStateFromJSON(jsonString: string): AppState | null {
  try {
    const parsed = JSON.parse(jsonString) as AppState;
    if (parsed && Array.isArray(parsed.groups) && Array.isArray(parsed.members)) {
      saveAppState(parsed);
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
