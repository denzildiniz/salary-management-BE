import { getDb } from '../db';
import { USD_CONVERSION_SQL } from '../constants/sql';

const BAND_ORDER = [
  'Under 30k', '30k-60k', '60k-90k', '90k-120k',
  '120k-150k', '150k-180k', '180k-210k', 'Over 210k',
];

interface GenderRow {
  department: string;
  gender: string;
  avg_usd: number;
}

function buildGenderPayGap(rows: GenderRow[]) {
  const depts = Array.from(new Set(rows.map(r => r.department)));
  return depts.flatMap(dept => {
    const male = rows.find(r => r.department === dept && r.gender === 'Male');
    const female = rows.find(r => r.department === dept && r.gender === 'Female');
    if (!male || !female) return [];
    const gapPercent = ((male.avg_usd - female.avg_usd) / male.avg_usd) * 100;
    return [{
      department: dept,
      maleAvg: male.avg_usd,
      femaleAvg: female.avg_usd,
      gapPercent: parseFloat(gapPercent.toFixed(2)),
      ratio: parseFloat((female.avg_usd / male.avg_usd).toFixed(2)),
    }];
  });
}

export async function getAnalytics() {
  const db = await getDb();

  const [kpis, deptRows, countryRows, rawBandRows, deptGenderRows, globalGenderRows] =
    await Promise.all([
      db.get<{
        headcount: number;
        total_spend_usd: number;
        avg_salary_usd: number;
        countries_count: number;
        currencies_count: number;
      }>(`
        SELECT COUNT(*) as headcount,
               SUM(${USD_CONVERSION_SQL}) as total_spend_usd,
               AVG(${USD_CONVERSION_SQL}) as avg_salary_usd,
               COUNT(DISTINCT country) as countries_count,
               COUNT(DISTINCT currency) as currencies_count
        FROM employees
      `),
      db.all<{ department: string; count: number; total_spend_usd: number; avg_salary_usd: number }[]>(`
        SELECT department,
               COUNT(*) as count,
               SUM(${USD_CONVERSION_SQL}) as total_spend_usd,
               AVG(${USD_CONVERSION_SQL}) as avg_salary_usd
        FROM employees
        GROUP BY department
        ORDER BY total_spend_usd DESC
      `),
      db.all<{
        country: string;
        currency: string;
        count: number;
        total_spend_usd: number;
        avg_salary_usd: number;
      }[]>(`
        SELECT country, currency,
               COUNT(*) as count,
               SUM(${USD_CONVERSION_SQL}) as total_spend_usd,
               AVG(${USD_CONVERSION_SQL}) as avg_salary_usd
        FROM employees
        GROUP BY country
        ORDER BY total_spend_usd DESC
      `),
      db.all<{ band: string; count: number }[]>(`
        SELECT
          CASE
            WHEN salary_usd < 30000  THEN 'Under 30k'
            WHEN salary_usd < 60000  THEN '30k-60k'
            WHEN salary_usd < 90000  THEN '60k-90k'
            WHEN salary_usd < 120000 THEN '90k-120k'
            WHEN salary_usd < 150000 THEN '120k-150k'
            WHEN salary_usd < 180000 THEN '150k-180k'
            WHEN salary_usd < 210000 THEN '180k-210k'
            ELSE 'Over 210k'
          END as band,
          COUNT(*) as count
        FROM (SELECT (${USD_CONVERSION_SQL}) as salary_usd FROM employees)
        GROUP BY band
      `),
      db.all<GenderRow[]>(`
        SELECT department, gender, AVG(${USD_CONVERSION_SQL}) as avg_usd
        FROM employees
        WHERE gender IN ('Male', 'Female')
        GROUP BY department, gender
      `),
      db.all<{ gender: string; avg_usd: number }[]>(`
        SELECT gender, AVG(${USD_CONVERSION_SQL}) as avg_usd
        FROM employees
        WHERE gender IN ('Male', 'Female')
        GROUP BY gender
      `),
    ]);

  const salaryBands = BAND_ORDER.map(band => ({
    band,
    count: rawBandRows.find(r => r.band === band)?.count ?? 0,
  }));

  const globalFemale = globalGenderRows.find(r => r.gender === 'Female')?.avg_usd ?? 0;
  const globalMale = globalGenderRows.find(r => r.gender === 'Male')?.avg_usd ?? 0;
  const globalPayGap = globalMale > 0 ? ((globalMale - globalFemale) / globalMale) * 100 : 0;

  return {
    summary: {
      headcount: kpis?.headcount ?? 0,
      totalSpendUsd: kpis?.total_spend_usd ?? 0,
      avgSalaryUsd: kpis?.avg_salary_usd ?? 0,
      countriesCount: kpis?.countries_count ?? 0,
      currenciesCount: kpis?.currencies_count ?? 0,
      globalPayGap: parseFloat(globalPayGap.toFixed(2)),
    },
    departments: deptRows,
    countries: countryRows,
    salaryBands,
    genderPayGap: buildGenderPayGap(deptGenderRows),
  };
}
