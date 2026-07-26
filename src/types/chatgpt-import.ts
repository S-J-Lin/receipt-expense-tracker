import type { ExpenseCategory } from "@/types/expense";

export type ChatGPTImportItem = {
  name_original: string;
  name_normalized?: string;
  quantity: number;
  amount: number;
  category: ExpenseCategory;
  confidence?: number;
};

export type ChatGPTImportAdjustment = {
  name: string;
  amount: number;
  category: ExpenseCategory;
};

export type ChatGPTImport = {
  merchant: string;
  expense_date: string;
  currency: string;
  total_amount: number;
  category?: ExpenseCategory;
  payment_method?: string;
  items: ChatGPTImportItem[];
  adjustments: ChatGPTImportAdjustment[];
  warnings: string[];
};
