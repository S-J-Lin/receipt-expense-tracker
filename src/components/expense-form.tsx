"use client";

import { useActionState } from "react";
import type { ExpenseActionState } from "@/app/actions";
import { ReceiptAttachmentField } from "@/components/receipt-attachment-field";
import { EXPENSE_CATEGORIES, type Expense } from "@/types/expense";

type Props = {
  action: (state: ExpenseActionState, formData: FormData) => Promise<ExpenseActionState>;
  expense?: Expense;
  today: string;
  submitLabel: string;
  receiptKind?: "image" | "pdf" | "heic";
  receiptPath?: string | null;
  receiptUrl?: string | null;
};

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? <p className="mt-1 text-sm text-red-600">{errors[0]}</p> : null;
}

const fieldClass = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-950 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export function ExpenseForm({ action, expense, receiptKind, receiptPath, receiptUrl, today, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, { message: "" });
  const values = state.values;
  return (
    <form action={formAction} className="space-y-5">
      {state.message && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{state.message}</p>}
      <label className="block font-medium text-slate-800">店家名稱 <span className="text-red-600">*</span>
        <input className={fieldClass} defaultValue={values?.merchant ?? expense?.merchant ?? ""} name="merchant" required />
        <FieldError errors={state.errors?.merchant} />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block font-medium text-slate-800">日期 <span className="text-red-600">*</span>
          <input className={fieldClass} defaultValue={values?.expense_date ?? expense?.expense_date ?? today} name="expense_date" required type="date" />
          <FieldError errors={state.errors?.expense_date} />
        </label>
        <label className="block font-medium text-slate-800">金額 <span className="text-red-600">*</span>
          <input className={fieldClass} defaultValue={values?.amount ?? (expense ? expense.amount.toFixed(2) : "")} inputMode="decimal" min="0.01" name="amount" placeholder="23.47" required step="0.01" type="number" />
          <FieldError errors={state.errors?.amount} />
        </label>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block font-medium text-slate-800">幣別 <span className="text-red-600">*</span>
          <input className={fieldClass} defaultValue={values?.currency ?? expense?.currency ?? "EUR"} maxLength={3} name="currency" required />
          <FieldError errors={state.errors?.currency} />
        </label>
        <label className="block font-medium text-slate-800">類別 <span className="text-red-600">*</span>
          <select className={fieldClass} defaultValue={values?.category ?? expense?.category ?? "其他"} name="category" required>
            {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <FieldError errors={state.errors?.category} />
        </label>
      </div>
      <label className="block font-medium text-slate-800">付款方式
        <input className={fieldClass} defaultValue={values?.payment_method ?? expense?.payment_method ?? ""} name="payment_method" placeholder="例如 Wise、Visa、現金" />
        <FieldError errors={state.errors?.payment_method} />
      </label>
      <label className="block font-medium text-slate-800">備註
        <textarea className={`${fieldClass} min-h-28 resize-y`} defaultValue={values?.notes ?? expense?.notes ?? ""} maxLength={1000} name="notes" />
        <FieldError errors={state.errors?.notes} />
      </label>
      <ReceiptAttachmentField currentKind={receiptKind} currentPath={receiptPath ?? expense?.receipt_image_path} currentUrl={receiptUrl} expenseId={expense?.id} />
      <button className="min-h-12 w-full rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300" disabled={pending} type="submit">
        {pending ? "儲存中…" : submitLabel}
      </button>
    </form>
  );
}
