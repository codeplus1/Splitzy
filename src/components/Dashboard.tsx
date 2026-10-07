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
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { Group, Member, GroupMember, Expense, ExpenseShare, SettlementRecord, SupportedLanguage } from '../types';
import { translate } from '../core/i18n';
import { formatMoney } from '../core/currency';
import { calculateMemberBalances } from '../core/calculation';
import { getGroupCleanupCountdownInfo } from '../core/retention';
import { MemberAvatar } from './MemberAvatar';
import { SplitzeLogo } from './SplitzeLogo';

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

  // Splitze Hero when no groups exist
  if (groups.length === 0) {
    return (
      <div id="welcome-hero-container" className="space-y-8">
        {/* Cover Hero */}
        <div className="ui-card relative overflow-hidden p-5 sm:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left Copy */}
            <div className="lg:col-span-7 space-y-4">
              {/* Full Logo + Secondary Tagline */}
              <div className="space-y-1.5">
                <SplitzeLogo variant="horizontal" size="md" />
                <p className="text-xs font-semibold tracking-wide text-[#087F5B] dark:text-[#63E6BE]">
                  Split smart. Stay even.
                </p>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold font-display text-[var(--ink)] tracking-tight leading-[1.15]">
                {isFrench ? 'Partagez intelligemment. Restez quittes.' : 'Split smart. Stay even.'}
              </h1>

              <p className="text-xs sm:text-[13px] text-[var(--ink-secondary)] leading-relaxed max-w-xl">
                {isFrench
                  ? 'Splitze suit les dépenses que vous partagez avec vos amis, vos colocs ou votre moitié. Scannez un reçu, partagez à votre façon et réglez sans calcul mental.'
                  : 'Splitze tracks the expenses you share with friends, roommates, or travel groups. Scan a receipt, split it your way, and settle up — no spreadsheets, no mental math.'}
              </p>

              {/* Call to Actions */}
              <div className="pt-1 flex flex-wrap items-center gap-2.5">
                <button
                  id="hero-create-first-group-btn"
                  onClick={onCreateGroupClick}
                  className="ui-btn-primary group px-4 py-2 text-xs shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-200" />
                  <span>{isFrench ? 'Créer un groupe' : 'Create Group'}</span>
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

            {/* Right: Splitze Simulated Interactive Receipt Frame */}
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

                {/* Mint Green surface with Dark Navy text (#101D2D) for WCAG AA+ contrast */}
                <div className="mt-2.5 p-2 rounded-lg bg-[#63E6BE] border border-[#38D9A9] flex items-center justify-between text-[11px] text-[#101D2D]">
                  <span className="font-bold tnum">
                    {isFrench ? 'Partagé en 3 — 34,00 $ chacun' : 'Split 3 ways — $34.00 each'}
                  </span>
                  <Check className="w-3.5 h-3.5 text-[#101D2D]" />
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
      {/* Top Banner: Splitze Primary Navy (#101D2D) & Mint Green (#63E6BE) Fintech Summary Card */}
      <div className="bg-gradient-to-br from-[#101D2D] via-[#152436] to-[#0B1420] rounded-xl px-4 py-5 sm:px-5 sm:py-6 text-white shadow-[0_8px_24px_rgba(16,29,45,0.2)] relative overflow-hidden border border-[#63E6BE]/25">
        {/* Mint Green Ambient Glow Blend */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-10 w-56 h-56 rounded-full bg-[#63E6BE]/15 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-14 left-1/3 w-48 h-36 rounded-full bg-[#63E6BE]/10 blur-2xl"
        />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left Side: Label + Balance Amount */}
          <div className="space-y-2">
            {/* Header Row: OVERALL NET BALANCE */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.06em] font-bold text-[#8B9AAF]">
                {translate(language, 'overallBalance')}
              </span>
            </div>

            {/* Compact Amount Row */}
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-[#63E6BE] tnum amount-val leading-none">
                {formatMoney(Math.abs(primaryTotals.net), primaryCurrency, language)}
              </div>
              <span className="text-xs font-medium text-[#FFFFFF]/85">
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
                <span className="text-[10px] text-[#8B9AAF] font-medium">
                  {isFrench ? 'Autres devises :' : 'Other currencies:'}
                </span>
                {currencyList.slice(1).map(([curr, totals]) => (
                  <span
                    key={curr}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#152436] text-[#63E6BE] border border-[#63E6BE]/30 tnum amount-val"
                  >
                    {totals.net > 0 ? '+' : ''}
                    {formatMoney(totals.net, curr, language)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right / Bottom Compact Pill: Total Paid */}
          <div className="bg-[#152436]/90 backdrop-blur-xs rounded-lg px-3 py-2 border border-[#63E6BE]/25 inline-flex items-center sm:flex-col sm:items-end justify-between gap-2 sm:gap-0.5 self-start sm:self-auto shrink-0">
            <div className="flex items-center gap-1 text-[#8B9AAF] text-[10px]">
              <TrendingUp className="w-3 h-3 text-[#63E6BE]" />
              <span className="font-medium">{translate(language, 'memberStatsPaid')}</span>
            </div>
            <div className="text-xs sm:text-sm font-bold text-white tnum amount-val tracking-tight">
              {formatMoney(primaryTotals.paid, primaryCurrency, language)}
            </div>
          </div>
        </div>
      </div>

      {/* Active Groups Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-base sm:text-lg font-bold font-display text-[var(--ink)] tracking-tight leading-tight truncate">
              {translate(language, 'activeGroups')}
            </h2>
            <span className="text-xs font-mono font-semibold text-[var(--ink-muted)] tnum shrink-0">
              · {groups.length}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onJoinGroupClick && (
              <button
                id="dashboard-join-group-btn"
                onClick={onJoinGroupClick}
                className="ui-btn-secondary group h-9 px-3.5 text-xs whitespace-nowrap shrink-0"
                title="Join a private group with invite code"
              >
                <KeyRound className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span className="whitespace-nowrap">{isFrench ? 'Rejoindre un groupe' : 'Join Group'}</span>
              </button>
            )}

            <button
              id="dashboard-new-group-btn"
              onClick={onCreateGroupClick}
              className="ui-btn-primary group h-9 px-4 text-xs whitespace-nowrap shrink-0"
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
            const countdown = getGroupCleanupCountdownInfo(group);

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
                className="group relative bg-[var(--surface)] rounded-2xl p-5 border border-[var(--border)] hover:border-[var(--border-strong)] shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              >
                <div>
                  {/* Top Row: Group Name and Chevron */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <h3 className="font-display font-bold text-base sm:text-[17px] text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors leading-snug tracking-tight truncate">
                        {group.name}
                      </h3>

                      {/* Unboxed Metadata Line (Zero-Pill Discipline) */}
                      <div className="flex items-center gap-1.5 flex-wrap text-xs text-[var(--ink-secondary)]">
                        <span className="font-mono font-semibold text-[var(--ink)]">
                          {group.baseCurrency}
                        </span>
                        <span aria-hidden="true" className="text-[var(--ink-muted)]">·</span>
                        <span>{group.preferredCalendar}</span>
                        {group.inviteCode && (
                          <>
                            <span aria-hidden="true" className="text-[var(--ink-muted)]">·</span>
                            <span className="font-mono text-[var(--ink-secondary)]">
                              #{group.inviteCode}
                            </span>
                          </>
                        )}
                        {group.settled && (
                          <>
                            <span aria-hidden="true" className="text-[var(--ink-muted)]">·</span>
                            <span className="inline-flex items-center gap-1 font-semibold text-[#087F5B] dark:text-[#63E6BE]">
                              {group.keepGroup ? (
                                <>
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>Settled (Kept)</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    Settled · {countdown.remainingDays ?? 15}d left
                                  </span>
                                </>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-[var(--ink-muted)] group-hover:text-[var(--ink)] group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                  </div>

                  {/* Total Group Spend Row (Hairline separation instead of nested box) */}
                  <div className="mt-4 pt-3.5 border-t border-[var(--border-subtle)] flex items-baseline justify-between gap-2">
                    <span className="text-xs text-[var(--ink-secondary)]">
                      {translate(language, 'totalExpenses')} ({groupExpenses.length})
                    </span>
                    <span className="text-sm font-bold text-[var(--ink)] tnum amount-val">
                      {formatMoney(totalGroupBaseAmount, group.baseCurrency, language)}
                    </span>
                  </div>
                </div>

                {/* Footer: Overlapping Member avatars & Personal net position */}
                <div className="mt-3.5 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex items-center -space-x-1.5 shrink-0">
                      {cardMembers.slice(0, 4).map(m => (
                        <MemberAvatar
                          key={m.id}
                          name={m.name}
                          avatar={m.avatar}
                          color={m.color}
                          size="sm"
                          className="w-6 h-6 text-[11px] ring-2 ring-[var(--surface)]"
                        />
                      ))}
                      {cardMembers.length > 4 && (
                        <div className="w-6 h-6 rounded-full bg-[var(--surface-subtle)] text-[10px] font-bold text-[var(--ink)] flex items-center justify-center ring-2 ring-[var(--surface)]">
                          +{cardMembers.length - 4}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--ink-muted)] truncate">
                      {cardMembers.length} {cardMembers.length === 1 ? 'member' : 'members'}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs sm:text-[13px] font-bold tnum amount-val ${
                        userNet > 0.005
                          ? 'text-[#087F5B] dark:text-[#63E6BE]'
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
