-- Apply after /Users/dansangil/Desktop/Lovada/supabase/socialera-core.sql.
-- This migration keeps the social post create/read shape durable without
-- redesigning the existing social schema.

alter table if exists public.social_posts
  add column if not exists linked_product_ids bigint[],
  add column if not exists photo_url text;

update public.social_posts
set
  linked_product_ids = coalesce(linked_product_ids, '{}'::bigint[]),
  photo_url = coalesce(photo_url, '')
where linked_product_ids is null
   or photo_url is null;

alter table if exists public.social_posts
  alter column linked_product_ids set default '{}'::bigint[],
  alter column linked_product_ids set not null,
  alter column photo_url set default '',
  alter column photo_url set not null;

alter table if exists public.social_post_comments
  add column if not exists photo_url text,
  add column if not exists media_url text;

update public.social_post_comments
set
  photo_url = coalesce(photo_url, ''),
  media_url = coalesce(media_url, '')
where photo_url is null
   or media_url is null;

alter table if exists public.social_post_comments
  alter column photo_url set default '',
  alter column photo_url set not null,
  alter column media_url set default '',
  alter column media_url set not null;

create or replace function public.sync_social_post_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.post_id is not null then
    update public.social_posts
    set comments_count = (
      select count(*)::integer
      from public.social_post_comments
      where post_id = new.post_id
    )
    where id = new.post_id;
  end if;

  if tg_op in ('DELETE', 'UPDATE')
     and old.post_id is not null
     and (tg_op = 'DELETE' or old.post_id is distinct from new.post_id) then
    update public.social_posts
    set comments_count = (
      select count(*)::integer
      from public.social_post_comments
      where post_id = old.post_id
    )
    where id = old.post_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists social_post_comments_sync_comments_count on public.social_post_comments;
create trigger social_post_comments_sync_comments_count
after insert or delete or update of post_id on public.social_post_comments
for each row
execute function public.sync_social_post_comments_count();

with comment_counts as (
  select
    sp.id as post_id,
    count(c.id)::integer as comments_count
  from public.social_posts sp
  left join public.social_post_comments c
    on c.post_id = sp.id
  group by sp.id
)
update public.social_posts sp
set comments_count = comment_counts.comments_count
from comment_counts
where sp.id = comment_counts.post_id
  and sp.comments_count is distinct from comment_counts.comments_count;
