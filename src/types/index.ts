export type CalendarType = 'AD' | 'BS';
export type SupportedLanguage = 'en' | 'fr' | 'ne' | 'hi' | 'mai';
export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares' | 'items';
export type MemberAccountType = 'registered' | 'guest';

export interface Member {
  id: string;
  username?: string; // Unique lowercase handle (e.g. "saroj_88", "user_c") registered in Splitzy DB
  uid?: string | null; // Authoritative Firebase Auth UID of the registered device/user, or null/undefined for guest participants
  userId?: string | null; // Alias for registered user ID or null for guest participants
  accountType?: MemberAccountType; // 'registered' for Splitzy account holders, 'guest' for group-only participants
  groupId?: string; // Primary group association for rule-level participant verification
  memberUserIds?: string[]; // Authorized co-participant UIDs allowed to read this profile
  name: string;
  avatar: string; // Emoji, initials, or uploaded photo dataURL
  color?: string; // Hex or tailwind color class
  paymentInfo?: string; // Interac e-Transfer email, UPI ID, Bank ID, PayPal handle
  passwordHash?: string; // Salted SHA-256 hex digest of user's account login password
  pinHash?: string; // Salted SHA-256 hex digest of user's 4-digit App Lock PIN
  isTemporary?: boolean; // True when user selected Temporary Use (no account/registration required)
  status?: 'active' | 'deleted'; // Centralized cross-platform account status
  deletedAt?: string; // ISO timestamp when account was globally deleted
  sessionVersion?: number; // Monotonic version counter for cross-platform session/token invalidation
  createdAt: string;
}

export type RetentionPeriod = '3d' | '15d' | '1m' | 'never';

export interface Group {
  id: string;
  name: string;
  baseCurrency: string;
  preferredCalendar: CalendarType;
  language: SupportedLanguage;
  createdAt: string;
  createdBy?: string;
  memberUserIds?: string[];
  inviteCode?: string;
  reviewNewMembers?: boolean;
  settled?: boolean; // True when all balances in the group are settled
  settledAt?: string | null; // ISO timestamp when the group became fully settled
  retentionPeriod?: RetentionPeriod; // Configured auto-delete retention ('3d' | '15d' | '1m' | 'never')
}

export interface GroupMember {
  id: string;
  groupId: string;
  memberId: string;
  memberName?: string;
  memberUsername?: string;
  memberAvatar?: string;
  memberColor?: string;
  memberUid?: string | null;
  accountType?: MemberAccountType;
}

const GUEST_AVATARS = ['🙂', '😎', '🧑‍🤝‍🧑', '🎸', '🏔️', '☕', '🍕', '🚀', '🌟', '🎨'];
const GUEST_COLORS = [
  '#087F5B',
  '#1D4ED8',
  '#7C3AED',
  '#B45309',
  '#BE123C',
  '#0F766E',
  '#4338CA',
  '#15803D',
];

/**
 * Determines whether a member record represents a guest participant (no Splitzy account required).
 */
export function isGuestMember(member?: Partial<Member> | null): boolean {
  if (!member) return false;
  if (member.accountType === 'guest') return true;
  if (member.id && member.id.startsWith('guest_')) return true;
  if (!member.username && !member.uid && !member.isTemporary) return true;
  return false;
}

/**
 * Creates a guest group participant by name without requiring a Splitzy account,
 * username, email, or database verification.
 */
export function createGuestParticipant(name: string, groupId?: string, indexHint = 0): Member {
  const cleanName = name.trim();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const id = `guest_${Date.now()}_${randomSuffix}`;
  const hashSeed = cleanName
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), Math.max(0, indexHint));
  const avatar = GUEST_AVATARS[hashSeed % GUEST_AVATARS.length];
  const color = GUEST_COLORS[hashSeed % GUEST_COLORS.length];

  return {
    id,
    name: cleanName,
    uid: null,
    userId: null,
    accountType: 'guest',
    isTemporary: true,
    groupId,
    avatar,
    color,
    createdAt: new Date().toISOString(),
  };
}

export interface ExpenseLineItem {
  id: string;
  title: string;
  amount: number;
  assignedMemberIds: string[]; // Empty means shared by all participants automatically
}

export interface ExpenseShare {
  id: string;
  expenseId: string;
  groupId?: string;
  memberId: string;
  shareAmount: number; // in Base Currency minor units (or exact decimal rounded to 2 places)
  splitType: SplitType;
  percentage?: number;
  sharesCount?: number;
  originalShareAmount?: number;
}

export interface Expense {
  id: string;
  groupId: string;
  title: string;
  originalAmount: number;
  originalCurrency: string;
  exchangeRate: number; // 1 OriginalCurrency = X BaseCurrency
  baseAmount: number; // originalAmount * exchangeRate
  paidBy: string; // memberId
  dateISO: string; // ISO 8601 string (e.g. 2026-09-06)
  calendarType: CalendarType;
  category?: string;
  notes?: string;
  receiptUrl?: string; // base64 data URL or uploaded image/pdf
  receiptStoragePath?: string; // Firebase Storage path for cloud receipt cleanup
  receiptName?: string;
  lineItems?: ExpenseLineItem[];
  isRecurring?: boolean;
  recurringInterval?: 'weekly' | 'biweekly' | 'monthly';
  createdAt: string;
}

export interface SettlementRecord {
  id: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: string;
  dateISO: string;
  notes?: string;
  createdAt: string;
}

export interface MemberBalance {
  memberId: string;
  totalPaid: number;
  totalShare: number;
  netBalance: number; // totalPaid - totalShare. >0 Creditor, <0 Debtor, 0 Settled
}

export interface SettlementTransaction {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: string;
}

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  defaultRateToNPR: number; // baseline exchange reference
}

export interface UserSecurityProfile {
  uid: string;
  hasRecoveryCode: boolean;
  recoveryCreatedAt?: string;
  lastBackupAt?: string;
}

export interface RecoveryRecord {
  verifierHash: string; // SHA-256 hash of recovery code
  uid: string; // Authoritative Firebase Auth UID
  createdAt: string;
  updatedAt: string;
}
