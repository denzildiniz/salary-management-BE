export const USD_CONVERSION_SQL = `
  salary * CASE UPPER(currency)
    WHEN 'USD' THEN 1.0
    WHEN 'EUR' THEN 1.08
    WHEN 'GBP' THEN 1.25
    WHEN 'CAD' THEN 0.73
    WHEN 'INR' THEN 0.012
    WHEN 'JPY' THEN 0.0064
    ELSE 1.0
  END
`;
