import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/types/expense";

const categorySchema = z.enum(EXPENSE_CATEGORIES);

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const chatGPTImportItemSchema = z.strictObject({
  name_original: z.string().trim().min(1, "商品原始名稱不可空白。"),
  name_normalized: z.string().trim().min(1, "商品標準名稱不可空白。").optional(),
  english_name: z.string().trim().min(1, "英文商品名稱不可空白。").optional(),
  quantity: z.number().finite().positive("商品數量必須大於 0。"),
  amount: z.number().finite().nonnegative("商品金額不可為負數。"),
  category: categorySchema,
  confidence: z.number().finite().min(0).max(1).optional(),
  brand: z.string({ error: "brand 必須是字串，不可為 null；未知品牌請使用 N/A。" }).trim().min(1, "brand 不可空白；未知品牌請使用 N/A。").default("N/A"),
  product_group: z.string().trim().min(1, "product_group 不可空白；無法判定時請使用「其他」。").default("其他"),
  unit: z.string().trim().min(1).optional(),
  unit_quantity: z.number().finite().positive().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const chatGPTImportAdjustmentSchema = z.strictObject({
  name: z.string().trim().min(1, "調整項目名稱不可空白。"),
  amount: z.number().finite(),
  category: categorySchema.default("其他"),
});

export const chatGPTImportSchema = z.strictObject({
  merchant: z.string().trim().min(1, "店家不可空白。"),
  expense_date: z.string().refine(isRealIsoDate, "日期必須是有效的 YYYY-MM-DD。"),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "幣別必須是三碼字母。").transform((value) => value.toUpperCase()),
  total_amount: z.number().finite().positive("總金額必須大於 0。"),
  category: categorySchema.optional(),
  payment_method: z.string().trim().min(1, "付款方式不可空白。").optional(),
  items: z.array(chatGPTImportItemSchema).default([]),
  adjustments: z.array(chatGPTImportAdjustmentSchema).default([]),
  warnings: z.array(z.string().trim().min(1, "Warning 不可是空字串。")).default([]),
}).superRefine((value, context) => {
  if (value.items.length === 0 && value.adjustments.length === 0 && !value.category) {
    context.addIssue({ code: "custom", path: ["category"], message: "沒有商品明細的消費必須提供 category。" });
  }
});

export type ChatGPTImportInput = z.input<typeof chatGPTImportSchema>;
