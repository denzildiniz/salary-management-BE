export interface Employee {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  department: string;
  salary: number;
  currency: string;
  country: string;
  date_of_joining: string;
  performance_rating: number;
  gender: string;
  previous_salary: number | null;
}

export interface EmployeeWithUsd extends Employee {
  salary_usd: number;
}

export interface PaginatedResult {
  employees: EmployeeWithUsd[];
  pagination: {
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface EmployeeFilters {
  search: string;
  department: string;
  country: string;
  minSalary: number;
  maxSalary: number;
}

export interface CreateEmployeeInput {
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  department: string;
  salary: number;
  currency: string;
  country: string;
  date_of_joining: string;
  performance_rating: number;
  gender: string;
}

export interface BulkRaiseParams {
  department?: string;
  country?: string;
  raiseType: 'percentage' | 'flat';
  value: number;
  isPreview: boolean;
}

export interface BulkRaiseResult {
  isPreview: boolean;
  affectedCount: number;
  originalTotalSpendUsd: number;
  newTotalSpendUsd: number;
  differenceUsd: number;
  message?: string;
}

export interface ImportResult {
  insertedOrUpdated: number;
  errors: string[];
}
