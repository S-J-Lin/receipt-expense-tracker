import Link from "next/link";

export default function ExpenseNotFound() {
  return <main className="flex-1 px-4 py-16 text-center"><h1 className="text-2xl font-bold">找不到消費紀錄</h1><p className="mt-2 text-slate-600">這筆資料可能已被刪除。</p><Link className="mt-5 inline-flex rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white" href="/expenses">返回消費紀錄</Link></main>;
}
