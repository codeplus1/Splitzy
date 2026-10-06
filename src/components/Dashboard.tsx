import React from 'react';
import {
  Users,
  Plus,
  TrendingUp,
  Calendar,
  ChevronRight,
  ArrowRight,
  KeyRound,
  Check,
  Pencil,
} from 'lucide-react';
import { Group, Member, GroupMember, Expense, ExpenseShare, SettlementRecord, SupportedLanguage } from '../types';
import { translate } from '../core/i18n';
import { formatMoney } from '../core/currency';
import { calculateMemberBalances } from '../core/calculation';
import { MemberAvatar } from './MemberAvatar';

interface DashboardProps {
  groups: Group[];
  members: Member[];
  groupMembers?: GroupMember[];
  expenses: Expense[];
  expenseShares: ExpenseShare[];
  settlements: SettlementRecord[];
  currentUserId: string;
  onEditUserClick?: () => void;
  onSelectGroup: (groupId: string) => void;
  onCreateGroupClick: () => void;
  onJoinGroupClick?: () => void;
  language: SupportedLanguage;
}

export const Dashboard: React.FC<DashboardProps> = ({
  groups,
  members,
  groupMembers = [],
  expenses,
  expenseShares,
  settlements,
  currentUserId,
  onEditUserClick,
  onSelectGroup,
  onCreateGroupClick,
  onJoinGroupClick,
  language,
}) => {
  const isFrench = language === 'fr';

  const currentMember = members.find(m => m.id === currentUserId) || members[0] || {
    id: 'user_1',
    name: 'You',
  };

  // Group balances by currency to prevent cross-currency mixing
  const balancesByCurrency = new Map<string, { net: number; paid: number; share: number }>();

  groups.forEach(group => {
    const groupMemberIdSet = new Set(
      groupMembers.filter(gm => gm.groupId === group.id).map(gm => gm.memberId)
    );
    const groupSpecificMembers = members.filter(m => groupMemberIdSet.has(m.id));
    const effectiveMembers =
      groupSpecificMembers.length > 0 ? groupSpecificMembers : [currentMember];

    const groupExpenses = expenses.filter(e => e.groupId === group.id);
    const groupShares = expenseShares.filter(s =>
      groupExpenses.some(e => e.id === s.expenseId)
    );
    const groupSettlements = settlements.filter(s => s.groupId === group.id);
    const balances = calculateMemberBalances(
      effectiveMembers,
      groupExpenses,
      groupShares,
      groupSettlements
    );

    const userBal = balances.find(b => b.memberId === currentUserId);
    if (userBal) {
      const curr = group.baseCurrency;
      const prev = balancesByCurrency.get(curr) || { net: 0, paid: 0, share: 0 };
      balancesByCurrency.set(curr, {
        net: prev.net + userBal.netBalance,
        paid: prev.paid + userBal.totalPaid,
        share: prev.share + userBal.totalShare,
      });
    }
  });

  const currencyList = Array.from(balancesByCurrency.entries());
  const isMultiCurrency = currencyList.length > 1;
  const primaryCurrencyEntry = currencyList[0] || [groups[0]?.baseCurrency || 'CAD', { net: 0, paid: 0, share: 0 }];
  const [primaryCurrency, primaryTotals] = primaryCurrencyEntry;

  // Splitzy Hero when no groups exist
  if (groups.length === 0) {
    return (
      <div id="welcome-hero-container" className="space-y-8">
        {/* Cover Hero */}
        <div className="ui-card relative overflow-hidden p-5 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left Copy */}
            <div className="lg:col-span-7 space-y-4">
              <span className="inline-block text-[11px] font-semibold tracking-wide text-[var(--accent)]">
                {isFrench ? 'Amis · colocs · couples' : 'Friends · roommates · couples'}
              </span>

              <h1 className="text-2xl sm:text-3xl font-bold font-display text-[var(--ink)] tracking-tight leading-[1.15]">
                {isFrench ? 'On sépare la facture. On garde le moment.' : 'Split the bill. Keep the moment.'}
              </h1>

              <p className="text-xs sm:text-[13px] text-[var(--ink-secondary)] leading-relaxed max-w-xl">
                {isFrench
                  ? 'Splitzy suit les dépenses que vous partagez avec vos amis, vos colocs ou votre moitié. Scannez un reçu, partagez à votre façon et réglez sans calcul mental.'
                  : 'Splitzy tracks the expenses you share with friends, roommates, or your partner. Scan a receipt, split it your way, and settle up — no spreadsheets, no mental math.'}
              </p>

              {/* Call to Actions */}
              <div className="pt-1 flex flex-wrap items-center gap-2.5">
                <button
                  id="hero-create-first-group-btn"
                  onClick={onCreateGroupClick}
                  className="ui-btn-primary group px-4 py-2 text-xs shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-200" />
                  <span>{isFrench ? 'Créer un premier groupe' : 'Start your first group'}</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5 group-hover:translate-x-0.5 transition-transform" />
                </button>

                {onJoinGroupClick && (
                  <button
                    id="hero-join-group-btn"
                    onClick={onJoinGroupClick}
                    className="ui-btn-secondary group px-3.5 py-2 text-xs whitespace-nowrap shrink-0"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 group-hover:rotate-12 transition-transform" />
                    <span className="whitespace-nowrap">{isFrench ? 'Rejoindre un groupe' : 'Join Group'}</span>
                  </button>
                )}
              </div>

              <p className="text-[11px] text-[var(--ink-muted)] leading-normal">
                {isFrench
                  ? 'Entièrement synchronisé, respectueux de la vie privée — aucun compte bancaire lié.'
                  : 'Fast, clean, private — no bank connections required, real-time cloud sync.'}
              </p>
            </div>

            {/* Right: Splitzy Simulated Interactive Receipt Frame */}
            <div className="lg:col-span-5">
              <div className="ui-subcard relative p-4 overflow-hidden">
                <div className="scan-beam"></div>

                <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border)]">
                  <span className="font-mono text-[11px] font-semibold tracking-wider text-[var(--ink)]">
                    Chez Nico
                  </span>
                  <span className="text-[11px] text-[var(--ink-muted)] font-mono">
                    Table 7 · 21:47
                  </span>
                </div>

                <div className="py-2.5 space-y-1.5 text-[11px] font-mono">
                  <div className="flex justify-between text-[var(--ink)]">
                    <span>Burrata</span>
                    <span className="font-semibold tnum">16.00</span>
                  </div>
                  <div className="flex justify-between text-[var(--ink)]">
                    <span>Tagliatelle</span>
                    <span className="font-semibold tnum">24.00</span>
                  </div>
                  <div className="flex justify-between text-[var(--ink)]">
                    <span>Negroni ×2</span>
                    <span className="font-semibold tnum">30.00</span>
                  </div>
                  <div className="flex justify-between text-[var(--ink)]">
                    <span>Tiramisu</span>
                    <span className="font-semibold tnum">12.00</span>
                  </div>
                  <div className="flex justify-between text-[var(--ink-muted)] pt-1 border-t border-dashed border-[var(--border)]">
                    <span>Taxes & tip</span>
                    <span className="tnum">20.00</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-[var(--ink)] pt-1">
                    <span>Total</span>
                    <span className="tnum">$102.00</span>
                  </div>
                </div>

                <div className="mt-2.5 p-2 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-between text-[11px] text-[var(--accent)]">
                  <span className="font-medium tnum">
                    {isFrench ? 'Partagé en 3 — 34,00 $ chacun' : 'Split 3 ways — $34.00 each'}
                  </span>
                  <Check className="w-3.5 h-3.5 text-[var(--accent)]" />
                </div>
              </div>
              <p className="text-[11px] text-[var(--ink-muted)] text-center mt-2 italic">
                {isFrench ? 'Le reçu est déjà lu et calculé.' : 'The receipt reads itself.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isPositive = primaryTotals.net > 0.005;
  const isNegative = primaryTotals.net < -0.005;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Top Banner: Compact Deep Wine / Faded Rose-Blended Burgundy Card */}
      <div className="bg-gradient-to-br from-[#2B0814] via-[#4A1228] to-[#7A2346] dark:from-[#220610] dark:via-[#3B0E20] dark:to-[#631B38] rounded-xl px-3.5 py-[25px] sm:px-4 sm:py-[27px] text-white shadow-[0_8px_24px_rgba(90,20,48,0.18)] relative overflow-hidden border border-[#7E2B4B]/60">
        {/* Soft Faded Pink / Rose Ambient Glow Blend */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-10 w-56 h-56 rounded-full bg-[#F7A8B7]/20 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-14 left-1/3 w-48 h-36 rounded-full bg-[#EDA6B4]/15 blur-2xl"
        />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left Side: Label + Balance Amount */}
          <div className="space-y-2">
            {/* Header Row: OVERALL NET BALANCE */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.06em] font-bold text-[#DEC2CA]">
                {translate(language, 'overallBalance')}
              </span>
            </div>

            {/* Compact Amount Row: Rs 0.00 All balances settled up! */}
            <div className="flex items-baseline gap-2 flex-wrap">
              <div className="text-lg sm:text-xl font-bold tracking-tight text-[#FFD4DF] tnum amount-val leading-none">
                {formatMoney(Math.abs(primaryTotals.net), primaryCurrency, language)}
              </div>
              <span className="text-[11px] font-medium text-[#E5C4CE]">
                {groups.length === 0
                  ? 'No active groups'
                  : isPositive
                  ? (isFrench ? 'On vous doit' : 'You are owed')
                  : isNegative
                  ? (isFrench ? 'Vous devez' : 'You owe')
                  : translate(language, 'allSettled')}
              </span>
            </div>

            {/* Secondary currencies if any */}
            {isMultiCurrency && (
              <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                <span className="text-[10px] text-[#DEC2CA] font-medium">
                  {isFrench ? 'Autres devises :' : 'Other currencies:'}
                </span>
                {currencyList.slice(1).map(([curr, totals]) => (
                  <span
                    key={curr}
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#381221]/85 text-[#FFD4DF] border border-[#7A354E] tnum amount-val"
                  >
                    {totals.net > 0 ? '+' : ''}
                    {formatMoney(totals.net, curr, language)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right / Bottom Compact Pill: Total Paid */}
          <div className="bg-[#34101E]/80 backdrop-blur-xs rounded-lg px-2.5 py-1.5 border border-[#75324A] inline-flex items-center sm:flex-col sm:items-end justify-between gap-2 sm:gap-0.5 self-start sm:self-auto shrink-0">
            <div className="flex items-center gap-1 text-[#DFBBC6] text-[10px]">
              <TrendingUp className="w-3 h-3 text-[#F78CA7]" />
              <span className="font-medium">{translate(language, 'memberStatsPaid')}</span>
            </div>
            <div className="text-xs sm:text-sm font-bold text-white tnum amount-val tracking-tight">
              {formatMoney(primaryTotals.paid, primaryCurrency, language)}
            </div>
          </div>
        </div>
      </div>

      {/* Active Groups Section */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <Users className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <h2 className="text-sm sm:text-lg font-bold text-[var(--ink)] tracking-tight leading-tight truncate">
              {translate(language, 'activeGroups')}
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-[var(--surface-subtle)] border border-[var(--border)] text-[11px] font-bold font-mono text-[var(--ink)] flex items-center justify-center shrink-0">
              {groups.length}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onJoinGroupClick && (
              <button
                id="dashboard-join-group-btn"
                onClick={onJoinGroupClick}
                className="ui-btn-secondary group px-3 py-1.5 text-xs whitespace-nowrap shrink-0"
                title="Join a private group with invite code"
              >
                <KeyRound className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 group-hover:rotate-12 transition-transform" />
                <span className="whitespace-nowrap">{isFrench ? 'Rejoindre un groupe' : 'Join Group'}</span>
              </button>
            )}

            <button
              id="dashboard-new-group-btn"
              onClick={onCreateGroupClick}
              className="ui-btn-primary group px-3.5 py-1.5 text-xs whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 shrink-0 group-hover:rotate-90 transition-transform duration-200" />
              <span className="whitespace-nowrap">{translate(language, 'newGroup')}</span>
            </button>
          </div>
        </div>

        {/* Groups List / Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map(group => {
            const currentGroupMemberIds = groupMembers
              .filter(gm => gm.groupId === group.id)
              .map(gm => gm.memberId);
            const groupParticipants = members.filter(m =>
              currentGroupMemberIds.includes(m.id)
            );
            const cardMembers =
              groupParticipants.length > 0 ? groupParticipants : [currentMember];

            const groupExpenses = expenses.filter(e => e.groupId === group.id);
            const totalGroupBaseAmount = groupExpenses.reduce((acc, e) => acc + e.baseAmount, 0);

            const groupShares = expenseShares.filter(s =>
              groupExpenses.some(e => e.id === s.expenseId)
            );
            const groupSettlements = settlements.filter(s => s.groupId === group.id);
            const balances = calculateMemberBalances(
              cardMembers,
              groupExpenses,
              groupShares,
              groupSettlements
            );

            const userBalance = balances.find(b => b.memberId === currentUserId);
            const userNet = userBalance?.netBalance || 0;

            return (
              <div
                key={group.id}
                id={`group-card-${group.id}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelectGroup(group.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectGroup(group.id);
                  }
                }}
                className="group relative bg-[var(--surface)] rounded-2xl p-4 sm:p-5 border border-[var(--border)] hover:border-[var(--accent)]/40 shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all cursor-pointer flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              >
                <div>
                  {/* Top Row: Group Name and Circular Arrow Button */}
                  <div className="flex items-start justify-between gap-2.5 mb-2">
                    <h3 className="font-sans font-bold text-base sm:text-[17px] text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors leading-snug tracking-tight">
                      {group.name}
                    </h3>

                    <div className="w-7 h-7 rounded-full bg-[var(--surface-subtle)] text-[var(--ink-muted)] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 flex items-center justify-center transition-all shrink-0">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Badges Row: [ MUR ]  📅 AD  [ #E2FDH7 ] */}
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[var(--surface-subtle)] text-[var(--ink)] border border-[var(--border-subtle)]">
                      {group.baseCurrency}
                    </span>
                    <span className="text-[11px] font-medium px-1 py-0.5 text-[var(--ink-secondary)] inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[var(--ink-muted)]" />
                      {group.preferredCalendar}
                    </span>
                    {group.inviteCode && (
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]">
                        #{group.inviteCode}
                      </span>
                    )}
                  </div>

                  {/* Total Group Expenses Box */}
                  <div className="mb-4 py-2.5 px-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border-subtle)] flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--ink-secondary)] font-medium">
                      {translate(language, 'totalExpenses')}
                    </span>
                    <span className="text-sm font-bold text-[var(--ink)] tnum amount-val">
                      {formatMoney(totalGroupBaseAmount, group.baseCurrency, language)}
                    </span>
                  </div>
                </div>

                {/* Footer: Overlapping Member avatars & Personal balance */}
                <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center -space-x-1.5">
                    {cardMembers.slice(0, 4).map(m => (
                      <MemberAvatar
                        key={m.id}
                        name={m.name}
                        avatar={m.avatar}
                        color={m.color}
                        size="sm"
                        className="w-7 h-7 text-xs ring-2 ring-[var(--accent-border)] group-hover:scale-105 transition-transform"
                      />
                    ))}
                    {cardMembers.length > 4 && (
                      <div className="w-7 h-7 rounded-full bg-[var(--surface-subtle)] text-[10px] font-bold text-[var(--ink)] flex items-center justify-center ring-2 ring-[var(--surface)]">
                        +{cardMembers.length - 4}
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-xs sm:text-sm font-bold tnum amount-val ${
                        userNet > 0.005
                          ? 'text-[var(--accent)]'
                          : userNet < -0.005
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-[var(--ink-muted)]'
                      }`}
                    >
                      {userNet > 0.005 ? '+' : ''}
                      {formatMoney(userNet, group.baseCurrency, language)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
