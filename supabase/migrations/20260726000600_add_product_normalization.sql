-- Milestone 10: product normalization, item editing, search and analytics.

alter table public.expense_items
  add column if not exists english_name text null,
  add column if not exists brand text not null default 'N/A',
  add column if not exists product_group text null,
  add column if not exists unit text null,
  add column if not exists unit_quantity numeric(12, 3) null,
  add column if not exists notes text null;

update public.expense_items set brand = 'N/A' where brand is null or trim(brand) = '';
alter table public.expense_items alter column brand set default 'N/A';
alter table public.expense_items alter column brand set not null;

alter table public.expenses
  add column if not exists last_item_edit_idempotency_key uuid null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expense_items_unit_quantity_check') then
    alter table public.expense_items add constraint expense_items_unit_quantity_check
      check (unit_quantity is null or unit_quantity > 0);
  end if;
end $$;

create index if not exists expense_items_name_normalized_idx on public.expense_items (lower(name_normalized));
create index if not exists expense_items_brand_idx on public.expense_items (lower(brand));
create index if not exists expense_items_product_group_idx on public.expense_items (lower(product_group));

create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null check (char_length(trim(alias)) > 0),
  alias_normalized text generated always as (
    lower(regexp_replace(trim(alias), '[[:space:]]+', ' ', 'g'))
  ) stored,
  normalized_name text not null check (char_length(trim(normalized_name)) > 0),
  product_group text null,
  category text null check (category is null or category in (
    '食品雜貨', '餐飲', '交通', '日用品', '家具家電', '醫療',
    '娛樂', '房租', '保險', '教育', '旅行', '其他'
  )),
  brand text not null default 'N/A',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_aliases_alias_normalized_idx
  on public.product_aliases (alias_normalized);
create index if not exists product_aliases_normalized_name_idx
  on public.product_aliases (lower(normalized_name));

drop trigger if exists product_aliases_set_updated_at on public.product_aliases;
create trigger product_aliases_set_updated_at before update on public.product_aliases
for each row execute function public.set_updated_at();

alter table public.product_aliases enable row level security;
grant select, insert, update, delete on public.product_aliases to anon, authenticated;
drop policy if exists "MVP public read product aliases" on public.product_aliases;
create policy "MVP public read product aliases" on public.product_aliases for select to anon, authenticated using (true);
drop policy if exists "MVP public insert product aliases" on public.product_aliases;
create policy "MVP public insert product aliases" on public.product_aliases for insert to anon, authenticated with check (true);
drop policy if exists "MVP public update product aliases" on public.product_aliases;
create policy "MVP public update product aliases" on public.product_aliases for update to anon, authenticated using (true) with check (true);
drop policy if exists "MVP public delete product aliases" on public.product_aliases;
create policy "MVP public delete product aliases" on public.product_aliases for delete to anon, authenticated using (true);

create or replace function public.update_itemized_expense(
  p_expense_id uuid, p_idempotency_key uuid, p_merchant text, p_expense_date date,
  p_currency varchar, p_total_amount numeric, p_category text,
  p_payment_method text, p_notes text, p_items jsonb, p_adjustments jsonb
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare v_expense public.expenses%rowtype;
begin
  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'expense_not_found'; end if;
  if v_expense.last_item_edit_idempotency_key = p_idempotency_key then return p_expense_id; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'items_must_be_array'; end if;
  if jsonb_typeof(p_adjustments) <> 'array' then raise exception 'adjustments_must_be_array'; end if;

  update public.expenses set merchant = trim(p_merchant), expense_date = p_expense_date,
    currency = upper(p_currency), amount = p_total_amount, category = p_category,
    payment_method = nullif(trim(p_payment_method), ''), notes = nullif(trim(p_notes), ''),
    last_item_edit_idempotency_key = p_idempotency_key
  where id = p_expense_id;

  delete from public.expense_items where expense_id = p_expense_id;
  delete from public.expense_adjustments where expense_id = p_expense_id;

  insert into public.expense_items (
    expense_id, name_original, name_normalized, english_name, brand, product_group, quantity,
    amount, category, confidence, unit, unit_quantity, notes
  )
  select p_expense_id, nullif(trim(item.name_original), ''),
    nullif(trim(item.name_normalized), ''), nullif(trim(item.english_name), ''),
    coalesce(nullif(trim(item.brand), ''), 'N/A'),
    nullif(trim(item.product_group), ''), item.quantity, item.amount, item.category,
    item.confidence, nullif(trim(item.unit), ''), item.unit_quantity,
    nullif(trim(item.notes), '')
  from jsonb_to_recordset(p_items) as item(
    name_original text, name_normalized text, english_name text, brand text, product_group text,
    quantity numeric, amount numeric, category text, confidence numeric,
    unit text, unit_quantity numeric, notes text
  );

  insert into public.expense_adjustments (expense_id, name, amount, category)
  select p_expense_id, trim(adjustment.name), adjustment.amount,
    coalesce(adjustment.category, '其他')
  from jsonb_to_recordset(p_adjustments) as adjustment(name text, amount numeric, category text);
  return p_expense_id;
end;
$$;

revoke all on function public.update_itemized_expense(uuid, uuid, text, date, varchar, numeric, text, text, text, jsonb, jsonb) from public;
grant execute on function public.update_itemized_expense(uuid, uuid, text, date, varchar, numeric, text, text, text, jsonb, jsonb) to anon, authenticated;

-- Extend the existing M9 import function without changing its signature.
create or replace function public.create_chatgpt_import(
  p_idempotency_key uuid, p_merchant text, p_expense_date date, p_currency varchar,
  p_total_amount numeric, p_category text, p_payment_method text, p_warnings jsonb,
  p_items jsonb, p_adjustments jsonb
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare v_expense_id uuid;
begin
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;
  if jsonb_typeof(p_warnings) <> 'array' or jsonb_typeof(p_items) <> 'array'
    or jsonb_typeof(p_adjustments) <> 'array' then raise exception 'json_arrays_required'; end if;
  if exists (select 1 from jsonb_array_elements(p_warnings) value where jsonb_typeof(value) <> 'string') then
    raise exception 'warnings_must_contain_strings';
  end if;
  insert into public.expenses (merchant, expense_date, amount, currency, category,
    payment_method, source, import_warnings, import_idempotency_key)
  values (trim(p_merchant), p_expense_date, p_total_amount, upper(p_currency), p_category,
    nullif(trim(p_payment_method), ''), 'chatgpt_import', p_warnings, p_idempotency_key)
  on conflict (import_idempotency_key) where import_idempotency_key is not null do nothing
  returning id into v_expense_id;
  if v_expense_id is null then
    select id into v_expense_id from public.expenses where import_idempotency_key = p_idempotency_key;
    if v_expense_id is null then raise exception 'idempotency_lookup_failed'; end if;
    return v_expense_id;
  end if;
  insert into public.expense_items (expense_id, name_original, name_normalized,
    english_name, brand, product_group, quantity, amount, category, confidence, unit, unit_quantity, notes)
  select v_expense_id, nullif(trim(item.name_original), ''), nullif(trim(item.name_normalized), ''),
    nullif(trim(item.english_name), ''), coalesce(nullif(trim(item.brand), ''), 'N/A'),
    nullif(trim(item.product_group), ''), item.quantity,
    item.amount, item.category, item.confidence, nullif(trim(item.unit), ''),
    item.unit_quantity, nullif(trim(item.notes), '')
  from jsonb_to_recordset(p_items) as item(name_original text, name_normalized text,
    english_name text, brand text, product_group text, quantity numeric, amount numeric, category text,
    confidence numeric, unit text, unit_quantity numeric, notes text);
  insert into public.expense_adjustments (expense_id, name, amount, category)
  select v_expense_id, trim(a.name), a.amount, coalesce(a.category, '其他')
  from jsonb_to_recordset(p_adjustments) as a(name text, amount numeric, category text);
  return v_expense_id;
end;
$$;

comment on table public.product_aliases is 'User-confirmed multilingual product name mappings; temporary anonymous MVP RLS applies.';
comment on column public.expense_items.name_original is 'Immutable-by-convention receipt text; only changed by explicit user editing.';
comment on column public.expense_items.name_normalized is 'User-readable product kind shared across brands and languages.';
comment on column public.expense_items.english_name is 'Optional generic English product name; legacy imports may omit it.';
comment on column public.expense_items.brand is 'Required brand string; use N/A when unknown.';
comment on column public.expense_items.product_group is 'More specific grouping than expenses.category.';

-- Temporary anonymous policies remain an MVP-only risk. Milestone 13 hardening
-- must replace them before multi-user use; no service-role key is used here.
