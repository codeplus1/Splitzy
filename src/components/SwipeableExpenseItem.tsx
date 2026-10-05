import React, { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { Edit2, Trash2, Calendar, FileImage } from 'lucide-react';
import { Expense, Group, Member, ExpenseShare, SupportedLanguage } from '../types';
import { MemberAvatar } from './MemberAvatar';
import { ReceiptViewerModal } from './ReceiptViewerModal';
import { formatMoney } from '../core/currency';
import { formatDualDate } from '../core/nepaliCalendar';
import { translate } from '../core/i18n';

interface SwipeableExpenseItemProps {
  expense: Expense;
  group: Group;
  members: Member[];
  groupShares: ExpenseShare[];
  language: SupportedLanguage;
  onEdit: (expense: Expense, shares: ExpenseShare[]) => void;
  onDelete?: (expenseId: string) => void;
}

export const SwipeableExpenseItem: React.FC<SwipeableExpenseItemProps> = ({
  expense,
  group,
  members,
  groupShares,
  language,
  onEdit,
  onDelete,
}) => {
  const [showReceiptViewer, setShowReceiptViewer] = useState(false);
  const payer = members.find(m => m.id === expense.paidBy);
  const expenseParticipantShares = groupShares.filter(s => s.expenseId === expense.id);
  const participantMembers = members.filter(m =>
    expenseParticipantShares.some(s => s.memberId === m.id)
  );
  const dualDate = formatDualDate(expense.dateISO, group.preferredCalendar);
  const isMultiCurrency =
    expense.originalCurrency.toUpperCase() !== group.baseCurrency.toUpperCase();

  const x = useMotionValue(0);
  const backgroundOpacity = useTransform(x, [0, -30, -90], [0.4, 0.8, 1]);
  const iconScale = useTransform(x, [0, -40, -90], [0.85, 1, 1.15]);

  const handleTriggerEdit = () => {
    onEdit(expense, expenseParticipantShares);
  };

  return (
    <div
      id={`expense-row-${expense.id}`}
      className="relative overflow-hidden rounded-xl bg-[var(--accent)] select-none"
    >
      {/* Background Action revealed on mobile swipe */}
      <motion.div
        style={{ opacity: backgroundOpacity }}
        onClick={handleTriggerEdit}
        className="absolute inset-y-0 right-0 w-24 bg-[var(--accent)] hover:bg-[var(--accent-hover)] flex flex-col items-center justify-center text-white cursor-pointer px-2 transition-colors z-0"
        title="Edit expense"
      >
        <motion.div style={{ scale: iconScale }} className="flex flex-col items-center gap-1">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <Edit2 className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-[10px] font-bold tracking-wide uppercase">
            {translate(language, 'editExpense')}
          </span>
        </motion.div>
      </motion.div>

      {/* Draggable Foreground Expense Card */}
      <motion.div
        id={`expense-item-${expense.id}`}
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.12}
        onDragEnd={(_, info) => {
          if (info.offset.x < -85 || info.velocity.x < -350) {
            handleTriggerEdit();
          }
        }}
        className="relative z-10 bg-[var(--surface)] rounded-xl p-3 sm:p-3.5 border border-[var(--border)] hover:border-[var(--accent)]/40 hover:-translate-y-[1px] hover:shadow-xs transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 touch-pan-y cursor-grab active:cursor-grabbing group"
      >
        {/* Left details */}
        <div className="flex items-start gap-3 min-w-0">
          {payer && (
            <div className="relative pt-0.5 flex-shrink-0">
              <MemberAvatar
                name={payer.name}
                avatar={payer.avatar}
                color={payer.color}
                size="sm"
              />
            </div>
          )}

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-bold text-xs sm:text-sm text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors truncate tracking-tight">
                {expense.title}
              </h4>
              {expense.category && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--surface-subtle)] text-[var(--ink-secondary)] border border-[var(--border-subtle)]">
                  {expense.category}
                </span>
              )}
              {expense.receiptUrl && (
                <button
                  type="button"
                  id={`view-receipt-btn-${expense.id}`}
                  onClick={e => {
                    e.stopPropagation();
                    setShowReceiptViewer(true);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 active:scale-[0.96] text-[10px] font-semibold border border-emerald-200 dark:border-emerald-800 transition-all cursor-pointer"
                  title="Click to view attached receipt"
                >
                  <FileImage className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Receipt</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--ink-secondary)]">
              <span>
                {translate(language, 'paidBy')}{' '}
                <strong className="font-semibold text-[var(--ink)]">
                  {payer?.name || 'Unknown'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span title={dualDate.secondary} className="inline-flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5 text-[var(--ink-muted)]" />
                {dualDate.primary}
              </span>
              {expense.notes && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="italic text-[var(--ink-muted)] max-w-[180px] truncate">
                    "{expense.notes}"
                  </span>
                </>
              )}
            </div>

            {/* Participants breakdown */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-[10px] text-[var(--ink-muted)] font-medium">
                For:
              </span>
              <div className="flex items-center -space-x-1">
                {participantMembers.map(pm => (
                  <MemberAvatar
                    key={pm.id}
                    name={pm.name}
                    avatar={pm.avatar}
                    color={pm.color}
                    size="sm"
                    className="w-4 h-4 text-[9px] ring-1 ring-[var(--surface)]"
                  />
                ))}
              </div>
              <span className="text-[10px] text-[var(--ink-secondary)] font-medium ml-0.5">
                ({participantMembers.length}{' '}
                {participantMembers.length === members.length ? 'all' : 'people'})
              </span>
            </div>
          </div>
        </div>

        {/* Right: Amounts & Actions */}
        <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--border-subtle)] shrink-0">
          <div className="text-left sm:text-right">
            <div className="text-sm sm:text-base font-bold text-[var(--ink)] tnum amount-val">
              {formatMoney(expense.baseAmount, group.baseCurrency, language)}
            </div>

            {isMultiCurrency && (
              <div className="text-[10px] text-[var(--ink-secondary)] tnum amount-val">
                {formatMoney(expense.originalAmount, expense.originalCurrency, language)} @{' '}
                {expense.exchangeRate}
              </div>
            )}
          </div>

          {/* Edit & Delete Buttons */}
          <div className="flex items-center gap-0.5">
            <button
              id={`edit-expense-${expense.id}`}
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleTriggerEdit();
              }}
              className="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-subtle)] active:scale-[0.94] rounded-lg transition-all cursor-pointer"
              title={translate(language, 'editExpense')}
              aria-label={translate(language, 'editExpense')}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            {onDelete && (
              <button
                id={`delete-expense-${expense.id}`}
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onDelete(expense.id);
                }}
                className="p-1.5 text-[var(--ink-muted)] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 active:scale-[0.94] rounded-lg transition-all cursor-pointer"
                title="Delete expense"
                aria-label="Delete expense"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Receipt Fullscreen Viewer Modal */}
      {expense.receiptUrl && (
        <ReceiptViewerModal
          isOpen={showReceiptViewer}
          onClose={() => setShowReceiptViewer(false)}
          expense={expense}
          group={group}
          payer={payer}
        />
      )}
    </div>
  );
};
