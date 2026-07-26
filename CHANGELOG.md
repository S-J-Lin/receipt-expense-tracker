# Changelog

All notable project changes are recorded here.

## Unreleased

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

Milestone 6 remains unreleased until GitHub push, Vercel deployment, HTTPS access,
and iPhone mobile-network CRUD testing are complete.
