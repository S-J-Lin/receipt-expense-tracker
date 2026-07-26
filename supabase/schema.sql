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
