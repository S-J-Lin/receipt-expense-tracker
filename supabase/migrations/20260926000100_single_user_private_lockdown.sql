-- SECURITY MILESTONE. Replace the UUID below with the existing Auth user's UUID.
-- Run this file once, in one SQL Editor execution, after saving a Full Backup.
-- The all-zero placeholder deliberately aborts. Do not modify historical migrations.
begin;

create temp table security_migration_owner on commit drop as
  select 'e53f88cc-9c57-4447-8253-0bf1f2e0d5b1'::uuid as id;

do $$ begin
  if (select id from security_migration_owner) = '00000000-0000-0000-0000-000000000000'::uuid
    then raise exception 'Replace the owner UUID placeholder before running this migration'; end if;
  if not exists (select 1 from auth.users where id = (select id from security_migration_owner))
    then raise exception 'The owner UUID does not exist in auth.users'; end if;
  if exists (select 1 from public.expenses where user_id is not null and user_id <> (select id from security_migration_owner))
    then raise exception 'expenses already contain a different owner; manual review required'; end if;
end $$;

create temp table security_migration_counts on commit drop as
select (select count(*) from public.expenses) as expenses,
  (select coalesce(sum(amount), 0) from public.expenses) as expense_total,
  (select count(*) from public.expense_items) as items,
  (select coalesce(sum(amount), 0) from public.expense_items) as item_total,
  (select count(*) from public.expense_adjustments) as adjustments,
  (select coalesce(sum(amount), 0) from public.expense_adjustments) as adjustment_total,
  (select count(*) from public.recurring_expenses) as recurring,
  (select coalesce(sum(amount), 0) from public.recurring_expenses) as recurring_total,
  (select count(*) from public.product_aliases) as aliases,
  (select count(*) from public.receipt_upload_sessions) as receipt_sessions,
  (select count(*) from public.expenses where recurring_expense_id is not null) as recurring_history;

create schema if not exists receipt_tracker_private;
revoke all on schema receipt_tracker_private from public, anon, authenticated;
create table if not exists receipt_tracker_private.app_owner (singleton boolean primary key default true check (singleton), user_id uuid not null unique references auth.users(id));
revoke all on receipt_tracker_private.app_owner from public, anon, authenticated;
insert into receipt_tracker_private.app_owner(singleton, user_id) select true, id from security_migration_owner
on conflict (singleton) do update set user_id = excluded.user_id;

create or replace function public.is_authorized_user() returns boolean language sql stable security definer
set search_path = '' as $$ select auth.uid() is not null and auth.uid() = (select user_id from receipt_tracker_private.app_owner where singleton) $$;
revoke all on function public.is_authorized_user() from public, anon;
grant execute on function public.is_authorized_user() to authenticated;

update public.expenses set user_id = (select id from security_migration_owner) where user_id is null;
alter table public.expenses alter column user_id set not null;
alter table public.expenses alter column user_id set default auth.uid();
alter table public.expenses drop constraint if exists expenses_user_id_fkey;
alter table public.expenses add constraint expenses_user_id_fkey foreign key (user_id) references auth.users(id);

alter table public.recurring_expenses add column if not exists user_id uuid;
do $$ begin
  if exists (select 1 from public.recurring_expenses where user_id is not null and user_id <> (select id from security_migration_owner))
    then raise exception 'recurring_expenses have a different owner'; end if;
end $$;
update public.recurring_expenses set user_id = (select id from security_migration_owner) where user_id is null;
alter table public.recurring_expenses alter column user_id set not null;
alter table public.recurring_expenses alter column user_id set default auth.uid();
alter table public.recurring_expenses add constraint recurring_expenses_user_id_fkey foreign key (user_id) references auth.users(id);

-- Aliases are user-maintained normalization history, not a global taxonomy.
alter table public.product_aliases add column if not exists user_id uuid;
do $$ begin
  if exists (select 1 from public.product_aliases where user_id is not null and user_id <> (select id from security_migration_owner))
    then raise exception 'product_aliases have a different owner'; end if;
end $$;
update public.product_aliases set user_id = (select id from security_migration_owner) where user_id is null;
alter table public.product_aliases alter column user_id set not null;
alter table public.product_aliases alter column user_id set default auth.uid();
alter table public.product_aliases add constraint product_aliases_user_id_fkey foreign key (user_id) references auth.users(id);

alter table public.receipt_upload_sessions add column if not exists user_id uuid;
do $$ begin
  if exists (select 1 from public.receipt_upload_sessions where user_id is not null and user_id <> (select id from security_migration_owner))
    then raise exception 'receipt_upload_sessions have a different owner'; end if;
end $$;
update public.receipt_upload_sessions set user_id = (select id from security_migration_owner) where user_id is null;
alter table public.receipt_upload_sessions alter column user_id set not null;
alter table public.receipt_upload_sessions alter column user_id set default auth.uid();
alter table public.receipt_upload_sessions add constraint receipt_upload_sessions_user_id_fkey foreign key (user_id) references auth.users(id);
alter table public.receipt_upload_sessions drop constraint if exists receipt_upload_sessions_receipt_image_path_check;
alter table public.receipt_upload_sessions add constraint receipt_upload_sessions_receipt_image_path_check check (
  receipt_image_path ~ '^(anonymous|[0-9a-f-]{36})/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}-[0-9]{13}\.(jpg|jpeg|png|heic|heif|pdf)$');

-- Remove all old development policies and grants. No anonymous table reads or writes remain.
drop policy if exists "MVP public read expenses" on public.expenses;
drop policy if exists "MVP public insert expenses" on public.expenses;
drop policy if exists "MVP public update expenses" on public.expenses;
drop policy if exists "MVP public delete expenses" on public.expenses;
drop policy if exists "MVP public read expense items" on public.expense_items;
drop policy if exists "MVP public insert expense items" on public.expense_items;
drop policy if exists "MVP public update expense items" on public.expense_items;
drop policy if exists "MVP public delete expense items" on public.expense_items;
drop policy if exists "MVP public read expense adjustments" on public.expense_adjustments;
drop policy if exists "MVP public insert expense adjustments" on public.expense_adjustments;
drop policy if exists "MVP public update expense adjustments" on public.expense_adjustments;
drop policy if exists "MVP public delete expense adjustments" on public.expense_adjustments;
drop policy if exists "MVP public read recurring expenses" on public.recurring_expenses;
drop policy if exists "MVP public insert recurring expenses" on public.recurring_expenses;
drop policy if exists "MVP public update recurring expenses" on public.recurring_expenses;
drop policy if exists "MVP public delete recurring expenses" on public.recurring_expenses;
drop policy if exists "MVP public read product aliases" on public.product_aliases;
drop policy if exists "MVP public insert product aliases" on public.product_aliases;
drop policy if exists "MVP public update product aliases" on public.product_aliases;
drop policy if exists "MVP public delete product aliases" on public.product_aliases;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public'
    and tablename in ('expenses','expense_items','expense_adjustments','recurring_expenses','product_aliases','receipt_upload_sessions','backup_restore_runs'))
    then raise exception 'Unexpected public-table RLS policy remains; review it before lockdown'; end if;
end $$;
revoke all on public.expenses, public.expense_items, public.expense_adjustments, public.recurring_expenses, public.product_aliases from public, anon;
grant select, insert, update, delete on public.expenses, public.expense_items, public.expense_adjustments, public.recurring_expenses, public.product_aliases to authenticated;

create policy "owner expenses" on public.expenses for all to authenticated
using (public.is_authorized_user() and user_id = auth.uid())
with check (public.is_authorized_user() and user_id = auth.uid());
create policy "owner expense items" on public.expense_items for all to authenticated
using (public.is_authorized_user() and exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = auth.uid()))
with check (public.is_authorized_user() and exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = auth.uid()));
create policy "owner expense adjustments" on public.expense_adjustments for all to authenticated
using (public.is_authorized_user() and exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = auth.uid()))
with check (public.is_authorized_user() and exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = auth.uid()));
create policy "owner recurring expenses" on public.recurring_expenses for all to authenticated
using (public.is_authorized_user() and user_id = auth.uid())
with check (public.is_authorized_user() and user_id = auth.uid());
create policy "owner product aliases" on public.product_aliases for all to authenticated
using (public.is_authorized_user() and user_id = auth.uid())
with check (public.is_authorized_user() and user_id = auth.uid());

-- Keep the private bucket and preserve legacy anonymous/ files, but make that
-- folder readable/deletable only by the sole authorized user. New uploads use UUID/.
update storage.buckets set public = false where id = 'receipts';
drop policy if exists "MVP anonymous receipt uploads" on storage.objects;
drop policy if exists "MVP anonymous receipt reads" on storage.objects;
drop policy if exists "MVP anonymous receipt deletes" on storage.objects;
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects')
    then raise exception 'Unexpected Storage policy remains; review it before lockdown'; end if;
end $$;
create policy "owner receipt reads" on storage.objects for select to authenticated using (
  bucket_id = 'receipts' and public.is_authorized_user()
  and (storage.foldername(name))[1] in (auth.uid()::text, 'anonymous'));
create policy "owner receipt uploads" on storage.objects for insert to authenticated with check (
  bucket_id = 'receipts' and public.is_authorized_user() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner receipt updates" on storage.objects for update to authenticated
using (bucket_id = 'receipts' and public.is_authorized_user() and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'receipts' and public.is_authorized_user() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner receipt deletes" on storage.objects for delete to authenticated using (
  bucket_id = 'receipts' and public.is_authorized_user()
  and (storage.foldername(name))[1] in (auth.uid()::text, 'anonymous'));

-- Existing SECURITY DEFINER functions are moved out of the exposed schema.
-- Public wrappers first check the verified JWT owner and session ownership.
alter function public.create_receipt_upload_session(text,text,text,bigint,text) set schema receipt_tracker_private;
alter function receipt_tracker_private.create_receipt_upload_session(text,text,text,bigint,text) rename to create_receipt_upload_session_legacy;
alter function public.get_receipt_upload_session(uuid,text) set schema receipt_tracker_private;
alter function receipt_tracker_private.get_receipt_upload_session(uuid,text) rename to get_receipt_upload_session_legacy;
alter function public.confirm_receipt_upload_session(uuid,text,text,date,numeric,varchar,text,text,text) set schema receipt_tracker_private;
alter function receipt_tracker_private.confirm_receipt_upload_session(uuid,text,text,date,numeric,varchar,text,text,text) rename to confirm_receipt_upload_session_legacy;
alter function public.replace_receipt_upload_session_file(uuid,text,text,text,text,bigint) set schema receipt_tracker_private;
alter function receipt_tracker_private.replace_receipt_upload_session_file(uuid,text,text,text,text,bigint) rename to replace_receipt_upload_session_file_legacy;
alter function public.delete_receipt_upload_session(uuid,text) set schema receipt_tracker_private;
alter function receipt_tracker_private.delete_receipt_upload_session(uuid,text) rename to delete_receipt_upload_session_legacy;
alter function public.restore_receipt_tracker_backup(uuid,text,jsonb,text,jsonb) set schema receipt_tracker_private;
alter function receipt_tracker_private.restore_receipt_tracker_backup(uuid,text,jsonb,text,jsonb) rename to restore_receipt_tracker_backup_legacy;
revoke all on all functions in schema receipt_tracker_private from public, anon, authenticated;

create function public.create_receipt_upload_session(p_receipt_image_path text, p_original_filename text, p_mime_type text, p_size_bytes bigint, p_access_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$ begin
  if not public.is_authorized_user() or split_part(p_receipt_image_path, '/', 1) <> auth.uid()::text then raise exception 'forbidden'; end if;
  return receipt_tracker_private.create_receipt_upload_session_legacy(p_receipt_image_path, p_original_filename, p_mime_type, p_size_bytes, p_access_token_hash);
end $$;
create function public.get_receipt_upload_session(p_session_id uuid, p_access_token_hash text)
returns table (id uuid, receipt_image_path text, original_filename text, mime_type text, size_bytes bigint, status text, expires_at timestamptz, created_at timestamptz, updated_at timestamptz, merchant text, expense_date date, amount numeric, currency varchar, category text, payment_method text, notes text, analysis_status text, analysis_warnings jsonb, expense_id uuid)
language plpgsql security definer set search_path = '' as $$ begin
  if not public.is_authorized_user() or not exists (select 1 from public.receipt_upload_sessions s where s.id = p_session_id and s.user_id = auth.uid()) then raise exception 'forbidden'; end if;
  return query select * from receipt_tracker_private.get_receipt_upload_session_legacy(p_session_id, p_access_token_hash);
end $$;
create function public.confirm_receipt_upload_session(p_session_id uuid, p_access_token_hash text, p_merchant text, p_expense_date date, p_amount numeric, p_currency varchar, p_category text, p_payment_method text, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$ begin
  if not public.is_authorized_user() or not exists (select 1 from public.receipt_upload_sessions s where s.id = p_session_id and s.user_id = auth.uid()) then raise exception 'forbidden'; end if;
  return receipt_tracker_private.confirm_receipt_upload_session_legacy(p_session_id, p_access_token_hash, p_merchant, p_expense_date, p_amount, p_currency, p_category, p_payment_method, p_notes);
end $$;
create function public.replace_receipt_upload_session_file(p_session_id uuid, p_access_token_hash text, p_receipt_image_path text, p_original_filename text, p_mime_type text, p_size_bytes bigint)
returns text language plpgsql security definer set search_path = '' as $$ begin
  if not public.is_authorized_user() or split_part(p_receipt_image_path, '/', 1) <> auth.uid()::text
    or not exists (select 1 from public.receipt_upload_sessions s where s.id = p_session_id and s.user_id = auth.uid()) then raise exception 'forbidden'; end if;
  return receipt_tracker_private.replace_receipt_upload_session_file_legacy(p_session_id, p_access_token_hash, p_receipt_image_path, p_original_filename, p_mime_type, p_size_bytes);
end $$;
create function public.delete_receipt_upload_session(p_session_id uuid, p_access_token_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$ begin
  if not public.is_authorized_user() or not exists (select 1 from public.receipt_upload_sessions s where s.id = p_session_id and s.user_id = auth.uid()) then raise exception 'forbidden'; end if;
  return receipt_tracker_private.delete_receipt_upload_session_legacy(p_session_id, p_access_token_hash);
end $$;
create function public.restore_receipt_tracker_backup(p_restore_key uuid, p_mode text, p_backup jsonb, p_replace_confirmation text default null, p_missing_attachments jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$ begin
  if not public.is_authorized_user() then raise exception 'forbidden'; end if;
  return receipt_tracker_private.restore_receipt_tracker_backup_legacy(p_restore_key, p_mode, p_backup, p_replace_confirmation, p_missing_attachments);
end $$;
revoke all on function public.create_receipt_upload_session(text,text,text,bigint,text), public.get_receipt_upload_session(uuid,text), public.confirm_receipt_upload_session(uuid,text,text,date,numeric,varchar,text,text,text), public.replace_receipt_upload_session_file(uuid,text,text,text,text,bigint), public.delete_receipt_upload_session(uuid,text), public.restore_receipt_tracker_backup(uuid,text,jsonb,text,jsonb) from public, anon;
grant execute on function public.create_receipt_upload_session(text,text,text,bigint,text), public.get_receipt_upload_session(uuid,text), public.confirm_receipt_upload_session(uuid,text,text,date,numeric,varchar,text,text,text), public.replace_receipt_upload_session_file(uuid,text,text,text,text,bigint), public.delete_receipt_upload_session(uuid,text), public.restore_receipt_tracker_backup(uuid,text,jsonb,text,jsonb) to authenticated;

-- Invoker RPCs inherit the new RLS; direct anonymous invocation is revoked.
revoke all on function public.create_chatgpt_import(uuid,text,date,varchar,numeric,text,text,jsonb,jsonb,jsonb), public.update_itemized_expense(uuid,uuid,text,date,varchar,numeric,text,text,text,jsonb,jsonb), public.create_manual_expense(uuid,text,date,varchar,numeric,text,text,text,jsonb,jsonb), public.process_due_recurring_expenses(date,integer), public.resume_recurring_expense(uuid,date), public.generate_recurring_expense_now(uuid,text,date), public.restore_recurring_expenses(jsonb,jsonb,text) from public, anon;
grant execute on function public.create_chatgpt_import(uuid,text,date,varchar,numeric,text,text,jsonb,jsonb,jsonb), public.update_itemized_expense(uuid,uuid,text,date,varchar,numeric,text,text,text,jsonb,jsonb), public.create_manual_expense(uuid,text,date,varchar,numeric,text,text,text,jsonb,jsonb), public.resume_recurring_expense(uuid,date), public.generate_recurring_expense_now(uuid,text,date), public.restore_recurring_expenses(jsonb,jsonb,text) to authenticated;
revoke execute on function public.process_due_recurring_expenses(date,integer) from authenticated;
grant execute on function public.process_due_recurring_expenses(date,integer) to service_role;

-- Cron has no browser JWT. It inserts using the already-owned recurring rule.
create or replace function public.process_due_recurring_expenses(p_today date default ((now() at time zone 'Europe/Berlin')::date), p_max_periods integer default 12)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_rule public.recurring_expenses%rowtype; v_run date; v_period date; v_next_month date;
  v_limit integer := least(greatest(p_max_periods, 1), 12); v_row_count integer; v_iterations integer; v_generated integer := 0; v_rules integer := 0;
begin
  for v_rule in select * from public.recurring_expenses where is_active and cancelled_at is null and next_run_date <= p_today order by next_run_date for update skip locked loop
    v_iterations := 0; v_rules := v_rules + 1;
    while v_rule.next_run_date <= p_today and v_iterations < v_limit loop
      v_run := v_rule.next_run_date;
      if v_rule.end_date is not null and v_run > v_rule.end_date then
        update public.recurring_expenses set is_active = false where id = v_rule.id; exit;
      end if;
      v_period := date_trunc('month', v_run)::date;
      insert into public.expenses (user_id, merchant, expense_date, amount, currency, category, payment_method, notes, source, recurring_expense_id, recurring_period)
      values (v_rule.user_id, v_rule.merchant, v_run, v_rule.amount, v_rule.currency, v_rule.category, v_rule.payment_method, v_rule.notes, 'recurring', v_rule.id, v_period)
      on conflict (recurring_expense_id, recurring_period) where recurring_expense_id is not null and recurring_period is not null do nothing;
      get diagnostics v_row_count = row_count;
      v_generated := v_generated + v_row_count;
      v_iterations := v_iterations + 1;
      v_next_month := (date_trunc('month', v_run) + interval '1 month')::date;
      v_rule.next_run_date := public.recurring_scheduled_date(extract(year from v_next_month)::integer, extract(month from v_next_month)::integer, v_rule.day_of_month);
      update public.recurring_expenses set last_generated_for = v_run, next_run_date = v_rule.next_run_date,
        is_active = not (end_date is not null and v_rule.next_run_date > end_date) where id = v_rule.id;
    end loop;
  end loop;
  return jsonb_build_object('generated_count', v_generated, 'processed_rule_count', v_rules, 'today', p_today);
end $$;

do $$ declare before_row record; begin
  select * into before_row from security_migration_counts;
  if before_row.expenses <> (select count(*) from public.expenses)
    or before_row.expense_total <> (select coalesce(sum(amount), 0) from public.expenses)
    or before_row.items <> (select count(*) from public.expense_items)
    or before_row.item_total <> (select coalesce(sum(amount), 0) from public.expense_items)
    or before_row.adjustments <> (select count(*) from public.expense_adjustments)
    or before_row.adjustment_total <> (select coalesce(sum(amount), 0) from public.expense_adjustments)
    or before_row.recurring <> (select count(*) from public.recurring_expenses)
    or before_row.recurring_total <> (select coalesce(sum(amount), 0) from public.recurring_expenses)
    or before_row.aliases <> (select count(*) from public.product_aliases)
    or before_row.receipt_sessions <> (select count(*) from public.receipt_upload_sessions)
    or before_row.recurring_history <> (select count(*) from public.expenses where recurring_expense_id is not null)
  then raise exception 'Data reconciliation failed; transaction rolled back'; end if;
end $$;

commit;
