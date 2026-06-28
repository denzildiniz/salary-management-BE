import { describe, it, expect } from 'vitest';
import { convertToUsd, convertFromUsd, EXCHANGE_RATES } from '../src/config';

describe('Currency Conversions', () => {
  it('should convert local currency to USD correctly', () => {
    expect(convertToUsd(100, 'USD')).toBe(100);
    expect(convertToUsd(100, 'EUR')).toBe(108);
    expect(convertToUsd(1000, 'INR')).toBe(12);
    expect(convertToUsd(10000, 'JPY')).toBe(64);
  });

  it('should convert USD back to local currency correctly', () => {
    expect(convertFromUsd(100, 'USD')).toBe(100);
    expect(Math.round(convertFromUsd(108, 'EUR'))).toBe(100);
    expect(Math.round(convertFromUsd(12, 'INR'))).toBe(1000);
  });

  it('should throw error for unsupported currency', () => {
    expect(() => convertToUsd(100, 'XYZ')).toThrowError('Unsupported currency');
    expect(() => convertFromUsd(100, 'XYZ')).toThrowError('Unsupported target currency');
  });
});
