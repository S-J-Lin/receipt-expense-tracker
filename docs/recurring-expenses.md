# Recurring Expenses

Milestone 14 supports monthly fixed expenses only. Create a rule from **更多 → 固定支出**, set its merchant, amount, currency, category, payment method, notes, monthly day, start/end dates, and active status.

## Monthly execution

Vercel Cron calls `GET /api/cron/recurring-expenses` daily at `05:10 UTC`. The route requires `Authorization: Bearer $CRON_SECRET`, derives the calendar date in `Europe/Berlin`, and calls the transaction-safe `process_due_recurring_expenses` Supabase RPC with the publishable key. No service-role key is used.

For days 29, 30, or 31, a short month uses its final calendar day. The generated `expense_date` is the rule's calculated Berlin run date. If the job misses days, it catches up due months, at most 12 periods per rule per invocation. A unique `(recurring_expense_id, recurring_period)` constraint makes cron retries idempotent.

## Lifecycle

- **Pause:** stops generation and keeps settings/history.
- **Resume:** calculates the next occurrence on or after today; paused months are not backfilled.
- **Cancel:** permanently marks the rule inactive while retaining history.
- **Delete:** requires typing `DELETE`; the foreign key uses `ON DELETE SET NULL`, so generated expenses remain.
- **Generate now / current period:** creates or returns the single idempotent expense for this month.
- **Generate now / extra:** creates an additional expense without changing the schedule.

Full Backup includes `recurring_expenses`, `next_run_date`, status, end date, and expense linkage. Restore loads rules before reconnecting generated expenses so an existing period is not generated twice.

## Setup and testing

1. Run `supabase/migrations/20260727000100_add_recurring_expenses.sql` in Supabase SQL Editor.
2. Generate a strong random value and add `CRON_SECRET` to `.env.local` and Vercel Production/Preview/Development environment variables.
3. Redeploy. Vercel reads `vercel.json` and registers the daily cron.
4. Create a rule whose run date is today, then either invoke the protected cron endpoint or use **立即建立一次 → 計入本期**.
5. Re-run the cron and confirm the same period is not duplicated.

Known limitations: monthly recurrence only; no notification, bank sync, payment confirmation, Auth, sharing, weekly/yearly schedule, or automatic exchange-rate conversion. Anonymous MVP RLS must be replaced before multi-user use. Catch-up beyond 12 months requires another daily run.

