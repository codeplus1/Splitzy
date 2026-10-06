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
import { runCalculationUnitTests } from '../src/core/calculation';

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

  // 2. Ensure group updates require isOwnerGroupUpdate() or isValidInviteJoin(groupId)
  if (!firestoreRules.includes('isOwnerGroupUpdate() || isValidInviteJoin(groupId)')) {
    errors.push('firestore.rules does not restrict group updates to owner or verified invite-code join.');
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

function main() {
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
  console.log('=============================================================');
}

main();
