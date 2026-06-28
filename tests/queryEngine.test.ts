import { describe, it, expect, beforeAll } from 'vitest';
import { parseAndExecuteQuery } from '../src/queryEngine';
import { initDb } from '../src/db';

describe('NLP Query Engine', () => {
  beforeAll(async () => {
    await initDb();
  });

  it('should parse headcount queries correctly', async () => {
    const res = await parseAndExecuteQuery('how many employees are in Engineering?');
    expect(res.matched).toBe(true);
    expect(res.intent).toBe('headcount');
    expect(res.visualizationType).toBe('scalar');
    expect(res.data.count).toBeGreaterThan(0);
    expect(res.data.filter).toBe('Engineering');
    expect(res.data.type).toBe('department');
  });

  it('should parse average salary queries by country correctly', async () => {
    const res = await parseAndExecuteQuery('What is the average salary in Germany?');
    expect(res.matched).toBe(true);
    expect(res.intent).toBe('average_salary');
    expect(res.visualizationType).toBe('scalar');
    expect(res.data.avgLocal).toBeGreaterThan(0);
    expect(res.data.currency).toBe('EUR');
    expect(res.data.filter).toBe('Germany');
    expect(res.data.type).toBe('country');
  });

  it('should parse total spend queries correctly', async () => {
    const res = await parseAndExecuteQuery('total spend overall');
    expect(res.matched).toBe(true);
    expect(res.intent).toBe('total_spend');
    expect(res.data.total).toBeGreaterThan(0);
    expect(res.data.count).toBeGreaterThanOrEqual(10000);
  });

  it('should parse highest paid queries correctly', async () => {
    const res = await parseAndExecuteQuery('highest paid overall');
    expect(res.matched).toBe(true);
    expect(res.intent).toBe('highest_paid');
    expect(res.visualizationType).toBe('table');
    expect(res.data.length).toBe(5);
    expect(res.data[0].salary_usd).toBeGreaterThanOrEqual(res.data[1].salary_usd);
  });

  it('should parse gender pay gap queries correctly', async () => {
    const res = await parseAndExecuteQuery('show gender pay equity info');
    expect(res.matched).toBe(true);
    expect(res.intent).toBe('gender_pay_gap');
    expect(res.visualizationType).toBe('scalar');
    expect(res.data.femaleAvg).toBeGreaterThan(0);
    expect(res.data.maleAvg).toBeGreaterThan(0);
    expect(res.data.gapPercent).toBeDefined();
  });

  it('should return unmatched response for gibberish', async () => {
    const res = await parseAndExecuteQuery('abcdefg what is this');
    expect(res.matched).toBe(false);
    expect(res.intent).toBe('unknown');
    expect(res.data).toBeNull();
  });
});
