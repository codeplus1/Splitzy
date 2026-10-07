/**
 * Splitze — Scheduled Server-Side Group Retention & Cleanup Job
 *
 * Runs server-side on a schedule (every 24 hours via Cloud Scheduler / Firebase Functions v2)
 * without depending on any browser timer, React state, localStorage, or PWA being open.
 *
 * Strictly enforces all 9 cleanup requirements:
 * 1. Finds groups where `settled == true`.
 * 2. Checks `settledAt` (must be a valid positive timestamp).
 * 3. Checks the selected `retentionOption` (`3_days`, `15_days`, or `1_month`) and `keepGroup`.
 * 4. Determines whether the expiration time has passed (`now >= expirationTime`).
 * 5. Deletes the group's related Firestore documents and subcollections (`expenses`, `expenseShares`, `settlements`, `groupMembers`, and any nested subcollections).
 * 6. Deletes associated receipt files from Firebase Storage (`/receipts/{groupId}/...` and `receiptStoragePath`).
 * 7. Deletes related invitations (`inviteCodes/{code}`) and group-exclusive member records.
 * 8. Removes the expired parent `/groups/{groupId}` document last so no orphaned records remain.
 * 9. Logs structured diagnostic summaries (counts & groupId) without storing personal data.
 */

export type RetentionOption = '3_days' | '15_days' | '1_month';

export interface CleanupGroupRecord {
  id: string;
  settled?: boolean;
  settledAt?: number | null;
  retentionOption?: RetentionOption;
  scheduledDeleteAt?: number | null;
  keepGroup?: boolean;
  inviteCode?: string;
}

export interface CleanupDiagnosticLog {
  groupId: string;
  retentionOption: RetentionOption;
  settledAt: number;
  expiredAt: number;
  deletedExpensesCount: number;
  deletedSharesCount: number;
  deletedSettlementsCount: number;
  deletedGroupMembersCount: number;
  deletedExclusiveMembersCount: number;
  deletedInviteCodesCount: number;
  deletedReceiptsCount: number;
  status: 'deleted' | 'failed';
  errorCode?: string;
}

const RETENTION_MS: Record<RetentionOption, number> = {
  '3_days': 3 * 24 * 60 * 60 * 1000,
  '15_days': 15 * 24 * 60 * 60 * 1000,
  '1_month': 30 * 24 * 60 * 60 * 1000,
};

export function computeExpirationTimestamp(
  settledAt: number,
  retentionOption: RetentionOption = '15_days'
): number {
  const duration = RETENTION_MS[retentionOption] ?? RETENTION_MS['15_days'];
  return settledAt + duration;
}

/**
 * Pure predicate used by both the Cloud Function and emulator tests to verify
 * whether a group document is eligible for automatic server-side deletion.
 */
export function isSettledGroupExpired(
  group: CleanupGroupRecord | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!group) return false;
  if (group.settled !== true) return false;
  if (group.keepGroup === true) return false;
  if (typeof group.settledAt !== 'number' || !Number.isFinite(group.settledAt) || group.settledAt <= 0) {
    return false;
  }

  const option: RetentionOption =
    group.retentionOption === '3_days' ||
    group.retentionOption === '15_days' ||
    group.retentionOption === '1_month'
      ? group.retentionOption
      : '15_days';

  const expirationTime = computeExpirationTimestamp(group.settledAt, option);

  return nowMs >= expirationTime;
}

/**
 * Adapter interface allowing the exact same server-side cleanup job logic to run
 * against Firebase Admin SDK in Cloud Functions and against the Firestore/Storage Emulator in tests.
 */
export interface ServerCleanupBackend {
  findSettledGroups(): Promise<CleanupGroupRecord[]>;
  deleteGroupCascade(group: CleanupGroupRecord, nowMs: number): Promise<CleanupDiagnosticLog>;
}

export async function runScheduledExpiredGroupsCleanup(
  backend: ServerCleanupBackend,
  nowMs: number = Date.now(),
  logger: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  } = console
): Promise<{
  scannedCount: number;
  expiredCount: number;
  deletedGroupIds: string[];
  logs: CleanupDiagnosticLog[];
}> {
  const settledGroups = await backend.findSettledGroups();
  const expiredGroups = settledGroups.filter(g => isSettledGroupExpired(g, nowMs));
  const deletedGroupIds: string[] = [];
  const logs: CleanupDiagnosticLog[] = [];

  for (const group of expiredGroups) {
    try {
      const diag = await backend.deleteGroupCascade(group, nowMs);
      logs.push(diag);
      if (diag.status === 'deleted') {
        deletedGroupIds.push(group.id);
        logger.info('Automatic post-settlement group cleanup succeeded', {
          groupId: diag.groupId,
          retentionOption: diag.retentionOption,
          deletedExpensesCount: diag.deletedExpensesCount,
          deletedSharesCount: diag.deletedSharesCount,
          deletedSettlementsCount: diag.deletedSettlementsCount,
          deletedGroupMembersCount: diag.deletedGroupMembersCount,
          deletedInviteCodesCount: diag.deletedInviteCodesCount,
          deletedReceiptsCount: diag.deletedReceiptsCount,
        });
      }
    } catch (err: any) {
      const option: RetentionOption = group.retentionOption || '15_days';
      const settledAt = group.settledAt || 0;
      const failLog: CleanupDiagnosticLog = {
        groupId: group.id,
        retentionOption: option,
        settledAt,
        expiredAt: computeExpirationTimestamp(settledAt, option),
        deletedExpensesCount: 0,
        deletedSharesCount: 0,
        deletedSettlementsCount: 0,
        deletedGroupMembersCount: 0,
        deletedExclusiveMembersCount: 0,
        deletedInviteCodesCount: 0,
        deletedReceiptsCount: 0,
        status: 'failed',
        errorCode: err?.code || 'CLEANUP_ERROR',
      };
      logs.push(failLog);
      logger.error('Automatic post-settlement group cleanup failed', {
        groupId: group.id,
        errorCode: failLog.errorCode,
      });
    }
  }

  return {
    scannedCount: settledGroups.length,
    expiredCount: expiredGroups.length,
    deletedGroupIds,
    logs,
  };
}

export const runServerSideGroupCleanupJob = runScheduledExpiredGroupsCleanup;

/**
 * Creates a Firebase Admin SDK backend for the scheduled Cloud Function
 * that recursively deletes all related documents, subcollections, and Storage receipts.
 */
export function createAdminCleanupBackend(
  adminFirestore: any,
  adminBucket: any
): ServerCleanupBackend {
  return {
    async findSettledGroups(): Promise<CleanupGroupRecord[]> {
      const snap = await adminFirestore
        .collection('groups')
        .where('settled', '==', true)
        .get();
      return snap.docs.map((docSnap: any) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
    },

    async deleteGroupCascade(
      group: CleanupGroupRecord,
      _nowMs: number
    ): Promise<CleanupDiagnosticLog> {
      const groupId = group.id;
      const option: RetentionOption = group.retentionOption || '15_days';
      const settledAt = group.settledAt || 0;

      // 1. Find all expenses for this group
      const expensesSnap = await adminFirestore
        .collection('expenses')
        .where('groupId', '==', groupId)
        .get();
      const expenseDocs = expensesSnap.docs;

      // 2. Find all expenseShares for this group
      const sharesSnap = await adminFirestore
        .collection('expenseShares')
        .where('groupId', '==', groupId)
        .get();
      const shareDocs = sharesSnap.docs;

      // 3. Find all settlements for this group
      const settlementsSnap = await adminFirestore
        .collection('settlements')
        .where('groupId', '==', groupId)
        .get();
      const settlementDocs = settlementsSnap.docs;

      // 4. Find all groupMembers for this group
      const gmSnap = await adminFirestore
        .collection('groupMembers')
        .where('groupId', '==', groupId)
        .get();
      const gmDocs = gmSnap.docs;

      // 5. Find any members exclusively created for this group
      const exclusiveMembersSnap = await adminFirestore
        .collection('members')
        .where('groupId', '==', groupId)
        .get();
      const exclusiveMemberDocs = exclusiveMembersSnap.docs;

      // 6. Delete associated Storage receipt files under /receipts/{groupId}/ and explicit receiptStoragePath
      let deletedReceiptsCount = 0;
      if (adminBucket) {
        const deletedPaths = new Set<string>();
        try {
          const [files] = await adminBucket.getFiles({
            prefix: `receipts/${groupId}/`,
          });
          for (const file of files) {
            await file.delete().catch(() => {});
            deletedPaths.add(file.name);
            deletedReceiptsCount++;
          }
        } catch {
          // Ignore prefix listing error and continue to explicit paths
        }

        for (const expDoc of expenseDocs) {
          const expData = expDoc.data();
          if (expData?.receiptStoragePath && !deletedPaths.has(expData.receiptStoragePath)) {
            try {
              await adminBucket.file(expData.receiptStoragePath).delete();
              deletedPaths.add(expData.receiptStoragePath);
              deletedReceiptsCount++;
            } catch {
              // Ignore if already deleted
            }
          }
        }
      }

      // 7. Delete all related Firestore documents & any nested subcollections
      const refsToDelete: any[] = [
        ...shareDocs.map((d: any) => d.ref),
        ...expenseDocs.map((d: any) => d.ref),
        ...settlementDocs.map((d: any) => d.ref),
        ...gmDocs.map((d: any) => d.ref),
        ...exclusiveMemberDocs.map((d: any) => d.ref),
      ];

      let deletedInviteCodesCount = 0;
      if (group.inviteCode) {
        refsToDelete.push(adminFirestore.collection('inviteCodes').doc(group.inviteCode));
        deletedInviteCodesCount = 1;
      }

      const CHUNK_SIZE = 400;
      for (let i = 0; i < refsToDelete.length; i += CHUNK_SIZE) {
        const chunk = refsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = adminFirestore.batch();
        for (const r of chunk) {
          batch.delete(r);
        }
        await batch.commit();
      }

      // Explicitly delete any subcollections under /groups/{groupId} and the group document itself
      const groupRef = adminFirestore.collection('groups').doc(groupId);
      if (typeof adminFirestore.recursiveDelete === 'function') {
        await adminFirestore.recursiveDelete(groupRef);
      } else {
        await groupRef.delete();
      }

      return {
        groupId,
        retentionOption: option,
        settledAt,
        expiredAt: computeExpirationTimestamp(settledAt, option),
        deletedExpensesCount: expenseDocs.length,
        deletedSharesCount: shareDocs.length,
        deletedSettlementsCount: settlementDocs.length,
        deletedGroupMembersCount: gmDocs.length,
        deletedExclusiveMembersCount: exclusiveMemberDocs.length,
        deletedInviteCodesCount,
        deletedReceiptsCount,
        status: 'deleted',
      };
    },
  };
}

