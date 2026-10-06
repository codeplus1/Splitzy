import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import {
  adToBs,
  bsToAd,
  NEPALI_MONTHS,
  getDaysInBsMonth,
  toDevanagariDigits,
} from '../core/nepaliCalendar';
import { CalendarType, SupportedLanguage } from '../types';

interface DatePickerBSADProps {
  valueISO?: string; // YYYY-MM-DD
  onChange?: (dateISO: string, calendarType: CalendarType) => void;
  preferredCalendar?: CalendarType;
  dateISO?: string;
  calendarType?: CalendarType;
  onDateChange?: (dateISO: string) => void;
  onCalendarToggle?: (calendarType: CalendarType) => void;
  language?: SupportedLanguage;
}

export const DatePickerBSAD: React.FC<DatePickerBSADProps> = ({
  valueISO,
  onChange,
  preferredCalendar = 'AD',
  dateISO,
  calendarType,
  onDateChange,
  onCalendarToggle,
  language = 'en',
}) => {
  const effectiveISO = dateISO || valueISO || new Date().toISOString().split('T')[0];
  const initialCalendar = calendarType || preferredCalendar || 'AD';
  const [mode, setMode] = useState<CalendarType>(initialCalendar);

  useEffect(() => {
    if (calendarType) {
      setMode(calendarType);
    }
  }, [calendarType]);

  const handleModeChange = (newMode: CalendarType) => {
    setMode(newMode);
    if (onCalendarToggle) {
      onCalendarToggle(newMode);
    }
  };

  const notifyChange = (iso: string, calType: CalendarType) => {
    if (onChange) {
      onChange(iso, calType);
    }
    if (onDateChange) {
      onDateChange(iso);
    }
  };

  // Derived BS state
  const [bsYear, setBsYear] = useState<number>(2081);
  const [bsMonth, setBsMonth] = useState<number>(1);
  const [bsDay, setBsDay] = useState<number>(1);

  // Sync from initial effectiveISO
  useEffect(() => {
    try {
      const d = new Date(effectiveISO || new Date().toISOString().split('T')[0]);
      if (!isNaN(d.getTime())) {
        const bs = adToBs(d);
        setBsYear(bs.year);
        setBsMonth(bs.month);
        setBsDay(bs.day);
      }
    } catch {
      // ignore
    }
  }, [effectiveISO]);

  const handleAdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      notifyChange(val, 'AD');
    }
  };

  const handleBsChange = (newYear: number, newMonth: number, newDay: number) => {
    const maxDays = getDaysInBsMonth(newYear, newMonth);
    const validDay = Math.min(newDay, maxDays);
    setBsYear(newYear);
    setBsMonth(newMonth);
    setBsDay(validDay);

    const adDate = bsToAd(newYear, newMonth, validDay);
    const iso = adDate.toISOString().split('T')[0];
    notifyChange(iso, 'BS');
  };

  const daysInCurrentBsMonth = getDaysInBsMonth(bsYear, bsMonth);

  // Derived current representations
  const curAdDate = new Date(effectiveISO || new Date().toISOString().split('T')[0]);
  const bsConversion = !isNaN(curAdDate.getTime()) ? adToBs(curAdDate) : null;

  return (
    <div className="p-3 sm:p-3.5 rounded-2xl bg-[var(--surface-subtle)]/75 border border-[var(--border)] space-y-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <label className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[var(--ink-secondary)] leading-tight mb-0 min-w-0">
          <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent)] shrink-0" />
          <span className="truncate">
            {mode === 'BS' ? 'मिति (EXPENSE DATE)' : 'EXPENSE DATE'}
          </span>
        </label>

        {/* Toggle between AD (English) and BS (बिक्रम संवत्) */}
        <div className="inline-flex items-center bg-[var(--surface-hover)]/80 dark:bg-[var(--surface)] border border-[var(--border)] rounded-xl p-0.5 sm:p-1 gap-0.5 sm:gap-1 shrink-0 max-w-full">
          <button
            type="button"
            onClick={() => handleModeChange('AD')}
            className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[11px] font-semibold leading-tight text-center whitespace-nowrap transition-all cursor-pointer ${
              mode === 'AD'
                ? 'bg-[var(--surface)] dark:bg-[var(--surface-subtle)] text-[var(--ink)] shadow-2xs font-bold'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink)]'
            }`}
          >
            AD (English)
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('BS')}
            className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[11px] font-semibold leading-tight text-center whitespace-nowrap transition-all cursor-pointer ${
              mode === 'BS'
                ? 'bg-[var(--surface)] dark:bg-[var(--surface-subtle)] text-[var(--ink)] shadow-2xs font-bold'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink)]'
            }`}
          >
            BS (बिक्रम संवत्)
          </button>
        </div>
      </div>

      {mode === 'AD' ? (
        <div className="space-y-2">
          <input
            id="ad-date-input"
            type="date"
            value={effectiveISO}
            onChange={handleAdChange}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm font-medium text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent)]/10 transition-all"
          />
          {bsConversion && (
            <div className="text-xs flex items-center justify-between px-1 pt-0.5">
              <span className="text-[var(--ink-secondary)]">
                BS: <strong className="font-bold text-[var(--accent)]">{bsConversion.formatted}</strong>
              </span>
              <span className="text-[var(--ink-muted)] font-medium">
                {bsConversion.formattedDevanagari}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {/* BS Year */}
            <div>
              <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                Year
              </label>
              <select
                id="bs-year-select"
                value={bsYear}
                onChange={e => handleBsChange(Number(e.target.value), bsMonth, bsDay)}
                className="ui-input px-2.5 py-2 text-xs"
              >
                {Array.from({ length: 15 }, (_, i) => 2073 + i).map(year => (
                  <option key={year} value={year}>
                    {year} ({toDevanagariDigits(year)})
                  </option>
                ))}
              </select>
            </div>

            {/* BS Month */}
            <div>
              <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                Month
              </label>
              <select
                id="bs-month-select"
                value={bsMonth}
                onChange={e => handleBsChange(bsYear, Number(e.target.value), bsDay)}
                className="ui-input px-2 py-2 text-xs"
              >
                {NEPALI_MONTHS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.en} ({m.dev})
                  </option>
                ))}
              </select>
            </div>

            {/* BS Day */}
            <div>
              <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                Day
              </label>
              <select
                id="bs-day-select"
                value={bsDay}
                onChange={e => handleBsChange(bsYear, bsMonth, Number(e.target.value))}
                className="ui-input px-2.5 py-2 text-xs"
              >
                {Array.from({ length: daysInCurrentBsMonth }, (_, i) => i + 1).map(day => (
                  <option key={day} value={day}>
                    {day} ({toDevanagariDigits(day)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-[var(--text-secondary)] flex items-center justify-between px-1">
            <span>
              AD: <strong className="text-[var(--text-primary)] font-mono">{effectiveISO}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                notifyChange(today, 'BS');
              }}
              className="text-xs text-[var(--brand-text)] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
