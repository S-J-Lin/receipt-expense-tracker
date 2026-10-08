import type { Metadata } from "next";
import Link from "next/link";
import { BackupRestoreForm } from "@/components/backup-restore-form";

export const metadata: Metadata = { title: "備份還原" };

export default function BackupImportPage() {
  return <main className="flex-1 px-4 py-6 sm:px-6"><div className="mx-auto max-w-4xl space-y-5">
    <div><Link className="ui-link text-sm" href="/export">← 返回匯出資料</Link><h1 className="mt-2 text-2xl font-bold sm:text-3xl">還原 Full Backup</h1><p className="mt-2 ui-muted">驗證並預覽後，在單一資料庫交易中還原消費、商品明細、調整、商品別名、固定支出規則及其連結。任何錯誤都會全部回滾。選取檔案不會立即修改資料。</p></div>
    <BackupRestoreForm />
  </div></main>;
}
