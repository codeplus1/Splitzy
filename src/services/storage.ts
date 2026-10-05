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
import { calculateEqualShares } from '../core/calculation';

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
  pendingExpenseIds?: string[]; // IDs of expenses created locally pending cloud confirmation
  deletedExpenseIds?: string[]; // Tombstones to prevent deleted expenses from resurfacing during merge
  userSecurityProfile?: UserSecurityProfile;
}

const STORAGE_KEY = 'hisab_sathi_v1_store';
const RECOVERY_CODE_STORAGE_KEY = 'hisab_sathi_local_recovery_code';

export function getInitialDemoState(): AppState {
  const saroj: Member = {
    id: 'm_saroj',
    name: 'Saroj',
    avatar: '👨‍💻',
    color: '#059669', // Emerald
    createdAt: '2026-09-01T08:00:00.000Z',
  };
  const ram: Member = {
    id: 'm_ram',
    name: 'Ram',
    avatar: '🧗',
    color: '#2563eb', // Blue
    createdAt: '2026-09-01T08:00:00.000Z',
  };
  const sita: Member = {
    id: 'm_sita',
    name: 'Sita',
    avatar: '👩‍🎨',
    color: '#d97706', // Amber
    createdAt: '2026-09-01T08:00:00.000Z',
  };
  const hari: Member = {
    id: 'm_hari',
    name: 'Hari',
    avatar: '📸',
    color: '#7c3aed', // Purple
    createdAt: '2026-09-01T08:00:00.000Z',
  };

  const members = [saroj, ram, sita, hari];

  const pokharaGroup: Group = {
    id: 'g_pokhara',
    name: 'Pokhara Trip',
    baseCurrency: 'NPR',
    preferredCalendar: 'BS',
    language: 'ne',
    inviteCode: 'POKHR2',
    createdAt: '2026-09-01T08:30:00.000Z',
  };

  const groupMembers: GroupMember[] = members.map(m => ({
    id: `gm_${pokharaGroup.id}_${m.id}`,
    groupId: pokharaGroup.id,
    memberId: m.id,
  }));

  // Expense 1: Hotel - NPR 8,000 | Paid by Saroj | Shared by all 4
  const expHotel: Expense = {
    id: 'exp_hotel',
    groupId: pokharaGroup.id,
    title: 'Hotel',
    originalAmount: 8000,
    originalCurrency: 'NPR',
    exchangeRate: 1,
    baseAmount: 8000,
    paidBy: saroj.id,
    dateISO: '2026-09-01',
    calendarType: 'BS',
    category: 'Lodging',
    notes: 'Lakeside Resort Booking',
    createdAt: '2026-09-01T10:00:00.000Z',
  };
  const hotelShares: ExpenseShare[] = calculateEqualShares(8000, members.map(m => m.id)).map(s => ({
    id: `es_hotel_${s.memberId}`,
    expenseId: expHotel.id,
    memberId: s.memberId,
    shareAmount: s.shareAmount,
    splitType: 'equal',
  }));

  // Expense 2: Dinner - NPR 4,000 | Paid by Ram | Shared by all 4
  const expDinner: Expense = {
    id: 'exp_dinner',
    groupId: pokharaGroup.id,
    title: 'Dinner',
    originalAmount: 4000,
    originalCurrency: 'NPR',
    exchangeRate: 1,
    baseAmount: 4000,
    paidBy: ram.id,
    dateISO: '2026-09-02',
    calendarType: 'BS',
    category: 'Food',
    notes: 'Thakali Feast',
    createdAt: '2026-09-02T19:30:00.000Z',
  };
  const dinnerShares: ExpenseShare[] = calculateEqualShares(4000, members.map(m => m.id)).map(s => ({
    id: `es_dinner_${s.memberId}`,
    expenseId: expDinner.id,
    memberId: s.memberId,
    shareAmount: s.shareAmount,
    splitType: 'equal',
  }));

  // Expense 3: Taxi - NPR 2,000 | Paid by Sita | Shared by Saroj, Ram, Sita
  const expTaxi: Expense = {
    id: 'exp_taxi',
    groupId: pokharaGroup.id,
    title: 'Taxi',
    originalAmount: 2000,
    originalCurrency: 'NPR',
    exchangeRate: 1,
    baseAmount: 2000,
    paidBy: sita.id,
    dateISO: '2026-09-03',
    calendarType: 'BS',
    category: 'Transport',
    notes: 'Sarangkot Sunrise Ride',
    createdAt: '2026-09-03T05:30:00.000Z',
  };
  const taxiShares: ExpenseShare[] = calculateEqualShares(2000, [saroj.id, ram.id, sita.id]).map(s => ({
    id: `es_taxi_${s.memberId}`,
    expenseId: expTaxi.id,
    memberId: s.memberId,
    shareAmount: s.shareAmount,
    splitType: 'equal',
  }));

  return {
    groups: [pokharaGroup],
    members,
    groupMembers,
    expenses: [expHotel, expDinner, expTaxi],
    expenseShares: [...hotelShares, ...dinnerShares, ...taxiShares],
    settlements: [],
    activeGroupId: pokharaGroup.id,
    theme: 'light',
    language: 'en',
    currentUserId: saroj.id,
  };
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
  };
}

export function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const clean = getInitialCleanState();
      saveAppState(clean);
      return clean;
    }
    const parsed = JSON.parse(raw) as Partial<AppState>;
    // If the stored data contains old demo data (e.g. Pokhara trip), reset to clean state for real use
    if (parsed.groups?.some(g => g.id === 'g_pokhara')) {
      const clean = getInitialCleanState();
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
      pendingExpenseIds: parsed.pendingExpenseIds || [],
      deletedExpenseIds: parsed.deletedExpenseIds || [],
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

  // 1. Reconcile Groups
  const groupMap = new Map<string, Group>();
  local.groups.forEach(g => groupMap.set(g.id, g));
  cloud.groups.forEach(g => {
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

  // 2. Reconcile Members
  const memberMap = new Map<string, Member>();
  if (local.userProfile) {
    memberMap.set(local.userProfile.id, local.userProfile);
  }
  local.members.forEach(m => memberMap.set(m.id, m));
  cloud.members.forEach(m => memberMap.set(m.id, m));

  // 3. Reconcile GroupMembers
  const gmMap = new Map<string, GroupMember>();
  local.groupMembers.forEach(gm => gmMap.set(gm.id, gm));
  cloud.groupMembers.forEach(gm => gmMap.set(gm.id, gm));

  // 4. Reconcile Expenses (CRITICAL: Do not drop local expenses that cloud hasn't received or confirmed yet)
  const expenseMap = new Map<string, Expense>();
  
  // First, insert local expenses that were not explicitly deleted
  local.expenses.forEach(e => {
    if (!deletedExpenseSet.has(e.id)) {
      expenseMap.set(e.id, e);
    }
  });

  // Next, merge cloud expenses (cloud takes precedence for confirmed state, but ignores tombstoned)
  cloud.expenses.forEach(e => {
    if (!deletedExpenseSet.has(e.id)) {
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
  local.settlements.forEach(s => settlementMap.set(s.id, s));
  cloud.settlements.forEach(s => settlementMap.set(s.id, s));

  // Calculate updated pendingExpenseIds
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
    pendingExpenseIds: remainingPending,
  };
}

export function resetStorage(): AppState {
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
