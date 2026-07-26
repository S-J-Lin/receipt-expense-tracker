# Backup Restore and Data Portability

Milestone 12 restores Receipt Tracker Full Backup JSON while preserving expense,
item, adjustment, and alias relationships. It does not restore receipt image
objects and does not use a service-role key.

## Create and Restore a Backup

1. Open `/export`, download **JSON — Full Backup**, and keep it private.
2. Open `/import/backup`, choose or drop the JSON file, and wait for validation.
3. Review version, dates, counts, currencies, duplicates, conflicts, attachment
   warnings, current ledger size, and estimated restore size.
4. Choose Skip duplicates, Merge, or Replace all, then confirm restore.
5. Download the resulting import report.

Selection and preview never modify data. JSON is parsed with `JSON.parse` and
Zod; it is never executed. Files are limited to 25 MB. Prototype-pollution keys,
signed URLs, sessions, credentials, and idempotency keys are rejected.

## Restore Modes

- **Skip duplicates** is the default. Existing-ID and matching-header records are
  skipped; unique expenses retain their backup UUID.
- **Merge** keeps existing headers and user edits. It fills backup items only
  when the matched expense currently has no items, and adjustments only when it
  has no adjustments. Alias conflicts are reported, never overwritten.
- **Replace all** deletes current expenses, cascading details, and aliases inside
  the transaction, then restores the backup. It requires a checkbox and exact
  `RESTORE` text. Failure rolls deletion and inserts back together.

## Duplicate Detection

Preview checks backup expense ID first, then merchant, date, cents amount,
currency, and source, then sorted item and adjustment signatures. Results are
exact duplicate, probable duplicate, or unique. M11 backups intentionally omit
import idempotency keys, so that tier is reserved for a future format that
defines a safe portability contract.

Aliases use trimmed, whitespace-collapsed, lowercase keys. Same targets are
duplicates; different normalized targets are visible conflicts.

## Version and Legacy Compatibility

Version `1.0` is supported. Another `1.x` version is parsed through the known
allowlist with a warning. Unknown major versions are rejected. Missing optional
legacy fields receive export-compatible defaults; missing item arrays remain
empty and never create placeholder rows.

## Receipt Images

A backup may retain `receipt_image_path`, but contains no image. Preview checks
whether each object name exists. A missing object does not fail restore: its path
is preserved and listed in the report. No image or fake signed URL is created.

## Atomicity and Reports

`restore_receipt_tracker_backup` performs all changes in one PostgreSQL
transaction with a fixed search path and an allowlisted payload. Any error rolls
everything back. A unique restore UUID makes retries return the first report
instead of importing twice.

Reports include imported expense/item/adjustment/alias counts, skipped and
merged records, conflicts, missing attachments, duration, mode, and restore key.

Create a Full Backup before large edits, before Replace all, and regularly.
Keep dated copies, prefer Skip, and use Replace only with a known-good backup.
