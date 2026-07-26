import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/types/expense";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須是 YYYY-MM-DD").refine(
  (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  "日期無效",
);

const amountSchema = z.string().trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/, "請輸入有效金額，最多兩位小數")
  .refine((value) => Number(value.replace(",", ".")) > 0, "金額必須大於 0");

export const expenseFormSchema = z.object({
  merchant: z.string().trim().min(1, "請輸入店家名稱").max(200, "店家名稱過長"),
  expense_date: dateSchema,
  amount: amountSchema,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "幣別必須是三個英文字母"),
  category: z.enum(EXPENSE_CATEGORIES, { message: "請選擇有效類別" }),
  payment_method: z.string().trim().max(100, "付款方式過長"),
  notes: z.string().trim().max(1000, "備註不可超過 1000 字"),
});

export function formDataToExpenseValues(formData: FormData) {
  return {
    merchant: String(formData.get("merchant") ?? ""),
    expense_date: String(formData.get("expense_date") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    category: String(formData.get("category") ?? ""),
    payment_method: String(formData.get("payment_method") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}
