"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ComparisonMode } from "@/lib/dashboard-analysis";

const OPTIONS: Array<{ value: ComparisonMode; label: string; hint: string }> = [
  { value: "aligned", label: "同期比較", hint: "與上週／上月相同天數比較" },
  { value: "full", label: "完整週期", hint: "與上週／上月完整週期比較" },
];

export function DashboardComparisonToggle({ mode, month }: { mode: ComparisonMode; month: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = OPTIONS.find((option) => option.value === mode) ?? OPTIONS[0];
  return <div>
    <div aria-label="比較模式" className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] p-1" role="group">{OPTIONS.map((option) => <button aria-pressed={mode === option.value} className={`flex min-h-11 min-w-0 items-center justify-center rounded-lg px-3 text-sm font-semibold ${mode === option.value ? "bg-[var(--accent)] text-[#08111f]" : "ui-muted hover:bg-slate-100"}`} disabled={pending} key={option.value} onClick={() => startTransition(() => router.push(`/?month=${month}&comparison=${option.value}`))} type="button">{option.label}</button>)}</div>
    <p aria-live="polite" className="mt-1.5 text-xs ui-muted">{pending ? "更新中…" : active.hint}</p>
  </div>;
}
