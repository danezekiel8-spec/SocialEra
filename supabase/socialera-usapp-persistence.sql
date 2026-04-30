create extension if not exists pgcrypto;

-- Apply after /Users/dansangil/Desktop/Lovada/supabase/socialera-messaging.sql.
-- This file extends the existing member messaging schema for Usapp durability
-- without replacing the current conversations/messages model.

create or replace function public.try_parse_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if nullif(trim(value), '') is null then
    return null;
  end if;

  return trim(value)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.try_parse_integer(value text)
returns integer
language plpgsql
immutable
as $$
begin
  if nullif(trim(value), '') is null then
    return null;
  end if;

  return trim(value)::integer;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.is_message_participant(
  check_message_id uuid,
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.messages m
    join public.conversation_participants cp
      on cp.conversation_id = m.conversation_id
    where m.id = check_message_id
      and cp.user_id = check_user_id
  );
$$;

create or replace function public.extract_reply_meta_field(
  raw_attachments jsonb,
  lookup_keys text[]
)
returns text
language sql
immutable
as $$
  with attachment_rows as (
    select value
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(raw_attachments, '[]'::jsonb)) = 'array' then coalesce(raw_attachments, '[]'::jsonb)
        else '[]'::jsonb
      end
    )
  )
  select nullif(trim(candidate.value), '')
  from attachment_rows rows
  cross join lateral (
    select rows.value ->> key as value
    from unnest(coalesce(lookup_keys, '{}'::text[])) as key
    where nullif(trim(rows.value ->> key), '') is not null
    limit 1
  ) candidate
  where coalesce(rows.value ->> 'kind', '') = 'reply-meta'
  limit 1;
$$;

alter table public.chat_profiles
  add column if not exists actor_id text,
  add column if not exists member_classification text not null default 'member',
  add column if not exists intro text not null default 'Start a direct message with this member.',
  add column if not exists topic text not null default '',
  add column if not exists source_post_id text not null default '',
  add column if not exists last_active_at timestamptz not null default timezone('utc', now()),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.chat_profiles
set
  actor_id = coalesce(nullif(trim(actor_id), ''), 'user-' || user_id::text),
  member_classification = case
    when lower(trim(coalesce(member_classification, ''))) in ('member', 'creator', 'support') then lower(trim(member_classification))
    else 'member'
  end,
  intro = coalesce(intro, 'Start a direct message with this member.'),
  topic = coalesce(topic, ''),
  source_post_id = coalesce(source_post_id, ''),
  last_active_at = coalesce(last_active_at, updated_at, created_at, timezone('utc', now())),
  metadata = case
    when jsonb_typeof(coalesce(metadata, '{}'::jsonb)) = 'object' then coalesce(metadata, '{}'::jsonb)
    else '{}'::jsonb
  end
where
  actor_id is null
  or trim(actor_id) = ''
  or member_classification is null
  or intro is null
  or topic is null
  or source_post_id is null
  or last_active_at is null
  or jsonb_typeof(coalesce(metadata, '{}'::jsonb)) <> 'object';

alter table public.chat_profiles
  alter column actor_id set not null;

alter table public.chat_profiles drop constraint if exists chat_profiles_member_classification_check;
alter table public.chat_profiles
add constraint chat_profiles_member_classification_check
check (member_classification in ('member', 'creator', 'support'));

alter table public.chat_profiles drop constraint if exists chat_profiles_metadata_object_check;
alter table public.chat_profiles
add constraint chat_profiles_metadata_object_check
check (jsonb_typeof(metadata) = 'object');

create unique index if not exists chat_profiles_actor_id_idx
  on public.chat_profiles (actor_id);

create index if not exists chat_profiles_member_classification_idx
  on public.chat_profiles (member_classification, last_active_at desc);

create or replace function public.resolve_chat_actor_id(check_user_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when check_user_id is null then null
    else coalesce(
      (
        select nullif(trim(cp.actor_id), '')
        from public.chat_profiles cp
        where cp.user_id = check_user_id
      ),
      'user-' || check_user_id::text
    )
  end;
$$;

create or replace function public.resolve_chat_user_id_from_actor_id(check_actor_id text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  normalized_actor_id text := nullif(trim(check_actor_id), '');
  resolved_user_id uuid;
begin
  if normalized_actor_id is null then
    return null;
  end if;

  select cp.user_id
  into resolved_user_id
  from public.chat_profiles cp
  where cp.actor_id = normalized_actor_id
  limit 1;

  if resolved_user_id is not null then
    return resolved_user_id;
  end if;

  if normalized_actor_id like 'user-%' then
    return public.try_parse_uuid(substring(normalized_actor_id from 6));
  end if;

  return public.try_parse_uuid(normalized_actor_id);
end;
$$;

create or replace function public.set_chat_profile_usapp_defaults()
returns trigger
language plpgsql
as $$
begin
  new.actor_id := coalesce(nullif(trim(new.actor_id), ''), 'user-' || new.user_id::text);
  new.member_classification := case
    when lower(trim(coalesce(new.member_classification, ''))) in ('member', 'creator', 'support') then lower(trim(new.member_classification))
    else 'member'
  end;
  new.intro := coalesce(new.intro, 'Start a direct message with this member.');
  new.topic := coalesce(new.topic, '');
  new.source_post_id := coalesce(new.source_post_id, '');
  new.last_active_at := coalesce(new.last_active_at, new.updated_at, new.created_at, timezone('utc', now()));
  new.metadata := case
    when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)) = 'object' then coalesce(new.metadata, '{}'::jsonb)
    else '{}'::jsonb
  end;
  return new;
end;
$$;

create or replace function public.touch_chat_profile_last_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_profiles
  set last_active_at = coalesce(new.created_at, timezone('utc', now()))
  where user_id = new.sender_id;

  return new;
end;
$$;

drop trigger if exists chat_profiles_set_usapp_defaults on public.chat_profiles;
create trigger chat_profiles_set_usapp_defaults
before insert or update on public.chat_profiles
for each row
execute function public.set_chat_profile_usapp_defaults();

drop trigger if exists messages_touch_chat_profile_last_active on public.messages;
create trigger messages_touch_chat_profile_last_active
after insert on public.messages
for each row
execute function public.touch_chat_profile_last_active();

alter table public.conversations
  add column if not exists native_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.conversations
set
  native_id = coalesce(nullif(trim(native_id), ''), id::text),
  metadata = case
    when jsonb_typeof(coalesce(metadata, '{}'::jsonb)) = 'object' then coalesce(metadata, '{}'::jsonb)
    else '{}'::jsonb
  end
where
  native_id is null
  or trim(native_id) = ''
  or jsonb_typeof(coalesce(metadata, '{}'::jsonb)) <> 'object';

alter table public.conversations
  alter column native_id set not null;

alter table public.conversations drop constraint if exists conversations_metadata_object_check;
alter table public.conversations
add constraint conversations_metadata_object_check
check (jsonb_typeof(metadata) = 'object');

create unique index if not exists conversations_native_id_idx
  on public.conversations (native_id);

create or replace function public.set_conversation_usapp_defaults()
returns trigger
language plpgsql
as $$
begin
  new.native_id := coalesce(nullif(trim(new.native_id), ''), new.id::text);
  new.metadata := case
    when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)) = 'object' then coalesce(new.metadata, '{}'::jsonb)
    else '{}'::jsonb
  end;
  return new;
end;
$$;

drop trigger if exists conversations_set_usapp_defaults on public.conversations;
create trigger conversations_set_usapp_defaults
before insert or update on public.conversations
for each row
execute function public.set_conversation_usapp_defaults();

alter table public.conversation_participants
  add column if not exists muted_at timestamptz,
  add column if not exists forced_unread_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists state_updated_at timestamptz not null default timezone('utc', now());

update public.conversation_participants
set state_updated_at = coalesce(state_updated_at, last_read_at, joined_at, timezone('utc', now()))
where state_updated_at is null;

create index if not exists conversation_participants_user_state_updated_idx
  on public.conversation_participants (user_id, state_updated_at desc);

create index if not exists conversation_participants_user_muted_idx
  on public.conversation_participants (user_id, conversation_id)
  where muted_at is not null;

create index if not exists conversation_participants_user_forced_unread_idx
  on public.conversation_participants (user_id, conversation_id)
  where forced_unread_at is not null;

create index if not exists conversation_participants_user_archived_idx
  on public.conversation_participants (user_id, conversation_id)
  where archived_at is not null;

create or replace function public.touch_conversation_participant_state_timestamp()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.state_updated_at := coalesce(new.state_updated_at, timezone('utc', now()));
    return new;
  end if;

  if (
    new.last_read_at is distinct from old.last_read_at
    or new.muted_at is distinct from old.muted_at
    or new.forced_unread_at is distinct from old.forced_unread_at
    or new.archived_at is distinct from old.archived_at
  ) then
    new.state_updated_at := timezone('utc', now());
  else
    new.state_updated_at := coalesce(old.state_updated_at, new.state_updated_at, timezone('utc', now()));
  end if;

  return new;
end;
$$;

drop trigger if exists conversation_participants_touch_state_timestamp on public.conversation_participants;
create trigger conversation_participants_touch_state_timestamp
before insert or update on public.conversation_participants
for each row
execute function public.touch_conversation_participant_state_timestamp();

alter table public.messages
  add column if not exists native_id text,
  add column if not exists reply_to_message_id uuid references public.messages (id) on delete set null,
  add column if not exists reply_to_native_id text not null default '',
  add column if not exists reply_preview_author text not null default '',
  add column if not exists reply_preview_text text not null default '',
  add column if not exists edited_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.messages
set
  native_id = coalesce(nullif(trim(native_id), ''), id::text),
  reply_to_native_id = coalesce(
    nullif(trim(reply_to_native_id), ''),
    public.extract_reply_meta_field(attachments, array['replyToMessageId', 'reply_to_message_id']),
    ''
  ),
  reply_preview_author = coalesce(
    nullif(reply_preview_author, ''),
    public.extract_reply_meta_field(attachments, array['replyPreviewAuthor', 'reply_preview_author']),
    ''
  ),
  reply_preview_text = coalesce(
    nullif(reply_preview_text, ''),
    public.extract_reply_meta_field(attachments, array['replyPreviewText', 'reply_preview_text']),
    ''
  ),
  metadata = case
    when jsonb_typeof(coalesce(metadata, '{}'::jsonb)) = 'object' then coalesce(metadata, '{}'::jsonb)
    else '{}'::jsonb
  end,
  attachments = case
    when jsonb_typeof(coalesce(attachments, '[]'::jsonb)) = 'array' then coalesce(attachments, '[]'::jsonb)
    else '[]'::jsonb
  end,
  reactions = case
    when jsonb_typeof(coalesce(reactions, '[]'::jsonb)) = 'array' then coalesce(reactions, '[]'::jsonb)
    else '[]'::jsonb
  end
where
  native_id is null
  or trim(native_id) = ''
  or reply_to_native_id is null
  or reply_preview_author is null
  or reply_preview_text is null
  or jsonb_typeof(coalesce(metadata, '{}'::jsonb)) <> 'object'
  or jsonb_typeof(coalesce(attachments, '[]'::jsonb)) <> 'array'
  or jsonb_typeof(coalesce(reactions, '[]'::jsonb)) <> 'array';

update public.messages m
set reply_to_message_id = referenced.id
from public.messages referenced
where m.reply_to_message_id is null
  and nullif(trim(m.reply_to_native_id), '') is not null
  and (
    referenced.native_id = m.reply_to_native_id
    or referenced.id::text = m.reply_to_native_id
  );

alter table public.messages
  alter column native_id set not null;

alter table public.messages drop constraint if exists messages_attachments_array_check;
alter table public.messages
add constraint messages_attachments_array_check
check (jsonb_typeof(attachments) = 'array');

alter table public.messages drop constraint if exists messages_reactions_array_check;
alter table public.messages
add constraint messages_reactions_array_check
check (jsonb_typeof(reactions) = 'array');

alter table public.messages drop constraint if exists messages_metadata_object_check;
alter table public.messages
add constraint messages_metadata_object_check
check (jsonb_typeof(metadata) = 'object');

create unique index if not exists messages_native_id_idx
  on public.messages (native_id);

create index if not exists messages_reply_to_message_id_idx
  on public.messages (reply_to_message_id);

create or replace function public.set_message_usapp_defaults()
returns trigger
language plpgsql
as $$
declare
  reply_meta_native_id text;
  reply_meta_author text;
  reply_meta_text text;
begin
  new.native_id := coalesce(nullif(trim(new.native_id), ''), new.id::text);
  new.attachments := case
    when jsonb_typeof(coalesce(new.attachments, '[]'::jsonb)) = 'array' then coalesce(new.attachments, '[]'::jsonb)
    else '[]'::jsonb
  end;
  new.reactions := case
    when jsonb_typeof(coalesce(new.reactions, '[]'::jsonb)) = 'array' then coalesce(new.reactions, '[]'::jsonb)
    else '[]'::jsonb
  end;
  new.metadata := case
    when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)) = 'object' then coalesce(new.metadata, '{}'::jsonb)
    else '{}'::jsonb
  end;

  reply_meta_native_id := public.extract_reply_meta_field(new.attachments, array['replyToMessageId', 'reply_to_message_id']);
  reply_meta_author := public.extract_reply_meta_field(new.attachments, array['replyPreviewAuthor', 'reply_preview_author']);
  reply_meta_text := public.extract_reply_meta_field(new.attachments, array['replyPreviewText', 'reply_preview_text']);

  new.reply_to_native_id := coalesce(nullif(trim(new.reply_to_native_id), ''), reply_meta_native_id, '');
  new.reply_preview_author := coalesce(nullif(trim(new.reply_preview_author), ''), reply_meta_author, '');
  new.reply_preview_text := coalesce(nullif(trim(new.reply_preview_text), ''), reply_meta_text, '');

  if new.reply_to_message_id is null and nullif(trim(new.reply_to_native_id), '') is not null then
    select existing.id
    into new.reply_to_message_id
    from public.messages existing
    where existing.native_id = new.reply_to_native_id
       or existing.id::text = new.reply_to_native_id
    limit 1;
  elsif new.reply_to_message_id is not null and nullif(trim(new.reply_to_native_id), '') is null then
    select coalesce(nullif(trim(existing.native_id), ''), existing.id::text)
    into new.reply_to_native_id
    from public.messages existing
    where existing.id = new.reply_to_message_id
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_set_usapp_defaults on public.messages;
create trigger messages_set_usapp_defaults
before insert or update on public.messages
for each row
execute function public.set_message_usapp_defaults();

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  native_id text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  name text not null default 'Attachment',
  mime_type text not null default 'application/octet-stream',
  size_bytes integer not null default 0 check (size_bytes >= 0),
  kind text not null default 'file' check (kind in ('image', 'audio', 'video', 'file', 'reply-meta', 'system')),
  url text not null default '',
  storage_bucket text not null default '',
  storage_path text not null default '',
  preview_url text not null default '',
  width integer check (width is null or width >= 0),
  height integer check (height is null or height >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  checksum text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint message_attachments_message_native_id_key unique (message_id, native_id)
);

create index if not exists message_attachments_message_id_idx
  on public.message_attachments (message_id, sort_order, created_at);

create index if not exists message_attachments_storage_lookup_idx
  on public.message_attachments (storage_bucket, storage_path)
  where storage_bucket <> '' and storage_path <> '';

alter table public.message_attachments drop constraint if exists message_attachments_payload_object_check;
alter table public.message_attachments
add constraint message_attachments_payload_object_check
check (jsonb_typeof(payload) = 'object');

create or replace function public.set_message_attachment_defaults()
returns trigger
language plpgsql
as $$
begin
  new.native_id := coalesce(nullif(trim(new.native_id), ''), new.id::text);
  new.name := coalesce(nullif(trim(new.name), ''), 'Attachment');
  new.mime_type := coalesce(nullif(trim(new.mime_type), ''), 'application/octet-stream');
  new.kind := case
    when lower(trim(coalesce(new.kind, ''))) in ('image', 'audio', 'video', 'file', 'reply-meta', 'system') then lower(trim(new.kind))
    else 'file'
  end;
  new.size_bytes := greatest(coalesce(new.size_bytes, 0), 0);
  new.payload := case
    when jsonb_typeof(coalesce(new.payload, '{}'::jsonb)) = 'object' then coalesce(new.payload, '{}'::jsonb)
    else '{}'::jsonb
  end;
  return new;
end;
$$;

drop trigger if exists message_attachments_set_defaults on public.message_attachments;
create trigger message_attachments_set_defaults
before insert or update on public.message_attachments
for each row
execute function public.set_message_attachment_defaults();

drop trigger if exists message_attachments_set_updated_at on public.message_attachments;
create trigger message_attachments_set_updated_at
before update on public.message_attachments
for each row
execute function public.set_updated_at_timestamp();

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_id text not null,
  emoji text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint message_reactions_message_id_user_id_emoji_key unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_id_idx
  on public.message_reactions (message_id, created_at);

create index if not exists message_reactions_actor_id_idx
  on public.message_reactions (actor_id, created_at desc);

alter table public.message_reactions drop constraint if exists message_reactions_emoji_nonempty_check;
alter table public.message_reactions
add constraint message_reactions_emoji_nonempty_check
check (char_length(trim(emoji)) > 0);

create or replace function public.set_message_reaction_defaults()
returns trigger
language plpgsql
as $$
begin
  new.actor_id := coalesce(nullif(trim(new.actor_id), ''), public.resolve_chat_actor_id(new.user_id));
  new.emoji := trim(new.emoji);
  return new;
end;
$$;

drop trigger if exists message_reactions_set_defaults on public.message_reactions;
create trigger message_reactions_set_defaults
before insert or update on public.message_reactions
for each row
execute function public.set_message_reaction_defaults();

create table if not exists public.usapp_user_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  actor_id text not null,
  notification_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists usapp_user_states_actor_id_idx
  on public.usapp_user_states (actor_id);

create index if not exists usapp_user_states_updated_at_idx
  on public.usapp_user_states (updated_at desc);

alter table public.usapp_user_states drop constraint if exists usapp_user_states_metadata_object_check;
alter table public.usapp_user_states
add constraint usapp_user_states_metadata_object_check
check (jsonb_typeof(metadata) = 'object');

create or replace function public.set_usapp_user_state_defaults()
returns trigger
language plpgsql
as $$
begin
  new.actor_id := coalesce(nullif(trim(new.actor_id), ''), public.resolve_chat_actor_id(new.user_id));
  new.metadata := case
    when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)) = 'object' then coalesce(new.metadata, '{}'::jsonb)
    else '{}'::jsonb
  end;
  return new;
end;
$$;

create or replace function public.touch_chat_profile_last_active_from_usapp_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_profiles
  set last_active_at = timezone('utc', now())
  where user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists usapp_user_states_set_defaults on public.usapp_user_states;
create trigger usapp_user_states_set_defaults
before insert or update on public.usapp_user_states
for each row
execute function public.set_usapp_user_state_defaults();

drop trigger if exists usapp_user_states_set_updated_at on public.usapp_user_states;
create trigger usapp_user_states_set_updated_at
before update on public.usapp_user_states
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists usapp_user_states_touch_chat_profile_last_active on public.usapp_user_states;
create trigger usapp_user_states_touch_chat_profile_last_active
after insert or update on public.usapp_user_states
for each row
execute function public.touch_chat_profile_last_active_from_usapp_state();

create table if not exists public.usapp_local_threads (
  id text primary key,
  native_id text not null,
  owner_actor_id text not null,
  contact jsonb not null default '{}'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists usapp_local_threads_native_id_idx
  on public.usapp_local_threads (native_id);

create index if not exists usapp_local_threads_owner_actor_idx
  on public.usapp_local_threads (owner_actor_id, updated_at desc);

alter table public.usapp_local_threads drop constraint if exists usapp_local_threads_contact_object_check;
alter table public.usapp_local_threads
add constraint usapp_local_threads_contact_object_check
check (jsonb_typeof(contact) = 'object');

alter table public.usapp_local_threads drop constraint if exists usapp_local_threads_messages_array_check;
alter table public.usapp_local_threads
add constraint usapp_local_threads_messages_array_check
check (jsonb_typeof(messages) = 'array');

alter table public.usapp_local_threads drop constraint if exists usapp_local_threads_metadata_object_check;
alter table public.usapp_local_threads
add constraint usapp_local_threads_metadata_object_check
check (jsonb_typeof(metadata) = 'object');

create or replace function public.set_usapp_local_thread_defaults()
returns trigger
language plpgsql
as $$
begin
  new.id := coalesce(nullif(trim(new.id), ''), gen_random_uuid()::text);
  new.native_id := coalesce(nullif(trim(new.native_id), ''), new.id);
  new.owner_actor_id := coalesce(nullif(trim(new.owner_actor_id), ''), '');
  new.contact := case
    when jsonb_typeof(coalesce(new.contact, '{}'::jsonb)) = 'object' then coalesce(new.contact, '{}'::jsonb)
    else '{}'::jsonb
  end;
  new.messages := case
    when jsonb_typeof(coalesce(new.messages, '[]'::jsonb)) = 'array' then coalesce(new.messages, '[]'::jsonb)
    else '[]'::jsonb
  end;
  new.metadata := case
    when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)) = 'object' then coalesce(new.metadata, '{}'::jsonb)
    else '{}'::jsonb
  end;
  return new;
end;
$$;

drop trigger if exists usapp_local_threads_set_defaults on public.usapp_local_threads;
create trigger usapp_local_threads_set_defaults
before insert or update on public.usapp_local_threads
for each row
execute function public.set_usapp_local_thread_defaults();

drop trigger if exists usapp_local_threads_set_updated_at on public.usapp_local_threads;
create trigger usapp_local_threads_set_updated_at
before update on public.usapp_local_threads
for each row
execute function public.set_updated_at_timestamp();

create or replace function public.build_message_attachment_cache(check_message_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      (
        coalesce(ma.payload, '{}'::jsonb)
        || jsonb_strip_nulls(
          jsonb_build_object(
            'id', coalesce(nullif(trim(ma.native_id), ''), ma.id::text),
            'name', ma.name,
            'type', ma.mime_type,
            'size', ma.size_bytes,
            'kind', ma.kind,
            'url', nullif(ma.url, ''),
            'previewUrl', nullif(ma.preview_url, ''),
            'storageBucket', nullif(ma.storage_bucket, ''),
            'storagePath', nullif(ma.storage_path, ''),
            'checksum', nullif(ma.checksum, ''),
            'width', ma.width,
            'height', ma.height,
            'durationMs', ma.duration_ms
          )
        )
      )
      order by ma.sort_order, ma.created_at, ma.id
    ),
    '[]'::jsonb
  )
  from public.message_attachments ma
  where ma.message_id = check_message_id;
$$;

create or replace function public.build_message_reaction_cache(check_message_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'emoji', grouped.emoji,
        'actorIds', grouped.actor_ids
      )
      order by grouped.first_created_at, grouped.emoji
    ),
    '[]'::jsonb
  )
  from (
    select
      mr.emoji,
      min(mr.created_at) as first_created_at,
      to_jsonb(array_agg(mr.actor_id order by mr.created_at, mr.id)) as actor_ids
    from public.message_reactions mr
    where mr.message_id = check_message_id
    group by mr.emoji
  ) grouped;
$$;

create or replace function public.refresh_message_attachments_cache(check_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
  set attachments = public.build_message_attachment_cache(check_message_id)
  where id = check_message_id;
end;
$$;

create or replace function public.refresh_message_reactions_cache(check_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
  set reactions = public.build_message_reaction_cache(check_message_id)
  where id = check_message_id;
end;
$$;

create or replace function public.handle_message_attachment_cache_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  perform public.refresh_message_attachments_cache(coalesce(new.message_id, old.message_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.handle_message_reaction_cache_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  perform public.refresh_message_reactions_cache(coalesce(new.message_id, old.message_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists message_attachments_refresh_message_cache on public.message_attachments;
create trigger message_attachments_refresh_message_cache
after insert or update or delete on public.message_attachments
for each row
execute function public.handle_message_attachment_cache_refresh();

drop trigger if exists message_reactions_refresh_message_cache on public.message_reactions;
create trigger message_reactions_refresh_message_cache
after insert or update or delete on public.message_reactions
for each row
execute function public.handle_message_reaction_cache_refresh();

create or replace function public.sync_message_children_from_cache()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  delete from public.message_attachments
  where message_id = new.id;

  insert into public.message_attachments (
    message_id,
    native_id,
    sort_order,
    name,
    mime_type,
    size_bytes,
    kind,
    url,
    storage_bucket,
    storage_path,
    preview_url,
    width,
    height,
    duration_ms,
    checksum,
    payload,
    created_at,
    updated_at
  )
  select
    new.id,
    coalesce(
      nullif(trim(attachment.value ->> 'id'), ''),
      nullif(trim(attachment.value ->> 'nativeId'), ''),
      new.id::text || ':attachment:' || attachment.ordinality::text
    ),
    greatest(coalesce(attachment.ordinality - 1, 0), 0),
    left(coalesce(nullif(trim(attachment.value ->> 'name'), ''), 'Attachment'), 120),
    left(coalesce(nullif(trim(attachment.value ->> 'type'), ''), 'application/octet-stream'), 255),
    greatest(coalesce(public.try_parse_integer(attachment.value ->> 'size'), 0), 0),
    case
      when lower(trim(coalesce(attachment.value ->> 'kind', ''))) in ('image', 'audio', 'video', 'file', 'reply-meta', 'system') then lower(trim(attachment.value ->> 'kind'))
      else 'file'
    end,
    coalesce(
      nullif(trim(attachment.value ->> 'url'), ''),
      nullif(trim(attachment.value ->> 'dataUrl'), ''),
      ''
    ),
    coalesce(nullif(trim(attachment.value ->> 'storageBucket'), ''), ''),
    coalesce(nullif(trim(attachment.value ->> 'storagePath'), ''), ''),
    coalesce(nullif(trim(attachment.value ->> 'previewUrl'), ''), ''),
    public.try_parse_integer(attachment.value ->> 'width'),
    public.try_parse_integer(attachment.value ->> 'height'),
    public.try_parse_integer(attachment.value ->> 'durationMs'),
    coalesce(nullif(trim(attachment.value ->> 'checksum'), ''), ''),
    case
      when jsonb_typeof(coalesce(attachment.value, '{}'::jsonb)) = 'object' then
        attachment.value - array[
          'id',
          'nativeId',
          'name',
          'type',
          'size',
          'kind',
          'url',
          'dataUrl',
          'storageBucket',
          'storagePath',
          'previewUrl',
          'width',
          'height',
          'durationMs',
          'checksum'
        ]
      else '{}'::jsonb
    end,
    coalesce(new.created_at, timezone('utc', now())),
    timezone('utc', now())
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(new.attachments, '[]'::jsonb)) = 'array' then coalesce(new.attachments, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) with ordinality as attachment(value, ordinality);

  delete from public.message_reactions
  where message_id = new.id;

  insert into public.message_reactions (
    message_id,
    user_id,
    actor_id,
    emoji,
    created_at
  )
  select
    new.id,
    resolved.user_id,
    resolved.actor_id,
    resolved.emoji,
    coalesce(new.created_at, timezone('utc', now()))
  from (
    select distinct
      nullif(trim(reaction.value ->> 'emoji'), '') as emoji,
      nullif(trim(actor_id_rows.actor_id), '') as actor_id,
      public.resolve_chat_user_id_from_actor_id(actor_id_rows.actor_id) as user_id
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(new.reactions, '[]'::jsonb)) = 'array' then coalesce(new.reactions, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as reaction(value)
    cross join lateral jsonb_array_elements_text(
      case
        when jsonb_typeof(coalesce(reaction.value -> 'actorIds', '[]'::jsonb)) = 'array' then coalesce(reaction.value -> 'actorIds', '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as actor_id_rows(actor_id)
  ) resolved
  where resolved.emoji is not null
    and resolved.actor_id is not null
    and resolved.user_id is not null;

  return new;
end;
$$;

drop trigger if exists messages_sync_children_from_cache on public.messages;
create trigger messages_sync_children_from_cache
after insert or update of attachments, reactions on public.messages
for each row
execute function public.sync_message_children_from_cache();

insert into public.message_attachments (
  message_id,
  native_id,
  sort_order,
  name,
  mime_type,
  size_bytes,
  kind,
  url,
  storage_bucket,
  storage_path,
  preview_url,
  width,
  height,
  duration_ms,
  checksum,
  payload,
  created_at,
  updated_at
)
select
  m.id,
  coalesce(
    nullif(trim(attachment.value ->> 'id'), ''),
    nullif(trim(attachment.value ->> 'nativeId'), ''),
    m.id::text || ':attachment:' || attachment.ordinality::text
  ),
  greatest(coalesce(attachment.ordinality - 1, 0), 0),
  left(coalesce(nullif(trim(attachment.value ->> 'name'), ''), 'Attachment'), 120),
  left(coalesce(nullif(trim(attachment.value ->> 'type'), ''), 'application/octet-stream'), 255),
  greatest(coalesce(public.try_parse_integer(attachment.value ->> 'size'), 0), 0),
  case
    when lower(trim(coalesce(attachment.value ->> 'kind', ''))) in ('image', 'audio', 'video', 'file', 'reply-meta', 'system') then lower(trim(attachment.value ->> 'kind'))
    else 'file'
  end,
  coalesce(
    nullif(trim(attachment.value ->> 'url'), ''),
    nullif(trim(attachment.value ->> 'dataUrl'), ''),
    ''
  ),
  coalesce(nullif(trim(attachment.value ->> 'storageBucket'), ''), ''),
  coalesce(nullif(trim(attachment.value ->> 'storagePath'), ''), ''),
  coalesce(nullif(trim(attachment.value ->> 'previewUrl'), ''), ''),
  public.try_parse_integer(attachment.value ->> 'width'),
  public.try_parse_integer(attachment.value ->> 'height'),
  public.try_parse_integer(attachment.value ->> 'durationMs'),
  coalesce(nullif(trim(attachment.value ->> 'checksum'), ''), ''),
  case
    when jsonb_typeof(coalesce(attachment.value, '{}'::jsonb)) = 'object' then
      attachment.value - array[
        'id',
        'nativeId',
        'name',
        'type',
        'size',
        'kind',
        'url',
        'dataUrl',
        'storageBucket',
        'storagePath',
        'previewUrl',
        'width',
        'height',
        'durationMs',
        'checksum'
      ]
    else '{}'::jsonb
  end,
  coalesce(m.created_at, timezone('utc', now())),
  timezone('utc', now())
from public.messages m
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(coalesce(m.attachments, '[]'::jsonb)) = 'array' then coalesce(m.attachments, '[]'::jsonb)
    else '[]'::jsonb
  end
) with ordinality as attachment(value, ordinality)
on conflict (message_id, native_id) do nothing;

insert into public.message_reactions (
  message_id,
  user_id,
  actor_id,
  emoji,
  created_at
)
select
  resolved.message_id,
  resolved.user_id,
  resolved.actor_id,
  resolved.emoji,
  resolved.created_at
from (
  select distinct
    m.id as message_id,
    public.resolve_chat_user_id_from_actor_id(actor_id_rows.actor_id) as user_id,
    nullif(trim(actor_id_rows.actor_id), '') as actor_id,
    nullif(trim(reaction.value ->> 'emoji'), '') as emoji,
    coalesce(m.created_at, timezone('utc', now())) as created_at
  from public.messages m
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(m.reactions, '[]'::jsonb)) = 'array' then coalesce(m.reactions, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) as reaction(value)
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(coalesce(reaction.value -> 'actorIds', '[]'::jsonb)) = 'array' then coalesce(reaction.value -> 'actorIds', '[]'::jsonb)
      else '[]'::jsonb
    end
  ) as actor_id_rows(actor_id)
) resolved
where resolved.user_id is not null
  and resolved.actor_id is not null
  and resolved.emoji is not null
on conflict (message_id, user_id, emoji) do nothing;

create or replace function public.build_usapp_user_state(check_user_id uuid default auth.uid())
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with account_state as (
    select *
    from public.usapp_user_states uus
    where uus.user_id = check_user_id
  ),
  thread_state as (
    select
      cp.conversation_id,
      coalesce(nullif(trim(c.native_id), ''), c.id::text) as conversation_native_id,
      cp.last_read_at,
      cp.muted_at,
      cp.forced_unread_at,
      cp.state_updated_at
    from public.conversation_participants cp
    join public.conversations c
      on c.id = cp.conversation_id
    where cp.user_id = check_user_id
      and cp.archived_at is null
  )
  select jsonb_build_object(
    'actorId', public.resolve_chat_actor_id(check_user_id),
    'notificationSeenAt', coalesce((select to_jsonb(notification_seen_at) from account_state), '""'::jsonb),
    'mutedThreadIds', coalesce((
      select jsonb_agg(conversation_native_id order by muted_at desc, conversation_native_id)
      from thread_state
      where muted_at is not null
    ), '[]'::jsonb),
    'forcedUnreadThreadIds', coalesce((
      select jsonb_agg(conversation_native_id order by forced_unread_at desc, conversation_native_id)
      from thread_state
      where forced_unread_at is not null
    ), '[]'::jsonb),
    'threadReadState', coalesce((
      select jsonb_object_agg(conversation_native_id, last_read_at)
      from thread_state
      where last_read_at is not null
    ), '{}'::jsonb),
    'updatedAt', coalesce(
      (
        select to_jsonb(max(candidate.seen_at))
        from (
          select updated_at as seen_at from account_state
          union all
          select state_updated_at as seen_at from thread_state
        ) candidate
        where candidate.seen_at is not null
      ),
      to_jsonb(timezone('utc', now()))
    )
  );
$$;

alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.usapp_user_states enable row level security;
alter table public.usapp_local_threads enable row level security;

drop policy if exists "message_attachments_select_participant" on public.message_attachments;
create policy "message_attachments_select_participant"
on public.message_attachments
for select
to authenticated
using (
  public.is_message_participant(message_attachments.message_id)
);

drop policy if exists "message_attachments_insert_participant" on public.message_attachments;
create policy "message_attachments_insert_participant"
on public.message_attachments
for insert
to authenticated
with check (
  public.is_message_participant(message_attachments.message_id)
);

drop policy if exists "message_attachments_update_participant" on public.message_attachments;
create policy "message_attachments_update_participant"
on public.message_attachments
for update
to authenticated
using (
  public.is_message_participant(message_attachments.message_id)
)
with check (
  public.is_message_participant(message_attachments.message_id)
);

drop policy if exists "message_attachments_delete_participant" on public.message_attachments;
create policy "message_attachments_delete_participant"
on public.message_attachments
for delete
to authenticated
using (
  public.is_message_participant(message_attachments.message_id)
);

drop policy if exists "message_reactions_select_participant" on public.message_reactions;
create policy "message_reactions_select_participant"
on public.message_reactions
for select
to authenticated
using (
  public.is_message_participant(message_reactions.message_id)
);

drop policy if exists "message_reactions_insert_self" on public.message_reactions;
create policy "message_reactions_insert_self"
on public.message_reactions
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.is_message_participant(message_reactions.message_id)
);

drop policy if exists "message_reactions_update_self" on public.message_reactions;
create policy "message_reactions_update_self"
on public.message_reactions
for update
to authenticated
using (
  auth.uid() = user_id
  and public.is_message_participant(message_reactions.message_id)
)
with check (
  auth.uid() = user_id
  and public.is_message_participant(message_reactions.message_id)
);

drop policy if exists "message_reactions_delete_self" on public.message_reactions;
create policy "message_reactions_delete_self"
on public.message_reactions
for delete
to authenticated
using (
  auth.uid() = user_id
  and public.is_message_participant(message_reactions.message_id)
);

drop policy if exists "usapp_user_states_select_self" on public.usapp_user_states;
create policy "usapp_user_states_select_self"
on public.usapp_user_states
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "usapp_user_states_insert_self" on public.usapp_user_states;
create policy "usapp_user_states_insert_self"
on public.usapp_user_states
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "usapp_user_states_update_self" on public.usapp_user_states;
create policy "usapp_user_states_update_self"
on public.usapp_user_states
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "usapp_local_threads_select_owner" on public.usapp_local_threads;
create policy "usapp_local_threads_select_owner"
on public.usapp_local_threads
for select
to authenticated
using (public.resolve_chat_user_id_from_actor_id(owner_actor_id) = auth.uid());

drop policy if exists "usapp_local_threads_insert_owner" on public.usapp_local_threads;
create policy "usapp_local_threads_insert_owner"
on public.usapp_local_threads
for insert
to authenticated
with check (public.resolve_chat_user_id_from_actor_id(owner_actor_id) = auth.uid());

drop policy if exists "usapp_local_threads_update_owner" on public.usapp_local_threads;
create policy "usapp_local_threads_update_owner"
on public.usapp_local_threads
for update
to authenticated
using (public.resolve_chat_user_id_from_actor_id(owner_actor_id) = auth.uid())
with check (public.resolve_chat_user_id_from_actor_id(owner_actor_id) = auth.uid());

drop policy if exists "usapp_local_threads_delete_owner" on public.usapp_local_threads;
create policy "usapp_local_threads_delete_owner"
on public.usapp_local_threads
for delete
to authenticated
using (public.resolve_chat_user_id_from_actor_id(owner_actor_id) = auth.uid());

grant execute on function public.is_message_participant(uuid, uuid) to authenticated;
grant execute on function public.build_usapp_user_state(uuid) to authenticated;
