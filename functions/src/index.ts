import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export type RetentionPeriod = '3d' | '15d' | '1m' | 'never';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves the configured retention window in milliseconds:
 * - 3 days ('3d' | '3days' | 3)
 * - 15 days ('15d' | '15days' | 15) [default]
 * - 1 month ('1m' | '1month' | '30d' | 30)
 */
export function resolveRetentionDurationMs(
  retentionPeriod?: RetentionPeriod | string | number | null
): number {
  if (typeof retentionPeriod === 'number' && retentionPeriod > 0) {
    return retentionPeriod * DAY_MS;
  }
  switch (retentionPeriod) {
    case '3d':
    case '3days':
    case '3_days':
    case '3':
      return 3 * DAY_MS;
    case '15d':
    case '15days':
    case '15_days':
    case '15':
      return 15 * DAY_MS;
    case '1m':
    case '1month':
    case '1_month':
    case '30d':
    case '30days':
    case '30':
      return 30 * DAY_MS;
    case 'never':
      return Infinity;
    default:
      return 15 * DAY_MS;
  }
}

/**
 * Parses `settledAt` from Firestore Timestamp, ISO string, or epoch milliseconds.
 */
export function parseSettledAtMs(settledAt: unknown): number | null {
  if (!settledAt) return null;
  if (typeof settledAt === 'number' && Number.isFinite(settledAt)) {
    return settledAt;
  }
  if (typeof settledAt === 'string') {
    const parsed = Date.parse(settledAt);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (
    typeof settledAt === 'object' &&
    settledAt !== null &&
    typeof (settledAt as { toMillis?: () => number }).toMillis === 'function'
  ) {
    return (settledAt as { toMillis: () => number }).toMillis();
  }
  return null;
}

/**
 * Determines whether a group document with `settled == true` has exceeded its configured
 * retention period (3 days, 15 days, or 1 month).
 */
export function isGroupPastRetentionPeriod(
  groupData: Record<string, any>,
  nowMs = Date.now()
): boolean {
  if (groupData.settled !== true) {
    return false;
  }
  const settledAtMs = parseSettledAtMs(groupData.settledAt);
  if (settledAtMs === null) {
    return false;
  }
  const retentionMs = resolveRetentionDurationMs(
    groupData.retentionPeriod ?? groupData.autoDeleteRetention ?? groupData.retentionDays
  );
  if (!Number.isFinite(retentionMs)) {
    return false;
  }
  return nowMs - settledAtMs >= retentionMs;
}

/**
 * Extracts a Firebase Storage object path from either an explicit `receiptStoragePath`
 * or a Firebase Storage download URL (`.../o/receipts%2F...`).
 */
export function extractReceiptStoragePath(expenseData: Record<string, any>): string | null {
  if (
    typeof expenseData.receiptStoragePath === 'string' &&
    expenseData.receiptStoragePath.trim().length > 0
  ) {
    return expenseData.receiptStoragePath.trim();
  }
  const receiptUrl = expenseData.receiptUrl;
  if (typeof receiptUrl === 'string' && receiptUrl.includes('/o/')) {
    try {
      const urlObj = new URL(receiptUrl);
      const match = urlObj.pathname.match(/\/o\/(.+)$/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    } catch {
      // Ignore malformed URL
    }
  }
  return null;
}

/**
 * Deletes a list of Firestore DocumentReferences in chunks of up to 400 operations per batch.
 */
async function deleteRefsInBatches(
  db: admin.firestore.Firestore,
  refs: admin.firestore.DocumentReference[]
): Promise<number> {
  if (refs.length === 0) return 0;
  const uniqueMap = new Map<string, admin.firestore.DocumentReference>();
  for (const ref of refs) {
    uniqueMap.set(ref.path, ref);
  }
  const uniqueRefs = Array.from(uniqueMap.values());
  const CHUNK_SIZE = 400;
  let deletedCount = 0;

  for (let i = 0; i < uniqueRefs.length; i += CHUNK_SIZE) {
    const chunk = uniqueRefs.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    for (const ref of chunk) {
      batch.delete(ref);
    }
    await batch.commit();
    deletedCount += chunk.length;
  }

  return deletedCount;
}

/**
 * Recursively deletes any nested subcollections attached to a document reference.
 */
async function deleteDocumentSubcollections(
  db: admin.firestore.Firestore,
  docRef: admin.firestore.DocumentReference
): Promise<number> {
  let deletedSubDocs = 0;
  const subcollections = await docRef.listCollections();
  for (const subcol of subcollections) {
    const snap = await subcol.get();
    if (!snap.empty) {
      for (const childDoc of snap.docs) {
        deletedSubDocs += await deleteDocumentSubcollections(db, childDoc.ref);
      }
      deletedSubDocs += await deleteRefsInBatches(
        db,
        snap.docs.map(d => d.ref)
      );
    }
  }
  return deletedSubDocs;
}

/**
 * Executes a complete cleanup for a single expired settled group:
 * 1. Queries and deletes associated top-level documents (`expenses`, `expenseShares`, `settlements`, `groupMembers`, `inviteCodes`)
 *    and group-scoped temporary `members`.
 * 2. Deletes any nested subcollections under `/groups/{groupId}` and its child documents.
 * 3. Deletes all stored receipt files in Firebase Storage (`receipts/{groupId}/**` as well as any individual receipt paths).
 * 4. Deletes the `/groups/{groupId}` document itself.
 */
export async function executeExpiredGroupCleanup(
  db: admin.firestore.Firestore,
  bucket: ReturnType<admin.storage.Storage['bucket']>,
  groupDoc: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot
): Promise<{
  groupId: string;
  deletedFirestoreDocs: number;
  deletedSubcollectionDocs: number;
  deletedReceipts: number;
}> {
  const groupData = groupDoc.data() || {};
  const groupId: string = groupData.id || groupDoc.id;
  const refsToDelete: admin.firestore.DocumentReference[] = [];
  const receiptPaths = new Set<string>();
  let deletedSubcollectionDocs = 0;

  // 1. Collect expenses for this group and any receipt storage paths
  const expensesSnap = await db
    .collection('expenses')
    .where('groupId', '==', groupId)
    .get();
  const expenseIds: string[] = [];
  for (const expDoc of expensesSnap.docs) {
    expenseIds.push(expDoc.id);
    refsToDelete.push(expDoc.ref);
    const extractedPath = extractReceiptStoragePath(expDoc.data());
    if (extractedPath) {
      receiptPaths.add(extractedPath);
    }
    deletedSubcollectionDocs += await deleteDocumentSubcollections(db, expDoc.ref);
  }

  // 2. Collect expenseShares by groupId AND by expenseId chunks (for any shares without groupId)
  const sharesByGroupSnap = await db
    .collection('expenseShares')
    .where('groupId', '==', groupId)
    .get();
  for (const shDoc of sharesByGroupSnap.docs) {
    refsToDelete.push(shDoc.ref);
  }

  for (let i = 0; i < expenseIds.length; i += 30) {
    const chunkIds = expenseIds.slice(i, i + 30);
    if (chunkIds.length > 0) {
      const sharesByExpSnap = await db
        .collection('expenseShares')
        .where('expenseId', 'in', chunkIds)
        .get();
      for (const shDoc of sharesByExpSnap.docs) {
        refsToDelete.push(shDoc.ref);
      }
    }
  }

  // 3. Collect settlements for this group
  const settlementsSnap = await db
    .collection('settlements')
    .where('groupId', '==', groupId)
    .get();
  for (const stDoc of settlementsSnap.docs) {
    refsToDelete.push(stDoc.ref);
  }

  // 4. Collect groupMembers mappings for this group
  const groupMembersSnap = await db
    .collection('groupMembers')
    .where('groupId', '==', groupId)
    .get();
  for (const gmDoc of groupMembersSnap.docs) {
    refsToDelete.push(gmDoc.ref);
  }

  // 5. Collect inviteCodes associated with this group
  if (typeof groupData.inviteCode === 'string' && groupData.inviteCode.trim().length > 0) {
    refsToDelete.push(db.collection('inviteCodes').doc(groupData.inviteCode.trim()));
  }
  const inviteCodesSnap = await db
    .collection('inviteCodes')
    .where('groupId', '==', groupId)
    .get();
  for (const icDoc of inviteCodesSnap.docs) {
    refsToDelete.push(icDoc.ref);
  }

  // 6. Collect temporary/guest member profiles scoped exclusively to this group
  const tempMembersSnap = await db
    .collection('members')
    .where('groupId', '==', groupId)
    .get();
  for (const mDoc of tempMembersSnap.docs) {
    const mData = mDoc.data();
    if (mData.isTemporary || !mData.username) {
      refsToDelete.push(mDoc.ref);
    }
  }

  // 7. Recursively delete any subcollections under /groups/{groupId}
  deletedSubcollectionDocs += await deleteDocumentSubcollections(db, groupDoc.ref);

  // 8. Delete stored receipts in Firebase Storage (prefix `receipts/{groupId}/` + explicit paths)
  let deletedReceipts = 0;
  const cleanGroupId = groupId.replace(/[^a-zA-Z0-9_.\-]/g, '_');
  const storagePrefix = `receipts/${cleanGroupId}/`;

  try {
    const [prefixFiles] = await bucket.getFiles({ prefix: storagePrefix });
    for (const file of prefixFiles) {
      receiptPaths.add(file.name);
    }
  } catch (err) {
    logger.warn(`Notice listing storage prefix ${storagePrefix}:`, err);
  }

  for (const storagePath of receiptPaths) {
    try {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });
      deletedReceipts++;
    } catch (err) {
      logger.warn(`Failed to delete receipt at ${storagePath}:`, err);
    }
  }

  // 9. Delete all associated documents first, then the parent group document
  const deletedAssociated = await deleteRefsInBatches(db, refsToDelete);
  await groupDoc.ref.delete();

  return {
    groupId,
    deletedFirestoreDocs: deletedAssociated + 1,
    deletedSubcollectionDocs,
    deletedReceipts,
  };
}

/**
 * Scheduled Firebase Cloud Function (`cleanupSettledGroups`):
 * Runs periodically (every 6 hours) to query all groups where `settled == true` and
 * `settledAt` is older than the group's configured retention period (3 days, 15 days, or 1 month),
 * then deletes all associated documents, subcollections, and stored receipts.
 */
export const cleanupSettledGroups = onSchedule(
  {
    schedule: 'every 6 hours',
    timeZone: 'UTC',
    retryCount: 2,
  },
  async () => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const nowMs = Date.now();

    logger.info('Starting scheduled settled-groups retention cleanup...', {
      timestamp: new Date(nowMs).toISOString(),
    });

    const settledGroupsSnap = await db
      .collection('groups')
      .where('settled', '==', true)
      .get();

    if (settledGroupsSnap.empty) {
      logger.info('No settled groups found requiring retention evaluation.');
      return;
    }

    let expiredGroupCount = 0;
    let totalDocsDeleted = 0;
    let totalSubdocsDeleted = 0;
    let totalReceiptsDeleted = 0;

    for (const groupDoc of settledGroupsSnap.docs) {
      const groupData = groupDoc.data();
      if (!isGroupPastRetentionPeriod(groupData, nowMs)) {
        continue;
      }

      try {
        const result = await executeExpiredGroupCleanup(db, bucket, groupDoc);
        expiredGroupCount++;
        totalDocsDeleted += result.deletedFirestoreDocs;
        totalSubdocsDeleted += result.deletedSubcollectionDocs;
        totalReceiptsDeleted += result.deletedReceipts;

        logger.info(`Cleaned up expired settled group ${result.groupId}`, result);
      } catch (err) {
        logger.error(`Failed to clean up settled group ${groupDoc.id}:`, err);
      }
    }

    logger.info('Completed settled-groups retention cleanup.', {
      evaluatedGroups: settledGroupsSnap.size,
      expiredGroupCount,
      totalDocsDeleted,
      totalSubdocsDeleted,
      totalReceiptsDeleted,
    });
  }
);
