import { moneyToCents } from "@/lib/money";
import type { ExpenseWithDetails } from "@/types/expense";

// The create RPCs return the existing expense when an idempotency key is
// reused. That is correct for a network retry of the same submission, but a
// reused key with *different* content must not look like a successful save.
// After every create we compare the stored record with what was submitted.

export type ExpenseFingerprint = { merchant: string; expense_date: string; currency: string; amountCents: number; items: number[]; adjustments: number[] };

type PayloadLike = { merchant: string; expense_date: string; currency: string; total_amount: number; items: Array<{ amount: number }>; adjustments: Array<{ amount: number }> };

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);

// Submitted numbers are rounded the way numeric(12,2) stores them.
const cents = (value: number) => Math.round(value * 100);

export function fingerprintFromPayload(payload: PayloadLike): ExpenseFingerprint {
  return {
    merchant: payload.merchant.trim(), expense_date: payload.expense_date, currency: payload.currency.trim().toUpperCase(),
    amountCents: cents(payload.total_amount),
    items: sorted(payload.items.map((item) => cents(item.amount))), adjustments: sorted(payload.adjustments.map((item) => cents(item.amount))),
  };
}

export function fingerprintFromStored(expense: ExpenseWithDetails): ExpenseFingerprint {
  return {
    merchant: expense.merchant.trim(), expense_date: expense.expense_date, currency: expense.currency.toUpperCase(),
    amountCents: moneyToCents(expense.amount),
    items: sorted(expense.expense_items.map((item) => moneyToCents(item.amount))), adjustments: sorted(expense.expense_adjustments.map((item) => moneyToCents(item.amount))),
  };
}

export function sameFingerprint(a: ExpenseFingerprint, b: ExpenseFingerprint): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const IDEMPOTENCY_CONFLICT_MESSAGE = "這次送出的內容與先前以同一個儲存識別碼建立的紀錄不同（可能是重複送出後又修改了內容）。原紀錄已保留、沒有被覆寫，也沒有建立第二筆。請開啟該筆紀錄確認，或重新整理頁面後再新增。";
