import { getDb, initDb } from '../db';

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  choose<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

const FIRST_NAMES_MALE = [
  'John', 'Michael', 'David', 'James', 'Robert', 'William', 'Joseph', 'Christopher', 'Matthew', 'Daniel',
  'Aarav', 'Vihaan', 'Haruto', 'Hans', 'Lukas', 'Oliver', 'Liam', 'Thomas', 'Richard', 'Charles',
  'Andrew', 'Kevin', 'Steven', 'Paul', 'Kenneth', 'Mark', 'Brian', 'Edward', 'Ronald', 'Timothy',
  'Ryan', 'Jeffrey', 'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott',
  'Brandon', 'Benjamin', 'Samuel', 'Gregory', 'Alexander', 'Frank', 'Raymond', 'Patrick', 'Jack', 'Dennis'
];

const FIRST_NAMES_FEMALE = [
  'Jane', 'Emily', 'Sarah', 'Jessica', 'Ashley', 'Amanda', 'Melissa', 'Stephanie', 'Nicole', 'Elizabeth',
  'Ananya', 'Diya', 'Sakura', 'Mei', 'Emma', 'Sofia', 'Charlotte', 'Amelia', 'Patricia', 'Jennifer',
  'Linda', 'Barbara', 'Susan', 'Margaret', 'Dorothy', 'Lisa', 'Nancy', 'Karen', 'Betty', 'Sandra',
  'Donna', 'Carol', 'Ruth', 'Sharon', 'Michelle', 'Laura', 'Sarah', 'Kimberly', 'Deborah', 'Jessica',
  'Shirley', 'Cynthia', 'Angela', 'Melissa', 'Brenda', 'Amy', 'Anna', 'Rebecca', 'Virginia', 'Kathleen'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Sharma', 'Patel', 'Kumar', 'Sato', 'Suzuki', 'Takahashi', 'Müller', 'Schmidt', 'Schneider', 'Davies',
  'Evans', 'Lee', 'Wong', 'Kim', 'Park', 'Singh', 'Gupta', 'Mehta', 'Nakamura', 'Watanabe',
  'Jones', 'Taylor', 'Green', 'Hall', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts'
];

const DEPARTMENTS = [
  'Engineering', 'Product', 'Marketing', 'Sales',
  'HR', 'Finance', 'Legal', 'Operations'
];

const JOB_TITLES: { [dept: string]: string[] } = {
  Engineering: [
    'Software Engineer', 'Software Engineer', 'Senior Software Engineer', 
    'QA Engineer', 'DevOps Engineer', 'Tech Lead', 'Engineering Manager', 'Principal Engineer'
  ],
  Product: [
    'Product Designer', 'Product Designer', 'Product Manager', 
    'Senior Product Manager', 'Lead Designer', 'Director of Product'
  ],
  Marketing: [
    'Marketing Specialist', 'Marketing Specialist', 'Content Writer', 
    'SEO Analyst', 'Marketing Manager', 'Director of Marketing'
  ],
  Sales: [
    'Sales Representative', 'Sales Representative', 'Account Executive', 
    'Sales Manager', 'Customer Success Manager', 'Director of Sales'
  ],
  HR: [
    'HR Specialist', 'Recruiter', 'HR Manager', 'Director of HR'
  ],
  Finance: [
    'Accountant', 'Financial Analyst', 'Finance Manager', 'CFO'
  ],
  Legal: [
    'Legal Counsel', 'Compliance Officer', 'General Counsel'
  ],
  Operations: [
    'Operations Coordinator', 'Operations Coordinator', 'Operations Manager', 'COO'
  ]
};

interface CountryConfig {
  country: string;
  currency: string;
  minBaseSalary: number;
  maxBaseSalary: number;
}

const COUNTRY_CONFIGS: { [country: string]: CountryConfig } = {
  USA: { country: 'USA', currency: 'USD', minBaseSalary: 45000, maxBaseSalary: 180000 },
  UK: { country: 'UK', currency: 'GBP', minBaseSalary: 35000, maxBaseSalary: 130000 },
  Germany: { country: 'Germany', currency: 'EUR', minBaseSalary: 40000, maxBaseSalary: 120000 },
  Canada: { country: 'Canada', currency: 'CAD', minBaseSalary: 50000, maxBaseSalary: 140000 },
  India: { country: 'India', currency: 'INR', minBaseSalary: 400000, maxBaseSalary: 3000000 },
  Japan: { country: 'Japan', currency: 'JPY', minBaseSalary: 3500000, maxBaseSalary: 13000000 },
};

const COUNTRIES = Object.keys(COUNTRY_CONFIGS);

function getRoleMultiplier(title: string): number {
  if (title.includes('Director') || title.includes('CFO') || title.includes('COO') || title.includes('General Counsel')) return 2.2;
  if (title.includes('Manager') || title.includes('Principal') || title.includes('Lead')) return 1.6;
  if (title.includes('Senior') || title.includes('Executive')) return 1.25;
  return 0.9;
}

export async function runSeed() {
  console.log('Starting data seeding...');
  await initDb();
  const db = await getDb();

  await db.run('DELETE FROM employees;');
  console.log('Cleared existing employee data.');

  const rand = new SeededRandom(42);
  const TOTAL_RECORDS = 10000;
  console.log(`Generating ${TOTAL_RECORDS} records...`);

  await db.run('BEGIN TRANSACTION;');

  const insertStmt = await db.prepare(`
    INSERT INTO employees (
      employee_id, first_name, last_name, email, job_title, department,
      salary, currency, country, date_of_joining, performance_rating, gender, previous_salary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    for (let i = 1; i <= TOTAL_RECORDS; i++) {
      const employeeId = `EMP-${String(i).padStart(5, '0')}`;
      
      const genderRoll = rand.next();
      let gender = 'Non-binary';
      let firstName = '';
      if (genderRoll < 0.48) {
        gender = 'Male';
        firstName = rand.choose(FIRST_NAMES_MALE);
      } else if (genderRoll < 0.96) {
        gender = 'Female';
        firstName = rand.choose(FIRST_NAMES_FEMALE);
      } else {
        firstName = rand.next() > 0.5 ? rand.choose(FIRST_NAMES_MALE) : rand.choose(FIRST_NAMES_FEMALE);
      }

      const lastName = rand.choose(LAST_NAMES);
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@acme.com`;
      
      const department = rand.choose(DEPARTMENTS);
      const jobTitle = rand.choose(JOB_TITLES[department]);

      const country = rand.choose(COUNTRIES);
      const countryConfig = COUNTRY_CONFIGS[country];
      const currency = countryConfig.currency;

      const roleMult = getRoleMultiplier(jobTitle);
      const minSal = countryConfig.minBaseSalary * roleMult;
      const maxSal = countryConfig.maxBaseSalary * roleMult;
      
      const randFactor = (rand.next() + rand.next()) / 2;
      let salary = Math.round(minSal + randFactor * (maxSal - minSal));
      
      if (salary > 100000) {
        salary = Math.round(salary / 1000) * 1000;
      } else {
        salary = Math.round(salary / 100) * 100;
      }

      const ratingRoll = rand.next();
      let performanceRating = 3;
      if (ratingRoll < 0.05) performanceRating = 1;
      else if (ratingRoll < 0.25) performanceRating = 2;
      else if (ratingRoll < 0.75) performanceRating = 3;
      else if (ratingRoll < 0.95) performanceRating = 4;
      else performanceRating = 5;

      const startYear = 2015;
      const year = rand.nextInt(startYear, 2025);
      const month = String(rand.nextInt(1, 12)).padStart(2, '0');
      const day = String(rand.nextInt(1, 28)).padStart(2, '0');
      const dateOfJoining = `${year}-${month}-${day}`;

      let previousSalary: number | null = null;
      if (rand.next() < 0.25) {
        const raisePercent = rand.nextInt(5, 15);
        previousSalary = Math.round(salary / (1 + raisePercent / 100));
        previousSalary = previousSalary > 100000 
          ? Math.round(previousSalary / 1000) * 1000 
          : Math.round(previousSalary / 100) * 100;
      }

      await insertStmt.run(
        employeeId,
        firstName,
        lastName,
        email,
        jobTitle,
        department,
        salary,
        currency,
        country,
        dateOfJoining,
        performanceRating,
        gender,
        previousSalary
      );
    }

    await insertStmt.finalize();
    await db.run('COMMIT;');
    console.log(`Successfully seeded ${TOTAL_RECORDS} employee records.`);
  } catch (error) {
    await db.run('ROLLBACK;');
    console.error('Failed to seed database. Transaction rolled back:', error);
    throw error;
  }
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error('Fatal error during seed execution:', err);
    process.exit(1);
  });
}
