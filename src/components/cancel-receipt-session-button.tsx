"use client";

import { useFormStatus } from "react-dom";

function Button() {
  const { pending } = useFormStatus();
  return <button className="ui-btn ui-btn-danger w-full" disabled={pending} type="submit">{pending ? "取消與清理中…" : "取消並刪除暫存收據"}</button>;
}

export function CancelReceiptSessionButton({ action }: { action: () => Promise<void> }) {
  return <form action={action} onSubmit={(event) => { if (!window.confirm("確定取消？暫存收據會一併刪除，且無法復原。")) event.preventDefault(); }}><Button /></form>;
}
