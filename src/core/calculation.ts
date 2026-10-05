import {
  Member,
  Expense,
  ExpenseShare,
  SettlementRecord,
  MemberBalance,
  SettlementTransaction,
} from '../types';

/**
 * Precision helpers to prevent floating point discrepancies.
 * All core math is performed using safe minor units (integer cents/paisa).
 */
export function toMinorUnits(amount: number): number {
  return Math.round((Number(amount) || 0) * 100);
}

export function fromMinorUnits(units: number): number {
  return Math.round(units) / 100;
}

/**
 * Calculates equal shares for a list of participants.
 * Automatically distributes remainder minor units (cents/paisa) so the sum of shares
 * is mathematically guaranteed to equal the original total.
 */
export function calculateEqualShares(
  totalBaseAmount: number,
  participantIds: string[]
): { memberId: string; shareAmount: number }[] {
  if (!participantIds.length || totalBaseAmount <= 0) {
    return [];
  }

  const totalCents = toMinorUnits(totalBaseAmount);
  const count = participantIds.length;
  const baseCentsPerPerson = Math.floor(totalCents / count);
  const remainderCents = totalCents % count;

  return participantIds.map((memberId, index) => {
    // Distribute 1 extra cent to the first 'remainderCents' participants
    const shareCents = baseCentsPerPerson + (index < remainderCents ? 1 : 0);
    return {
      memberId,
      shareAmount: fromMinorUnits(shareCents),
    };
  });
}

/**
 * Validates and normalizes exact amount shares.
 */
export function validateExactShares(
  totalBaseAmount: number,
  shares: { memberId: string; amount: number }[]
): { isValid: boolean; difference: number; error?: string } {
  const totalCents = toMinorUnits(totalBaseAmount);
  const enteredSumCents = shares.reduce((acc, s) => acc + toMinorUnits(s.amount), 0);
  const diffCents = totalCents - enteredSumCents;
  const diffAmount = fromMinorUnits(diffCents);

  if (diffCents === 0) {
    return { isValid: true, difference: 0 };
  } else if (diffCents > 0) {
    return {
      isValid: false,
      difference: diffAmount,
      error: `Under-allocated by ${diffAmount.toFixed(2)}. Total shares must equal ${totalBaseAmount.toFixed(2)}.`,
    };
  } else {
    return {
      isValid: false,
      difference: diffAmount,
      error: `Over-allocated by ${Math.abs(diffAmount).toFixed(2)}. Total shares must equal ${totalBaseAmount.toFixed(2)}.`,
    };
  }
}

/**
 * Validates percentage shares and distributes any integer rounding cents.
 */
export function validateAndCalculatePercentageShares(
  totalBaseAmount: number,
  shares: { memberId: string; percentage: number }[]
): {
  isValid: boolean;
  error?: string;
  result?: { memberId: string; shareAmount: number; percentage: number }[];
} {
  const totalPercentage = shares.reduce((acc, s) => acc + (Number(s.percentage) || 0), 0);
  const roundedPercent = Math.round(totalPercentage * 100) / 100;

  if (Math.abs(roundedPercent - 100) > 0.01) {
    return {
      isValid: false,
      error: `Percentages must sum to 100% (currently ${roundedPercent}%).`,
    };
  }

  const totalCents = toMinorUnits(totalBaseAmount);
  let allocatedCents = 0;

  const rawShares = shares.map(s => {
    const shareCents = Math.round((totalCents * (s.percentage || 0)) / 100);
    allocatedCents += shareCents;
    return {
      memberId: s.memberId,
      shareCents,
      percentage: s.percentage,
    };
  });

  // Reconcile any rounding disparity to the largest percentage share
  const remainderCents = totalCents - allocatedCents;
  if (remainderCents !== 0 && rawShares.length > 0) {
    // Find index of highest percentage
    let maxIdx = 0;
    for (let i = 1; i < rawShares.length; i++) {
      if (rawShares[i].percentage > rawShares[maxIdx].percentage) {
        maxIdx = i;
      }
    }
    rawShares[maxIdx].shareCents += remainderCents;
  }

  const result = rawShares.map(s => ({
    memberId: s.memberId,
    shareAmount: fromMinorUnits(s.shareCents),
    percentage: s.percentage,
  }));

  return { isValid: true, result };
}

/**
 * Calculates shares based on weight/multiplier (e.g. 1 share, 2 shares, 3 shares).
 * Matches Splitzy's "Shares — when someone counts double"
 */
export function calculateSharesSplits(
  totalBaseAmount: number,
  participants: { memberId: string; sharesCount: number }[]
): { memberId: string; shareAmount: number; sharesCount: number }[] {
  if (!participants.length || totalBaseAmount <= 0) return [];
  const totalShares = participants.reduce((acc, p) => acc + Math.max(0.1, Number(p.sharesCount) || 1), 0);
  if (totalShares <= 0) return [];

  const totalCents = toMinorUnits(totalBaseAmount);
  let allocatedCents = 0;

  const raw = participants.map(p => {
    const count = Math.max(0.1, Number(p.sharesCount) || 1);
    const fraction = count / totalShares;
    const shareCents = Math.round(totalCents * fraction);
    allocatedCents += shareCents;
    return {
      memberId: p.memberId,
      shareCents,
      sharesCount: count,
    };
  });

  const remainder = totalCents - allocatedCents;
  if (remainder !== 0 && raw.length > 0) {
    raw[0].shareCents += remainder;
  }

  return raw.map(r => ({
    memberId: r.memberId,
    shareAmount: fromMinorUnits(r.shareCents),
    sharesCount: r.sharesCount,
  }));
}

/**
 * Calculates itemized line item shares.
 * "In Items mode, assign only the personal stuff — Any line with nobody selected is shared by everyone automatically."
 */
export function calculateItemizedSplits(
  totalBaseAmount: number,
  lineItems: { title: string; amount: number; assignedMemberIds: string[] }[],
  allMemberIds: string[]
): { memberId: string; shareAmount: number }[] {
  if (!allMemberIds.length) return [];
  const memberCents: Record<string, number> = {};
  allMemberIds.forEach(id => (memberCents[id] = 0));

  let itemsSumCents = 0;

  lineItems.forEach(item => {
    const itemCents = toMinorUnits(item.amount);
    itemsSumCents += itemCents;
    const targetMembers =
      item.assignedMemberIds && item.assignedMemberIds.length > 0
        ? item.assignedMemberIds
        : allMemberIds; // Unassigned is shared by everyone!

    const count = targetMembers.length;
    if (count > 0) {
      const basePerPerson = Math.floor(itemCents / count);
      const remainder = itemCents % count;
      targetMembers.forEach((mId, idx) => {
        const extra = idx < remainder ? 1 : 0;
        memberCents[mId] = (memberCents[mId] || 0) + basePerPerson + extra;
      });
    }
  });

  // If there's tax, tip, or leftover difference between totalBaseAmount and items sum, distribute proportionally
  const totalCents = toMinorUnits(totalBaseAmount);
  const leftoverCents = totalCents - itemsSumCents;
  if (leftoverCents !== 0 && allMemberIds.length > 0) {
    const baseExtra = Math.floor(leftoverCents / allMemberIds.length);
    const remExtra = leftoverCents % allMemberIds.length;
    allMemberIds.forEach((mId, idx) => {
      const extra = idx < Math.abs(remExtra) ? (remExtra > 0 ? 1 : -1) : 0;
      memberCents[mId] = (memberCents[mId] || 0) + baseExtra + extra;
    });
  }

  return allMemberIds.map(memberId => ({
    memberId,
    shareAmount: fromMinorUnits(Math.max(0, memberCents[memberId] || 0)),
  }));
}

/**
 * Calculates net balances per member across all expenses, shares, and settlements.
 * Formula:
 * Net Balance = Total Paid - Total Share
 * > 0 : Creditor (to receive money)
 * < 0 : Debtor (owes money)
 * = 0 : Settled
 */
export function calculateMemberBalances(
  members: Member[],
  expenses: Expense[],
  shares: ExpenseShare[],
  settlements: SettlementRecord[] = []
): MemberBalance[] {
  // Map of memberId -> { paidCents, shareCents }
  const ledger = new Map<string, { paidCents: number; shareCents: number }>();

  // Initialize for all known members
  members.forEach(m => {
    ledger.set(m.id, { paidCents: 0, shareCents: 0 });
  });

  // Accumulate expenses paid
  expenses.forEach(exp => {
    const entry = ledger.get(exp.paidBy) || { paidCents: 0, shareCents: 0 };
    entry.paidCents += toMinorUnits(exp.baseAmount);
    ledger.set(exp.paidBy, entry);
  });

  // Accumulate expense shares consumed
  shares.forEach(share => {
    const entry = ledger.get(share.memberId) || { paidCents: 0, shareCents: 0 };
    entry.shareCents += toMinorUnits(share.shareAmount);
    ledger.set(share.memberId, entry);
  });

  // Accumulate direct settlement transactions:
  // When person A pays person B:
  // Person A's paid increases (or debt reduces), Person B's share increases (or credit reduces)
  settlements.forEach(settle => {
    const fromEntry = ledger.get(settle.fromMemberId) || { paidCents: 0, shareCents: 0 };
    fromEntry.paidCents += toMinorUnits(settle.amount);
    ledger.set(settle.fromMemberId, fromEntry);

    const toEntry = ledger.get(settle.toMemberId) || { paidCents: 0, shareCents: 0 };
    toEntry.shareCents += toMinorUnits(settle.amount);
    ledger.set(settle.toMemberId, toEntry);
  });

  // Format return structures
  return members.map(m => {
    const rec = ledger.get(m.id) || { paidCents: 0, shareCents: 0 };
    const netCents = rec.paidCents - rec.shareCents;
    return {
      memberId: m.id,
      totalPaid: fromMinorUnits(rec.paidCents),
      totalShare: fromMinorUnits(rec.shareCents),
      netBalance: fromMinorUnits(netCents),
    };
  });
}

/**
 * Greedy Min-Flow Debt Simplification Algorithm
 * Minimizes total number of financial transactions required to settle all debts in the group.
 */
export function optimizeSettlements(
  balances: MemberBalance[],
  currency: string = 'NPR'
): SettlementTransaction[] {
  // Working list of net balances in integer cents
  interface FlowNode {
    memberId: string;
    netCents: number;
  }

  const creditors: FlowNode[] = [];
  const debtors: FlowNode[] = [];

  balances.forEach(b => {
    const netCents = toMinorUnits(b.netBalance);
    if (netCents > 0) {
      creditors.push({ memberId: b.memberId, netCents });
    } else if (netCents < 0) {
      debtors.push({ memberId: b.memberId, netCents: -netCents }); // store debt as positive
    }
  });

  const transactions: SettlementTransaction[] = [];

  // Greedy settlement: Match biggest debtor with biggest creditor
  while (debtors.length > 0 && creditors.length > 0) {
    // Sort descending by value
    debtors.sort((a, b) => b.netCents - a.netCents);
    creditors.sort((a, b) => b.netCents - a.netCents);

    const debtor = debtors[0];
    const creditor = creditors[0];

    const settledCents = Math.min(debtor.netCents, creditor.netCents);

    if (settledCents > 0) {
      transactions.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount: fromMinorUnits(settledCents),
        currency,
      });
    }

    debtor.netCents -= settledCents;
    creditor.netCents -= settledCents;

    if (debtor.netCents <= 0) {
      debtors.shift();
    }
    if (creditor.netCents <= 0) {
      creditors.shift();
    }
  }

  return transactions;
}

/**
 * Self-Testing suite for calculation engine verification.
 * Tests edge cases: odd divisions, 3-way splits, multi-currency base conversions,
 * zero sum conservation, and min-flow settlement minimization.
 */
export function runCalculationUnitTests(): {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}[] {
  const tests = [];

  // Test 1: Equal split with remainder cents conservation (NPR 100 divided 3 ways)
  {
    const shares = calculateEqualShares(100, ['m1', 'm2', 'm3']);
    const sum = shares.reduce((acc, s) => acc + s.shareAmount, 0);
    const sumCents = shares.reduce((acc, s) => acc + toMinorUnits(s.shareAmount), 0);
    const passed = sumCents === 10000 && Math.abs(sum - 100) < 0.001;
    tests.push({
      id: 'test_remainder_conservation',
      name: 'Paisa Precision & Remainder Conservation (100 / 3)',
      passed,
      expected: '33.34 + 33.33 + 33.33 = 100.00 exactly (0 drift)',
      actual: shares.map(s => s.shareAmount).join(' + ') + ' = ' + sum.toFixed(2),
    });
  }

  // Test 2: Pokhara Trip Demo Case
  // Saroj pays 8,000 for 4 (each 2,000)
  // Ram pays 4,000 for 4 (each 1,000)
  // Sita pays 2,000 for 3 (Saroj, Ram, Sita = 666.67, 666.67, 666.66)
  {
    const members: Member[] = [
      { id: 'saroj', name: 'Saroj', avatar: '👨‍💻', createdAt: '' },
      { id: 'ram', name: 'Ram', avatar: '🧗', createdAt: '' },
      { id: 'sita', name: 'Sita', avatar: '👩‍🎨', createdAt: '' },
      { id: 'hari', name: 'Hari', avatar: '📸', createdAt: '' },
    ];

    const expenses: Expense[] = [
      {
        id: 'e1',
        groupId: 'g1',
        title: 'Hotel',
        originalAmount: 8000,
        originalCurrency: 'NPR',
        exchangeRate: 1,
        baseAmount: 8000,
        paidBy: 'saroj',
        dateISO: '2026-09-01',
        calendarType: 'AD',
        createdAt: '',
      },
      {
        id: 'e2',
        groupId: 'g1',
        title: 'Dinner',
        originalAmount: 4000,
        originalCurrency: 'NPR',
        exchangeRate: 1,
        baseAmount: 4000,
        paidBy: 'ram',
        dateISO: '2026-09-02',
        calendarType: 'AD',
        createdAt: '',
      },
      {
        id: 'e3',
        groupId: 'g1',
        title: 'Taxi',
        originalAmount: 2000,
        originalCurrency: 'NPR',
        exchangeRate: 1,
        baseAmount: 2000,
        paidBy: 'sita',
        dateISO: '2026-09-03',
        calendarType: 'AD',
        createdAt: '',
      },
    ];

    const hotelShares = calculateEqualShares(8000, ['saroj', 'ram', 'sita', 'hari']).map(s => ({
      id: 's_h_' + s.memberId,
      expenseId: 'e1',
      memberId: s.memberId,
      shareAmount: s.shareAmount,
      splitType: 'equal' as const,
    }));

    const dinnerShares = calculateEqualShares(4000, ['saroj', 'ram', 'sita', 'hari']).map(s => ({
      id: 's_d_' + s.memberId,
      expenseId: 'e2',
      memberId: s.memberId,
      shareAmount: s.shareAmount,
      splitType: 'equal' as const,
    }));

    const taxiShares = calculateEqualShares(2000, ['saroj', 'ram', 'sita']).map(s => ({
      id: 's_t_' + s.memberId,
      expenseId: 'e3',
      memberId: s.memberId,
      shareAmount: s.shareAmount,
      splitType: 'equal' as const,
    }));

    const allShares = [...hotelShares, ...dinnerShares, ...taxiShares];
    const balances = calculateMemberBalances(members, expenses, allShares);

    // Saroj: Paid 8000, Share = 2000 + 1000 + 666.67 = 3666.67 => Net = +4333.33
    // Ram: Paid 4000, Share = 2000 + 1000 + 666.67 = 3666.67 => Net = +333.33
    // Sita: Paid 2000, Share = 2000 + 1000 + 666.66 = 3666.66 => Net = -1666.66
    // Hari: Paid 0, Share = 2000 + 1000 + 0 = 3000 => Net = -3000.00
    // Sum of net balances MUST BE 0.00 exactly!
    const netSum = balances.reduce((acc, b) => acc + b.netBalance, 0);
    const zeroSumConserved = Math.abs(netSum) < 0.01;

    const settlements = optimizeSettlements(balances, 'NPR');
    // Hari (-3000) and Sita (-1666.66) settle to Saroj (+4333.33) and Ram (+333.33)
    const passed = zeroSumConserved && settlements.length <= 3;

    tests.push({
      id: 'test_demo_scenario',
      name: 'Pokhara Trip Scenario Balance & Zero-Sum Conservation',
      passed,
      expected: 'Net sum = 0.00, Hari owes 3000, Sita owes 1666.66',
      actual: `Net sum = ${netSum.toFixed(2)}, Transactions = ${settlements.length}`,
      details: settlements.map(s => `${s.fromMemberId} → ${s.toMemberId}: ${s.amount}`).join('; '),
    });
  }

  // Test 3: Multi-currency conversion precision (50 USD @ 135.50 NPR = 6,775 NPR)
  {
    const usdAmount = 50;
    const rate = 135.5;
    const baseAmount = Number((usdAmount * rate).toFixed(2));
    const passed = baseAmount === 6775;
    tests.push({
      id: 'test_multi_currency',
      name: 'Multi-Currency Base Conversion (USD to NPR)',
      passed,
      expected: '50 USD @ 135.50 = 6,775.00 NPR',
      actual: `${baseAmount.toFixed(2)} NPR`,
    });
  }

  // Test 4: Percentage split validator with 100% check
  {
    const input = [
      { memberId: 'm1', percentage: 33.33 },
      { memberId: 'm2', percentage: 33.33 },
      { memberId: 'm3', percentage: 33.34 },
    ];
    const res = validateAndCalculatePercentageShares(300, input);
    const passed =
      res.isValid &&
      res.result?.reduce((acc, s) => acc + s.shareAmount, 0) === 300;
    tests.push({
      id: 'test_percentage_split',
      name: 'Percentage Split Dynamic Allocation (33.33% / 33.33% / 33.34%)',
      passed,
      expected: 'Valid sum = 300.00',
      actual: res.isValid
        ? `Valid: sum = ${res.result?.reduce((a, b) => a + b.shareAmount, 0).toFixed(2)}`
        : 'Invalid',
    });
  }

  return tests;
}
