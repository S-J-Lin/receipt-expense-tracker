# JSON import repair acceptance — 2026-10-08

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
