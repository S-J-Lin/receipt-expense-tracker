import Link from "next/link";
import { notFound } from "next/navigation";
import { updateRecurringAction } from "@/app/recurring/actions";
import { RecurringExpenseForm } from "@/components/recurring-expense-form";
import { getRecurringExpense } from "@/lib/recurring-expense-data";

export default async function EditRecurringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const result = await getRecurringExpense(id); if (!result.data) notFound();
  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-3xl space-y-6"><div><Link className="text-sm font-semibold text-indigo-600" href={`/recurring/${id}`}>← 返回固定支出</Link><h1 className="mt-3 text-3xl font-bold">編輯固定支出</h1></div><section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><RecurringExpenseForm action={updateRecurringAction.bind(null, id)} initial={result.data} /></section></div></main>;
}

