import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Database } from 'sqlite';
import { createTestDb, teardownTestDb } from './helpers/testDb';
import { getAnalytics } from '../src/services/analytics.service';

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(() => {
  teardownTestDb();
});

beforeEach(async () => {
  await db.run('DELETE FROM employees');
});

async function ins(p: { id: string; dept: string; country: string; currency: string; salary: number; gender: string }) {
  await db.run(
    `INSERT INTO employees
       (employee_id,first_name,last_name,email,job_title,department,salary,currency,country,date_of_joining,performance_rating,gender)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [p.id, 'Test', 'User', `${p.id}@acme.com`, 'Engineer', p.dept, p.salary, p.currency, p.country, '2020-01-01', 3, p.gender],
  );
}

describe('getAnalytics', () => {
  it('returns zero/empty summary for an empty database', async () => {
    const result = await getAnalytics();
    expect(result.summary.headcount).toBe(0);
    expect(result.summary.totalSpendUsd).toBe(0);
    expect(result.departments).toHaveLength(0);
    expect(result.countries).toHaveLength(0);
  });

  it('computes headcount and countries_count correctly', async () => {
    await ins({ id: 'E1', dept: 'Engineering', country: 'USA',     currency: 'USD', salary: 100000, gender: 'Male' });
    await ins({ id: 'E2', dept: 'Marketing',   country: 'Germany', currency: 'EUR', salary: 70000,  gender: 'Female' });

    const result = await getAnalytics();
    expect(result.summary.headcount).toBe(2);
    expect(result.summary.countriesCount).toBe(2);
    expect(result.summary.currenciesCount).toBe(2);
  });

  it('aggregates department spend and employee count', async () => {
    await ins({ id: 'E1', dept: 'Engineering', country: 'USA', currency: 'USD', salary: 100000, gender: 'Male' });
    await ins({ id: 'E2', dept: 'Engineering', country: 'USA', currency: 'USD', salary: 80000,  gender: 'Female' });
    await ins({ id: 'E3', dept: 'Marketing',   country: 'USA', currency: 'USD', salary: 60000,  gender: 'Male' });

    const result = await getAnalytics();
    const eng = result.departments.find(d => d.department === 'Engineering');
    expect(eng).toBeDefined();
    expect(eng?.count).toBe(2);
    expect(eng?.total_spend_usd).toBeCloseTo(180000, 0);
    expect(eng?.avg_salary_usd).toBeCloseTo(90000, 0);
  });

  it('computes global gender pay gap', async () => {
    await ins({ id: 'E1', dept: 'Engineering', country: 'USA', currency: 'USD', salary: 100000, gender: 'Male' });
    await ins({ id: 'E2', dept: 'Engineering', country: 'USA', currency: 'USD', salary: 80000,  gender: 'Female' });

    const result = await getAnalytics();
    // gap = (100k - 80k) / 100k * 100 = 20%
    expect(result.summary.globalPayGap).toBeCloseTo(20, 0);
  });

  it('computes per-department gender pay gap', async () => {
    await ins({ id: 'E1', dept: 'Engineering', country: 'USA', currency: 'USD', salary: 100000, gender: 'Male' });
    await ins({ id: 'E2', dept: 'Engineering', country: 'USA', currency: 'USD', salary: 80000,  gender: 'Female' });

    const result = await getAnalytics();
    const engGap = result.genderPayGap.find(g => g.department === 'Engineering');
    expect(engGap).toBeDefined();
    expect(engGap?.maleAvg).toBeCloseTo(100000, 0);
    expect(engGap?.femaleAvg).toBeCloseTo(80000, 0);
    expect(engGap?.gapPercent).toBeCloseTo(20, 0);
    expect(engGap?.ratio).toBeCloseTo(0.8, 2);
  });

  it('excludes department from pay gap when only one gender is present', async () => {
    await ins({ id: 'E1', dept: 'Legal', country: 'USA', currency: 'USD', salary: 90000, gender: 'Male' });
    // No female in Legal
    const result = await getAnalytics();
    const legalGap = result.genderPayGap.find(g => g.department === 'Legal');
    expect(legalGap).toBeUndefined();
  });

  it('places employees into the correct salary band', async () => {
    await ins({ id: 'E1', dept: 'Eng', country: 'USA', currency: 'USD', salary: 45000,  gender: 'Male' });   // 30k–60k
    await ins({ id: 'E2', dept: 'Eng', country: 'USA', currency: 'USD', salary: 100000, gender: 'Female' }); // 90k–120k
    await ins({ id: 'E3', dept: 'Eng', country: 'USA', currency: 'USD', salary: 25000,  gender: 'Male' });   // Under 30k

    const result = await getAnalytics();
    const band30 = result.salaryBands.find(b => b.band === '30k-60k');
    const band90 = result.salaryBands.find(b => b.band === '90k-120k');
    const bandU30 = result.salaryBands.find(b => b.band === 'Under 30k');
    expect(band30?.count).toBe(1);
    expect(band90?.count).toBe(1);
    expect(bandU30?.count).toBe(1);
  });

  it('all eight salary bands are always present in the response', async () => {
    await ins({ id: 'E1', dept: 'Eng', country: 'USA', currency: 'USD', salary: 50000, gender: 'Male' });
    const result = await getAnalytics();
    expect(result.salaryBands).toHaveLength(8);
  });

  it('converts non-USD salaries to USD in analytics', async () => {
    // 1 GBP = 1.25 USD  →  80000 GBP = 100000 USD
    await ins({ id: 'E1', dept: 'Eng', country: 'UK', currency: 'GBP', salary: 80000, gender: 'Male' });
    const result = await getAnalytics();
    expect(result.summary.avgSalaryUsd).toBeCloseTo(100000, 0);
    expect(result.summary.totalSpendUsd).toBeCloseTo(100000, 0);
  });
});
