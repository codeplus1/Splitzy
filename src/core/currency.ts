import { CurrencyConfig } from '../types';

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', defaultRateToNPR: 97.6 },
  { code: 'USD', symbol: '$', name: 'US Dollar', defaultRateToNPR: 135.5 },
  { code: 'EUR', symbol: '€', name: 'Euro', defaultRateToNPR: 147.2 },
  { code: 'NPR', symbol: '₨', name: 'Nepalese Rupee', defaultRateToNPR: 1.0 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', defaultRateToNPR: 1.6 },
  { code: 'GBP', symbol: '£', name: 'British Pound', defaultRateToNPR: 172.8 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', defaultRateToNPR: 88.4 },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', defaultRateToNPR: 36.9 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', defaultRateToNPR: 0.91 },
  { code: 'MUR', symbol: '₨', name: 'Mauritian Rupee', defaultRateToNPR: 2.92 },
];

/**
 * Returns currency symbol for a currency code
 */
export function getCurrencySymbol(code: string): string {
  const found = SUPPORTED_CURRENCIES.find(c => c.code.toUpperCase() === code.toUpperCase());
  return found ? found.symbol : code;
}

/**
 * Formats an amount with currency symbol and 2 decimal places.
 * - Always keeps consistent 2 decimal places for financial alignment.
 * - In French locale (Québec / FR), amounts are formatted as: 188,50 $
 * - Multi-letter currency symbols (C$, A$, AED, ₨) use a clean non-breaking space.
 */
export function formatMoney(amount: number, currencyCode: string = 'CAD', lang: string = 'en'): string {
  const symbol = getCurrencySymbol(currencyCode);
  const isFrench = lang === 'fr';

  const formattedNumber = Math.abs(amount).toLocaleString(isFrench ? 'fr-CA' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const sign = amount < -0.0001 ? '-' : '';
  if (isFrench) {
    return `${sign}${formattedNumber}\u00A0${symbol}`;
  }

  // Single-character symbols ($ £ € ¥) stay adjacent ($102.00)
  // Multi-character symbols (C$ A$ AED ₨) have a clean non-breaking space (C$ 102.00)
  const separator = symbol.length > 1 ? '\u00A0' : '';
  return `${sign}${symbol}${separator}${formattedNumber}`;
}

/**
 * Suggests default exchange rate from source currency to target base currency.
 * Rate means: 1 SourceCurrency = X TargetBaseCurrency
 */
export function getDefaultExchangeRate(sourceCurrency: string, targetCurrency: string): number {
  if (sourceCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
    return 1.0;
  }

  const src = SUPPORTED_CURRENCIES.find(c => c.code.toUpperCase() === sourceCurrency.toUpperCase());
  const tgt = SUPPORTED_CURRENCIES.find(c => c.code.toUpperCase() === targetCurrency.toUpperCase());

  if (!src || !tgt || tgt.defaultRateToNPR === 0) {
    return 1.0;
  }

  // Rate in NPR: 1 src = src.defaultRateToNPR NPR
  // 1 tgt = tgt.defaultRateToNPR NPR
  // Therefore 1 src = (src.defaultRateToNPR / tgt.defaultRateToNPR) tgt
  const rate = src.defaultRateToNPR / tgt.defaultRateToNPR;
  return Number(rate.toFixed(4));
}
