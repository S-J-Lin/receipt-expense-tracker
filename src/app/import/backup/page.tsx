import Link from "next/link";
import { BackupRestoreForm } from "@/components/backup-restore-form";

export default function BackupImportPage() {
  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-4xl space-y-5">
    <div><Link className="text-sm font-semibold text-indigo-600" href="/export">← 返回匯出資料</Link><p className="mt-4 text-sm font-semibold text-indigo-600">Milestone 12 · Data Portability</p><h1 className="mt-1 text-3xl font-bold">還原 Full Backup</h1><p className="mt-2 text-slate-600">驗證、預覽並原子化還原 expenses、items、adjustments 與 aliases。選取檔案不會立即修改資料。</p></div>
    <BackupRestoreForm />
  </div></main>;
}
