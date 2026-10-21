-- Private GIF attachments: 2 MiB before encoding. Run once.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('genesis-message-gifs','genesis-message-gifs',false,2097152,array['image/gif']);
create policy genesis_gif_upload on storage.objects for insert to authenticated
with check(bucket_id='genesis-message-gifs'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and genesis_private.is_approved());
create policy genesis_gif_read on storage.objects for select to authenticated
using(bucket_id='genesis-message-gifs' and genesis_private.is_approved());
create policy genesis_gif_delete_own on storage.objects for delete to authenticated
using(bucket_id='genesis-message-gifs'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and genesis_private.is_approved());
commit;
