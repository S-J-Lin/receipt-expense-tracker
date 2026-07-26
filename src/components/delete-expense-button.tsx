"use client";

export function DeleteExpenseButton({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm("確定要刪除這筆消費嗎？此操作無法復原。")) event.preventDefault();
    }}>
      <button className="min-h-12 w-full rounded-2xl border border-red-200 bg-red-50 px-5 py-3 font-semibold text-red-700 hover:bg-red-100" type="submit">刪除消費</button>
    </form>
  );
}
