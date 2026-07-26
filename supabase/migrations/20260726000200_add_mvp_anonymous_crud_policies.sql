-- Development-only anonymous CRUD policies for the pre-authentication MVP.
-- RLS remains enabled. These policies allow the Vercel-hosted app to create,
-- update, and delete test expenses with the Supabase publishable key.

alter table public.expenses enable row level security;

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

-- Milestone 12 must remove these policies and replace them with policies that
-- require auth.uid() = user_id.
