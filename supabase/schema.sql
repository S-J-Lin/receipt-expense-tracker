create extension if not exists pgcrypto;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  merchant text not null check (char_length(trim(merchant)) > 0),
  expense_date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency varchar(3) not null default 'EUR' check (currency = upper(currency)),
  category text not null check (
    category in (
      '食品雜貨', '餐飲', '交通', '日用品', '家具家電', '醫療',
      '娛樂', '房租', '保險', '教育', '旅行', '其他'
    )
  ),
  payment_method text null,
  receipt_image_url text null,
  receipt_image_path text null,
  raw_receipt_text text null,
  ai_confidence numeric null check (
    ai_confidence is null or ai_confidence between 0 and 1
  ),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_expense_date_idx
  on public.expenses (expense_date desc, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

-- MVP development policy: the publishable key may read test expenses so the
-- dashboard can be exercised before authentication is introduced.
alter table public.expenses enable row level security;

grant select on table public.expenses to anon, authenticated;

drop policy if exists "MVP public read expenses" on public.expenses;
create policy "MVP public read expenses"
on public.expenses
for select
to anon, authenticated
using (true);

-- Development-only anonymous CRUD policies for the pre-authentication MVP.
-- These policies keep RLS enabled and allow the Vercel app to write with the
-- publishable key. They must be replaced by user-based policies in Milestone 12.
grant insert, update, delete on table public.expenses to anon, authenticated;

drop policy if exists "MVP public insert expenses" on public.expenses;
create policy "MVP public insert expenses"
on public.expenses
for insert
to anon, authenticated
with check (true);

drop policy if exists "MVP public update expenses" on public.expenses;
create policy "MVP public update expenses"
on public.expenses
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "MVP public delete expenses" on public.expenses;
create policy "MVP public delete expenses"
on public.expenses
for delete
to anon, authenticated
using (true);

-- Milestone 9 schema is kept in sync by the idempotent migration below.
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


-- These public policies are temporary. Anyone with the project URL and
-- publishable key can access all expense rows. Use only non-sensitive MVP data.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "MVP anonymous receipt uploads" on storage.objects;
create policy "MVP anonymous receipt uploads"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = 'anonymous'
);

drop policy if exists "MVP anonymous receipt reads" on storage.objects;
create policy "MVP anonymous receipt reads"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = 'anonymous'
);

drop policy if exists "MVP anonymous receipt deletes" on storage.objects;
create policy "MVP anonymous receipt deletes"
on storage.objects for delete to anon, authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = 'anonymous'
);

-- The private bucket and anonymous policies are temporary MVP infrastructure.
-- Uploads use unique names with upsert disabled, and there is no UPDATE policy.

insert into public.expenses (
  merchant,
  expense_date,
  amount,
  currency,
  category,
  payment_method,
  notes
)
values (
  'REWE',
  '2026-07-26',
  23.47,
  'EUR',
  '食品雜貨',
  'Wise',
  'Milestone 2 test expense'
);

-- Milestone 8: durable receipt confirmation sessions.
-- Anonymous callers never receive direct table privileges. Scoped RPCs require
-- both the session UUID and a SHA-256 capability-token hash stored in an
-- HttpOnly cookie by the application.

create table if not exists public.receipt_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  receipt_image_path text not null check (
    receipt_image_path ~ '^anonymous/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}-[0-9]{13}\.(jpg|jpeg|png|heic|heif|pdf)$'
  ),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  merchant text null,
  expense_date date null,
  amount numeric(12, 2) null check (amount is null or amount > 0),
  currency varchar(3) null check (currency is null or currency = upper(currency)),
  category text null check (
    category is null or category in (
      '食品雜貨', '餐飲', '交通', '日用品', '家具家電', '醫療',
      '娛樂', '房租', '保險', '教育', '旅行', '其他'
    )
  ),
  payment_method text null,
  notes text null,
  analysis_status text not null default 'not_requested',
  analysis_warnings jsonb not null default '[]'::jsonb,
  expense_id uuid null unique references public.expenses(id) on delete set null,
  access_token_hash text not null check (access_token_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists receipt_upload_sessions_expires_at_idx
  on public.receipt_upload_sessions (expires_at)
  where status = 'pending';

alter table public.receipt_upload_sessions enable row level security;
revoke all on table public.receipt_upload_sessions from anon, authenticated;

create or replace function public.create_receipt_upload_session(
  p_receipt_image_path text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_access_token_hash text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.receipt_upload_sessions (
    receipt_image_path, original_filename, mime_type, size_bytes, access_token_hash
  ) values (
    p_receipt_image_path, p_original_filename, p_mime_type, p_size_bytes, p_access_token_hash
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_receipt_upload_session(
  p_session_id uuid,
  p_access_token_hash text
) returns table (
  id uuid, receipt_image_path text, original_filename text, mime_type text,
  size_bytes bigint, status text, expires_at timestamptz, created_at timestamptz,
  updated_at timestamptz, merchant text, expense_date date, amount numeric,
  currency varchar, category text, payment_method text, notes text,
  analysis_status text, analysis_warnings jsonb, expense_id uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.receipt_image_path, s.original_filename, s.mime_type,
    s.size_bytes, s.status, s.expires_at, s.created_at, s.updated_at,
    s.merchant, s.expense_date, s.amount, s.currency, s.category,
    s.payment_method, s.notes, s.analysis_status, s.analysis_warnings,
    s.expense_id
  from public.receipt_upload_sessions s
  where s.id = p_session_id and s.access_token_hash = p_access_token_hash;
$$;

create or replace function public.confirm_receipt_upload_session(
  p_session_id uuid,
  p_access_token_hash text,
  p_merchant text,
  p_expense_date date,
  p_amount numeric,
  p_currency varchar,
  p_category text,
  p_payment_method text,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_session public.receipt_upload_sessions%rowtype;
declare v_expense_id uuid;
begin
  select * into v_session
  from public.receipt_upload_sessions
  where id = p_session_id and access_token_hash = p_access_token_hash
  for update;

  if not found then raise exception 'receipt_session_not_found'; end if;
  if v_session.status = 'completed' and v_session.expense_id is not null then
    return v_session.expense_id;
  end if;
  if v_session.status <> 'pending' then raise exception 'receipt_session_unavailable'; end if;
  if v_session.expires_at <= now() then raise exception 'receipt_session_expired'; end if;

  update public.receipt_upload_sessions set status = 'processing', updated_at = now()
  where id = p_session_id;

  insert into public.expenses (
    merchant, expense_date, amount, currency, category, payment_method, notes,
    receipt_image_path
  ) values (
    trim(p_merchant), p_expense_date, p_amount, upper(p_currency), p_category,
    nullif(trim(p_payment_method), ''), nullif(trim(p_notes), ''),
    v_session.receipt_image_path
  ) returning id into v_expense_id;

  update public.receipt_upload_sessions set
    status = 'completed', expense_id = v_expense_id, merchant = trim(p_merchant),
    expense_date = p_expense_date, amount = p_amount, currency = upper(p_currency),
    category = p_category, payment_method = nullif(trim(p_payment_method), ''),
    notes = nullif(trim(p_notes), ''), updated_at = now()
  where id = p_session_id;

  return v_expense_id;
end;
$$;

create or replace function public.replace_receipt_upload_session_file(
  p_session_id uuid, p_access_token_hash text, p_receipt_image_path text,
  p_original_filename text, p_mime_type text, p_size_bytes bigint
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_old_path text;
begin
  select receipt_image_path into v_old_path
  from public.receipt_upload_sessions
  where id = p_session_id and access_token_hash = p_access_token_hash
    and status = 'pending' and expires_at > now()
  for update;
  if not found then raise exception 'receipt_session_unavailable'; end if;

  update public.receipt_upload_sessions set
    receipt_image_path = p_receipt_image_path,
    original_filename = p_original_filename,
    mime_type = p_mime_type,
    size_bytes = p_size_bytes,
    updated_at = now()
  where id = p_session_id and access_token_hash = p_access_token_hash
    and status = 'pending' and expires_at > now();
  return v_old_path;
end;
$$;

create or replace function public.delete_receipt_upload_session(
  p_session_id uuid, p_access_token_hash text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.receipt_upload_sessions
  where id = p_session_id and access_token_hash = p_access_token_hash
    and status = 'pending';
  return found;
end;
$$;

revoke all on function public.create_receipt_upload_session(text,text,text,bigint,text) from public;
revoke all on function public.get_receipt_upload_session(uuid,text) from public;
revoke all on function public.confirm_receipt_upload_session(uuid,text,text,date,numeric,varchar,text,text,text) from public;
revoke all on function public.replace_receipt_upload_session_file(uuid,text,text,text,text,bigint) from public;
revoke all on function public.delete_receipt_upload_session(uuid,text) from public;

grant execute on function public.create_receipt_upload_session(text,text,text,bigint,text) to anon, authenticated;
grant execute on function public.get_receipt_upload_session(uuid,text) to anon, authenticated;
grant execute on function public.confirm_receipt_upload_session(uuid,text,text,date,numeric,varchar,text,text,text) to anon, authenticated;
grant execute on function public.replace_receipt_upload_session_file(uuid,text,text,text,text,bigint) to anon, authenticated;
grant execute on function public.delete_receipt_upload_session(uuid,text) to anon, authenticated;

-- Expired pending sessions and their Storage objects need a future scheduled
-- cleanup job. Authentication will replace this capability-token MVP design.
