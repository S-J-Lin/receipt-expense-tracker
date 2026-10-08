# Receipt Tracker Architecture

Security transition: this document includes historical M11–M14 design notes.
For the pending single-user private architecture and deployment status, see
[security.md](security.md). Production is not private until its migration and
live acceptance are complete.

Receipt Tracker is a **Personal Purchase Database**. It collects, validates,
normalizes, stores, reports, and exports purchase data. Complex semantic search
and advanced interpretation remain optional ChatGPT tasks performed on a
user-downloaded analysis bundle.

## Unified Data Model

```text
Manual Entry ───────┐
ChatGPT Paste ──────┼──> expenses
Receipt Workflow ────────┤      ├── expense_items
Recurring rules ──Cron───┘      ├── recurring_expenses
                           └── expense_adjustments
                                  ↓
                    Dashboard / Statistics / Export
```

All sources share the same three-table structure. `expenses.source` is the only
source discriminator: `manual`, `chatgpt_import`, `receipt_upload`, or `recurring`.
`expenses.amount` is always the authoritative transaction total. Item and
adjustment rows provide category allocation but never increase the Dashboard
total a second time.

Manual and ChatGPT item arrays are written atomically by PostgreSQL RPCs using
the publishable Supabase client, the owner's session and RLS. UUID idempotency
keys prevent duplicate submissions; after each create the server compares the
stored record with the submitted payload, so a reused key with different
content is reported as a conflict instead of a silent success. No OpenAI API,
natural-language search, or automatic third-party upload is used.

## Read boundary (2026-10-08)

PostgREST truncates responses at `max_rows` without an error. All multi-row
reads go through `fetchAllPages` (`src/lib/supabase/fetch-all.ts`): ordered
`.range()` pages verified against an exact count, child rows fetched with
`.in()` filters of at most 100 IDs. A short or shifted read throws
`IncompleteDataError`; exports, backups, restore previews and analytics fail
closed instead of producing partial financial data. List pages (`/expenses`)
use real pagination and do not load item rows.

## Export Boundary

`/export` reads the same unified model, applies explicit filters, previews the
scope, and produces CSV or versioned JSON only after a download click. Export
builders use field allowlists. Full backup retains database relationships and
Storage paths, while the ChatGPT bundle removes IDs and receipt paths. Neither
format includes signed URLs, idempotency keys, sessions, credentials, or
environment variables.

Full Backup 1.1 carries a `scope` block (complete vs. filtered). Restore uses a
strict validator, a read-only one-to-one duplicate preview, and one
single-transaction RPC (`restore_receipt_tracker_backup_v2`, forward migration
`20261008000100`) that restores ledger, aliases, recurring rules and their links
together. The earlier design (ledger RPC + separate recurring RPC) could
partially succeed and is retired. See `docs/backup-restore.md`.

Export date presets use the Europe/Berlin calendar; typed dates always apply.
Download bodies are streamed; CSV text cells are protected against formula
injection.

## PWA boundary

Milestone 13 adds an installable iPhone shell without creating an offline copy
of the ledger. The service worker caches only the offline page, manifest, icons,
and versioned Next.js static assets. Navigations are network-first; personal
pages, APIs, exports, restore payloads, and Supabase responses are never cached.
Offline submissions are blocked and retain form state for an explicit retry.

The application has one fixed Dark Theme. Semantic tokens in `globals.css`
apply consistently across the unified data views, while `AppBackground` keeps
the replaceable HH211 image and protective gradient outside all data components.
No theme preference is stored and the background asset never enters Supabase.

## Recurring scheduling boundary

Vercel Cron runs once daily and authenticates a Route Handler with `CRON_SECRET`.
The handler uses a server-only Supabase secret to invoke a service-role-only
RPC. PostgreSQL locks due rules, inserts expenses,
advances dates, and enforces one generated expense per rule/month atomically.
It catches up at most 12 periods per invocation; retries are safe.

New rules start at the first scheduled day on or after today. A past start date
creates historical months only when the user explicitly opts in and confirms
the listed months (they may duplicate manual entries); restore never backfills
months before the current Berlin month.

## Statistics boundary

Dashboard rules: the monthly total counts every expense once, including rent
and generated recurring expenses; daily analysis, week/month comparisons and
projections exclude header category 房租; the distribution includes rent and
shows an unallocated difference row (display only) when item/adjustment
allocations differ from the receipt total. Product analytics are computed per
currency. Currencies are never added together or converted.
