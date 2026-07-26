"use client";

import { useFormStatus } from "react-dom";

function Button() {
  const { pending } = useFormStatus();
  return <button className="min-h-12 w-full rounded-2xl border border-red-200 bg-white px-5 py-3 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={pending} type="submit">{pending ? "取消與清理中…" : "取消並刪除暫存收據"}</button>;
}

export function CancelReceiptSessionButton({ action }: { action: () => Promise<void> }) {
  return <form action={action} onSubmit={(event) => { if (!window.confirm("確定取消？暫存收據會一併刪除，且無法復原。")) event.preventDefault(); }}><Button /></form>;
}
