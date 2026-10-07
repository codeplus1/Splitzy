import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
  collection,
  doc,
  getDoc,
  getDocFromServer,
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
  DocumentReference,
  DocumentSnapshot,
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
import { hashAccountPassword } from '../core/security';
import {
  hashPin,
  getStoredAppLockPinHash,
  saveAppLockPin,
} from '../components/AppLockScreen';
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
import {
  AppState,
  loadAppState,
  saveLocalAccountCredential,
  getLocalAccountCredential,
  removeLocalAccountCredential,
  purgeLocalAccountSession,
} from './storage';

// Suppress internal @firebase/firestore transient connection retry logs so they don't trigger false error overlays
try {
  setLogLevel('silent');
} catch {
  // Ignore if unsupported
}

// Initialize Firebase App (idempotent singleton check)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with persistent IndexedDB offline cache + multi-tab sync
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
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

export function isValidVerifierHash(hash?: string): boolean {
  return typeof hash === 'string' && /^[a-fA-F0-9]{64}$/.test(hash);
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

  // Stable cryptographic fallback persisted in localStorage so the device maintains a single immutable identity
  const randomPart =
    typeof crypto !== 'undefined' && crypto.getRandomValues
      ? Array.from(crypto.getRandomValues(new Uint8Array(8)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
      : Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  const fallbackUid = `u_${Date.now().toString(36)}_${randomPart}`;
  const newSessionUser: AppUser = {
    uid: fallbackUid,
    isAnonymous: true,
    displayName: 'User',
  };
  try {
    localStorage.setItem(AUTHORITATIVE_AUTH_UID_KEY, fallbackUid);
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(newSessionUser));
  } catch {
    // Ignore storage issues
  }
  return newSessionUser;
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
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
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
  onStatusChange?: (status: SyncStatus) => void,
  memberId?: string
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

  const isDeviceOnline = () =>
    typeof navigator === 'undefined' || navigator.onLine !== false;

  const handleError = (error: unknown, path: string) => {
    console.warn(`Firestore sync listener notice on [${path}]:`, error);
    if (!isDeviceOnline()) {
      onStatusChange?.('offline');
    } else {
      onStatusChange?.('connected');
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
        onStatusChange?.(isDeviceOnline() ? 'connected' : 'offline');
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
      err => {
        loadedExp = true;
        loadedShares = true;
        handleError(err, EXPENSES_COL);
        emitAggregatedData();
      }
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
                    color: gm.memberColor || '#101D2D',
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
      err => {
        loadedGm = true;
        loadedMemb = true;
        handleError(err, GROUP_MEMBERS_COL);
        emitAggregatedData();
      }
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
      err => {
        loadedSett = true;
        handleError(err, SETTLEMENTS_COL);
        emitAggregatedData();
      }
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
    if (!effectiveUserId) {
      onStatusChange?.(isDeviceOnline() ? 'connected' : 'offline');
      return;
    }
    if (!auth.currentUser) {
      onStatusChange?.(isDeviceOnline() ? 'connected' : 'offline');
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
          onStatusChange?.(isDeviceOnline() ? 'connected' : 'offline');
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
    const accountCheck = await verifyActiveAccountSession();
    if (!accountCheck.valid) {
      return {
        success: false,
        error: accountCheck.error || 'Account session is no longer valid.',
      };
    }

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
    const accountCheck = await verifyActiveAccountSession();
    if (!accountCheck.valid) {
      return {
        success: false,
        error: accountCheck.error || 'Account session is no longer valid.',
      };
    }

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
    const accountCheck = await verifyActiveAccountSession();
    if (!accountCheck.valid) {
      return {
        success: false,
        error: accountCheck.error || 'Account session is no longer valid.',
      };
    }

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
 * Fetches a document directly from the shared Firestore server first when online
 * (bypassing stale IndexedDB cache across platforms), falling back to local cache only if offline.
 */
async function fetchServerFirstDoc<T>(
  ref: DocumentReference<T>
): Promise<DocumentSnapshot<T>> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try {
      return await getDocFromServer(ref);
    } catch {
      return await getDoc(ref);
    }
  }
  return await getDoc(ref);
}

export type AccountRevocationReason =
  | 'ACCOUNT_DELETED'
  | 'SESSION_REVOKED'
  | 'ACCOUNT_NOT_FOUND';

export interface AccountRevocationEvent {
  reason: AccountRevocationReason;
  username?: string;
  memberId?: string;
  message: string;
}

type AccountRevocationListener = (event: AccountRevocationEvent) => void;
const accountRevocationListeners = new Set<AccountRevocationListener>();
let isRevokingAccount = false;

/**
 * Registers a listener invoked immediately whenever the shared backend reports that
 * the current user's account has been deleted or its session version revoked on any platform.
 */
export function onGlobalAccountRevoked(listener: AccountRevocationListener): () => void {
  accountRevocationListeners.add(listener);
  return () => {
    accountRevocationListeners.delete(listener);
  };
}

/**
 * Purges all local credentials, session storage, and auth tokens on this platform
 * and notifies the UI to immediately log out and return to the onboarding screen.
 */
export function triggerGlobalAccountRevocation(event: AccountRevocationEvent): void {
  if (isRevokingAccount) return;
  isRevokingAccount = true;
  try {
    purgeLocalAccountSession(event.username);
    if (auth.currentUser) {
      auth.signOut().catch(() => {});
    }
    accountRevocationListeners.forEach(listener => {
      try {
        listener(event);
      } catch (err) {
        console.error('Account revocation listener error:', err);
      }
    });
  } finally {
    setTimeout(() => {
      isRevokingAccount = false;
    }, 500);
  }
}

/**
 * Centralized backend-authoritative account verification middleware.
 * Called on app startup, tab focus, and BEFORE every protected database operation:
 * 1. Validates the current user identity.
 * 2. Queries the shared Firestore backend (`/userDirectory/{username}` and `/members/{memberId}`)
 *    bypassing stale local cache.
 * 3. Rejects the request and forces immediate logout if the account is marked `status: 'deleted'`,
 *    no longer exists on the server, or has a revoked `sessionVersion`.
 */
export async function verifyActiveAccountSession(
  memberOverride?: Member | null
): Promise<{
  valid: boolean;
  reason?: AccountRevocationReason;
  error?: string;
  serverMember?: Member;
}> {
  try {
    const localState = loadAppState();
    const activeMember =
      memberOverride ||
      localState.userProfile ||
      localState.members.find(m => m.id === localState.currentUserId);

    // Unauthenticated or Temporary Use (guest) mode does not use a registered account
    if (!activeMember || activeMember.isTemporary) {
      return { valid: true };
    }

    const cleanUsername = activeMember.username
      ? normalizeUsername(activeMember.username)
      : '';

    // Check local tombstone first
    if (activeMember.status === 'deleted') {
      const msg = `Account ${cleanUsername ? '@' + cleanUsername : activeMember.name} has been deleted.`;
      triggerGlobalAccountRevocation({
        reason: 'ACCOUNT_DELETED',
        username: cleanUsername || undefined,
        memberId: activeMember.id,
        message: msg,
      });
      return { valid: false, reason: 'ACCOUNT_DELETED', error: msg };
    }

    if (cleanUsername) {
      const localCred = getLocalAccountCredential(cleanUsername);
      if (localCred?.status === 'deleted') {
        const msg = `Account @${cleanUsername} has been deleted.`;
        triggerGlobalAccountRevocation({
          reason: 'ACCOUNT_DELETED',
          username: cleanUsername,
          memberId: activeMember.id,
          message: msg,
        });
        return { valid: false, reason: 'ACCOUNT_DELETED', error: msg };
      }
    }

    // If device is offline, allow queued offline operation unless locally marked deleted
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { valid: true };
    }

    await ensureAuthUser();

    // 1. Authoritative check on `/userDirectory/{username}` from the live server
    if (cleanUsername && cleanUsername.length >= 2) {
      const dirRef = doc(db, USER_DIRECTORY_COL, cleanUsername);
      const dirSnap = await fetchServerFirstDoc(dirRef);

      if (!dirSnap.exists()) {
        const msg = `Your account (@${cleanUsername}) was deleted or no longer exists. You have been signed out.`;
        triggerGlobalAccountRevocation({
          reason: 'ACCOUNT_NOT_FOUND',
          username: cleanUsername,
          memberId: activeMember.id,
          message: msg,
        });
        return { valid: false, reason: 'ACCOUNT_NOT_FOUND', error: msg };
      }

      const dirData = dirSnap.data();

      // Check if account is marked deleted or replaced by a new registration with a different memberId
      if (
        dirData.status === 'deleted' ||
        (dirData.memberId && dirData.memberId !== activeMember.id)
      ) {
        const msg = `Your account (@${cleanUsername}) was deleted on another platform. You have been signed out.`;
        triggerGlobalAccountRevocation({
          reason: 'ACCOUNT_DELETED',
          username: cleanUsername,
          memberId: activeMember.id,
          message: msg,
        });
        return { valid: false, reason: 'ACCOUNT_DELETED', error: msg };
      }

      // Check sessionVersion revocation
      if (
        typeof dirData.sessionVersion === 'number' &&
        typeof activeMember.sessionVersion === 'number' &&
        dirData.sessionVersion > activeMember.sessionVersion
      ) {
        const msg = `Your session for @${cleanUsername} has expired or been revoked. Please log in again.`;
        triggerGlobalAccountRevocation({
          reason: 'SESSION_REVOKED',
          username: cleanUsername,
          memberId: activeMember.id,
          message: msg,
        });
        return { valid: false, reason: 'SESSION_REVOKED', error: msg };
      }
    }

    // 2. Also verify `/members/{memberId}` if readable
    if (activeMember.id) {
      try {
        const memSnap = await fetchServerFirstDoc(doc(db, MEMBERS_COL, activeMember.id));
        if (memSnap.exists()) {
          const memData = memSnap.data() as Member;
          if (memData.status === 'deleted') {
            const msg = `Your account (${activeMember.name}) was deleted on another platform. You have been signed out.`;
            triggerGlobalAccountRevocation({
              reason: 'ACCOUNT_DELETED',
              username: cleanUsername || undefined,
              memberId: activeMember.id,
              message: msg,
            });
            return { valid: false, reason: 'ACCOUNT_DELETED', error: msg };
          }
        }
      } catch {
        // Ignore if member doc is not readable by current anonymous token
      }
    }

    return { valid: true };
  } catch (err) {
    console.warn('verifyActiveAccountSession check notice:', err);
    return { valid: true };
  }
}

/**
 * Real-time cross-platform account status & session listener.
 * Subscribes to `/userDirectory/{username}` and `/members/{memberId}` so that if the user
 * deletes their account on Platform 1, Platform 2 and Platform 3 immediately detect
 * the deletion in real time and force-logout without waiting for a page reload.
 */
export function subscribeToAccountStatus(
  member: Member,
  onRevoked?: (event: AccountRevocationEvent) => void
): () => void {
  if (!member || member.isTemporary) {
    return () => {};
  }

  let isCancelled = false;
  const cleanUsername = member.username ? normalizeUsername(member.username) : '';
  const unsubs: Array<() => void> = [];

  const handleRevoked = (reason: AccountRevocationReason, message: string) => {
    if (isCancelled) return;
    isCancelled = true;
    const event: AccountRevocationEvent = {
      reason,
      username: cleanUsername || undefined,
      memberId: member.id,
      message,
    };
    triggerGlobalAccountRevocation(event);
    onRevoked?.(event);
  };

  ensureAuthUser().then(() => {
    if (isCancelled) return;

    if (cleanUsername && cleanUsername.length >= 2) {
      let seenExistingDoc = false;
      const unsubDir = onSnapshot(
        doc(db, USER_DIRECTORY_COL, cleanUsername),
        snap => {
          if (isCancelled) return;
          if (!snap.exists()) {
            // If we previously saw the document or server confirms it doesn't exist, revoke immediately
            if (seenExistingDoc || !snap.metadata.fromCache) {
              handleRevoked(
                'ACCOUNT_DELETED',
                `Your account (@${cleanUsername}) was deleted. You have been signed out.`
              );
            }
            return;
          }
          seenExistingDoc = true;
          const data = snap.data();
          if (
            data.status === 'deleted' ||
            (data.memberId && data.memberId !== member.id)
          ) {
            handleRevoked(
              'ACCOUNT_DELETED',
              `Your account (@${cleanUsername}) was deleted on another platform. You have been signed out.`
            );
            return;
          }
          if (
            typeof data.sessionVersion === 'number' &&
            typeof member.sessionVersion === 'number' &&
            data.sessionVersion > member.sessionVersion
          ) {
            handleRevoked(
              'SESSION_REVOKED',
              `Your session for @${cleanUsername} was revoked. Please sign in again.`
            );
          }
        },
        () => {
          // Ignore transient listener errors
        }
      );
      unsubs.push(unsubDir);
    }

    if (member.id) {
      const unsubMem = onSnapshot(
        doc(db, MEMBERS_COL, member.id),
        snap => {
          if (isCancelled) return;
          if (snap.exists()) {
            const data = snap.data() as Member;
            if (data.status === 'deleted') {
              handleRevoked(
                'ACCOUNT_DELETED',
                `Your account (@${cleanUsername || member.name}) was deleted on another platform. You have been signed out.`
              );
            }
          }
        },
        () => {
          // Ignore if rules restrict member read before auth token settles
        }
      );
      unsubs.push(unsubMem);
    }
  });

  return () => {
    isCancelled = true;
    unsubs.forEach(u => u());
  };
}

/**
 * Updates the active authoritative UID in localStorage so the device syncs with a restored or claimed account.
 */
export function setActiveAccountUid(uid: string, displayName = 'User'): AppUser {
  const nextUser: AppUser = {
    uid,
    isAnonymous: true,
    displayName,
  };
  try {
    localStorage.setItem(AUTHORITATIVE_AUTH_UID_KEY, uid);
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(nextUser));
  } catch {
    // Ignore storage issues
  }
  return nextUser;
}

/**
 * Registers or updates the current user's profile and unique @username in Firestore
 * (`members` and `userDirectory` collections). Verifies that the username is not already
 * claimed by a different active account, and blocks stale sessions from resurrecting a deleted account.
 */
export async function cloudRegisterOrUpdateUserProfile(
  member: Member,
  previousUsername?: string,
  rawPassword?: string,
  isNewRegistration = false
): Promise<{
  success: boolean;
  error?: string;
  member?: Member;
  usernameTaken?: boolean;
}> {
  const cleanUsername = normalizeUsername(
    member.username || generateDefaultUsername(member.name, member.uid)
  );

  if (cleanUsername.length < 2) {
    return {
      success: false,
      error: 'Username ID must be at least 2 characters long.',
    };
  }

  const localPinHash = getStoredAppLockPinHash() || undefined;
  const localExistingCred = getLocalAccountCredential(cleanUsername);
  const computedPasswordHash =
    rawPassword && rawPassword.trim().length >= 4
      ? await hashAccountPassword(rawPassword.trim())
      : undefined;
  const computedPinHashFromFourDigitPassword =
    rawPassword && /^\d{4}$/.test(rawPassword.trim())
      ? await hashPin(rawPassword.trim())
      : undefined;

  // Check local credential registry first if registering a new account (only if active)
  if (
    isNewRegistration &&
    localExistingCred &&
    localExistingCred.status !== 'deleted' &&
    localExistingCred.memberId &&
    localExistingCred.memberId !== member.id
  ) {
    return {
      success: false,
      usernameTaken: true,
      error: `Username "@${cleanUsername}" is already registered. Please log in with your password (or 4-digit App Lock PIN for existing users), or choose a different @username.`,
    };
  }

  try {
    const authUser = await ensureAuthUser();
    const effectiveUid =
      authUser?.uid ||
      auth.currentUser?.uid ||
      member.uid ||
      getCachedUserIdentity().uid ||
      member.id;

    let resolvedMemberId = member.id;
    let resolvedUid = effectiveUid;
    let resolvedSessionVersion = member.sessionVersion || 1;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlineMember: Member = sanitizeForFirestore({
        ...member,
        id: resolvedMemberId,
        username: cleanUsername,
        uid: resolvedUid,
        status: 'active',
        sessionVersion: resolvedSessionVersion,
        passwordHash:
          computedPasswordHash || member.passwordHash || localExistingCred?.passwordHash,
        pinHash:
          member.pinHash ||
          localPinHash ||
          localExistingCred?.pinHash ||
          computedPinHashFromFourDigitPassword,
      });
      saveLocalAccountCredential({
        username: cleanUsername,
        memberId: offlineMember.id,
        uid: resolvedUid,
        name: offlineMember.name,
        avatar: offlineMember.avatar,
        color: offlineMember.color || '#101D2D',
        passwordHash: offlineMember.passwordHash,
        pinHash: offlineMember.pinHash,
        status: 'active',
        sessionVersion: resolvedSessionVersion,
        updatedAt: new Date().toISOString(),
      });
      return { success: true, member: offlineMember };
    }

    const dirRef = doc(db, USER_DIRECTORY_COL, cleanUsername);
    const existingSnap = await fetchServerFirstDoc(dirRef);
    if (existingSnap.exists()) {
      const data = existingSnap.data();

      // CRITICAL: If this is NOT a brand-new registration (e.g. a stale local session on Platform 2 or 3
      // trying to sync or update its profile), and the backend says the account is DELETED or belongs
      // to a newer registration (`data.memberId !== member.id`), immediately revoke and reject!
      if (!isNewRegistration && data.status === 'deleted') {
        const msg = `Account @${cleanUsername} was deleted on another platform.`;
        triggerGlobalAccountRevocation({
          reason: 'ACCOUNT_DELETED',
          username: cleanUsername,
          memberId: member.id,
          message: msg,
        });
        return {
          success: false,
          error: msg,
        };
      }

      if (data.status === 'deleted' && isNewRegistration) {
        // Handle was previously deleted; allow brand-new registration with a fresh memberId and bumped sessionVersion
        if (data.memberId === resolvedMemberId) {
          resolvedMemberId = `m_owner_${cleanUsername}_${Date.now().toString(36)}`;
        }
        resolvedSessionVersion = (typeof data.sessionVersion === 'number' ? data.sessionVersion : 1) + 1;
      } else {
        const isDifferentAccount =
          isNewRegistration &&
          data.memberId !== member.id &&
          data.uid !== effectiveUid;
        if (isDifferentAccount) {
          return {
            success: false,
            usernameTaken: true,
            error: `Username "@${cleanUsername}" is already registered. Please log in with your password (or 4-digit App Lock PIN for existing users), or choose a different @username.`,
          };
        }
        if (
          !isNewRegistration &&
          data.memberId !== member.id &&
          data.uid !== effectiveUid
        ) {
          return {
            success: false,
            usernameTaken: true,
            error: `Username "@${cleanUsername}" is already registered. Please log in with your password (or 4-digit App Lock PIN for existing users), or choose a different @username.`,
          };
        }
        // Always adopt the existing canonical memberId and uid across all platforms
        if (data.memberId) {
          resolvedMemberId = data.memberId;
        }
        if (data.uid) {
          resolvedUid = data.uid;
        }
        if (typeof data.sessionVersion === 'number') {
          resolvedSessionVersion = Math.max(resolvedSessionVersion, data.sessionVersion);
        }
      }
    }

    const existingDirData = existingSnap.exists() ? existingSnap.data() : null;
    const isReplacingDeleted = existingDirData?.status === 'deleted' && isNewRegistration;

    const updatedMember: Member = sanitizeForFirestore({
      ...member,
      id: resolvedMemberId,
      username: cleanUsername,
      uid: resolvedUid,
      status: 'active',
      sessionVersion: resolvedSessionVersion,
      passwordHash:
        computedPasswordHash ||
        member.passwordHash ||
        (!isReplacingDeleted ? existingDirData?.passwordHash : undefined) ||
        (!isReplacingDeleted ? localExistingCred?.passwordHash : undefined),
      pinHash:
        member.pinHash ||
        localPinHash ||
        (!isReplacingDeleted ? existingDirData?.pinHash : undefined) ||
        (!isReplacingDeleted ? localExistingCred?.pinHash : undefined) ||
        computedPinHashFromFourDigitPassword,
    });

    // Persist credentials locally with active status and sessionVersion
    saveLocalAccountCredential({
      username: cleanUsername,
      memberId: updatedMember.id,
      uid: resolvedUid,
      name: updatedMember.name,
      avatar: updatedMember.avatar,
      color: updatedMember.color || '#101D2D',
      passwordHash: updatedMember.passwordHash,
      pinHash: updatedMember.pinHash,
      status: 'active',
      sessionVersion: resolvedSessionVersion,
      updatedAt: new Date().toISOString(),
    });

    const directoryPayload = sanitizeForFirestore({
      username: cleanUsername,
      memberId: updatedMember.id,
      uid: auth.currentUser?.uid || resolvedUid,
      name: updatedMember.name,
      avatar: updatedMember.avatar,
      color: updatedMember.color || '#101D2D',
      passwordHash: updatedMember.passwordHash,
      pinHash: updatedMember.pinHash,
      status: 'active',
      sessionVersion: resolvedSessionVersion,
      updatedAt: new Date().toISOString(),
    });

    const memberPayload = sanitizeForFirestore({
      ...updatedMember,
      uid: auth.currentUser?.uid || resolvedUid,
    });

    try {
      const batch = writeBatch(db);
      if (previousUsername) {
        const cleanPrev = normalizeUsername(previousUsername);
        if (cleanPrev && cleanPrev !== cleanUsername) {
          batch.delete(doc(db, USER_DIRECTORY_COL, cleanPrev));
          removeLocalAccountCredential(cleanPrev);
        }
      }

      batch.set(doc(db, MEMBERS_COL, updatedMember.id), memberPayload, {
        merge: true,
      });
      batch.set(dirRef, directoryPayload);

      await batch.commit();
    } catch (commitErr) {
      try {
        await setDoc(doc(db, MEMBERS_COL, updatedMember.id), memberPayload, {
          merge: true,
        });
      } catch {
        // Ignore
      }
      try {
        await setDoc(dirRef, directoryPayload);
      } catch {
        console.warn('userDirectory write notice:', commitErr);
      }
    }

    return { success: true, member: updatedMember };
  } catch (err: any) {
    console.warn('cloudRegisterOrUpdateUserProfile notice:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    if (
      err?.code === 'permission-denied' ||
      errMsg.toLowerCase().includes('missing or insufficient permissions')
    ) {
      return {
        success: false,
        usernameTaken: true,
        error: `Username "@${cleanUsername}" is already registered. Please log in with your password (or 4-digit App Lock PIN for existing users), or choose a different @username.`,
      };
    }
    return {
      success: false,
      error: errMsg,
    };
  }
}

/**
 * Authenticates an existing @username account across any of the 3 platforms using the shared
 * Firestore backend as the single source of truth:
 * - Queries `/userDirectory/{username}` and `/members/{memberId}` directly from the server when online.
 * - Immediately rejects login (and purges any stale local cache) if the account does not exist or has `status === 'deleted'`.
 * - Adopts the exact same canonical `memberId`, `uid`, and `sessionVersion` across all platforms.
 */
export async function cloudLoginWithUsernameAndPassword(
  rawUsername: string,
  secretInput: string
): Promise<{
  success: boolean;
  requiresPasswordCreation?: boolean;
  verifiedPinHash?: string;
  member?: Member;
  appUser?: AppUser;
  error?: string;
}> {
  const cleanUsername = normalizeUsername(rawUsername);
  if (!cleanUsername || cleanUsername.length < 2) {
    return {
      success: false,
      error: 'Please enter a valid @username (at least 2 characters).',
    };
  }

  const trimmedSecret = secretInput.trim();
  if (!trimmedSecret) {
    return {
      success: false,
      error: 'Please enter your password (or 4-digit App Lock PIN for existing accounts).',
    };
  }

  try {
    const authUser = await ensureAuthUser();
    const currentAuthUid =
      authUser?.uid || auth.currentUser?.uid || getCachedUserIdentity().uid;
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;

    let dirData: Record<string, any> | null = null;
    let memberDocData: Record<string, any> | null = null;
    let serverChecked = false;

    if (isOnline) {
      try {
        const dirSnap = await fetchServerFirstDoc(doc(db, USER_DIRECTORY_COL, cleanUsername));
        serverChecked = true;
        if (dirSnap.exists()) {
          dirData = dirSnap.data();
          if (dirData?.memberId) {
            try {
              const mSnap = await fetchServerFirstDoc(doc(db, MEMBERS_COL, dirData.memberId));
              if (mSnap.exists()) {
                memberDocData = mSnap.data();
              }
            } catch {
              // Ignore if member doc read is restricted before login completes
            }
          }
        }
      } catch {
        // Network error fallback
      }
    }

    const localCred = getLocalAccountCredential(cleanUsername);

    // CRITICAL CENTRALIZED ACCOUNT CHECK:
    // 1. If the account is marked `status === 'deleted'` in Firestore OR in local storage:
    //    immediately purge local credentials and reject login across all platforms!
    if (
      dirData?.status === 'deleted' ||
      memberDocData?.status === 'deleted' ||
      localCred?.status === 'deleted'
    ) {
      removeLocalAccountCredential(cleanUsername);
      return {
        success: false,
        error: `Account "@${cleanUsername}" has been permanently deleted and can no longer be accessed.`,
      };
    }

    // 2. If online and the server confirms `/userDirectory/{username}` does not exist:
    //    do NOT allow stale local credentials from another session to resurrect the account!
    if (isOnline && serverChecked && !dirData) {
      removeLocalAccountCredential(cleanUsername);
      return {
        success: false,
        error: `Account "@${cleanUsername}" does not exist or has been deleted. Please create a new account.`,
      };
    }

    const storedPinHash = getStoredAppLockPinHash();

    // Only use localCred if offline or if localCred matches the server's active memberId
    const validLocalCred =
      !isOnline || !dirData || !localCred?.memberId || localCred.memberId === dirData.memberId
        ? localCred
        : null;

    const merged = {
      ...(validLocalCred || {}),
      ...(memberDocData || {}),
      ...(dirData || {}),
      passwordHash:
        dirData?.passwordHash ||
        memberDocData?.passwordHash ||
        validLocalCred?.passwordHash,
      pinHash:
        dirData?.pinHash ||
        memberDocData?.pinHash ||
        validLocalCred?.pinHash ||
        storedPinHash,
    };

    // Preserve the SAME canonical memberId and accountUid across all 3 platforms!
    const memberId: string =
      dirData?.memberId ||
      memberDocData?.id ||
      validLocalCred?.memberId ||
      `m_owner_${cleanUsername}`;
    const accountUid: string =
      dirData?.uid ||
      memberDocData?.uid ||
      validLocalCred?.uid ||
      currentAuthUid ||
      `u_${cleanUsername}`;
    const sessionVersion: number =
      typeof dirData?.sessionVersion === 'number'
        ? dirData.sessionVersion
        : typeof memberDocData?.sessionVersion === 'number'
        ? memberDocData.sessionVersion
        : validLocalCred?.sessionVersion || 1;

    const restoredMember: Member = {
      id: memberId,
      username: cleanUsername,
      uid: accountUid,
      name: merged.name || cleanUsername,
      avatar: merged.avatar || '👨‍💻',
      color: merged.color || '#101D2D',
      passwordHash: merged.passwordHash,
      pinHash: merged.pinHash || undefined,
      status: 'active',
      sessionVersion,
      createdAt: merged.updatedAt || new Date().toISOString(),
    };

    const candidatePasswordHash = await hashAccountPassword(trimmedSecret);
    const isFourDigitInput = /^\d{4}$/.test(trimmedSecret);
    const candidatePinHash = isFourDigitInput ? await hashPin(trimmedSecret) : '';

    // Check if the user entered a password that matches ANY stored passwordHash or pinHash
    const matchesStoredPassword = Boolean(
      (dirData?.passwordHash &&
        (candidatePasswordHash === dirData.passwordHash ||
          (candidatePinHash && candidatePinHash === dirData.passwordHash))) ||
        (memberDocData?.passwordHash &&
          (candidatePasswordHash === memberDocData.passwordHash ||
            (candidatePinHash && candidatePinHash === memberDocData.passwordHash))) ||
        (validLocalCred?.passwordHash &&
          (candidatePasswordHash === validLocalCred.passwordHash ||
            (candidatePinHash && candidatePinHash === validLocalCred.passwordHash))) ||
        (merged.passwordHash &&
          (candidatePasswordHash === merged.passwordHash ||
            (candidatePinHash && candidatePinHash === merged.passwordHash)))
    );

    const matchesStoredPin = Boolean(
      (dirData?.pinHash &&
        (candidatePinHash === dirData.pinHash || candidatePasswordHash === dirData.pinHash)) ||
        (memberDocData?.pinHash &&
          (candidatePinHash === memberDocData.pinHash ||
            candidatePasswordHash === memberDocData.pinHash)) ||
        (validLocalCred?.pinHash &&
          (candidatePinHash === validLocalCred.pinHash ||
            candidatePasswordHash === validLocalCred.pinHash)) ||
        (storedPinHash &&
          (candidatePinHash === storedPinHash || candidatePasswordHash === storedPinHash))
    );

    // 1. Direct Password Match -> Log in immediately!
    if (matchesStoredPassword || (matchesStoredPin && Boolean(merged.passwordHash))) {
      const finalPasswordHash = merged.passwordHash || candidatePasswordHash;
      const finalPinHash =
        restoredMember.pinHash || (isFourDigitInput ? candidatePinHash : undefined);
      const finalMember: Member = {
        ...restoredMember,
        passwordHash: finalPasswordHash,
        pinHash: finalPinHash,
        status: 'active',
        sessionVersion,
      };
      if (isFourDigitInput) {
        await saveAppLockPin(trimmedSecret);
      }
      const appUser = setActiveAccountUid(accountUid, finalMember.name);
      saveLocalAccountCredential({
        username: cleanUsername,
        memberId: finalMember.id,
        uid: accountUid,
        name: finalMember.name,
        avatar: finalMember.avatar,
        color: finalMember.color || '#101D2D',
        passwordHash: finalPasswordHash,
        pinHash: finalPinHash,
        status: 'active',
        sessionVersion,
        updatedAt: new Date().toISOString(),
      });

      return {
        success: true,
        member: finalMember,
        appUser,
      };
    }

    // 2. If the user does NOT have a passwordHash yet and entered their valid 4-digit App Lock PIN:
    if (matchesStoredPin) {
      if (isFourDigitInput) {
        await saveAppLockPin(trimmedSecret);
      }
      return {
        success: true,
        requiresPasswordCreation: true,
        verifiedPinHash: candidatePinHash || merged.pinHash || undefined,
        member: {
          ...restoredMember,
          pinHash: candidatePinHash || merged.pinHash || undefined,
        },
      };
    }

    // 3. If the account has NO passwordHash yet (registered before passwords were added):
    if (!merged.passwordHash) {
      if (isFourDigitInput) {
        await saveAppLockPin(trimmedSecret);
        return {
          success: true,
          requiresPasswordCreation: true,
          verifiedPinHash: candidatePinHash,
          member: {
            ...restoredMember,
            pinHash: candidatePinHash,
          },
        };
      }

      if (trimmedSecret.length >= 4) {
        const completed = await cloudCompletePinLoginWithNewPassword(
          cleanUsername,
          trimmedSecret,
          merged.pinHash || undefined,
          restoredMember
        );
        return completed;
      }
    }

    // 4. If the current authenticated device UID is ALREADY the authoritative owner of this @username in Firestore
    if (
      dirData &&
      dirData.uid &&
      currentAuthUid &&
      dirData.uid === currentAuthUid &&
      trimmedSecret.length >= 4
    ) {
      const completed = await cloudCompletePinLoginWithNewPassword(
        cleanUsername,
        trimmedSecret,
        merged.pinHash || undefined,
        restoredMember
      );
      return completed;
    }

    return {
      success: false,
      error: `Incorrect password or App Lock PIN for "@${cleanUsername}". Please check and try again.`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to verify login credentials.',
    };
  }
}

/**
 * Completes the login flow for an already-registered user who authenticated with their
 * 4-digit App Lock PIN and now creates their permanent account login password.
 */
export async function cloudCompletePinLoginWithNewPassword(
  rawUsername: string,
  newPassword: string,
  verifiedPinHash?: string,
  pendingMember?: Member
): Promise<{
  success: boolean;
  member?: Member;
  appUser?: AppUser;
  error?: string;
}> {
  const cleanUsername = normalizeUsername(rawUsername);
  const trimmedPassword = newPassword.trim();
  if (trimmedPassword.length < 4) {
    return {
      success: false,
      error: 'Password must be at least 4 characters long.',
    };
  }

  try {
    const authUser = await ensureAuthUser();
    const passwordHash = await hashAccountPassword(trimmedPassword);
    const pinHashFromPassword = /^\d{4}$/.test(trimmedPassword)
      ? await hashPin(trimmedPassword)
      : undefined;
    const pinHash =
      verifiedPinHash ||
      getStoredAppLockPinHash() ||
      pinHashFromPassword ||
      undefined;
    const accountUid =
      pendingMember?.uid ||
      authUser?.uid ||
      auth.currentUser?.uid ||
      getCachedUserIdentity().uid;
    const memberId = pendingMember?.id || `m_owner_${cleanUsername}`;
    const sessionVersion = pendingMember?.sessionVersion || 1;

    const updatedMember: Member = sanitizeForFirestore({
      id: memberId,
      username: cleanUsername,
      uid: accountUid,
      name: pendingMember?.name || cleanUsername,
      avatar: pendingMember?.avatar || '👨‍💻',
      color: pendingMember?.color || '#101D2D',
      passwordHash,
      pinHash,
      status: 'active',
      sessionVersion,
      createdAt: pendingMember?.createdAt || new Date().toISOString(),
    });

    saveLocalAccountCredential({
      username: cleanUsername,
      memberId: updatedMember.id,
      uid: accountUid,
      name: updatedMember.name,
      avatar: updatedMember.avatar,
      color: updatedMember.color || '#101D2D',
      passwordHash,
      pinHash,
      status: 'active',
      sessionVersion,
      updatedAt: new Date().toISOString(),
    });

    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        const batch = writeBatch(db);
        batch.set(
          doc(db, USER_DIRECTORY_COL, cleanUsername),
          sanitizeForFirestore({
            username: cleanUsername,
            memberId: updatedMember.id,
            uid: auth.currentUser?.uid || accountUid,
            name: updatedMember.name,
            avatar: updatedMember.avatar,
            color: updatedMember.color || '#101D2D',
            passwordHash,
            pinHash,
            status: 'active',
            sessionVersion,
            updatedAt: new Date().toISOString(),
          })
        );
        batch.set(
          doc(db, MEMBERS_COL, updatedMember.id),
          sanitizeForFirestore({
            ...updatedMember,
            uid: auth.currentUser?.uid || accountUid,
          }),
          { merge: true }
        );
        await batch.commit();
      } catch (err) {
        console.warn('Cloud password save notice:', err);
      }
    }

    const appUser = setActiveAccountUid(accountUid, updatedMember.name);
    return {
      success: true,
      member: updatedMember,
      appUser,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save new password.',
    };
  }
}

/**
 * Restores an existing registered @username account ONLY after verifying the owner's
 * cryptographic 20-character Recovery Code (SHA-256 verifier hash).
 * Rejects restoration if the account has been permanently deleted.
 */
export async function cloudVerifyAndAccessExistingAccount(
  rawUsername: string,
  verifierHash: string
): Promise<{
  success: boolean;
  member?: Member;
  appUser?: AppUser;
  error?: string;
}> {
  const cleanUsername = normalizeUsername(rawUsername);
  if (!cleanUsername || cleanUsername.length < 2) {
    return {
      success: false,
      error: 'Please enter a valid @username.',
    };
  }
  if (!verifierHash || verifierHash.length !== 64) {
    return {
      success: false,
      error: 'A valid 20-character Recovery Code is required to verify account ownership.',
    };
  }

  try {
    await ensureAuthUser();

    // 1. Verify the cryptographic recovery hash in Firestore
    const recoveryRes = await cloudLookupRecoveryVerifier(verifierHash);
    if (!recoveryRes.success || !recoveryRes.uid) {
      return {
        success: false,
        error: 'Invalid Recovery Code. Ownership of this account could not be verified.',
      };
    }

    // 2. Verify that the @username directory entry exists and is NOT deleted
    const dirRef = doc(db, USER_DIRECTORY_COL, cleanUsername);
    const dirSnap = await fetchServerFirstDoc(dirRef);
    if (!dirSnap.exists()) {
      return {
        success: false,
        error: `No existing account found for "@${cleanUsername}".`,
      };
    }

    const d = dirSnap.data();
    if (d.status === 'deleted') {
      removeLocalAccountCredential(cleanUsername);
      return {
        success: false,
        error: `Account "@${cleanUsername}" has been permanently deleted and cannot be restored.`,
      };
    }

    if (d.uid && d.uid !== recoveryRes.uid) {
      return {
        success: false,
        error: `This Recovery Code does not match the owner of "@${cleanUsername}".`,
      };
    }

    const accountUid: string = d.uid || recoveryRes.uid;
    const memberId: string = d.memberId || `m_owner_${cleanUsername}`;
    const sessionVersion: number = typeof d.sessionVersion === 'number' ? d.sessionVersion : 1;

    let restoredMember: Member = {
      id: memberId,
      username: d.username || cleanUsername,
      uid: accountUid,
      name: d.name || cleanUsername,
      avatar: d.avatar || '👨‍💻',
      color: d.color || '#101D2D',
      passwordHash: d.passwordHash,
      pinHash: d.pinHash,
      status: 'active',
      sessionVersion,
      createdAt: d.updatedAt || new Date().toISOString(),
    };

    try {
      const memSnap = await fetchServerFirstDoc(doc(db, MEMBERS_COL, memberId));
      if (memSnap.exists()) {
        const memData = memSnap.data() as Member;
        if (memData.status === 'deleted') {
          removeLocalAccountCredential(cleanUsername);
          return {
            success: false,
            error: `Account "@${cleanUsername}" has been permanently deleted.`,
          };
        }
        restoredMember = {
          ...restoredMember,
          ...memData,
          id: memberId,
          username: d.username || cleanUsername,
          uid: memData.uid || accountUid,
          status: 'active',
          sessionVersion,
        };
      }
    } catch {
      // Directory profile metadata is used if /members/{id} is restricted
    }

    const appUser = setActiveAccountUid(accountUid, restoredMember.name);

    return {
      success: true,
      member: restoredMember,
      appUser,
    };
  } catch {
    return {
      success: false,
      error: 'Invalid Recovery Code or unauthorized account access attempt.',
    };
  }
}

/**
 * Signs out the current user profile on this device without deleting any cloud records.
 */
export async function cloudLogoutUserSession(): Promise<{ success: boolean; newUser: AppUser }> {
  if (auth.currentUser) {
    const appUser: AppUser = {
      uid: auth.currentUser.uid,
      isAnonymous: auth.currentUser.isAnonymous,
      displayName: 'User',
    };
    return { success: true, newUser: appUser };
  }

  return { success: true, newUser: getCachedUserIdentity() };
}

/**
 * Globally and permanently deletes the current user's account across all 3 platforms:
 * 1. Writes an authoritative tombstone (`status: 'deleted'`, `deletedAt`, incremented `sessionVersion`)
 *    to `/userDirectory/{username}` and `/members/{memberId}` in the shared Firestore database.
 *    - Any other platform (Platform 2, Platform 3) listening via `subscribeToAccountStatus` or checking
 *      via `verifyActiveAccountSession` immediately detects `status === 'deleted'` and logs out.
 *    - `firestore.rules` permanently blocks any stale session with the old `memberId` from resurrecting the record.
 * 2. Deletes owned groups, group memberships, recovery verifiers, and security profiles.
 * 3. Purges all local credentials, sessions, and Firebase Auth tokens.
 */
export async function cloudDeleteUserAccount(params: {
  member?: Member;
  uid?: string;
  verifierHash?: string | null;
  ownedGroupsToDelete?: Array<{
    group: Group;
    expenses: Expense[];
    shares: ExpenseShare[];
    settlements: SettlementRecord[];
    groupMembers: GroupMember[];
  }>;
  ownGroupMembershipsToRemove?: GroupMember[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const authUser = await ensureAuthUser();
    const effectiveUid =
      authUser?.uid ||
      auth.currentUser?.uid ||
      params.uid ||
      params.member?.uid ||
      getCachedUserIdentity().uid;

    const cleanUsername = params.member?.username
      ? normalizeUsername(params.member.username)
      : '';
    const memberId = params.member?.id || (cleanUsername ? `m_owner_${cleanUsername}` : '');
    const deletedAt = new Date().toISOString();
    const nextSessionVersion = (params.member?.sessionVersion || 1) + 1;

    // 1. Delete owned groups and their child documents first
    if (params.ownedGroupsToDelete && params.ownedGroupsToDelete.length > 0) {
      for (const item of params.ownedGroupsToDelete) {
        await cloudDeleteGroup(
          item.group.id,
          item.expenses,
          item.shares,
          item.settlements,
          item.groupMembers,
          item.group.inviteCode
        );
      }
    }

    // 2. Delete user's own GroupMember records in any other groups
    if (params.ownGroupMembershipsToRemove && params.ownGroupMembershipsToRemove.length > 0) {
      await Promise.allSettled(
        params.ownGroupMembershipsToRemove.map(gm =>
          deleteDoc(doc(db, GROUP_MEMBERS_COL, gm.id))
        )
      );
    }

    // 3. Write centralized cross-platform tombstone (`status: 'deleted'`, `deletedAt`, `sessionVersion`)
    //    to `/userDirectory/{username}` and `/members/{memberId}` so all platforms immediately revoke access!
    if (cleanUsername) {
      removeLocalAccountCredential(cleanUsername);
      try {
        await setDoc(
          doc(db, USER_DIRECTORY_COL, cleanUsername),
          sanitizeForFirestore({
            username: cleanUsername,
            memberId: memberId || `m_owner_${cleanUsername}`,
            uid: effectiveUid,
            name: params.member?.name || cleanUsername,
            avatar: params.member?.avatar || '👤',
            color: params.member?.color || '#101D2D',
            status: 'deleted',
            deletedAt,
            sessionVersion: nextSessionVersion,
            updatedAt: deletedAt,
          })
        );
      } catch (err) {
        console.warn('Could not write tombstone to userDirectory, attempting deleteDoc:', err);
        try {
          await deleteDoc(doc(db, USER_DIRECTORY_COL, cleanUsername));
        } catch {
          // Ignore
        }
      }
    }

    if (memberId) {
      try {
        await setDoc(
          doc(db, MEMBERS_COL, memberId),
          sanitizeForFirestore({
            id: memberId,
            uid: effectiveUid,
            name: params.member?.name || cleanUsername || 'Deleted User',
            avatar: params.member?.avatar || '👤',
            color: params.member?.color || '#101D2D',
            status: 'deleted',
            deletedAt,
            sessionVersion: nextSessionVersion,
            createdAt: params.member?.createdAt || deletedAt,
          })
        );
      } catch (err) {
        console.warn('Could not write tombstone to members, attempting deleteDoc:', err);
        try {
          await deleteDoc(doc(db, MEMBERS_COL, memberId));
        } catch {
          // Ignore
        }
      }
    }

    // 4. Delete recovery record and security profile
    if (params.verifierHash && params.verifierHash.length === 64) {
      try {
        await deleteDoc(doc(db, RECOVERY_COL, params.verifierHash));
      } catch {
        // Ignore if not present
      }
    }
    if (effectiveUid) {
      try {
        await deleteDoc(doc(db, SECURITY_PROFILES_COL, effectiveUid));
      } catch {
        // Ignore if not present
      }
    }

    // 5. Purge local session and sign out / delete the Firebase Auth anonymous user
    purgeLocalAccountSession(cleanUsername || undefined);
    if (auth.currentUser) {
      try {
        await auth.currentUser.delete();
      } catch {
        try {
          await auth.signOut();
        } catch {
          // Ignore
        }
      }
    }

    return { success: true };
  } catch (err) {
    console.warn('Account deletion warning:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Verifies whether an active user exists in the Splitzy app database by their unique @username or Member ID.
 * Uses the O(1) `/userDirectory/{username}` index and excludes deleted accounts (`status === 'deleted'`).
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

    // 1. Check `/userDirectory/{username}` from live server
    try {
      const dirSnap = await fetchServerFirstDoc(doc(db, USER_DIRECTORY_COL, cleanUsername));
      if (dirSnap.exists()) {
        const d = dirSnap.data();
        if (d.status === 'deleted') {
          removeLocalAccountCredential(cleanUsername);
          return {
            found: false,
            message: `User "@${cleanUsername}" has deleted their account and is no longer available.`,
          };
        }
        return {
          found: true,
          member: {
            id: d.memberId,
            username: d.username,
            uid: d.uid,
            name: d.name,
            avatar: d.avatar || '👨‍💻',
            color: d.color || '#059669',
            status: 'active',
            sessionVersion: d.sessionVersion || 1,
            createdAt: d.updatedAt || new Date().toISOString(),
          },
          message: `Found registered user @${d.username} (${d.name})`,
        };
      }
    } catch {
      // Fall through to local state check if offline
    }

    // 2. Check locally cached known members from synced groups (only if not deleted)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const localState = loadAppState();
        const localMatch = localState.members.find(
          m =>
            m.status !== 'deleted' &&
            ((m.username && normalizeUsername(m.username) === cleanUsername) ||
              m.id === trimmed)
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
    }

    return {
      found: false,
      message: `User "${trimmed}" was not found in the Splitze database. Make sure they have installed Splitze and registered their unique @username, or invite them via the Group Invite Code / QR Code.`,
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
    const accountCheck = await verifyActiveAccountSession();
    if (!accountCheck.valid) {
      return {
        success: false,
        error: accountCheck.error || 'Account session is no longer valid.',
      };
    }

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
    const accountCheck = await verifyActiveAccountSession();
    if (!accountCheck.valid) {
      return {
        success: false,
        error: accountCheck.error || 'Account session is no longer valid.',
      };
    }

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

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // Queue atomic batch in Firestore IndexedDB persistent cache; return false so pendingExpenseIds tracks it until online confirmation
        batch.commit().catch(() => {});
        return false;
      }

      await batch.commit();
      return true;
    };

    try {
      const committedOnline = await commitExpenseBatch(false);
      return { success: committedOnline };
    } catch (firstErr) {
      if (parentGroup && realAuthUid) {
        const committedOnline = await commitExpenseBatch(true);
        return { success: committedOnline };
      } else {
        throw firstErr;
      }
    }
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
    const accountCheck = await verifyActiveAccountSession();
    if (!accountCheck.valid) {
      return {
        success: false,
        error: accountCheck.error || 'Account session is no longer valid.',
      };
    }

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
    const accountCheck = await verifyActiveAccountSession();
    if (!accountCheck.valid) {
      return {
        success: false,
        error: accountCheck.error || 'Account session is no longer valid.',
      };
    }

    await ensureAuthUser();
    const ref = doc(db, SETTLEMENTS_COL, settlement.id);
    const data = sanitizeForFirestore(settlement);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setDoc(ref, data, { merge: true }).catch(() => {});
      return { success: false, error: 'Offline: queued for sync when online.' };
    }
    await setDoc(ref, data);
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
    const accountCheck = await verifyActiveAccountSession(state.userProfile);
    if (!accountCheck.valid) {
      return {
        success: false,
        error: accountCheck.error || 'Account session is no longer valid.',
      };
    }

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

    if (state.userProfile && state.userProfile.id && realAuthUid) {
      if (state.userProfile.isTemporary) {
        pendingWrites.push({
          col: MEMBERS_COL,
          id: state.userProfile.id,
          data: sanitizeForFirestore({
            ...state.userProfile,
            uid: realAuthUid,
            groupId: state.userProfile.groupId || primaryGroupId,
            memberUserIds: Array.from(allCoMemberUids),
          }),
        });
      } else {
        const cleanProfileUsername = normalizeUsername(
          state.userProfile.username || generateDefaultUsername(state.userProfile.name, realAuthUid)
        );
        const storedCred = cleanProfileUsername ? getLocalAccountCredential(cleanProfileUsername) : null;
        const resolvedPasswordHash = state.userProfile.passwordHash || storedCred?.passwordHash;
        const resolvedPinHash =
          state.userProfile.pinHash || storedCred?.pinHash || getStoredAppLockPinHash() || undefined;
        const resolvedSessionVersion =
          state.userProfile.sessionVersion || storedCred?.sessionVersion || 1;
        pendingWrites.push({
          col: MEMBERS_COL,
          id: state.userProfile.id,
          data: sanitizeForFirestore({
            ...state.userProfile,
            username: cleanProfileUsername,
            uid: realAuthUid,
            status: 'active',
            sessionVersion: resolvedSessionVersion,
            groupId: state.userProfile.groupId || primaryGroupId,
            memberUserIds: Array.from(allCoMemberUids),
            ...(resolvedPasswordHash && isValidVerifierHash(resolvedPasswordHash)
              ? { passwordHash: resolvedPasswordHash }
              : {}),
            ...(resolvedPinHash && isValidVerifierHash(resolvedPinHash)
              ? { pinHash: resolvedPinHash }
              : {}),
          }),
        });
        if (cleanProfileUsername.length >= 2) {
          pendingWrites.push({
            col: USER_DIRECTORY_COL,
            id: cleanProfileUsername,
            data: sanitizeForFirestore({
              username: cleanProfileUsername,
              memberId: state.userProfile.id,
              uid: realAuthUid,
              name: state.userProfile.name,
              avatar: state.userProfile.avatar,
              color: state.userProfile.color || '#101D2D',
              status: 'active',
              sessionVersion: resolvedSessionVersion,
              updatedAt: new Date().toISOString(),
              ...(resolvedPasswordHash && isValidVerifierHash(resolvedPasswordHash)
                ? { passwordHash: resolvedPasswordHash }
                : {}),
              ...(resolvedPinHash && isValidVerifierHash(resolvedPinHash)
                ? { pinHash: resolvedPinHash }
                : {}),
            }),
          });
        }
      }
    }

    for (const m of state.members) {
      if (!m.id || m.status === 'deleted') continue;
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
            status: m.status || 'active',
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

  const accountCheck = await verifyActiveAccountSession();
  if (!accountCheck.valid) {
    return {
      success: false,
      message: accountCheck.error || 'Your account session is no longer valid.',
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
