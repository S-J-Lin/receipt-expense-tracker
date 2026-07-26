-- Milestone 7: receipt uploads for the anonymous MVP.
-- The bucket remains private. Temporary anonymous policies permit access only
-- inside the `anonymous/` folder and must be replaced by user-scoped policies
-- when Supabase Auth is introduced.

alter table public.expenses
  add column if not exists receipt_image_path text null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'receipts',
  'receipts',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "MVP anonymous receipt uploads" on storage.objects;
create policy "MVP anonymous receipt uploads"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = 'anonymous'
);

drop policy if exists "MVP anonymous receipt reads" on storage.objects;
create policy "MVP anonymous receipt reads"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = 'anonymous'
);

drop policy if exists "MVP anonymous receipt deletes" on storage.objects;
create policy "MVP anonymous receipt deletes"
on storage.objects
for delete
to anon, authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = 'anonymous'
);

-- No UPDATE policy is provided. Uploads use unique paths with upsert disabled,
-- so existing objects cannot be overwritten through the MVP application.
-- Anonymous users can still access or delete any object whose random path they
-- know. Replace these policies with auth.uid()-scoped policies in Milestone 12.
