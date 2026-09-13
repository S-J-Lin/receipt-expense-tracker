"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ComparisonMode } from "@/lib/dashboard-analysis";

export function DashboardComparisonToggle({ mode, month }: { mode: ComparisonMode; month: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <section aria-label="比較模式" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
    <div className="grid grid-cols-2 gap-2" role="group">{(["aligned", "full"] as const).map((value) => <button aria-pressed={mode === value} className={`flex min-h-11 min-w-0 items-center justify-center rounded-xl px-3 text-center text-sm font-semibold disabled:opacity-70 ${mode === value ? "bg-indigo-600 text-slate-950" : "text-slate-500 hover:bg-slate-100"}`} disabled={pending} key={value} onClick={() => startTransition(() => router.push(`/?month=${month}&comparison=${value}`))} type="button">{value === "aligned" ? "同期比較" : "完整週期"}</button>)}</div>
  </section>;
}
