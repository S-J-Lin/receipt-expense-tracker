# Receipt Tracker Database Design

This document describes the Milestone 11 unified data model. PostgreSQL numeric values
store money; application statistics convert money to integer cents before sums.
RLS remains enabled. Current anonymous CRUD policies are temporary personal-MVP
infrastructure and must not be treated as a multi-user authorization model.

## Relationship Overview

```text
expenses (one receipt / transaction)
  ├── expense_items (zero to many product lines)
  └── expense_adjustments (zero to many deposits, fees, discounts)

product_aliases (independent user-confirmed normalization dictionary)
  alias ──maps to──> normalized_name / product_group / category / brand
```

Deleting an expense cascades to its items and adjustments. Aliases remain
independent because they are reusable knowledge, not children of one purchase.

## `expenses`

The transaction header and accounting source of truth:

- merchant, purchase date, final amount, currency, broad category
- payment method and notes
- receipt attachment references retained from experimental M7/M8
- `source`: manual, ChatGPT import, or receipt upload
- import warnings and import idempotency key
- item-edit idempotency key added by M10
- internal manual-creation idempotency key added by M11; never exported

`expenses.amount` is always the authoritative total expenditure. Item lines do
not replace it because receipt rounding, unreadable lines, and adjustments can
make item sums differ from the final paid total.

## `expense_items`

Product lines belonging to an expense:

- `name_original`: receipt wording, preserved unless the user explicitly edits it
- `name_normalized`: stable product kind used across languages and brands
- `english_name`: optional generic English product name for backward compatibility
- `brand`: required non-null brand string separated from the product kind; `N/A` when unknown
- `product_group`: grouping more specific than the expense category
- quantity and non-negative line-total amount
- broad category and optional recognition confidence
- unit, positive unit quantity, and item notes
- created and updated timestamps

The table intentionally stores both original and normalized names. This keeps an
audit-friendly receipt representation while enabling useful long-term search.

## `expense_adjustments`

Non-product amounts belonging to an expense:

- positive values: Pfand or other fees
- negative values: Rabatt, Coupon, or other discounts
- a broad category, normally `其他`

Adjustments are separate from items because their sign rules and meaning differ,
and because they do not need brand, quantity, unit, or product normalization.

## `product_aliases`

Reusable mappings created only with explicit user consent:

- raw display alias
- generated `alias_normalized`, using trimmed/collapsed whitespace and lowercase
- normalized product name
- optional product group and category
- required non-null brand, using `N/A` when unknown
- timestamps

`alias_normalized` has a unique index, so `Dish Soap`, `dish soap`, and repeated
spaces cannot create separate duplicate aliases. Multiple distinct aliases may
map to the same normalized product.

## Atomic Editing and Idempotency

`update_itemized_expense` locks the expense row, updates its header, deletes the
old items/adjustments, and inserts the complete new arrays in one PostgreSQL
transaction. A constraint failure rolls back every change. A UUID stored in
`last_item_edit_idempotency_key` makes repeated submission return the same
expense without applying the replacement twice.

Alias saving deliberately runs after the main transaction. An alias error is
reported separately and cannot roll back a successfully saved expense. A
conflicting existing mapping requires explicit overwrite confirmation.

`create_manual_expense` creates the expense header, optional items, and optional
adjustments in one transaction. Any insert or constraint failure rolls back the
entire operation. Reusing its UUID returns the existing expense instead of
duplicating rows. Manual item omissions are normalized at validation and again
at the database boundary for defense in depth.

## Unified Sources and Export

Manual entry and ChatGPT import both write `expenses`, `expense_items`, and
`expense_adjustments`. Only `expenses.source` differs. Export Center reads this
same graph, applies expense-date and metadata filters, then uses allowlists to
produce expenses CSV, item/adjustment CSV, full backup JSON, or a ChatGPT
analysis bundle. Missing legacy item metadata is represented in the export only
with `N/A`, `其他`, or numeric defaults; old rows are not rewritten.
An expense without actual item rows exports `items=[]`; placeholder items are
never synthesized. Analysis bundles reconcile item plus signed-adjustment cents
against expense cents and add warnings for differences greater than 0.01.

## Dashboard Double-Counting Rule

- Total and daily expenditure: always sum `expenses.amount` once.
- Itemized category allocation: sum item and adjustment amounts by their category.
- Non-itemized/manual category allocation: use `expenses.category` and amount.
- Never add both an itemized expense total and its item amounts to category totals.

This preserves accounting totals while allowing mixed-category receipts to be
represented accurately.

## Product Normalization Flow

1. Keep supplied `name_normalized` when present.
2. Otherwise normalize `name_original` for exact alias lookup.
3. Apply only an exact confirmed alias mapping.
4. Do not automatically choose among partial/multiple matches.
5. If no alias exists, use the original name as the normalized fallback.
6. The user may correct the result in the item editor.

No OpenAI API or external AI service participates in this flow.

## Alias Flow

1. User edits original and normalized names.
2. User explicitly checks “記住這個名稱對應”.
3. Main expense transaction completes first.
4. The application normalizes and looks up the alias.
5. Missing alias: insert it.
6. Same mapping: update optional metadata safely.
7. Different mapping: display the current mapping and request explicit overwrite.
8. Alias failure: show a warning while keeping the expense save successful.

## Search Flow

`/items` loads accessible item, expense-header, and alias rows through the public
Supabase client and temporary RLS policies. It joins item rows to merchant, date,
and currency in the server data layer, then searches:

- original name
- normalized name
- brand
- product group
- alias and the alias target normalized name

Date range, merchant, brand, product group, and category filters are applied
before rendering. Product-group routes redirect to the same analysis engine with
the group filter, preventing a second implementation from drifting.

## Statistics Flow

The application converts every item line amount to integer cents, then computes:

- total expenditure and purchase count
- rounded average per purchase
- minimum and maximum line price
- latest purchase date
- normalized-product, brand, merchant, and monthly breakdowns

These product statistics use item amounts only and are intentionally separate
from the main Dashboard’s authoritative expense totals. An item’s `amount` is the
line total; quantity is descriptive and is not multiplied again.

## Security and Future Work

No service-role key is used. Anonymous CRUD policies exist only for the personal
MVP. Authentication and user-owned RLS are Deferred. Production hardening must
replace these policies before multi-user or broadly shared use, and large data
volumes should move search/aggregation from in-process filtering to indexed SQL
queries or dedicated RPCs.

## Backup Restore

M12 adds `backup_restore_runs`, an internal RLS-enabled table with no direct
anonymous access. Its unique restore key stores the final report so duplicate
submits are idempotent. The narrowly granted `restore_receipt_tracker_backup`
SECURITY DEFINER RPC fixes `search_path`, validates version, mode, structure,
size, and forbidden fields, and touches only ledger tables plus its run table.

Skip inserts only unique expenses. Merge keeps existing headers and fills a
child collection only when that collection is empty. Replace deletes expenses
and aliases only after exact `RESTORE` confirmation, then restores the backup.
Any failure rolls the whole function back. Children always use the resolved
expense ID, preventing orphan records.
