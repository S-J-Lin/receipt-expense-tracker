-- Synthetic restore_receipt_tracker_backup_v2 regression tests (no real data).
-- Run with scripts/test-sql.sh against a disposable local PostgreSQL only.
\set ON_ERROR_STOP 1
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
create temp table t_backup as select jsonb_build_object(
  'export_version','1.1','generated_at','2026-10-08T10:00:00Z','date_range', jsonb_build_object('start',null,'end',null),
  'scope', jsonb_build_object('is_partial', false, 'filters', jsonb_build_object()),
  'expenses', jsonb_build_array(
    jsonb_build_object('id','aaaaaaaa-0000-4000-8000-000000000001','merchant','Café X','expense_date','2026-09-01','amount',2.5,'currency','EUR','category','餐飲','source','manual','items','[]'::jsonb,'adjustments','[]'::jsonb),
    jsonb_build_object('id','aaaaaaaa-0000-4000-8000-000000000002','merchant','Café X','expense_date','2026-09-01','amount',2.5,'currency','EUR','category','餐飲','source','manual','items','[]'::jsonb,'adjustments','[]'::jsonb),
    jsonb_build_object('id','aaaaaaaa-0000-4000-8000-000000000003','merchant','Landlord','expense_date','2026-09-01','amount',700,'currency','EUR','category','房租','source','recurring','recurring_expense_id','bbbbbbbb-0000-4000-8000-000000000001','recurring_period','2026-09-01','items','[]'::jsonb,'adjustments','[]'::jsonb)
  ),
  'product_aliases', '[]'::jsonb,
  'recurring_expenses', jsonb_build_array(jsonb_build_object('id','bbbbbbbb-0000-4000-8000-000000000001','merchant','Landlord','amount',700,'currency','EUR','category','房租','day_of_month',1,'start_date','2026-01-01','end_date',null,'is_active',true,'cancelled_at',null,'last_generated_for','2026-09-01','next_run_date','2026-10-01'))
) as b;
\set h1 '''0000000000000000000000000000000000000000000000000000000000000001'''
\set h2 '''0000000000000000000000000000000000000000000000000000000000000002'''

-- 1) Skip into an empty ledger keeps both identical coffees and links the rent.
select public.restore_receipt_tracker_backup_v2('cccccccc-0000-4000-8000-000000000001','skip',(select b from t_backup), :h1, null, '[]', '2026-10-08') as r1 \gset
do $$ begin
  if (select count(*) from public.expenses) <> 3 then raise exception 'T1 expected 3 expenses, got %', (select count(*) from public.expenses); end if;
  if (select recurring_expense_id from public.expenses where id = 'aaaaaaaa-0000-4000-8000-000000000003') is null then raise exception 'T1 link missing'; end if;
  if (select next_run_date from public.recurring_expenses) <> '2026-10-01' then raise exception 'T1 next run changed'; end if;
end $$;
select format('T1 ok: %s expenses, links %s', :'r1'::jsonb->>'imported_expenses', :'r1'::jsonb->>'recurring_links_restored');

-- 2) Same key + same payload hash replays without changes.
select (public.restore_receipt_tracker_backup_v2('cccccccc-0000-4000-8000-000000000001','skip',(select b from t_backup), :h1, null, '[]', '2026-10-08')->>'replayed') as replayed \gset
do $$ begin if (select count(*) from public.expenses) <> 3 then raise exception 'T2 changed data'; end if; end $$;
select 'T2 ok replayed=' || :'replayed';

-- 3) Same key, different mode/hash is a conflict, never a fake success.
do $$ begin
  begin perform public.restore_receipt_tracker_backup_v2('cccccccc-0000-4000-8000-000000000001','merge',(select b from t_backup), repeat('0',63)||'2', null, '[]', '2026-10-08');
    raise exception 'T3 no conflict raised';
  exception when others then if sqlerrm <> 'restore_key_conflict' then raise; end if; end;
end $$;
select 'T3 ok conflict';

-- 4) New key, Skip again: all three are recognised (id), nothing duplicated.
select public.restore_receipt_tracker_backup_v2('cccccccc-0000-4000-8000-000000000002','skip',(select b from t_backup), :h2, null, '[]', '2026-10-08') as r4 \gset
do $$ begin if (select count(*) from public.expenses) <> 3 then raise exception 'T4 duplicated'; end if; end $$;
select format('T4 ok skipped=%s', :'r4'::jsonb->>'skipped_duplicates');

-- 5) Signature match is one-to-one: an existing coffee absorbs only one backup coffee with a different id.
delete from public.expenses where id = 'aaaaaaaa-0000-4000-8000-000000000002';
select public.restore_receipt_tracker_backup_v2('cccccccc-0000-4000-8000-000000000005','skip',
  jsonb_set((select b from t_backup), '{expenses}', jsonb_build_array(
    jsonb_set((select b from t_backup)->'expenses'->1, '{id}', '"aaaaaaaa-0000-4000-8000-000000000098"'),
    jsonb_set((select b from t_backup)->'expenses'->1, '{id}', '"aaaaaaaa-0000-4000-8000-000000000099"'))),
  repeat('0',63)||'5', null, '[]', '2026-10-08') as r5 \gset
do $$ begin if (select count(*) from public.expenses where merchant = 'Café X') <> 2 then raise exception 'T5 expected 2 coffees, got %', (select count(*) from public.expenses where merchant = 'Café X'); end if; end $$;
select format('T5 ok imported=%s skipped=%s', :'r5'::jsonb->>'imported_expenses', :'r5'::jsonb->>'skipped_duplicates');

-- 6) Atomicity: an invalid row at the end rolls back everything, including rules.
do $$ declare v_before int := (select count(*) from public.expenses); v_rules int := (select count(*) from public.recurring_expenses); begin
  begin perform public.restore_receipt_tracker_backup_v2('cccccccc-0000-4000-8000-000000000006','replace',
    jsonb_set((select b from t_backup), '{expenses,2,category}', '"INVALID"'), repeat('0',63)||'6', 'RESTORE', '[]', '2026-10-08');
    raise exception 'T6 should fail';
  exception when check_violation then null; end;
  if (select count(*) from public.expenses) <> v_before or (select count(*) from public.recurring_expenses) <> v_rules then raise exception 'T6 partial write'; end if;
end $$;
select 'T6 ok rollback';

-- 7) Replace with a partial backup is refused.
do $$ begin
  begin perform public.restore_receipt_tracker_backup_v2('cccccccc-0000-4000-8000-000000000007','replace',
    jsonb_set((select b from t_backup), '{scope,is_partial}', 'true'), repeat('0',63)||'7', 'RESTORE', '[]', '2026-10-08');
    raise exception 'T7 accepted partial';
  exception when others then if sqlerrm <> 'partial_backup_replace_forbidden' then raise; end if; end;
end $$;
select 'T7 ok partial refused';

-- 8) Replace restores rules + links atomically and does not backfill: past next_run_date is advanced.
select public.restore_receipt_tracker_backup_v2('cccccccc-0000-4000-8000-000000000008','replace',
  jsonb_set((select b from t_backup), '{recurring_expenses,0,next_run_date}', '"2026-06-01"'), repeat('0',63)||'8', 'RESTORE', '[]', '2026-10-08') as r8 \gset
do $$ begin
  if (select count(*) from public.expenses) <> 3 then raise exception 'T8 expenses %', (select count(*) from public.expenses); end if;
  if (select next_run_date from public.recurring_expenses) <> '2026-10-01' then raise exception 'T8 next run %', (select next_run_date from public.recurring_expenses); end if;
  if (select count(*) from public.expenses where recurring_expense_id is not null) <> 1 then raise exception 'T8 link'; end if;
end $$;
select format('T8 ok advanced=%s', :'r8'::jsonb->>'advanced_recurring_rules');

-- 9) Replace without RESTORE confirmation is refused.
do $$ begin
  begin perform public.restore_receipt_tracker_backup_v2('cccccccc-0000-4000-8000-000000000009','replace',(select b from t_backup), repeat('0',63)||'9', null, '[]', '2026-10-08');
    raise exception 'T9 accepted';
  exception when others then if sqlerrm <> 'replace_confirmation_required' then raise; end if; end;
end $$;
select 'T9 ok confirmation';

-- 10) A non-owner JWT is forbidden.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$ begin
  begin perform public.restore_receipt_tracker_backup_v2('cccccccc-0000-4000-8000-000000000010','skip',(select b from t_backup), repeat('0',63)||'a', null, '[]', '2026-10-08');
    raise exception 'T10 non-owner allowed';
  exception when others then if sqlerrm <> 'forbidden' then raise; end if; end;
end $$;
select 'T10 ok non-owner forbidden';
reset role;

-- 11) Privileges: anon cannot execute v2; legacy two-step restore is no longer executable by authenticated.
do $$ begin
  if has_function_privilege('anon', 'public.restore_receipt_tracker_backup_v2(uuid,text,jsonb,text,text,jsonb,date)', 'execute') then raise exception 'T11 anon can execute v2'; end if;
  if not has_function_privilege('authenticated', 'public.restore_receipt_tracker_backup_v2(uuid,text,jsonb,text,text,jsonb,date)', 'execute') then raise exception 'T11 authenticated cannot execute v2'; end if;
  if has_function_privilege('authenticated', 'public.restore_receipt_tracker_backup(uuid,text,jsonb,text,jsonb)', 'execute') then raise exception 'T11 legacy restore still executable'; end if;
  if has_function_privilege('authenticated', 'public.restore_recurring_expenses(jsonb,jsonb,text)', 'execute') then raise exception 'T11 legacy recurring restore still executable'; end if;
end $$;
select 'T11 ok privileges';
