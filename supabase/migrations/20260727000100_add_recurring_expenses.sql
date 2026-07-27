-- Monthly recurring expenses. Uses only the publishable-key MVP role and RLS;
-- no service-role key is required by the application or Vercel Cron.

alter table public.expenses drop constraint if exists expenses_source_check;
alter table public.expenses add constraint expenses_source_check
  check (source in ('manual', 'chatgpt_import', 'receipt_upload', 'recurring'));

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  merchant text not null check (char_length(trim(merchant)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  currency varchar(3) not null default 'EUR' check (currency = upper(currency) and char_length(currency) = 3),
  category text not null check (category in ('食品雜貨','餐飲','交通','日用品','家具家電','醫療','娛樂','房租','保險','教育','旅行','其他')),
  payment_method text null,
  notes text null,
  recurrence_type text not null default 'monthly' check (recurrence_type = 'monthly'),
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_date date not null,
  end_date date null,
  is_active boolean not null default true,
  cancelled_at timestamptz null,
  last_generated_for date null,
  next_run_date date not null,
  source text not null default 'recurring' check (source = 'recurring'),
  timezone text not null default 'Europe/Berlin' check (timezone = 'Europe/Berlin'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_expenses_dates_check check (end_date is null or end_date >= start_date)
);

create index if not exists recurring_expenses_is_active_idx on public.recurring_expenses (is_active);
create index if not exists recurring_expenses_next_run_date_idx on public.recurring_expenses (next_run_date);
create index if not exists recurring_expenses_day_of_month_idx on public.recurring_expenses (day_of_month);

alter table public.expenses
  add column if not exists recurring_expense_id uuid null references public.recurring_expenses(id) on delete set null,
  add column if not exists recurring_period date null;

create unique index if not exists expenses_recurring_period_unique
  on public.expenses (recurring_expense_id, recurring_period)
  where recurring_expense_id is not null and recurring_period is not null;

drop trigger if exists recurring_expenses_set_updated_at on public.recurring_expenses;
create trigger recurring_expenses_set_updated_at before update on public.recurring_expenses
for each row execute function public.set_updated_at();

alter table public.recurring_expenses enable row level security;
grant select, insert, update, delete on public.recurring_expenses to anon, authenticated;
drop policy if exists "MVP public read recurring expenses" on public.recurring_expenses;
create policy "MVP public read recurring expenses" on public.recurring_expenses for select to anon, authenticated using (true);
drop policy if exists "MVP public insert recurring expenses" on public.recurring_expenses;
create policy "MVP public insert recurring expenses" on public.recurring_expenses for insert to anon, authenticated with check (true);
drop policy if exists "MVP public update recurring expenses" on public.recurring_expenses;
create policy "MVP public update recurring expenses" on public.recurring_expenses for update to anon, authenticated using (true) with check (true);
drop policy if exists "MVP public delete recurring expenses" on public.recurring_expenses;
create policy "MVP public delete recurring expenses" on public.recurring_expenses for delete to anon, authenticated using (true);

create or replace function public.recurring_scheduled_date(p_year integer, p_month integer, p_day integer)
returns date language sql immutable set search_path = '' as $$
  select make_date(p_year, p_month, least(p_day, extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::integer));
$$;

create or replace function public.next_recurring_run(p_day integer, p_start date, p_from date)
returns date language plpgsql immutable set search_path = public as $$
declare v_candidate date; v_month date;
begin
  v_month := date_trunc('month', greatest(p_start, p_from))::date;
  v_candidate := public.recurring_scheduled_date(extract(year from v_month)::integer, extract(month from v_month)::integer, p_day);
  if v_candidate < greatest(p_start, p_from) then
    v_month := (v_month + interval '1 month')::date;
    v_candidate := public.recurring_scheduled_date(extract(year from v_month)::integer, extract(month from v_month)::integer, p_day);
  end if;
  return v_candidate;
end; $$;

create or replace function public.prepare_recurring_expense()
returns trigger language plpgsql set search_path = public as $$
begin
  new.currency := upper(trim(new.currency));
  new.merchant := trim(new.merchant);
  if new.next_run_date is null then new.next_run_date := public.next_recurring_run(new.day_of_month, new.start_date, new.start_date); end if;
  return new;
end; $$;
drop trigger if exists recurring_expenses_prepare on public.recurring_expenses;
create trigger recurring_expenses_prepare before insert on public.recurring_expenses
for each row execute function public.prepare_recurring_expense();

create or replace function public.process_due_recurring_expenses(
  p_today date default ((now() at time zone 'Europe/Berlin')::date), p_max_periods integer default 12
) returns jsonb language plpgsql security invoker set search_path = public as $$
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
      insert into public.expenses (merchant, expense_date, amount, currency, category, payment_method, notes, source, recurring_expense_id, recurring_period)
      values (v_rule.merchant, v_run, v_rule.amount, v_rule.currency, v_rule.category, v_rule.payment_method, v_rule.notes, 'recurring', v_rule.id, v_period)
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
end; $$;

create or replace function public.resume_recurring_expense(p_id uuid, p_today date default ((now() at time zone 'Europe/Berlin')::date))
returns date language plpgsql security invoker set search_path = public as $$
declare v_rule public.recurring_expenses%rowtype; v_next date;
begin
  select * into v_rule from public.recurring_expenses where id = p_id for update;
  if not found or v_rule.cancelled_at is not null then raise exception 'recurring_rule_not_resumable'; end if;
  v_next := public.next_recurring_run(v_rule.day_of_month, v_rule.start_date, p_today);
  update public.recurring_expenses set is_active = (end_date is null or v_next <= end_date), next_run_date = v_next where id = p_id;
  return v_next;
end; $$;

create or replace function public.generate_recurring_expense_now(p_id uuid, p_mode text, p_today date default ((now() at time zone 'Europe/Berlin')::date))
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_rule public.recurring_expenses%rowtype; v_id uuid; v_period date;
begin
  if p_mode not in ('current_period', 'extra') then raise exception 'invalid_generation_mode'; end if;
  select * into v_rule from public.recurring_expenses where id = p_id;
  if not found then raise exception 'recurring_rule_not_found'; end if;
  if v_rule.cancelled_at is not null then raise exception 'recurring_rule_cancelled'; end if;
  if p_today < v_rule.start_date or (v_rule.end_date is not null and p_today > v_rule.end_date) then raise exception 'date_outside_recurring_rule'; end if;
  v_period := case when p_mode = 'current_period' then date_trunc('month', p_today)::date else null end;
  insert into public.expenses (merchant, expense_date, amount, currency, category, payment_method, notes, source, recurring_expense_id, recurring_period)
  values (v_rule.merchant, p_today, v_rule.amount, v_rule.currency, v_rule.category, v_rule.payment_method, v_rule.notes, 'recurring', v_rule.id, v_period)
  on conflict (recurring_expense_id, recurring_period) where recurring_expense_id is not null and recurring_period is not null do nothing returning id into v_id;
  if v_id is null and p_mode = 'current_period' then select id into v_id from public.expenses where recurring_expense_id = p_id and recurring_period = v_period; end if;
  return v_id;
end; $$;

create or replace function public.restore_recurring_expenses(p_rules jsonb, p_expenses jsonb, p_mode text)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_count integer := 0;
begin
  if jsonb_typeof(p_rules) <> 'array' or p_mode not in ('skip','merge','replace') then raise exception 'invalid_recurring_restore'; end if;
  if p_mode = 'replace' then delete from public.recurring_expenses; end if;
  insert into public.recurring_expenses (id, merchant, amount, currency, category, payment_method, notes, recurrence_type, day_of_month, start_date, end_date, is_active, cancelled_at, last_generated_for, next_run_date, source, timezone)
  select r.id, trim(r.merchant), r.amount, upper(r.currency), r.category, r.payment_method, r.notes, 'monthly', r.day_of_month, r.start_date, r.end_date, r.is_active, r.cancelled_at, r.last_generated_for, r.next_run_date, 'recurring', 'Europe/Berlin'
  from jsonb_to_recordset(p_rules) as r(id uuid, merchant text, amount numeric, currency text, category text, payment_method text, notes text, day_of_month integer, start_date date, end_date date, is_active boolean, cancelled_at timestamptz, last_generated_for date, next_run_date date)
  on conflict (id) do update set merchant = excluded.merchant, amount = excluded.amount, currency = excluded.currency, category = excluded.category,
    payment_method = excluded.payment_method, notes = excluded.notes, day_of_month = excluded.day_of_month, start_date = excluded.start_date,
    end_date = excluded.end_date, is_active = excluded.is_active, cancelled_at = excluded.cancelled_at,
    last_generated_for = excluded.last_generated_for, next_run_date = excluded.next_run_date
  where p_mode = 'merge';
  get diagnostics v_count = row_count;
  update public.expenses e set recurring_expense_id = x.recurring_expense_id, recurring_period = x.recurring_period
  from jsonb_to_recordset(p_expenses) as x(id uuid, recurring_expense_id uuid, recurring_period date)
  where e.id = x.id and x.recurring_expense_id is not null and exists (select 1 from public.recurring_expenses r where r.id = x.recurring_expense_id);
  return v_count;
end; $$;

revoke all on function public.process_due_recurring_expenses(date, integer), public.resume_recurring_expense(uuid, date), public.generate_recurring_expense_now(uuid, text, date), public.restore_recurring_expenses(jsonb, jsonb, text) from public;
grant execute on function public.process_due_recurring_expenses(date, integer), public.resume_recurring_expense(uuid, date), public.generate_recurring_expense_now(uuid, text, date), public.restore_recurring_expenses(jsonb, jsonb, text) to anon, authenticated;
