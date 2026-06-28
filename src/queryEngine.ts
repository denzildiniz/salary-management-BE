import { getDb } from './db';
import { EXCHANGE_RATES } from './config';
import { USD_CONVERSION_SQL } from './constants/sql';

export interface QueryResult {
  queryText: string;
  matched: boolean;
  intent: string;
  answer: string;
  data: any;
  visualizationType: 'scalar' | 'table' | 'chart' | 'none';
}

const DEPARTMENTS = [
  'engineering', 'product', 'marketing', 'sales',
  'hr', 'finance', 'legal', 'operations'
];

const COUNTRIES = [
  'usa', 'uk', 'germany', 'canada', 'india', 'japan'
];


export async function parseAndExecuteQuery(queryText: string): Promise<QueryResult> {
  const q = queryText.trim().toLowerCase();
  const db = await getDb();

  const result: QueryResult = {
    queryText,
    matched: false,
    intent: 'unknown',
    answer: "I couldn't understand your question. Try asking things like 'average salary in Engineering', 'total payroll spend in Germany', 'highest paid employee overall', or 'how many employees in Sales?'.",
    data: null,
    visualizationType: 'none',
  };

  // 1. TOTAL PAYROLL SPEND
  if (q.includes('total spend') || q.includes('total payroll') || q.includes('total budget')) {
    result.matched = true;
    result.intent = 'total_spend';
    
    let target: string | null = null;
    let isDept = false;
    let isCountry = false;

    for (const d of DEPARTMENTS) {
      if (q.includes(d)) {
        target = d;
        isDept = true;
        break;
      }
    }
    
    if (!target) {
      for (const c of COUNTRIES) {
        if (q.includes(c) || (c === 'usa' && q.includes('us')) || (c === 'uk' && q.includes('united kingdom'))) {
          target = c;
          isCountry = true;
          break;
        }
      }
    }

    if (isDept && target) {
      const row = await db.get(
        `SELECT SUM(${USD_CONVERSION_SQL}) as total, COUNT(*) as count FROM employees WHERE LOWER(department) = ?`,
        [target]
      );
      const total = row?.total || 0;
      const count = row?.count || 0;
      const deptName = target.charAt(0).toUpperCase() + target.slice(1);
      result.answer = `The total annual payroll spend for the **${deptName}** department is **$${Math.round(total).toLocaleString()} USD** across **${count}** employees.`;
      result.data = { total, count, filter: deptName, type: 'department' };
      result.visualizationType = 'scalar';
    } else if (isCountry && target) {
      const row = await db.get(
        `SELECT SUM(salary) as total_local, currency, COUNT(*) as count, SUM(${USD_CONVERSION_SQL}) as total_usd FROM employees WHERE LOWER(country) = ?`,
        [target]
      );
      const totalLocal = row?.total_local || 0;
      const totalUsd = row?.total_usd || 0;
      const currency = row?.currency || 'USD';
      const count = row?.count || 0;
      const countryName = target.toUpperCase() === 'USA' || target.toUpperCase() === 'UK' ? target.toUpperCase() : target.charAt(0).toUpperCase() + target.slice(1);
      result.answer = `The total annual payroll spend in **${countryName}** is **${Math.round(totalLocal).toLocaleString()} ${currency}** ($${Math.round(totalUsd).toLocaleString()} USD) across **${count}** employees.`;
      result.data = { totalLocal, totalUsd, currency, count, filter: countryName, type: 'country' };
      result.visualizationType = 'scalar';
    } else {
      const row = await db.get(`SELECT SUM(${USD_CONVERSION_SQL}) as total, COUNT(*) as count FROM employees`);
      const total = row?.total || 0;
      const count = row?.count || 0;
      result.answer = `The total annual payroll spend overall for ACME Org is **$${Math.round(total).toLocaleString()} USD** across all **${count.toLocaleString()}** employees.`;
      result.data = { total, count };
      result.visualizationType = 'scalar';
    }
    return result;
  }

  // 2. AVERAGE SALARY
  if (q.includes('average salary') || q.includes('avg salary') || q.includes('mean salary')) {
    result.matched = true;
    result.intent = 'average_salary';

    let target: string | null = null;
    let isDept = false;
    let isCountry = false;

    for (const d of DEPARTMENTS) {
      if (q.includes(d)) {
        target = d;
        isDept = true;
        break;
      }
    }
    
    if (!target) {
      for (const c of COUNTRIES) {
        if (q.includes(c) || (c === 'usa' && q.includes('us')) || (c === 'uk' && q.includes('united kingdom'))) {
          target = c;
          isCountry = true;
          break;
        }
      }
    }

    if (isDept && target) {
      const row = await db.get(
        `SELECT AVG(${USD_CONVERSION_SQL}) as avg_usd, COUNT(*) as count FROM employees WHERE LOWER(department) = ?`,
        [target]
      );
      const avgUsd = row?.avg_usd || 0;
      const deptName = target.charAt(0).toUpperCase() + target.slice(1);
      result.answer = `The average annual salary in the **${deptName}** department is **$${Math.round(avgUsd).toLocaleString()} USD** (computed across ${row?.count} employees).`;
      result.data = { avgUsd, count: row?.count, filter: deptName, type: 'department' };
      result.visualizationType = 'scalar';
    } else if (isCountry && target) {
      const row = await db.get(
        `SELECT AVG(salary) as avg_local, currency, AVG(${USD_CONVERSION_SQL}) as avg_usd, COUNT(*) as count FROM employees WHERE LOWER(country) = ?`,
        [target]
      );
      const avgLocal = row?.avg_local || 0;
      const avgUsd = row?.avg_usd || 0;
      const currency = row?.currency || 'USD';
      const countryName = target.toUpperCase() === 'USA' || target.toUpperCase() === 'UK' ? target.toUpperCase() : target.charAt(0).toUpperCase() + target.slice(1);
      result.answer = `The average annual salary in **${countryName}** is **${Math.round(avgLocal).toLocaleString()} ${currency}** ($${Math.round(avgUsd).toLocaleString()} USD) across ${row?.count} employees.`;
      result.data = { avgLocal, avgUsd, currency, count: row?.count, filter: countryName, type: 'country' };
      result.visualizationType = 'scalar';
    } else {
      const row = await db.get(`SELECT AVG(${USD_CONVERSION_SQL}) as avg_usd, COUNT(*) as count FROM employees`);
      const avgUsd = row?.avg_usd || 0;
      result.answer = `The average annual salary overall at ACME Org is **$${Math.round(avgUsd).toLocaleString()} USD** across all ${row?.count.toLocaleString()} employees.`;
      result.data = { avgUsd, count: row?.count };
      result.visualizationType = 'scalar';
    }
    return result;
  }

  // 3. HIGHEST PAID
  if (q.includes('highest paid') || q.includes('top paid') || q.includes('who makes the most') || q.includes('highest salary')) {
    result.matched = true;
    result.intent = 'highest_paid';

    let target: string | null = null;
    let isDept = false;
    let isCountry = false;

    for (const d of DEPARTMENTS) {
      if (q.includes(d)) {
        target = d;
        isDept = true;
        break;
      }
    }
    
    if (!target) {
      for (const c of COUNTRIES) {
        if (q.includes(c) || (c === 'usa' && q.includes('us')) || (c === 'uk' && q.includes('united kingdom'))) {
          target = c;
          isCountry = true;
          break;
        }
      }
    }

    let querySql = `
      SELECT employee_id, first_name, last_name, job_title, department, country, salary, currency, ${USD_CONVERSION_SQL} as salary_usd
      FROM employees
    `;
    const params: any[] = [];

    if (isDept && target) {
      querySql += ` WHERE LOWER(department) = ?`;
      params.push(target);
    } else if (isCountry && target) {
      querySql += ` WHERE LOWER(country) = ?`;
      params.push(target);
    }

    querySql += ` ORDER BY salary_usd DESC LIMIT 5`;

    const rows = await db.all(querySql, params);
    
    if (rows.length === 0) {
      result.answer = "No employees found matching that cohort.";
      result.visualizationType = 'none';
      return result;
    }

    const highest = rows[0];
    const targetText = isDept ? `in the ${target!.charAt(0).toUpperCase() + target!.slice(1)} department` : isCountry ? `in ${target!.toUpperCase()}` : 'overall';
    
    result.answer = `The highest paid employee ${targetText} is **${highest.first_name} ${highest.last_name}** (${highest.job_title}), earning **${highest.salary.toLocaleString()} ${highest.currency}** ($${Math.round(highest.salary_usd).toLocaleString()} USD) annually. Here are the top 5 earners:`;
    result.data = rows;
    result.visualizationType = 'table';
    return result;
  }

  // 4. HEADCOUNT
  if (q.includes('how many') || q.includes('headcount') || q.includes('count') || q.includes('number of employees')) {
    result.matched = true;
    result.intent = 'headcount';

    let target: string | null = null;
    let isDept = false;
    let isCountry = false;

    for (const d of DEPARTMENTS) {
      if (q.includes(d)) {
        target = d;
        isDept = true;
        break;
      }
    }
    
    if (!target) {
      for (const c of COUNTRIES) {
        if (q.includes(c) || (c === 'usa' && q.includes('us')) || (c === 'uk' && q.includes('united kingdom'))) {
          target = c;
          isCountry = true;
          break;
        }
      }
    }

    if (isDept && target) {
      const row = await db.get(`SELECT COUNT(*) as count FROM employees WHERE LOWER(department) = ?`, [target]);
      const count = row?.count || 0;
      const deptName = target.charAt(0).toUpperCase() + target.slice(1);
      result.answer = `There are **${count}** employees working in the **${deptName}** department.`;
      result.data = { count, filter: deptName, type: 'department' };
      result.visualizationType = 'scalar';
    } else if (isCountry && target) {
      const row = await db.get(`SELECT COUNT(*) as count FROM employees WHERE LOWER(country) = ?`, [target]);
      const count = row?.count || 0;
      const countryName = target.toUpperCase() === 'USA' || target.toUpperCase() === 'UK' ? target.toUpperCase() : target.charAt(0).toUpperCase() + target.slice(1);
      result.answer = `There are **${count}** employees located in **${countryName}**.`;
      result.data = { count, filter: countryName, type: 'country' };
      result.visualizationType = 'scalar';
    } else {
      const row = await db.get(`SELECT COUNT(*) as count FROM employees`);
      const count = row?.count || 0;
      result.answer = `ACME Org has a total headcount of **${count.toLocaleString()}** employees globally.`;
      result.data = { count };
      result.visualizationType = 'scalar';
    }
    return result;
  }

  // 5. GENDER PAY GAP
  if (q.includes('pay gap') || q.includes('equity') || q.includes('gender pay') || q.includes('equal pay')) {
    result.matched = true;
    result.intent = 'gender_pay_gap';

    const rows = await db.all(`
      SELECT gender, AVG(${USD_CONVERSION_SQL}) as avg_usd, COUNT(*) as count
      FROM employees
      WHERE gender IN ('Male', 'Female')
      GROUP BY gender
    `);

    const femaleRow = rows.find(r => r.gender === 'Female');
    const maleRow = rows.find(r => r.gender === 'Male');

    if (!femaleRow || !maleRow) {
      result.answer = "Not enough gender demographic data found to calculate pay gap.";
      result.visualizationType = 'none';
      return result;
    }

    const femaleAvg = femaleRow.avg_usd;
    const maleAvg = maleRow.avg_usd;
    
    const gapPercent = ((maleAvg - femaleAvg) / maleAvg) * 100;
    const ratio = femaleAvg / maleAvg;

    result.answer = `Globally, Female employees earn **$${Math.round(femaleAvg).toLocaleString()} USD** on average, compared to Male employees earning **$${Math.round(maleAvg).toLocaleString()} USD**. 
    This represents a gender pay gap of **${gapPercent.toFixed(1)}%** (Females earn **$${ratio.toFixed(2)}** for every $1.00 Male employees earn).`;
    result.data = {
      femaleAvg,
      femaleCount: femaleRow.count,
      maleAvg,
      maleCount: maleRow.count,
      gapPercent,
      ratio
    };
    result.visualizationType = 'scalar';
    return result;
  }

  return result;
}
