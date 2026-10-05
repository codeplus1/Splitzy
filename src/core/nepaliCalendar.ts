import NepaliDate, { dateConfigMap } from 'nepali-date-converter';
import { CalendarType } from '../types';

export interface NepaliMonthInfo {
  id: number;
  en: string;
  dev: string;
}

export const NEPALI_MONTHS: NepaliMonthInfo[] = [
  { id: 1, en: 'Baisakh', dev: 'बैशाख' },
  { id: 2, en: 'Jestha', dev: 'जेठ' },
  { id: 3, en: 'Ashadh', dev: 'असार' },
  { id: 4, en: 'Shrawan', dev: 'साउन' },
  { id: 5, en: 'Bhadra', dev: 'भदौ' },
  { id: 6, en: 'Ashwin', dev: 'असोज' },
  { id: 7, en: 'Kartik', dev: 'कात्तिक' },
  { id: 8, en: 'Mangsir', dev: 'मंसिर' },
  { id: 9, en: 'Poush', dev: 'पुस' },
  { id: 10, en: 'Magh', dev: 'माघ' },
  { id: 11, en: 'Falgun', dev: 'फागुन' },
  { id: 12, en: 'Chaitra', dev: 'चैत' },
];

const MONTH_KEYS = [
  'Baisakh',
  'Jestha',
  'Asar',
  'Shrawan',
  'Bhadra',
  'Aswin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
] as const;

const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

export function toDevanagariDigits(num: number | string): string {
  return String(num).replace(/[0-9]/g, d => DEVANAGARI_DIGITS[parseInt(d, 10)] || d);
}

export function getDaysInBsMonth(year: number, month: number): number {
  const monthKey = MONTH_KEYS[month - 1];
  const yearConfig = dateConfigMap[String(year)];
  if (yearConfig && monthKey && yearConfig[monthKey]) {
    return yearConfig[monthKey];
  }
  return 30;
}

export interface BsDateResult {
  year: number;
  month: number;
  day: number;
  formatted: string;
  formattedDevanagari: string;
}

export function adToBs(date: Date | string): BsDateResult {
  const jsDate = typeof date === 'string' ? new Date(date) : date;
  const nepaliDate = new NepaliDate(jsDate);
  const year = nepaliDate.getYear();
  const month = nepaliDate.getMonth() + 1; // 1-12
  const day = nepaliDate.getDate();

  const monthObj = NEPALI_MONTHS[month - 1] || { en: 'Baisakh', dev: 'बैशाख' };
  const formatted = `${year} ${monthObj.en} ${day}`;
  const formattedDevanagari = `${toDevanagariDigits(year)} ${monthObj.dev} ${toDevanagariDigits(day)}`;

  return {
    year,
    month,
    day,
    formatted,
    formattedDevanagari,
  };
}

export function bsToAd(year: number, month: number, day: number): Date {
  const nepaliDate = new NepaliDate(year, month - 1, day);
  return nepaliDate.toJsDate();
}

export function formatDualDate(
  dateISO: string,
  preferredCalendar: CalendarType = 'AD'
): { primary: string; secondary: string } {
  try {
    const [y, m, d] = dateISO.split('-').map(Number);
    const adDate = new Date(y, m - 1, d);
    if (isNaN(adDate.getTime())) {
      return { primary: dateISO, secondary: '' };
    }

    const adFormatted = adDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const bs = adToBs(adDate);

    if (preferredCalendar === 'BS') {
      return {
        primary: `${bs.formattedDevanagari} (${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')})`,
        secondary: `AD: ${adFormatted}`,
      };
    } else {
      return {
        primary: adFormatted,
        secondary: `BS: ${bs.formattedDevanagari}`,
      };
    }
  } catch {
    return { primary: dateISO, secondary: '' };
  }
}
