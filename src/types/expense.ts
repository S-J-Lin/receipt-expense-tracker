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

export const EXPENSE_SOURCES = ["manual", "chatgpt_import", "receipt_upload"] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];

export type ExpenseItem = {
  id: string;
  expense_id: string;
  name_original: string | null;
  name_normalized: string | null;
  english_name?: string | null;
  quantity: number;
  amount: number;
  category: ExpenseCategory;
  confidence: number | null;
  brand: string;
  product_group?: string | null;
  unit?: string | null;
  unit_quantity?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductAlias = {
  id: string;
  alias: string;
  alias_normalized: string;
  normalized_name: string;
  product_group: string | null;
  category: ExpenseCategory | null;
  brand: string;
  created_at: string;
  updated_at: string;
};

export type ExpenseAdjustment = {
  id: string;
  expense_id: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  created_at: string;
  updated_at: string;
};

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
  receipt_image_path: string | null;
  raw_receipt_text: string | null;
  ai_confidence: number | null;
  notes: string | null;
  source: ExpenseSource;
  import_warnings: string[];
  import_idempotency_key: string | null;
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
  receipt_image_path?: string | null;
  raw_receipt_text?: string | null;
  ai_confidence?: number | null;
  notes?: string | null;
  source?: ExpenseSource;
  import_warnings?: string[];
  import_idempotency_key?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExpenseUpdate = Partial<ExpenseInsert>;

export type ExpenseWithDetails = Expense & {
  expense_items: ExpenseItem[];
  expense_adjustments: ExpenseAdjustment[];
};
