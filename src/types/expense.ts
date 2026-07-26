export const EXPENSE_CATEGORIES = [
  "食品雜貨",
  "餐飲",
  "交通",
  "日用品",
  "家具家電",
  "醫療",
  "娛樂",
  "房租",
  "保險",
  "教育",
  "旅行",
  "其他",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type Expense = {
  id: string;
  user_id: string | null;
  merchant: string;
  expense_date: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  payment_method: string | null;
  receipt_image_url: string | null;
  raw_receipt_text: string | null;
  ai_confidence: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseInsert = Pick<
  Expense,
  "merchant" | "expense_date" | "amount" | "currency" | "category"
> & {
  id?: string;
  user_id?: string | null;
  payment_method?: string | null;
  receipt_image_url?: string | null;
  raw_receipt_text?: string | null;
  ai_confidence?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExpenseUpdate = Partial<ExpenseInsert>;
