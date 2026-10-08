-- Forward-only performance optimization; no data, grants, owner or RPC changes.
begin;

do $$ begin
  if to_regprocedure('public.is_authorized_user()') is null
    or to_regclass('receipt_tracker_private.app_owner') is null then
    raise exception 'Owner lockdown must be applied before RLS initplan optimization';
  end if;
  if exists (
    select 1 from pg_policies p
    where ((p.schemaname = 'public' and p.tablename in ('expenses','expense_items','expense_adjustments','recurring_expenses','product_aliases'))
      or (p.schemaname = 'storage' and p.tablename = 'objects'))
    and not (
      p.roles = array['authenticated']::name[] and p.permissive = 'PERMISSIVE'
      and ((p.schemaname = 'public' and p.cmd = 'ALL' and (p.tablename, p.policyname) in (
        ('expenses','owner expenses'), ('expense_items','owner expense items'),
        ('expense_adjustments','owner expense adjustments'), ('recurring_expenses','owner recurring expenses'),
        ('product_aliases','owner product aliases')))
      or (p.schemaname = 'storage' and p.tablename = 'objects' and (p.policyname, p.cmd) in (
        ('owner receipt reads','SELECT'), ('owner receipt uploads','INSERT'),
        ('owner receipt updates','UPDATE'), ('owner receipt deletes','DELETE'))))
    )
  ) then raise exception 'Unexpected RLS policy name, roles, command or permissiveness; review before optimization'; end if;
  if (select count(*) from pg_policies where
    (schemaname = 'public' and tablename in ('expenses','expense_items','expense_adjustments','recurring_expenses','product_aliases'))
    or (schemaname = 'storage' and tablename = 'objects')) <> 9 then
    raise exception 'Expected exactly nine owner policies; review missing policies before optimization';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where ((n.nspname = 'public' and c.relname in ('expenses','expense_items','expense_adjustments','recurring_expenses','product_aliases'))
      or (n.nspname = 'storage' and c.relname = 'objects')) and not c.relrowsecurity) then
    raise exception 'RLS must remain enabled';
  end if;
end $$;

drop policy "owner expenses" on public.expenses;
create policy "owner expenses" on public.expenses for all to authenticated
using ((select public.is_authorized_user()) and user_id = (select auth.uid()))
with check ((select public.is_authorized_user()) and user_id = (select auth.uid()));
drop policy "owner expense items" on public.expense_items;
create policy "owner expense items" on public.expense_items for all to authenticated
using ((select public.is_authorized_user()) and exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = (select auth.uid())))
with check ((select public.is_authorized_user()) and exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = (select auth.uid())));
drop policy "owner expense adjustments" on public.expense_adjustments;
create policy "owner expense adjustments" on public.expense_adjustments for all to authenticated
using ((select public.is_authorized_user()) and exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = (select auth.uid())))
with check ((select public.is_authorized_user()) and exists (select 1 from public.expenses e where e.id = expense_id and e.user_id = (select auth.uid())));
drop policy "owner recurring expenses" on public.recurring_expenses;
create policy "owner recurring expenses" on public.recurring_expenses for all to authenticated
using ((select public.is_authorized_user()) and user_id = (select auth.uid()))
with check ((select public.is_authorized_user()) and user_id = (select auth.uid()));
drop policy "owner product aliases" on public.product_aliases;
create policy "owner product aliases" on public.product_aliases for all to authenticated
using ((select public.is_authorized_user()) and user_id = (select auth.uid()))
with check ((select public.is_authorized_user()) and user_id = (select auth.uid()));

drop policy "owner receipt reads" on storage.objects;
create policy "owner receipt reads" on storage.objects for select to authenticated using (
  bucket_id = 'receipts' and (select public.is_authorized_user())
  and (storage.foldername(name))[1] in ((select auth.uid())::text, 'anonymous'));
drop policy "owner receipt uploads" on storage.objects;
create policy "owner receipt uploads" on storage.objects for insert to authenticated with check (
  bucket_id = 'receipts' and (select public.is_authorized_user()) and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy "owner receipt updates" on storage.objects;
create policy "owner receipt updates" on storage.objects for update to authenticated
using (bucket_id = 'receipts' and (select public.is_authorized_user()) and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'receipts' and (select public.is_authorized_user()) and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy "owner receipt deletes" on storage.objects;
create policy "owner receipt deletes" on storage.objects for delete to authenticated using (
  bucket_id = 'receipts' and (select public.is_authorized_user())
  and (storage.foldername(name))[1] in ((select auth.uid())::text, 'anonymous'));

commit;
