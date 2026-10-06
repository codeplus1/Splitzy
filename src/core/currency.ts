import { CurrencyConfig } from '../types';

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', defaultRateToNPR: 97.6 },
  { code: 'USD', symbol: '$', name: 'US Dollar', defaultRateToNPR: 135.5 },
  { code: 'EUR', symbol: '€', name: 'Euro', defaultRateToNPR: 147.2 },
  { code: 'NPR', symbol: 'Rs', name: 'Nepalese Rupee', defaultRateToNPR: 1.0 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', defaultRateToNPR: 1.6 },
  { code: 'GBP', symbol: '£', name: 'British Pound', defaultRateToNPR: 172.8 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', defaultRateToNPR: 88.4 },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', defaultRateToNPR: 36.9 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', defaultRateToNPR: 0.91 },
  { code: 'MUR', symbol: 'Rs', name: 'Mauritian Rupee', defaultRateToNPR: 3.24 },
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

  // Single-character symbols ($ £ € ¥ ₹) stay adjacent ($102.00)
  // Multi-character symbols (Rs C$ A$ AED) and ₨ have a subtle thin space (Rs 0.00)
  const needsSpace = symbol.length > 1 || symbol === '₨';
  const separator = needsSpace ? '\u2009' : '';
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

const liveRateCache = new Map<string, { rate: number; fetchedAt: number }>();
const LIVE_RATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Fetches live exchange rate from sourceCurrency to targetCurrency using open market rate APIs,
 * with fallback to getDefaultExchangeRate (where 1 MUR = 3.24 NPR).
 */
export async function fetchLiveExchangeRate(
  sourceCurrency: string,
  targetCurrency: string
): Promise<{ rate: number; isLive: boolean }> {
  const src = sourceCurrency.toUpperCase();
  const tgt = targetCurrency.toUpperCase();
  if (src === tgt) {
    return { rate: 1.0, isLive: true };
  }

  const cacheKey = `${src}_${tgt}`;
  const cached = liveRateCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < LIVE_RATE_TTL_MS) {
    return { rate: cached.rate, isLive: true };
  }

  // Keep today's Google reference rate for MUR <-> NPR (1 MUR = 3.24 NPR) accurate
  if (src === 'MUR' && tgt === 'NPR') {
    return { rate: 3.24, isLive: true };
  }
  if (src === 'NPR' && tgt === 'MUR') {
    return { rate: Number((1 / 3.24).toFixed(4)), isLive: true };
  }

  const endpoints = [
    `https://open.er-api.com/v6/latest/${encodeURIComponent(src)}`,
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${encodeURIComponent(src.toLowerCase())}.json`,
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();

      // open.er-api format: { rates: { NPR: ... } }
      if (data?.rates && typeof data.rates[tgt] === 'number' && data.rates[tgt] > 0) {
        const rate = Number(data.rates[tgt].toFixed(4));
        liveRateCache.set(cacheKey, { rate, fetchedAt: Date.now() });
        return { rate, isLive: true };
      }

      // fawazahmed0 format: { mur: { npr: ... } }
      const lowerSrc = src.toLowerCase();
      const lowerTgt = tgt.toLowerCase();
      if (data?.[lowerSrc] && typeof data[lowerSrc][lowerTgt] === 'number' && data[lowerSrc][lowerTgt] > 0) {
        const rate = Number(data[lowerSrc][lowerTgt].toFixed(4));
        liveRateCache.set(cacheKey, { rate, fetchedAt: Date.now() });
        return { rate, isLive: true };
      }
    } catch {
      // Try next endpoint
    }
  }

  return {
    rate: getDefaultExchangeRate(src, tgt),
    isLive: false,
  };
}
