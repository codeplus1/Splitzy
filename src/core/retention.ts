import { Group, RetentionOption } from '../types';

export const RETENTION_OPTIONS: {
  value: RetentionOption;
  labelEn: string;
  labelFr: string;
  durationMs: number;
  days: number;
}[] = [
  {
    value: '3_days',
    labelEn: '3 days',
    labelFr: '3 jours',
    durationMs: 3 * 24 * 60 * 60 * 1000,
    days: 3,
  },
  {
    value: '15_days',
    labelEn: '15 days',
    labelFr: '15 jours',
    durationMs: 15 * 24 * 60 * 60 * 1000,
    days: 15,
  },
  {
    value: '1_month',
    labelEn: '1 month',
    labelFr: '1 mois',
    durationMs: 30 * 24 * 60 * 60 * 1000,
    days: 30,
  },
];

export const DEFAULT_RETENTION_OPTION: RetentionOption = '15_days';

export function getRetentionDurationMs(option?: RetentionOption): number {
  const found = RETENTION_OPTIONS.find(o => o.value === option);
  return found ? found.durationMs : 15 * 24 * 60 * 60 * 1000;
}

export function getRetentionLabel(option?: RetentionOption, isFrench = false): string {
  const found = RETENTION_OPTIONS.find(o => o.value === (option || DEFAULT_RETENTION_OPTION));
  if (!found) return isFrench ? '15 jours' : '15 days';
  return isFrench ? found.labelFr : found.labelEn;
}

export function getRetentionOptionMeta(option?: RetentionOption) {
  return (
    RETENTION_OPTIONS.find(o => o.value === (option || DEFAULT_RETENTION_OPTION)) ||
    RETENTION_OPTIONS[1]
  );
}

/**
 * Computes the exact scheduled deletion timestamp in epoch milliseconds.
 * Example: If settled on Jan 10 and 15 days is selected, returns Jan 25.
 */
export function computeScheduledDeletionTime(
  settledAtMs: number,
  retentionOption: RetentionOption = DEFAULT_RETENTION_OPTION
): number {
  return settledAtMs + getRetentionDurationMs(retentionOption);
}

export const computeExpirationTimestamp = computeScheduledDeletionTime;

/**
 * Transitions a group into the settled state with `settled == true`, `settledAt`,
 * and `scheduledDeleteAt` computed from the selected retention period.
 */
export function buildSettledGroupState(
  group: Group,
  settledAtMs: number = Date.now(),
  retentionOption?: RetentionOption
): Group {
  const effectiveRetention = retentionOption || group.retentionOption || DEFAULT_RETENTION_OPTION;
  const keepGroup = Boolean(group.keepGroup);
  return {
    ...group,
    settled: true,
    settledAt: settledAtMs,
    retentionOption: effectiveRetention,
    keepGroup,
    scheduledDeleteAt: keepGroup
      ? null
      : computeScheduledDeletionTime(settledAtMs, effectiveRetention),
  };
}

/**
 * Cancels pending deletion and returns a settled group back to the active state
 * when a new expense or unsettled balance is added before expiration.
 */
export function buildActiveGroupState(group: Group): Group {
  return {
    ...group,
    settled: false,
    settledAt: null,
    scheduledDeleteAt: null,
    keepGroup: false,
  };
}

export function buildKeepGroupState(group: Group): Group {
  return setGroupKeepRetention(group, true);
}

export function evaluateGroupSettlementTransition(
  group: Group,
  hasUnsettledBalances: boolean,
  nowMs: number = Date.now()
): Group | null {
  if (!hasUnsettledBalances && !group.settled) {
    return buildSettledGroupState(
      group,
      nowMs,
      group.retentionOption || DEFAULT_RETENTION_OPTION
    );
  }
  if (hasUnsettledBalances && group.settled) {
    return buildActiveGroupState(group);
  }
  return null;
}

/**
 * Explicitly marks a settled group as retained ("Keep Group") so automatic cleanup will not delete it,
 * or re-enables the retention countdown.
 */
export function setGroupKeepRetention(
  group: Group,
  keep: boolean,
  nowMs: number = Date.now()
): Group {
  const effectiveRetention = group.retentionOption || DEFAULT_RETENTION_OPTION;
  const baseSettledAt = group.settledAt || nowMs;
  return {
    ...group,
    keepGroup: keep,
    retentionOption: effectiveRetention,
    scheduledDeleteAt:
      !keep && group.settled
        ? computeScheduledDeletionTime(baseSettledAt, effectiveRetention)
        : null,
  };
}

/**
 * Strictly determines whether a group is eligible for automatic post-settlement deletion.
 *
 * A group is NEVER deleted simply because it has been inactive.
 * It is ONLY eligible when ALL of the following hold:
 * 1. `group.settled === true`
 * 2. `typeof group.settledAt === 'number' && group.settledAt > 0`
 * 3. `group.keepGroup !== true`
 * 4. The configured retention period (`3_days`, `15_days`, or `1_month`) has expired (`nowMs >= expirationMs`)
 */
export function isGroupExpiredForCleanup(
  group: Partial<Group> | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!group) return false;
  if (group.settled !== true) return false;
  if (group.keepGroup === true) return false;
  if (typeof group.settledAt !== 'number' || !Number.isFinite(group.settledAt) || group.settledAt <= 0) {
    return false;
  }

  const retentionOption: RetentionOption =
    group.retentionOption === '3_days' ||
    group.retentionOption === '15_days' ||
    group.retentionOption === '1_month'
      ? group.retentionOption
      : DEFAULT_RETENTION_OPTION;

  const expirationTime = computeScheduledDeletionTime(group.settledAt, retentionOption);

  return nowMs >= expirationTime;
}

export const isGroupCleanupExpired = isGroupExpiredForCleanup;

/**
 * Returns human-readable remaining days and formatted scheduled deletion date.
 */
export function getGroupCleanupCountdownInfo(
  group: Group,
  nowMs: number = Date.now()
): {
  isSettled: boolean;
  isKept: boolean;
  isExpired: boolean;
  retentionOption: RetentionOption;
  retentionLabel: string;
  scheduledDeleteAt: number | null;
  scheduledDateFormatted: string | null;
  daysRemaining: number | null;
  remainingDays: number | null;
} {
  const retentionOption = group.retentionOption || DEFAULT_RETENTION_OPTION;
  const retentionLabel = getRetentionLabel(retentionOption);

  if (!group.settled || !group.settledAt) {
    return {
      isSettled: false,
      isKept: Boolean(group.keepGroup),
      isExpired: false,
      retentionOption,
      retentionLabel,
      scheduledDeleteAt: null,
      scheduledDateFormatted: null,
      daysRemaining: null,
      remainingDays: null,
    };
  }

  if (group.keepGroup) {
    return {
      isSettled: true,
      isKept: true,
      isExpired: false,
      retentionOption,
      retentionLabel,
      scheduledDeleteAt: null,
      scheduledDateFormatted: null,
      daysRemaining: null,
      remainingDays: null,
    };
  }

  const scheduledDeleteAt =
    typeof group.scheduledDeleteAt === 'number' && group.scheduledDeleteAt > group.settledAt
      ? group.scheduledDeleteAt
      : computeScheduledDeletionTime(group.settledAt, retentionOption);

  const msRemaining = scheduledDeleteAt - nowMs;
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  const scheduledDateFormatted = new Date(scheduledDeleteAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return {
    isSettled: true,
    isKept: false,
    isExpired: msRemaining <= 0,
    retentionOption,
    retentionLabel,
    scheduledDeleteAt,
    scheduledDateFormatted,
    daysRemaining,
    remainingDays: daysRemaining,
  };
}
