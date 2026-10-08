# Single-User Private Authentication — deployment runbook

**Status (2026-10-08): live database state NOT VERIFIED.** The 2026-10-02 probe
stored in this repository failed; a later acceptance was reported as PRIVATE in
a separate conversation but its evidence is not stored here. See
[production verification](production-security-verification.md) for the
read-only checklist that must be run before calling production private.
Never paste your
password, Full Backup, access token or secret key into a chat.

## Architecture and threat model

The website URL, Supabase URL and publishable key are public. Anonymous REST,
RPC and Storage calls must not read or mutate the ledger. A different Auth user
must also be denied. Only the immutable UUID of one manually created Supabase
Auth user is allowed; there is no public sign-up, multi-user role or sharing.

The exact same UUID is stored in the server-only `AUTHORIZED_USER_ID` variable
and the database's non-exposed `receipt_tracker_private.app_owner` table. Database RLS protects
direct API calls. The Next.js Proxy redirects browser pages, while Server
Actions and export routes recheck Auth. SSR cookies preserve a valid login
across iPhone/PWA restarts. The publishable key is not a password.

`expenses`, `recurring_expenses`, `product_aliases` and
`receipt_upload_sessions` gain non-null owner IDs. Aliases are private learned
normalization history, not global taxonomy. Item/adjustment RLS checks parent
expense ownership. `receipt_upload_sessions` and `backup_restore_runs` remain
unreadable directly by `anon`. Old SECURITY DEFINER receipt/restore functions
move into a non-exposed schema; new public wrappers check owner identity and
session ownership. `RESTORE` only confirms a destructive action; it is not
authentication. Other invoker RPCs inherit RLS and lose anonymous EXECUTE.

The `receipts` bucket stays Private. New paths start with `{user_id}/`; existing
`anonymous/` objects remain in place but are readable/deletable only by the
owner, including orphan files. Existing signed URLs may work until they expire
(app-issued URLs last one hour). Any historic external `receipt_image_url`
requires separate review: Storage policies cannot revoke an external URL.

All export formats require an authorized session: no session → 401, different
user → 403. Downloads set `Cache-Control: private, no-store`; the PWA service
worker does not cache personal navigation or downloads.

Function inventory: `create_chatgpt_import`, `create_manual_expense`, and
`update_itemized_expense` are SECURITY INVOKER and available only to
`authenticated`; their table writes are subject to owner RLS. The five
receipt-session functions and `restore_receipt_tracker_backup` are SECURITY
DEFINER wrappers with explicit authorized-UID checks; their old implementations
are moved to `private` with client EXECUTE revoked. `process_due_recurring_expenses`
is SECURITY INVOKER and executable only by `service_role` for Cron.
`is_authorized_user` is a SECURITY DEFINER boolean helper reading the sole UUID
from `receipt_tracker_private.app_owner`; it is granted only to `authenticated` for RLS checks.
`resume_recurring_expense`, `generate_recurring_expense_now`, and
`restore_recurring_expenses` are SECURITY INVOKER and authenticated-only.
`set_updated_at`, `prepare_recurring_expense`, `recurring_scheduled_date`, and
`next_recurring_run` are trigger/date helpers, not ledger readers; they remain
available where required by database triggers/RPCs. The migration aborts if
unexpected table or Storage policies remain rather than claiming lockdown.

Cron does not have a browser session. Vercel sends `CRON_SECRET`; after checking
it, server-only code uses `SUPABASE_SECRET_KEY` (`sb_secret_...`) to execute
the recurring generation RPC as `service_role`. That RPC is not executable by
`anon` or ordinary `authenticated` users. Never use this secret client for
regular page reads, exports or user actions. Do not use `NEXT_PUBLIC_` on the
owner UUID, Cron secret or Supabase secret.

## Deployment order — short maintenance window

1. **Before any migration**, download **JSON — Full Backup** from the current
   app's `/export` page, check that it is nonempty and save it privately. Backup
   JSON contains receipt paths, not the actual file bytes; separately preserve
   important receipts if needed. Record baseline counts/totals with the query
   below. Do not upload the backup into a chat.
2. In Supabase Dashboard → Authentication → Users, manually create your sole
   email/password user, confirm the account, and copy its **User UID** (UUID).
   Disable public email registration and unused Auth providers. Set the Site
   URL to the production HTTPS origin and allowed redirect URL to that origin;
   include `http://localhost:3000` only if testing locally. Password sign-in
   does not need a callback route. Do not share the password.
3. In Vercel → Project → Settings → Environment Variables, set
   `AUTHORIZED_USER_ID` to that UID and `SUPABASE_SECRET_KEY` to Supabase's
   server-side **secret** key. Preserve `CRON_SECRET` and the two
   `NEXT_PUBLIC_SUPABASE_*` variables. Apply to each environment where the app
   or Cron will run. Locally add the same UUID to `.env.local` only if needed.
4. In
   `supabase/migrations/20260926000100_single_user_private_lockdown.sql`,
   replace **only** the all-zero UUID in the `security_migration_owner` `select`
   with your User UID; keep the all-zero guard comparison intact. Paste and run
   the **entire file once** in Supabase SQL Editor. Its `BEGIN`/`COMMIT` encloses
   owner backfill, RLS, Storage and RPC changes. It aborts if the UID is absent,
   another owner or unexpected policies exist, or data reconciliation fails.
   A failure rolls back the whole change; investigate rather than skipping it.
5. Immediately deploy this repository version to production using the usual
   Git/Vercel workflow. Running migration first makes the old anonymous app
   briefly unavailable, but closes the data exposure at once. Work in a short
   maintenance window; do not leave the old app running against the locked
   database. Confirm Vercel deployment is Ready, then sign in.
6. Run the live acceptance below. **Only after every check succeeds** may the
   security milestone be marked Completed or the system called private. Keep
   the backup until data continuity is confirmed. Do not rerun historical MVP
   migrations after lockdown.

Read-only SQL Editor baseline and post-deployment query:

```sql
select 'expenses' as name, count(*) as rows, coalesce(sum(amount), 0) as total from public.expenses
union all select 'expense_items', count(*), coalesce(sum(amount), 0) from public.expense_items
union all select 'expense_adjustments', count(*), coalesce(sum(amount), 0) from public.expense_adjustments
union all select 'recurring_expenses', count(*), coalesce(sum(amount), 0) from public.recurring_expenses;
select count(*) as recurring_history_links from public.expenses where recurring_expense_id is not null;
select count(*) as aliases from public.product_aliases;
select count(*) as receipt_sessions from public.receipt_upload_sessions;
```

The migration also snapshots and compares counts, expense/item/adjustment/rule
amount sums, and recurring history links inside one transaction. It does not delete expenses, child rows,
rules, aliases, sessions or Storage objects.

## Live security acceptance (after migration and deployment)

Use a fresh private browser window and disposable test records. Do not run
positive destructive tests on irreplaceable data.

1. Without login, `/`, `/expenses`, `/items`, `/import/chatgpt`, `/export`,
   `/import/backup`, `/recurring`, `/receipts/upload`, `/settings` redirect to
   `/login`; no sign-up link exists. Every `/export/download/*` format returns
   401 with no file. The unauthenticated Cron route returns 401.
2. Using only Supabase URL and publishable key, direct REST SELECT of
   `expenses`, `expense_items`, `expense_adjustments`, `recurring_expenses` and
   `product_aliases` yields no accessible rows/permission denial. Anonymous
   INSERT, UPDATE, DELETE and all mutation RPCs (especially restore and
   recurring generation) must be denied. Use nonexistent IDs for negative
   mutation probes; never aim them at actual records.
3. Anonymous Storage list/download/sign/upload/delete on `receipts`, including
   legacy `anonymous/`, must be denied. Do not reuse an already-issued signed
   URL to test anonymous Storage authorization.
4. A different Auth user cannot log into this app; direct REST/Storage with its
   session cannot see or change the ledger. Export returns 403. Inspect
   `pg_policies` and function privileges: no broad `USING (true)` or
   `WITH CHECK (true)` may remain on ledger or receipt Storage objects.
5. Authorized login works on Safari and standalone PWA. Compare old expenses,
   item/adjustment counts, recurring rules/history, aliases and totals with
   baseline. Create/edit/delete a temporary expense and item. Export all
   formats; test backup preview, safe Skip/Merge restore, and only if needed a
   carefully reviewed disposable Replace restore with explicit confirmation.
   Upload/preview a new receipt and confirm its path begins with your UID.
6. Check the next Cron run (or invoke it from a trusted environment with
   `CRON_SECRET`), verify generated expenses and idempotency, then confirm
   anonymous direct invocation of its RPC remains denied.

The repository checks cannot prove hosted RLS behavior until the SQL is applied.
If any live check fails, do not treat the deployment as private or store new
sensitive records until corrected.

Useful read-only SQL Editor inspection after migration:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in
  ('expenses','expense_items','expense_adjustments','recurring_expenses','product_aliases','receipt_upload_sessions','backup_restore_runs'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;
select routine_schema, routine_name, security_type
from information_schema.routines
where routine_schema in ('public','receipt_tracker_private')
order by routine_schema, routine_name;
```


## Application hardening — 2026-10-08

- **Proxy cookies:** `src/proxy.ts` replays Supabase cookies with their options
  (path, maxAge, sameSite, secure) and headers on every response including
  redirects, so a refreshed or cleared session is never downgraded. Routing
  policy lives in `src/lib/proxy-policy.ts` (tested); missing
  `AUTHORIZED_USER_ID` fails closed.
- **Headers:** `next.config.ts` sends `frame-ancestors 'none'`,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: same-origin`, a restrictive `Permissions-Policy` and COOP;
  `sw.js` is never cached. A full script CSP is not set (Next.js inline
  bootstrap scripts).
- **CSV exports:** text cells beginning with `= + - @`, tab or CR are prefixed
  with `'` (formula injection); plain numbers such as `-1.50` are unchanged.
- **Errors:** database errors are mapped to user-facing messages
  (`src/lib/errors.ts`); only error codes are logged — never payloads, raw
  messages or ledger data. The Cron route no longer echoes database messages
  and compares the bearer token in constant time.
- **Receipts:** compensating deletes remove a file only if it is under the
  owner's prefix and no other expense references it.
- **Restore:** `restore_receipt_tracker_backup_v2` (forward migration
  `20261008000100`) is `SECURITY DEFINER` with `search_path = ''`, owner-gated,
  scopes every write to `auth.uid()`, and revokes the legacy two-step restore
  RPCs from `authenticated`.
- **Owner UUID in migrations:** the committed lockdown migration contains the
  real owner UUID; the repository is public. It is not a credential and history
  was not rewritten. Future migrations take identity from `auth.uid()` or a
  value supplied at execution time, never a literal.
- **Deferred (needs a policy migration and explicit approval):** wrapping
  `auth.uid()` / `is_authorized_user()` in `(select …)` inside RLS policies for
  per-statement evaluation; no policy was changed in this round.
