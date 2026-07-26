# Changelog

All notable project changes are recorded here.

## Unreleased

### Milestone 13 — iPhone / PWA Experience (awaiting acceptance)

- Added an installable standalone manifest, complete icon set, Apple Web App
  metadata, viewport-fit cover, and iPhone safe-area layout.
- Added touch-friendly mobile navigation, a privacy-safe shell-only service
  worker, offline fallback and submission guards, clipboard fallback, and
  friendly loading/error/404 states.
- Added iPhone installation, update and acceptance documentation plus regression
  tests. No migration or environment variable was added.
- Added the fixed final Dark Theme token system, reduced shadows and radii,
  consistent line icons, subtle motion, and a replaceable HH211 Outflow
  background component with a high-opacity reading overlay.
- Made the single mobile navigation permanently viewport-fixed with centralized
  height/safe-area content spacing, keyboard-focus avoidance, exact active-route
  matching, and removal of duplicate Dashboard action buttons.

### Milestone 12 — Backup Restore and Data Portability (awaiting acceptance)

- Added `/import/backup` with 25 MB JSON selection/drop, local and server Zod
  validation, version compatibility, unsafe-key rejection, and read-only preview.
- Added exact/probable/unique expense classification, alias conflict reporting,
  missing Storage attachment warnings, and Skip/Merge/Replace all controls.
- Added a fixed-search-path atomic restore RPC, destructive confirmation,
  idempotent restore reports, relationship-safe inserts, and rollback behavior.
- Added portability documentation and regression coverage. Migration and formal
  environment acceptance remain pending.

### Milestone 11 — Unified Data Model and Export Center

- Unified quick manual creation with optional item and adjustment arrays through
  an atomic, idempotent RLS-respecting PostgreSQL RPC.
- Added manual item compatibility defaults, signed adjustment support, and an
  explicit total-difference confirmation without changing authoritative totals.
- Added `/export` with date and metadata filters, preview counts, four explicit
  download formats, CSV BOM/escaping, versioned JSON, and allowlist-based secret
  exclusion.
- Added the canonical ChatGPT analysis guide, architecture documentation, M11
  migration, and regression coverage. Migration and production acceptance
  completed; no new environment variable or third-party upload was added.
- Kept header-only manual expenses as `items=[]` and added cents-safe purchase
  reconciliation, mismatch warnings, and reconciled/unreconciled summary counts.

### Milestone 10 — Product Normalization, Item Editing, Search and Analytics

- Added optional generic English names plus required non-null brands (`N/A` when
  unknown), product groups, units, unit quantities, and notes to itemized
  expenses while preserving old JSON without `english_name` or `brand`.
- Added multilingual product aliases with normalized unique keys, explicit user
  opt-in, conflict confirmation, and best-effort saving separate from the main
  expense transaction.
- Added atomic idempotent editing of expense basics, items, and adjustments with
  total-difference warnings and Dashboard revalidation.
- Added `/items` search across original/normalized names, brands, product groups,
  and aliases with date and field filters, cents-based summary statistics,
  brand/store/product/month breakdowns, and product-group routing.
- Added the M10 migration, typed database contracts, updated ChatGPT Project
  instructions, and unit coverage. Migration, deployment, and production schema
  acceptance passed; no OpenAI API, Auth, or service-role key was added.

### Milestone 9 — ChatGPT Paste Import Workflow

- Replaced the uncommitted direct OpenAI API experiment with a local paste,
  parse, Zod validation, editable preview, and explicit confirmation flow.
- Added itemized expenses, positive/negative adjustments, persisted warnings,
  source metadata, temporary MVP RLS policies, and an atomic idempotent import
  RPC in a new migration.
- Updated Dashboard category calculations to use item and adjustment categories
  without double counting the expense total.
- Added itemized expense detail display; post-save item editing remains deferred
  to Milestone 10.
- Kept all committed Milestone 7/8 routes, migrations, Storage, attachments, and
  data while removing receipt upload from the primary Dashboard flow.
- Applied the hosted migration and passed local RPC concurrency idempotency,
  transaction rollback, RLS CRUD, itemized/manual UI, clipboard, Dashboard
  allocation, 390 px layout, and cascade cleanup acceptance.
- Deployed commit `13e6744` through Vercel and passed production itemized import,
  warning/detail display, positive and negative adjustments, Dashboard category
  allocation without double counting, manual-entry compatibility, and cleanup
  acceptance. All dedicated production test data was removed.

## Released

### Milestone 8 — Receipt Confirmation Workflow

- Added durable 24-hour receipt upload sessions with RLS, revoked direct table
  access, and HttpOnly capability-token authorization through scoped RPCs.
- Added a dedicated refresh-safe confirmation route with private signed receipt
  previews, shared Zod field validation, replace, cancel, and cleanup controls.
- Added idempotent transactional confirmation so repeated requests create
  exactly one expense and mark the session completed.
- Removed receipt paths from expense-creation URLs and kept manual expense entry
  independent from the upload workflow.
- Documented expired-session cleanup debt, non-atomic Storage cleanup, the
  temporary anonymous security model, and the Milestone 9 OpenAI integration
  plan.
- Applied the hosted Supabase migration and passed local acceptance for PNG,
  JPEG replacement, HEIC, PDF, refresh persistence, idempotent double-submit,
  cancellation, and Storage cleanup.
- Deployed commit `90f54c1` through Vercel and passed production upload,
  refresh, signed preview, idempotent confirmation, expense creation, and delete
  cleanup acceptance. All dedicated acceptance data and objects were removed.

### Milestone 7 — Receipt Image Upload

- Added a private Supabase Storage migration for JPEG, PNG, HEIC, HEIF, and PDF
  receipts with a 10 MB bucket limit and temporary anonymous MVP policies.
- Added mobile camera/file selection, local preview, metadata, validation,
  disabled upload state, and understandable upload errors.
- Added server-side MIME, extension, size, and file-signature validation.
- Added unique non-overwriting receipt paths and short-lived signed URL previews.
- Integrated receipt attachments with expense creation, detail, edit,
  replacement, list indicators, and deletion cleanup.
- Added a Dashboard upload entry and accessible Dashboard navigation through the
  shared brand link.
- Documented anonymous Storage risks and orphan-file transaction limitations.

- Applied the Supabase migration and passed local and Vercel production testing
  for JPEG, PNG, PDF, signed previews, replacement, and Storage cleanup.
- Completed the iPhone upload-flow acceptance and removed all dedicated test
  expenses and their Storage objects.

### Milestone 6 — Production Deployment and Always-Online Baseline

- Prepared the Next.js App Router application for Vercel deployment.
- Removed the service-role Supabase client and administrator secret requirement.
- Routed CRUD operations through the Supabase publishable key and RLS.
- Added an idempotent migration for temporary anonymous INSERT, UPDATE, and
  DELETE policies while keeping RLS enabled.
- Reduced `.env.example` to blank public Supabase placeholders.
- Documented GitHub/Vercel deployment, automatic redeployment, security risks,
  production verification, and the Milestone 0–14 roadmap.
- Recorded the dependency-audit risk without forcing major or breaking upgrades.

- Deployed to <https://receipt-expense-tracker-eight.vercel.app> and passed HTTPS,
  iPhone mobile-network, and production CRUD validation.
