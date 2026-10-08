"use client";

export function DeleteExpenseButton({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} onSubmit={(event) => {
      if (!window.confirm("確定要刪除這筆消費嗎？此操作無法復原。")) event.preventDefault();
    }}>
      <button className="ui-btn ui-btn-danger w-full" type="submit">刪除消費</button>
    </form>
  );
}
