import React, { useState } from 'react';
import { X, PieChart, TrendingUp, TrendingDown, Calendar, Wallet, CheckCircle2, ShieldCheck, Tag } from 'lucide-react';
import { Group, Member, Expense, ExpenseShare, SupportedLanguage } from '../types';
import { formatMoney, SUPPORTED_CURRENCIES, getDefaultExchangeRate } from '../core/currency';

interface PersonalInsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
  members: Member[];
  expenses: Expense[];
  expenseShares: ExpenseShare[];
  currentUserId: string;
  language: SupportedLanguage;
}

export const PersonalInsightsModal: React.FC<PersonalInsightsModalProps> = ({
  isOpen,
  onClose,
  groups,
  members,
  expenses,
  expenseShares,
  currentUserId,
  language,
}) => {
  const [selectedCurrency, setSelectedCurrency] = useState('CAD');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  if (!isOpen) return null;

  const isFrench = language === 'fr';

  // Find all expenses where current user paid or participated
  const userShares = expenseShares.filter(s => s.memberId === currentUserId);
  const userExpenseIds = new Set(userShares.map(s => s.expenseId));

  // Compute spend by category and monthly totals converted to selected home currency
  const categoryTotals: Record<string, number> = {};
  let totalPersonalShare = 0;
  let totalPersonalPaid = 0;

  const availableMonths = new Set<string>();

  expenses.forEach(exp => {
    const expMonth = exp.dateISO.substring(0, 7); // 'YYYY-MM'
    availableMonths.add(expMonth);

    if (selectedMonth !== 'all' && expMonth !== selectedMonth) {
      return;
    }

    const share = userShares.find(s => s.expenseId === exp.id);
    const didPay = exp.paidBy === currentUserId;

    // Rate to selected currency:
    // exp.baseAmount is in group's base currency.
    const group = groups.find(g => g.id === exp.groupId);
    const groupCurrency = group?.baseCurrency || 'CAD';
    const rateToHome = getDefaultExchangeRate(groupCurrency, selectedCurrency);

    if (share) {
      const shareInHome = (share.shareAmount || 0) * rateToHome;
      totalPersonalShare += shareInHome;

      const cat = exp.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + shareInHome;
    }

    if (didPay) {
      const paidInHome = (exp.baseAmount || exp.originalAmount || 0) * rateToHome;
      totalPersonalPaid += paidInHome;
    }
  });

  const netBalance = totalPersonalPaid - totalPersonalShare;
  const categoriesList = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1420]/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#152436] rounded-3xl shadow-2xl border border-[var(--border)] overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-5 bg-[#F5F7FA] dark:bg-[#101D2D] border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#101D2D] dark:bg-[#63E6BE] text-[#63E6BE] dark:text-[#101D2D] flex items-center justify-center shadow-xs">
              <PieChart className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8B9AAF]">
                {isFrench ? '№ 03 — L’avantage discret' : '№ 03 — The quiet advantage'}
              </span>
              <h2 className="text-xl font-bold font-display text-[#101D2D] dark:text-white">
                {isFrench ? 'Pendant que les autres devinent, vous savez.' : 'While everyone else guesses, you’ll know.'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#8B9AAF] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto">
          {/* Controls: Currency & Month */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#F5F7FA] dark:bg-[#0B1420]/70 border border-[var(--border)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#8B9AAF]">
                {isFrench ? 'Devise principale :' : 'Home Currency:'}
              </span>
              <div className="flex gap-1">
                {['CAD', 'USD', 'EUR', 'NPR', 'INR'].map(cur => (
                  <button
                    key={cur}
                    onClick={() => setSelectedCurrency(cur)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                      selectedCurrency === cur
                        ? 'bg-[#63E6BE] text-[#101D2D]'
                        : 'bg-white dark:bg-[#152436] text-[#101D2D] dark:text-white border border-[var(--border)]'
                    }`}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>

            {availableMonths.size > 0 && (
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-[#8B9AAF]" />
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-[#152436] border border-[var(--border)] text-[#101D2D] dark:text-white"
                >
                  <option value="all">{isFrench ? 'Tous les mois' : 'All months'}</option>
                  {Array.from(availableMonths)
                    .sort()
                    .reverse()
                    .map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {/* Key Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0B1420]/80 border border-[var(--border)]">
              <span className="text-xs font-medium text-[#8B9AAF]">
                {isFrench ? 'Votre part de dépenses' : 'Your Total Share'}
              </span>
              <p className="text-2xl font-bold text-[#101D2D] dark:text-white mt-1 tnum amount-val">
                {formatMoney(totalPersonalShare, selectedCurrency, language)}
              </p>
              <span className="text-[11px] text-[#8B9AAF]">
                {isFrench ? 'Votre part réelle' : 'What belonged to you'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#0B1420]/80 border border-[var(--border)]">
              <span className="text-xs font-medium text-[#8B9AAF]">
                {isFrench ? 'Total que vous avez payé' : 'You Paid Out'}
              </span>
              <p className="text-2xl font-bold text-[#101D2D] dark:text-[#63E6BE] mt-1 tnum amount-val">
                {formatMoney(totalPersonalPaid, selectedCurrency, language)}
              </p>
              <span className="text-[11px] text-[#8B9AAF]">
                {isFrench ? 'Avancé pour le groupe' : 'Fronted for the group'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#0B1420]/80 border border-[var(--border)]">
              <span className="text-xs font-medium text-[#8B9AAF]">
                {isFrench ? 'Solde net' : 'Net Position'}
              </span>
              <p
                className={`text-2xl font-bold mt-1 tnum amount-val ${
                  netBalance >= 0
                    ? 'text-[#087F5B] dark:text-[#63E6BE]'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {netBalance >= 0 ? '+' : ''}
                {formatMoney(netBalance, selectedCurrency, language)}
              </p>
              <span className="text-[11px] text-[#8B9AAF]">
                {netBalance >= 0
                  ? isFrench ? 'On vous doit' : 'You are owed'
                  : isFrench ? 'Vous devez' : 'You owe'}
              </span>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#101D2D] dark:text-white">
              {isFrench ? 'Dépenses par catégorie' : 'Spending by Category'}
            </h3>
            {categoriesList.length === 0 ? (
              <p className="text-xs text-[#8B9AAF] py-4 text-center">
                {isFrench ? 'Aucune dépense enregistrée.' : 'No expenses recorded yet.'}
              </p>
            ) : (
              <div className="space-y-2">
                {categoriesList.map(([cat, amount]) => {
                  const pct = totalPersonalShare > 0 ? (amount / totalPersonalShare) * 100 : 0;
                  return (
                    <div
                      key={cat}
                      className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#0B1420]/70 border border-[var(--border)] space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#101D2D] dark:text-white">
                          {cat}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[#8B9AAF]">
                            {pct.toFixed(0)}%
                          </span>
                          <span className="font-bold text-[#101D2D] dark:text-white tnum">
                            {formatMoney(amount, selectedCurrency, language)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-[var(--border)] h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#101D2D] dark:bg-[#63E6BE] h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(3, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Privacy Note */}
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#63E6BE]/15 border border-[#63E6BE]/40 text-xs text-[#101D2D] dark:text-[#63E6BE]">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {isFrench
                ? 'Les dépenses personnelles restent strictement privées. En fin de mois, aucun mystère — juste une vue limpide de vos sorties.'
                : 'Personal expenses stay private, just for you. So at the end of the month there’s no mystery — just a clear picture of where it went.'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#F5F7FA] dark:bg-[#101D2D] border-t border-[var(--border)] flex justify-end">
          <button
            onClick={onClose}
            className="ui-btn ui-btn-primary px-5 py-2.5 text-sm font-semibold rounded-xl"
          >
            {isFrench ? 'Fermer' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
