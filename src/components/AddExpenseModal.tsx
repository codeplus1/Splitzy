import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  AlertCircle,
  FileText,
  Camera,
  UploadCloud,
  Trash2,
  Eye,
  Loader2,
  Paperclip,
  Repeat,
  Sparkles,
} from 'lucide-react';
import {
  Expense,
  ExpenseShare,
  ExpenseLineItem,
  Group,
  Member,
  SplitType,
  SupportedLanguage,
} from '../types';
import { translate } from '../core/i18n';
import { MemberAvatar } from './MemberAvatar';
import { DatePickerBSAD } from './DatePickerBSAD';
import {
  SUPPORTED_CURRENCIES,
  getDefaultExchangeRate,
  formatMoney,
  getCurrencySymbol,
} from '../core/currency';
import {
  calculateEqualShares,
  calculateSharesSplits,
  calculateItemizedSplits,
  validateExactShares,
  validateAndCalculatePercentageShares,
  toMinorUnits,
  fromMinorUnits,
} from '../core/calculation';
import { processReceiptFile, formatFileSize } from '../core/receipt';
import { CameraCaptureModal } from './CameraCaptureModal';
import { ReceiptViewerModal } from './ReceiptViewerModal';

interface AddExpenseModalProps {
  isOpen?: boolean;
  onClose: () => void;
  group: Group;
  members: Member[];
  onSave: (expense: Expense, shares: ExpenseShare[]) => void;
  onDelete?: (expenseId: string) => void;
  expenseToEdit?: { expense: Expense; shares: ExpenseShare[] } | null;
  language: SupportedLanguage;
}

const CATEGORIES = [
  { id: 'Food', label: 'Dining & Food', emoji: '🍝' },
  { id: 'Drinks', label: 'Drinks & Coffee', emoji: '🍸' },
  { id: 'Groceries', label: 'Groceries', emoji: '🛒' },
  { id: 'Rent', label: 'Rent & Housing', emoji: '🏠' },
  { id: 'Transport', label: 'Transport & Travel', emoji: '🚕' },
  { id: 'Entertainment', label: 'Entertainment', emoji: '🎟️' },
  { id: 'Other', label: 'Other', emoji: '📦' },
];

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  onClose,
  group,
  members,
  onSave,
  onDelete,
  expenseToEdit,
  language,
}) => {
  const isEditing = Boolean(expenseToEdit);
  const isFrench = language === 'fr';

  // Form State
  const [title, setTitle] = useState(expenseToEdit?.expense.title || '');
  const [originalAmountStr, setOriginalAmountStr] = useState(
    expenseToEdit ? String(expenseToEdit.expense.originalAmount) : ''
  );
  const [currency, setCurrency] = useState(expenseToEdit?.expense.originalCurrency || group.baseCurrency);
  const [exchangeRate, setExchangeRate] = useState<number>(
    expenseToEdit?.expense.exchangeRate || 1.0
  );
  const [isCustomRate, setIsCustomRate] = useState(false);
  const [paidBy, setPaidBy] = useState(
    expenseToEdit?.expense.paidBy || members[0]?.id || ''
  );
  const [dateISO, setDateISO] = useState(
    expenseToEdit?.expense.dateISO || new Date().toISOString().split('T')[0]
  );
  const [calendarType, setCalendarType] = useState(
    expenseToEdit?.expense.calendarType || group.preferredCalendar
  );
  const [category, setCategory] = useState(expenseToEdit?.expense.category || 'Food');
  const [notes, setNotes] = useState(expenseToEdit?.expense.notes || '');

  // Recurring state (Splitzy habit #05: Set rent to repeat - once)
  const [isRecurring, setIsRecurring] = useState<boolean>(expenseToEdit?.expense.isRecurring || false);
  const [recurringInterval, setRecurringInterval] = useState<'weekly' | 'biweekly' | 'monthly'>(
    expenseToEdit?.expense.recurringInterval || 'monthly'
  );

  // Receipt State
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>(
    expenseToEdit?.expense.receiptUrl
  );
  const [receiptName, setReceiptName] = useState<string | undefined>(
    expenseToEdit?.expense.receiptName
  );
  const [receiptSize, setReceiptSize] = useState<number | undefined>(undefined);
  const [isProcessingReceipt, setIsProcessingReceipt] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isReceiptViewerOpen, setIsReceiptViewerOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Four Split Types: Equal, Shares, Exact, Items
  const [splitType, setSplitType] = useState<SplitType>(
    expenseToEdit?.shares[0]?.splitType || 'equal'
  );
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(
    expenseToEdit
      ? expenseToEdit.shares.map(s => s.memberId)
      : members.map(m => m.id)
  );

  // Exact Split tracking: memberId -> value
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(() => {
    if (expenseToEdit && expenseToEdit.shares[0]?.splitType === 'exact') {
      const map: Record<string, string> = {};
      expenseToEdit.shares.forEach(s => {
        map[s.memberId] = String(s.shareAmount);
      });
      return map;
    }
    return {};
  });

  // Shares Split tracking: memberId -> multiplier (e.g. "1", "2")
  const [customShares, setCustomShares] = useState<Record<string, string>>(() => {
    if (expenseToEdit && expenseToEdit.shares[0]?.splitType === 'shares') {
      const map: Record<string, string> = {};
      expenseToEdit.shares.forEach(s => {
        map[s.memberId] = String(s.sharesCount || 1);
      });
      return map;
    }
    const map: Record<string, string> = {};
    members.forEach(m => (map[m.id] = '1'));
    return map;
  });

  // Percentage Split tracking: memberId -> percentage
  const [customPercentages, setCustomPercentages] = useState<Record<string, string>>(() => {
    if (expenseToEdit && expenseToEdit.shares[0]?.splitType === 'percentage') {
      const map: Record<string, string> = {};
      expenseToEdit.shares.forEach(s => {
        map[s.memberId] = String(s.percentage || 0);
      });
      return map;
    }
    return {};
  });

  // Itemized Split tracking: lines
  const [lineItems, setLineItems] = useState<ExpenseLineItem[]>(() => {
    if (expenseToEdit?.expense.lineItems && expenseToEdit.expense.lineItems.length > 0) {
      return expenseToEdit.expense.lineItems;
    }
    return [];
  });

  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto update exchange rate when currency changes
  useEffect(() => {
    if (!isEditing && !isCustomRate) {
      const suggested = getDefaultExchangeRate(currency, group.baseCurrency);
      setExchangeRate(suggested);
    }
  }, [currency, group.baseCurrency, isEditing, isCustomRate]);

  const handleProcessFile = async (file: File) => {
    setIsProcessingReceipt(true);
    setErrorMessage(null);
    try {
      const processed = await processReceiptFile(file);
      setReceiptUrl(processed.dataUrl);
      setReceiptName(processed.fileName);
      setReceiptSize(processed.fileSize);
    } catch (err: any) {
      console.error('Error processing receipt:', err);
      setErrorMessage('Failed to process receipt image. Please try another file.');
    } finally {
      setIsProcessingReceipt(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    e.target.value = '';
  };

  const handleCameraCapture = (file: File) => {
    handleProcessFile(file);
  };

  const handleRemoveReceipt = () => {
    setReceiptUrl(undefined);
    setReceiptName(undefined);
    setReceiptSize(undefined);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const originalAmount = parseFloat(originalAmountStr) || 0;
  const baseAmount = fromMinorUnits(toMinorUnits(originalAmount * exchangeRate));

  // Toggle participant
  const toggleParticipant = (memberId: string) => {
    if (selectedMemberIds.includes(memberId)) {
      if (selectedMemberIds.length === 1) return;
      setSelectedMemberIds(selectedMemberIds.filter(id => id !== memberId));
    } else {
      setSelectedMemberIds([...selectedMemberIds, memberId]);
    }
  };

  const handleSelectAll = () => {
    setSelectedMemberIds(members.map(m => m.id));
  };

  const handleClearAll = () => {
    if (paidBy) {
      setSelectedMemberIds([paidBy]);
    } else if (members[0]) {
      setSelectedMemberIds([members[0].id]);
    }
  };

  // Add Item to Line Items
  const handleAddLineItem = () => {
    const amt = parseFloat(newItemAmount) || 0;
    if (!newItemTitle.trim() || amt <= 0) return;
    const newItem: ExpenseLineItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      title: newItemTitle.trim(),
      amount: amt,
      assignedMemberIds: [], // Empty means shared by all
    };
    const updated = [...lineItems, newItem];
    setLineItems(updated);
    setNewItemTitle('');
    setNewItemAmount('');

    // If original amount was 0 or sum exceeds, adjust total amount
    const totalItems = updated.reduce((s, it) => s + it.amount, 0);
    if (totalItems > originalAmount || originalAmount === 0) {
      setOriginalAmountStr(String(totalItems.toFixed(2)));
    }
  };

  // Populate sample items from Splitzy restaurant demo (Chez Nico)
  const handlePopulateChezNicoDemo = () => {
    setTitle('Chez Nico');
    setCategory('Food');
    setOriginalAmountStr('102.00');
    setSplitType('items');
    const sampleItems: ExpenseLineItem[] = [
      { id: 'it_1', title: 'Burrata', amount: 16.0, assignedMemberIds: members.slice(0, 1).map(m => m.id) },
      { id: 'it_2', title: 'Tagliatelle', amount: 24.0, assignedMemberIds: members.slice(1, 2).map(m => m.id) },
      { id: 'it_3', title: 'Negroni ×2', amount: 30.0, assignedMemberIds: members.slice(0, 2).map(m => m.id) },
      { id: 'it_4', title: 'Tiramisu', amount: 12.0, assignedMemberIds: [] }, // shared
      { id: 'it_5', title: 'Taxes & tip', amount: 20.0, assignedMemberIds: [] }, // shared
    ];
    setLineItems(sampleItems);
  };

  // Pre-calculate live remaining for exact split
  const sumCustomAmounts = selectedMemberIds.reduce(
    (acc, mId) => acc + (parseFloat(customAmounts[mId] || '0') || 0),
    0
  );
  const remainingExact = fromMinorUnits(toMinorUnits(baseAmount) - toMinorUnits(sumCustomAmounts));

  // Previews
  const equalSharesPreview = calculateEqualShares(baseAmount, selectedMemberIds);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage(translate(language, 'validationTitleRequired'));
      return;
    }

    if (originalAmount <= 0) {
      setErrorMessage(translate(language, 'validationAmountPositive'));
      return;
    }

    if (!exchangeRate || exchangeRate <= 0 || isNaN(exchangeRate)) {
      setErrorMessage('Exchange rate must be a valid number greater than 0.');
      return;
    }

    if (!paidBy) {
      setErrorMessage(translate(language, 'validationSelectPayer'));
      return;
    }

    if (selectedMemberIds.length === 0) {
      setErrorMessage(translate(language, 'validationMinParticipants'));
      return;
    }

    const expenseId = expenseToEdit?.expense.id || `exp_${Date.now()}`;
    let computedShares: ExpenseShare[] = [];

    if (splitType === 'equal') {
      const calculated = calculateEqualShares(baseAmount, selectedMemberIds);
      computedShares = calculated.map(c => ({
        id: `es_${expenseId}_${c.memberId}`,
        expenseId,
        memberId: c.memberId,
        shareAmount: c.shareAmount,
        splitType: 'equal',
      }));
    } else if (splitType === 'shares') {
      const participants = selectedMemberIds.map(mId => ({
        memberId: mId,
        sharesCount: parseFloat(customShares[mId] || '1') || 1,
      }));
      const calculated = calculateSharesSplits(baseAmount, participants);
      computedShares = calculated.map(c => ({
        id: `es_${expenseId}_${c.memberId}`,
        expenseId,
        memberId: c.memberId,
        shareAmount: c.shareAmount,
        sharesCount: c.sharesCount,
        splitType: 'shares',
      }));
    } else if (splitType === 'exact') {
      const items = selectedMemberIds.map(mId => ({
        memberId: mId,
        amount: parseFloat(customAmounts[mId] || '0') || 0,
      }));
      const val = validateExactShares(baseAmount, items);
      if (!val.isValid) {
        setErrorMessage(val.error || translate(language, 'validationSumMismatch'));
        return;
      }
      computedShares = items.map(it => ({
        id: `es_${expenseId}_${it.memberId}`,
        expenseId,
        memberId: it.memberId,
        shareAmount: it.amount,
        splitType: 'exact',
      }));
    } else if (splitType === 'items') {
      const calculated = calculateItemizedSplits(baseAmount, lineItems, selectedMemberIds);
      computedShares = calculated.map(c => ({
        id: `es_${expenseId}_${c.memberId}`,
        expenseId,
        memberId: c.memberId,
        shareAmount: c.shareAmount,
        splitType: 'items',
      }));
    } else if (splitType === 'percentage') {
      const items = selectedMemberIds.map(mId => ({
        memberId: mId,
        percentage: parseFloat(customPercentages[mId] || '0') || 0,
      }));
      const val = validateAndCalculatePercentageShares(baseAmount, items);
      if (!val.isValid || !val.result) {
        setErrorMessage(val.error || translate(language, 'validationPercentageMismatch'));
        return;
      }
      computedShares = val.result.map(r => ({
        id: `es_${expenseId}_${r.memberId}`,
        expenseId,
        memberId: r.memberId,
        shareAmount: r.shareAmount,
        splitType: 'percentage',
        percentage: r.percentage,
      }));
    }

    setIsSubmitting(true);

    const newExpense: Expense = {
      id: expenseId,
      groupId: group.id,
      title: title.trim(),
      originalAmount,
      originalCurrency: currency,
      exchangeRate,
      baseAmount,
      paidBy,
      dateISO,
      calendarType,
      category,
      notes: notes.trim(),
      receiptUrl: receiptUrl || undefined,
      receiptName: receiptName || undefined,
      lineItems: splitType === 'items' ? lineItems : undefined,
      isRecurring,
      recurringInterval: isRecurring ? recurringInterval : undefined,
      createdAt: expenseToEdit?.expense.createdAt || new Date().toISOString(),
    };

    onSave(newExpense, computedShares);
    onClose();
  };

  return (
    <div
      id="add-expense-modal-backdrop"
      className="ui-modal-backdrop"
      onClick={onClose}
    >
      <div
        id="add-expense-modal-card"
        className="ui-modal-card max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ui-modal-header">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center font-bold border border-[var(--accent-border)]">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display text-[var(--ink)]">
                {isEditing ? translate(language, 'editExpense') : translate(language, 'addExpense')}
              </h2>
              <span className="text-[11px] text-[var(--ink-secondary)]">
                {group.name}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Title & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-[var(--ink-secondary)]">
                {translate(language, 'title')} *
              </label>
              <input
                type="text"
                required
                placeholder={translate(language, 'titlePlaceholder')}
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="ui-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--ink-secondary)]">
                {isFrench ? 'Catégorie' : 'Category'}
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="ui-input"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.emoji} {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount & Currency */}
          <div className="ui-subcard p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--ink-secondary)]">
                {translate(language, 'amount')} *
              </label>
              {currency !== group.baseCurrency && (
                <span className="text-xs font-semibold text-[var(--accent)] tnum">
                  ≈ {formatMoney(baseAmount, group.baseCurrency, language)} ({group.baseCurrency})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center grow rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--accent)] focus-within:ring-3 focus-within:ring-[var(--accent)]/10 transition-all overflow-hidden">
                <input
                  id="expense-amount-input"
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={originalAmountStr}
                  onChange={e => setOriginalAmountStr(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-transparent text-lg font-bold text-[var(--ink)] tnum amount-val focus:outline-none"
                />
                <span className="px-3 py-2.5 text-xs font-mono font-bold text-[var(--ink-secondary)] bg-[var(--surface-subtle)] border-l border-[var(--border-subtle)] select-none shrink-0">
                  {getCurrencySymbol(currency)}
                </span>
              </div>

              <select
                value={currency}
                onChange={e => {
                  setCurrency(e.target.value);
                  setIsCustomRate(false);
                }}
                className="ui-input w-28 px-2.5 py-2.5 text-xs font-bold"
              >
                {SUPPORTED_CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Paid By */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--ink-secondary)]">
              {translate(language, 'paidBy')} *
            </label>
            <select
              value={paidBy}
              onChange={e => setPaidBy(e.target.value)}
              className="ui-input text-xs font-bold"
            >
              {members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Expense Date Card (AD / BS) */}
          <DatePickerBSAD
            dateISO={dateISO}
            calendarType={calendarType}
            onDateChange={setDateISO}
            onCalendarToggle={setCalendarType}
            language={language}
          />

          {/* Four Split Modes: Equal, Shares, Exact, Items */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--ink-secondary)]">
                {translate(language, 'splitType')}
              </label>

              {/* Sample Autofill shortcut for Items split */}
              {splitType === 'items' && (
                <button
                  type="button"
                  onClick={handlePopulateChezNicoDemo}
                  className="text-[11px] font-semibold text-[var(--accent)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{isFrench ? 'Exemple Chez Nico ($102)' : 'Sample items ($102)'}</span>
                </button>
              )}
            </div>

            {/* Split Mode Selector Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-[var(--surface-subtle)] rounded-xl border border-[var(--border)]">
              {(['equal', 'shares', 'exact', 'items'] as SplitType[]).map(mode => {
                const isActive = splitType === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSplitType(mode)}
                    className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs font-bold'
                        : 'text-[var(--ink-secondary)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {mode === 'equal' && (isFrench ? 'Égal' : 'Equal')}
                    {mode === 'shares' && (isFrench ? 'Parts' : 'Shares')}
                    {mode === 'exact' && (isFrench ? 'Exact' : 'Exact')}
                    {mode === 'items' && (isFrench ? 'Articles' : 'Items')}
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-[var(--ink-secondary)]">
              {splitType === 'equal' && translate(language, 'equalSplitDesc')}
              {splitType === 'shares' && translate(language, 'sharesSplitDesc')}
              {splitType === 'exact' && translate(language, 'exactSplitDesc')}
              {splitType === 'items' && translate(language, 'itemsSplitDesc')}
            </p>
          </div>

          {/* Split Mode: ITEMS (Line by Line) */}
          {splitType === 'items' && (
            <div className="ui-subcard p-3.5 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-[var(--ink)]">
                  {isFrench ? 'Lignes d’articles' : 'Itemized Lines'}
                </span>
                <span className="text-[var(--ink-secondary)] text-[11px]">
                  {isFrench ? 'Laissez décoché pour partager avec tous' : 'Unchecked = shared automatically'}
                </span>
              </div>

              {/* Add Line Item inputs */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={isFrench ? 'Nom (ex. Burrata)' : 'Item (e.g. Burrata)'}
                  value={newItemTitle}
                  onChange={e => setNewItemTitle(e.target.value)}
                  className="ui-input grow py-1.5 text-xs"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={newItemAmount}
                  onChange={e => setNewItemAmount(e.target.value)}
                  className="ui-input w-20 px-2 py-1.5 text-xs font-bold text-right tnum"
                />
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="ui-btn-primary px-3 py-2 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Line Items List */}
              <div className="space-y-2 pt-1 max-h-48 overflow-y-auto">
                {lineItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[var(--ink)]">
                        {item.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono tnum">
                          {formatMoney(item.amount, currency, language)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))}
                          className="text-[var(--ink-muted)] hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Member assignment checkboxes */}
                    <div className="flex items-center gap-2 flex-wrap pt-1 text-[11px]">
                      <span className="text-[var(--ink-muted)] text-[10px]">
                        {item.assignedMemberIds.length === 0 ? (
                          <span className="text-[var(--accent)] font-semibold">
                            {isFrench ? 'Tous (auto)' : 'Shared by all'}
                          </span>
                        ) : (
                          isFrench ? 'Assigné à :' : 'Assigned to:'
                        )}
                      </span>
                      {members.map(m => {
                        const isAssigned = item.assignedMemberIds.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              const updatedAssigned = isAssigned
                                ? item.assignedMemberIds.filter(id => id !== m.id)
                                : [...item.assignedMemberIds, m.id];
                              const newItems = [...lineItems];
                              newItems[idx].assignedMemberIds = updatedAssigned;
                              setLineItems(newItems);
                            }}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                              isAssigned
                                ? 'bg-[var(--accent)] text-white'
                                : 'bg-[var(--surface-subtle)] text-[var(--ink-secondary)]'
                            }`}
                          >
                            {m.name.split(' ')[0]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Participant Selector & Split Details (for Equal, Shares, Exact) */}
          <div className="ui-subcard p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--ink)]">
                {translate(language, 'participants')} ({selectedMemberIds.length}/{members.length})
              </span>

              {/* Real-time remaining counter for EXACT mode */}
              {splitType === 'exact' && (
                <div
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                    Math.abs(remainingExact) < 0.005
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {isFrench ? 'Reste : ' : 'Remaining: '}
                  {formatMoney(remainingExact, group.baseCurrency, language)}
                  {Math.abs(remainingExact) < 0.005 && ' ✓'}
                </div>
              )}

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[var(--accent)] hover:underline font-semibold cursor-pointer"
                >
                  {translate(language, 'selectAll')}
                </button>
                <span className="text-[var(--ink-muted)]">·</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[var(--ink-secondary)] hover:underline cursor-pointer"
                >
                  {translate(language, 'clearAll')}
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {members.map(m => {
                const isSelected = selectedMemberIds.includes(m.id);
                const equalShare = equalSharesPreview.find(s => s.memberId === m.id);

                return (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-[var(--surface)] border-[var(--border)]'
                        : 'bg-[var(--surface-subtle)]/40 border-transparent opacity-60'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer select-none grow">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleParticipant(m.id)}
                        className="w-4 h-4 rounded text-[var(--accent)] focus:ring-[var(--accent)] border-[var(--border)]"
                      />
                      <MemberAvatar name={m.name} avatar={m.avatar} color={m.color} size="sm" />
                      <span className="text-xs font-semibold text-[var(--ink)]">
                        {m.name}
                      </span>
                    </label>

                    {/* Split Specific Inputs */}
                    {isSelected && (
                      <div className="text-right pl-2">
                        {splitType === 'equal' && (
                          <span className="text-xs font-bold text-[var(--ink)] tnum font-mono">
                            {formatMoney(equalShare?.shareAmount || 0, group.baseCurrency, language)}
                          </span>
                        )}

                        {splitType === 'shares' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-[var(--ink-secondary)]">
                              {isFrench ? 'parts :' : 'shares:'}
                            </span>
                            <input
                              type="number"
                              step="0.5"
                              min="0.1"
                              placeholder="1"
                              value={customShares[m.id] || '1'}
                              onChange={e =>
                                setCustomShares({
                                  ...customShares,
                                  [m.id]: e.target.value,
                                })
                              }
                              className="ui-input w-16 px-2 py-1 text-xs font-bold text-center tnum"
                            />
                          </div>
                        )}

                        {splitType === 'exact' && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-[var(--ink-muted)] font-medium">
                              {getCurrencySymbol(group.baseCurrency)}
                            </span>
                            <input
                              type="number"
                              step="any"
                              placeholder="0"
                              value={customAmounts[m.id] || ''}
                              onChange={e =>
                                setCustomAmounts({
                                  ...customAmounts,
                                  [m.id]: e.target.value,
                                })
                              }
                              className="ui-input w-20 px-2 py-1 text-xs font-bold text-right tnum"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Splitzy Habit #05: Set rent to repeat — once */}
          <div className="ui-subcard p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Repeat className="w-4 h-4 text-[var(--accent)]" />
              <div>
                <span className="text-xs font-bold text-[var(--ink)]">
                  {isFrench ? 'Répéter cette dépense' : 'Repeat this expense'}
                </span>
                <p className="text-[11px] text-[var(--ink-secondary)]">
                  {isFrench ? 'Pour le loyer, internet ou abonnements' : 'For rent, utilities, subscriptions'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isRecurring && (
                <select
                  value={recurringInterval}
                  onChange={e => setRecurringInterval(e.target.value as any)}
                  className="ui-input px-2 py-1 text-xs w-auto"
                >
                  <option value="weekly">{isFrench ? 'Hebdomadaire' : 'Weekly'}</option>
                  <option value="biweekly">{isFrench ? 'Toutes les 2 sem.' : 'Every 2 weeks'}</option>
                  <option value="monthly">{isFrench ? 'Mensuel' : 'Monthly'}</option>
                </select>
              )}
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={e => setIsRecurring(e.target.checked)}
                className="w-4 h-4 rounded text-[var(--accent)] focus:ring-[var(--accent)]"
              />
            </div>
          </div>

          {/* Notes Optional */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[var(--ink-secondary)] flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {translate(language, 'notes')}
            </label>
            <input
              type="text"
              placeholder="e.g. Paid via Interac / Cash"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="ui-input text-xs"
            />
          </div>

          {/* Upload Receipt Section */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--ink-secondary)] flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>{isFrench ? 'REÇU (OPTIONNEL)' : 'RECEIPT (OPTIONAL)'}</span>
              </label>
              {receiptUrl && (
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {isFrench ? 'Joint ✓' : 'Attached ✓'}
                </span>
              )}
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {receiptUrl ? (
              <div className="ui-subcard p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    onClick={() => setIsReceiptViewerOpen(true)}
                    className="relative w-12 h-12 rounded-xl overflow-hidden bg-black flex-shrink-0 cursor-pointer border border-[var(--border)]"
                    title="Zoom receipt"
                  >
                    <img
                      src={receiptUrl}
                      alt="Receipt preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--ink)] truncate">
                      {receiptName || 'Receipt'}
                    </p>
                    {receiptSize && (
                      <span className="text-[10px] text-[var(--ink-muted)]">
                        {formatFileSize(receiptSize)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsReceiptViewerOpen(true)}
                    className="p-1.5 rounded-lg text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] cursor-pointer"
                    title="View receipt"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveReceipt}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    title="Remove receipt"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`p-4 sm:p-5 rounded-2xl border-2 border-dashed text-center transition-all space-y-3 ${
                  isDragOver
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]/40'
                    : 'border-[var(--border)] bg-[var(--surface-subtle)]/30 hover:border-[var(--accent)]/50'
                }`}
              >
                {isProcessingReceipt ? (
                  <div className="py-2 flex items-center justify-center gap-2 text-xs text-[var(--accent)]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing receipt...</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                      <button
                        type="button"
                        onClick={() => setIsCameraModalOpen(true)}
                        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 text-xs sm:text-sm font-bold text-[var(--ink)] shadow-2xs transition-all cursor-pointer"
                      >
                        <Camera className="w-4 h-4 text-[var(--accent)] shrink-0" />
                        <span>{isFrench ? 'Prendre photo' : 'Take Photo'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 text-xs sm:text-sm font-bold text-[var(--ink)] shadow-2xs transition-all cursor-pointer"
                      >
                        <UploadCloud className="w-4 h-4 text-sky-500 shrink-0" />
                        <span>{isFrench ? 'Importer fichier' : 'Upload File'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-[var(--ink-muted)] font-medium">
                      {isFrench
                        ? 'Glissez-déposez le reçu ici (JPG, PNG, WebP)'
                        : 'Drag & drop receipt here (JPG, PNG, WebP)'}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-between gap-2.5">
            {isEditing && expenseToEdit && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(expenseToEdit.expense.id);
                  onClose();
                }}
                className="px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isFrench ? 'Supprimer' : 'Delete'}</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="ui-btn-secondary px-4 py-2 text-xs"
              >
                {translate(language, 'cancel')}
              </button>
              <button
                id="save-expense-submit-btn"
                type="submit"
                disabled={isSubmitting}
                className="ui-btn-primary px-5 py-2.5 text-xs shadow-xs"
              >
                {isSubmitting ? 'Saving...' : translate(language, 'saveExpense')}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={file => {
          handleCameraCapture(file);
          setIsCameraModalOpen(false);
        }}
      />

      {/* Fullscreen Receipt Viewer Modal */}
      {receiptUrl && (
        <ReceiptViewerModal
          isOpen={isReceiptViewerOpen}
          onClose={() => setIsReceiptViewerOpen(false)}
          expense={{
            id: 'temp',
            groupId: group.id,
            title: title || 'Expense Receipt',
            originalAmount,
            originalCurrency: currency,
            exchangeRate,
            baseAmount,
            paidBy,
            dateISO,
            calendarType,
            category,
            receiptUrl,
            receiptName,
            createdAt: new Date().toISOString(),
          }}
          group={group}
          payer={members.find(m => m.id === paidBy)}
        />
      )}
    </div>
  );
};
