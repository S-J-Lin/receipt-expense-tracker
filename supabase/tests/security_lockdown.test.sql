-- Synthetic checks of the owner lockdown as applied by the migrations in this
-- repository (local PostgreSQL + Supabase stubs). This is NOT a production
-- verification: it proves what the SQL files do, not what is live.
\set ON_ERROR_STOP 1
do $$ declare v_table text; begin
  foreach v_table in array array['expenses','expense_items','expense_adjustments','recurring_expenses','product_aliases','receipt_upload_sessions','backup_restore_runs'] loop
    if has_table_privilege('anon', 'public.' || v_table, 'select') or has_table_privilege('anon', 'public.' || v_table, 'insert')
      or has_table_privilege('anon', 'public.' || v_table, 'update') or has_table_privilege('anon', 'public.' || v_table, 'delete') then
      raise exception 'T1 anon has a privilege on %', v_table;
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and (roles @> array['anon']::name[] or roles @> array['public']::name[])) then raise exception 'T1 anon/public policy exists'; end if;
end $$;
select 'T1 ok anon has no table privileges or policies';

do $$ begin
  if has_function_privilege('authenticated', 'public.process_due_recurring_expenses(date,integer)', 'execute') then raise exception 'T2 cron RPC executable by authenticated'; end if;
  if has_function_privilege('anon', 'public.process_due_recurring_expenses(date,integer)', 'execute') then raise exception 'T2 cron RPC executable by anon'; end if;
  if not has_function_privilege('service_role', 'public.process_due_recurring_expenses(date,integer)', 'execute') then raise exception 'T2 service_role cannot run cron RPC'; end if;
  if has_function_privilege('anon', 'public.create_manual_expense(uuid,text,date,character varying,numeric,text,text,text,jsonb,jsonb)', 'execute') then raise exception 'T2 anon can create'; end if;
end $$;
select 'T2 ok RPC execute privileges';

do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef
    and not coalesce(p.proconfig, '{}') @> array['search_path=""']) then
    raise exception 'T3 public SECURITY DEFINER without empty search_path: %', (select string_agg(p.proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig, '{}') @> array['search_path=""']);
  end if;
end $$;
select 'T3 ok public SECURITY DEFINER functions pin search_path';

insert into public.expenses (id, user_id, merchant, expense_date, amount, currency, category) values ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Synthetic', '2026-09-01', 1, 'EUR', '其他');
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$ begin
  if (select count(*) from public.expenses) <> 0 then raise exception 'T4 non-owner can read expenses'; end if;
  begin insert into public.expenses (merchant, expense_date, amount, currency, category) values ('x', '2026-09-01', 1, 'EUR', '其他'); raise exception 'T4 non-owner insert allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
do $$ begin if not exists (select 1 from public.expenses where id = 'dddddddd-0000-4000-8000-000000000001') then raise exception 'T4 owner cannot read'; end if; end $$;
reset role;
select 'T4 ok RLS owner-only (synthetic JWT claims)';
