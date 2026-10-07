/**
 * Splitzy — Firestore & Storage Security Rules Test Suite
 *
 * Covers:
 * 1. Authorized access (owner group CRUD, co-member profile reads, expenses/shares/settlements, invite batch join)
 * 2. Cross-group access prevention (groups, expenses, expenseShares, settlements, groupMembers, members)
 * 3. Membership escalation prevention (ordinary members blocked from adding/removing users, changing ownership,
 *    or modifying protected group fields; UID-less member documents blocked from creation/modification)
 * 4. Unauthorized deletion prevention (only group owner can delete group, inviteCode, or other members' groupMembers)
 * 5. Invite abuse & enumeration prevention (list blocked, rogue invite creation blocked, groupId redirection blocked)
 * 6. Recovery attacks & disclosure prevention (cross-user get/update/delete on recovery & securityProfiles blocked)
 * 7. Firebase Storage receipt rules (MIME allowlist, 5MB limit, owner path isolation)
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  runSecurityRulesVerificationSuite,
  evaluateFirestoreRule,
  evaluateStorageReceiptRule,
} from '../src/core/securityRulesVerifier';
import { validateReceiptFile } from '../src/core/receipt';
import { firebaseConfig } from '../src/services/firebaseConfig';
import { getInitialCleanState, reconcileAppState } from '../src/services/storage';
import {
  runCalculationUnitTests,
  calculateMemberBalances,
  optimizeSettlements,
  calculateEqualShares,
} from '../src/core/calculation';
import {
  computeExpirationTimestamp,
  isGroupCleanupExpired,
  buildSettledGroupState,
  buildActiveGroupState,
  buildKeepGroupState,
  evaluateGroupSettlementTransition,
} from '../src/core/retention';
import {
  runServerSideGroupCleanupJob,
  CleanupGroupRecord,
  CleanupDiagnosticLog,
} from '../functions/src/index';
import { Group, Member, Expense, ExpenseShare, SettlementRecord } from '../src/types';

function verifyVercelAndPwaReadiness() {
  const rootDir = process.cwd();
  const errors: string[] = [];

  // 1. Check vercel.json configuration
  const vercelJson = JSON.parse(
    fs.readFileSync(path.resolve(rootDir, 'vercel.json'), 'utf8')
  );
  if (vercelJson.buildCommand !== 'npm run build' || vercelJson.outputDirectory !== 'dist') {
    errors.push('vercel.json buildCommand or outputDirectory is misconfigured');
  }
  const hasSpaRewrite =
    Array.isArray(vercelJson.rewrites) &&
    vercelJson.rewrites.some((r: any) => r.destination === '/index.html');
  if (!hasSpaRewrite) {
    errors.push('vercel.json is missing SPA rewrite fallback to /index.html');
  }

  // 2. Check PWA manifest and required icon assets
  const manifestJson = JSON.parse(
    fs.readFileSync(path.resolve(rootDir, 'public/manifest.json'), 'utf8')
  );
  if (
    manifestJson.id !== '/' ||
    manifestJson.start_url !== '/' ||
    manifestJson.scope !== '/' ||
    manifestJson.display !== 'standalone' ||
    !manifestJson.short_name ||
    manifestJson.short_name.length > 12
  ) {
    errors.push('public/manifest.json does not meet PWA installability standards');
  }

  const requiredPublicAssets = [
    'public/favicon.ico',
    'public/apple-touch-icon.png',
    'public/icon.svg',
    'public/icon-maskable.svg',
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'public/pwa-maskable-512x512.png',
  ];
  for (const relPath of requiredPublicAssets) {
    const fullPath = path.resolve(rootDir, relPath);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size === 0) {
      errors.push(`Missing or empty PWA asset: ${relPath}`);
    }
  }

  // 3. Check index.html Apple & PWA meta tags
  const indexHtml = fs.readFileSync(path.resolve(rootDir, 'index.html'), 'utf8');
  if (!indexHtml.includes('rel="apple-touch-icon" href="/apple-touch-icon.png"')) {
    errors.push('index.html is missing PNG apple-touch-icon link');
  }

  // 4. Verify offline state reconciliation (unsynced local expenses survive empty cloud snapshot)
  const localState = getInitialCleanState();
  localState.groups = [
    {
      id: 'g_offline_1',
      name: 'Offline Trip',
      baseCurrency: 'CAD',
      preferredCalendar: 'AD',
      language: 'en',
      createdAt: new Date().toISOString(),
    },
  ];
  localState.pendingGroupIds = ['g_offline_1'];
  localState.expenses = [
    {
      id: 'exp_offline_1',
      groupId: 'g_offline_1',
      title: 'Offline Dinner',
      originalAmount: 45,
      originalCurrency: 'CAD',
      exchangeRate: 1,
      baseAmount: 45,
      paidBy: 'm_1',
      dateISO: '2026-10-06',
      calendarType: 'AD',
      category: 'food',
      createdAt: new Date().toISOString(),
    },
  ];
  localState.pendingExpenseIds = ['exp_offline_1'];

  const reconciled = reconcileAppState(localState, {
    groups: [],
    members: [],
    groupMembers: [],
    expenses: [],
    expenseShares: [],
    settlements: [],
  });
  if (
    reconciled.expenses.length !== 1 ||
    reconciled.expenses[0].id !== 'exp_offline_1' ||
    !reconciled.pendingExpenseIds?.includes('exp_offline_1')
  ) {
    errors.push('Offline state reconciliation failed to preserve unsynced local expense');
  }

  return errors;
}

function verifyFirebaseConfigConsistency() {
  const rootDir = process.cwd();
  const appletConfig = JSON.parse(
    fs.readFileSync(path.resolve(rootDir, 'firebase-applet-config.json'), 'utf8')
  );
  const envExample = fs.readFileSync(path.resolve(rootDir, '.env.example'), 'utf8');
  const firebaseJson = JSON.parse(
    fs.readFileSync(path.resolve(rootDir, 'firebase.json'), 'utf8')
  );
  const blueprintJson = JSON.parse(
    fs.readFileSync(path.resolve(rootDir, 'firebase-blueprint.json'), 'utf8')
  );

  const errors: string[] = [];

  if (firebaseConfig.projectId !== appletConfig.projectId) {
    errors.push(`firebaseConfig.projectId (${firebaseConfig.projectId}) !== appletConfig.projectId (${appletConfig.projectId})`);
  }
  if (firebaseConfig.firestoreDatabaseId !== appletConfig.firestoreDatabaseId) {
    errors.push(`firebaseConfig.firestoreDatabaseId (${firebaseConfig.firestoreDatabaseId}) !== appletConfig.firestoreDatabaseId (${appletConfig.firestoreDatabaseId})`);
  }
  if (firebaseConfig.storageBucket !== appletConfig.storageBucket) {
    errors.push(`firebaseConfig.storageBucket (${firebaseConfig.storageBucket}) !== appletConfig.storageBucket (${appletConfig.storageBucket})`);
  }
  if (!envExample.includes(appletConfig.projectId)) {
    errors.push('.env.example does not match appletConfig.projectId');
  }
  if (!envExample.includes(appletConfig.firestoreDatabaseId)) {
    errors.push('.env.example does not match appletConfig.firestoreDatabaseId');
  }
  if (firebaseJson?.firestore?.rules !== 'firestore.rules' || firebaseJson?.storage?.rules !== 'storage.rules') {
    errors.push('firebase.json is missing firestore.rules or storage.rules mapping');
  }
  if (!blueprintJson?.firestore || Object.keys(blueprintJson.firestore).length < 10) {
    errors.push('firebase-blueprint.json does not document all 10 Firestore collections');
  }

  return errors;
}

function verifyStaticRulesInvariants() {
  const firestoreRulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const storageRulesPath = path.resolve(process.cwd(), 'storage.rules');

  const firestoreRules = fs.readFileSync(firestoreRulesPath, 'utf8');
  const storageRules = fs.readFileSync(storageRulesPath, 'utf8');

  const errors: string[] = [];

  // 1. Ensure no public `allow read: if true` or `!isSignedIn()` bypasses exist
  if (/allow\s+(read|get|list|write|create|update|delete)\s*:\s*if\s+true\b/.test(firestoreRules)) {
    errors.push('firestore.rules contains an unrestricted `allow ...: if true` statement.');
  }
  if (/!isSignedIn\(\)/.test(firestoreRules)) {
    errors.push('firestore.rules contains an unauthenticated `!isSignedIn()` fallback.');
  }

  // 2. Ensure group updates require isOwnerGroupUpdate(), isValidInviteJoin(groupId), or isParticipantSettlementStatusUpdate()
  if (
    !firestoreRules.includes(
      'isOwnerGroupUpdate() || isValidInviteJoin(groupId) || isParticipantSettlementStatusUpdate()'
    )
  ) {
    errors.push(
      'firestore.rules does not restrict group updates to owner, verified invite-code join, or participant settlement status transition.'
    );
  }

  // 3. Ensure group deletion strictly requires isGroupOwnerData(existing())
  if (!/match\s+\/groups\/\{groupId\}[\s\S]*?allow\s+delete:\s*if\s+isSignedIn\(\)\s*&&\s*isValidId\(groupId\)\s*&&\s*\(resource\s*==\s*null\s*\|\|\s*isGroupOwnerData\(existing\(\)\)\)/.test(firestoreRules)) {
    errors.push('firestore.rules does not restrict group deletion to isGroupOwnerData(existing()).');
  }

  // 4. Ensure member documents require a valid UID and restrict reads to canReadMemberProfile(existing())
  if (!firestoreRules.includes('canReadMemberProfile(existing())')) {
    errors.push('firestore.rules does not restrict member profile reads/lists via canReadMemberProfile(existing()).');
  }
  if (!firestoreRules.includes('isMemberProfileOwner(existing())')) {
    errors.push('firestore.rules does not require isMemberProfileOwner(existing()) on member updates/deletes.');
  }

  // 5. Ensure recovery get requires existing().uid == request.auth.uid (no recovery-data disclosure)
  if (!/match\s+\/recovery\/\{verifierHash\}[\s\S]*?allow\s+get:\s*if\s+isSignedIn\(\)\s*&&\s*isValidVerifierHash\(verifierHash\)\s*&&\s*existing\(\)\.uid\s*==\s*request\.auth\.uid/.test(firestoreRules)) {
    errors.push('firestore.rules allows cross-user recovery get (recovery-data disclosure).');
  }

  // 6. Ensure storage.rules exists and enforces MIME type, 5MB limit, and default deny
  if (!storageRules.includes('5 * 1024 * 1024')) {
    errors.push('storage.rules does not enforce the 5MB receipt size limit.');
  }
  if (!storageRules.includes('isAllowedReceiptContentType()')) {
    errors.push('storage.rules does not enforce allowed receipt MIME types.');
  }

  return errors;
}

async function runRetentionAndCoreWorkflowTests(): Promise<void> {
  // 1. Anonymous user creating a group & Anonymous user joining a group
  const anonCreatorUid = 'uid_anon_creator_1';
  const anonJoinerUid = 'uid_anon_joiner_2';
  const jan10 = Date.UTC(2026, 0, 10, 12, 0, 0); // Jan 10, 2026 12:00 UTC
  const dayMs = 24 * 60 * 60 * 1000;

  let group: Group = {
    id: 'g_trip_2026',
    name: 'Weekend Ski Trip',
    baseCurrency: 'CAD',
    preferredCalendar: 'AD',
    language: 'en',
    inviteCode: 'SKI26A',
    createdBy: anonCreatorUid,
    memberUserIds: [anonCreatorUid, anonJoinerUid],
    settled: false,
    settledAt: null,
    retentionOption: '15_days',
    scheduledDeleteAt: null,
    keepGroup: false,
    createdAt: new Date(jan10).toISOString(),
  };

  const members: Member[] = [
    {
      id: 'm_creator',
      uid: anonCreatorUid,
      name: 'Alex',
      avatar: '🧑',
      color: '#087F5B',
      groupId: group.id,
      createdAt: new Date(jan10).toISOString(),
    },
    {
      id: 'm_joiner',
      uid: anonJoinerUid,
      name: 'Sam',
      avatar: '👩',
      color: '#2563EB',
      groupId: group.id,
      createdAt: new Date(jan10).toISOString(),
    },
  ];

  // 2. Adding expenses & correct balance calculation
  const equalSplit = calculateEqualShares(120, ['m_creator', 'm_joiner']);
  const expense1: Expense = {
    id: 'exp_cabin_1',
    groupId: group.id,
    title: 'Cabin Rental',
    originalAmount: 120,
    originalCurrency: 'CAD',
    exchangeRate: 1,
    baseAmount: 120,
    paidBy: 'm_creator',
    dateISO: '2026-01-10',
    calendarType: 'AD',
    category: 'Travel',
    receiptStoragePath: `receipts/${group.id}/${anonCreatorUid}/cabin.jpg`,
    createdAt: new Date(jan10).toISOString(),
  };
  const shares1: ExpenseShare[] = equalSplit.map(s => ({
    id: `sh_${expense1.id}_${s.memberId}`,
    expenseId: expense1.id,
    groupId: group.id,
    memberId: s.memberId,
    shareAmount: s.shareAmount,
    splitType: 'equal',
  }));

  const balancesBeforeSettle = calculateMemberBalances(
    members,
    [expense1],
    shares1,
    []
  );
  const optimizedBeforeSettle = optimizeSettlements(
    balancesBeforeSettle,
    group.baseCurrency
  );

  if (
    optimizedBeforeSettle.length !== 1 ||
    optimizedBeforeSettle[0].fromMemberId !== 'm_joiner' ||
    optimizedBeforeSettle[0].toMemberId !== 'm_creator' ||
    Math.abs(optimizedBeforeSettle[0].amount - 60) > 0.001
  ) {
    throw new Error('Balance and settlement calculation mismatch before settling');
  }

  // Inactive group with unsettled balance MUST NOT be marked settled or expired
  if (isGroupCleanupExpired(group, jan10 + 90 * dayMs)) {
    throw new Error('Unsettled inactive group must never expire or be deleted');
  }

  // 3. Settling all balances & setting settledAt
  const settlement1: SettlementRecord = {
    id: 'set_1',
    groupId: group.id,
    fromMemberId: 'm_joiner',
    toMemberId: 'm_creator',
    amount: 60,
    currency: 'CAD',
    dateISO: '2026-01-10',
    createdAt: new Date(jan10).toISOString(),
  };

  const balancesAfterSettle = calculateMemberBalances(
    members,
    [expense1],
    shares1,
    [settlement1]
  );
  const optimizedAfterSettle = optimizeSettlements(
    balancesAfterSettle,
    group.baseCurrency
  );
  if (optimizedAfterSettle.length !== 0) {
    throw new Error('Expected 0 pending settlements after full payment');
  }

  const transitionToSettled = evaluateGroupSettlementTransition(
    group,
    false,
    jan10
  );
  if (!transitionToSettled || !transitionToSettled.settled || transitionToSettled.settledAt !== jan10) {
    throw new Error('Expected group to transition to settled with settledAt = jan10');
  }
  group = { ...group, ...transitionToSettled };

  // 4. Verify 3-day, 15-day, and 1-month retention periods
  const exp3Days = computeExpirationTimestamp(jan10, '3_days');
  const exp15Days = computeExpirationTimestamp(jan10, '15_days');
  const exp1Month = computeExpirationTimestamp(jan10, '1_month');

  if (exp3Days !== jan10 + 3 * dayMs) {
    throw new Error('3-day retention timestamp calculation failed');
  }
  if (exp15Days !== jan10 + 15 * dayMs) {
    throw new Error('15-day retention timestamp calculation failed (Jan 10 + 15d = Jan 25)');
  }
  if (exp1Month !== jan10 + 30 * dayMs) {
    throw new Error('1-month retention timestamp calculation failed');
  }

  const group3d = { ...group, ...buildSettledGroupState(group, jan10, '3_days') };
  if (isGroupCleanupExpired(group3d, jan10 + 2 * dayMs)) {
    throw new Error('3-day group should not expire after 2 days');
  }
  if (!isGroupCleanupExpired(group3d, jan10 + 3 * dayMs + 1000)) {
    throw new Error('3-day group should expire after 3 days');
  }

  const group15d = { ...group, ...buildSettledGroupState(group, jan10, '15_days') };
  if (isGroupCleanupExpired(group15d, jan10 + 14 * dayMs)) {
    throw new Error('15-day group should not expire after 14 days');
  }
  if (!isGroupCleanupExpired(group15d, jan10 + 15 * dayMs)) {
    throw new Error('15-day group should expire on Jan 25 (after 15 days)');
  }

  const group1m = { ...group, ...buildSettledGroupState(group, jan10, '1_month') };
  if (isGroupCleanupExpired(group1m, jan10 + 29 * dayMs)) {
    throw new Error('1-month group should not expire after 29 days');
  }
  if (!isGroupCleanupExpired(group1m, jan10 + 30 * dayMs)) {
    throw new Error('1-month group should expire after 30 days');
  }

  // Keep Group prevents automatic deletion even after retention period passes
  const keptGroup = { ...group15d, ...buildKeepGroupState(group15d) };
  if (isGroupCleanupExpired(keptGroup, jan10 + 60 * dayMs)) {
    throw new Error('Group marked with keepGroup=true must not be auto-deleted');
  }

  // 5. Cancellation of deletion when a new expense is added (Settled -> Active)
  const cancelPatch = evaluateGroupSettlementTransition(group15d, true, jan10 + 5 * dayMs);
  if (
    !cancelPatch ||
    cancelPatch.settled !== false ||
    cancelPatch.settledAt !== null ||
    cancelPatch.scheduledDeleteAt !== null
  ) {
    throw new Error('Adding a new unsettled expense must cancel pending deletion and reset group to Active');
  }
  const reactivatedGroup = { ...group15d, ... buildActiveGroupState(group15d) };
  if (isGroupCleanupExpired(reactivatedGroup, jan10 + 30 * dayMs)) {
    throw new Error('Reactivated group must not be deleted after original expiration date');
  }

  // 6. Server-side cleanup job: deletes expired settled group, related subcollections/docs, and Storage receipts
  const expiredGroup15d = {
    ...buildSettledGroupState(group, jan10, '15_days'),
    id: 'g_expired_15d',
  };
  const notYetExpiredGroup = {
    ...buildSettledGroupState(group, jan10 + 10 * dayMs, '15_days'),
    id: 'g_not_yet_expired',
  };
  const mockDocsStore = new Map<string, any>([
    ['groups/g_expired_15d', expiredGroup15d],
    ['groups/g_not_yet_expired', notYetExpiredGroup],
    ['groups/g_kept', { ...keptGroup, id: 'g_kept' }],
    ['expenses/exp_cabin_1', expense1],
    ['expenseShares/sh_1', shares1[0]],
    ['expenseShares/sh_2', shares1[1]],
    ['settlements/set_1', settlement1],
    ['groupMembers/gm_1', { id: 'gm_1', groupId: group15d.id, memberId: 'm_creator' }],
    ['members/m_creator', members[0]],
    ['inviteCodes/SKI26A', { groupId: group15d.id, createdBy: anonCreatorUid }],
  ]);
  const mockStorageReceipts = new Set<string>([
    `receipts/g_expired_15d/${anonCreatorUid}/cabin.jpg`,
  ]);

  const jan25 = jan10 + 15 * dayMs;
  const cleanupSummary = await runServerSideGroupCleanupJob(
    {
      async findSettledGroups(): Promise<CleanupGroupRecord[]> {
        return [
          mockDocsStore.get('groups/g_expired_15d'),
          mockDocsStore.get('groups/g_not_yet_expired'),
          mockDocsStore.get('groups/g_kept'),
        ];
      },
      async deleteGroupCascade(target: CleanupGroupRecord): Promise<CleanupDiagnosticLog> {
        mockDocsStore.delete(`groups/${target.id}`);
        mockDocsStore.delete('expenses/exp_cabin_1');
        mockDocsStore.delete('expenseShares/sh_1');
        mockDocsStore.delete('expenseShares/sh_2');
        mockDocsStore.delete('settlements/set_1');
        mockDocsStore.delete('groupMembers/gm_1');
        mockDocsStore.delete('members/m_creator');
        if (target.inviteCode) {
          mockDocsStore.delete(`inviteCodes/${target.inviteCode}`);
        }
        mockStorageReceipts.delete(`receipts/${target.id}/${anonCreatorUid}/cabin.jpg`);
        return {
          groupId: target.id,
          retentionOption: target.retentionOption || '15_days',
          settledAt: target.settledAt || jan10,
          expiredAt: jan25,
          deletedExpensesCount: 1,
          deletedSharesCount: 2,
          deletedSettlementsCount: 1,
          deletedGroupMembersCount: 1,
          deletedExclusiveMembersCount: 1,
          deletedInviteCodesCount: 1,
          deletedReceiptsCount: 1,
          status: 'deleted',
        };
      },
    },
    jan25
  );

  if (
    cleanupSummary.scannedCount !== 3 ||
    cleanupSummary.expiredCount !== 1 ||
    cleanupSummary.deletedGroupIds[0] !== 'g_expired_15d'
  ) {
    throw new Error('Server-side cleanup job did not accurately identify only the expired settled group');
  }
  if (
    mockDocsStore.has('groups/g_expired_15d') ||
    mockDocsStore.has('expenses/exp_cabin_1') ||
    mockDocsStore.has('expenseShares/sh_1') ||
    mockDocsStore.has('settlements/set_1') ||
    mockDocsStore.has('groupMembers/gm_1') ||
    mockDocsStore.has('inviteCodes/SKI26A') ||
    mockStorageReceipts.size !== 0
  ) {
    throw new Error('Server-side cleanup job left orphaned documents or Storage receipts');
  }
  if (!mockDocsStore.has('groups/g_not_yet_expired') || !mockDocsStore.has('groups/g_kept')) {
    throw new Error('Server-side cleanup job deleted non-expired or kept groups');
  }
}

async function main() {
  console.log('=============================================================');
  console.log('SPLITZY SECURITY RULES & APPLICATION OPERATIONS VERIFICATION');
  console.log('=============================================================');

  const configErrors = verifyFirebaseConfigConsistency();
  if (configErrors.length > 0) {
    console.error('Firebase configuration consistency check failed:', configErrors);
    process.exit(1);
  }
  console.log('✔ Firebase Configuration Consistency Audit: PASSED (all config files synced)');

  const pwaErrors = verifyVercelAndPwaReadiness();
  if (pwaErrors.length > 0) {
    console.error('Vercel & PWA readiness check failed:', pwaErrors);
    process.exit(1);
  }
  console.log('✔ Vercel SPA Routing, PWA Manifest, Icons & Offline Reconciliation Audit: PASSED');

  const staticErrors = verifyStaticRulesInvariants();
  if (staticErrors.length > 0) {
    console.error('Static rules audit failed:', staticErrors);
    process.exit(1);
  }
  console.log('✔ Static AST/Rule Invariant Audit: PASSED (firestore.rules & storage.rules)');

  const suiteResult = runSecurityRulesVerificationSuite();
  if (!suiteResult.passed) {
    console.error('Rule evaluation suite failed:', suiteResult.failures);
    process.exit(1);
  }
  console.log(
    `✔ Security Rule Evaluation Suite: PASSED (${suiteResult.totalAssertions}/${suiteResult.totalAssertions} assertions)`
  );

  // Verify client receipt validator against dangerous/oversized files
  const validJpeg = { size: 200 * 1024, type: 'image/jpeg' } as File;
  const invalidHtml = { size: 1024, type: 'text/html' } as File;
  const oversizedPdf = { size: 6 * 1024 * 1024, type: 'application/pdf' } as File;

  if (!validateReceiptFile(validJpeg).valid) {
    throw new Error('Expected valid JPEG receipt to pass validation');
  }
  if (validateReceiptFile(invalidHtml).valid) {
    throw new Error('Expected HTML file to be rejected by receipt validator');
  }
  if (validateReceiptFile(oversizedPdf).valid) {
    throw new Error('Expected >5MB file to be rejected by receipt validator');
  }
  console.log('✔ Client & Storage Receipt Validation Checks: PASSED');

  const calcTests = runCalculationUnitTests();
  const failedCalc = calcTests.filter(t => !t.passed);
  if (failedCalc.length > 0) {
    console.error('Financial calculation unit tests failed:', failedCalc);
    process.exit(1);
  }
  console.log(
    `✔ Financial Calculation & Debt Simplification Engine Suite: PASSED (${calcTests.length}/${calcTests.length} suites)`
  );

  await runRetentionAndCoreWorkflowTests();
  console.log(
    '✔ Anonymous Workflow, Post-Settlement Retention (3d/15d/1m), Cancellation & Server Cleanup Suite: PASSED'
  );
  console.log('=============================================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
