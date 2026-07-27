import type { ExpenseCategory } from "@/types/expense";

export type RecurringExpense = {
  id: string;
  merchant: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  payment_method: string | null;
  notes: string | null;
  recurrence_type: "monthly";
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  cancelled_at: string | null;
  last_generated_for: string | null;
  next_run_date: string;
  source: "recurring";
  timezone: "Europe/Berlin";
  created_at: string;
  updated_at: string;
};

export type RecurringExpenseInsert = Omit<RecurringExpense, "id" | "cancelled_at" | "last_generated_for" | "next_run_date" | "source" | "timezone" | "created_at" | "updated_at"> & {
  id?: string;
  cancelled_at?: string | null;
  last_generated_for?: string | null;
  next_run_date?: string;
  source?: "recurring";
  timezone?: "Europe/Berlin";
  created_at?: string;
  updated_at?: string;
};

