import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/types/expense";

const category = z.enum(EXPENSE_CATEGORIES);

export const manualItemInputSchema = z.strictObject({
  name_original: z.string().trim().optional(),
  name_normalized: z.string().trim().optional(),
  english_name: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  product_group: z.string().trim().optional(),
  category: category.optional(),
  quantity: z.number().finite().positive().optional(),
  amount: z.number().finite().nonnegative(),
  confidence: z.number().finite().min(0).max(1).optional(),
  notes: z.string().trim().max(1000).optional(),
  unit: z.string().trim().optional(),
  unit_quantity: z.number().finite().positive().optional(),
});

export const manualAdjustmentInputSchema = z.strictObject({
  name: z.string().trim().min(1, "請輸入 adjustment 名稱。"),
  amount: z.number().finite(),
  category: category.optional(),
});

export const manualExpenseSchema = z.strictObject({
  merchant: z.string().trim().min(1, "請輸入店家名稱。").max(200),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須是 YYYY-MM-DD。"),
  total_amount: z.number().finite().positive("總金額必須大於 0。"),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "幣別必須是三個英文字母。").transform((value) => value.toUpperCase()),
  category,
  payment_method: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(manualItemInputSchema).default([]),
  adjustments: z.array(manualAdjustmentInputSchema).default([]),
}).transform((data) => ({
  ...data,
  items: data.items.map((item) => ({
    name_original: item.name_original || "N/A",
    name_normalized: item.name_normalized || "N/A",
    english_name: item.english_name || "N/A",
    brand: item.brand || "N/A",
    product_group: item.product_group || "其他",
    category: item.category || data.category || "其他",
    quantity: item.quantity ?? 1,
    amount: item.amount,
    confidence: item.confidence ?? 1,
    notes: item.notes || "",
    unit: item.unit || "N/A",
    unit_quantity: item.unit_quantity ?? 1,
  })),
  adjustments: data.adjustments.map((adjustment) => ({ ...adjustment, category: adjustment.category || data.category || "其他" })),
}));

export type ManualExpensePayload = z.input<typeof manualExpenseSchema>;
export type NormalizedManualExpense = z.output<typeof manualExpenseSchema>;

export function itemizedDifferenceCents(data: Pick<NormalizedManualExpense, "total_amount" | "items" | "adjustments">): number {
  const allocated = [...data.items, ...data.adjustments].reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  return Math.round(data.total_amount * 100) - allocated;
}
