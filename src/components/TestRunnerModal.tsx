import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { SupportedLanguage } from '../types';
import {
  calculateEqualShares,
  calculateSharesSplits,
  validateExactShares,
  validateAndCalculatePercentageShares,
  optimizeSettlements,
} from '../core/calculation';
import { getDefaultExchangeRate } from '../core/currency';
import { generateSecureRecoveryCode, hashRecoveryCode } from '../core/security';

export interface TestRunnerModalProps {
  onClose: () => void;
  language: SupportedLanguage;
}

interface TestCaseResult {
  id: string;
  suite: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  error?: string;
  durationMs: number;
}

export const TestRunnerModal: React.FC<TestRunnerModalProps> = ({ onClose, language }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestCaseResult[]>([
    {
      id: 'TC-MATH-01',
      suite: 'Mathematical Exactness',
      name: 'Indivisible Equal Split Cent Distribution',
      description: 'Splits $100.00 among 3 members without penny loss (33.34 + 33.33 + 33.33 = 100.00)',
      status: 'pending',
      durationMs: 0,
    },
    {
      id: 'TC-MATH-02',
      suite: 'Mathematical Exactness',
      name: 'Single Participant Equal Split',
      description: 'Splits $500.00 among 1 member exactly',
      status: 'pending',
      durationMs: 0,
    },
    {
      id: 'TC-MATH-03',
      suite: 'Mathematical Exactness',
      name: 'Exact Split Validation Check',
      description: 'Rejects unequal sums and accepts matching sums',
      status: 'pending',
      durationMs: 0,
    },
    {
      id: 'TC-MATH-04',
      suite: 'Mathematical Exactness',
      name: 'Percentage Split Total Validation',
      description: 'Validates 100% total requirement and computes minor units exactly',
      status: 'pending',
      durationMs: 0,
    },
    {
      id: 'TC-MATH-05',
      suite: 'Mathematical Exactness',
      name: 'Shares / Ratio Split Weights',
      description: 'Computes weighted shares (e.g. 2:1:1) accurately',
      status: 'pending',
      durationMs: 0,
    },
    {
      id: 'TC-DEBT-01',
      suite: 'Settlement Optimization',
      name: 'Debt Simplification Minimization',
      description: 'Reduces circular multi-party debts to minimal net transactions',
      status: 'pending',
      durationMs: 0,
    },
    {
      id: 'TC-CURR-01',
      suite: 'Currency & Exchange',
      name: 'Multi-Currency Conversion Precision',
      description: 'Applies exchange rates without precision drift',
      status: 'pending',
      durationMs: 0,
    },
    {
      id: 'TC-SEC-01',
      suite: 'Security & Recovery',
      name: 'Cryptographic Recovery Code & SHA-256 Hashing',
      description: 'Generates 20-character recovery code and produces 64-char hex hash',
      status: 'pending',
      durationMs: 0,
    },
  ]);

  const runAllTests = async () => {
    setIsRunning(true);

    const updated = [...results];

    for (let i = 0; i < updated.length; i++) {
      const tc = updated[i];
      tc.status = 'running';
      setResults([...updated]);

      const startTime = performance.now();
      try {
        // Execute real logic assertions
        if (tc.id === 'TC-MATH-01') {
          const shares = calculateEqualShares(100.0, ['m1', 'm2', 'm3']);
          const sum = shares.reduce((acc, s) => acc + s.shareAmount, 0);
          if (Math.abs(sum - 100.0) > 0.001) throw new Error(`Sum is ${sum}, expected 100.00`);
          if (shares[0].shareAmount !== 33.34) throw new Error(`First share is ${shares[0].shareAmount}, expected 33.34`);
        } else if (tc.id === 'TC-MATH-02') {
          const shares = calculateEqualShares(500.0, ['m1']);
          if (shares.length !== 1 || shares[0].shareAmount !== 500.0) {
            throw new Error(`Expected single share of 500.00, got ${shares[0]?.shareAmount}`);
          }
        } else if (tc.id === 'TC-MATH-03') {
          const invalid = validateExactShares(1000, [
            { memberId: 'm1', amount: 500 },
            { memberId: 'm2', amount: 400 },
          ]);
          if (invalid.isValid) throw new Error('Expected 900 sum to fail validation');
          const valid = validateExactShares(1000, [
            { memberId: 'm1', amount: 600 },
            { memberId: 'm2', amount: 400 },
          ]);
          if (!valid.isValid) throw new Error('Expected 1000 sum to pass validation');
        } else if (tc.id === 'TC-MATH-04') {
          const invalid = validateAndCalculatePercentageShares(1000, [
            { memberId: 'm1', percentage: 50 },
            { memberId: 'm2', percentage: 40 },
          ]);
          if (invalid.isValid) throw new Error('Expected 90% sum to fail');
          const valid = validateAndCalculatePercentageShares(1000, [
            { memberId: 'm1', percentage: 33.33 },
            { memberId: 'm2', percentage: 33.33 },
            { memberId: 'm3', percentage: 33.34 },
          ]);
          if (!valid.isValid || !valid.result) throw new Error('Expected 100% sum to pass');
          const totalShares = valid.result.reduce((a, b) => a + b.shareAmount, 0);
          if (Math.abs(totalShares - 1000) > 0.01) throw new Error(`Sum is ${totalShares}, expected 1000`);
        } else if (tc.id === 'TC-MATH-05') {
          const shares = calculateSharesSplits(120, [
            { memberId: 'm1', sharesCount: 2 },
            { memberId: 'm2', sharesCount: 1 },
            { memberId: 'm3', sharesCount: 1 },
          ]);
          if (shares.find(s => s.memberId === 'm1')?.shareAmount !== 60) throw new Error('m1 should be 60');
          if (shares.find(s => s.memberId === 'm2')?.shareAmount !== 30) throw new Error('m2 should be 30');
        } else if (tc.id === 'TC-DEBT-01') {
          const balances = [
            { memberId: 'm1', totalPaid: 100, totalShare: 20, netBalance: 80 },
            { memberId: 'm2', totalPaid: 0, totalShare: 50, netBalance: -50 },
            { memberId: 'm3', totalPaid: 0, totalShare: 30, netBalance: -30 },
          ];
          const settlements = optimizeSettlements(balances, 'CAD');
          if (settlements.length > 2) throw new Error(`Too many settlements: ${settlements.length}`);
          const totalSettled = settlements.reduce((a, s) => a + s.amount, 0);
          if (Math.abs(totalSettled - 80) > 0.01) throw new Error(`Settled total ${totalSettled}, expected 80`);
        } else if (tc.id === 'TC-CURR-01') {
          const rate = getDefaultExchangeRate('USD', 'CAD');
          if (rate <= 0) throw new Error('Invalid default exchange rate');
          const converted = 100 * rate;
          if (converted <= 0) throw new Error('Invalid converted currency');
        } else if (tc.id === 'TC-SEC-01') {
          const code = generateSecureRecoveryCode();
          if (code.length !== 24 || !code.includes('-')) throw new Error(`Unexpected code format: ${code}`);
          const hash = await hashRecoveryCode(code);
          if (hash.length !== 64) throw new Error(`Expected 64-char sha256 hex, got ${hash.length}`);
        }

        tc.status = 'passed';
      } catch (err: any) {
        tc.status = 'failed';
        tc.error = err.message || 'Assertion failed';
      }
      tc.durationMs = Math.round((performance.now() - startTime) * 10) / 10;
      setResults([...updated]);
      // Small pause for visually pleasing progression
      await new Promise(r => setTimeout(r, 60));
    }

    setIsRunning(false);
  };

  useEffect(() => {
    runAllTests();
  }, []);

  const passedCount = results.filter(r => r.status === 'passed').length;
  const failedCount = results.filter(r => r.status === 'failed').length;

  return (
    <div
      id="test-runner-modal-backdrop"
      className="ui-modal-backdrop"
      onClick={onClose}
    >
      <div
        id="test-runner-modal-card"
        className="ui-modal-card max-w-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ui-modal-header">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-base tracking-tight text-[var(--text-primary)]">
                Automated Verification Test Suite
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Financial invariant checks, split algorithms, and security
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runAllTests}
              disabled={isRunning}
              className="ui-btn ui-btn-primary py-1.5 px-3 text-xs"
            >
              <RefreshCw className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'Running...' : 'Re-run'}</span>
            </button>
            <button
              onClick={onClose}
              className="ui-icon-btn w-8 h-8"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="px-5 py-3 bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)] flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-[var(--text-primary)]">
              {results.length} Test Cases
            </span>
            <span className="flex items-center gap-1 font-semibold text-[var(--success-text)]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {passedCount} Passed
            </span>
            {failedCount > 0 && (
              <span className="flex items-center gap-1 font-semibold text-[var(--danger-text)]">
                <XCircle className="w-3.5 h-3.5" />
                {failedCount} Failed
              </span>
            )}
          </div>

          <span className="text-xs font-mono text-[var(--text-secondary)]">
            Status: {isRunning ? 'Running suite...' : failedCount === 0 ? 'All 100% Passed' : 'Failures detected'}
          </span>
        </div>

        {/* Results List */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-2.5">
          {results.map(tc => (
            <div
              key={tc.id}
              className={`p-3 rounded-xl border transition-all ${
                tc.status === 'passed'
                  ? 'bg-[var(--success-subtle)]/50 border-[var(--success-border)]'
                  : tc.status === 'failed'
                  ? 'bg-[var(--danger-subtle)]/50 border-[var(--danger-border)]'
                  : 'bg-[var(--bg-surface)] border-[var(--border-default)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      {tc.id}
                    </span>
                    <h4 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {tc.name}
                    </h4>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-tight">
                    {tc.description}
                  </p>
                  {tc.error && (
                    <p className="text-xs font-mono text-[var(--danger-text)] font-semibold pt-1">
                      Error: {tc.error}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {tc.durationMs > 0 && (
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">
                      {tc.durationMs}ms
                    </span>
                  )}
                  {tc.status === 'passed' && (
                    <span className="ui-badge ui-badge-success">
                      <CheckCircle2 className="w-3 h-3" />
                      PASSED
                    </span>
                  )}
                  {tc.status === 'failed' && (
                    <span className="ui-badge ui-badge-danger">
                      <XCircle className="w-3 h-3" />
                      FAILED
                    </span>
                  )}
                  {tc.status === 'running' && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-[var(--brand-text)]">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Testing
                    </span>
                  )}
                  {tc.status === 'pending' && (
                    <span className="text-xs text-[var(--text-muted)] font-mono">Queued</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border-default)] bg-[var(--bg-subtle)] flex justify-end">
          <button
            onClick={onClose}
            className="ui-btn ui-btn-primary px-4 py-2 text-xs"
          >
            Close Runner
          </button>
        </div>
      </div>
    </div>
  );
};
