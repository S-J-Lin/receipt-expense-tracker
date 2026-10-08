import type { Metadata } from "next";
import Link from "next/link";
import { createRecurringAction } from "@/app/recurring/actions";
import { RecurringExpenseForm } from "@/components/recurring-expense-form";
import { localIsoDate } from "@/lib/local-date";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "新增固定支出" };

export default function NewRecurringPage() {
  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-3xl space-y-5"><div><Link className="ui-link text-sm" href="/recurring">← 固定支出</Link><h1 className="text-2xl font-bold sm:text-3xl">新增固定支出</h1></div><section className="ui-card"><RecurringExpenseForm action={createRecurringAction} today={localIsoDate()} /></section></div></main>;
}
