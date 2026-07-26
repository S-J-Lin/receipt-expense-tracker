import type { ExpenseCategory } from "@/types/expense";

export type ChatGPTImportItem = {
  name_original: string;
  name_normalized?: string;
  english_name?: string;
  quantity: number;
  amount: number;
  category: ExpenseCategory;
  confidence?: number;
  brand: string;
  product_group?: string;
  unit?: string;
  unit_quantity?: number;
  notes?: string;
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
