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
