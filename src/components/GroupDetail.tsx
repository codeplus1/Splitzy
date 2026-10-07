import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Plus,
  Receipt,
  Scale,
  Users,
  Settings,
  Share2,
  CheckCircle2,
  Search,
  Copy,
  Check,
  Calendar,
  ArrowRight,
  QrCode,
  Lock,
  AtSign,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Group,
  Member,
  Expense,
  ExpenseShare,
  SettlementRecord,
  SupportedLanguage,
  CalendarType,
  RetentionPeriod,
  createGuestParticipant,
  isGuestMember,
} from '../types';
import { RETENTION_PERIOD_OPTIONS } from '../core/retention';
import { MemberAvatar } from './MemberAvatar';
import { SwipeableExpenseItem } from './SwipeableExpenseItem';
import { ShareGroupModal } from './ShareGroupModal';
import { formatMoney, SUPPORTED_CURRENCIES } from '../core/currency';
import {
  calculateMemberBalances,
  optimizeSettlements,
} from '../core/calculation';
import { translate, formatSettlementText } from '../core/i18n';
import { cloudLookupRegisteredUser } from '../services/firebase';

interface GroupDetailProps {
  group: Group;
  members: Member[];
  expenses: Expense[];
  expenseShares: ExpenseShare[];
  settlements: SettlementRecord[];
  pendingExpenseIds?: string[];
  onBackToDashboard: () => void;
  onAddExpenseClick: () => void;
  onEditExpenseClick: (expense: Expense, shares: ExpenseShare[]) => void;
  onDeleteExpense: (expenseId: string) => void;
  onOpenSettleModal: (fromId?: string, toId?: string, amount?: number) => void;
  onAddMemberToGroup: (member: Member) => void;
  onUpdateGroup: (updated: Partial<Group>) => void;
  onDeleteGroup: (groupId: string) => void;
  currentUserId?: string;
  language: SupportedLanguage;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type TabType = 'expenses' | 'balances' | 'members' | 'settings';

export const GroupDetail: React.FC<GroupDetailProps> = ({
  group,
  members,
  expenses,
  expenseShares,
  settlements,
  pendingExpenseIds = [],
  currentUserId,
  onBackToDashboard,
  onAddExpenseClick,
  onEditExpenseClick,
  onDeleteExpense,
  onOpenSettleModal,
  onAddMemberToGroup,
  onUpdateGroup,
  onDeleteGroup,
  language,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('expenses');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilterMember, setSelectedFilterMember] = useState<string>('all');
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const [newMemberIdentifier, setNewMemberIdentifier] = useState('');
  const [isLookingUpMember, setIsLookingUpMember] = useState(false);

  const currentUserMember = members.find(m => m.id === currentUserId);
  const isTemporaryUser = Boolean(
    currentUserMember?.isTemporary || !currentUserMember?.username
  );
  const [addMemberMode, setAddMemberMode] = useState<'guest' | 'username'>('guest');

  // Settings inputs
  const [groupNameEdit, setGroupNameEdit] = useState(group.name);
  const [groupCurrencyEdit, setGroupCurrencyEdit] = useState(group.baseCurrency);
  const [groupCalendarEdit, setGroupCalendarEdit] = useState<CalendarType>(
    group.preferredCalendar
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setGroupNameEdit(group.name);
    setGroupCurrencyEdit(group.baseCurrency);
    setGroupCalendarEdit(group.preferredCalendar);
    setShowDeleteConfirm(false);
  }, [group.id, group.name, group.baseCurrency, group.preferredCalendar]);

  // Filtered group expenses
  const groupExpenses = expenses
    .filter(e => e.groupId === group.id)
    .sort(
      (a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime()
    );

  const groupShares = expenseShares.filter(s =>
    groupExpenses.some(e => e.id === s.expenseId)
  );
  const groupSettlements = settlements.filter(s => s.groupId === group.id);

  // Core Math Engine Output: Recalculated dynamically
  const balances = calculateMemberBalances(
    members,
    groupExpenses,
    groupShares,
    groupSettlements
  );
  const optimizedDebts = optimizeSettlements(balances, group.baseCurrency);

  // Check if current user is owed money OR if any creditor is a guest participant (since guest participants have no account to log in)
  const settleableDebts = optimizedDebts.filter(d => {
    const creditor = members.find(m => m.id === d.toMemberId);
    const isGuestCreditor = isGuestMember(creditor);
    return (currentUserId && d.toMemberId === currentUserId) || isGuestCreditor;
  });
  const canCurrentUserSettle = settleableDebts.length > 0;
  const isGroupFullySettled = optimizedDebts.length === 0;

  const totalGroupSpent = groupExpenses.reduce((acc, e) => acc + e.baseAmount, 0);

  // Filtered Expenses
  const displayedExpenses = groupExpenses.filter(e => {
    const matchesSearch =
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.notes && e.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.category && e.category.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesMember =
      selectedFilterMember === 'all' ||
      e.paidBy === selectedFilterMember ||
      groupShares.some(s => s.expenseId === e.id && s.memberId === selectedFilterMember);
    return matchesSearch && matchesMember;
  });

  // Generate shareable WhatsApp/SMS summary
  const handleCopySummary = () => {
    let text = `📊 *Splitze: ${group.name}*\n`;
    text += `💰 Total Expenses: ${formatMoney(totalGroupSpent, group.baseCurrency)}\n`;
    text += `👥 Members: ${members.map(m => m.name).join(', ')}\n\n`;

    text += `*⚖️ Balances Summary:*\n`;
    balances.forEach(b => {
      const m = members.find(mem => mem.id === b.memberId);
      const sign = b.netBalance > 0 ? '+' : '';
      text += `• ${m?.name}: ${sign}${formatMoney(b.netBalance, group.baseCurrency)} (Paid: ${formatMoney(b.totalPaid, group.baseCurrency)})\n`;
    });

    text += `\n*🤝 Optimized Settlement Transfers:*\n`;
    if (optimizedDebts.length === 0) {
      text += `All balances are settled up! 🎉\n`;
    } else {
      optimizedDebts.forEach(debt => {
        const fromM = members.find(m => m.id === debt.fromMemberId);
        const toM = members.find(m => m.id === debt.toMemberId);
        const line = formatSettlementText(
          language,
          fromM?.name || 'Someone',
          toM?.name || 'Someone',
          formatMoney(debt.amount, group.baseCurrency)
        );
        text += `• ${line}\n`;
      });
    }

    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    onShowToast(translate(language, 'copiedToClipboard'), 'success');
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLookingUpMember) return;
    const trimmed = newMemberIdentifier.trim();
    if (!trimmed) return;

    const shouldLookupUsername =
      !isTemporaryUser && (addMemberMode === 'username' || trimmed.startsWith('@'));

    if (!shouldLookupUsername) {
      const cleanName = trimmed.replace(/^@+/, '').trim();
      if (!cleanName) return;
      const guestMember = createGuestParticipant(cleanName, group.id, members.length);
      onAddMemberToGroup(guestMember);
      setNewMemberIdentifier('');
      onShowToast(
        language === 'fr'
          ? `${guestMember.name} ajouté(e) comme invité`
          : `Added ${guestMember.name} as guest`,
        'success'
      );
      return;
    }

    setIsLookingUpMember(true);
    try {
      const lookup = await cloudLookupRegisteredUser(trimmed);
      if (!lookup.found || !lookup.member) {
        onShowToast(lookup.message, 'error');
        return;
      }

      const foundMember: Member = {
        ...lookup.member,
        accountType: 'registered',
        userId: lookup.member.uid ?? null,
      };
      if (
        members.some(
          m =>
            m.id === foundMember.id ||
            (m.username &&
              foundMember.username &&
              m.username.toLowerCase() === foundMember.username.toLowerCase())
        )
      ) {
        onShowToast(
          `${foundMember.name} is already a member of this group.`,
          'error'
        );
        return;
      }

      onAddMemberToGroup(foundMember);
      setNewMemberIdentifier('');
      onShowToast(
        `Verified & added ${foundMember.name} (@${foundMember.username}) to the group!`,
        'success'
      );
    } finally {
      setIsLookingUpMember(false);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupNameEdit.trim()) return;
    onUpdateGroup({
      name: groupNameEdit.trim(),
      baseCurrency: groupCurrencyEdit,
      preferredCalendar: groupCalendarEdit,
    });
    onShowToast(translate(language, 'saveChanges'), 'success');
  };

  return (
    <div className="space-y-4 pb-14">
      {/* Top Navigation & Group Header */}
      <div className="ui-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onBackToDashboard}
              className="group w-8 h-8 flex items-center justify-center rounded-lg text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] hover:border-[var(--border-strong)] hover:-translate-x-0.5 active:scale-95 transition-all border border-[var(--border)] cursor-pointer shrink-0"
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold font-sans tracking-tight text-[var(--ink)]">
                  {group.name}
                </h1>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-[var(--ink)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
                  title="Change Base Currency in Settings"
                >
                  {group.baseCurrency}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-[var(--ink-secondary)] inline-flex items-center gap-1 transition-colors cursor-pointer"
                  title="Change Calendar Mode in Settings"
                >
                  <Calendar className="w-3 h-3" />
                  {group.preferredCalendar}
                </button>
                {group.inviteCode && (
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]">
                    #{group.inviteCode}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--ink-secondary)] mt-0.5 font-medium">
                {members.length} {translate(language, 'membersCount')} · {groupExpenses.length}{' '}
                {translate(language, 'expenses')}
              </p>
            </div>
          </div>

          {/* Quick Actions in Header */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap w-full sm:w-auto min-w-0">
            <button
              id="group-invite-btn"
              onClick={() => setIsInviteModalOpen(true)}
              className="ui-btn-secondary group !px-2 sm:!px-2.5 !py-1.5 !text-[11px] sm:!text-xs !gap-1 sm:!gap-1.5 whitespace-nowrap !shrink min-w-0"
              title="Invite members via QR Code or Invite Code"
            >
              <QrCode className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate">Invite</span>
            </button>

            <button
              id="group-share-summary-btn"
              onClick={handleCopySummary}
              className="ui-btn-secondary group !px-2 sm:!px-2.5 !py-1.5 !text-[11px] sm:!text-xs !gap-1 sm:!gap-1.5 whitespace-nowrap !shrink min-w-0"
            >
              {copiedSummary ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <Share2 className="w-3.5 h-3.5 text-[var(--ink-secondary)] shrink-0 group-hover:scale-110 transition-transform" />
              )}
              <span className="truncate">{copiedSummary ? 'Copied!' : translate(language, 'shareSummary')}</span>
            </button>

            <button
              id="group-add-expense-btn"
              onClick={onAddExpenseClick}
              className="ui-btn-primary group !px-2.5 sm:!px-3 !py-1.5 !text-[11px] sm:!text-xs !gap-1 sm:!gap-1.5 whitespace-nowrap !shrink min-w-0 ml-auto sm:ml-0"
            >
              <Plus className="w-3.5 h-3.5 shrink-0 group-hover:rotate-90 transition-transform duration-200" />
              <span className="truncate">{translate(language, 'addExpense')}</span>
            </button>
          </div>
        </div>

        {/* Highlight Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[var(--border)]">
          <div className="ui-subcard p-3">
            <span className="text-[11px] font-medium text-[var(--ink-secondary)] block mb-0.5">
              {translate(language, 'totalExpenses')}
            </span>
            <span className="text-sm sm:text-base font-bold text-[var(--ink)] tnum amount-val">
              {formatMoney(totalGroupSpent, group.baseCurrency, language)}
            </span>
          </div>

          <div className="ui-subcard p-3">
            <span className="text-[11px] font-medium text-[var(--ink-secondary)] block mb-0.5">
              Settlement Status
            </span>
            <span className="text-xs font-semibold flex items-center gap-1.5 text-[var(--ink)]">
              {optimizedDebts.length === 0 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">All Settled</span>
                </>
              ) : (
                <>
                  <Scale className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>{optimizedDebts.length} Transfers Needed</span>
                </>
              )}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 ui-subcard p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-[var(--ink-secondary)] block mb-0.5">
                Members
              </span>
              <div className="flex items-center -space-x-1.5 mt-0.5">
                {members.slice(0, 5).map(m => (
                  <MemberAvatar
                    key={m.id}
                    name={m.name}
                    avatar={m.avatar}
                    color={m.color}
                    size="xs"
                    className="w-6 h-6 ring-2 ring-[var(--surface)]"
                  />
                ))}
              </div>
            </div>
            <button
              onClick={() => setActiveTab('members')}
              className="ui-btn-ghost px-2 py-1 text-[11px] text-[var(--accent)] font-semibold"
            >
              Manage
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-[var(--border)] -mb-1 overflow-x-auto">
          <button
            id="tab-expenses-btn"
            onClick={() => setActiveTab('expenses')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
              activeTab === 'expenses'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink)]'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>{translate(language, 'expenses')}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--surface-subtle)] text-[var(--ink)] font-semibold">
              {groupExpenses.length}
            </span>
          </button>

          <button
            id="tab-settlements-btn"
            onClick={() => setActiveTab('balances')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
              activeTab === 'balances'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink)]'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>{translate(language, 'settlements')}</span>
            {optimizedDebts.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-bold">
                {optimizedDebts.length}
              </span>
            )}
          </button>

          <button
            id="tab-members-btn"
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
              activeTab === 'members'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink)]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{translate(language, 'members')}</span>
          </button>

          <button
            id="tab-settings-btn"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
              activeTab === 'settings'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink)]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{translate(language, 'settings')}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: EXPENSES LIST */}
      {activeTab === 'expenses' && (
        <div className="space-y-3">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
            <div className="flex items-center gap-2 grow max-w-sm px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--accent)] focus-within:ring-3 focus-within:ring-[var(--accent)]/10 transition-all">
              <Search className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
              <input
                type="text"
                placeholder="Search expenses by title or category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-[var(--ink-muted)] hover:text-[var(--ink)] p-0.5 rounded transition-colors cursor-pointer shrink-0"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Member Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedFilterMember('all')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer hover:-translate-y-0.5 active:translate-y-0 active:scale-95 ${
                  selectedFilterMember === 'all'
                    ? 'bg-[var(--accent)] text-white shadow-2xs'
                    : 'bg-[var(--surface)] text-[var(--ink-secondary)] border border-[var(--border)] hover:bg-[var(--surface-subtle)]'
                }`}
              >
                All Members
              </button>
              {members.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedFilterMember(m.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded-lg flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer hover:-translate-y-0.5 active:translate-y-0 active:scale-95 ${
                    selectedFilterMember === m.id
                      ? 'bg-[var(--accent)] text-white font-bold shadow-2xs'
                      : 'bg-[var(--surface)] text-[var(--ink-secondary)] border border-[var(--border)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  <MemberAvatar name={m.name} avatar={m.avatar} color={m.color} size="xs" className="w-4 h-4 text-[9px]" />
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Expense Cards List */}
          {displayedExpenses.length === 0 ? (
            <div className="ui-card p-8 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mx-auto border border-[var(--accent-border)]">
                <Receipt className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold font-display text-[var(--ink)]">
                No expenses found
              </h3>
              <p className="text-[11px] text-[var(--ink-secondary)] max-w-xs mx-auto leading-relaxed">
                {searchQuery
                  ? 'No expenses matched your search criteria.'
                  : 'Add your first expense to begin splitting costs among group members.'}
              </p>
              <button
                onClick={onAddExpenseClick}
                className="ui-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] shadow-xs group"
              >
                <Plus className="w-3.5 h-3.5 transition-transform duration-150 group-hover:rotate-90" />
                <span>{translate(language, 'addExpense')}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 text-[11px] text-[var(--ink-secondary)]">
                <span className="font-medium">
                  {displayedExpenses.length} {displayedExpenses.length === 1 ? 'expense' : 'expenses'}
                </span>
                <span className="sm:hidden text-[var(--accent)] font-medium">
                  ← Swipe left to edit
                </span>
              </div>
              {displayedExpenses.map(expense => (
                <SwipeableExpenseItem
                  key={expense.id}
                  expense={expense}
                  group={group}
                  members={members}
                  groupShares={groupShares}
                  language={language}
                  isPendingSync={pendingExpenseIds.includes(expense.id)}
                  onEdit={onEditExpenseClick}
                  onDelete={onDeleteExpense}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BALANCES & MIN-FLOW SETTLEMENT */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          {/* Section 1: Member Balances Ledger */}
          <div className="ui-card p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-bold font-display text-[var(--ink)] text-sm">
                  Member Balances Breakdown
                </h3>
                <p className="text-[11px] text-[var(--ink-secondary)]">
                  Formula: Net Balance = Total Paid − Total Share
                </p>
              </div>

              {canCurrentUserSettle && (
                <button
                  id="record-settlement-quick-btn"
                  onClick={() =>
                    onOpenSettleModal(
                      settleableDebts[0]?.fromMemberId,
                      settleableDebts[0]?.toMemberId,
                      settleableDebts[0]?.amount
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.96] transition-all cursor-pointer group shadow-2xs"
                >
                  <CheckCircle2 className="w-3 h-3 transition-transform duration-150 group-hover:scale-110" />
                  <span>{translate(language, 'settleUp')}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {balances.map(b => {
                const m = members.find(mem => mem.id === b.memberId);
                if (!m) return null;

                const isCreditor = b.netBalance > 0.005;
                const isDebtor = b.netBalance < -0.005;

                return (
                  <div
                    key={b.memberId}
                    className={`p-3 rounded-xl border transition-all duration-150 hover:-translate-y-[1px] hover:shadow-xs flex items-center justify-between gap-2.5 ${
                      isCreditor
                        ? 'bg-[var(--accent-soft)]/50 border-[var(--accent-border)]'
                        : isDebtor
                        ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900'
                        : 'bg-[var(--surface-subtle)] border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MemberAvatar
                        name={m.name}
                        avatar={m.avatar}
                        color={m.color}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-bold text-[var(--ink)] truncate">
                            {m.name}
                          </h4>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                              isCreditor
                                ? 'bg-[var(--accent)] text-white'
                                : isDebtor
                                ? 'bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200'
                                : 'bg-[var(--border)] text-[var(--ink-secondary)]'
                            }`}
                          >
                            {isCreditor
                              ? translate(language, 'creditorLabel')
                              : isDebtor
                              ? translate(language, 'debtorLabel')
                              : translate(language, 'settledLabel')}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--ink-secondary)] mt-0.5 tnum truncate">
                          Paid: {formatMoney(b.totalPaid, group.baseCurrency, language)} · Share:{' '}
                          {formatMoney(b.totalShare, group.baseCurrency, language)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-xs sm:text-sm font-bold tnum amount-val ${
                          isCreditor
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isDebtor
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-[var(--ink-muted)]'
                        }`}
                      >
                        {b.netBalance > 0 ? '+' : ''}
                        {formatMoney(b.netBalance, group.baseCurrency, language)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Greedy Min-Flow Debt Optimization Plan */}
          <div className="ui-card p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold font-display text-[var(--ink)] text-sm flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>{translate(language, 'directSettlements')}</span>
                </h3>
                <p className="text-[11px] text-[var(--ink-secondary)]">
                  Min-Flow algorithm calculates the fewest possible payments to clear all debts.
                </p>
              </div>

              <button
                onClick={handleCopySummary}
                className="ui-btn-secondary self-start sm:self-auto flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] group"
              >
                <Copy className="w-3 h-3 transition-transform duration-150 group-hover:scale-110" />
                <span>{translate(language, 'copyTextSummary')}</span>
              </button>
            </div>

            {optimizedDebts.length === 0 ? (
              <div className="p-6 text-center bg-[var(--accent-soft)]/50 rounded-xl border border-[var(--accent-border)] space-y-1.5">
                <CheckCircle2 className="w-6 h-6 text-[var(--accent)] mx-auto" />
                <h4 className="text-xs font-bold text-[var(--ink)]">
                  {translate(language, 'noSettlementsNeeded')}
                </h4>
                <p className="text-[11px] text-[var(--ink-secondary)]">
                  Every participant in {group.name} is fully settled up.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {optimizedDebts.map((debt, index) => {
                  const debtor = members.find(m => m.id === debt.fromMemberId);
                  const creditor = members.find(m => m.id === debt.toMemberId);
                  if (!debtor || !creditor) return null;

                  const formattedSentence = formatSettlementText(
                    language,
                    debtor.name,
                    creditor.name,
                    formatMoney(debt.amount, group.baseCurrency, language)
                  );

                  const isCurrentUserCreditor = currentUserId && creditor.id === currentUserId;
                  const isCurrentUserDebtor = currentUserId && debtor.id === currentUserId;
                  const isCreditorGuest = isGuestMember(creditor);
                  const canSettleThisDebt = Boolean(isCurrentUserCreditor || isCreditorGuest);

                  return (
                    <div
                      key={`debt_${index}`}
                      className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all duration-150 hover:-translate-y-[1px] hover:shadow-xs ${
                        isCurrentUserCreditor
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                          : isCurrentUserDebtor
                          ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900'
                          : 'bg-[var(--surface-subtle)] border-[var(--border)] hover:border-[var(--accent)]/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <MemberAvatar
                          name={debtor.name}
                          avatar={debtor.avatar}
                          color={debtor.color}
                          size="sm"
                        />
                        <div className="p-1 rounded-full bg-[var(--border)] text-[var(--ink-secondary)]">
                          <ArrowRight className="w-3 h-3" />
                        </div>
                        <MemberAvatar
                          name={creditor.name}
                          avatar={creditor.avatar}
                          color={creditor.color}
                          size="sm"
                        />

                        <div className="pl-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-[var(--ink)]">
                              {formattedSentence}
                            </p>
                            {isCurrentUserCreditor && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                                {language === 'fr' ? 'Vous recevez ce montant' : 'You receive this'}
                              </span>
                            )}
                            {isCurrentUserDebtor && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200">
                                {language === 'fr' ? 'À votre charge' : 'You pay this'}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--ink-secondary)] mt-0.5 tnum">
                            Direct transfer of {formatMoney(debt.amount, group.baseCurrency, language)}
                          </p>
                        </div>
                      </div>

                      {canSettleThisDebt ? (
                        <button
                          onClick={() =>
                            onOpenSettleModal(debtor.id, creditor.id, debt.amount)
                          }
                          className="self-end sm:self-auto px-3 py-1.5 text-[11px] font-semibold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all duration-150 hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.97] flex items-center gap-1.5 cursor-pointer group"
                        >
                          <CheckCircle2 className="w-3 h-3 transition-transform duration-150 group-hover:scale-110" />
                          <span>
                            {language === 'fr' ? 'Encaisser / Régler' : translate(language, 'settleUp')}
                          </span>
                        </button>
                      ) : (
                        <div
                          className="self-end sm:self-auto px-2.5 py-1 text-[10px] font-medium rounded-lg bg-[var(--surface-subtle)] text-[var(--ink-secondary)] border border-[var(--border)] flex items-center gap-1.5"
                          title={`Only ${creditor.name} (who receives this payment) can confirm and settle this transfer.`}
                        >
                          <Lock className="w-3 h-3 text-[var(--ink-muted)] shrink-0" />
                          <span>
                            {language === 'fr'
                              ? `Seul ${creditor.name} peut régler`
                              : `Only ${creditor.name} can settle`}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Past Settlements History */}
            {groupSettlements.length > 0 && (
              <div className="pt-3 border-t border-[var(--border)] space-y-1.5">
                <h4 className="text-[10px] font-bold text-[var(--ink-secondary)] uppercase tracking-wider">
                  Payment History ({groupSettlements.length})
                </h4>
                <div className="space-y-1">
                  {groupSettlements.map(rec => {
                    const fromM = members.find(m => m.id === rec.fromMemberId);
                    const toM = members.find(m => m.id === rec.toMemberId);
                    return (
                      <div
                        key={rec.id}
                        className="p-2 rounded-lg bg-[var(--surface-subtle)] text-[11px] flex items-center justify-between text-[var(--ink)] border border-[var(--border-subtle)]"
                      >
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-[var(--accent)] shrink-0" />
                          <span>
                            <strong>{fromM?.name}</strong> paid{' '}
                            <strong>{toM?.name}</strong>
                          </span>
                          {rec.notes && (
                            <span className="text-[var(--ink-muted)] italic">({rec.notes})</span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-[var(--accent)] tnum">
                          {formatMoney(rec.amount, rec.currency, language)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MEMBERS */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="ui-card p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold font-display text-[var(--ink)] text-sm">
                  Group Members ({members.length})
                </h3>
                <p className="text-[11px] text-[var(--ink-secondary)]">
                  Manage members participating in {group.name}.
                </p>
              </div>
            </div>

            {/* Add People to Group Form */}
            <form onSubmit={handleAddMember} className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-[var(--ink)]">
                  {language === 'fr'
                    ? 'Ajouter des personnes à votre groupe'
                    : 'Add people to your group'}
                </span>

                {!isTemporaryUser && (
                  <div className="inline-flex rounded-lg bg-[var(--surface-subtle)] p-0.5 border border-[var(--border)] text-[10px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setAddMemberMode('guest')}
                      className={`px-2.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                        addMemberMode === 'guest'
                          ? 'bg-[var(--surface)] text-[var(--ink)] shadow-2xs'
                          : 'text-[var(--ink-secondary)]'
                      }`}
                    >
                      {language === 'fr' ? 'Par nom (Invité)' : 'By Name (Guest)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddMemberMode('username')}
                      className={`px-2.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                        addMemberMode === 'username'
                          ? 'bg-[var(--surface)] text-[var(--ink)] shadow-2xs'
                          : 'text-[var(--ink-secondary)]'
                      }`}
                    >
                      @username
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center grow rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--accent)] focus-within:ring-3 focus-within:ring-[var(--accent)]/10 transition-all overflow-hidden">
                  <span className="pl-2.5 pr-1.5 py-1.5 text-xs font-mono font-bold text-[var(--ink-muted)] bg-[var(--surface-subtle)] border-r border-[var(--border-subtle)] select-none flex items-center">
                    {!isTemporaryUser && addMemberMode === 'username' ? (
                      <AtSign className="w-3.5 h-3.5" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <input
                    id="group-detail-add-member-input"
                    type="text"
                    placeholder={
                      !isTemporaryUser && addMemberMode === 'username'
                        ? "Enter registered user's @username..."
                        : language === 'fr'
                        ? 'Entrer un nom (ex. Abc, Rahul, John)...'
                        : 'Enter name (e.g. Abc, Rahul, John)...'
                    }
                    value={newMemberIdentifier}
                    onChange={e => setNewMemberIdentifier(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-transparent text-xs text-[var(--ink)] focus:outline-none"
                  />
                </div>
                <button
                  id="group-detail-add-member-btn"
                  type="submit"
                  disabled={isLookingUpMember}
                  className="ui-btn-primary px-3.5 py-1.5 text-[11px] shrink-0"
                >
                  {isLookingUpMember
                    ? 'Verifying...'
                    : !isTemporaryUser && addMemberMode === 'username'
                    ? '+ Verify & Add'
                    : '+ Add'}
                </button>
              </div>
              <p className="text-[10px] text-[var(--ink-muted)]">
                {!isTemporaryUser && addMemberMode === 'username' ? (
                  <>
                    Add a registered Splitze user by their <code className="font-mono text-[var(--accent)]">@username</code>, switch to <strong>By Name (Guest)</strong> to add someone without an account, or share invite code <strong>#{group.inviteCode}</strong>.
                  </>
                ) : language === 'fr' ? (
                  <>
                    Entrez un nom pour ajouter quelqu’un à ce groupe. Aucun compte Splitze n’est requis. Les personnes ayant l’application peuvent aussi rejoindre avec le code <strong>#{group.inviteCode}</strong>.
                  </>
                ) : (
                  <>
                    Enter a name to add someone to this group. They don&apos;t need a Splitze account. Real users can also join anytime using invite code <strong>#{group.inviteCode}</strong>.
                  </>
                )}
              </p>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
              {members.map((m, idx) => {
                const bal = balances.find(b => b.memberId === m.id);
                const isGroupCreator =
                  (Boolean(m.uid) && Boolean(group.createdBy) && m.uid === group.createdBy) ||
                  ((!group.createdBy || group.createdBy === 'anonymous' || group.createdBy.startsWith('u_')) && idx === 0);
                const isYou = Boolean(currentUserId) && m.id === currentUserId;
                const isGuest = isGuestMember(m) && !isYou && !isGroupCreator;
                return (
                  <div
                    key={m.id}
                    className="ui-subcard p-3 flex items-center justify-between gap-2 transition-all duration-150 hover:border-[var(--accent)]/40 hover:-translate-y-[1px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MemberAvatar
                        name={m.name}
                        avatar={m.avatar}
                        color={m.color}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <h4 className="text-xs font-bold text-[var(--ink)] truncate">
                            {m.name}
                          </h4>
                          {isGroupCreator && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/25">
                              Owner
                            </span>
                          )}
                          {isYou && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] text-[var(--ink-secondary)]">
                              You
                            </span>
                          )}
                          {isGuest && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] text-[var(--ink-secondary)] border border-[var(--border)]">
                              Guest
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--ink-secondary)] tnum truncate">
                          {m.username ? `@${m.username} • ` : ''}Paid: {formatMoney(bal?.totalPaid || 0, group.baseCurrency, language)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-xs font-bold tnum amount-val ${
                          (bal?.netBalance || 0) > 0.005
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : (bal?.netBalance || 0) < -0.005
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-[var(--ink-muted)]'
                        }`}
                      >
                        {formatMoney(bal?.netBalance || 0, group.baseCurrency, language)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <div className="ui-card p-4 sm:p-5 space-y-3.5 max-w-xl">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-bold font-display text-[var(--ink)] text-sm">
                Group Settings
              </h3>
              {(() => {
                const ownerMember =
                  members.find(m => m.uid && group.createdBy && m.uid === group.createdBy) ||
                  members[0];
                return ownerMember ? (
                  <span className="text-[11px] text-[var(--ink-secondary)] bg-[var(--surface-subtle)] px-2.5 py-1 rounded-md border border-[var(--border)]">
                    Group Owner: <strong className="text-[var(--ink)]">{ownerMember.name}</strong>
                    {ownerMember.username ? ` (@${ownerMember.username})` : ''}
                  </span>
                ) : null;
              })()}
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[var(--ink-secondary)]">
                  Group Name
                </label>
                <input
                  type="text"
                  value={groupNameEdit}
                  onChange={e => setGroupNameEdit(e.target.value)}
                  className="ui-input"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--ink-secondary)]">
                    {translate(language, 'baseCurrency')}
                  </label>
                  <select
                    value={groupCurrencyEdit}
                    onChange={e => {
                      const nextCurr = e.target.value;
                      setGroupCurrencyEdit(nextCurr);
                      onUpdateGroup({ baseCurrency: nextCurr });
                    }}
                    className="ui-input"
                  >
                    {SUPPORTED_CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.symbol}) — {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--ink-secondary)]">
                    Default Calendar Mode
                  </label>
                  <select
                    value={groupCalendarEdit}
                    onChange={e => {
                      const nextCal = e.target.value as CalendarType;
                      setGroupCalendarEdit(nextCal);
                      onUpdateGroup({ preferredCalendar: nextCal });
                    }}
                    className="ui-input"
                  >
                    <option value="BS">Bikram Sambat (BS)</option>
                    <option value="AD">Gregorian (AD)</option>
                  </select>
                </div>
              </div>

              {/* Auto-Delete Retention Period after Settled */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-semibold text-[var(--ink-secondary)]">
                    {language === 'fr'
                      ? 'Suppression auto après règlement complet'
                      : 'Auto-Delete Retention After Group Settled'}
                  </label>
                  {group.settled && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      Settled {group.settledAt ? `(${new Date(group.settledAt).toLocaleDateString()})` : ''}
                    </span>
                  )}
                </div>
                <select
                  value={group.retentionPeriod || '15d'}
                  onChange={e => {
                    const nextRetention = e.target.value as RetentionPeriod;
                    onUpdateGroup({ retentionPeriod: nextRetention });
                    onShowToast(
                      `Settled group retention updated to ${
                        RETENTION_PERIOD_OPTIONS.find(o => o.value === nextRetention)?.label ||
                        nextRetention
                      }`,
                      'success'
                    );
                  }}
                  className="ui-input"
                >
                  {RETENTION_PERIOD_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {language === 'fr' ? opt.labelFr : opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[var(--ink-muted)]">
                  {language === 'fr'
                    ? 'Une fonction Cloud Firebase nettoie automatiquement les groupes réglés (`settled == true`), leurs dépenses, sous-collections et reçus stockés après ce délai.'
                    : 'A scheduled Firebase Cloud Function automatically cleans up settled groups (`settled == true`), associated documents, subcollections, and stored receipts once `settledAt` exceeds this period.'}
                </p>
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  className="ui-btn-primary px-4 py-1.5 text-[11px]"
                >
                  {translate(language, 'saveChanges')}
                </button>
              </div>
            </form>

            {/* Danger Zone */}
            <div className="pt-4 border-t border-[var(--border)] space-y-2">
              <h4 className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                Danger Zone
              </h4>
              <p className="text-[11px] text-[var(--ink-secondary)]">
                Permanently delete this group and all associated expenses.
              </p>
              {!isGroupFullySettled ? (
                <div className="p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300">
                    <Lock className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      Group cannot be deleted until all pending settlements ({optimizedDebts.length}) are completed.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('balances')}
                    className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-amber-600 text-white hover:bg-amber-700 shrink-0 cursor-pointer"
                  >
                    View Balances
                  </button>
                </div>
              ) : !showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-1.5 text-[11px] font-semibold text-rose-600 border border-rose-300 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 active:scale-[0.97] rounded-lg transition-all cursor-pointer"
                >
                  Delete Group
                </button>
              ) : (
                <div className="flex items-center gap-2 p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-[11px] text-rose-700 dark:text-rose-300">
                  <span>Are you sure?</span>
                  <button
                    onClick={() => onDeleteGroup(group.id)}
                    className="px-2.5 py-1 bg-rose-600 text-white font-bold rounded-md hover:bg-rose-700 active:scale-[0.96] transition-all cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-2 py-1 text-[var(--ink-secondary)] hover:underline cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unified Share & QR Invite Modal */}
      <ShareGroupModal
        isOpen={isInviteModalOpen}
        group={group}
        language={language}
        onClose={() => setIsInviteModalOpen(false)}
      />
    </div>
  );
};
