import {
  Group,
  Member,
  Expense,
  ExpenseShare,
  SettlementRecord,
} from '../types';
import {
  calculateMemberBalances,
  optimizeSettlements,
} from './calculation';

export type RetentionPeriod = '3d' | '15d' | '1m' | 'never';

export interface RetentionOption {
  value: RetentionPeriod;
  label: string;
  labelFr: string;
  durationMs: number;
}

export const RETENTION_PERIOD_OPTIONS: RetentionOption[] = [
  {
    value: '3d',
    label: '3 Days after settled',
    labelFr: '3 jours après règlement',
    durationMs: 3 * 24 * 60 * 60 * 1000,
  },
  {
    value: '15d',
    label: '15 Days after settled',
    labelFr: '15 jours après règlement',
    durationMs: 15 * 24 * 60 * 60 * 1000,
  },
  {
    value: '1m',
    label: '1 Month (30 Days) after settled',
    labelFr: '1 mois (30 jours) après règlement',
    durationMs: 30 * 24 * 60 * 60 * 1000,
  },
  {
    value: 'never',
    label: 'Never (Keep indefinitely)',
    labelFr: 'Jamais (Conserver indéfiniment)',
    durationMs: Infinity,
  },
];

export const DEFAULT_RETENTION_PERIOD: RetentionPeriod = '15d';

export function getRetentionDurationMs(
  period: RetentionPeriod | string | number | undefined
): number {
  if (typeof period === 'number' && period > 0) {
    return period * 24 * 60 * 60 * 1000;
  }
  switch (period) {
    case '3d':
    case '3days':
    case '3_days':
    case '3':
      return 3 * 24 * 60 * 60 * 1000;
    case '15d':
    case '15days':
    case '15_days':
    case '15':
      return 15 * 24 * 60 * 60 * 1000;
    case '1m':
    case '1month':
    case '1_month':
    case '30d':
    case '30days':
    case '30':
      return 30 * 24 * 60 * 60 * 1000;
    case 'never':
      return Infinity;
    default:
      return 15 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Evaluates whether a group with expenses has all balances settled (`optimizedDebts.length === 0`)
 * and returns the next `settled` boolean and `settledAt` ISO timestamp.
 */
export function computeGroupSettlementState(
  group: Group,
  groupMembers: Member[],
  groupExpenses: Expense[],
  groupShares: ExpenseShare[],
  groupSettlements: SettlementRecord[],
  nowISO = new Date().toISOString()
): { settled: boolean; settledAt?: string; retentionPeriod: RetentionPeriod } {
  const retentionPeriod: RetentionPeriod = group.retentionPeriod || DEFAULT_RETENTION_PERIOD;

  // A group is considered "settled" for retention purposes only once it has at least one expense
  // and all net balances among members are settled (0 pending transfers).
  if (groupExpenses.length === 0) {
    return {
      settled: false,
      settledAt: undefined,
      retentionPeriod,
    };
  }

  const balances = calculateMemberBalances(
    groupMembers,
    groupExpenses,
    groupShares,
    groupSettlements
  );
  const pendingTransfers = optimizeSettlements(balances, group.baseCurrency);
  const isFullySettled = pendingTransfers.length === 0;

  if (isFullySettled) {
    return {
      settled: true,
      settledAt: group.settled && group.settledAt ? group.settledAt : nowISO,
      retentionPeriod,
    };
  }

  return {
    settled: false,
    settledAt: undefined,
    retentionPeriod,
  };
}

export interface GroupCleanupCountdownInfo {
  isSettled: boolean;
  isCountdownActive: boolean;
  isExpired: boolean;
  retentionPeriod: RetentionPeriod;
  settledAtISO?: string;
  cleanupAtISO?: string;
  remainingMs: number;
  remainingDays: number;
  remainingHours: number;
  label: string;
  labelFr: string;
  shortBadge: string;
  shortBadgeFr: string;
}

/**
 * Checks whether a settled group's `settledAt` timestamp is older than its configured
 * retention period (3 days, 15 days, or 1 month).
 */
export function isSettledGroupExpired(
  group: Pick<Group, 'settled' | 'settledAt' | 'retentionPeriod'>,
  nowMs = Date.now()
): boolean {
  if (!group || !group.settled || !group.settledAt) {
    return false;
  }
  const durationMs = getRetentionDurationMs(group.retentionPeriod);
  if (!Number.isFinite(durationMs)) {
    return false;
  }
  const settledAtMs =
    typeof group.settledAt === 'number'
      ? group.settledAt
      : Date.parse(String(group.settledAt));
  if (Number.isNaN(settledAtMs)) {
    return false;
  }
  return nowMs - settledAtMs >= durationMs;
}

/**
 * Computes the cleanup countdown state for a group card on the Dashboard or Group Detail view.
 * Safely handles:
 * - Group not yet settled (`isSettled: false`, `isCountdownActive: false`)
 * - Group settled with `retentionPeriod: 'never'` (`isSettled: true`, `isCountdownActive: false`)
 * - Group settled with an active countdown (3 days, 15 days, or 1 month) where cleanup time has not yet been reached
 * - Group settled where cleanup date/time has been reached (`isExpired: true`)
 * - Missing or invalid `settledAt` timestamps without throwing or crashing
 */
export function getGroupCleanupCountdownInfo(
  group?: Partial<Pick<Group, 'settled' | 'settledAt' | 'retentionPeriod'>> | null,
  nowMs = Date.now()
): GroupCleanupCountdownInfo {
  const retentionPeriod: RetentionPeriod =
    group?.retentionPeriod &&
    (['3d', '15d', '1m', 'never'] as const).includes(group.retentionPeriod)
      ? group.retentionPeriod
      : DEFAULT_RETENTION_PERIOD;

  if (!group || !group.settled) {
    return {
      isSettled: false,
      isCountdownActive: false,
      isExpired: false,
      retentionPeriod,
      remainingMs: 0,
      remainingDays: 0,
      remainingHours: 0,
      label: '',
      labelFr: '',
      shortBadge: '',
      shortBadgeFr: '',
    };
  }

  const durationMs = getRetentionDurationMs(retentionPeriod);
  if (!Number.isFinite(durationMs) || !group.settledAt) {
    return {
      isSettled: true,
      isCountdownActive: false,
      isExpired: false,
      retentionPeriod,
      settledAtISO: typeof group.settledAt === 'string' ? group.settledAt : undefined,
      remainingMs: Infinity,
      remainingDays: 0,
      remainingHours: 0,
      label: 'Settled · Kept indefinitely',
      labelFr: 'Réglé · Conservé indéfiniment',
      shortBadge: 'Settled',
      shortBadgeFr: 'Réglé',
    };
  }

  const settledAtMs =
    typeof group.settledAt === 'number'
      ? group.settledAt
      : Date.parse(String(group.settledAt));

  if (Number.isNaN(settledAtMs)) {
    return {
      isSettled: true,
      isCountdownActive: false,
      isExpired: false,
      retentionPeriod,
      remainingMs: 0,
      remainingDays: 0,
      remainingHours: 0,
      label: 'Settled',
      labelFr: 'Réglé',
      shortBadge: 'Settled',
      shortBadgeFr: 'Réglé',
    };
  }

  const cleanupAtMs = settledAtMs + durationMs;
  const remainingMs = Math.max(0, cleanupAtMs - nowMs);
  const isExpired = nowMs >= cleanupAtMs;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;

  const remainingDays = Math.ceil(remainingMs / DAY_MS);
  const remainingHours = Math.max(1, Math.ceil(remainingMs / HOUR_MS));

  let label = '';
  let labelFr = '';
  let shortBadge = '';
  let shortBadgeFr = '';

  if (isExpired) {
    label = 'Settled · Scheduled for auto-cleanup';
    labelFr = 'Réglé · Nettoyage auto prévu';
    shortBadge = 'Auto-cleanup due';
    shortBadgeFr = 'Nettoyage dû';
  } else if (remainingMs < DAY_MS) {
    label = `Settled · Auto-deletes in ${remainingHours}h`;
    labelFr = `Réglé · Suppression auto dans ${remainingHours}h`;
    shortBadge = `Auto-delete in ${remainingHours}h`;
    shortBadgeFr = `Suppr. dans ${remainingHours}h`;
  } else {
    label = `Settled · Auto-deletes in ${remainingDays}d`;
    labelFr = `Réglé · Suppression auto dans ${remainingDays}j`;
    shortBadge = `Auto-delete in ${remainingDays}d`;
    shortBadgeFr = `Suppr. dans ${remainingDays}j`;
  }

  return {
    isSettled: true,
    isCountdownActive: true,
    isExpired,
    retentionPeriod,
    settledAtISO: new Date(settledAtMs).toISOString(),
    cleanupAtISO: new Date(cleanupAtMs).toISOString(),
    remainingMs,
    remainingDays,
    remainingHours,
    label,
    labelFr,
    shortBadge,
    shortBadgeFr,
  };
}
