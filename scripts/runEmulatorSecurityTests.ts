/**
 * Real Firebase Emulator Suite Security Rules Test Runner
 * Executes the actual `firestore.rules` and `storage.rules` files inside the
 * Firebase Emulator Suite using `@firebase/rules-unit-testing`.
 *
 * Covers:
 * 1. Authorized access (group creation, member profile read by co-member, expenses/shares/settlements)
 * 2. Cross-group access (reading/querying another group's groups, members, groupMembers, expenses, shares, settlements)
 * 3. Membership escalation (ordinary member modifying group settings/members/ownership, UID-less member profile creation/claiming)
 * 4. Unauthorized deletion (ordinary member attempting to delete group, other user's groupMember, or inviteCode)
 * 5. Invite abuse & enumeration (listing inviteCodes, invalid format invite code, rogue invite code creation, invite hijacking, legitimate atomic invite join)
 * 6. Recovery isolation & userDirectory protection (reading/deleting another user's recovery hash or securityProfile, userDirectory enumeration & spoofing)
 * 7. Firebase Storage receipt access (group member upload/download, non-member download denial, non-member upload denial, wrong userId path denial, MIME type & >5MB size denial)
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  arrayUnion,
  setLogLevel,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getBytes,
  deleteObject,
  listAll,
} from 'firebase/storage';
import {
  checkLookupRateLimit,
  resetLookupRateLimits,
  isValidInviteCodeFormat,
} from '../src/services/firebase';

setLogLevel('silent');

const PROJECT_ID = 'demo-splitzy-security-test';

interface TestAssertionResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestAssertionResult[] = [];

async function runCheck(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (err: any) {
    results.push({
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function main() {
  const firestoreRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const storageRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');

  let testEnv: RulesTestEnvironment | null = null;

  try {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: firestoreRules,
        host: '127.0.0.1',
        port: 8080,
      },
      storage: {
        rules: storageRules,
        host: '127.0.0.1',
        port: 9199,
      },
    });

    await testEnv.clearFirestore();

    const hashAlice = 'a'.repeat(64);

    // Seed baseline data using security-rules-disabled admin context
    await testEnv.withSecurityRulesDisabled(async context => {
      const adminDb = context.firestore();

      await setDoc(doc(adminDb, 'groups', 'g_alpha'), {
        id: 'g_alpha',
        name: 'Alpha Trip',
        baseCurrency: 'NPR',
        preferredCalendar: 'BS',
        createdBy: 'uid_alice',
        memberUserIds: ['uid_alice', 'uid_bob'],
        inviteCode: 'ALP234',
        createdAt: '2026-10-01T00:00:00.000Z',
      });

      await setDoc(doc(adminDb, 'groups', 'g_beta'), {
        id: 'g_beta',
        name: 'Beta Secret Group',
        baseCurrency: 'USD',
        preferredCalendar: 'AD',
        createdBy: 'uid_mallory',
        memberUserIds: ['uid_mallory'],
        inviteCode: 'BET567',
        createdAt: '2026-10-01T00:00:00.000Z',
      });

      await setDoc(doc(adminDb, 'inviteCodes', 'ALP234'), {
        groupId: 'g_alpha',
        groupName: 'Alpha Trip',
        createdBy: 'uid_alice',
        createdAt: 1700000000000,
      });

      await setDoc(doc(adminDb, 'members', 'm_alice'), {
        id: 'm_alice',
        name: 'Alice',
        username: 'alice_1',
        uid: 'uid_alice',
        groupId: 'g_alpha',
        memberUserIds: ['uid_alice', 'uid_bob'],
        createdAt: '2026-10-01T00:00:00.000Z',
      });

      await setDoc(doc(adminDb, 'members', 'm_bob'), {
        id: 'm_bob',
        name: 'Bob',
        username: 'bob_1',
        uid: 'uid_bob',
        groupId: 'g_alpha',
        memberUserIds: ['uid_alice', 'uid_bob'],
        createdAt: '2026-10-01T00:00:00.000Z',
      });

      // Legacy member document without UID to test UID-less modification protection
      await setDoc(doc(adminDb, 'members', 'm_uidless'), {
        id: 'm_uidless',
        name: 'Legacy No UID',
        groupId: 'g_alpha',
      });

      await setDoc(doc(adminDb, 'groupMembers', 'gm_alpha_alice'), {
        id: 'gm_alpha_alice',
        groupId: 'g_alpha',
        memberId: 'm_alice',
        memberName: 'Alice',
        memberUid: 'uid_alice',
      });

      await setDoc(doc(adminDb, 'groupMembers', 'gm_alpha_bob'), {
        id: 'gm_alpha_bob',
        groupId: 'g_alpha',
        memberId: 'm_bob',
        memberName: 'Bob',
        memberUid: 'uid_bob',
      });

      await setDoc(doc(adminDb, 'expenses', 'exp_alpha_1'), {
        id: 'exp_alpha_1',
        groupId: 'g_alpha',
        title: 'Thakali Dinner',
        baseAmount: 1500,
        paidBy: 'm_alice',
      });

      await setDoc(doc(adminDb, 'expenseShares', 'sh_alpha_1'), {
        id: 'sh_alpha_1',
        expenseId: 'exp_alpha_1',
        groupId: 'g_alpha',
        memberId: 'm_alice',
        shareAmount: 750,
      });

      await setDoc(doc(adminDb, 'settlements', 'set_alpha_1'), {
        id: 'set_alpha_1',
        groupId: 'g_alpha',
        fromMemberId: 'm_bob',
        toMemberId: 'm_alice',
        amount: 750,
      });

      await setDoc(doc(adminDb, 'recovery', hashAlice), {
        verifierHash: hashAlice,
        uid: 'uid_alice',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      });

      await setDoc(doc(adminDb, 'securityProfiles', 'uid_alice'), {
        uid: 'uid_alice',
        hasRecoveryCode: true,
      });

      await setDoc(doc(adminDb, 'userDirectory', 'alice_1'), {
        username: 'alice_1',
        memberId: 'm_alice',
        uid: 'uid_alice',
        name: 'Alice',
      });
    });

    const aliceCtx = testEnv.authenticatedContext('uid_alice');
    const bobCtx = testEnv.authenticatedContext('uid_bob');
    const charlieCtx = testEnv.authenticatedContext('uid_charlie');
    const malloryCtx = testEnv.authenticatedContext('uid_mallory');
    const unauthCtx = testEnv.unauthenticatedContext();

    const aliceDb = aliceCtx.firestore();
    const bobDb = bobCtx.firestore();
    const charlieDb = charlieCtx.firestore();
    const malloryDb = malloryCtx.firestore();
    const unauthDb = unauthCtx.firestore();

    // =========================================================================
    // 1. AUTHORIZED ACCESS & QUERY COMPATIBILITY
    // =========================================================================
    await runCheck('[1. Authorized] Group owner Alice can update group name', async () => {
      await assertSucceeds(
        updateDoc(doc(aliceDb, 'groups', 'g_alpha'), {
          name: 'Alpha Trip Updated',
        })
      );
    });

    await runCheck('[1. Authorized] Ordinary member Bob can query his groups via array-contains', async () => {
      const q = query(
        collection(bobDb, 'groups'),
        where('memberUserIds', 'array-contains', 'uid_bob')
      );
      const snap = await assertSucceeds(getDocs(q));
      if (snap.docs.length !== 1) throw new Error(`Expected 1 group, got ${snap.docs.length}`);
    });

    await runCheck('[1. Authorized] Co-participant Bob can read Alice member profile in shared group', async () => {
      await assertSucceeds(getDoc(doc(bobDb, 'members', 'm_alice')));
    });

    await runCheck('[1. Authorized] Ordinary member Bob can query scoped expenses, shares, groupMembers, and settlements', async () => {
      await assertSucceeds(
        getDocs(query(collection(bobDb, 'expenses'), where('groupId', 'in', ['g_alpha'])))
      );
      await assertSucceeds(
        getDocs(query(collection(bobDb, 'expenseShares'), where('groupId', 'in', ['g_alpha'])))
      );
      await assertSucceeds(
        getDocs(query(collection(bobDb, 'groupMembers'), where('groupId', 'in', ['g_alpha'])))
      );
      await assertSucceeds(
        getDocs(query(collection(bobDb, 'settlements'), where('groupId', 'in', ['g_alpha'])))
      );
    });

    await runCheck('[1. Authorized] Ordinary member Bob can create, update, and delete an expense and expenseShare in g_alpha', async () => {
      const batch = writeBatch(bobDb);
      batch.set(doc(bobDb, 'expenses', 'exp_alpha_2'), {
        id: 'exp_alpha_2',
        groupId: 'g_alpha',
        title: 'Coffee',
        baseAmount: 400,
        paidBy: 'm_bob',
      });
      batch.set(doc(bobDb, 'expenseShares', 'sh_alpha_2'), {
        id: 'sh_alpha_2',
        expenseId: 'exp_alpha_2',
        groupId: 'g_alpha',
        memberId: 'm_bob',
        shareAmount: 400,
      });
      await assertSucceeds(batch.commit());

      await assertSucceeds(
        updateDoc(doc(bobDb, 'expenses', 'exp_alpha_2'), {
          title: 'Specialty Coffee',
          baseAmount: 450,
        })
      );
      await assertSucceeds(
        updateDoc(doc(bobDb, 'expenseShares', 'sh_alpha_2'), {
          shareAmount: 450,
        })
      );
      await assertSucceeds(deleteDoc(doc(bobDb, 'expenseShares', 'sh_alpha_2')));
      await assertSucceeds(deleteDoc(doc(bobDb, 'expenses', 'exp_alpha_2')));
    });

    await runCheck('[1. Authorized] Ordinary member Bob can create a valid settlement in g_alpha, while self-settlement is denied', async () => {
      await assertSucceeds(
        setDoc(doc(bobDb, 'settlements', 'set_alpha_2'), {
          id: 'set_alpha_2',
          groupId: 'g_alpha',
          fromMemberId: 'm_bob',
          toMemberId: 'm_alice',
          amount: 250,
        })
      );
      // Self-settlement (fromMemberId == toMemberId) must fail schema check
      await assertFails(
        setDoc(doc(bobDb, 'settlements', 'set_alpha_invalid'), {
          id: 'set_alpha_invalid',
          groupId: 'g_alpha',
          fromMemberId: 'm_bob',
          toMemberId: 'm_bob',
          amount: 100,
        })
      );
    });

    await runCheck('[1. Authorized] Owner Alice can create and delete her own group with matching invite code and child records (including missing child doc no-op)', async () => {
      await assertSucceeds(
        setDoc(doc(aliceDb, 'groups', 'g_temp'), {
          id: 'g_temp',
          name: 'Temp Group',
          baseCurrency: 'CAD',
          createdBy: 'uid_alice',
          memberUserIds: ['uid_alice'],
          inviteCode: 'TMP999',
        })
      );
      await assertSucceeds(
        setDoc(doc(aliceDb, 'inviteCodes', 'TMP999'), {
          groupId: 'g_temp',
          groupName: 'Temp Group',
          createdBy: 'uid_alice',
        })
      );
      await assertSucceeds(
        setDoc(doc(aliceDb, 'groupMembers', 'gm_temp_alice'), {
          id: 'gm_temp_alice',
          groupId: 'g_temp',
          memberId: 'm_alice',
        })
      );
      const childDeleteBatch = writeBatch(aliceDb);
      childDeleteBatch.delete(doc(aliceDb, 'groupMembers', 'gm_temp_alice'));
      childDeleteBatch.delete(doc(aliceDb, 'groupMembers', 'gm_temp_nonexistent'));
      childDeleteBatch.delete(doc(aliceDb, 'inviteCodes', 'TMP999'));
      await assertSucceeds(childDeleteBatch.commit());
      await assertSucceeds(deleteDoc(doc(aliceDb, 'groups', 'g_temp')));
    });

    // =========================================================================
    // 2. CROSS-GROUP ACCESS & UNAUTHENTICATED DENIAL
    // =========================================================================
    await runCheck('[2. Cross-Group] Unauthenticated client denied read on groups and members', async () => {
      await assertFails(getDoc(doc(unauthDb, 'groups', 'g_alpha')));
      await assertFails(getDoc(doc(unauthDb, 'members', 'm_alice')));
    });

    await runCheck('[2. Cross-Group] Non-member Mallory denied reading g_alpha group, expenses, shares, settlements, groupMembers, and members', async () => {
      await assertFails(getDoc(doc(malloryDb, 'groups', 'g_alpha')));
      await assertFails(getDoc(doc(malloryDb, 'expenses', 'exp_alpha_1')));
      await assertFails(getDoc(doc(malloryDb, 'expenseShares', 'sh_alpha_1')));
      await assertFails(getDoc(doc(malloryDb, 'settlements', 'set_alpha_1')));
      await assertFails(getDoc(doc(malloryDb, 'groupMembers', 'gm_alpha_alice')));
      await assertFails(getDoc(doc(malloryDb, 'members', 'm_alice')));
    });

    await runCheck('[2. Cross-Group] Non-member Mallory denied scoped query on g_alpha expenses', async () => {
      await assertFails(
        getDocs(query(collection(malloryDb, 'expenses'), where('groupId', '==', 'g_alpha')))
      );
    });

    // =========================================================================
    // 3. MEMBERSHIP ESCALATION & UID-LESS MEMBER DOC PROTECTION
    // =========================================================================
    await runCheck('[3. Escalation] Ordinary member Bob denied from adding/removing users in g_alpha memberUserIds', async () => {
      await assertFails(
        updateDoc(doc(bobDb, 'groups', 'g_alpha'), {
          memberUserIds: ['uid_alice', 'uid_bob', 'uid_mallory'],
        })
      );
    });

    await runCheck('[3. Escalation] Ordinary member Bob denied from changing group ownership (createdBy)', async () => {
      await assertFails(
        updateDoc(doc(bobDb, 'groups', 'g_alpha'), {
          createdBy: 'uid_bob',
        })
      );
    });

    await runCheck('[3. Escalation] Ordinary member Bob denied from modifying group name or currency', async () => {
      await assertFails(
        updateDoc(doc(bobDb, 'groups', 'g_alpha'), {
          name: 'Bob Hijacked Group',
        })
      );
    });

    await runCheck('[3. Escalation] Ordinary member Bob denied from adding a third-party user to groupMembers', async () => {
      await assertFails(
        setDoc(doc(bobDb, 'groupMembers', 'gm_alpha_mallory'), {
          id: 'gm_alpha_mallory',
          groupId: 'g_alpha',
          memberId: 'm_mallory',
        })
      );
    });

    await runCheck('[3. Escalation] Creating a member document without a UID is denied', async () => {
      await assertFails(
        setDoc(doc(malloryDb, 'members', 'm_new_uidless'), {
          id: 'm_new_uidless',
          name: 'Anonymous Spoof',
        })
      );
    });

    await runCheck('[3. Escalation] Modifying or claiming a legacy UID-less member document is denied', async () => {
      await assertFails(
        updateDoc(doc(malloryDb, 'members', 'm_uidless'), {
          uid: 'uid_mallory',
          name: 'Hijacked Legacy Member',
        })
      );
    });

    // =========================================================================
    // 4. UNAUTHORIZED DELETION
    // =========================================================================
    await runCheck('[4. Deletion] Ordinary member Bob denied from deleting group g_alpha (owner required)', async () => {
      await assertFails(deleteDoc(doc(bobDb, 'groups', 'g_alpha')));
    });

    await runCheck('[4. Deletion] Ordinary member Bob denied from deleting Alice groupMember record', async () => {
      await assertFails(deleteDoc(doc(bobDb, 'groupMembers', 'gm_alpha_alice')));
    });

    await runCheck('[4. Deletion] Ordinary member Bob denied from deleting group inviteCode ALP234', async () => {
      await assertFails(deleteDoc(doc(bobDb, 'inviteCodes', 'ALP234')));
    });

    // =========================================================================
    // 5. INVITE ABUSE, ENUMERATION & LEGITIMATE ATOMIC JOIN
    // =========================================================================
    await runCheck('[5. Invite Abuse] Listing/enumerating /inviteCodes collection is denied', async () => {
      await assertFails(getDocs(collection(aliceDb, 'inviteCodes')));
    });

    await runCheck('[5. Invite Abuse] Ordinary member Bob denied from creating rogue invite code for g_alpha', async () => {
      await assertFails(
        setDoc(doc(bobDb, 'inviteCodes', 'ROGUE9'), {
          groupId: 'g_alpha',
          groupName: 'Alpha Trip',
          createdBy: 'uid_bob',
        })
      );
    });

    await runCheck('[5. Invite Abuse] Non-member Charlie denied from joining g_alpha without atomic inviteCode redemption', async () => {
      await assertFails(
        updateDoc(doc(charlieDb, 'groups', 'g_alpha'), {
          memberUserIds: arrayUnion('uid_charlie'),
        })
      );
    });

    await runCheck('[5. Invite Join] Charlie can look up ALP234 by exact ID, join g_alpha via atomic batch, and register his member & groupMember records', async () => {
      const codeSnap = await assertSucceeds(getDoc(doc(charlieDb, 'inviteCodes', 'ALP234')));
      if (!codeSnap.exists() || codeSnap.data()?.groupId !== 'g_alpha') {
        throw new Error('Expected ALP234 inviteCode doc to resolve to g_alpha');
      }

      const joinBatch = writeBatch(charlieDb);
      joinBatch.update(doc(charlieDb, 'inviteCodes', 'ALP234'), {
        lastJoinedBy: 'uid_charlie',
        lastJoinedAt: Date.now(),
      });
      joinBatch.update(doc(charlieDb, 'groups', 'g_alpha'), {
        memberUserIds: arrayUnion('uid_charlie'),
      });
      await assertSucceeds(joinBatch.commit());

      // Charlie creates his own member profile and groupMember mapping
      await assertSucceeds(
        setDoc(doc(charlieDb, 'members', 'm_charlie'), {
          id: 'm_charlie',
          name: 'Charlie',
          username: 'charlie_1',
          uid: 'uid_charlie',
          groupId: 'g_alpha',
          memberUserIds: ['uid_alice', 'uid_bob', 'uid_charlie'],
        })
      );
      await assertSucceeds(
        setDoc(doc(charlieDb, 'groupMembers', 'gm_alpha_charlie'), {
          id: 'gm_alpha_charlie',
          groupId: 'g_alpha',
          memberId: 'm_charlie',
          memberName: 'Charlie',
          memberUid: 'uid_charlie',
        })
      );
    });

    await runCheck('[5. Invite Abuse] Attacker Mallory denied from hijacking inviteCode ALP234 to point to g_beta', async () => {
      await assertFails(
        updateDoc(doc(malloryDb, 'inviteCodes', 'ALP234'), {
          groupId: 'g_beta',
          lastJoinedBy: 'uid_mallory',
        })
      );
    });

    await runCheck('[5. Invite Abuse] Client-side lookup rate limiter blocks rapid brute-force bursts', async () => {
      resetLookupRateLimits();
      for (let i = 0; i < 6; i++) {
        const res = checkLookupRateLimit('invite_lookup', 6, 60_000, 30_000);
        if (!res.allowed) throw new Error(`Expected attempt ${i + 1} to be allowed`);
      }
      const seventh = checkLookupRateLimit('invite_lookup', 6, 60_000, 30_000);
      if (seventh.allowed) {
        throw new Error('Expected 7th rapid invite lookup attempt to be rate-limited');
      }
      if (!isValidInviteCodeFormat('ALP234') || isValidInviteCodeFormat('BAD_CODE_123')) {
        throw new Error('Invite code format validator failed');
      }
      resetLookupRateLimits();
    });

    // =========================================================================
    // 6. RECOVERY ISOLATION & USER DIRECTORY PROTECTION
    // =========================================================================
    await runCheck('[6. Recovery] External user Mallory denied from reading, updating, or deleting Alice recovery record', async () => {
      await assertFails(getDoc(doc(malloryDb, 'recovery', hashAlice)));
      await assertFails(
        updateDoc(doc(malloryDb, 'recovery', hashAlice), {
          uid: 'uid_mallory',
        })
      );
      await assertFails(deleteDoc(doc(malloryDb, 'recovery', hashAlice)));
    });

    await runCheck('[6. Recovery] Owner Alice allowed to read and update her own recovery record and securityProfile', async () => {
      await assertSucceeds(getDoc(doc(aliceDb, 'recovery', hashAlice)));
      await assertSucceeds(
        updateDoc(doc(aliceDb, 'securityProfiles', 'uid_alice'), {
          uid: 'uid_alice',
          hasRecoveryCode: true,
          recoveryCreatedAt: '2026-10-06T00:00:00.000Z',
          lastBackupAt: '2026-10-06T00:00:00.000Z',
        })
      );
    });

    await runCheck('[6. Recovery] External user Mallory denied from reading or listing securityProfiles', async () => {
      await assertFails(getDoc(doc(malloryDb, 'securityProfiles', 'uid_alice')));
      await assertFails(getDocs(collection(malloryDb, 'securityProfiles')));
    });

    await runCheck('[6. UserDirectory] Authenticated user can look up handle by exact ID and register own handle, while listing and spoofing are denied', async () => {
      const dirSnap = await assertSucceeds(getDoc(doc(bobDb, 'userDirectory', 'alice_1')));
      if (!dirSnap.exists() || dirSnap.data()?.uid !== 'uid_alice') {
        throw new Error('Expected @alice_1 userDirectory lookup to succeed');
      }
      await assertSucceeds(
        setDoc(doc(charlieDb, 'userDirectory', 'charlie_1'), {
          username: 'charlie_1',
          memberId: 'm_charlie',
          uid: 'uid_charlie',
          name: 'Charlie',
        })
      );
      await assertFails(getDocs(collection(malloryDb, 'userDirectory')));
      await assertFails(
        setDoc(doc(malloryDb, 'userDirectory', 'mallory_spoof'), {
          username: 'mallory_spoof',
          memberId: 'm_alice',
          uid: 'uid_mallory',
          name: 'Mallory',
        })
      );
      await assertFails(
        updateDoc(doc(malloryDb, 'userDirectory', 'alice_1'), {
          uid: 'uid_mallory',
          memberId: 'm_alice',
          username: 'alice_1',
          name: 'Mallory',
        })
      );
    });

    // =========================================================================
    // 7. FIREBASE STORAGE RECEIPT ACCESS RULES
    // =========================================================================
    const aliceStorage = aliceCtx.storage();
    const bobStorage = bobCtx.storage();
    const malloryStorage = malloryCtx.storage();

    const receiptPath = 'receipts/g_alpha/uid_alice/170000_dinner.jpg';
    const sampleJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

    await runCheck('[7. Storage] Group member Alice can upload valid JPEG receipt (<= 5MB) to her path in g_alpha', async () => {
      await assertSucceeds(
        uploadBytes(ref(aliceStorage, receiptPath), sampleJpegBytes, {
          contentType: 'image/jpeg',
          customMetadata: {
            uploadedBy: 'uid_alice',
            groupId: 'g_alpha',
            memberUserIdsCsv: 'uid_alice,uid_bob,uid_charlie',
          },
        })
      );
    });

    await runCheck('[7. Storage] Verified group co-member Bob can download receipt from g_alpha', async () => {
      await assertSucceeds(getBytes(ref(bobStorage, receiptPath)));
    });

    await runCheck('[7. Storage] Authenticated non-member Mallory is DENIED from downloading g_alpha receipt', async () => {
      await assertFails(getBytes(ref(malloryStorage, receiptPath)));
    });

    await runCheck('[7. Storage] Non-member Mallory is DENIED from uploading a receipt into g_alpha even under her own uid or with spoofed memberUserIdsCsv', async () => {
      await assertFails(
        uploadBytes(
          ref(malloryStorage, 'receipts/g_alpha/uid_mallory/170000_fake.jpg'),
          sampleJpegBytes,
          {
            contentType: 'image/jpeg',
            customMetadata: {
              uploadedBy: 'uid_mallory',
              groupId: 'g_alpha',
              memberUserIdsCsv: 'uid_alice,uid_bob,uid_mallory',
            },
          }
        )
      );
    });

    await runCheck('[7. Storage] Group member Bob is DENIED from uploading a receipt under Alice userId path', async () => {
      await assertFails(
        uploadBytes(
          ref(bobStorage, 'receipts/g_alpha/uid_alice/170000_spoofpath.jpg'),
          sampleJpegBytes,
          {
            contentType: 'image/jpeg',
            customMetadata: {
              uploadedBy: 'uid_bob',
              groupId: 'g_alpha',
              memberUserIdsCsv: 'uid_alice,uid_bob',
            },
          }
        )
      );
    });

    await runCheck('[7. Storage] Uploading receipt with disallowed MIME type (text/html) is DENIED', async () => {
      await assertFails(
        uploadBytes(
          ref(aliceStorage, 'receipts/g_alpha/uid_alice/malicious.html'),
          new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]),
          {
            contentType: 'text/html',
            customMetadata: {
              uploadedBy: 'uid_alice',
              groupId: 'g_alpha',
              memberUserIdsCsv: 'uid_alice,uid_bob',
            },
          }
        )
      );
    });

    await runCheck('[7. Storage] Uploading oversized receipt (> 5MB) is DENIED', async () => {
      const oversizedBytes = new Uint8Array(5 * 1024 * 1024 + 1024);
      await assertFails(
        uploadBytes(
          ref(aliceStorage, 'receipts/g_alpha/uid_alice/oversized.jpg'),
          oversizedBytes,
          {
            contentType: 'image/jpeg',
            customMetadata: {
              uploadedBy: 'uid_alice',
              groupId: 'g_alpha',
              memberUserIdsCsv: 'uid_alice,uid_bob',
            },
          }
        )
      );
    });

    await runCheck('[7. Storage] Non-owner Bob is DENIED from deleting Alice receipt file', async () => {
      await assertFails(deleteObject(ref(bobStorage, receiptPath)));
    });

    await runCheck('[7. Storage] Removed group member Bob immediately loses receipt download access even if listed in customMetadata', async () => {
      await assertSucceeds(
        updateDoc(doc(aliceDb, 'groups', 'g_alpha'), {
          memberUserIds: ['uid_alice', 'uid_charlie'],
        })
      );
      await assertFails(getBytes(ref(bobStorage, receiptPath)));
      // Restore Bob for cleanup consistency
      await assertSucceeds(
        updateDoc(doc(aliceDb, 'groups', 'g_alpha'), {
          memberUserIds: ['uid_alice', 'uid_bob', 'uid_charlie'],
        })
      );
    });

    await runCheck('[7. Storage] Directory listing (listAll) on receipts path and writes to arbitrary non-receipt paths are DENIED', async () => {
      await assertFails(listAll(ref(aliceStorage, 'receipts/g_alpha/uid_alice')));
      await assertFails(
        uploadBytes(ref(aliceStorage, 'avatars/uid_alice/pic.jpg'), sampleJpegBytes, {
          contentType: 'image/jpeg',
        })
      );
    });

    await runCheck('[7. Storage] Owner Alice can delete her own receipt file', async () => {
      await assertSucceeds(deleteObject(ref(aliceStorage, receiptPath)));
    });

    // =========================================================================
    // 8. POST-SETTLEMENT RETENTION & AUTOMATIC CLEANUP RULE CHECKS
    // =========================================================================
    await runCheck('[8. Retention] Group participant Bob can mark g_alpha as settled with 3_days, 15_days, or 1_month retention and settledAt timestamp', async () => {
      const now = 1768046400000;
      const dayMs = 24 * 60 * 60 * 1000;
      await assertSucceeds(
        updateDoc(doc(bobDb, 'groups', 'g_alpha'), {
          settled: true,
          settledAt: now,
          retentionOption: '3_days',
          scheduledDeleteAt: now + 3 * dayMs,
          keepGroup: false,
        })
      );
      await assertSucceeds(
        updateDoc(doc(bobDb, 'groups', 'g_alpha'), {
          settled: true,
          settledAt: now,
          retentionOption: '15_days',
          scheduledDeleteAt: now + 15 * dayMs,
          keepGroup: false,
        })
      );
      await assertSucceeds(
        updateDoc(doc(bobDb, 'groups', 'g_alpha'), {
          settled: true,
          settledAt: now,
          retentionOption: '1_month',
          scheduledDeleteAt: now + 30 * dayMs,
          keepGroup: false,
        })
      );
    });

    await runCheck('[8. Retention] Adding a new expense allows participant Bob to cancel pending cleanup and return group to active state', async () => {
      await assertSucceeds(
        updateDoc(doc(bobDb, 'groups', 'g_alpha'), {
          settled: false,
          settledAt: null,
          scheduledDeleteAt: null,
          keepGroup: false,
        })
      );
    });

    await runCheck('[8. Retention] Invalid retentionOption or settled=true without numeric settledAt is DENIED by Firestore security rules', async () => {
      await assertFails(
        updateDoc(doc(aliceDb, 'groups', 'g_alpha'), {
          retentionOption: '99_days',
        })
      );
      await assertFails(
        updateDoc(doc(aliceDb, 'groups', 'g_alpha'), {
          settled: true,
          settledAt: null,
        })
      );
    });
  } finally {
    if (testEnv) {
      await testEnv.cleanup();
    }
  }

  const passedCount = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed);

  console.log(
    JSON.stringify(
      {
        emulatorSuitePassed: failed.length === 0,
        totalTests: results.length,
        passedTests: passedCount,
        failedTests: failed.length,
        results,
      },
      null,
      2
    )
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error running emulator security tests:', err);
  process.exit(1);
});
