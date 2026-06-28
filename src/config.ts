export const EXCHANGE_RATES: { [currency: string]: number } = {
  USD: 1.0,      // 1 USD = 1.0 USD
  EUR: 1.08,     // 1 EUR = 1.08 USD
  GBP: 1.25,     // 1 GBP = 1.25 USD
  CAD: 0.73,     // 1 CAD = 0.73 USD
  INR: 0.012,    // 1 INR = 0.012 USD
  JPY: 0.0064,   // 1 JPY = 0.0064 USD
};

export const REVERSE_EXCHANGE_RATES: { [currency: string]: number } = {
  USD: 1.0,
  EUR: 1 / 1.08,
  GBP: 1 / 1.25,
  CAD: 1 / 0.73,
  INR: 1 / 0.012,
  JPY: 1 / 0.0064,
};

/**
 * Convert a local currency amount to USD (Base Currency)
 */
export function convertToUsd(amount: number, currency: string): number {
  const rate = EXCHANGE_RATES[currency.toUpperCase()];
  if (rate === undefined) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  return amount * rate;
}

/**
 * Convert a USD amount to a local currency amount
 */
export function convertFromUsd(amountInUsd: number, targetCurrency: string): number {
  const rate = REVERSE_EXCHANGE_RATES[targetCurrency.toUpperCase()];
  if (rate === undefined) {
    throw new Error(`Unsupported target currency: ${targetCurrency}`);
  }
  return amountInUsd * rate;
}
