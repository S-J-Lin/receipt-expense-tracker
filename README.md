# Receipt Tracker

Receipt Tracker is a mobile-first personal expense tracker. It provides manual
expense entry, monthly summaries, category breakdowns, daily trends, filtering,
and full expense record management in a single Next.js application.

Milestone 6 established the always-online Vercel deployment backed by Supabase.
Milestone 7 added receipt uploads without OCR or AI. The Mac is required
for development only and is not part of the production runtime.

## Current features

- Create expenses manually with server-side Zod validation
- View, search, and filter expenses by month, category, and merchant
- Edit and delete expenses with clear success and error states
- Monthly totals separated by currency
- Category totals and percentage bars
- Daily spending trend
- Mobile-first layout tested around a 390 px viewport
- PostgreSQL persistence through Supabase
- Development-stage Row Level Security policies
- Private Supabase Storage bucket for JPEG, PNG, HEIC, HEIF, and PDF receipts
- Durable receipt confirmation sessions with idempotent expense creation

## Technology stack

- Next.js 16 with App Router
- React 19
- TypeScript strict mode
- Tailwind CSS 4
- Zod 4
- Supabase PostgreSQL and Supabase JavaScript client
- Vercel deployment target

## Architecture

```text
iPhone Safari / web browser
            ↓ HTTPS
Vercel-hosted Next.js application
            ↓
Supabase PostgreSQL
```

The application uses standard Next.js Server Components and Server Actions. It
does not use a custom server or a hard-coded production domain. Internal links
are relative, so refreshed routes such as `/expenses` and `/expenses/[id]` are
handled by the App Router on Vercel.

## Local development

Requirements: Node.js, npm, and a Supabase project.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. The development server intentionally runs until
you stop it with `Control+C`.

## Environment variables

Create `.env.local` in the project root:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
```

`.env.local` is ignored by Git. `.env.example` contains blank placeholders only.
The publishable key is designed for browser-facing applications and relies on
RLS for authorization.

Do not add a service-role key, database password, or any administrator secret to
a `NEXT_PUBLIC_` variable. This milestone does not use a service-role key.

## Supabase setup

For a new database, run `supabase/schema.sql` through the normal Supabase schema
workflow. It creates the `expenses` table, update trigger, indexes, test record,
and development-stage RLS policies.

For an existing database, apply these migrations in order:

1. `supabase/migrations/20260726000100_add_mvp_expenses_select_policy.sql`
2. `supabase/migrations/20260726000200_add_mvp_anonymous_crud_policies.sql`
3. `supabase/migrations/20260726000300_add_receipt_storage.sql`
4. `supabase/migrations/20260726000400_add_receipt_upload_sessions.sql`

The second migration grants anonymous expense INSERT, UPDATE, and DELETE access.
The third adds `receipt_image_path`, creates the private `receipts` bucket with a
10 MB limit, and adds temporary anonymous Storage policies. RLS remains enabled.
Named policies are dropped before recreation so migrations can be safely retried.

### Apply the Milestone 7 migration

The migration is committed to Git but is not automatically applied to the hosted
Supabase project. In **Supabase Dashboard → SQL Editor**, open and run the full
contents of:

```text
supabase/migrations/20260726000300_add_receipt_storage.sql
```

Then confirm **Storage → receipts** exists, is private, has a 10 MB limit, and
allows JPEG, PNG, HEIC, HEIF, and PDF. No new environment variable is required.

### Apply the Milestone 8 migration

Run the full contents of
`supabase/migrations/20260726000400_add_receipt_upload_sessions.sql` in the
Supabase SQL Editor. It creates the RLS-enabled `receipt_upload_sessions` table
and narrowly scoped RPC functions used by the anonymous confirmation workflow.
The table itself grants no direct access to `anon` or `authenticated`; each
browser receives a random capability token in an HttpOnly cookie, while only its
SHA-256 hash is stored in PostgreSQL. No service-role key is required.

The confirmation RPC locks the session row and returns the existing expense ID
after a repeated request, so retries cannot create a second expense. Creating the
expense and marking its session complete occur inside one PostgreSQL transaction.

## Production deployment with Vercel

### Before deployment

```bash
npm run lint
npx tsc --noEmit
npm run build
git status
```

Confirm that `.env.local`, `.next`, and `node_modules` are not staged.

### Vercel Dashboard steps

1. Push this repository to GitHub.
2. Sign in to [Vercel](https://vercel.com) with GitHub.
3. Select **Add New → Project** and import `S-J-Lin/receipt-expense-tracker`.
4. Confirm **Framework Preset** is **Next.js**.
5. Keep the repository root as the project root; no custom server is required.
6. In **Environment Variables**, add these for **Production**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
7. Do not add a service-role key.
8. Select **Deploy** and wait for the deployment status to become **Ready**.
9. Open the generated HTTPS domain and verify the Dashboard.

Production URL: <https://receipt-expense-tracker-eight.vercel.app>

After GitHub integration is connected, each push to the production branch
automatically creates a new production deployment. Pull requests normally get
separate preview deployments.

The application does not use Supabase Auth yet, so no Auth redirect URL or site
URL change is required for Milestone 6.

## Security warning

The Milestone 6 RLS policies are deliberately temporary. They allow anonymous
SELECT, INSERT, UPDATE, and DELETE access so the personal MVP can work before
authentication is implemented.

Anyone who obtains the public application URL and Supabase publishable key can,
in principle, read, add, modify, or delete every expense row. Do not store
sensitive receipt data, do not broadly share the URL, and do not treat this as a
multi-user production security model.

Milestone 12 must remove all `MVP public ... expenses` policies and replace them
with Supabase Auth and user-scoped policies based on:

```sql
auth.uid() = user_id
```

RLS must remain enabled. A service-role key must never be shipped to the browser
or used to bypass these application policies.

The Milestone 7 `receipts` bucket is private, and the application produces
one-hour signed URLs instead of permanent public URLs. However, its temporary
anonymous Storage policies still allow anyone with the publishable key and a
known random object path to read or delete that object. Receipt paths use
`anonymous/YYYY/MM/{uuid}-{timestamp}.{extension}`, uploads disable overwrite,
and the bucket limits type and size. Do not upload sensitive receipts during this
anonymous MVP. Milestone 12 must replace these policies with authenticated,
user-scoped private Storage policies.

If a user uploads a receipt and abandons the expense form, the object may remain
orphaned. Replacing and deleting attached receipts attempts cleanup through the
Storage API, but PostgreSQL and Storage do not share a transaction. A cleanup
failure is reported explicitly and may require manual removal from Storage.

Milestone 8 sessions expire after 24 hours. Automatic removal of expired session
rows and their Storage objects remains production-hardening technical debt.
PostgreSQL and Supabase Storage cannot participate in one atomic transaction:
cancel therefore deletes the object first and reports failure without claiming
success; replacement changes the session only after validation, then attempts to
remove the old object. Authentication in Milestone 12 will replace anonymous
capability sessions and Storage policies with user-owned RLS.

## Quality and dependency checks

```bash
npm run lint
npx tsc --noEmit
npm run build
npm audit
```

The current audit report includes advisories in the ESLint development toolchain
and in transitive Next.js dependencies such as PostCSS and Sharp. No forced or
major-version upgrade is performed in Milestone 6. Recheck advisories before the
image-upload milestone because Sharp becomes more relevant when handling images.

## Manual production test checklist

### Always-online baseline

- Open the Vercel HTTPS URL successfully.
- Stop local `npm run dev` and close the Terminal.
- Open the production URL again.
- Test from iPhone Safari using mobile data or a different Wi-Fi network.
- Confirm the app does not depend on localhost, a Mac IP, or the Mac remaining on.

### Read existing data

- Confirm existing Supabase expenses appear on the production Dashboard.
- Refresh the home page and `/expenses`; data must remain.
- Refresh a detail URL directly; it must not return 404.

### Create

Create an expense with merchant REWE, today's date, amount `23.47`, currency EUR,
category 食品雜貨, and payment method Wise.

- Confirm a success message is shown.
- Confirm one new row appears in Supabase.
- Confirm Dashboard totals and transaction count update.
- Refresh and confirm the row persists.
- Rapidly click submit and confirm the disabled/pending button prevents duplicate
  submissions.

### Edit

- Change the REWE amount or category.
- Confirm the same database UUID is updated rather than duplicated.
- Confirm Dashboard totals and category breakdown update after the redirect.

### Delete

- Select delete and cancel the confirmation; the row must remain.
- Select delete again and confirm; the row must disappear.
- Refresh the list and Dashboard; the row must not return.

### iPhone layout

- Confirm there is no horizontal scrolling.
- Confirm date and amount inputs work with the iPhone keyboard.
- Confirm buttons are easy to tap and remain reachable when the keyboard is open.
- Confirm the complete create/edit/delete flow does not require desktop mode.

### Error handling

- Disconnect the network and confirm the app does not show a false success.
- Confirm a Supabase failure produces a clear error message.
- Confirm forms do not remain in an infinite loading state.
- Reconnect and retry successfully.

## Roadmap

| Milestone | Status | Scope |
| --- | --- | --- |
| 0–5 | Completed | Environment, Next.js, Supabase, manual CRUD, Dashboard, record management |
| 6 | Completed | Production deployment and always-online baseline |
| 7 | Completed | Receipt image/PDF upload and expense attachment workflow |
| 8 | Completed | Receipt confirmation workflow |
| 9 | Planned | ChatGPT receipt recognition |
| 10 | Planned | iPhone Shortcut integration |
| 11 | Planned | PWA and iPhone home-screen experience |
| 12 | Planned | Authentication and production user-based RLS |
| 13 | Planned | AI expense analysis and monthly reports |
| 14 | Planned | Testing, monitoring, backup, and production hardening |
| 15 | Planned | UI/UX polish |

## Completed milestones

- Milestone 0: Local development environment verified
- Milestone 1: Next.js mobile-first application initialized
- Milestone 2: Supabase database and typed data layer
- Milestone 3: Manual expense entry
- Milestone 4: Monthly Dashboard and spending summaries
- Milestone 5: Expense filtering, detail, edit, and deletion
- Milestone 6: Vercel production deployment and mobile-network CRUD validation
- Milestone 7: Receipt upload, signed preview, replacement, and Storage cleanup
- Milestone 8: Durable receipt confirmation, idempotent creation, and cleanup

Milestones 7 and 8 passed their Supabase migrations, local browser testing, and
Vercel production acceptance. Milestone 8 production testing covered upload,
refresh persistence, signed preview, double-submit idempotency, permanent expense
creation, deletion, and Storage cleanup; dedicated test data was removed.

## Milestone 7 receipt upload checks

- Dashboard keeps separate **新增消費** and **上傳收據** actions.
- The shared Receipt Tracker brand link returns every route to `/` and has a
  visible keyboard focus state.
- JPEG, PNG, HEIC, HEIF, and PDF are accepted up to 10 MB; MIME type, extension,
  and file signature are validated on the server.
- HEIC/HEIF uploads are supported, but direct preview depends on the browser and
  is clearly marked when unavailable.
- Upload uses a unique path with `upsert: false`; saving the expense records the
  Storage path, and detail/edit pages use a short-lived signed URL.
- The browser uploads directly to Supabase Storage so 10 MB files do not pass
  through Vercel's request-body limit. A Server Action then downloads and checks
  the stored object's MIME type, extension, size, and signature before it can be
  attached to an expense.
- Expense replacement uploads the new file before changing the database and does
  not delete the old file until the database update succeeds.
- Expense deletion removes the database record and then attempts Storage cleanup;
  any cleanup failure is shown explicitly.

## Milestone 8 receipt confirmation workflow

- A validated upload creates a durable temporary session and redirects to
  `/receipts/confirm/[sessionId]`; receipt paths and signed URLs are not placed in
  the query string.
- Refreshing the confirmation page reloads the session from Supabase. JPEG/PNG,
  HEIC/HEIF, and PDF use the existing private signed-preview behavior.
- Required fields use the shared Zod expense validation. Confirmation calls one
  idempotent transaction-like RPC that creates exactly one permanent expense.
- Cancel asks for confirmation and removes the Storage object before deleting
  the session. Replacement verifies the new object before switching paths and
  cleans the old object only after the switch succeeds.
- The session schema already includes draft and analysis fields so Milestone 9
  can prefill this same form without creating a permanent expense.

## Milestone 9 plan (not implemented)

Milestone 9 will call the OpenAI API from server-only code after upload, request
structured receipt output, validate it with Zod, and store only temporary draft
values, confidence, and warnings in the current session. The user must still
review and confirm before expense creation. The API key will never use a
`NEXT_PUBLIC_` name or reach the browser. Implementation must also include rate
limits, timeouts, bounded retries, input resizing/cost controls, and explicit
handling of ambiguous totals, tax, change, deposits, and discounts. Milestone 9
has not been started and this project currently performs no OCR or AI calls.
