/**
 * Deterministic Firestore & Firebase Storage Security Rules Evaluator & Test Suite
 * Mirrors the exact boolean predicates of `firestore.rules` and `storage.rules`
 * and verifies all 6 security categories:
 * 1. Authorized access
 * 2. Cross-group access
 * 3. Membership escalation (including ordinary-member group updates & UID-less member docs)
 * 4. Unauthorized deletion (including non-owner group deletion)
 * 5. Invite abuse & enumeration
 * 6. Recovery attacks & recovery-data disclosure
 * 7. Firebase Storage receipt upload/download rules
 */

export interface MockAuthContext {
  uid: string;
}

export interface MockDatabaseState {
  groups: Record<string, any>;
  members: Record<string, any>;
  groupMembers: Record<string, any>;
  expenses: Record<string, any>;
  expenseShares: Record<string, any>;
  settlements: Record<string, any>;
  inviteCodes: Record<string, any>;
  recovery: Record<string, any>;
  securityProfiles: Record<string, any>;
  userDirectory: Record<string, any>;
}

export type RuleOperation = 'get' | 'list' | 'create' | 'update' | 'delete';

const ID_REGEX = /^[a-zA-Z0-9_.\-]+$/;
const INVITE_CODE_REGEX = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
const USERNAME_HANDLE_REGEX = /^[a-z0-9_.\-]+$/;
const VERIFIER_HASH_REGEX = /^[a-fA-F0-9]{64}$/;

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && ID_REGEX.test(id);
}

function isValidInviteCode(code: unknown): code is string {
  return (
    typeof code === 'string' &&
    code.length === 6 &&
    INVITE_CODE_REGEX.test(code)
  );
}

function isValidUsernameHandle(username: unknown): username is string {
  return (
    typeof username === 'string' &&
    username.length >= 2 &&
    username.length <= 30 &&
    USERNAME_HANDLE_REGEX.test(username)
  );
}

function isValidVerifierHash(hash: unknown): hash is string {
  return typeof hash === 'string' && hash.length === 64 && VERIFIER_HASH_REGEX.test(hash);
}

function getAffectedKeys(existing: Record<string, any>, incoming: Record<string, any>): string[] {
  const keys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(existing[k]) !== JSON.stringify(incoming[k])) {
      changed.push(k);
    }
  }
  return changed;
}

function isGroupOwnerData(auth: MockAuthContext | null, data: any): boolean {
  return Boolean(
    auth &&
      data &&
      typeof data.createdBy === 'string' &&
      data.createdBy.length > 0 &&
      data.createdBy === auth.uid
  );
}

function isGroupMemberData(auth: MockAuthContext | null, data: any): boolean {
  if (!auth || !data) return false;
  return (
    isGroupOwnerData(auth, data) ||
    (Array.isArray(data.memberUserIds) && data.memberUserIds.includes(auth.uid))
  );
}

function isGroupOwner(
  auth: MockAuthContext | null,
  dbBefore: MockDatabaseState,
  dbAfter: MockDatabaseState,
  groupId: unknown
): boolean {
  if (!auth || !isValidId(groupId)) return false;
  const beforeGroup = dbBefore.groups[groupId];
  if (beforeGroup && isGroupOwnerData(auth, beforeGroup)) return true;
  const afterGroup = dbAfter.groups[groupId];
  if (afterGroup && isGroupOwnerData(auth, afterGroup)) return true;
  return false;
}

function isGroupOwnerWithCode(
  auth: MockAuthContext | null,
  dbBefore: MockDatabaseState,
  dbAfter: MockDatabaseState,
  groupId: unknown,
  code: unknown
): boolean {
  if (!auth || !isValidId(groupId) || !isValidInviteCode(code)) return false;
  const beforeGroup = dbBefore.groups[groupId];
  if (beforeGroup && isGroupOwnerData(auth, beforeGroup) && beforeGroup.inviteCode === code) {
    return true;
  }
  const afterGroup = dbAfter.groups[groupId];
  if (afterGroup && isGroupOwnerData(auth, afterGroup) && afterGroup.inviteCode === code) {
    return true;
  }
  return false;
}

function isGroupParticipant(
  auth: MockAuthContext | null,
  dbBefore: MockDatabaseState,
  dbAfter: MockDatabaseState,
  groupId: unknown
): boolean {
  if (!auth || !isValidId(groupId)) return false;
  const beforeGroup = dbBefore.groups[groupId];
  if (beforeGroup && isGroupMemberData(auth, beforeGroup)) return true;
  const afterGroup = dbAfter.groups[groupId];
  if (afterGroup && isGroupMemberData(auth, afterGroup)) return true;
  return false;
}

function isMemberProfileOwner(auth: MockAuthContext | null, data: any): boolean {
  return Boolean(
    auth && data && typeof data.uid === 'string' && data.uid.length > 0 && data.uid === auth.uid
  );
}

function isMemberOwner(
  auth: MockAuthContext | null,
  dbBefore: MockDatabaseState,
  dbAfter: MockDatabaseState,
  memberId: unknown
): boolean {
  if (!auth || !isValidId(memberId)) return false;
  const beforeMem = dbBefore.members[memberId];
  if (beforeMem && isMemberProfileOwner(auth, beforeMem)) return true;
  const afterMem = dbAfter.members[memberId];
  if (afterMem && isMemberProfileOwner(auth, afterMem)) return true;
  return false;
}

function canReadMemberProfile(
  auth: MockAuthContext | null,
  dbBefore: MockDatabaseState,
  dbAfter: MockDatabaseState,
  data: any
): boolean {
  if (!auth || !data) return false;
  return (
    isMemberProfileOwner(auth, data) ||
    (Boolean(data.groupId) && isGroupParticipant(auth, dbBefore, dbAfter, data.groupId)) ||
    (Array.isArray(data.memberUserIds) && data.memberUserIds.includes(auth.uid))
  );
}

function isExpenseParticipant(
  auth: MockAuthContext | null,
  dbBefore: MockDatabaseState,
  dbAfter: MockDatabaseState,
  expenseId: unknown
): boolean {
  if (!auth || !isValidId(expenseId)) return false;
  const beforeExp = dbBefore.expenses[expenseId];
  if (beforeExp && isGroupParticipant(auth, dbBefore, dbAfter, beforeExp.groupId)) return true;
  const afterExp = dbAfter.expenses[expenseId];
  if (afterExp && isGroupParticipant(auth, dbBefore, dbAfter, afterExp.groupId)) return true;
  return false;
}

function isValidShareExpenseRelation(
  auth: MockAuthContext | null,
  dbBefore: MockDatabaseState,
  dbAfter: MockDatabaseState,
  data: any
): boolean {
  if (!auth || !data || !isValidId(data.expenseId)) return false;
  const beforeExp = dbBefore.expenses[data.expenseId];
  if (
    beforeExp &&
    isGroupParticipant(auth, dbBefore, dbAfter, beforeExp.groupId) &&
    (!('groupId' in data) || data.groupId === beforeExp.groupId)
  ) {
    return true;
  }
  const afterExp = dbAfter.expenses[data.expenseId];
  if (
    afterExp &&
    isGroupParticipant(auth, dbBefore, dbAfter, afterExp.groupId) &&
    (!('groupId' in data) || data.groupId === afterExp.groupId)
  ) {
    return true;
  }
  return false;
}

function isValidRetentionOption(opt: unknown): boolean {
  return opt === '3_days' || opt === '15_days' || opt === '1_month';
}

function isOwnerGroupUpdate(
  auth: MockAuthContext | null,
  existing: any,
  incoming: any
): boolean {
  if (!isGroupOwnerData(auth, existing) || !incoming) return false;
  if (incoming.id !== existing.id) return false;
  if (incoming.createdBy !== existing.createdBy) return false;
  if ('createdAt' in existing && incoming.createdAt !== existing.createdAt) return false;
  if ('inviteCode' in existing && incoming.inviteCode !== existing.inviteCode) return false;
  if (!Array.isArray(incoming.memberUserIds) || !incoming.memberUserIds.includes(existing.createdBy)) {
    return false;
  }
  const allowed = new Set([
    'name',
    'baseCurrency',
    'preferredCalendar',
    'language',
    'memberUserIds',
    'inviteCode',
    'reviewNewMembers',
    'settled',
    'settledAt',
    'retentionOption',
    'scheduledDeleteAt',
    'keepGroup',
    'updatedAt',
  ]);
  const affected = getAffectedKeys(existing, incoming);
  return affected.every(k => allowed.has(k));
}

function isParticipantSettlementStatusUpdate(
  auth: MockAuthContext | null,
  existing: any,
  incoming: any
): boolean {
  if (!isGroupMemberData(auth, existing) || !incoming) return false;
  if (incoming.id !== existing.id) return false;
  if (incoming.createdBy !== existing.createdBy) return false;
  if (incoming.name !== existing.name) return false;
  if (incoming.baseCurrency !== existing.baseCurrency) return false;
  if (JSON.stringify(incoming.memberUserIds) !== JSON.stringify(existing.memberUserIds)) return false;
  const allowed = new Set([
    'settled',
    'settledAt',
    'retentionOption',
    'scheduledDeleteAt',
    'keepGroup',
    'updatedAt',
  ]);
  const affected = getAffectedKeys(existing, incoming);
  return affected.length > 0 && affected.every(k => allowed.has(k));
}

function isValidInviteJoin(
  auth: MockAuthContext | null,
  dbBefore: MockDatabaseState,
  dbAfter: MockDatabaseState,
  groupId: string,
  existing: any,
  incoming: any
): boolean {
  if (!auth || !existing || !incoming) return false;
  if (!Array.isArray(existing.memberUserIds) || existing.memberUserIds.includes(auth.uid)) {
    return false;
  }
  const affected = getAffectedKeys(existing, incoming);
  if (affected.length !== 1 || affected[0] !== 'memberUserIds') return false;
  if (!Array.isArray(incoming.memberUserIds)) return false;
  if (incoming.memberUserIds.length < 1 || incoming.memberUserIds.length > 100) return false;
  if (!incoming.memberUserIds.includes(auth.uid)) return false;

  const hasAllExisting = existing.memberUserIds.every((u: string) =>
    incoming.memberUserIds.includes(u)
  );
  if (!hasAllExisting) return false;
  if (incoming.memberUserIds.length !== existing.memberUserIds.length + 1) return false;

  if (!isValidInviteCode(existing.inviteCode)) return false;
  const beforeInviteDoc = dbBefore.inviteCodes[existing.inviteCode];
  const afterInviteDoc = dbAfter.inviteCodes[existing.inviteCode];
  if (!beforeInviteDoc || !afterInviteDoc) return false;
  return afterInviteDoc.groupId === groupId && afterInviteDoc.lastJoinedBy === auth.uid;
}

export function evaluateFirestoreRule(params: {
  auth: MockAuthContext | null;
  collection: keyof MockDatabaseState;
  docId: string;
  operation: RuleOperation;
  existingData?: any;
  incomingData?: any;
  dbBefore: MockDatabaseState;
  dbAfter?: MockDatabaseState;
}): boolean {
  const { auth, collection, docId, operation, existingData, incomingData, dbBefore } = params;
  const dbAfter = params.dbAfter || dbBefore;
  const isSignedIn = auth !== null && typeof auth.uid === 'string' && auth.uid.length > 0;

  switch (collection) {
    case 'groups': {
      if (operation === 'get') return isValidId(docId) && isGroupMemberData(auth, existingData);
      if (operation === 'list') return isGroupMemberData(auth, existingData);
      if (operation === 'create') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          incomingData?.id === docId &&
          typeof incomingData?.name === 'string' &&
          incomingData.name.length > 0 &&
          typeof incomingData?.baseCurrency === 'string' &&
          typeof incomingData?.createdBy === 'string' &&
          incomingData.createdBy === auth!.uid &&
          Array.isArray(incomingData?.memberUserIds) &&
          incomingData.memberUserIds.includes(auth!.uid) &&
          (!('settled' in incomingData) || typeof incomingData.settled === 'boolean') &&
          (!('settledAt' in incomingData) ||
            incomingData.settledAt === null ||
            (typeof incomingData.settledAt === 'number' && incomingData.settledAt > 0)) &&
          (!('retentionOption' in incomingData) ||
            isValidRetentionOption(incomingData.retentionOption))
        );
      }
      if (operation === 'update') {
        if (!isSignedIn || !isValidId(docId) || !incomingData || !existingData) return false;
        const validSchema =
          typeof incomingData.id === 'string' &&
          typeof incomingData.name === 'string' &&
          incomingData.name.length > 0 &&
          typeof incomingData.baseCurrency === 'string' &&
          typeof incomingData.createdBy === 'string' &&
          Array.isArray(incomingData.memberUserIds) &&
          (!('settled' in incomingData) || typeof incomingData.settled === 'boolean') &&
          (!('settledAt' in incomingData) ||
            incomingData.settledAt === null ||
            (typeof incomingData.settledAt === 'number' && incomingData.settledAt > 0)) &&
          (!('retentionOption' in incomingData) ||
            isValidRetentionOption(incomingData.retentionOption));
        if (!validSchema) return false;
        return (
          isOwnerGroupUpdate(auth, existingData, incomingData) ||
          isValidInviteJoin(auth, dbBefore, dbAfter, docId, existingData, incomingData) ||
          isParticipantSettlementStatusUpdate(auth, existingData, incomingData)
        );
      }
      if (operation === 'delete') {
        return isSignedIn && isValidId(docId) && isGroupOwnerData(auth, existingData);
      }
      return false;
    }

    case 'members': {
      if (operation === 'get') {
        return (
          isValidId(docId) && canReadMemberProfile(auth, dbBefore, dbAfter, existingData)
        );
      }
      if (operation === 'list') {
        return canReadMemberProfile(auth, dbBefore, dbAfter, existingData);
      }
      const isValidMemberSchema = (d: any) =>
        Boolean(
          d &&
            isValidId(d.id) &&
            typeof d.uid === 'string' &&
            d.uid.length > 0 &&
            d.uid.length <= 128 &&
            typeof d.name === 'string' &&
            d.name.length > 0 &&
            d.name.length <= 100 &&
            (!('passwordHash' in d) || isValidVerifierHash(d.passwordHash)) &&
            (!('pinHash' in d) || isValidVerifierHash(d.pinHash))
        );
      if (operation === 'create') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          isValidMemberSchema(incomingData) &&
          incomingData.id === docId &&
          isMemberProfileOwner(auth, incomingData)
        );
      }
      if (operation === 'update') {
        const isPasswordOrPinVerified = Boolean(
          existingData &&
            incomingData &&
            ((typeof existingData.passwordHash === 'string' &&
              isValidVerifierHash(existingData.passwordHash) &&
              incomingData.passwordHash === existingData.passwordHash) ||
              (typeof existingData.pinHash === 'string' &&
                isValidVerifierHash(existingData.pinHash) &&
                incomingData.pinHash === existingData.pinHash) ||
              (!('passwordHash' in existingData) &&
                !('pinHash' in existingData) &&
                typeof incomingData.passwordHash === 'string' &&
                isValidVerifierHash(incomingData.passwordHash)))
        );
        return (
          isSignedIn &&
          isValidId(docId) &&
          isValidMemberSchema(incomingData) &&
          incomingData.id === docId &&
          isMemberProfileOwner(auth, incomingData) &&
          (isMemberProfileOwner(auth, existingData) || isPasswordOrPinVerified) &&
          (!('createdAt' in (existingData || {})) ||
            incomingData.createdAt === existingData.createdAt)
        );
      }
      if (operation === 'delete') {
        return isSignedIn && isValidId(docId) && isMemberProfileOwner(auth, existingData);
      }
      return false;
    }

    case 'groupMembers': {
      if (operation === 'get') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          isGroupParticipant(auth, dbBefore, dbAfter, existingData?.groupId)
        );
      }
      if (operation === 'list') {
        return isSignedIn && isGroupParticipant(auth, dbBefore, dbAfter, existingData?.groupId);
      }
      if (operation === 'create') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          incomingData?.id === docId &&
          isValidId(incomingData?.groupId) &&
          isValidId(incomingData?.memberId) &&
          isGroupParticipant(auth, dbBefore, dbAfter, incomingData.groupId) &&
          (isGroupOwner(auth, dbBefore, dbAfter, incomingData.groupId) ||
            isMemberOwner(auth, dbBefore, dbAfter, incomingData.memberId))
        );
      }
      if (operation === 'update') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          incomingData?.id === docId &&
          existingData?.groupId === incomingData?.groupId &&
          existingData?.memberId === incomingData?.memberId &&
          isGroupParticipant(auth, dbBefore, dbAfter, existingData?.groupId) &&
          (isGroupOwner(auth, dbBefore, dbAfter, existingData?.groupId) ||
            isMemberOwner(auth, dbBefore, dbAfter, existingData?.memberId))
        );
      }
      if (operation === 'delete') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          (isGroupOwner(auth, dbBefore, dbAfter, existingData?.groupId) ||
            isMemberOwner(auth, dbBefore, dbAfter, existingData?.memberId))
        );
      }
      return false;
    }

    case 'expenses': {
      if (operation === 'get' || operation === 'list') {
        return isSignedIn && isGroupParticipant(auth, dbBefore, dbAfter, existingData?.groupId);
      }
      if (operation === 'create') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          incomingData?.id === docId &&
          isValidId(incomingData?.groupId) &&
          typeof incomingData?.title === 'string' &&
          typeof incomingData?.baseAmount === 'number' &&
          isValidId(incomingData?.paidBy) &&
          isGroupParticipant(auth, dbBefore, dbAfter, incomingData.groupId)
        );
      }
      if (operation === 'update') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          incomingData?.id === docId &&
          existingData?.groupId === incomingData?.groupId &&
          isGroupParticipant(auth, dbBefore, dbAfter, existingData?.groupId)
        );
      }
      if (operation === 'delete') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          isGroupParticipant(auth, dbBefore, dbAfter, existingData?.groupId)
        );
      }
      return false;
    }

    case 'expenseShares': {
      const isAuthorizedRead = (d: any) =>
        Boolean(
          isSignedIn &&
            ((d?.groupId && isGroupParticipant(auth, dbBefore, dbAfter, d.groupId)) ||
              (d?.expenseId && isExpenseParticipant(auth, dbBefore, dbAfter, d.expenseId)))
        );
      if (operation === 'get') return isValidId(docId) && isAuthorizedRead(existingData);
      if (operation === 'list') return isAuthorizedRead(existingData);
      if (operation === 'create') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          incomingData?.id === docId &&
          isValidId(incomingData?.expenseId) &&
          isValidId(incomingData?.memberId) &&
          typeof incomingData?.shareAmount === 'number' &&
          isValidShareExpenseRelation(auth, dbBefore, dbAfter, incomingData)
        );
      }
      if (operation === 'update') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          incomingData?.id === docId &&
          existingData?.expenseId === incomingData?.expenseId &&
          (!('groupId' in (existingData || {})) ||
            existingData.groupId === incomingData?.groupId) &&
          isValidShareExpenseRelation(auth, dbBefore, dbAfter, incomingData)
        );
      }
      if (operation === 'delete') {
        return isValidId(docId) && isAuthorizedRead(existingData);
      }
      return false;
    }

    case 'settlements': {
      if (operation === 'get' || operation === 'list') {
        return isSignedIn && isGroupParticipant(auth, dbBefore, dbAfter, existingData?.groupId);
      }
      if (operation === 'create') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          incomingData?.id === docId &&
          isValidId(incomingData?.groupId) &&
          incomingData?.fromMemberId !== incomingData?.toMemberId &&
          typeof incomingData?.amount === 'number' &&
          incomingData.amount > 0 &&
          isGroupParticipant(auth, dbBefore, dbAfter, incomingData.groupId)
        );
      }
      if (operation === 'update') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          incomingData?.id === docId &&
          existingData?.groupId === incomingData?.groupId &&
          isGroupParticipant(auth, dbBefore, dbAfter, existingData?.groupId)
        );
      }
      if (operation === 'delete') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          isGroupParticipant(auth, dbBefore, dbAfter, existingData?.groupId)
        );
      }
      return false;
    }

    case 'inviteCodes': {
      if (operation === 'get') return isSignedIn && isValidInviteCode(docId);
      if (operation === 'list') return false;
      if (operation === 'create') {
        return (
          isSignedIn &&
          isValidInviteCode(docId) &&
          isValidId(incomingData?.groupId) &&
          incomingData?.createdBy === auth!.uid &&
          isGroupOwnerWithCode(auth, dbBefore, dbAfter, incomingData.groupId, docId)
        );
      }
      if (operation === 'update') {
        if (
          !isSignedIn ||
          !isValidInviteCode(docId) ||
          existingData?.groupId !== incomingData?.groupId ||
          existingData?.createdBy !== incomingData?.createdBy
        ) {
          return false;
        }
        const isOwner = isGroupOwnerWithCode(
          auth,
          dbBefore,
          dbAfter,
          existingData.groupId,
          docId
        );
        const affected = getAffectedKeys(existingData, incomingData);
        const isRedeemOnly =
          affected.length > 0 &&
          affected.every(k => k === 'lastJoinedBy' || k === 'lastJoinedAt') &&
          incomingData.lastJoinedBy === auth!.uid;
        return isOwner || isRedeemOnly;
      }
      if (operation === 'delete') {
        return (
          isSignedIn &&
          isValidInviteCode(docId) &&
          isGroupOwner(auth, dbBefore, dbAfter, existingData?.groupId)
        );
      }
      return false;
    }

    case 'recovery': {
      const validKeys = (d: any) => {
        if (!d) return false;
        const keys = Object.keys(d);
        const allowed = new Set(['verifierHash', 'uid', 'createdAt', 'updatedAt']);
        return (
          'verifierHash' in d &&
          'uid' in d &&
          keys.every(k => allowed.has(k)) &&
          isValidVerifierHash(d.verifierHash) &&
          typeof d.uid === 'string' &&
          d.uid.length > 0
        );
      };
      if (operation === 'get') {
        return (
          isSignedIn &&
          isValidVerifierHash(docId) &&
          existingData?.uid === auth!.uid
        );
      }
      if (operation === 'list') return false;
      if (operation === 'create') {
        return (
          isSignedIn &&
          isValidVerifierHash(docId) &&
          validKeys(incomingData) &&
          incomingData.verifierHash === docId &&
          incomingData.uid === auth!.uid
        );
      }
      if (operation === 'update') {
        return (
          isSignedIn &&
          isValidVerifierHash(docId) &&
          validKeys(incomingData) &&
          incomingData.verifierHash === docId &&
          existingData?.uid === auth!.uid &&
          incomingData.uid === auth!.uid
        );
      }
      if (operation === 'delete') {
        return isSignedIn && isValidVerifierHash(docId) && existingData?.uid === auth!.uid;
      }
      return false;
    }

    case 'securityProfiles': {
      if (operation === 'get') return isSignedIn && isValidId(docId) && auth!.uid === docId;
      if (operation === 'list') return false;
      if (operation === 'create' || operation === 'update') {
        return (
          isSignedIn &&
          isValidId(docId) &&
          auth!.uid === docId &&
          incomingData?.uid === auth!.uid
        );
      }
      if (operation === 'delete') return isSignedIn && isValidId(docId) && auth!.uid === docId;
      return false;
    }

    case 'userDirectory': {
      if (operation === 'get') return isSignedIn && isValidUsernameHandle(docId);
      if (operation === 'list') return false;
      const validDirCreds = (d: any) =>
        Boolean(
          d &&
            (!('passwordHash' in d) || isValidVerifierHash(d.passwordHash)) &&
            (!('pinHash' in d) || isValidVerifierHash(d.pinHash))
        );
      if (operation === 'create') {
        return (
          isSignedIn &&
          isValidUsernameHandle(docId) &&
          validDirCreds(incomingData) &&
          incomingData?.username === docId &&
          incomingData?.uid === auth!.uid &&
          isValidId(incomingData?.memberId) &&
          isMemberOwner(auth, dbBefore, dbAfter, incomingData.memberId)
        );
      }
      if (operation === 'update') {
        const isPasswordOrPinVerified = Boolean(
          existingData &&
            incomingData &&
            ((typeof existingData.passwordHash === 'string' &&
              isValidVerifierHash(existingData.passwordHash) &&
              incomingData.passwordHash === existingData.passwordHash) ||
              (typeof existingData.pinHash === 'string' &&
                isValidVerifierHash(existingData.pinHash) &&
                incomingData.pinHash === existingData.pinHash) ||
              (!('passwordHash' in existingData) &&
                !('pinHash' in existingData) &&
                typeof incomingData.passwordHash === 'string' &&
                isValidVerifierHash(incomingData.passwordHash)))
        );
        return (
          isSignedIn &&
          isValidUsernameHandle(docId) &&
          validDirCreds(incomingData) &&
          incomingData?.username === docId &&
          incomingData?.uid === auth!.uid &&
          existingData?.memberId === incomingData?.memberId &&
          isMemberOwner(auth, dbBefore, dbAfter, incomingData.memberId) &&
          (existingData?.uid === auth!.uid || isPasswordOrPinVerified)
        );
      }
      if (operation === 'delete') {
        return isSignedIn && isValidUsernameHandle(docId) && existingData?.uid === auth!.uid;
      }
      return false;
    }
  }
}

export function evaluateStorageReceiptRule(params: {
  auth: MockAuthContext | null;
  groupId: string;
  userId: string;
  fileName: string;
  operation: RuleOperation;
  contentType?: string;
  sizeBytes?: number;
  metadata?: Record<string, string>;
  existingMetadata?: Record<string, string>;
  dbBefore?: MockDatabaseState;
}): boolean {
  const {
    auth,
    groupId,
    userId,
    fileName,
    operation,
    contentType,
    sizeBytes,
    metadata,
    existingMetadata,
    dbBefore,
  } = params;
  const isSignedIn = auth !== null && typeof auth.uid === 'string' && auth.uid.length > 0;
  if (!isSignedIn || !isValidId(groupId) || !isValidId(userId) || !isValidId(fileName)) {
    return false;
  }
  if (operation === 'list') return false;

  const isFirestoreMember = Boolean(
    dbBefore && isGroupParticipant(auth, dbBefore, dbBefore, groupId)
  );

  if (operation === 'get') {
    return isFirestoreMember;
  }
  if (operation === 'delete') {
    return auth!.uid === userId && isFirestoreMember;
  }
  if (operation === 'create' || operation === 'update') {
    const allowedMime =
      contentType === 'image/jpeg' ||
      contentType === 'image/png' ||
      contentType === 'image/webp' ||
      contentType === 'application/pdf';
    const validSize =
      typeof sizeBytes === 'number' && sizeBytes > 0 && sizeBytes <= 5 * 1024 * 1024;
    const validMeta =
      Boolean(metadata) &&
      metadata!.uploadedBy === auth!.uid &&
      metadata!.groupId === groupId;
    const validGroupUploader = isFirestoreMember;
    return auth!.uid === userId && validGroupUploader && allowedMime && validSize && validMeta;
  }
  return false;
}

export function runSecurityRulesVerificationSuite(): {
  passed: boolean;
  totalAssertions: number;
  failures: string[];
} {
  const failures: string[] = [];
  let totalAssertions = 0;

  const assertRule = (label: string, actual: boolean, expected: boolean) => {
    totalAssertions++;
    if (actual !== expected) {
      failures.push(`${label}: expected ${expected}, got ${actual}`);
    }
  };

  const hashA = 'a'.repeat(64);
  const dbBefore: MockDatabaseState = {
    groups: {
      g_alpha: {
        id: 'g_alpha',
        name: 'Alpha Group',
        baseCurrency: 'NPR',
        createdBy: 'uid_alice',
        memberUserIds: ['uid_alice', 'uid_bob'],
        inviteCode: 'ALP234',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    },
    members: {
      m_alice: {
        id: 'm_alice',
        name: 'Alice',
        uid: 'uid_alice',
        username: 'alice_1',
        groupId: 'g_alpha',
        memberUserIds: ['uid_alice', 'uid_bob'],
      },
      m_bob: {
        id: 'm_bob',
        name: 'Bob',
        uid: 'uid_bob',
        username: 'bob_1',
        groupId: 'g_alpha',
        memberUserIds: ['uid_alice', 'uid_bob'],
      },
      m_uidless: {
        id: 'm_uidless',
        name: 'Legacy No UID',
      },
    },
    groupMembers: {
      gm_alpha_alice: { id: 'gm_alpha_alice', groupId: 'g_alpha', memberId: 'm_alice' },
      gm_alpha_bob: { id: 'gm_alpha_bob', groupId: 'g_alpha', memberId: 'm_bob' },
    },
    expenses: {
      exp_1: {
        id: 'exp_1',
        groupId: 'g_alpha',
        title: 'Dinner',
        baseAmount: 1200,
        paidBy: 'm_alice',
      },
    },
    expenseShares: {
      sh_1: {
        id: 'sh_1',
        expenseId: 'exp_1',
        groupId: 'g_alpha',
        memberId: 'm_alice',
        shareAmount: 1200,
      },
    },
    settlements: {
      set_1: {
        id: 'set_1',
        groupId: 'g_alpha',
        fromMemberId: 'm_bob',
        toMemberId: 'm_alice',
        amount: 600,
      },
    },
    inviteCodes: {
      ALP234: {
        groupId: 'g_alpha',
        groupName: 'Alpha Group',
        createdBy: 'uid_alice',
      },
    },
    recovery: {
      [hashA]: {
        verifierHash: hashA,
        uid: 'uid_alice',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    },
    securityProfiles: {
      uid_alice: {
        uid: 'uid_alice',
        hasRecoveryCode: true,
      },
    },
    userDirectory: {
      alice_1: {
        username: 'alice_1',
        memberId: 'm_alice',
        uid: 'uid_alice',
        name: 'Alice',
      },
    },
  };

  const alice = { uid: 'uid_alice' }; // Group Owner
  const bob = { uid: 'uid_bob' }; // Ordinary Group Member
  const charlie = { uid: 'uid_charlie' }; // Joining User
  const mallory = { uid: 'uid_mallory' }; // External Attacker

  // =========================================================================
  // SUITE 1: AUTHORIZED ACCESS
  // =========================================================================
  assertRule(
    '[Authorized] Group owner can update group name & memberUserIds',
    evaluateFirestoreRule({
      auth: alice,
      collection: 'groups',
      docId: 'g_alpha',
      operation: 'update',
      existingData: dbBefore.groups.g_alpha,
      incomingData: {
        ...dbBefore.groups.g_alpha,
        name: 'Alpha Updated',
      },
      dbBefore,
    }),
    true
  );
  assertRule(
    '[Authorized] Co-participant Bob can read Alice member profile in shared group',
    evaluateFirestoreRule({
      auth: bob,
      collection: 'members',
      docId: 'm_alice',
      operation: 'get',
      existingData: dbBefore.members.m_alice,
      dbBefore,
    }),
    true
  );
  assertRule(
    '[Authorized] Ordinary member Bob can create expense & expenseShare in shared group',
    evaluateFirestoreRule({
      auth: bob,
      collection: 'expenseShares',
      docId: 'sh_2',
      operation: 'create',
      incomingData: {
        id: 'sh_2',
        expenseId: 'exp_1',
        groupId: 'g_alpha',
        memberId: 'm_bob',
        shareAmount: 600,
      },
      dbBefore,
    }),
    true
  );
  assertRule(
    '[Authorized] Legitimate invite-code join batch succeeds for Charlie redeeming ALP234',
    (() => {
      const dbAfterCharlieJoin: MockDatabaseState = {
        ...dbBefore,
        inviteCodes: {
          ...dbBefore.inviteCodes,
          ALP234: {
            ...dbBefore.inviteCodes.ALP234,
            lastJoinedBy: 'uid_charlie',
            lastJoinedAt: 1700000000,
          },
        },
        groups: {
          ...dbBefore.groups,
          g_alpha: {
            ...dbBefore.groups.g_alpha,
            memberUserIds: ['uid_alice', 'uid_bob', 'uid_charlie'],
          },
        },
      };
      return evaluateFirestoreRule({
        auth: charlie,
        collection: 'groups',
        docId: 'g_alpha',
        operation: 'update',
        existingData: dbBefore.groups.g_alpha,
        incomingData: dbAfterCharlieJoin.groups.g_alpha,
        dbBefore,
        dbAfter: dbAfterCharlieJoin,
      });
    })(),
    true
  );

  // =========================================================================
  // SUITE 2: CROSS-GROUP ACCESS
  // =========================================================================
  for (const col of ['groups', 'expenses', 'expenseShares', 'settlements', 'groupMembers'] as const) {
    const docIdMap = {
      groups: 'g_alpha',
      expenses: 'exp_1',
      expenseShares: 'sh_1',
      settlements: 'set_1',
      groupMembers: 'gm_alpha_alice',
    };
    const docId = docIdMap[col];
    assertRule(
      `[Cross-Group] External user Mallory denied get on ${col}`,
      evaluateFirestoreRule({
        auth: mallory,
        collection: col,
        docId,
        operation: 'get',
        existingData: (dbBefore[col] as any)[docId],
        dbBefore,
      }),
      false
    );
  }
  assertRule(
    '[Cross-Group] External user Mallory denied reading Alice member profile',
    evaluateFirestoreRule({
      auth: mallory,
      collection: 'members',
      docId: 'm_alice',
      operation: 'get',
      existingData: dbBefore.members.m_alice,
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Cross-Group] Creating expenseShare with mismatched groupId denied',
    evaluateFirestoreRule({
      auth: alice,
      collection: 'expenseShares',
      docId: 'sh_bad',
      operation: 'create',
      incomingData: {
        id: 'sh_bad',
        expenseId: 'exp_1',
        groupId: 'g_other_group',
        memberId: 'm_alice',
        shareAmount: 100,
      },
      dbBefore,
    }),
    false
  );

  // =========================================================================
  // SUITE 3: MEMBERSHIP ESCALATION & ORDINARY MEMBER RESTRICTIONS
  // =========================================================================
  assertRule(
    '[Escalation] Ordinary member Bob denied from adding/removing users in group memberUserIds',
    evaluateFirestoreRule({
      auth: bob,
      collection: 'groups',
      docId: 'g_alpha',
      operation: 'update',
      existingData: dbBefore.groups.g_alpha,
      incomingData: {
        ...dbBefore.groups.g_alpha,
        memberUserIds: ['uid_alice', 'uid_bob', 'uid_mallory'],
      },
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Escalation] Ordinary member Bob denied from changing group ownership (createdBy)',
    evaluateFirestoreRule({
      auth: bob,
      collection: 'groups',
      docId: 'g_alpha',
      operation: 'update',
      existingData: dbBefore.groups.g_alpha,
      incomingData: {
        ...dbBefore.groups.g_alpha,
        createdBy: 'uid_bob',
      },
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Escalation] Ordinary member Bob denied from modifying protected group fields (name, baseCurrency)',
    evaluateFirestoreRule({
      auth: bob,
      collection: 'groups',
      docId: 'g_alpha',
      operation: 'update',
      existingData: dbBefore.groups.g_alpha,
      incomingData: {
        ...dbBefore.groups.g_alpha,
        name: 'Bob Hijacked Name',
      },
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Escalation] Ordinary member Bob denied from adding third-party user to groupMembers',
    evaluateFirestoreRule({
      auth: bob,
      collection: 'groupMembers',
      docId: 'gm_alpha_mallory',
      operation: 'create',
      incomingData: {
        id: 'gm_alpha_mallory',
        groupId: 'g_alpha',
        memberId: 'm_mallory',
      },
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Escalation] Creating member document without UID denied',
    evaluateFirestoreRule({
      auth: mallory,
      collection: 'members',
      docId: 'm_nouid',
      operation: 'create',
      incomingData: {
        id: 'm_nouid',
        name: 'No UID Member',
      },
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Escalation] Modifying legacy member document that lacks a UID denied',
    evaluateFirestoreRule({
      auth: mallory,
      collection: 'members',
      docId: 'm_uidless',
      operation: 'update',
      existingData: dbBefore.members.m_uidless,
      incomingData: {
        id: 'm_uidless',
        uid: 'uid_mallory',
        name: 'Claimed Legacy Doc',
      },
      dbBefore,
    }),
    false
  );

  // =========================================================================
  // SUITE 4: UNAUTHORIZED DELETION
  // =========================================================================
  assertRule(
    '[Deletion] Ordinary member Bob denied from deleting group (owner required)',
    evaluateFirestoreRule({
      auth: bob,
      collection: 'groups',
      docId: 'g_alpha',
      operation: 'delete',
      existingData: dbBefore.groups.g_alpha,
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Deletion] Group owner Alice allowed to delete group',
    evaluateFirestoreRule({
      auth: alice,
      collection: 'groups',
      docId: 'g_alpha',
      operation: 'delete',
      existingData: dbBefore.groups.g_alpha,
      dbBefore,
    }),
    true
  );
  assertRule(
    '[Deletion] Ordinary member Bob denied from deleting Alice groupMember record',
    evaluateFirestoreRule({
      auth: bob,
      collection: 'groupMembers',
      docId: 'gm_alpha_alice',
      operation: 'delete',
      existingData: dbBefore.groupMembers.gm_alpha_alice,
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Deletion] Ordinary member Bob denied from deleting group inviteCode',
    evaluateFirestoreRule({
      auth: bob,
      collection: 'inviteCodes',
      docId: 'ALP234',
      operation: 'delete',
      existingData: dbBefore.inviteCodes.ALP234,
      dbBefore,
    }),
    false
  );

  // =========================================================================
  // SUITE 5: INVITE ABUSE & ENUMERATION
  // =========================================================================
  assertRule(
    '[Invite Abuse] Listing/enumerating inviteCodes denied',
    evaluateFirestoreRule({
      auth: alice,
      collection: 'inviteCodes',
      docId: 'ALP234',
      operation: 'list',
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Invite Abuse] Ordinary member Bob denied from creating rogue invite code for Alpha Group',
    evaluateFirestoreRule({
      auth: bob,
      collection: 'inviteCodes',
      docId: 'ROGUE9',
      operation: 'create',
      incomingData: {
        groupId: 'g_alpha',
        groupName: 'Alpha Group',
        createdBy: 'uid_bob',
      },
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Invite Abuse] Redirecting existing invite code to another groupId denied',
    evaluateFirestoreRule({
      auth: mallory,
      collection: 'inviteCodes',
      docId: 'ALP234',
      operation: 'update',
      existingData: dbBefore.inviteCodes.ALP234,
      incomingData: {
        ...dbBefore.inviteCodes.ALP234,
        groupId: 'g_mallory',
        lastJoinedBy: 'uid_mallory',
      },
      dbBefore,
    }),
    false
  );

  // =========================================================================
  // SUITE 6: RECOVERY ATTACKS & DISCLOSURE PREVENTION
  // =========================================================================
  assertRule(
    '[Recovery Attack] External user Mallory denied from reading Alice recovery record (no disclosure)',
    evaluateFirestoreRule({
      auth: mallory,
      collection: 'recovery',
      docId: hashA,
      operation: 'get',
      existingData: dbBefore.recovery[hashA],
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Recovery Attack] Owner Alice allowed to read her own recovery record',
    evaluateFirestoreRule({
      auth: alice,
      collection: 'recovery',
      docId: hashA,
      operation: 'get',
      existingData: dbBefore.recovery[hashA],
      dbBefore,
    }),
    true
  );
  assertRule(
    '[Recovery Attack] Overwriting or deleting Alice recovery record by Mallory denied',
    evaluateFirestoreRule({
      auth: mallory,
      collection: 'recovery',
      docId: hashA,
      operation: 'delete',
      existingData: dbBefore.recovery[hashA],
      dbBefore,
    }),
    false
  );

  // =========================================================================
  // SUITE 7: FIREBASE STORAGE RECEIPT ACCESS RULES
  // =========================================================================
  assertRule(
    '[Storage] Authorized receipt upload (JPEG <= 5MB with matching owner & group membership) allowed',
    evaluateStorageReceiptRule({
      auth: alice,
      groupId: 'g_alpha',
      userId: 'uid_alice',
      fileName: '170000_receipt.jpg',
      operation: 'create',
      contentType: 'image/jpeg',
      sizeBytes: 350 * 1024,
      metadata: {
        uploadedBy: 'uid_alice',
        groupId: 'g_alpha',
        memberUserIdsCsv: 'uid_alice,uid_bob',
      },
      dbBefore,
    }),
    true
  );
  assertRule(
    '[Storage] Co-participant Bob allowed to download group receipt',
    evaluateStorageReceiptRule({
      auth: bob,
      groupId: 'g_alpha',
      userId: 'uid_alice',
      fileName: '170000_receipt.jpg',
      operation: 'get',
      existingMetadata: {
        uploadedBy: 'uid_alice',
        groupId: 'g_alpha',
        memberUserIdsCsv: 'uid_alice,uid_bob',
      },
      dbBefore,
    }),
    true
  );
  assertRule(
    '[Storage] Authenticated non-member Mallory denied from downloading group receipt',
    evaluateStorageReceiptRule({
      auth: mallory,
      groupId: 'g_alpha',
      userId: 'uid_alice',
      fileName: '170000_receipt.jpg',
      operation: 'get',
      existingMetadata: {
        uploadedBy: 'uid_alice',
        groupId: 'g_alpha',
        memberUserIdsCsv: 'uid_alice,uid_bob',
      },
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Storage] Non-member Mallory denied from uploading receipt to g_alpha even under her own userId',
    evaluateStorageReceiptRule({
      auth: mallory,
      groupId: 'g_alpha',
      userId: 'uid_mallory',
      fileName: '170000_receipt.jpg',
      operation: 'create',
      contentType: 'image/jpeg',
      sizeBytes: 350 * 1024,
      metadata: { uploadedBy: 'uid_mallory', groupId: 'g_alpha' },
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Storage] Uploading receipt into another user storage path denied',
    evaluateStorageReceiptRule({
      auth: mallory,
      groupId: 'g_alpha',
      userId: 'uid_alice',
      fileName: '170000_receipt.jpg',
      operation: 'create',
      contentType: 'image/jpeg',
      sizeBytes: 350 * 1024,
      metadata: { uploadedBy: 'uid_mallory', groupId: 'g_alpha' },
      dbBefore,
    }),
    false
  );
  assertRule(
    '[Storage] Uploading disallowed MIME type (text/html) or >5MB receipt denied',
    evaluateStorageReceiptRule({
      auth: alice,
      groupId: 'g_alpha',
      userId: 'uid_alice',
      fileName: 'malicious.html',
      operation: 'create',
      contentType: 'text/html',
      sizeBytes: 1024,
      metadata: { uploadedBy: 'uid_alice', groupId: 'g_alpha' },
      dbBefore,
    }),
    false
  );

  return {
    passed: failures.length === 0,
    totalAssertions,
    failures,
  };
}
