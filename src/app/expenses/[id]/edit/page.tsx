import Link from "next/link";
import { notFound } from "next/navigation";
import { updateExpenseAction } from "@/app/actions";
import { ExpenseForm } from "@/components/expense-form";
import { getExpense } from "@/lib/expenses";

export const dynamic = "force-dynamic";

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getExpense(id);
  if (!result.data && result.error === "找不到這筆消費紀錄。") notFound();
  if (!result.data) return <main className="p-6"><p className="mx-auto max-w-2xl rounded-2xl bg-red-50 p-4 text-red-800" role="alert">{result.error}</p></main>;
  const updateAction = updateExpenseAction.bind(null, result.data.id);
  return (
    <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-2xl">
      <Link className="text-sm font-semibold text-indigo-600" href={`/expenses/${result.data.id}`}>← 返回詳細資料</Link>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"><h1 className="text-2xl font-bold text-slate-950">編輯消費</h1><p className="mt-2 text-slate-600">修改後 Dashboard 統計會同步更新。</p><div className="mt-6"><ExpenseForm action={updateAction} expense={result.data} submitLabel="儲存修改" today={result.data.expense_date} /></div></section>
    </div></main>
  );
}
