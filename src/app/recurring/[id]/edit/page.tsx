import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateRecurringAction } from "@/app/recurring/actions";
import { RecurringExpenseForm } from "@/components/recurring-expense-form";
import { getRecurringExpense } from "@/lib/recurring-expense-data";
import { localIsoDate } from "@/lib/local-date";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "編輯固定支出" };

export default async function EditRecurringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const result = await getRecurringExpense(id); if (!result.data) notFound();
  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-3xl space-y-5"><div><Link className="ui-link text-sm" href={`/recurring/${id}`}>← 返回固定支出</Link><h1 className="text-2xl font-bold sm:text-3xl">編輯固定支出</h1></div><section className="ui-card"><RecurringExpenseForm action={updateRecurringAction.bind(null, id)} initial={result.data} today={localIsoDate()} /></section></div></main>;
}
