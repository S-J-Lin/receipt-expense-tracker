# Recurring Expenses

Milestone 14 supports monthly fixed expenses only. Create a rule from **更多 → 固定支出**, set its merchant, amount, currency, category, payment method, notes, monthly day, start/end dates, and active status.

## Monthly execution

Vercel Cron calls `GET /api/cron/recurring-expenses` daily at `05:10 UTC`. The route requires `Authorization: Bearer $CRON_SECRET` and derives the calendar date in `Europe/Berlin`. It calls `process_due_recurring_expenses` with a server-only Supabase secret; the lockdown migration revokes anonymous and authenticated execution. See [security.md](security.md) — live verification is still pending.

For days 29, 30, or 31, a short month uses its final calendar day. The generated `expense_date` is the rule's calculated Berlin run date. If the job misses days, it catches up due months, at most 12 periods per rule per invocation. A unique `(recurring_expense_id, recurring_period)` constraint makes cron retries idempotent.

## Start dates in the past (2026-10-08)

A new rule starts at the first scheduled day **on or after today**; no historical months are created by default. If the start date is in the past, the form lists exactly which months a backfill would create and the amount per month. Backfill happens only when the user ticks both the backfill option and the duplicate-risk confirmation (checked again on the server). The daily job then creates those months, at most 12 per run. Editing or resuming a rule never backfills.

## Lifecycle

- **Pause:** stops generation and keeps settings/history.
- **Resume:** calculates the next occurrence on or after today; paused months are not backfilled.
- **Cancel:** permanently marks the rule inactive while retaining history (asks for confirmation).
- **Delete:** requires typing `DELETE`; the foreign key uses `ON DELETE SET NULL`, so generated expenses remain.
- **Generate now / current period:** creates or returns the single idempotent expense for this month.
- **Generate now / extra:** creates an additional expense without changing the schedule (asks for confirmation).

Full Backup includes `recurring_expenses`, `next_run_date`, status, end date, and expense linkage. Restore v2 loads rules and reconnects generated expenses in the same transaction; rules whose next run lies before the current month are moved to this month (no historical backfill).

## Setup and testing

1. Run `supabase/migrations/20260727000100_add_recurring_expenses.sql` in Supabase SQL Editor.
2. Generate a strong random value and add `CRON_SECRET` to `.env.local` and Vercel Production/Preview/Development environment variables.
3. Redeploy. Vercel reads `vercel.json` and registers the daily cron.
4. Create a rule whose run date is today, then either invoke the protected cron endpoint or use **立即建立一次 → 計入本期**.
5. Re-run the cron and confirm the same period is not duplicated.

Known limitations: monthly recurrence only; no notification, bank sync, payment confirmation, sharing, weekly/yearly schedule, or automatic exchange-rate conversion. Single-user only. Catch-up beyond 12 months requires another daily run.
