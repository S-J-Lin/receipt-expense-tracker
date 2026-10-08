# Backup Restore and Data Portability

Restores a Receipt Tracker Full Backup JSON while preserving expense, item,
adjustment, alias, recurring-rule and expense↔rule relationships. Receipt image
objects are not part of a backup. No service-role key is used.

> **Status (2026-10-08).** The app restores only through
> `restore_receipt_tracker_backup_v2`, created by the forward migration
> `supabase/migrations/20261008000100_atomic_restore_v2.sql`. Until that
> migration is applied in Supabase, restore stops with a message and changes
> nothing. The previous two-step restore (ledger RPC, then a separate recurring
> RPC) could partially succeed and is no longer used.

## Create and Restore a Backup

1. Open `/export`, keep the range on **全部** with no other filter, and download
   **JSON — Full Backup**. Keep it private.
2. Open `/import/backup` and choose the JSON file. Selecting and previewing never
   modify data.
3. Review version, generation time, whether the backup is **complete or partial**,
   counts, currencies, duplicates, rows sharing a header signature, recurring
   rules whose next run is in the past, alias conflicts and missing attachments.
4. Choose Skip duplicates, Merge or Replace all, then confirm.
5. Download the restore report.

JSON is parsed with `JSON.parse` and Zod and is never executed. Files are limited
to 25 MB; the browser gzips the payload before sending it (hosting platforms cap
request bodies, e.g. 4.5 MB on Vercel Functions). Before previewing, the browser
checks the actual encoded payload against a conservative 4,000,000-byte limit,
leaving room for request framing. Larger payloads are blocked locally with a
message to export a smaller date range and restore using Skip/Merge; partial
backups still cannot use Replace all. The server decompresses with
an output cap. Prototype-pollution keys, signed URLs, sessions, credentials,
idempotency keys and duplicate expense or rule ids are rejected.

## Restore Modes

- **Skip duplicates** (default): rows matched to an existing expense are skipped;
  new rows keep their backup UUID. Existing rules are kept as they are.
- **Merge**: keeps existing headers; fills backup items/adjustments only when the
  matched expense has none; fills a missing recurring link on the very same
  record; updates rules with backup values (scheduling never moves backwards);
  alias conflicts are reported, never overwritten.
- **Replace all**: deletes the owner's expenses (details cascade), aliases and
  recurring rules, then restores everything from the backup. Requires the
  checkbox and the exact text `RESTORE`. Refused for partial backups and for
  legacy backups without a `recurring_expenses` section.

## Duplicate Detection (one-to-one)

Matching considers only rows that existed **before** the restore and pairs each
existing expense with at most one backup expense, in three passes:

1. same expense id;
2. same recurring rule and period (`recurring_expense_id`, `recurring_period`);
3. same header signature: trimmed lower-case merchant, date, amount, currency,
   source — oldest existing row first.

Backup rows never match each other, so two genuine identical purchases (for
example two €2.50 coffees on the same day) are both restored. The preview
(`matchBackupExpenses` in `src/lib/backup-restore.ts`) applies the same rules and
classifies matches as exact (header and detail signatures equal) or probable.

Aliases use trimmed, whitespace-collapsed, lower-case keys. Same targets are
duplicates; different targets are visible conflicts.

## Recurring Rules and Links

Rules are restored first, then expenses, so links can be set in the same
transaction. A link is kept only if the rule exists for the owner and the
rule+period is not already used; otherwise the expense is restored without the
link and the report counts it (`recurring_links_dropped`).

No historical backfill: an active rule whose `next_run_date` lies before the
current Europe/Berlin month is moved to this month's scheduled day. The current
month still runs once (the rule+period unique index prevents duplicates).
Missing older months must be entered manually.

## Partial Backups and Versions

Full Backup **1.1** adds `scope = { is_partial, filters, timezone }`. Any filter
(date range, merchant, category, product group, brand, source) marks the backup
as partial. Legacy **1.0** backups are treated as partial when their
`date_range` is set (other filters were not recorded in 1.0). Partial backups
can be used with Skip or Merge but never with Replace all. Unknown major
versions are rejected; newer `1.x` minors are parsed with a warning.

## Receipt Images

A backup may keep `receipt_image_path` but contains no image. The preview lists
each receipt folder once and reports missing objects; a missing object does not
fail the restore, and no image or signed URL is invented.

## Atomicity, Idempotency and Reports

`restore_receipt_tracker_backup_v2` runs in one PostgreSQL transaction under an
advisory lock, as `SECURITY DEFINER` with `search_path = ''`, gated by
`public.is_authorized_user()`; all writes are scoped to `auth.uid()`. Any error
rolls back everything, including recurring rules and links.

The restore key is bound to a SHA-256 of the validated backup and the mode. A
true retry (same file, same mode) returns the first report marked `replayed`. A
reused key with a different file or mode raises `restore_key_conflict` — never a
report from another restore. The form creates a new key for every new
operation.

Reports include imported/skipped/merged counts, alias conflicts, recurring
rules imported/skipped/merged/advanced, links restored/dropped, missing
attachments, duration, mode, restore key and `atomic: true`.

## Migration Runbook — `20261008000100_atomic_restore_v2.sql`

- **Purpose:** atomic single-transaction restore with one-to-one matching,
  key/payload binding, partial-backup protection and no historical backfill.
- **Affected objects:** adds nullable column `backup_restore_runs.payload_hash`;
  creates `public.restore_receipt_tracker_backup_v2(...)`; revokes EXECUTE on the
  legacy `public.restore_receipt_tracker_backup(...)` and
  `public.restore_recurring_expenses(...)` from `authenticated`. No table data is
  changed when the file is applied. It contains no user UUID.
- **Prerequisite:** `20260926000100_single_user_private_lockdown.sql` applied
  (provides `public.is_authorized_user()` and `receipt_tracker_private.app_owner`).
- **Execution order:** export a Full Backup first → run the file once in the
  Supabase SQL editor (it wraps itself in `begin … commit`) → deploy/keep the app
  version that calls v2 → verify with the queries below.
- **Verification (read-only):**
  `select proname, prosecdef, proconfig from pg_proc where proname = 'restore_receipt_tracker_backup_v2';`
  `select has_function_privilege('anon', 'public.restore_receipt_tracker_backup_v2(uuid,text,jsonb,text,text,jsonb,date)', 'execute');` → `false`.
- **Rollback:** `drop function public.restore_receipt_tracker_backup_v2(uuid,text,jsonb,text,text,jsonb,date);`
  then `grant execute on function public.restore_receipt_tracker_backup(uuid,text,jsonb,text,jsonb), public.restore_recurring_expenses(jsonb,jsonb,text) to authenticated;`
  and deploy the previous app version. The added column can remain.
- **Data preservation:** the migration does not touch ledger rows. A restore run
  is a single transaction; Replace all only deletes rows owned by `auth.uid()`.

Local verification: `npm run test:sql` runs `supabase/tests/restore_v2.test.sql`
against a disposable PostgreSQL with Supabase stubs (two identical coffees,
replay, key conflict, rollback, partial refusal, no backfill, non-owner and
privilege checks). That proves the SQL file's behaviour, not production state.

Create a complete Full Backup before large edits, before Replace all, and
regularly. Keep dated copies, prefer Skip, and use Replace only with a
known-good complete backup.
