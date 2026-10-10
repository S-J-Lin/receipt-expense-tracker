# JSON import repair acceptance — 2026-10-08

Latest UX change (2026-10-10): the mandatory repair acknowledgement checkbox has been removed at the user's request. Earlier checkbox acceptance steps below are historical. Repairs still display their differences, and **確認儲存** remains the only write action. A detail/total mismatch greater than 0.01 still requires its separate checkbox; validation and authorization remain unchanged.

## Robustness update — 2026-10-10

Paste and local UTF-8 `.json` file input share one parser. File limit: 400 KB and 100,000 characters. No automatic save, AI upload or new migration.

- Explicit **嘗試修復 JSON** removes only allowlisted Markdown escapes from keys (`\_`, `\*`, brackets/braces) and structural bracket/brace delimiters. JSON strings are scanned separately. Legal `\\`, `\"`, `\n`, `\t`, `\uXXXX` are not removed. Allowlisted invalid escapes inside a value are encoded as a literal backslash, preserving the visible original text instead of guessing intended content. Other unknown escapes fail with a scanner location.
- Smart/full-width quotes and punctuation are normalized only as delimiters/structure; valid ASCII string contents stay opaque even when unrelated structure is malformed. Ambiguous punctuation remains an error, not guessed transaction data.
- Multiple adjacent objects under root `items` are wrapped only when every object is complete, duplicate-free, safe and individually accepted by the strict item schema. Root-level adjustments/warnings or objects containing unknown keys are never swallowed into items. Single objects still use the existing disclosed wrapper repair.
- Missing/null warnings or missing adjustments can become `[]` only with visible repair records; adjustment hints block empty defaults. Explicit missing items values never become an empty array: restore the missing data manually. Omitted items stays compatible with categorized simple expenses.
- Each repair shows a type, count and bounded before/after fragment. Original text remains editable; the repaired preview requires acknowledgement. Reconciliation uses cents; more than one cent difference requires separate acknowledgement and never changes amounts.
- Duplicate fields at any level remain refused, including money/date/quantity; no last-value-wins. Depth/size, pollution keys, strict schema, numeric/date/category validation and server validation/idempotency remain enabled.
- **複製錯誤資訊** copies type/location, at most 80 characters near the error and expected syntax, never the full receipt. A snippet may still be private; review before sharing. No production console logging of raw text.

Fixture: `src/lib/fixtures/dm-import.ts`; regressions: `src/lib/chatgpt-import-robustness.test.ts`. Six item amounts are 1.25, 1.50, 2.65, 1.25, 0.55, 0.95: sum 815 cents, original total 815 cents, discrepancy zero. Original names, notes, units and quantities are retained, and the repaired save payload validates.

### Limits and device acceptance

No auto-completion of truncated receipts, invented dates/products/payments/amounts, unknown-key deletion, decimal-comma guessing, array-hole filling or ambiguous structure repair. Reused idempotency keys protect retries within the current import identity, not independent imports after page reload.

On real iPhone Safari and standalone PWA: paste the Markdown fixture or select it from Files; first parse must show an error, then repair must show six items and €8.15. Inspect individual repairs and both full-text panels. Saving must remain disabled until acknowledgement; mismatch acknowledgement must be separate. Test a duplicated amount key, missing items and incomplete text: all must stay blocked with line/column/snippet. Use Copy error and verify it is not the full receipt. Deny clipboard access and use long-press paste. At 390px, expand long snippets, focus the last field and scroll to Save: no horizontal overflow, text at least 16px, buttons at least 44px, bottom navigation/safe-area intact. File preview alone does not write production data. Desktop viewport testing cannot certify physical iPhone behavior.

## Update (later on 2026-10-08)

- Errors are located by the app's own JSON scanner, so line/column and the
  nearby text appear on iPhone Safari too (its `JSON.parse` messages carry no
  position). The text around the problem is shown with a marker.
- Duplicate keys at any depth are rejected (no silent last-value-wins);
  nesting deeper than 16 levels is rejected.
- Repair additionally handles `"adjustments":` without a value (→ `[]` only
  when no Pfand/Rabatt/Coupon/discount/deposit hint exists), unquoted ASCII
  property names, and full-width trailing commas. The first repair pass treats
  smart-quoted strings as opaque, so brackets/commas inside names are never
  changed. Items are never invented.
- Amounts with more than two decimals are rejected instead of being rounded by
  the database.
- When items + adjustments differ from the total by more than 0.01, saving
  requires an explicit confirmation tied to that exact difference; the server
  enforces the same rule. A reused idempotency key with different content is
  reported as a conflict with a link to the existing record.
- Regression tests: `src/lib/chatgpt-import-regressions.test.ts` (including
  the reported dm receipt with `“warnings”: ,`, a single item object and an
  empty `“adjustments”:`).


No migration, RLS, owner authorization or server validation changes are needed.
Repair runs locally, retains the raw textarea input and enters the existing
human-confirmation form. A change list and original/repaired JSON are shown;
acknowledgement is required before saving. No eval or external repair service.

## Automated verification

- ESLint and TypeScript pass; 176 tests pass (39 parser tests).
- `npm run build` was attempted, but local Turbopack cannot bind its CSS worker
  port under the execution restrictions. `npm run build -- --webpack` passes.
- Regressions cover normal JSON, structural smart/full-width punctuation,
  Unicode inside names, missing/null warnings, missing adjustments, single
  objects, trailing commas, missing monetary facts, array holes, unsafe keys,
  unknown fields, null brands, and unchanged numeric/payment values.
- Save-flow contract checks keep owner authorization, server schema validation,
  RPC idempotency key and repair acknowledgement. This is not a live database
  duplicate-import test. Re-parsing unchanged input reuses the current key;
  deliberately new input or a page reload can create a new import identity.

## iPhone Safari and installed PWA acceptance (real-device check required)

1. Open `/import/chatgpt` after deployment; log in as owner. In an existing PWA,
   close/reopen and reload to obtain the latest version.
2. Paste a normal receipt JSON. Parse, inspect totals and cancel without saving.
3. Paste structural smart quotes/full-width colons and commas. Verify product
   text (including apostrophes and Unicode quotes) has not changed.
4. Change `warnings: []` to `warnings: ,` and use **嘗試修復 JSON**. Verify the
   change list says warnings were filled with `[]`; original text is preserved.
5. Change items and adjustments to single objects. Verify exactly one row each
   in preview, with unchanged amount/quantity, and inspect the repaired JSON.
6. Omit adjustments with no adjustment clues: verify the notification. Omit
   adjustments but include a Pfand/Rabatt/Coupon warning: verify repair refuses
   and asks for manual clarification instead of losing adjustment information.
7. Leave amount/date/quantity/name missing, use double commas or unsafe keys:
   verify the error and edit the original textarea. No data should be saved.
8. Before checking acknowledgement, **確認儲存** must be disabled. Check it only
   after reviewing every row and total. Back/reparse must preserve raw input.
9. At 390px, expand both JSON panels, scroll to the last item and checkbox;
   check there is no horizontal page overflow, keyboard input works and bottom
   navigation does not cover buttons. Repeat in installed standalone PWA.
10. With a disposable test receipt only, double-tap save: verify a single
    expense. Ask before permanently deleting any production test record.

Real iPhone Safari/standalone PWA cannot be certified by a desktop viewport
test alone. The importer intentionally rejects ambiguous or unsupported JSON;
it does not guess or silently rewrite financial facts.
