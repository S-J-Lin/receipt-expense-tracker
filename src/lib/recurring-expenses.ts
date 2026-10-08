import { z } from "zod";
import { parseDecimalInput } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/types/expense";

export const recurringExpenseSchema = z.object({
  merchant: z.string().trim().min(1, "請輸入店家／收款方。").max(200),
  amount: z.preprocess((value) => parseDecimalInput(value as string) ?? Number.NaN, z.number({ error: "請輸入有效金額，例如 12.50 或 12,50。" }).finite().positive("金額必須大於 0。")),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "幣別必須是三碼代碼。").transform((value) => value.toUpperCase()),
  category: z.enum(EXPENSE_CATEGORIES),
  payment_method: z.string().trim().max(100).optional().transform((value) => value || null),
  notes: z.string().trim().max(1000).optional().transform((value) => value || null),
  day_of_month: z.coerce.number().int().min(1).max(31),
  start_date: z.iso.date(),
  end_date: z.union([z.iso.date(), z.literal("")]).optional().transform((value) => value || null),
  is_active: z.preprocess((value) => value === "on" || value === true, z.boolean()),
  /** Explicit opt-in to create months between start_date and today. Default: no backfill. */
  backfill: z.preprocess((value) => value === "on" || value === true, z.boolean()).optional().default(false),
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

/** Scheduled run dates from `startDate` (inclusive) up to `before` (exclusive), capped by end date. */
export function scheduledRunsBetween(dayOfMonth: number, startDate: string, before: string, endDate?: string | null, limit = 240): string[] {
  const runs: string[] = [];
  let run = nextMonthlyRun(dayOfMonth, startDate, startDate);
  while (run < before && (!endDate || run <= endDate) && runs.length < limit) {
    runs.push(run);
    const [year, month] = run.slice(0, 7).split("-").map(Number);
    run = month === 12 ? scheduledDate(year + 1, 1, dayOfMonth) : scheduledDate(year, month + 1, dayOfMonth);
  }
  return runs;
}

/**
 * First run date for a new rule. Without an explicit backfill opt-in the
 * schedule starts at the first run on/after today, so a start date in the past
 * never silently creates historical expenses.
 */
export function initialNextRunDate(dayOfMonth: number, startDate: string, today: string, backfill: boolean): string {
  return backfill ? nextMonthlyRun(dayOfMonth, startDate, startDate) : nextMonthlyRun(dayOfMonth, startDate, today);
}

/** Months that an opted-in backfill would create (dates before today). */
export function backfillPreview(dayOfMonth: number, startDate: string, today: string, endDate?: string | null): string[] {
  if (!startDate || startDate >= today) return [];
  return scheduledRunsBetween(dayOfMonth, startDate, today, endDate);
}

export function formDataToRecurring(formData: FormData) {
  return recurringExpenseSchema.safeParse(Object.fromEntries(formData));
}

