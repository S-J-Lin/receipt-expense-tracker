-- Disposable local DB only. Synthetic fixtures are rolled back, never production data.
\set ON_ERROR_STOP 1
begin;
do $$ begin
  if (select count(*) from public.rls_policy_baseline) <> 9 then raise exception 'T1 baseline policy count'; end if;
  if exists (
    (select schemaname, tablename, policyname, permissive, roles, cmd from public.rls_policy_baseline
     except select schemaname, tablename, policyname, permissive, roles, cmd from pg_policies)
    union all
    (select schemaname, tablename, policyname, permissive, roles, cmd from pg_policies where
      (schemaname = 'public' and tablename in ('expenses','expense_items','expense_adjustments','recurring_expenses','product_aliases'))
      or (schemaname = 'storage' and tablename = 'objects')
     except select schemaname, tablename, policyname, permissive, roles, cmd from public.rls_policy_baseline)
  ) then raise exception 'T1 policy names, count, roles or commands changed'; end if;
end $$;
select 'T1 ok policy inventory unchanged';

insert into public.expenses (id,user_id,merchant,expense_date,amount,currency,category)
values ('eeeeeeee-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','INITPLAN SYNTHETIC','2026-10-08',1,'EUR','其他');
insert into public.expense_items (expense_id,name_original,quantity,amount,category)
values ('eeeeeeee-0000-4000-8000-000000000001','SYNTHETIC',1,1,'其他');
insert into public.expense_adjustments (expense_id,name,amount,category)
values ('eeeeeeee-0000-4000-8000-000000000001','SYNTHETIC',0,'其他');
insert into public.recurring_expenses (id,user_id,merchant,amount,currency,category,day_of_month,start_date,next_run_date)
values ('eeeeeeee-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','INITPLAN SYNTHETIC',1,'EUR','其他',8,'2026-10-08','2026-11-08');
insert into public.product_aliases (id,user_id,alias,normalized_name)
values ('eeeeeeee-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','initplan synthetic','SYNTHETIC');
-- Local storage stubs do not include Supabase's table grants; simulate them only in this transaction.
grant select,insert,update,delete on storage.objects to authenticated,anon;
insert into storage.objects (bucket_id,name) values
('receipts','11111111-1111-4111-8111-111111111111/initplan.jpg'), ('receipts','anonymous/initplan.jpg'),
('receipts','22222222-2222-4222-8222-222222222222/initplan.jpg');

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
  if (select count(*) from public.expenses where merchant = 'INITPLAN SYNTHETIC') <> 1
    or (select count(*) from public.expense_items where expense_id = 'eeeeeeee-0000-4000-8000-000000000001') <> 1
    or (select count(*) from public.expense_adjustments where expense_id = 'eeeeeeee-0000-4000-8000-000000000001') <> 1
    or (select count(*) from public.recurring_expenses where merchant = 'INITPLAN SYNTHETIC') <> 1
    or (select count(*) from public.product_aliases where alias = 'initplan synthetic') <> 1
    or (select count(*) from storage.objects where name like '%/initplan.jpg') <> 2 then raise exception 'T2 owner read or child ownership failed'; end if;
end $$;
select 'T2 ok owner reads all five tables and permitted receipt paths';

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
  if exists (select 1 from public.expenses) or exists (select 1 from public.expense_items)
    or exists (select 1 from public.expense_adjustments) or exists (select 1 from public.recurring_expenses)
    or exists (select 1 from public.product_aliases) or exists (select 1 from storage.objects) then raise exception 'T3 non-owner can read'; end if;
end $$;
select 'T3 ok other authenticated user cannot read';

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare v_table text; begin
  foreach v_table in array array['expenses','expense_items','expense_adjustments','recurring_expenses','product_aliases'] loop
    begin execute format('select 1 from public.%I limit 1',v_table); raise exception 'T4 anon table read allowed: %',v_table;
    exception when insufficient_privilege then null; end;
  end loop;
  if exists (select 1 from storage.objects) then raise exception 'T4 anon Storage read allowed'; end if;
end $$;
select 'T4 ok anonymous reads denied';
reset role;
rollback;
