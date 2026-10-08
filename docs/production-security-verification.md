# Production security verification

## Current status — 2026-10-08: NOT VERIFIED

- The latest **dated evidence stored in this repository** is the 2026-10-02
  probe below, which FAILED (NOT PRIVATE).
- A later acceptance run (after a full migration COMMIT on 2026-10-02) was
  reported as PRIVATE in a separate conversation. Its results were never
  written to this repository, and Storage denial for an existing file was not
  tested then. It is recorded here as an unverified report, not as evidence.
- The 2026-10-08 code review/fix session had **no production access** (no
  Supabase credentials, no SQL editor, no live probes). Nothing in this
  repository proves the current live state. Do not describe production as
  PRIVATE until the checklist below has been run and its dated results stored.
- Working tree note: the local copy of
  `supabase/migrations/20260926000100_single_user_private_lockdown.sql` adds an
  explicit `drop policy if exists "Allow public read during development"` that
  is not in the committed file. If production was locked down with the local
  version, the committed file does not exactly reproduce what ran.
- The committed lockdown migration contains the real owner Auth UUID (the
  GitHub repository is public). A UUID is not a credential — JWT + RLS are the
  boundary — but it is identifying. Future migrations must not embed it (the
  2026-10-08 forward migration uses `auth.uid()` / `is_authorized_user()`).
  History was not rewritten.

### What was verified locally (not production)

`npm run test:sql` applies the repository's migrations to a disposable local
PostgreSQL with Supabase stand-ins and checks: no anon table privileges or
policies, owner-only RLS with synthetic JWT claims, Cron RPC executable only by
`service_role`, every public `SECURITY DEFINER` function pins `search_path`, and
the restore v2 behaviour. This shows what the SQL files do, not what is live.

### Read-only live checklist (run with explicit authorization)

Run in the Supabase SQL editor of the production project; return metadata only.

```sql
-- 1. Lockdown objects exist
select to_regclass('receipt_tracker_private.app_owner') as owner_table,
       to_regprocedure('public.is_authorized_user()') as authorization_function,
       to_regprocedure('public.restore_receipt_tracker_backup_v2(uuid,text,jsonb,text,text,jsonb,date)') as restore_v2;
-- 2. Policies on ledger tables and storage.objects (expect only the "owner …" policies)
select schemaname, tablename, policyname, roles, cmd from pg_policies
where (schemaname = 'public' and tablename in ('expenses','expense_items','expense_adjustments','recurring_expenses','product_aliases','receipt_upload_sessions','backup_restore_runs'))
   or (schemaname = 'storage' and tablename = 'objects') order by 1, 2, 3;
-- 3. Table privileges for anon (expect zero rows)
select table_name, privilege_type from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public';
-- 4. RPC execute privileges (expect anon=false everywhere; cron RPC only service_role)
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       p.prosecdef as security_definer, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1;
-- 5. Bucket privacy and owner row
select id, public from storage.buckets where id = 'receipts';
select count(*) as owner_rows from receipt_tracker_private.app_owner;
```

Then, from outside the app, repeat the anonymous REST/RPC probes of
`docs/security.md` using impossible IDs only, and record date, commit, project
and results here. Only then can the status change.

---

## Historical record — 2026-10-02

### Result (2026-10-02): NOT PRIVATE — database lockdown acceptance failed

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
