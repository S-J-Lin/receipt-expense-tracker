# Changelog

All notable project changes are recorded here.

## Unreleased

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
  plan. Milestone 8 remains Current pending migration and production acceptance.
- Applied the hosted Supabase migration and passed local acceptance for PNG,
  JPEG replacement, HEIC, PDF, refresh persistence, idempotent double-submit,
  cancellation, and Storage cleanup. Production acceptance is still pending.

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
