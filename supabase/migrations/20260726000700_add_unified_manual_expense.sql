-- Milestone 11: atomic manual creation using the unified expense/item/adjustment model.

alter table public.expenses
  add column if not exists creation_idempotency_key uuid null;

create unique index if not exists expenses_creation_idempotency_key_idx
  on public.expenses (creation_idempotency_key)
  where creation_idempotency_key is not null;

create or replace function public.create_manual_expense(
  p_idempotency_key uuid, p_merchant text, p_expense_date date, p_currency varchar,
  p_total_amount numeric, p_category text, p_payment_method text, p_notes text,
  p_items jsonb, p_adjustments jsonb
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare v_expense_id uuid;
begin
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_typeof(p_adjustments) <> 'array' then
    raise exception 'items_and_adjustments_must_be_arrays';
  end if;

  insert into public.expenses (
    merchant, expense_date, amount, currency, category, payment_method, notes,
    source, creation_idempotency_key
  ) values (
    trim(p_merchant), p_expense_date, p_total_amount, upper(p_currency), p_category,
    nullif(trim(p_payment_method), ''), nullif(trim(p_notes), ''), 'manual', p_idempotency_key
  )
  on conflict (creation_idempotency_key) where creation_idempotency_key is not null do nothing
  returning id into v_expense_id;

  if v_expense_id is null then
    select id into v_expense_id from public.expenses where creation_idempotency_key = p_idempotency_key;
    if v_expense_id is null then raise exception 'idempotency_lookup_failed'; end if;
    return v_expense_id;
  end if;

  insert into public.expense_items (
    expense_id, name_original, name_normalized, english_name, brand, product_group,
    category, quantity, amount, confidence, notes, unit, unit_quantity
  )
  select v_expense_id,
    coalesce(nullif(trim(item.name_original), ''), 'N/A'),
    coalesce(nullif(trim(item.name_normalized), ''), 'N/A'),
    coalesce(nullif(trim(item.english_name), ''), 'N/A'),
    coalesce(nullif(trim(item.brand), ''), 'N/A'),
    coalesce(nullif(trim(item.product_group), ''), '其他'),
    coalesce(item.category, p_category, '其他'),
    coalesce(item.quantity, 1), item.amount, coalesce(item.confidence, 1),
    coalesce(item.notes, ''), coalesce(nullif(trim(item.unit), ''), 'N/A'),
    coalesce(item.unit_quantity, 1)
  from jsonb_to_recordset(p_items) as item(
    name_original text, name_normalized text, english_name text, brand text,
    product_group text, category text, quantity numeric, amount numeric,
    confidence numeric, notes text, unit text, unit_quantity numeric
  );

  insert into public.expense_adjustments (expense_id, name, amount, category)
  select v_expense_id, trim(adjustment.name), adjustment.amount,
    coalesce(adjustment.category, p_category, '其他')
  from jsonb_to_recordset(p_adjustments) as adjustment(name text, amount numeric, category text);

  return v_expense_id;
end;
$$;

revoke all on function public.create_manual_expense(uuid, text, date, varchar, numeric, text, text, text, jsonb, jsonb) from public;
grant execute on function public.create_manual_expense(uuid, text, date, varchar, numeric, text, text, text, jsonb, jsonb) to anon, authenticated;

comment on column public.expenses.creation_idempotency_key is
  'Internal duplicate-submit protection for atomic manual creation; excluded from exports.';
