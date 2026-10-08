-- Forward migration (2026-10-08): atomic, one-to-one Full Backup restore.
--
-- Purpose
--   * Restore expenses, items, adjustments, aliases, recurring rules and the
--     expense <-> recurring-rule links in ONE transaction (previously two RPCs
--     that could partially succeed).
--   * Match backup rows to pre-existing rows one-to-one (id, then recurring
--     rule + period, then header signature). Backup rows never match each other,
--     so two genuine identical purchases are both restored.
--   * Bind a restore key to one (mode, payload hash); reusing a key for a
--     different operation raises `restore_key_conflict` instead of replaying an
--     unrelated report.
--   * Refuse Replace all for partial (filtered) backups.
--   * Never backfill historical months: an active rule whose next_run_date lies
--     before the current Berlin month is moved to this month's run (reported).
--
-- Safety
--   * Does not modify earlier migrations and contains no user UUID; ownership is
--     taken from the verified JWT (auth.uid()) and public.is_authorized_user()
--     from 20260926000100_single_user_private_lockdown.sql, which must already
--     be applied.
--   * Creates/replaces functions and adds one nullable column. No data is
--     changed by applying this file.
--   * Rollback: `drop function public.restore_receipt_tracker_backup_v2(uuid,text,jsonb,text,text,jsonb,date);`
--     and re-grant EXECUTE on the two legacy functions to authenticated
--     (see the end of this file). The added column can stay.
begin;

alter table public.backup_restore_runs add column if not exists payload_hash text;

create or replace function public.restore_receipt_tracker_backup_v2(
  p_restore_key uuid,
  p_mode text,
  p_backup jsonb,
  p_payload_hash text,
  p_replace_confirmation text default null,
  p_missing_attachments jsonb default '[]'::jsonb,
  p_today date default ((now() at time zone 'Europe/Berlin')::date)
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_started timestamptz := clock_timestamp();
  v_previous record;
  v_row record;
  v_rule jsonb;
  v_alias jsonb;
  v_target uuid;
  v_link_rule uuid;
  v_link_period date;
  v_next date;
  v_active boolean;
  v_count integer;
  v_inserted_expenses integer := 0;
  v_inserted_items integer := 0;
  v_inserted_adjustments integer := 0;
  v_inserted_aliases integer := 0;
  v_skipped integer := 0;
  v_merged integer := 0;
  v_conflicts integer := 0;
  v_rules_inserted integer := 0;
  v_rules_skipped integer := 0;
  v_rules_merged integer := 0;
  v_rules_advanced integer := 0;
  v_links_restored integer := 0;
  v_links_dropped integer := 0;
  v_report jsonb;
begin
  if v_owner is null or not public.is_authorized_user() then raise exception 'forbidden'; end if;
  if p_restore_key is null then raise exception 'restore_key_required'; end if;
  if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then raise exception 'payload_hash_required'; end if;
  if p_mode is null or p_mode not in ('skip', 'merge', 'replace') then raise exception 'invalid_restore_mode'; end if;
  if p_today is null then raise exception 'today_required'; end if;

  -- One restore at a time.
  perform pg_advisory_xact_lock(hashtext('receipt_tracker_restore_v2'));

  select r.restore_mode, r.payload_hash, r.report into v_previous
  from public.backup_restore_runs r where r.restore_key = p_restore_key;
  if found then
    if v_previous.restore_mode is distinct from p_mode or v_previous.payload_hash is distinct from p_payload_hash then
      raise exception 'restore_key_conflict';
    end if;
    return v_previous.report || jsonb_build_object('replayed', true);
  end if;

  if p_mode = 'replace' and p_replace_confirmation is distinct from 'RESTORE' then raise exception 'replace_confirmation_required'; end if;
  if jsonb_typeof(p_backup) <> 'object' or jsonb_typeof(p_backup->'expenses') <> 'array'
    or jsonb_typeof(coalesce(p_backup->'product_aliases', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_backup->'recurring_expenses', '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_backup_structure';
  end if;
  if split_part(coalesce(p_backup->>'export_version', ''), '.', 1) <> '1' then raise exception 'unsupported_export_major_version'; end if;
  if octet_length(p_backup::text) > 26214400 then raise exception 'backup_too_large'; end if;
  if p_backup::text ~* '"(receipt_image_url|signed_url|session_token|access_token|service_role_key|supabase_key|import_idempotency_key|creation_idempotency_key)"[[:space:]]*:' then
    raise exception 'forbidden_backup_field';
  end if;
  if jsonb_typeof(p_missing_attachments) <> 'array' then raise exception 'missing_attachments_must_be_array'; end if;
  if exists (select 1 from jsonb_array_elements(p_backup->'expenses') e group by e->>'id' having count(*) > 1) then
    raise exception 'duplicate_expense_id';
  end if;
  if p_mode = 'replace' then
    if coalesce((p_backup->'scope'->>'is_partial')::boolean, false)
      or (p_backup->'scope' is null and (nullif(p_backup->'date_range'->>'start', '') is not null or nullif(p_backup->'date_range'->>'end', '') is not null)) then
      raise exception 'partial_backup_replace_forbidden';
    end if;
    if not (p_backup ? 'recurring_expenses') then raise exception 'replace_requires_recurring_section'; end if;
  end if;

  -- Rows that existed before this restore; only these can absorb a backup row.
  drop table if exists pg_temp.restore_pre_existing;
  drop table if exists pg_temp.restore_claimed;
  drop table if exists pg_temp.restore_rows;
  create temp table restore_pre_existing (id uuid primary key) on commit drop;
  create temp table restore_claimed (id uuid primary key) on commit drop;
  create temp table restore_rows on commit drop as
    select t.ord, t.value as payload, (t.value->>'id')::uuid as id, null::uuid as target, null::text as match_kind
    from jsonb_array_elements(p_backup->'expenses') with ordinality as t(value, ord);

  if p_mode = 'replace' then
    delete from public.expenses where user_id = v_owner;
    delete from public.product_aliases where user_id = v_owner;
    delete from public.recurring_expenses where user_id = v_owner;
  else
    insert into pg_temp.restore_pre_existing select e.id from public.expenses e where e.user_id = v_owner;
  end if;

  -- Recurring rules first, so restored expenses can link to them.
  for v_rule in select value from jsonb_array_elements(coalesce(p_backup->'recurring_expenses', '[]'::jsonb)) loop
    v_next := (v_rule->>'next_run_date')::date;
    v_active := coalesce((v_rule->>'is_active')::boolean, true) and nullif(v_rule->>'cancelled_at', '') is null;
    -- Historical months are never backfilled. The current month's run is kept,
    -- so a rule restored mid-month still produces this month's expense once.
    if v_active and v_next < date_trunc('month', p_today)::date then
      v_next := public.next_recurring_run((v_rule->>'day_of_month')::integer, (v_rule->>'start_date')::date, date_trunc('month', p_today)::date);
      v_rules_advanced := v_rules_advanced + 1;
    end if;
    v_active := v_active and (nullif(v_rule->>'end_date', '') is null or v_next <= (v_rule->>'end_date')::date);
    if exists (select 1 from public.recurring_expenses r where r.id = (v_rule->>'id')::uuid) then
      if not exists (select 1 from public.recurring_expenses r where r.id = (v_rule->>'id')::uuid and r.user_id = v_owner) then
        raise exception 'recurring_rule_owner_mismatch';
      end if;
      if p_mode = 'merge' then
        update public.recurring_expenses r set merchant = btrim(v_rule->>'merchant'), amount = (v_rule->>'amount')::numeric,
          currency = upper(v_rule->>'currency'), category = v_rule->>'category', payment_method = nullif(btrim(v_rule->>'payment_method'), ''),
          notes = nullif(btrim(v_rule->>'notes'), ''), day_of_month = (v_rule->>'day_of_month')::integer,
          start_date = (v_rule->>'start_date')::date, end_date = nullif(v_rule->>'end_date', '')::date,
          is_active = v_active and r.cancelled_at is null, cancelled_at = coalesce(r.cancelled_at, nullif(v_rule->>'cancelled_at', '')::timestamptz),
          last_generated_for = greatest(r.last_generated_for, nullif(v_rule->>'last_generated_for', '')::date),
          next_run_date = greatest(r.next_run_date, v_next)
        where r.id = (v_rule->>'id')::uuid;
        v_rules_merged := v_rules_merged + 1;
      else
        v_rules_skipped := v_rules_skipped + 1;
      end if;
      continue;
    end if;
    insert into public.recurring_expenses (id, user_id, merchant, amount, currency, category, payment_method, notes, recurrence_type,
      day_of_month, start_date, end_date, is_active, cancelled_at, last_generated_for, next_run_date, source, timezone)
    values ((v_rule->>'id')::uuid, v_owner, btrim(v_rule->>'merchant'), (v_rule->>'amount')::numeric, upper(v_rule->>'currency'),
      v_rule->>'category', nullif(btrim(v_rule->>'payment_method'), ''), nullif(btrim(v_rule->>'notes'), ''), 'monthly',
      (v_rule->>'day_of_month')::integer, (v_rule->>'start_date')::date, nullif(v_rule->>'end_date', '')::date, v_active,
      nullif(v_rule->>'cancelled_at', '')::timestamptz, nullif(v_rule->>'last_generated_for', '')::date, v_next, 'recurring', 'Europe/Berlin');
    v_rules_inserted := v_rules_inserted + 1;
  end loop;

  if p_mode <> 'replace' then
    -- Pass 1: same id.
    update pg_temp.restore_rows r set target = r.id, match_kind = 'id'
    where exists (select 1 from pg_temp.restore_pre_existing p where p.id = r.id);
    insert into pg_temp.restore_claimed select target from pg_temp.restore_rows where target is not null on conflict do nothing;

    -- Pass 2: same recurring rule + period.
    for v_row in select r.ord, r.payload from pg_temp.restore_rows r
      where r.target is null and nullif(r.payload->>'recurring_expense_id', '') is not null and nullif(r.payload->>'recurring_period', '') is not null
      order by r.ord loop
      select e.id into v_target from public.expenses e join pg_temp.restore_pre_existing p on p.id = e.id
      where e.recurring_expense_id = (v_row.payload->>'recurring_expense_id')::uuid
        and e.recurring_period = (v_row.payload->>'recurring_period')::date
        and not exists (select 1 from pg_temp.restore_claimed c where c.id = e.id)
      limit 1;
      if v_target is not null then
        update pg_temp.restore_rows set target = v_target, match_kind = 'recurring_link' where ord = v_row.ord;
        insert into pg_temp.restore_claimed values (v_target);
      end if;
    end loop;

    -- Pass 3: same header signature, one existing row per backup row, oldest first.
    for v_row in select r.ord, r.payload from pg_temp.restore_rows r where r.target is null order by r.ord loop
      select e.id into v_target from public.expenses e join pg_temp.restore_pre_existing p on p.id = e.id
      where lower(btrim(e.merchant)) = lower(btrim(v_row.payload->>'merchant'))
        and e.expense_date = (v_row.payload->>'expense_date')::date
        and e.amount = (v_row.payload->>'amount')::numeric
        and e.currency = upper(v_row.payload->>'currency')
        and e.source = coalesce(nullif(v_row.payload->>'source', ''), 'manual')
        and not exists (select 1 from pg_temp.restore_claimed c where c.id = e.id)
      order by e.created_at, e.id
      limit 1;
      if v_target is not null then
        update pg_temp.restore_rows set target = v_target, match_kind = 'signature' where ord = v_row.ord;
        insert into pg_temp.restore_claimed values (v_target);
      end if;
    end loop;
  end if;

  for v_row in select r.ord, r.payload, r.id, r.target, r.match_kind from pg_temp.restore_rows r order by r.ord loop
    if v_row.target is not null and p_mode = 'skip' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_link_rule := nullif(v_row.payload->>'recurring_expense_id', '')::uuid;
    v_link_period := nullif(v_row.payload->>'recurring_period', '')::date;
    if v_link_rule is not null and (
      not exists (select 1 from public.recurring_expenses r where r.id = v_link_rule and r.user_id = v_owner)
      or (v_link_period is not null and exists (select 1 from public.expenses e where e.recurring_expense_id = v_link_rule and e.recurring_period = v_link_period))
    ) then
      v_link_rule := null;
      v_link_period := null;
      v_links_dropped := v_links_dropped + 1;
    elsif v_link_rule is null then
      v_link_period := null;
    end if;

    if v_row.target is null then
      v_target := v_row.id;
      insert into public.expenses (
        id, user_id, merchant, expense_date, amount, currency, category, payment_method, source,
        notes, receipt_image_path, raw_receipt_text, ai_confidence, import_warnings,
        recurring_expense_id, recurring_period, created_at, updated_at
      ) values (
        v_target, v_owner, btrim(v_row.payload->>'merchant'), (v_row.payload->>'expense_date')::date,
        (v_row.payload->>'amount')::numeric, upper(v_row.payload->>'currency'), v_row.payload->>'category',
        nullif(btrim(v_row.payload->>'payment_method'), ''), coalesce(nullif(v_row.payload->>'source', ''), 'manual'),
        nullif(btrim(v_row.payload->>'notes'), ''), nullif(v_row.payload->>'receipt_image_path', ''),
        nullif(v_row.payload->>'raw_receipt_text', ''), nullif(v_row.payload->>'ai_confidence', '')::numeric,
        coalesce(v_row.payload->'import_warnings', '[]'::jsonb), v_link_rule, v_link_period,
        coalesce(nullif(v_row.payload->>'created_at', '')::timestamptz, now()),
        coalesce(nullif(v_row.payload->>'updated_at', '')::timestamptz, now())
      );
      v_inserted_expenses := v_inserted_expenses + 1;
      if v_link_rule is not null then v_links_restored := v_links_restored + 1; end if;
    else
      v_target := v_row.target;
      v_merged := v_merged + 1;
      -- Conservative merge: only fill a missing link on the very same record.
      if v_row.match_kind = 'id' and v_link_rule is not null then
        update public.expenses e set recurring_expense_id = v_link_rule, recurring_period = v_link_period
        where e.id = v_target and e.recurring_expense_id is null;
        get diagnostics v_count = row_count;
        v_links_restored := v_links_restored + v_count;
      end if;
    end if;

    if jsonb_typeof(coalesce(v_row.payload->'items', '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(v_row.payload->'adjustments', '[]'::jsonb)) <> 'array' then
      raise exception 'expense_details_must_be_arrays';
    end if;
    if not exists (select 1 from public.expense_items where expense_id = v_target) then
      insert into public.expense_items (expense_id, name_original, name_normalized, english_name, brand, product_group, category, quantity, amount, confidence, notes, unit, unit_quantity)
      select v_target, coalesce(nullif(btrim(i.name_original), ''), 'N/A'), coalesce(nullif(btrim(i.name_normalized), ''), 'N/A'),
        coalesce(nullif(btrim(i.english_name), ''), 'N/A'), coalesce(nullif(btrim(i.brand), ''), 'N/A'),
        coalesce(nullif(btrim(i.product_group), ''), '其他'), coalesce(i.category, v_row.payload->>'category', '其他'),
        coalesce(i.quantity, 1), i.amount, i.confidence, coalesce(i.notes, ''),
        coalesce(nullif(btrim(i.unit), ''), 'N/A'), coalesce(i.unit_quantity, 1)
      from jsonb_to_recordset(coalesce(v_row.payload->'items', '[]'::jsonb)) as i(name_original text, name_normalized text, english_name text, brand text, product_group text, category text, quantity numeric, amount numeric, confidence numeric, notes text, unit text, unit_quantity numeric);
      get diagnostics v_count = row_count;
      v_inserted_items := v_inserted_items + v_count;
    end if;
    if not exists (select 1 from public.expense_adjustments where expense_id = v_target) then
      insert into public.expense_adjustments (expense_id, name, amount, category)
      select v_target, btrim(a.name), a.amount, coalesce(a.category, v_row.payload->>'category', '其他')
      from jsonb_to_recordset(coalesce(v_row.payload->'adjustments', '[]'::jsonb)) as a(name text, amount numeric, category text);
      get diagnostics v_count = row_count;
      v_inserted_adjustments := v_inserted_adjustments + v_count;
    end if;
  end loop;

  for v_alias in select value from jsonb_array_elements(coalesce(p_backup->'product_aliases', '[]'::jsonb)) loop
    if exists (select 1 from public.product_aliases a where a.alias_normalized = lower(regexp_replace(btrim(v_alias->>'alias'), '[[:space:]]+', ' ', 'g'))) then
      if exists (select 1 from public.product_aliases a where a.alias_normalized = lower(regexp_replace(btrim(v_alias->>'alias'), '[[:space:]]+', ' ', 'g')) and a.normalized_name <> v_alias->>'normalized_name') then
        v_conflicts := v_conflicts + 1;
      end if;
      continue;
    end if;
    insert into public.product_aliases (user_id, alias, normalized_name, product_group, category, brand)
    values (v_owner, btrim(v_alias->>'alias'), btrim(v_alias->>'normalized_name'), coalesce(nullif(btrim(v_alias->>'product_group'), ''), '其他'),
      nullif(v_alias->>'category', ''), coalesce(nullif(btrim(v_alias->>'brand'), ''), 'N/A'));
    v_inserted_aliases := v_inserted_aliases + 1;
  end loop;

  v_report := jsonb_build_object(
    'imported_expenses', v_inserted_expenses, 'imported_items', v_inserted_items,
    'imported_adjustments', v_inserted_adjustments, 'imported_aliases', v_inserted_aliases,
    'skipped_duplicates', v_skipped, 'merged_records', v_merged, 'conflicts', v_conflicts,
    'imported_recurring_expenses', v_rules_inserted, 'skipped_recurring_expenses', v_rules_skipped,
    'merged_recurring_expenses', v_rules_merged, 'advanced_recurring_rules', v_rules_advanced,
    'recurring_links_restored', v_links_restored, 'recurring_links_dropped', v_links_dropped,
    'missing_attachments', p_missing_attachments,
    'duration_ms', round(extract(epoch from (clock_timestamp() - v_started)) * 1000),
    'restore_mode', p_mode, 'restore_key', p_restore_key, 'atomic', true
  );
  insert into public.backup_restore_runs (restore_key, restore_mode, report, payload_hash) values (p_restore_key, p_mode, v_report, p_payload_hash);
  return v_report;
end;
$$;

revoke all on function public.restore_receipt_tracker_backup_v2(uuid, text, jsonb, text, text, jsonb, date) from public, anon;
grant execute on function public.restore_receipt_tracker_backup_v2(uuid, text, jsonb, text, text, jsonb, date) to authenticated;

-- The app no longer calls the legacy two-step restore. Remove direct access so
-- the non-atomic path cannot be used by accident. Rollback: grant execute ... to authenticated.
revoke execute on function public.restore_receipt_tracker_backup(uuid, text, jsonb, text, jsonb) from authenticated;
revoke execute on function public.restore_recurring_expenses(jsonb, jsonb, text) from authenticated;

comment on function public.restore_receipt_tracker_backup_v2(uuid, text, jsonb, text, text, jsonb, date) is
  'Atomic single-transaction restore (ledger, aliases, recurring rules and links) with one-to-one duplicate matching, restore-key/payload binding and partial-backup protection.';

commit;
