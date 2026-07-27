import Link from "next/link";
import { createRecurringAction } from "@/app/recurring/actions";
import { RecurringExpenseForm } from "@/components/recurring-expense-form";

export default function NewRecurringPage() {
  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-3xl space-y-6"><div><Link className="text-sm font-semibold text-indigo-600" href="/recurring">← 固定支出</Link><h1 className="mt-3 text-3xl font-bold">新增固定支出</h1></div><section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><RecurringExpenseForm action={createRecurringAction} /></section></div></main>;
}

