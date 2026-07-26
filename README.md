# Receipt Tracker

Receipt Tracker is a mobile-first personal expense tracker. Its primary flows
are manual entry and importing structured JSON copied from a dedicated ChatGPT
Project. ChatGPT understands and classifies the receipt; Receipt Tracker locally
parses, validates, edits, stores, and reports the structured result.

Milestone 6 established the always-online Vercel deployment backed by Supabase.
Milestones 7 and 8 remain implemented but are experimental/dormant and are not
part of the current primary workflow. The Mac is required for development only.

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
- Local parsing and Zod validation of pasted ChatGPT JSON
- Editable itemized preview with positive or negative adjustments
- Atomic, idempotent itemized import through a PostgreSQL RPC
- Item-level Dashboard category totals without double counting

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
iPhone receipt → dedicated ChatGPT Project → copied JSON
                                            ↓
                           Receipt Tracker validation/editing
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
5. `supabase/migrations/20260726000500_add_chatgpt_paste_import.sql`

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

### Apply the Milestone 9 migration

In **Supabase Dashboard → SQL Editor**, create a new query and run the complete
contents of:

```text
supabase/migrations/20260726000500_add_chatgpt_paste_import.sql
```

It adds the source and warning fields, `expense_items`,
`expense_adjustments`, temporary anonymous MVP CRUD policies, and the atomic
`create_chatgpt_import` RPC. It does not change the Milestone 7/8 migrations or
delete the private `receipts` bucket. No new environment variable is required.
The hosted migration and local acceptance passed on 2026-07-26. Milestone 9
remains Current until Vercel deployment and production acceptance pass.

## ChatGPT Paste Import workflow

Receipt Tracker does not call the OpenAI API and requires no OpenAI API key,
model setting, API billing, or Vercel OpenAI environment variable. Raw pasted
text is parsed in the browser and is not sent to a third party. Only the edited,
structured payload is revalidated by the Receipt Tracker server before storage.

Recommended iPhone flow:

1. Take or select a receipt photo on iPhone.
2. Share the image to ChatGPT and analyze it in the dedicated Project.
3. Copy the JSON response.
4. Open Receipt Tracker and select **匯入 ChatGPT**.
5. Paste, parse, review every item and adjustment, then confirm storage.

This is a semi-automatic workflow. It does not claim an iPhone Shortcut can
automatically retrieve a ChatGPT Project response.

### Suggested ChatGPT Project instruction

```text
分析我提供的收據並只輸出有效 JSON，不要輸出 Markdown 或其他文字。
逐項辨識商品，保留 name_original，提供中文 name_normalized，並從以下類別
選擇 category：食品雜貨、餐飲、交通、日用品、家具家電、醫療、娛樂、房租、
保險、教育、旅行、其他。

輸出 merchant、expense_date（YYYY-MM-DD）、currency（三碼大寫）、
total_amount、items、adjustments、warnings。item 包含 name_original、
name_normalized、quantity、amount（該列總金額）、category、confidence（0 到 1）。
不要把 MwSt.、Rückgeld、gegeben 當成商品。Pfand、Rabatt、Coupon 放入
adjustments；Rabatt 和 Coupon 使用負數。無法辨識時保留 item、分類為其他，
並在 warnings 說明不確定之處。
```

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
| 7 | Implemented / Experimental | Dormant receipt image/PDF upload and attachments |
| 8 | Implemented / Experimental | Dormant receipt confirmation workflow |
| 9 | Current — awaiting acceptance | ChatGPT Paste Import Workflow |
| 10 | Planned | Itemized Expense Editing and Reporting |
| 11 | Planned | iPhone Shortcut Convenience Workflow |
| 12 | Planned | Authentication and user-based RLS |
| 13 | Planned | PWA |
| 14 | Planned | Production hardening |
| 15 | Planned | UI / UX polish |

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

- Receipt upload remains available as an experimental route but is hidden from
  the current primary Dashboard actions.
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
- The session and attachment code remains dormant and reusable without being
  expanded by the current paste-import workflow.

## Milestone 9 acceptance status

The ChatGPT Paste Import code and hosted migration are implemented, but Milestone
9 is not marked Completed. Local tests passed for itemized and manual creation,
RPC concurrency idempotency, transaction rollback, RLS reads/writes, positive and
negative adjustments, itemized detail display, clipboard paste, Dashboard
category allocation without double counting, cascade cleanup, and a 390 px
viewport. Vercel deployment and production acceptance are still required. Full
editing of stored itemized expenses is deferred to Milestone 10.
