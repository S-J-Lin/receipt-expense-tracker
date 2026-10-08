"use client";

import { useState } from "react";
import type { ExportRange } from "@/lib/export-query";

const OPTIONS: Array<{ value: ExportRange; label: string }> = [
  { value: "all", label: "全部" }, { value: "month", label: "本月" }, { value: "3m", label: "最近 3 個月" },
  { value: "6m", label: "最近 6 個月" }, { value: "year", label: "今年" }, { value: "custom", label: "自訂日期" },
];
const field = "mt-1 min-h-12 w-full rounded-xl border px-3 py-2";

/**
 * Keeps the range selector and the date inputs consistent: typing a date
 * switches to「自訂日期」, choosing a preset clears the dates. The server also
 * treats any submitted date as a custom range, so a typed date is never ignored.
 */
export function ExportRangeFields({ range, start, end }: { range: ExportRange; start?: string; end?: string }) {
  const [value, setValue] = useState<ExportRange>(range);
  const [from, setFrom] = useState(range === "custom" ? start ?? "" : "");
  const [to, setTo] = useState(range === "custom" ? end ?? "" : "");
  return <>
    <label className="text-sm font-semibold">日期範圍<select className={field} name="range" onChange={(event) => { const next = event.target.value as ExportRange; setValue(next); if (next !== "custom") { setFrom(""); setTo(""); } }} value={value}>{OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label className="text-sm font-semibold">開始日期<input className={field} name="start" onChange={(event) => { setFrom(event.target.value); if (event.target.value) setValue("custom"); }} type="date" value={from} /></label>
    <label className="text-sm font-semibold">結束日期<input className={field} name="end" onChange={(event) => { setTo(event.target.value); if (event.target.value) setValue("custom"); }} type="date" value={to} /></label>
  </>;
}
