# Changelog

All notable project changes are recorded here.

## Unreleased

No unreleased changes.

## Released

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
