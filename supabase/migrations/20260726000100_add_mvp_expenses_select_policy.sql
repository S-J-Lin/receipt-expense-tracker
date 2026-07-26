-- Development-only policy for the pre-authentication MVP.
-- It permits clients using the Supabase publishable key to read test expenses,
-- but it does not grant insert, update, or delete access.

alter table public.expenses enable row level security;

grant select on table public.expenses to anon, authenticated;

drop policy if exists "MVP public read expenses" on public.expenses;
create policy "MVP public read expenses"
on public.expenses
for select
to anon, authenticated
using (true);

-- Replace this policy with user-scoped RLS in Milestone 10:
-- user_id = auth.uid()
