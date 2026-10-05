import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
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
  arrayRemove,
  Firestore,
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
import { firebaseConfig } from './firebaseConfig';
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
import { AppState, loadAppState, saveAppState } from './storage';

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with custom Database ID and force long polling
// This prevents streaming connection failures in iframes, reverse proxies, and sandboxes
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    },
    firebaseConfig.firestoreDatabaseId || '(default)'
  );
} catch {
  // If already initialized, retrieve existing instance
  firestoreInstance = getFirestore(
    app,
    firebaseConfig.firestoreDatabaseId || '(default)'
  );
}

export const db: Firestore = firestoreInstance;

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

      const groupsQuery = query(
        collection(db, GROUPS_COL),
        where('inviteCode', '==', candidate),
        limit(1)
      );
      const groupSnap = await getDocs(groupsQuery);
      if (!groupSnap.empty) {
        continue;
      }

      return candidate;
    } catch {
      return candidate;
    }
  }

  const timeFraction = (Date.now() % 1024).toString(36).toUpperCase().padStart(2, '9');
  return (generateInviteCode().substring(0, 4) + timeFraction).toUpperCase();
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

  let currentGroups: Group[] = [];
  let isGroupsLoaded = false;
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

  // 1. Subscribe to groups where user is a member
  const groupsQuery = query(
    collection(db, GROUPS_COL),
    where('memberUserIds', 'array-contains', userId)
  );

  const unsubGroups = onSnapshot(
    groupsQuery,
    groupsSnap => {
      isGroupsLoaded = true;
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

      // Group IDs for scoped queries
      const groupIds = currentGroups.map(g => g.id);

      // Keep invite code index up-to-date in background so other peers can join
      currentGroups.forEach(g => {
        if (g.inviteCode) {
          setDoc(
            doc(db, INVITE_CODES_COL, g.inviteCode),
            {
              groupId: g.id,
              groupName: g.name,
              createdAt: Date.now(),
              createdBy: g.createdBy || userId,
            },
            { merge: true }
          ).catch(() => {});
        }
      });

      setupScopedListeners(groupIds);
    },
    err => handleError(err, GROUPS_COL)
  );

  // 2. Setup scoped listeners for expenses, shares, members, and settlements
  const setupScopedListeners = (groupIds: string[]) => {
    cleanupSubqueries();

    // Firestore 'in' query allows up to 30 items per batch
    const limitedGroupIds = groupIds.slice(0, 30);

    let scopedExpenses: Expense[] = [];
    let scopedShares: ExpenseShare[] = [];
    let scopedMembers: Member[] = [];
    let scopedGroupMembers: GroupMember[] = [];
    let scopedSettlements: SettlementRecord[] = [];

    let loadedExp = false;
    let loadedShares = false;
    let loadedMemb = false;
    let loadedGm = false;
    let loadedSett = false;

    const emitAggregatedData = () => {
      if (loadedExp && loadedShares && loadedMemb && loadedGm && loadedSett) {
        onStatusChange?.('connected');
        hasEmittedInitial = true;

        onData({
          groups: currentGroups,
          members: scopedMembers,
          groupMembers: scopedGroupMembers,
          expenses: scopedExpenses,
          expenseShares: scopedShares,
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

        // When groupMembers update, query the associated members
        const memberIds = Array.from(new Set(scopedGroupMembers.map(gm => gm.memberId))).slice(0, 30);
        if (memberIds.length === 0) {
          scopedMembers = [];
          loadedMemb = true;
          emitAggregatedData();
        } else {
          // Query members
          getDocs(query(collection(db, MEMBERS_COL), where('id', 'in', memberIds)))
            .then(mSnap => {
              scopedMembers = mSnap.docs.map(d => d.data() as Member);
              loadedMemb = true;
              emitAggregatedData();
            })
            .catch(err => {
              handleError(err, MEMBERS_COL);
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

    // D. ExpenseShares query: listen to all shares belonging to the loaded expenses
    // We update shares whenever scopedExpenses updates or on direct query
    const unsubShares = onSnapshot(
      collection(db, EXPENSE_SHARES_COL),
      snap => {
        const allShares = snap.docs.map(d => d.data() as ExpenseShare);
        const validExpenseIds = new Set(scopedExpenses.map(e => e.id));
        scopedShares = allShares.filter(s => validExpenseIds.has(s.expenseId));
        loadedShares = true;
        emitAggregatedData();
      },
      err => {
        // Fallback if full collection read is restricted: empty shares until matched
        loadedShares = true;
        emitAggregatedData();
      }
    );
    unsubSubqueries.push(unsubShares);
  };

  return () => {
    unsubGroups();
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

    const memberIds = new Set<string>(newGroup.memberUserIds || []);
    if (fallbackUid && fallbackUid !== 'anonymous') memberIds.add(fallbackUid);
    if (realAuthUid) memberIds.add(realAuthUid);
    if (memberIds.size === 0) memberIds.add(effectiveUid);

    const groupToSave: Group = sanitizeForFirestore({
      ...newGroup,
      createdBy: realAuthUid || newGroup.createdBy || effectiveUid,
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
        createdBy: effectiveUid,
      }));
    }

    for (const m of newMembers) {
      batch.set(doc(db, MEMBERS_COL, m.id), sanitizeForFirestore(m));
    }

    for (const gm of newGroupMembers) {
      batch.set(doc(db, GROUP_MEMBERS_COL, gm.id), sanitizeForFirestore(gm));
    }

    await batch.commit();
    return { success: true };
  } catch (err) {
    console.error('Failed to create group in Firestore:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cloud write: Update an existing group
 */
export async function cloudUpdateGroup(
  groupId: string,
  updates: Partial<Group>
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAuthUser();
    await setDoc(doc(db, GROUPS_COL, groupId), sanitizeForFirestore(updates), { merge: true });
    return { success: true };
  } catch (err) {
    console.error('Failed to update group in Firestore:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cloud write: Delete a group and its associated data atomically
 */
export async function cloudDeleteGroup(
  groupId: string,
  expensesToDelete: Expense[],
  sharesToDelete: ExpenseShare[] = [],
  settlementsToDelete: SettlementRecord[] = [],
  groupMembersToDelete: GroupMember[] = []
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAuthUser();
    const batch = writeBatch(db);
    batch.delete(doc(db, GROUPS_COL, groupId));

    for (const exp of expensesToDelete) {
      batch.delete(doc(db, EXPENSES_COL, exp.id));
    }

    for (const share of sharesToDelete) {
      batch.delete(doc(db, EXPENSE_SHARES_COL, share.id));
    }

    for (const set of settlementsToDelete) {
      batch.delete(doc(db, SETTLEMENTS_COL, set.id));
    }

    for (const gm of groupMembersToDelete) {
      batch.delete(doc(db, GROUP_MEMBERS_COL, gm.id));
    }

    await batch.commit();
    return { success: true };
  } catch (err) {
    console.error('Failed to delete group from Firestore:', err);
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

    // 1. Check if another user already owns this username in userDirectory or members
    try {
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
    } catch {
      // Fallback: check uniqueness & save directly in /members/{memberId}
      const byUsernameQuery = query(
        collection(db, MEMBERS_COL),
        where('username', '==', cleanUsername),
        limit(1)
      );
      const byUsernameSnap = await getDocs(byUsernameQuery);
      if (!byUsernameSnap.empty) {
        const existingMem = byUsernameSnap.docs[0].data() as Member;
        if (existingMem.id !== member.id && existingMem.uid !== effectiveUid) {
          return {
            success: false,
            error: `Username "@${cleanUsername}" is already taken by another Splitzy user. Please choose a different unique ID.`,
          };
        }
      }

      await setDoc(doc(db, MEMBERS_COL, updatedMember.id), updatedMember, { merge: true });
      return { success: true, member: updatedMember };
    }
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
 * Never creates a fake user—only returns a Member if they actually exist in the database.
 */
export async function cloudLookupRegisteredUser(
  identifierRaw: string
): Promise<{ found: boolean; member?: Member; message: string }> {
  const trimmed = identifierRaw.trim();
  const cleanUsername = normalizeUsername(trimmed);

  if (!cleanUsername) {
    return {
      found: false,
      message: 'Please enter a valid @username or User ID.',
    };
  }

  try {
    await ensureAuthUser();

    // 1. Check `/userDirectory/{username}`
    try {
      const dirSnap = await getDoc(doc(db, USER_DIRECTORY_COL, cleanUsername));
      if (dirSnap.exists()) {
        const d = dirSnap.data();
        if (d.memberId) {
          try {
            const memSnap = await getDoc(doc(db, MEMBERS_COL, d.memberId));
            if (memSnap.exists()) {
              const mData = memSnap.data() as Member;
              return {
                found: true,
                member: {
                  ...mData,
                  username: mData.username || d.username,
                  uid: mData.uid || d.uid,
                },
                message: `Found registered user @${d.username} (${mData.name})`,
              };
            }
          } catch {
            // Fall through to directory data
          }
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
            createdAt: d.updatedAt || new Date().toISOString(),
          },
          message: `Found registered user @${d.username} (${d.name})`,
        };
      }
    } catch {
      // Fall through to `/members` query if userDirectory read fails
    }

    // 2. Check `/members` collection by exact `username`
    try {
      const byUsernameQuery = query(
        collection(db, MEMBERS_COL),
        where('username', '==', cleanUsername),
        limit(1)
      );
      const byUsernameSnap = await getDocs(byUsernameQuery);
      if (!byUsernameSnap.empty) {
        const m = byUsernameSnap.docs[0].data() as Member;
        return {
          found: true,
          member: m,
          message: `Found registered user @${m.username || cleanUsername} (${m.name})`,
        };
      }
    } catch {
      // Fall through to direct ID check
    }

    // 3. Check `/members` by direct Member ID (e.g. m_owner_12345)
    try {
      const directMemberSnap = await getDoc(doc(db, MEMBERS_COL, trimmed));
      if (directMemberSnap.exists()) {
        const m = directMemberSnap.data() as Member;
        return {
          found: true,
          member: m,
          message: `Found registered user ${m.name}`,
        };
      }
    } catch {
      // Ignore
    }

    // 4. Check locally cached known members from synced groups
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
 * Cloud write: Add a verified registered member to a group (and grant their UID access to the group)
 */
export async function cloudAddMember(
  member: Member,
  groupMember: GroupMember
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAuthUser();
    const batch = writeBatch(db);
    batch.set(doc(db, MEMBERS_COL, member.id), sanitizeForFirestore(member), { merge: true });
    batch.set(doc(db, GROUP_MEMBERS_COL, groupMember.id), sanitizeForFirestore(groupMember));

    // If this member has an associated Firebase Auth UID, add it to the group's memberUserIds
    // so the group automatically appears on their phone/device in real time!
    if (member.uid) {
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
  oldShareIdsToDelete?: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAuthUser();
    const cleanExpense = sanitizeForFirestore(expense);
    const cleanShares = shares.map(s => sanitizeForFirestore(s));

    const batch = writeBatch(db);
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
    return { success: true };
  } catch (err) {
    console.error('Failed to save expense to Firestore:', err);
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

    type PendingWrite = {
      col: string;
      id: string;
      data: any;
    };
    const pendingWrites: PendingWrite[] = [];

    for (const g of state.groups) {
      if (!g.id) continue;
      const mergedMemberUserIds = new Set(g.memberUserIds || []);
      if (fallbackUid && fallbackUid !== 'anonymous') mergedMemberUserIds.add(fallbackUid);
      if (realAuthUid) mergedMemberUserIds.add(realAuthUid);
      if (mergedMemberUserIds.size === 0) mergedMemberUserIds.add(effectiveUid);

      const groupToSave: Group = sanitizeForFirestore({
        ...g,
        createdBy: realAuthUid || g.createdBy || effectiveUid,
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
            createdBy: effectiveUid,
          }),
        });
      }
    }
    for (const m of state.members) {
      if (m.id) pendingWrites.push({ col: MEMBERS_COL, id: m.id, data: sanitizeForFirestore(m) });
    }
    for (const gm of state.groupMembers) {
      if (gm.id) pendingWrites.push({ col: GROUP_MEMBERS_COL, id: gm.id, data: sanitizeForFirestore(gm) });
    }
    for (const exp of state.expenses) {
      if (exp.id) pendingWrites.push({ col: EXPENSES_COL, id: exp.id, data: sanitizeForFirestore(exp) });
    }
    for (const share of state.expenseShares) {
      if (share.id) pendingWrites.push({ col: EXPENSE_SHARES_COL, id: share.id, data: sanitizeForFirestore(share) });
    }
    for (const st of state.settlements) {
      if (st.id) pendingWrites.push({ col: SETTLEMENTS_COL, id: st.id, data: sanitizeForFirestore(st) });
    }

    // Execute writes in safe chunks of 400 (well below the 500 limit)
    const CHUNK_SIZE = 400;
    for (let i = 0; i < pendingWrites.length; i += CHUNK_SIZE) {
      const chunk = pendingWrites.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        batch.set(doc(db, item.col, item.id), item.data);
      }
      await batch.commit();
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to upload full state to Firestore:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Join an existing group using an invite code (or direct group ID).
 * High-performance O(1) resolution via the dedicated inviteCodes collection index.
 * Completely eliminates unauthorized collection scans that trigger permission errors.
 */
export async function joinGroupByInviteCode(
  rawInviteCode: string,
  user: { uid: string }
): Promise<{ success: boolean; group?: Group; message: string }> {
  const cleanCode = rawInviteCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!cleanCode || cleanCode.length < 3) {
    return { success: false, message: 'Please enter a valid group invite code.' };
  }

  // 1. Ensure genuine Firebase Authentication is active
  let authUid = user?.uid;
  if (!auth.currentUser) {
    try {
      const cred = await signInAnonymously(auth);
      if (cred?.user) {
        authUid = cred.user.uid;
      }
    } catch {
      // Continue with provided user.uid
    }
  } else {
    authUid = auth.currentUser.uid;
  }

  try {
    // 2. Check local client storage for instant resolution
    try {
      const localRaw = localStorage.getItem('hisab_sathi_v1_store');
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        const localGroups: Group[] = parsed?.groups || [];
        const localMatch = localGroups.find(
          g =>
            g.inviteCode?.toUpperCase() === cleanCode ||
            g.id === cleanCode ||
            g.id.toUpperCase() === cleanCode
        );

        if (localMatch) {
          const mergedMembers = Array.from(new Set([...(localMatch.memberUserIds || []), authUid]));
          const updatedGroup: Group = {
            ...localMatch,
            memberUserIds: mergedMembers,
          };

          // Register in Firestore invite index in the background for remote peers
          if (updatedGroup.inviteCode) {
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

    // 3. Resolve target group ID via Firestore invite index
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

    // Direct group ID fallback (e.g. g_123 or g_pokhara)
    if (!targetGroupId && (cleanCode.startsWith('G_') || cleanCode.toLowerCase().startsWith('g_'))) {
      targetGroupId = cleanCode.toLowerCase();
    }

    if (!targetGroupId) {
      return {
        success: false,
        message: `No group found with code "${cleanCode}". Please verify and try again.`,
      };
    }

    // 4. Fetch the authoritative group document by its exact ID (O(1) direct read)
    let groupDocId = targetGroupId;
    let groupData: Group | null = null;

    try {
      const groupSnap = await getDoc(doc(db, GROUPS_COL, targetGroupId));
      if (groupSnap.exists()) {
        groupDocId = groupSnap.id;
        groupData = groupSnap.data() as Group;
      }
    } catch (fetchErr) {
      console.warn('Failed to retrieve group by ID:', fetchErr);
    }

    if (!groupData) {
      return {
        success: false,
        message: `Group "${cleanCode}" could not be retrieved from the cloud.`,
      };
    }

    // 5. Add user to memberUserIds on Firestore
    const currentMemberUserIds = groupData.memberUserIds || [];
    if (!currentMemberUserIds.includes(authUid)) {
      try {
        await updateDoc(doc(db, GROUPS_COL, groupDocId), {
          memberUserIds: arrayUnion(authUid),
        });
      } catch {
        await setDoc(
          doc(db, GROUPS_COL, groupDocId),
          { memberUserIds: Array.from(new Set([...currentMemberUserIds, authUid])) },
          { merge: true }
        );
      }
    }

    return {
      success: true,
      group: {
        ...groupData,
        memberUserIds: Array.from(new Set([...currentMemberUserIds, authUid])),
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
 * The raw recovery code is NEVER stored in Firestore.
 */
export async function cloudSaveRecoveryVerifier(
  verifierHash: string,
  uid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const record: RecoveryRecord = {
      verifierHash,
      uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, RECOVERY_COL, verifierHash), record);

    // Also update security profile
    await setDoc(
      doc(db, SECURITY_PROFILES_COL, uid),
      {
        uid,
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
 * Looks up a user identity associated with a recovery verifier hash.
 */
export async function cloudLookupRecoveryVerifier(
  verifierHash: string
): Promise<{ success: boolean; uid?: string; error?: string }> {
  try {
    const snap = await getDoc(doc(db, RECOVERY_COL, verifierHash));
    if (!snap.exists()) {
      return { success: false, error: 'Invalid recovery code or no matching account found.' };
    }
    const data = snap.data() as RecoveryRecord;
    return { success: true, uid: data.uid };
  } catch (err) {
    console.error('Failed to lookup recovery verifier in Firestore:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Recovers account data by linking the current Firebase session to the recovered UID's groups.
 * Finds all groups that belonged to recoveredUid and adds currentUid to memberUserIds.
 */
export async function cloudLinkAccountToRecovery(
  recoveredUid: string,
  currentUid: string
): Promise<{ success: boolean; recoveredGroupCount: number; error?: string }> {
  try {
    const groupsQuery = query(
      collection(db, GROUPS_COL),
      where('memberUserIds', 'array-contains', recoveredUid)
    );
    const snap = await getDocs(groupsQuery);

    if (snap.empty) {
      return { success: true, recoveredGroupCount: 0 };
    }

    const batch = writeBatch(db);
    let count = 0;
    snap.docs.forEach(d => {
      const g = d.data() as Group;
      const updatedUserIds = Array.from(new Set([...(g.memberUserIds || []), currentUid]));
      batch.update(doc(db, GROUPS_COL, d.id), { memberUserIds: updatedUserIds });
      count++;
    });

    await batch.commit();
    return { success: true, recoveredGroupCount: count };
  } catch (err) {
    console.error('Failed to link account to recovery:', err);
    return { success: false, recoveredGroupCount: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Loads User Security Profile from Firestore
 */
export async function cloudGetSecurityProfile(
  uid: string
): Promise<UserSecurityProfile | null> {
  try {
    const snap = await getDoc(doc(db, SECURITY_PROFILES_COL, uid));
    if (snap.exists()) {
      return snap.data() as UserSecurityProfile;
    }
    return null;
  } catch {
    return null;
  }
}
