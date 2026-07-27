import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/types/expense";

export const recurringExpenseSchema = z.object({
  merchant: z.string().trim().min(1, "請輸入店家／收款方。").max(200),
  amount: z.coerce.number().finite().positive("金額必須大於 0。"),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "幣別必須是三碼代碼。").transform((value) => value.toUpperCase()),
  category: z.enum(EXPENSE_CATEGORIES),
  payment_method: z.string().trim().max(100).optional().transform((value) => value || null),
  notes: z.string().trim().max(1000).optional().transform((value) => value || null),
  day_of_month: z.coerce.number().int().min(1).max(31),
  start_date: z.iso.date(),
  end_date: z.union([z.iso.date(), z.literal("")]).optional().transform((value) => value || null),
  is_active: z.preprocess((value) => value === "on" || value === true, z.boolean()),
}).refine((value) => !value.end_date || value.end_date >= value.start_date, {
  message: "結束日期不得早於開始日期。", path: ["end_date"],
});

export type RecurringExpenseFormValue = z.output<typeof recurringExpenseSchema>;

export function berlinDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function scheduledDate(year: number, month: number, dayOfMonth: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(dayOfMonth, lastDay)).padStart(2, "0")}`;
}

export function nextMonthlyRun(dayOfMonth: number, startDate: string, fromDate: string): string {
  const minimum = startDate > fromDate ? startDate : fromDate;
  let [year, month] = minimum.slice(0, 7).split("-").map(Number);
  let candidate = scheduledDate(year, month, dayOfMonth);
  if (candidate < minimum) {
    month += 1;
    if (month === 13) { year += 1; month = 1; }
    candidate = scheduledDate(year, month, dayOfMonth);
  }
  return candidate;
}

export function formDataToRecurring(formData: FormData) {
  return recurringExpenseSchema.safeParse(Object.fromEntries(formData));
}

