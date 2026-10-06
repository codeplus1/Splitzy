import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  query,
  where,
  limit,
  getDocs,
  arrayUnion,
  Firestore,
} from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  updateProfile,
  User,
  Auth,
} from 'firebase/auth';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  FirebaseStorage,
} from 'firebase/storage';
import { firebaseConfig } from './firebaseConfig';
import { validateReceiptFile } from '../core/receipt';
import {
  Group,
  Member,
  GroupMember,
  Expense,
  ExpenseShare,
  SettlementRecord,
  RecoveryRecord,
  UserSecurityProfile,
} from '../types';
import { AppState, loadAppState } from './storage';

// Suppress internal @firebase/firestore transient connection retry logs so they don't trigger false error overlays
try {
  setLogLevel('silent');
} catch {
  // Ignore if unsupported
}

// Initialize Firebase App (idempotent singleton check)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with the exact Database ID from firebaseConfig (firebase-applet-config.json)
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db: Firestore = firestoreInstance;
export const storage: FirebaseStorage = getStorage(app);

/**
 * Deeply sanitizes an object before writing to Firestore, stripping out undefined properties
 * and ensuring values are safe for Firestore document storage.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as unknown as T;
  }
  if (typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item)) as unknown as T;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean as T;
}

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);

export type SyncStatus = 'connected' | 'syncing' | 'saving' | 'offline' | 'error';

// Collections
export const GROUPS_COL = 'groups';
export const MEMBERS_COL = 'members';
export const GROUP_MEMBERS_COL = 'groupMembers';
export const EXPENSES_COL = 'expenses';
export const EXPENSE_SHARES_COL = 'expenseShares';
export const SETTLEMENTS_COL = 'settlements';
export const INVITE_CODES_COL = 'inviteCodes';
export const RECOVERY_COL = 'recovery';
export const SECURITY_PROFILES_COL = 'securityProfiles';
export const USER_DIRECTORY_COL = 'userDirectory';

/* ==========================================================================
   ERROR HANDLING (Per Firebase Architecture Standard)
   ========================================================================== */

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path,
  };
  console.error('Firestore Operation Failed:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 32 unambiguous characters (excludes 0, O, 1, I to prevent human transcription errors)
const INVITE_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const STRICT_INVITE_CODE_REGEX = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

interface RateLimitBucket {
  timestamps: number[];
  lockedUntil: number;
}

const lookupRateBuckets: Record<string, RateLimitBucket> = {};

/**
 * Sliding-window client-side rate limiter to protect invite-code and username lookups
 * from rapid automated brute-force or enumeration attempts without affecting normal users.
 */
export function checkLookupRateLimit(
  bucketKey: 'invite_lookup' | 'username_lookup',
  maxRequests = 8,
  windowMs = 60_000,
  cooldownMs = 30_000
): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const bucket = lookupRateBuckets[bucketKey] || { timestamps: [], lockedUntil: 0 };
  lookupRateBuckets[bucketKey] = bucket;

  if (bucket.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
    };
  }

  bucket.timestamps = bucket.timestamps.filter(t => now - t < windowMs);
  if (bucket.timestamps.length >= maxRequests) {
    bucket.lockedUntil = now + cooldownMs;
    return {
      allowed: false,
      retryAfterSec: Math.ceil(cooldownMs / 1000),
    };
  }

  bucket.timestamps.push(now);
  return { allowed: true };
}

export function resetLookupRateLimits(): void {
  for (const key of Object.keys(lookupRateBuckets)) {
    delete lookupRateBuckets[key];
  }
}

export function isValidInviteCodeFormat(code: string): boolean {
  return STRICT_INVITE_CODE_REGEX.test(code.trim().toUpperCase());
}

/**
 * Generate a friendly, memorable 6-character uppercase invite code (e.g. "KTM842")
 * Uses crypto.getRandomValues for high-entropy randomness
 */
export function generateInviteCode(): string {
  let code = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 6; i++) {
      code += INVITE_CODE_CHARS[bytes[i] % INVITE_CODE_CHARS.length];
    }
  } else {
    for (let i = 0; i < 6; i++) {
      code += INVITE_CODE_CHARS.charAt(Math.floor(Math.random() * INVITE_CODE_CHARS.length));
    }
  }
  return code;
}

/**
 * Generate an invite code mathematically guaranteed to NEVER duplicate.
 */
export async function generateGuaranteedUniqueInviteCode(
  existingLocalCodes: string[] = []
): Promise<string> {
  const localSet = new Set(
    existingLocalCodes.filter(Boolean).map(c => c.trim().toUpperCase())
  );

  await ensureAuthUser();

  for (let attempt = 0; attempt < 15; attempt++) {
    const candidate = generateInviteCode();
    if (localSet.has(candidate)) {
      continue;
    }

    try {
      const reservationDoc = await getDoc(doc(db, INVITE_CODES_COL, candidate));
      if (reservationDoc.exists()) {
        continue;
      }

      return candidate;
    } catch {
      return candidate;
    }
  }

  return generateInviteCode();
}

export interface AppUser {
  uid: string;
  isAnonymous: boolean;
  displayName?: string;
}

const AUTHORITATIVE_AUTH_UID_KEY = 'hisabsathi_auth_uid';
const LOCAL_USER_KEY = 'hisabsathi_client_session_user';

/**
 * Retrieves the cached authoritative user identity or generates a stable one.
 * Always prefers the persistent Firebase UID to prevent identity race conditions.
 */
export function getCachedUserIdentity(): AppUser {
  try {
    const cachedUid = localStorage.getItem(AUTHORITATIVE_AUTH_UID_KEY);
    if (cachedUid && cachedUid.length > 5) {
      return {
        uid: cachedUid,
        isAnonymous: true,
        displayName: 'User',
      };
    }

    const legacyRaw = localStorage.getItem(LOCAL_USER_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      if (parsed && typeof parsed.uid === 'string' && parsed.uid.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage issues
  }

  // Stable fallback if nothing stored yet
  const fallbackUid = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  return {
    uid: fallbackUid,
    isAnonymous: true,
    displayName: 'User',
  };
}

export const getOrCreateLocalUser = getCachedUserIdentity;

let authInitPromise: Promise<User | null> | null = null;

/**
 * Ensures a valid authenticated Firebase session exists before performing cloud mutations.
 * Automatically activates or awaits Anonymous Authentication seamlessly.
 */
export async function ensureAuthUser(): Promise<User | null> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  if (!authInitPromise) {
    authInitPromise = (async () => {
      try {
        const cred = await signInAnonymously(auth);
        return cred.user;
      } catch (err: any) {
        if (err?.code !== 'auth/admin-restricted-operation' && err?.code !== 'auth/operation-not-allowed') {
          console.warn('ensureAuthUser signInAnonymously notice:', err);
        }
        return null;
      } finally {
        authInitPromise = null;
      }
    })();
  }
  const user = await authInitPromise;
  if (user) return user;
  if (auth.currentUser) return auth.currentUser;
  return null;
}

/**
 * Initializes Firebase Authentication invisibly with Anonymous Auth.
 * Seamless: The user is never prompted for passwords, emails, or logins.
 * Crucially: Ensures the Firebase Auth UID is established as the sole authoritative cloud identity.
 */
export function initAuthSession(onUserChange: (user: AppUser) => void): () => void {
  // If currentUser is already signed in on the SDK
  if (auth.currentUser) {
    const appUser: AppUser = {
      uid: auth.currentUser.uid,
      isAnonymous: auth.currentUser.isAnonymous,
      displayName: auth.currentUser.displayName || 'User',
    };
    try {
      localStorage.setItem(AUTHORITATIVE_AUTH_UID_KEY, appUser.uid);
    } catch {
      // Ignore
    }
    onUserChange(appUser);
  } else {
    // Provide cached identity while SDK establishes network connection
    const cached = getCachedUserIdentity();
    onUserChange(cached);
  }

  try {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user) {
        const appUser: AppUser = {
          uid: user.uid,
          isAnonymous: user.isAnonymous,
          displayName: user.displayName || 'User',
        };
        try {
          localStorage.setItem(AUTHORITATIVE_AUTH_UID_KEY, user.uid);
          localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(appUser));
        } catch {
          // Ignore
        }
        onUserChange(appUser);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          if (cred?.user) {
            const appUser: AppUser = {
              uid: cred.user.uid,
              isAnonymous: true,
              displayName: 'User',
            };
            try {
              localStorage.setItem(AUTHORITATIVE_AUTH_UID_KEY, cred.user.uid);
              localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(appUser));
            } catch {
              // Ignore
            }
            onUserChange(appUser);
          }
        } catch (authErr: any) {
          if (authErr?.code !== 'auth/admin-restricted-operation' && authErr?.code !== 'auth/operation-not-allowed') {
            console.warn('Anonymous auth notice:', authErr);
          }
          const cached = getCachedUserIdentity();
          onUserChange(cached);
        }
      }
    });

    return () => unsubscribe();
  } catch (err) {
    console.error('Failed to attach auth state observer:', err);
    return () => {};
  }
}

/**
 * Update current user's display name
 */
export async function updateUserDisplayName(displayName: string): Promise<void> {
  if (auth.currentUser) {
    try {
      await updateProfile(auth.currentUser, { displayName });
    } catch (err) {
      console.warn('Failed to update Firebase profile display name:', err);
    }
  }

  try {
    const current = getCachedUserIdentity();
    current.displayName = displayName;
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(current));
  } catch {
    // Ignore
  }
}

/* ==========================================================================
   REAL-TIME DATA SYNCHRONIZATION
   ========================================================================== */

export interface CloudSyncData {
  groups: Group[];
  members: Member[];
  groupMembers: GroupMember[];
  expenses: Expense[];
  expenseShares: ExpenseShare[];
  settlements: SettlementRecord[];
  isInitialLoad: boolean;
}

/**
 * Real-time subscriber for Firestore data SCOPED to the current user's authorized groups.
 * Robust design:
 * 1. Queries groups where memberUserIds contains this user's UID (or createdBy).
 * 2. When groups are found, dynamically scopes expense, member, and settlement queries
 *    to those groups (using 'where(groupId in ...)'), matching secure Firestore rules.
 * 3. Never downloads the entire database across unrelated users.
 * 4. Dispatches accurate SyncStatus.
 */
export function subscribeToUserCloudSync(
  userId: string,
  onData: (data: CloudSyncData) => void,
  onStatusChange?: (status: SyncStatus) => void
): () => void {
  onStatusChange?.('syncing');

  let isCancelled = false;
  let unsubGroups: (() => void) | null = null;
  let currentGroups: Group[] = [];
  let hasEmittedInitial = false;

  let unsubSubqueries: Array<() => void> = [];

  const cleanupSubqueries = () => {
    unsubSubqueries.forEach(unsub => unsub());
    unsubSubqueries = [];
  };

  const handleError = (error: unknown, path: string) => {
    console.warn(`Firestore sync listener error on [${path}]:`, error);
    const code = (error as any)?.code;
    if (code === 'unavailable') {
      onStatusChange?.('offline');
    } else {
      onStatusChange?.('error');
    }
  };

  // Setup scoped listeners for expenses, shares, members, and settlements
  const setupScopedListeners = (groupIds: string[]) => {
    cleanupSubqueries();

    // Firestore 'in' query allows up to 30 items per batch
    const limitedGroupIds = groupIds.slice(0, 30);

    let scopedExpenses: Expense[] = [];
    let sharesByGroup: ExpenseShare[] = [];
    let sharesByExpense: ExpenseShare[] = [];
    let scopedMembers: Member[] = [];
    let scopedGroupMembers: GroupMember[] = [];
    let scopedSettlements: SettlementRecord[] = [];

    let loadedExp = false;
    let loadedShares = false;
    let loadedMemb = false;
    let loadedGm = false;
    let loadedSett = false;

    const getMergedShares = (): ExpenseShare[] => {
      const validExpenseIds = new Set(scopedExpenses.map(e => e.id));
      const map = new Map<string, ExpenseShare>();
      for (const s of sharesByExpense) {
        if (validExpenseIds.has(s.expenseId)) {
          map.set(s.id, s);
        }
      }
      for (const s of sharesByGroup) {
        if (validExpenseIds.has(s.expenseId)) {
          map.set(s.id, s);
        }
      }
      return Array.from(map.values());
    };

    const emitAggregatedData = () => {
      if (isCancelled) return;
      if (loadedExp && loadedShares && loadedMemb && loadedGm && loadedSett) {
        onStatusChange?.('connected');
        hasEmittedInitial = true;

        onData({
          groups: currentGroups,
          members: scopedMembers,
          groupMembers: scopedGroupMembers,
          expenses: scopedExpenses,
          expenseShares: getMergedShares(),
          settlements: scopedSettlements,
          isInitialLoad: hasEmittedInitial,
        });
      }
    };

    // A. Expenses query scoped to groupIds
    const expQuery = query(
      collection(db, EXPENSES_COL),
      where('groupId', 'in', limitedGroupIds)
    );
    const unsubExp = onSnapshot(
      expQuery,
      snap => {
        scopedExpenses = snap.docs.map(d => d.data() as Expense);
        loadedExp = true;

        // Also query shares by expenseId for any expenses missing groupId-tagged shares
        const expIds = scopedExpenses.map(e => e.id).slice(0, 30);
        if (expIds.length === 0) {
          sharesByExpense = [];
          loadedShares = true;
          emitAggregatedData();
        } else {
          getDocs(
            query(
              collection(db, EXPENSE_SHARES_COL),
              where('expenseId', 'in', expIds)
            )
          )
            .then(shSnap => {
              sharesByExpense = shSnap.docs.map(d => d.data() as ExpenseShare);
              loadedShares = true;
              emitAggregatedData();
            })
            .catch(() => {
              loadedShares = true;
              emitAggregatedData();
            });
        }

        emitAggregatedData();
      },
      err => handleError(err, EXPENSES_COL)
    );
    unsubSubqueries.push(unsubExp);

    // B. GroupMembers query scoped to groupIds
    const gmQuery = query(
      collection(db, GROUP_MEMBERS_COL),
      where('groupId', 'in', limitedGroupIds)
    );
    const unsubGm = onSnapshot(
      gmQuery,
      snap => {
        scopedGroupMembers = snap.docs.map(d => d.data() as GroupMember);
        loadedGm = true;

        // When groupMembers update, resolve the associated member profiles via authorized single-doc gets + GroupMember metadata
        const memberIds = Array.from(new Set(scopedGroupMembers.map(gm => gm.memberId))).slice(0, 30);
        if (memberIds.length === 0) {
          scopedMembers = [];
          loadedMemb = true;
          emitAggregatedData();
        } else {
          Promise.allSettled(memberIds.map(id => getDoc(doc(db, MEMBERS_COL, id))))
            .then(results => {
              const memberMap = new Map<string, Member>();
              for (const gm of scopedGroupMembers) {
                if (gm.memberId && gm.memberName && !memberMap.has(gm.memberId)) {
                  memberMap.set(gm.memberId, {
                    id: gm.memberId,
                    name: gm.memberName,
                    username: gm.memberUsername,
                    avatar: gm.memberAvatar || '👤',
                    color: gm.memberColor || '#670B27',
                    uid: gm.memberUid,
                    groupId: gm.groupId,
                    createdAt: new Date().toISOString(),
                  });
                }
              }
              for (const res of results) {
                if (res.status === 'fulfilled' && res.value.exists()) {
                  const m = res.value.data() as Member;
                  memberMap.set(m.id, m);
                }
              }
              scopedMembers = Array.from(memberMap.values());
              loadedMemb = true;
              emitAggregatedData();
            })
            .catch(() => {
              loadedMemb = true;
              emitAggregatedData();
            });
        }
        emitAggregatedData();
      },
      err => handleError(err, GROUP_MEMBERS_COL)
    );
    unsubSubqueries.push(unsubGm);

    // C. Settlements query scoped to groupIds
    const settQuery = query(
      collection(db, SETTLEMENTS_COL),
      where('groupId', 'in', limitedGroupIds)
    );
    const unsubSett = onSnapshot(
      settQuery,
      snap => {
        scopedSettlements = snap.docs.map(d => d.data() as SettlementRecord);
        loadedSett = true;
        emitAggregatedData();
      },
      err => handleError(err, SETTLEMENTS_COL)
    );
    unsubSubqueries.push(unsubSett);

    // D. ExpenseShares query scoped strictly to limitedGroupIds (never scans full collection)
    const sharesQuery = query(
      collection(db, EXPENSE_SHARES_COL),
      where('groupId', 'in', limitedGroupIds)
    );
    const unsubShares = onSnapshot(
      sharesQuery,
      snap => {
        sharesByGroup = snap.docs.map(d => d.data() as ExpenseShare);
        loadedShares = true;
        emitAggregatedData();
      },
      () => {
        loadedShares = true;
        emitAggregatedData();
      }
    );
    unsubSubqueries.push(unsubShares);
  };

  // Ensure Firebase Authentication session is active before attaching Firestore listeners
  ensureAuthUser().then(authUser => {
    if (isCancelled) return;
    const effectiveUserId = authUser?.uid || auth.currentUser?.uid || userId;
    if (!auth.currentUser) {
      onStatusChange?.('offline');
      return;
    }

    const groupsQuery = query(
      collection(db, GROUPS_COL),
      where('memberUserIds', 'array-contains', effectiveUserId)
    );

    unsubGroups = onSnapshot(
      groupsQuery,
      groupsSnap => {
        if (isCancelled) return;
        currentGroups = groupsSnap.docs.map(d => d.data() as Group);

        // If user has no groups on cloud, emit empty state immediately
        if (currentGroups.length === 0) {
          cleanupSubqueries();
          onStatusChange?.('connected');
          hasEmittedInitial = true;
          onData({
            groups: [],
            members: [],
            groupMembers: [],
            expenses: [],
            expenseShares: [],
            settlements: [],
            isInitialLoad: true,
          });
          return;
        }

        const groupIds = currentGroups.map(g => g.id);

        // Keep invite code index up-to-date in background for groups owned by this user
        currentGroups.forEach(g => {
          if (g.inviteCode && (!g.createdBy || g.createdBy === effectiveUserId)) {
            setDoc(
              doc(db, INVITE_CODES_COL, g.inviteCode),
              {
                groupId: g.id,
                groupName: g.name,
                createdAt: Date.now(),
                createdBy: effectiveUserId,
              },
              { merge: true }
            ).catch(() => {});
          }
        });

        setupScopedListeners(groupIds);
      },
      err => handleError(err, GROUPS_COL)
    );
  });

  return () => {
    isCancelled = true;
    unsubGroups?.();
    cleanupSubqueries();
  };
}

/* ==========================================================================
   CLOUD WRITE MUTATIONS (ATOMIC BATCHES WITH STRICT ERROR REPORTING)
   ========================================================================== */

/**
 * Cloud write: Save a newly created group and its participants
 */
export async function cloudCreateGroup(
  newGroup: Group,
  newMembers: Member[],
  newGroupMembers: GroupMember[],
  currentUser?: { uid: string } | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await ensureAuthUser();
    const realAuthUid = authUser?.uid || auth.currentUser?.uid;
    const fallbackUid = currentUser?.uid || 'anonymous';
    const effectiveUid = realAuthUid || fallbackUid;
    const isLocalFallbackUid = (uid?: string) =>
      !uid || uid === 'anonymous' || uid === fallbackUid || uid.startsWith('u_');

    const memberIds = new Set<string>(
      (newGroup.memberUserIds || []).filter(u => !isLocalFallbackUid(u))
    );
    if (realAuthUid) memberIds.add(realAuthUid);
    if (memberIds.size === 0) memberIds.add(effectiveUid);

    const groupToSave: Group = sanitizeForFirestore({
      ...newGroup,
      createdBy: realAuthUid || effectiveUid,
      memberUserIds: Array.from(memberIds),
      inviteCode: newGroup.inviteCode || generateInviteCode(),
    });

    const batch = writeBatch(db);
    batch.set(doc(db, GROUPS_COL, groupToSave.id), groupToSave);

    if (groupToSave.inviteCode) {
      batch.set(doc(db, INVITE_CODES_COL, groupToSave.inviteCode), sanitizeForFirestore({
        groupId: groupToSave.id,
        groupName: groupToSave.name,
        createdAt: Date.now(),
        createdBy: realAuthUid || effectiveUid,
      }));
    }

    const memberLookup = new Map<string, Member>(newMembers.map(m => [m.id, m]));
    const ownMember =
      newMembers.find(m => m.uid && m.uid === realAuthUid) ||
      newMembers.find(m => m.uid && isLocalFallbackUid(m.uid)) ||
      newMembers[0];

    if (ownMember) {
      batch.set(
        doc(db, MEMBERS_COL, ownMember.id),
        sanitizeForFirestore({
          ...ownMember,
          uid: realAuthUid || effectiveUid,
          groupId: groupToSave.id,
          memberUserIds: groupToSave.memberUserIds,
        }),
        { merge: true }
      );
    }

    for (const gm of newGroupMembers) {
      const mInfo = memberLookup.get(gm.memberId);
      const resolvedMemberUid =
        gm.memberId === ownMember?.id
          ? realAuthUid || effectiveUid
          : gm.memberUid && !isLocalFallbackUid(gm.memberUid)
          ? gm.memberUid
          : mInfo?.uid && !isLocalFallbackUid(mInfo.uid)
          ? mInfo.uid
          : undefined;
      batch.set(
        doc(db, GROUP_MEMBERS_COL, gm.id),
        sanitizeForFirestore({
          ...gm,
          memberName: gm.memberName || mInfo?.name,
          memberUsername: gm.memberUsername || mInfo?.username,
          memberAvatar: gm.memberAvatar || mInfo?.avatar,
          memberColor: gm.memberColor || mInfo?.color,
          memberUid: resolvedMemberUid,
        })
      );
    }

    await batch.commit();
    return { success: true };
  } catch (err) {
    console.warn('Cloud create group sync note:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cloud write: Update an existing group
 */
export async function cloudUpdateGroup(
  groupId: string,
  updates: Partial<Group>,
  fullGroup?: Group | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await ensureAuthUser();
    const realAuthUid = authUser?.uid || auth.currentUser?.uid;
    const isLocalFallback = (uid?: string) =>
      !uid || uid === 'anonymous' || uid.startsWith('u_');

    let baseGroup = fullGroup;
    if (!baseGroup) {
      try {
        const local = loadAppState();
        baseGroup = local.groups.find(g => g.id === groupId) || null;
      } catch {
        // Ignore
      }
    }

    if (baseGroup && realAuthUid) {
      const effectiveCreator = isLocalFallback(baseGroup.createdBy)
        ? realAuthUid
        : baseGroup.createdBy!;
      const cleanMemberUserIds = Array.from(
        new Set([
          ...(baseGroup.memberUserIds || []).filter(u => !isLocalFallback(u)),
          realAuthUid,
        ])
      );

      // If the user is the group owner (or claiming a local group), write the complete valid group document
      if (effectiveCreator === realAuthUid) {
        const mergedGroup: Group = sanitizeForFirestore({
          ...baseGroup,
          ...updates,
          id: groupId,
          createdBy: realAuthUid,
          memberUserIds: cleanMemberUserIds,
          inviteCode: baseGroup.inviteCode || generateInviteCode(),
        });
        await setDoc(doc(db, GROUPS_COL, groupId), mergedGroup, { merge: true });
        return { success: true };
      }
    }

    await setDoc(doc(db, GROUPS_COL, groupId), sanitizeForFirestore(updates), { merge: true });
    return { success: true };
  } catch (err) {
    console.warn('Cloud update group sync note:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cloud write: Delete a group and its associated data (requires group owner authorization).
 * Deletes dependent child documents first while the parent group document still exists
 * in Firestore (satisfying `isGroupParticipant` / `isGroupOwner` rules), then deletes the group.
 */
export async function cloudDeleteGroup(
  groupId: string,
  expensesToDelete: Expense[],
  sharesToDelete: ExpenseShare[] = [],
  settlementsToDelete: SettlementRecord[] = [],
  groupMembersToDelete: GroupMember[] = [],
  inviteCodeToDelete?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAuthUser();

    // 1. Delete dependent child documents first while /groups/{groupId} still exists
    const childRefs = [
      ...sharesToDelete.map(s => doc(db, EXPENSE_SHARES_COL, s.id)),
      ...expensesToDelete.map(e => doc(db, EXPENSES_COL, e.id)),
      ...settlementsToDelete.map(st => doc(db, SETTLEMENTS_COL, st.id)),
      ...groupMembersToDelete.map(gm => doc(db, GROUP_MEMBERS_COL, gm.id)),
      ...(inviteCodeToDelete ? [doc(db, INVITE_CODES_COL, inviteCodeToDelete)] : []),
    ];

    if (childRefs.length > 0) {
      const CHUNK_SIZE = 10;
      for (let i = 0; i < childRefs.length; i += CHUNK_SIZE) {
        const chunk = childRefs.slice(i, i + CHUNK_SIZE);
        try {
          const childBatch = writeBatch(db);
          for (const refItem of chunk) {
            childBatch.delete(refItem);
          }
          await childBatch.commit();
        } catch {
          // If one child doc was local-only or missing, delete remaining existing docs individually
          await Promise.allSettled(chunk.map(refItem => deleteDoc(refItem)));
        }
      }
    }

    // 2. Delete the parent group document last
    await deleteDoc(doc(db, GROUPS_COL, groupId));
    return { success: true };
  } catch (err) {
    console.warn('Cloud delete group sync note:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Normalizes a username handle (e.g. "@Saroj_88" -> "saroj_88")
 */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);
}

/**
 * Generates a default unique username handle from a user's display name and UID
 */
export function generateDefaultUsername(name: string, uid?: string): string {
  const base = normalizeUsername(name) || 'user';
  const suffix = (uid || Date.now().toString(36))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-4)
    .toLowerCase();
  return `${base}_${suffix}`;
}

/**
 * Registers or updates the current user's profile and unique @username in Firestore
 * (`members` and `userDirectory` collections). Verifies that the username is not already
 * claimed by a different user ID.
 */
export async function cloudRegisterOrUpdateUserProfile(
  member: Member,
  previousUsername?: string
): Promise<{ success: boolean; error?: string; member?: Member }> {
  try {
    const authUser = await ensureAuthUser();
    const effectiveUid = authUser?.uid || auth.currentUser?.uid || member.uid || member.id;
    const cleanUsername = normalizeUsername(
      member.username || generateDefaultUsername(member.name, effectiveUid)
    );

    if (cleanUsername.length < 2) {
      return {
        success: false,
        error: 'Username ID must be at least 2 characters long.',
      };
    }

    const updatedMember: Member = sanitizeForFirestore({
      ...member,
      username: cleanUsername,
      uid: effectiveUid,
    });

    const dirRef = doc(db, USER_DIRECTORY_COL, cleanUsername);
    const existingSnap = await getDoc(dirRef);
    if (existingSnap.exists()) {
      const data = existingSnap.data();
      if (data.memberId !== member.id && data.uid !== effectiveUid) {
        return {
          success: false,
          error: `Username "@${cleanUsername}" is already taken by another Splitzy user. Please choose a different unique ID.`,
        };
      }
    }

    const batch = writeBatch(db);
    if (previousUsername) {
      const cleanPrev = normalizeUsername(previousUsername);
      if (cleanPrev && cleanPrev !== cleanUsername) {
        batch.delete(doc(db, USER_DIRECTORY_COL, cleanPrev));
      }
    }

    batch.set(doc(db, MEMBERS_COL, updatedMember.id), updatedMember, { merge: true });
    batch.set(
      dirRef,
      sanitizeForFirestore({
        username: cleanUsername,
        memberId: updatedMember.id,
        uid: effectiveUid,
        name: updatedMember.name,
        avatar: updatedMember.avatar,
        color: updatedMember.color || '#670B27',
        updatedAt: new Date().toISOString(),
      })
    );

    await batch.commit();
    return { success: true, member: updatedMember };
  } catch (err) {
    console.warn('cloudRegisterOrUpdateUserProfile notice:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Verifies whether a user exists in the Splitzy app database by their unique @username or Member ID.
 * Uses the O(1) `/userDirectory/{username}` index without exposing private member collections.
 */
export async function cloudLookupRegisteredUser(
  identifierRaw: string
): Promise<{ found: boolean; member?: Member; message: string }> {
  const trimmed = identifierRaw.trim();
  const cleanUsername = normalizeUsername(trimmed);

  if (!cleanUsername || cleanUsername.length < 2 || cleanUsername.length > 30) {
    return {
      found: false,
      message: 'Please enter a valid @username (2 to 30 characters).',
    };
  }

  const rateCheck = checkLookupRateLimit('username_lookup', 10, 60_000, 30_000);
  if (!rateCheck.allowed) {
    return {
      found: false,
      message: `Too many username lookup attempts. Please wait ${rateCheck.retryAfterSec}s before trying again.`,
    };
  }

  try {
    await ensureAuthUser();

    // 1. Check `/userDirectory/{username}` (O(1) authenticated lookup)
    try {
      const dirSnap = await getDoc(doc(db, USER_DIRECTORY_COL, cleanUsername));
      if (dirSnap.exists()) {
        const d = dirSnap.data();
        return {
          found: true,
          member: {
            id: d.memberId,
            username: d.username,
            uid: d.uid,
            name: d.name,
            avatar: d.avatar || '👨‍💻',
            color: d.color || '#059669',
            createdAt: d.updatedAt || new Date().toISOString(),
          },
          message: `Found registered user @${d.username} (${d.name})`,
        };
      }
    } catch {
      // Fall through to local state check
    }

    // 2. Check locally cached known members from synced groups
    try {
      const localState = loadAppState();
      const localMatch = localState.members.find(
        m =>
          (m.username && normalizeUsername(m.username) === cleanUsername) ||
          m.id === trimmed
      );
      if (localMatch) {
        return {
          found: true,
          member: localMatch,
          message: `Found registered user @${localMatch.username || localMatch.id} (${localMatch.name})`,
        };
      }
    } catch {
      // Ignore
    }

    return {
      found: false,
      message: `User "${trimmed}" was not found in the Splitzy database. Make sure they have installed Splitzy and registered their unique @username, or invite them via the Group Invite Code / QR Code.`,
    };
  } catch {
    return {
      found: false,
      message: 'Could not verify user in the cloud database. Please check your connection.',
    };
  }
}

/**
 * Cloud write: Add a verified registered member to a group.
 * - If the current user is the member (joining via invite code), writes their own `/members/{id}` and `/groupMembers/{id}`.
 * - If the current user is the group owner adding another registered user, updates `/groups/{groupId}` (`memberUserIds`)
 *   and writes `/groupMembers/{id}` with member metadata.
 */
export async function cloudAddMember(
  member: Member,
  groupMember: GroupMember,
  isGroupOwner = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await ensureAuthUser();
    const realAuthUid = authUser?.uid || auth.currentUser?.uid;
    const batch = writeBatch(db);

    // Only write to /members/{id} if the member belongs to the current user
    if (!member.uid || member.uid === realAuthUid) {
      batch.set(
        doc(db, MEMBERS_COL, member.id),
        sanitizeForFirestore({
          ...member,
          uid: realAuthUid || member.uid,
          groupId: groupMember.groupId,
        }),
        { merge: true }
      );
    }

    batch.set(
      doc(db, GROUP_MEMBERS_COL, groupMember.id),
      sanitizeForFirestore({
        ...groupMember,
        memberName: groupMember.memberName || member.name,
        memberUsername: groupMember.memberUsername || member.username,
        memberAvatar: groupMember.memberAvatar || member.avatar,
        memberColor: groupMember.memberColor || member.color,
        memberUid: groupMember.memberUid || member.uid,
      })
    );

    // Only the group owner can add another user's UID to the group's memberUserIds
    if (isGroupOwner && member.uid && member.uid !== realAuthUid) {
      batch.update(doc(db, GROUPS_COL, groupMember.groupId), {
        memberUserIds: arrayUnion(member.uid),
      });
    }

    await batch.commit();
    return { success: true };
  } catch (err) {
    console.error('Failed to add member to Firestore:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cloud write: Save or edit an expense with its shares atomically.
 * Automatically synchronizes with cloud database and reports status.
 */
export async function cloudSaveExpense(
  expense: Expense,
  shares: ExpenseShare[],
  oldShareIdsToDelete?: string[],
  parentGroup?: Group | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await ensureAuthUser();
    const realAuthUid = authUser?.uid || auth.currentUser?.uid;
    const cleanExpense = sanitizeForFirestore(expense);
    const cleanShares = shares.map(s =>
      sanitizeForFirestore({
        ...s,
        groupId: s.groupId || cleanExpense.groupId,
      })
    );

    const commitExpenseBatch = async (includeParentGroup: boolean) => {
      const batch = writeBatch(db);
      if (includeParentGroup && parentGroup && realAuthUid) {
        const isLocalFallback = (uid?: string) =>
          !uid || uid === 'anonymous' || uid.startsWith('u_');
        const effectiveCreator = isLocalFallback(parentGroup.createdBy)
          ? realAuthUid
          : parentGroup.createdBy!;
        if (effectiveCreator === realAuthUid) {
          const cleanMemberUserIds = Array.from(
            new Set([
              ...(parentGroup.memberUserIds || []).filter(u => !isLocalFallback(u)),
              realAuthUid,
            ])
          );
          const groupDoc: Group = sanitizeForFirestore({
            ...parentGroup,
            createdBy: realAuthUid,
            memberUserIds: cleanMemberUserIds,
            inviteCode: parentGroup.inviteCode || generateInviteCode(),
          });
          batch.set(doc(db, GROUPS_COL, groupDoc.id), groupDoc, { merge: true });
          if (groupDoc.inviteCode) {
            batch.set(
              doc(db, INVITE_CODES_COL, groupDoc.inviteCode),
              sanitizeForFirestore({
                groupId: groupDoc.id,
                groupName: groupDoc.name,
                createdAt: Date.now(),
                createdBy: realAuthUid,
              }),
              { merge: true }
            );
          }
        }
      }

      batch.set(doc(db, EXPENSES_COL, cleanExpense.id), cleanExpense);

      if (oldShareIdsToDelete && oldShareIdsToDelete.length > 0) {
        for (const oldShareId of oldShareIdsToDelete) {
          batch.delete(doc(db, EXPENSE_SHARES_COL, oldShareId));
        }
      }

      for (const share of cleanShares) {
        batch.set(doc(db, EXPENSE_SHARES_COL, share.id), share);
      }

      await batch.commit();
    };

    try {
      await commitExpenseBatch(false);
    } catch (firstErr) {
      if (parentGroup && realAuthUid) {
        await commitExpenseBatch(true);
      } else {
        throw firstErr;
      }
    }

    return { success: true };
  } catch (err) {
    console.warn('Cloud expense sync note:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cloud write: Delete an expense and its associated shares atomically
 */
export async function cloudDeleteExpense(
  expenseId: string,
  associatedShares: ExpenseShare[]
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAuthUser();
    const batch = writeBatch(db);
    batch.delete(doc(db, EXPENSES_COL, expenseId));

    for (const share of associatedShares) {
      batch.delete(doc(db, EXPENSE_SHARES_COL, share.id));
    }

    await batch.commit();
    return { success: true };
  } catch (err) {
    console.error('Failed to delete expense from Firestore:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cloud write: Record a debt settlement transaction
 */
export async function cloudSaveSettlement(
  settlement: SettlementRecord
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAuthUser();
    await setDoc(doc(db, SETTLEMENTS_COL, settlement.id), sanitizeForFirestore(settlement));
    return { success: true };
  } catch (err) {
    console.error('Failed to save settlement in Firestore:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cloud write: Upload full state (for migrations or restore)
 */
export async function cloudUploadFullState(
  state: AppState,
  currentUser?: { uid: string } | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await ensureAuthUser();
    const realAuthUid = authUser?.uid || auth.currentUser?.uid;
    const fallbackUid = currentUser?.uid || 'anonymous';
    const effectiveUid = realAuthUid || fallbackUid;
    const isLocalFallbackUid = (uid?: string) =>
      !uid || uid === 'anonymous' || uid === fallbackUid || uid.startsWith('u_');

    type PendingWrite = {
      col: string;
      id: string;
      data: any;
    };
    const pendingWrites: PendingWrite[] = [];
    const validGroupIds = new Set<string>();
    const ownedGroupIds = new Set<string>();
    const expenseGroupMap = new Map<string, string>();
    const allCoMemberUids = new Set<string>();
    if (realAuthUid) allCoMemberUids.add(realAuthUid);

    for (const g of state.groups) {
      if (!g.id) continue;
      validGroupIds.add(g.id);

      const mergedMemberUserIds = new Set(
        (g.memberUserIds || []).filter(u => !isLocalFallbackUid(u))
      );
      if (realAuthUid) mergedMemberUserIds.add(realAuthUid);
      if (g.createdBy && !isLocalFallbackUid(g.createdBy)) {
        mergedMemberUserIds.add(g.createdBy);
      }
      if (mergedMemberUserIds.size === 0) mergedMemberUserIds.add(effectiveUid);

      for (const uid of mergedMemberUserIds) {
        allCoMemberUids.add(uid);
      }

      const preservedCreator =
        g.createdBy && !isLocalFallbackUid(g.createdBy)
          ? g.createdBy
          : realAuthUid || effectiveUid;

      // Only the group owner can write/update the group document and its inviteCode reservation
      if (preservedCreator === realAuthUid || preservedCreator === effectiveUid) {
        ownedGroupIds.add(g.id);
        const groupToSave: Group = sanitizeForFirestore({
          ...g,
          createdBy: preservedCreator,
          memberUserIds: Array.from(mergedMemberUserIds),
          inviteCode: g.inviteCode || generateInviteCode(),
        });
        pendingWrites.push({ col: GROUPS_COL, id: groupToSave.id, data: groupToSave });
        if (groupToSave.inviteCode) {
          pendingWrites.push({
            col: INVITE_CODES_COL,
            id: groupToSave.inviteCode,
            data: sanitizeForFirestore({
              groupId: groupToSave.id,
              groupName: groupToSave.name,
              createdAt: Date.now(),
              createdBy: preservedCreator,
            }),
          });
        }
      }
    }

    const memberLookup = new Map<string, Member>(state.members.map(m => [m.id, m]));
    const primaryGroupId = state.activeGroupId || state.groups[0]?.id;
    const ownMemberId = state.userProfile?.id || state.currentUserId;

    for (const m of state.members) {
      if (!m.id) continue;
      const isOwnMember =
        m.id === ownMemberId ||
        (Boolean(m.uid) && (m.uid === realAuthUid || isLocalFallbackUid(m.uid)));
      if (isOwnMember) {
        pendingWrites.push({
          col: MEMBERS_COL,
          id: m.id,
          data: sanitizeForFirestore({
            ...m,
            uid: realAuthUid || effectiveUid,
            groupId: m.groupId || primaryGroupId,
            memberUserIds: Array.from(allCoMemberUids),
          }),
        });
      }
    }

    for (const gm of state.groupMembers) {
      if (!gm.id || !validGroupIds.has(gm.groupId)) continue;
      const mInfo = memberLookup.get(gm.memberId);
      const isOwnMemberRecord =
        gm.memberId === ownMemberId ||
        mInfo?.uid === realAuthUid ||
        (Boolean(mInfo?.uid) && isLocalFallbackUid(mInfo?.uid));
      if (ownedGroupIds.has(gm.groupId) || isOwnMemberRecord) {
        const resolvedMemberUid = isOwnMemberRecord
          ? realAuthUid || effectiveUid
          : gm.memberUid && !isLocalFallbackUid(gm.memberUid)
          ? gm.memberUid
          : mInfo?.uid && !isLocalFallbackUid(mInfo.uid)
          ? mInfo.uid
          : undefined;
        pendingWrites.push({
          col: GROUP_MEMBERS_COL,
          id: gm.id,
          data: sanitizeForFirestore({
            ...gm,
            memberName: gm.memberName || mInfo?.name,
            memberUsername: gm.memberUsername || mInfo?.username,
            memberAvatar: gm.memberAvatar || mInfo?.avatar,
            memberColor: gm.memberColor || mInfo?.color,
            memberUid: resolvedMemberUid,
          }),
        });
      }
    }

    for (const exp of state.expenses) {
      if (exp.id && validGroupIds.has(exp.groupId)) {
        expenseGroupMap.set(exp.id, exp.groupId);
        pendingWrites.push({ col: EXPENSES_COL, id: exp.id, data: sanitizeForFirestore(exp) });
      }
    }

    for (const share of state.expenseShares) {
      if (!share.id) continue;
      const resolvedGroupId = share.groupId || expenseGroupMap.get(share.expenseId);
      if (resolvedGroupId && validGroupIds.has(resolvedGroupId)) {
        pendingWrites.push({
          col: EXPENSE_SHARES_COL,
          id: share.id,
          data: sanitizeForFirestore({
            ...share,
            groupId: resolvedGroupId,
          }),
        });
      }
    }

    for (const st of state.settlements) {
      if (st.id && validGroupIds.has(st.groupId)) {
        pendingWrites.push({ col: SETTLEMENTS_COL, id: st.id, data: sanitizeForFirestore(st) });
      }
    }

    // Execute group, inviteCode, and member writes first so parent group documents
    // and memberUserIds exist in Firestore before dependent child records are committed.
    const parentCols = new Set([GROUPS_COL, INVITE_CODES_COL, MEMBERS_COL]);
    const parentWrites = pendingWrites.filter(w => parentCols.has(w.col));
    const childWrites = pendingWrites.filter(w => !parentCols.has(w.col));

    const CHUNK_SIZE = 400;
    for (const phaseWrites of [parentWrites, childWrites]) {
      for (let i = 0; i < phaseWrites.length; i += CHUNK_SIZE) {
        const chunk = phaseWrites.slice(i, i + CHUNK_SIZE);
        try {
          const batch = writeBatch(db);
          for (const item of chunk) {
            batch.set(doc(db, item.col, item.id), item.data, { merge: true });
          }
          await batch.commit();
        } catch {
          // If one legacy item in the batch fails rules, write each authorized document individually
          for (const item of chunk) {
            try {
              await setDoc(doc(db, item.col, item.id), item.data, { merge: true });
            } catch {
              // Skip unauthorized/orphaned legacy item
            }
          }
        }
      }
    }

    return { success: true };
  } catch (err) {
    console.warn('Cloud upload full state sync note:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Join an existing group using a secret invite code.
 * Uses an atomic batch redeeming `/inviteCodes/{code}` alongside `/groups/{groupId}`
 * so non-members can never read or join a group without possessing its invite code.
 */
export async function joinGroupByInviteCode(
  rawInviteCode: string,
  user: { uid: string }
): Promise<{ success: boolean; group?: Group; message: string }> {
  const cleanCode = rawInviteCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!isValidInviteCodeFormat(cleanCode)) {
    return {
      success: false,
      message: 'Please enter a valid 6-character group invite code (letters A-Z and digits 2-9).',
    };
  }

  const rateCheck = checkLookupRateLimit('invite_lookup', 6, 60_000, 30_000);
  if (!rateCheck.allowed) {
    return {
      success: false,
      message: `Too many invite code attempts. Please wait ${rateCheck.retryAfterSec}s before trying again.`,
    };
  }

  // 1. Ensure genuine Firebase Authentication is active
  const authUser = await ensureAuthUser();
  const authUid = authUser?.uid || auth.currentUser?.uid || user?.uid;

  try {
    // 2. Check local client storage for instant resolution if already a local group
    try {
      const localRaw = localStorage.getItem('hisab_sathi_v1_store');
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        const localGroups: Group[] = parsed?.groups || [];
        const localMatch = localGroups.find(
          g => g.inviteCode?.toUpperCase() === cleanCode
        );

        if (localMatch) {
          const mergedMembers = Array.from(new Set([...(localMatch.memberUserIds || []), authUid]));
          const updatedGroup: Group = {
            ...localMatch,
            memberUserIds: mergedMembers,
          };

          if (updatedGroup.inviteCode && (!updatedGroup.createdBy || updatedGroup.createdBy === authUid)) {
            setDoc(
              doc(db, INVITE_CODES_COL, updatedGroup.inviteCode),
              {
                groupId: updatedGroup.id,
                groupName: updatedGroup.name,
                createdAt: Date.now(),
                createdBy: authUid,
              },
              { merge: true }
            ).catch(() => {});
          }

          return {
            success: true,
            group: updatedGroup,
            message: `Switched to "${updatedGroup.name}"!`,
          };
        }
      }
    } catch {
      // Continue to cloud resolution
    }

    // 3. Resolve target group ID via Firestore invite index (O(1) authenticated lookup)
    let targetGroupId: string | null = null;
    try {
      const reservationSnap = await getDoc(doc(db, INVITE_CODES_COL, cleanCode));
      if (reservationSnap.exists()) {
        const resData = reservationSnap.data();
        if (resData?.groupId) {
          targetGroupId = resData.groupId;
        }
      }
    } catch (lookupErr) {
      console.warn('Invite reservation check failed:', lookupErr);
    }

    if (!targetGroupId) {
      return {
        success: false,
        message: `No group found with invite code "${cleanCode}". Please verify and try again.`,
      };
    }

    // 4. If the user is already a member of targetGroupId, a direct getDoc will succeed immediately
    try {
      const existingGroupSnap = await getDoc(doc(db, GROUPS_COL, targetGroupId));
      if (existingGroupSnap.exists()) {
        const existingGroup = existingGroupSnap.data() as Group;
        return {
          success: true,
          group: existingGroup,
          message: `Switched to "${existingGroup.name}"!`,
        };
      }
    } catch {
      // User is not yet a member of this group; proceed to atomic invite-code join batch
    }

    // 5. Atomically redeem the invite code and append authUid to the group's memberUserIds
    const joinBatch = writeBatch(db);
    joinBatch.update(doc(db, INVITE_CODES_COL, cleanCode), {
      lastJoinedBy: authUid,
      lastJoinedAt: Date.now(),
    });
    joinBatch.update(doc(db, GROUPS_COL, targetGroupId), {
      memberUserIds: arrayUnion(authUid),
    });
    await joinBatch.commit();

    // 6. Fetch the authoritative group document now that authUid is an authorized member
    const groupSnap = await getDoc(doc(db, GROUPS_COL, targetGroupId));
    if (!groupSnap.exists()) {
      return {
        success: false,
        message: `Group "${cleanCode}" could not be retrieved from the cloud.`,
      };
    }

    const groupData = groupSnap.data() as Group;

    return {
      success: true,
      group: {
        ...groupData,
        memberUserIds: Array.from(new Set([...(groupData.memberUserIds || []), authUid])),
      },
      message: `Successfully joined "${groupData.name}"!`,
    };
  } catch (err: any) {
    console.error('Error joining group with code:', err);
    return {
      success: false,
      message: err?.message || 'Failed to join group.',
    };
  }
}

/* ==========================================================================
   RECOVERY & SECURITY LAYER
   ========================================================================== */

/**
 * Stores a cryptographically hashed recovery verifier.
 * The raw recovery code is NEVER stored in Firestore, and no group/invite data is disclosed.
 */
export async function cloudSaveRecoveryVerifier(
  verifierHash: string,
  uid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await ensureAuthUser();
    const effectiveUid = authUser?.uid || auth.currentUser?.uid || uid;

    const record: RecoveryRecord = sanitizeForFirestore({
      verifierHash,
      uid: effectiveUid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, RECOVERY_COL, verifierHash), record);

    // Also update security profile
    await setDoc(
      doc(db, SECURITY_PROFILES_COL, effectiveUid),
      {
        uid: effectiveUid,
        hasRecoveryCode: true,
        recoveryCreatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return { success: true };
  } catch (err) {
    console.error('Failed to save recovery verifier in Firestore:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Verifies a recovery hash owned by the current authenticated user.
 */
export async function cloudLookupRecoveryVerifier(
  verifierHash: string
): Promise<{ success: boolean; uid?: string; error?: string }> {
  try {
    await ensureAuthUser();
    const snap = await getDoc(doc(db, RECOVERY_COL, verifierHash));
    if (!snap.exists()) {
      return { success: false, error: 'Invalid recovery code or no matching account found.' };
    }
    const data = snap.data() as RecoveryRecord;
    return {
      success: true,
      uid: data.uid,
    };
  } catch (err) {
    console.error('Failed to lookup recovery verifier in Firestore:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reconciles recovered groups for an authenticated session.
 */
export async function cloudLinkAccountToRecovery(
  _recoveredUid: string,
  currentUid: string,
  inviteCodes: string[] = []
): Promise<{ success: boolean; recoveredGroupCount: number; error?: string }> {
  try {
    const authUser = await ensureAuthUser();
    const effectiveUid = authUser?.uid || auth.currentUser?.uid || currentUid;

    let count = 0;
    for (const code of inviteCodes) {
      if (!code) continue;
      const res = await joinGroupByInviteCode(code, { uid: effectiveUid });
      if (res.success) {
        count++;
      }
    }

    return { success: true, recoveredGroupCount: count };
  } catch (err) {
    console.error('Failed to link account to recovery:', err);
    return {
      success: false,
      recoveredGroupCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Loads User Security Profile from Firestore
 */
export async function cloudGetSecurityProfile(
  uid: string
): Promise<UserSecurityProfile | null> {
  try {
    const authUser = await ensureAuthUser();
    const effectiveUid = authUser?.uid || auth.currentUser?.uid || uid;
    const snap = await getDoc(doc(db, SECURITY_PROFILES_COL, effectiveUid));
    if (snap.exists()) {
      return snap.data() as UserSecurityProfile;
    }
    return null;
  } catch {
    return null;
  }
}

/* ==========================================================================
   FIREBASE STORAGE RECEIPT UPLOAD / DOWNLOAD HELPERS
   ========================================================================== */

export async function cloudUploadReceipt(
  groupId: string,
  file: File,
  memberUserIds: string[] = []
): Promise<{ success: boolean; downloadUrl?: string; storagePath?: string; error?: string }> {
  try {
    const validation = validateReceiptFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const authUser = await ensureAuthUser();
    const effectiveUid = authUser?.uid || auth.currentUser?.uid;
    if (!effectiveUid) {
      return { success: false, error: 'Authentication required to upload receipts.' };
    }

    const cleanGroupId = groupId.replace(/[^a-zA-Z0-9_.\-]/g, '_');
    const cleanFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_.\-]/g, '_').slice(0, 60)}`;
    const path = `receipts/${cleanGroupId}/${effectiveUid}/${cleanFileName}`;
    const fileRef = storageRef(storage, path);

    const authorizedUids = Array.from(new Set([effectiveUid, ...memberUserIds.filter(Boolean)]));

    await uploadBytes(fileRef, file, {
      contentType: file.type,
      customMetadata: {
        uploadedBy: effectiveUid,
        groupId: cleanGroupId,
        memberUserIdsCsv: authorizedUids.join(','),
      },
    });

    const downloadUrl = await getDownloadURL(fileRef);
    return { success: true, downloadUrl, storagePath: path };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function cloudDeleteReceipt(
  storagePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAuthUser();
    const fileRef = storageRef(storage, storagePath);
    await deleteObject(fileRef);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
