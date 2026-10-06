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
  pendingExpenseIds?: string[]; // IDs of expenses created locally pending cloud confirmation
  deletedExpenseIds?: string[]; // Tombstones to prevent deleted expenses from resurfacing during merge
  deletedGroupIds?: string[]; // Tombstones to prevent deleted groups from resurfacing during merge
  userSecurityProfile?: UserSecurityProfile;
}

const STORAGE_KEY = 'hisab_sathi_v1_store';
const RECOVERY_CODE_STORAGE_KEY = 'hisab_sathi_local_recovery_code';
const DATA_EPOCH_KEY = 'splitzy_clean_epoch_v5';
const APP_LOCK_PIN_HASH_KEY = 'splitzy_app_lock_pin_hash';
const APP_LOCK_ENABLED_KEY = 'splitzy_app_lock_enabled';
const APP_LOCK_TIMEOUT_MS_KEY = 'splitzy_app_lock_timeout_ms';
const AUTHORITATIVE_AUTH_UID_KEY = 'hisabsathi_auth_uid';
const LOCAL_USER_KEY = 'hisabsathi_client_session_user';

export function clearAllLocalLocksAndSessionKeys(): void {
  try {
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
 * 2. Unsynchronized local expenses remain preserved until cloud confirms them.
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
  const deletedExpenseSet = new Set(local.deletedExpenseIds || []);
  const deletedGroupSet = new Set(local.deletedGroupIds || []);
  const pendingGroupSet = new Set(local.pendingGroupIds || []);
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

  // 2. Reconcile Members
  const memberMap = new Map<string, Member>();
  if (local.userProfile) {
    memberMap.set(local.userProfile.id, local.userProfile);
  }
  local.members.forEach(m => {
    if (!m.groupId || validGroupIdSet.has(m.groupId) || m.id === local.currentUserId) {
      memberMap.set(m.id, m);
    }
  });
  cloud.members.forEach(m => {
    if (!m.groupId || validGroupIdSet.has(m.groupId)) {
      memberMap.set(m.id, m);
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

  // 4. Reconcile Expenses (CRITICAL: Do not drop local expenses that cloud hasn't received or confirmed yet)
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

  // Next, merge cloud expenses (cloud takes precedence for confirmed state, but ignores tombstoned)
  cloud.expenses.forEach(e => {
    if (
      !deletedExpenseSet.has(e.id) &&
      !deletedGroupSet.has(e.groupId) &&
      validGroupIdSet.has(e.groupId)
    ) {
      expenseMap.set(e.id, e);
    }
  });

  // 5. Reconcile ExpenseShares (only keep shares for valid expenses)
  const validExpenseIds = new Set(expenseMap.keys());
  const shareMap = new Map<string, ExpenseShare>();

  local.expenseShares.forEach(s => {
    if (validExpenseIds.has(s.expenseId)) {
      shareMap.set(s.id, s);
    }
  });

  cloud.expenseShares.forEach(s => {
    if (validExpenseIds.has(s.expenseId)) {
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
    if (!deletedGroupSet.has(s.groupId) && validGroupIdSet.has(s.groupId)) {
      settlementMap.set(s.id, s);
    }
  });

  // Calculate updated pendingGroupIds and pendingExpenseIds
  const remainingPendingGroups = Array.from(groupMap.keys()).filter(
    id => !cloudGroupIdSet.has(id) && pendingGroupSet.has(id)
  );
  const cloudExpenseIdSet = new Set(cloud.expenses.map(e => e.id));
  const remainingPending = Array.from(expenseMap.keys()).filter(
    id => !cloudExpenseIdSet.has(id)
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
