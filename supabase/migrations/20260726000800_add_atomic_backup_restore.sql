-- Milestone 12: atomic, idempotent Full Backup restore.

create table if not exists public.backup_restore_runs (
  id uuid primary key default gen_random_uuid(),
  restore_key uuid not null unique,
  restore_mode text not null check (restore_mode in ('skip', 'merge', 'replace')),
  report jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.backup_restore_runs enable row level security;
revoke all on public.backup_restore_runs from anon, authenticated;

create or replace function public.restore_receipt_tracker_backup(
  p_restore_key uuid,
  p_mode text,
  p_backup jsonb,
  p_replace_confirmation text default null,
  p_missing_attachments jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_existing_report jsonb;
  v_expense jsonb;
  v_alias jsonb;
  v_target_id uuid;
  v_inserted_expenses integer := 0;
  v_inserted_items integer := 0;
  v_inserted_adjustments integer := 0;
  v_inserted_aliases integer := 0;
  v_skipped integer := 0;
  v_merged integer := 0;
  v_conflicts integer := 0;
  v_count integer;
  v_report jsonb;
begin
  if p_restore_key is null then raise exception 'restore_key_required'; end if;
  select report into v_existing_report from public.backup_restore_runs where restore_key = p_restore_key;
  if v_existing_report is not null then return v_existing_report; end if;
  if p_mode not in ('skip', 'merge', 'replace') then raise exception 'invalid_restore_mode'; end if;
  if p_mode = 'replace' and p_replace_confirmation is distinct from 'RESTORE' then raise exception 'replace_confirmation_required'; end if;
  if jsonb_typeof(p_backup) <> 'object' or jsonb_typeof(p_backup->'expenses') <> 'array'
    or jsonb_typeof(coalesce(p_backup->'product_aliases', '[]'::jsonb)) <> 'array' then raise exception 'invalid_backup_structure'; end if;
  if split_part(coalesce(p_backup->>'export_version', ''), '.', 1) <> '1' then raise exception 'unsupported_export_major_version'; end if;
  if octet_length(p_backup::text) > 26214400 then raise exception 'backup_too_large'; end if;
  if p_backup::text ~* '"(receipt_image_url|signed_url|session_token|access_token|service_role_key|supabase_key|import_idempotency_key|creation_idempotency_key)"[[:space:]]*:' then
    raise exception 'forbidden_backup_field';
  end if;
  if jsonb_typeof(p_missing_attachments) <> 'array' then raise exception 'missing_attachments_must_be_array'; end if;

  if p_mode = 'replace' then
    delete from public.expenses;
    delete from public.product_aliases;
  end if;

  for v_expense in select value from jsonb_array_elements(p_backup->'expenses') loop
    if jsonb_typeof(v_expense->'items') <> 'array' or jsonb_typeof(v_expense->'adjustments') <> 'array' then raise exception 'expense_details_must_be_arrays'; end if;
    v_target_id := null;
    if p_mode <> 'replace' then
      select id into v_target_id from public.expenses where id = (v_expense->>'id')::uuid;
      if v_target_id is null then
        select id into v_target_id from public.expenses
        where lower(trim(merchant)) = lower(trim(v_expense->>'merchant'))
          and expense_date = (v_expense->>'expense_date')::date
          and amount = (v_expense->>'amount')::numeric
          and currency = upper(v_expense->>'currency')
          and source = coalesce(v_expense->>'source', 'manual')
        order by created_at limit 1;
      end if;
    end if;

    if v_target_id is not null and p_mode = 'skip' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_target_id is null then
      v_target_id := (v_expense->>'id')::uuid;
      insert into public.expenses (
        id, merchant, expense_date, amount, currency, category, payment_method, source,
        notes, receipt_image_path, raw_receipt_text, ai_confidence, import_warnings, created_at, updated_at
      ) values (
        v_target_id, trim(v_expense->>'merchant'), (v_expense->>'expense_date')::date,
        (v_expense->>'amount')::numeric, upper(v_expense->>'currency'), v_expense->>'category',
        nullif(trim(v_expense->>'payment_method'), ''), coalesce(v_expense->>'source', 'manual'),
        nullif(trim(v_expense->>'notes'), ''), nullif(v_expense->>'receipt_image_path', ''),
        nullif(v_expense->>'raw_receipt_text', ''), nullif(v_expense->>'ai_confidence', '')::numeric,
        coalesce(v_expense->'import_warnings', '[]'::jsonb),
        coalesce(nullif(v_expense->>'created_at', '')::timestamptz, now()),
        coalesce(nullif(v_expense->>'updated_at', '')::timestamptz, now())
      );
      v_inserted_expenses := v_inserted_expenses + 1;
    else
      v_merged := v_merged + 1;
    end if;

    if not exists (select 1 from public.expense_items where expense_id = v_target_id) then
      insert into public.expense_items (expense_id, name_original, name_normalized, english_name, brand, product_group, category, quantity, amount, confidence, notes, unit, unit_quantity)
      select v_target_id, coalesce(nullif(trim(i.name_original), ''), 'N/A'), coalesce(nullif(trim(i.name_normalized), ''), 'N/A'),
        coalesce(nullif(trim(i.english_name), ''), 'N/A'), coalesce(nullif(trim(i.brand), ''), 'N/A'),
        coalesce(nullif(trim(i.product_group), ''), '其他'), coalesce(i.category, v_expense->>'category', '其他'),
        coalesce(i.quantity, 1), i.amount, i.confidence, coalesce(i.notes, ''),
        coalesce(nullif(trim(i.unit), ''), 'N/A'), coalesce(i.unit_quantity, 1)
      from jsonb_to_recordset(v_expense->'items') as i(name_original text, name_normalized text, english_name text, brand text, product_group text, category text, quantity numeric, amount numeric, confidence numeric, notes text, unit text, unit_quantity numeric);
      get diagnostics v_count = row_count;
      v_inserted_items := v_inserted_items + v_count;
    end if;

    if not exists (select 1 from public.expense_adjustments where expense_id = v_target_id) then
      insert into public.expense_adjustments (expense_id, name, amount, category)
      select v_target_id, trim(a.name), a.amount, coalesce(a.category, v_expense->>'category', '其他')
      from jsonb_to_recordset(v_expense->'adjustments') as a(name text, amount numeric, category text);
      get diagnostics v_count = row_count;
      v_inserted_adjustments := v_inserted_adjustments + v_count;
    end if;
  end loop;

  for v_alias in select value from jsonb_array_elements(coalesce(p_backup->'product_aliases', '[]'::jsonb)) loop
    if exists (select 1 from public.product_aliases where alias_normalized = lower(regexp_replace(trim(v_alias->>'alias'), '[[:space:]]+', ' ', 'g'))) then
      if exists (select 1 from public.product_aliases where alias_normalized = lower(regexp_replace(trim(v_alias->>'alias'), '[[:space:]]+', ' ', 'g')) and normalized_name <> v_alias->>'normalized_name') then
        v_conflicts := v_conflicts + 1;
      end if;
      continue;
    end if;
    insert into public.product_aliases (alias, normalized_name, product_group, category, brand)
    values (trim(v_alias->>'alias'), trim(v_alias->>'normalized_name'), coalesce(nullif(trim(v_alias->>'product_group'), ''), '其他'), nullif(v_alias->>'category', ''), coalesce(nullif(trim(v_alias->>'brand'), ''), 'N/A'));
    v_inserted_aliases := v_inserted_aliases + 1;
  end loop;

  v_report := jsonb_build_object(
    'imported_expenses', v_inserted_expenses, 'imported_items', v_inserted_items,
    'imported_adjustments', v_inserted_adjustments, 'imported_aliases', v_inserted_aliases,
    'skipped_duplicates', v_skipped, 'merged_records', v_merged, 'conflicts', v_conflicts,
    'missing_attachments', p_missing_attachments,
    'duration_ms', round(extract(epoch from (clock_timestamp() - v_started)) * 1000),
    'restore_mode', p_mode, 'restore_key', p_restore_key
  );
  insert into public.backup_restore_runs (restore_key, restore_mode, report) values (p_restore_key, p_mode, v_report);
  return v_report;
end;
$$;

revoke all on function public.restore_receipt_tracker_backup(uuid, text, jsonb, text, jsonb) from public;
grant execute on function public.restore_receipt_tracker_backup(uuid, text, jsonb, text, jsonb) to anon, authenticated;

comment on function public.restore_receipt_tracker_backup(uuid, text, jsonb, text, jsonb) is
  'Atomic M12 restore with skip, conservative merge, replace-all confirmation, fixed search_path, and idempotent reports.';
