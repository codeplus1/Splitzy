import React, { useState } from 'react';
import { X, ArrowRight, CheckCircle2, Copy, Check, CreditCard } from 'lucide-react';
import { Group, Member, SettlementRecord, SupportedLanguage } from '../types';
import { MemberAvatar } from './MemberAvatar';
import { formatMoney, getCurrencySymbol } from '../core/currency';
import { translate } from '../core/i18n';

interface SettleModalProps {
  isOpen?: boolean;
  onClose: () => void;
  group: Group;
  members: Member[];
  initialFromId?: string;
  initialToId?: string;
  initialAmount?: number;
  currentUserId?: string;
  onSettle: (settlement: SettlementRecord) => void;
  language: SupportedLanguage;
}

export const SettleModal: React.FC<SettleModalProps> = ({
  onClose,
  group,
  members,
  initialFromId,
  initialToId,
  initialAmount = 0,
  currentUserId,
  onSettle,
  language,
}) => {
  const isFrench = language === 'fr';
  const [fromId, setFromId] = useState(initialFromId || members[0]?.id || '');
  const [toId, setToId] = useState(
    initialToId || (members[1]?.id !== fromId ? members[1]?.id : members[0]?.id) || ''
  );
  const [amountStr, setAmountStr] = useState(initialAmount > 0 ? String(initialAmount) : '');
  const [notes, setNotes] = useState('Interac e-Transfer / Settlement');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedPayment, setCopiedPayment] = useState(false);

  const fromMember = members.find(m => m.id === fromId);
  const toMember = members.find(m => m.id === toId);

  const isCurrentUserCreditor = Boolean(currentUserId && toId === currentUserId);
  const isCurrentUserDebtor = Boolean(currentUserId && fromId === currentUserId);

  const handleCopyPaymentInfo = (info: string) => {
    navigator.clipboard.writeText(info);
    setCopiedPayment(true);
    setTimeout(() => setCopiedPayment(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const amount = parseFloat(amountStr) || 0;
    if (amount <= 0) {
      setError(translate(language, 'validationAmountPositive'));
      return;
    }

    if (fromId === toId) {
      setError(isFrench ? 'Le payeur et le bénéficiaire doivent être différents.' : 'Payer and payee must be different members.');
      return;
    }

    setIsSubmitting(true);

    const record: SettlementRecord = {
      id: `settle_${Date.now()}`,
      groupId: group.id,
      fromMemberId: fromId,
      toMemberId: toId,
      amount,
      currency: group.baseCurrency,
      dateISO: new Date().toISOString().split('T')[0],
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };

    onSettle(record);
    onClose();
  };

  return (
    <div
      id="settle-modal-backdrop"
      className="ui-modal-backdrop"
      onClick={onClose}
    >
      <div
        id="settle-modal-card"
        className="ui-modal-card max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="ui-modal-header">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center font-bold border border-[var(--accent-border)]">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold font-display text-[var(--ink)]">
              {translate(language, 'recordSettlement')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Transfer Visual Direction */}
          <div className="ui-subcard p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-secondary)]">
                  {isFrench ? 'Payeur (Doit)' : 'Payer (Sends)'}
                </span>
                {fromMember && (
                  <div className="flex items-center gap-2">
                    <MemberAvatar name={fromMember.name} avatar={fromMember.avatar} color={fromMember.color} size="sm" />
                    <span className="text-xs font-bold text-[var(--ink)]">{fromMember.name}</span>
                  </div>
                )}
              </div>

              <div className="p-2 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]">
                <ArrowRight className="w-4 h-4" />
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-[var(--ink-secondary)]">
                  {isFrench ? 'Bénéficiaire (Reçoit)' : 'Payee (Gets money)'}
                </span>
                {toMember && (
                  <div className="flex items-center gap-2">
                    <MemberAvatar name={toMember.name} avatar={toMember.avatar} color={toMember.color} size="sm" />
                    <span className="text-xs font-bold text-[var(--ink)]">{toMember.name}</span>
                  </div>
                )}
              </div>
            </div>

            {isCurrentUserCreditor && (
              <div className="text-center pt-1.5 border-t border-dashed border-[var(--border)]">
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {isFrench
                    ? `✓ Vous enregistrez ce paiement reçu de ${fromMember?.name || 'quelqu’un'}`
                    : `✓ You are confirming payment received from ${fromMember?.name || 'payer'}`}
                </span>
              </div>
            )}
            {isCurrentUserDebtor && (
              <div className="text-center pt-1.5 border-t border-dashed border-[var(--border)]">
                <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  {isFrench
                    ? `✓ Vous enregistrez votre règlement versé à ${toMember?.name || 'quelqu’un'}`
                    : `✓ You are recording your settlement sent to ${toMember?.name || 'payee'}`}
                </span>
              </div>
            )}
          </div>

          {/* Payee Payment Info Card (Interac / UPI) */}
          {toMember?.paymentInfo && (
            <div className="p-3 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <CreditCard className="w-4 h-4 text-[var(--accent)]" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--ink-secondary)] block">
                    {isFrench ? 'Coordonnées de paiement' : 'Payee Payment Contact'}
                  </span>
                  <span className="font-mono font-semibold text-[var(--ink)]">
                    {toMember.paymentInfo}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopyPaymentInfo(toMember.paymentInfo!)}
                className="p-1.5 rounded-lg bg-[var(--surface)] text-[var(--accent)] border border-[var(--border)] hover:bg-[var(--surface-subtle)] cursor-pointer"
                title="Copy payment contact"
              >
                {copiedPayment ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          {/* From Select & To Select */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--ink-secondary)] block mb-1">
                {translate(language, 'whoPaid')}
              </label>
              <select
                value={fromId}
                onChange={e => setFromId(e.target.value)}
                className="ui-input text-xs"
              >
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--ink-secondary)] block mb-1">
                {translate(language, 'whoReceived')}
              </label>
              <select
                value={toId}
                onChange={e => setToId(e.target.value)}
                className="ui-input text-xs"
              >
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-semibold text-[var(--ink-secondary)] block mb-1">
              {isFrench ? 'Montant réglé' : 'Settled Amount'} ({group.baseCurrency}) *
            </label>
            <div className="flex items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--accent)] focus-within:ring-3 focus-within:ring-[var(--accent)]/10 transition-all overflow-hidden">
              <span className="pl-3 pr-2 py-2.5 text-xs font-mono font-bold text-[var(--ink-secondary)] bg-[var(--surface-subtle)] border-r border-[var(--border-subtle)] select-none flex items-center">
                {getCurrencySymbol(group.baseCurrency)}
              </span>
              <input
                id="settle-amount-input"
                type="number"
                step="any"
                min="0.01"
                required
                placeholder="0.00"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                className="w-full px-3 py-2.5 bg-transparent text-base font-bold text-[var(--ink)] tnum amount-val focus:outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-[var(--ink-secondary)] block mb-1">
              {isFrench ? 'Mode de paiement / Notes' : 'Payment Method / Notes'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="ui-input text-xs"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn-secondary px-4 py-2 text-xs"
            >
              {translate(language, 'cancel')}
            </button>
            <button
              id="confirm-settlement-btn"
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition-all cursor-pointer ${
                isSubmitting
                  ? 'opacity-60 cursor-not-allowed bg-[var(--ink-muted)]'
                  : isCurrentUserCreditor
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
              }`}
            >
              {isSubmitting
                ? 'Recording...'
                : isCurrentUserCreditor
                ? (isFrench ? 'Confirmer le reçu de paiement' : 'Confirm Payment Received')
                : translate(language, 'markAsPaid')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
