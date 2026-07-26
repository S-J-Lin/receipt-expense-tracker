-- Milestone 9: ChatGPT Paste Import Workflow.
-- Receipt Tracker parses pasted JSON; it never calls the OpenAI API.

alter table public.expenses
  add column if not exists source text not null default 'manual',
  add column if not exists import_warnings jsonb not null default '[]'::jsonb,
  add column if not exists import_idempotency_key uuid null;

update public.expenses
set source = 'receipt_upload'
where source = 'manual'
  and (receipt_image_path is not null or receipt_image_url is not null);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_source_check') then
    alter table public.expenses add constraint expenses_source_check
      check (source in ('manual', 'chatgpt_import', 'receipt_upload'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_import_warnings_array_check') then
    alter table public.expenses add constraint expenses_import_warnings_array_check
      check (jsonb_typeof(import_warnings) = 'array');
  end if;
end $$;

create unique index if not exists expenses_import_idempotency_key_idx
  on public.expenses (import_idempotency_key)
  where import_idempotency_key is not null;

create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  name_original text null,
  name_normalized text null,
  quantity numeric(12, 3) not null check (quantity > 0),
  amount numeric(12, 2) not null check (amount >= 0),
  category text not null check (category in (
    '食品雜貨', '餐飲', '交通', '日用品', '家具家電', '醫療',
    '娛樂', '房租', '保險', '教育', '旅行', '其他'
  )),
  confidence numeric null check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_items_name_check check (
    char_length(trim(coalesce(name_original, ''))) > 0
    or char_length(trim(coalesce(name_normalized, ''))) > 0
  )
);

create table if not exists public.expense_adjustments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  amount numeric(12, 2) not null,
  category text not null default '其他' check (category in (
    '食品雜貨', '餐飲', '交通', '日用品', '家具家電', '醫療',
    '娛樂', '房租', '保險', '教育', '旅行', '其他'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expense_items_expense_id_idx on public.expense_items (expense_id);
create index if not exists expense_adjustments_expense_id_idx on public.expense_adjustments (expense_id);

drop trigger if exists expense_items_set_updated_at on public.expense_items;
create trigger expense_items_set_updated_at before update on public.expense_items
for each row execute function public.set_updated_at();

drop trigger if exists expense_adjustments_set_updated_at on public.expense_adjustments;
create trigger expense_adjustments_set_updated_at before update on public.expense_adjustments
for each row execute function public.set_updated_at();

alter table public.expense_items enable row level security;
alter table public.expense_adjustments enable row level security;
grant select, insert, update, delete on public.expense_items to anon, authenticated;
grant select, insert, update, delete on public.expense_adjustments to anon, authenticated;

drop policy if exists "MVP public read expense items" on public.expense_items;
create policy "MVP public read expense items" on public.expense_items for select to anon, authenticated using (true);
drop policy if exists "MVP public insert expense items" on public.expense_items;
create policy "MVP public insert expense items" on public.expense_items for insert to anon, authenticated with check (true);
drop policy if exists "MVP public update expense items" on public.expense_items;
create policy "MVP public update expense items" on public.expense_items for update to anon, authenticated using (true) with check (true);
drop policy if exists "MVP public delete expense items" on public.expense_items;
create policy "MVP public delete expense items" on public.expense_items for delete to anon, authenticated using (true);

drop policy if exists "MVP public read expense adjustments" on public.expense_adjustments;
create policy "MVP public read expense adjustments" on public.expense_adjustments for select to anon, authenticated using (true);
drop policy if exists "MVP public insert expense adjustments" on public.expense_adjustments;
create policy "MVP public insert expense adjustments" on public.expense_adjustments for insert to anon, authenticated with check (true);
drop policy if exists "MVP public update expense adjustments" on public.expense_adjustments;
create policy "MVP public update expense adjustments" on public.expense_adjustments for update to anon, authenticated using (true) with check (true);
drop policy if exists "MVP public delete expense adjustments" on public.expense_adjustments;
create policy "MVP public delete expense adjustments" on public.expense_adjustments for delete to anon, authenticated using (true);

create or replace function public.create_chatgpt_import(
  p_idempotency_key uuid,
  p_merchant text,
  p_expense_date date,
  p_currency varchar,
  p_total_amount numeric,
  p_category text,
  p_payment_method text,
  p_warnings jsonb,
  p_items jsonb,
  p_adjustments jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_created boolean := false;
begin
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;
  if jsonb_typeof(p_warnings) <> 'array' then raise exception 'warnings_must_be_array'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'items_must_be_array'; end if;
  if jsonb_typeof(p_adjustments) <> 'array' then raise exception 'adjustments_must_be_array'; end if;
  if exists (select 1 from jsonb_array_elements(p_warnings) value where jsonb_typeof(value) <> 'string') then
    raise exception 'warnings_must_contain_strings';
  end if;

  insert into public.expenses (
    merchant, expense_date, amount, currency, category, payment_method,
    source, import_warnings, import_idempotency_key
  ) values (
    trim(p_merchant), p_expense_date, p_total_amount, upper(p_currency), p_category,
    nullif(trim(p_payment_method), ''), 'chatgpt_import', p_warnings, p_idempotency_key
  )
  on conflict (import_idempotency_key) where import_idempotency_key is not null do nothing
  returning id into v_expense_id;

  if v_expense_id is null then
    select id into v_expense_id from public.expenses where import_idempotency_key = p_idempotency_key;
    if v_expense_id is null then raise exception 'idempotency_lookup_failed'; end if;
    return v_expense_id;
  end if;
  v_created := true;

  if v_created then
    insert into public.expense_items (
      expense_id, name_original, name_normalized, quantity, amount, category, confidence
    )
    select v_expense_id, nullif(trim(item.name_original), ''), nullif(trim(item.name_normalized), ''),
      item.quantity, item.amount, item.category, item.confidence
    from jsonb_to_recordset(p_items) as item(
      name_original text, name_normalized text, quantity numeric,
      amount numeric, category text, confidence numeric
    );

    insert into public.expense_adjustments (expense_id, name, amount, category)
    select v_expense_id, trim(adjustment.name), adjustment.amount, coalesce(adjustment.category, '其他')
    from jsonb_to_recordset(p_adjustments) as adjustment(name text, amount numeric, category text);
  end if;
  return v_expense_id;
end;
$$;

revoke all on function public.create_chatgpt_import(uuid, text, date, varchar, numeric, text, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.create_chatgpt_import(uuid, text, date, varchar, numeric, text, text, jsonb, jsonb, jsonb) to anon, authenticated;

-- These CRUD policies are for the anonymous MVP only. Milestone 12 must replace
-- them with user-based RLS before the application is shared with multiple users.
