# Receipt Tracker Architecture

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
the publishable Supabase client and RLS. UUID idempotency keys prevent duplicate
submissions. No service-role key, OpenAI API, natural-language search, Auth, or
automatic third-party upload is part of Milestone 11.

## Export Boundary

`/export` reads the same unified model, applies explicit filters, previews the
scope, and produces CSV or versioned JSON only after a download click. Export
builders use field allowlists. Full backup retains database relationships and
Storage paths, while the ChatGPT bundle removes IDs and receipt paths. Neither
format includes signed URLs, idempotency keys, sessions, credentials, or
environment variables.

Milestone 12 reverses the Full Backup boundary through a strict validator,
read-only duplicate preview, and one atomic restore RPC. Skip, conservative
merge, and explicitly confirmed replace-all preserve resolved parent/child IDs
and cannot leave orphan or partially restored rows.

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
The handler computes today in Europe/Berlin and invokes one RLS-respecting
Supabase RPC. PostgreSQL locks due rules, inserts expenses, advances dates, and
enforces one generated expense per rule/month atomically. It catches up at most
12 periods per invocation; retries are safe. No service-role credential exists.
