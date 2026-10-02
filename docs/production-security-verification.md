# Production security verification — 2026-10-02

## Result: NOT PRIVATE — database lockdown acceptance failed

Application security implementation: `b06dddbf6e06e1ff20899ca1d09be270ae3ba511`.
GitHub's Vercel status reported deployment completed successfully. Production
origin: https://receipt-expense-tracker-eight.vercel.app.

The owner reported successful migration execution. However, direct live probes
against the Supabase project configured in this repository (`qnudotsjzzcjlfahsjyj`)
using only its publishable key show the expected lockdown is not effective.
No secret keys, credentials, record contents or individual record IDs are
included in this report. The production login bundles do not expose the
Supabase configuration, so the server's configured project must also be checked
in Vercel; it cannot be inferred from those client bundles.

## Local checks

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run test`: 12 files, 161 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.

## Live anonymous website checks — passed

- `/`, `/expenses`, `/expenses/new`, expense detail/edit, `/items`,
  `/import/chatgpt`, `/import/backup`, `/export`, `/recurring`,
  `/receipts/upload`, `/settings`: HTTP 307 to `/login`, private/no-store.
- `/login`: displays the password login form without sign-up.
- All four export formats (`expenses-csv`, `items-csv`, `full-json`,
  `chatgpt-json`): HTTP 401, no-store; no ledger download returned.
- Cron without authorization: HTTP 401.

## Live publishable-key database checks — FAILED

- SELECT `expenses`, `expense_items`, `expense_adjustments`,
  `recurring_expenses`, `product_aliases`: HTTP 200, one row accessible in each
  limited query. Only the row count was output, not financial contents.
- SELECT `receipt_upload_sessions`, `backup_restore_runs`: HTTP 401 / 42501.
- Anonymous empty INSERT probes on the five ledger tables: HTTP 400 / 23502
  (NOT NULL errors, not permission denial). No valid records were inserted.
- UPDATE/DELETE probes on those tables: HTTP 204, not permission denial.
  Each request had contradictory ID filters, guaranteeing no matching row.
- `is_authorized_user`: HTTP 404 / PGRST202 (helper not found in exposed schema).
- `process_due_recurring_expenses`: anonymous execution returned HTTP 200;
  the probe used date 1900-01-01, not the current date.
- Restore and several receipt/recurring RPCs reached their implementation
  (validation errors or empty results), rather than EXECUTE permission denial.
  Inputs were null/invalid or empty; no real record was targeted.
- Supabase Auth settings report `disable_signup: true`.

These observations contradict a successful effective lockdown in this project.
Possible causes include executing SQL in another project, running only a
selected fragment, an uncommitted transaction, or recreating historical MVP
policies afterward. The exact cause is not yet established.

## Storage and remaining acceptance — not verified

Anonymous receipts listing returned HTTP 200 with an empty list; anonymous
bucket metadata returned NoSuchBucket. Neither proves access denial for a
known existing receipt. No receipt bytes were downloaded. No live signed URL
was used, and no upload/delete probe was performed after the ledger failure.

Authorized owner login, another authenticated user's denial, row/totals
continuity, owner CRUD, receipt access, safe backup restore, authenticated
exports and positive Cron/idempotency tests remain pending. No passwords,
tokens or secret keys were requested or extracted. No production migration,
Auth changes, policy changes or Storage configuration changes were executed.

## Required next step: read-only SQL Editor inspection

Select project `qnudotsjzzcjlfahsjyj`, open a new query, and execute only:

```sql
select to_regclass('receipt_tracker_private.app_owner') as owner_table,
  to_regprocedure('public.is_authorized_user()') as authorization_function;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in
  ('expenses','expense_items','expense_adjustments','recurring_expenses','product_aliases','receipt_upload_sessions','backup_restore_runs'))
  or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;
```

Return these metadata results, not secrets or ledger exports. Do not blindly
rerun this non-idempotent migration or old `schema.sql`. After the discrepancy
is understood and corrected with explicit authorization, rerun all live
acceptance checks in `docs/security.md`. The security milestone is not Complete.
