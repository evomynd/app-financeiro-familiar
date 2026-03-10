export type CategoryType = "income" | "expense";

export type TransactionType = "income" | "expense";

export type TransactionStatus = "posted" | "scheduled" | "pending" | "cancelled";

export type PaymentMethod = "cash" | "debit" | "credit_card" | "pix" | "bank_transfer";

export interface User {
  id: string;
  name: string;
  email: string;
  overdraft_rate: number;
}

export interface CreditCard {
  id: string;
  user_id: string;
  name: string;
  closing_day: number;
  due_day: number;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: CategoryType;
  is_variable: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  date: string;
  category_id: string;
  type: TransactionType;
  status: TransactionStatus;
  payment_method: PaymentMethod;
  credit_card_id: string | null;
  is_recurring: boolean;
  installment_current: number;
  installment_total: number;
  projection_of?: string | null;
  import_batch_id?: string;
  income_forecast_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface IncomeForecast {
  id: string;
  user_id: string;
  name: string;
  month: string; // formato yyyy-MM
  amount: number;
  created_at?: string;
  updated_at?: string;
}

export interface CategoryBudget {
  id: string;
  user_id: string;
  period: string; // formato yyyy-MM
  year: number;
  month: number; // 1-12
  category_id: string;
  type: TransactionType;
  budgeted_amount: number;
  created_at?: string;
  updated_at?: string;
}

export interface CsvTransactionRow {
  date: string;
  value: string;
  category: string;
  description: string;
}

export interface BulkImportResult {
  importedCount: number;
  projectedCount: number;
  categoriesCreated: number;
  batchId: string;
}
