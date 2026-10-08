#!/usr/bin/env bash
# Runs the SQL regression tests against a DISPOSABLE local PostgreSQL database.
# Never point this at Supabase: it drops and recreates the target database.
#
#   PGHOST=/tmp PGPORT=5433 PGUSER=postgres scripts/test-sql.sh
#
# Order: Supabase stubs -> legacy expenses bootstrap (schema.sql lines 1-95)
# -> all historical migrations -> lockdown (owner UUID replaced by a synthetic
# test UUID in a temp copy; the repository file is not modified) -> new
# forward migrations -> tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${TEST_DB:-receipt_tracker_sql_test}"
if [[ "$DB" != *test* ]]; then echo "Refusing: database name must contain 'test'" >&2; exit 1; fi
PSQL=(psql -v ON_ERROR_STOP=1 -q)
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\"" -c "create database \"$DB\""
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/supabase-stubs.sql"
sed -n 1,95p "$ROOT/supabase/schema.sql" > "$TMP/base.sql"
"${PSQL[@]}" -d "$DB" -f "$TMP/base.sql"
for f in "$ROOT"/supabase/migrations/2026072*.sql; do "${PSQL[@]}" -d "$DB" -f "$f"; done
LOCK="$ROOT/supabase/migrations/20260926000100_single_user_private_lockdown.sql"
OWNER_LINE="$(sed -n 7p "$LOCK" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' || true)"
if [[ -n "$OWNER_LINE" ]]; then sed "7s/$OWNER_LINE/11111111-1111-4111-8111-111111111111/" "$LOCK" > "$TMP/lockdown.sql"; else cp "$LOCK" "$TMP/lockdown.sql"; fi
grep -q 'Allow public read during development' "$TMP/lockdown.sql" || sed -i 's/^drop policy if exists "MVP public read expenses" on public.expenses;/drop policy if exists "Allow public read during development" on public.expenses;\n&/' "$TMP/lockdown.sql"
"${PSQL[@]}" -d "$DB" -f "$TMP/lockdown.sql"
for f in "$ROOT"/supabase/migrations/20261*.sql; do "${PSQL[@]}" -d "$DB" -f "$f"; done
for t in "$ROOT"/supabase/tests/*.test.sql; do echo "== $(basename "$t")"; "${PSQL[@]}" -At -d "$DB" -f "$t" | grep -E '^T[0-9]+ '; done
"${PSQL[@]}" -d postgres -c "drop database if exists \"$DB\""
