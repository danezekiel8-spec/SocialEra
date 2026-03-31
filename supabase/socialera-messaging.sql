create extension if not exists pgcrypto;

create table if not exists public.chat_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  username text not null default '',
  avatar_url text not null default '',
  bio text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_message_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null default timezone('utc', now()),
  last_read_at timestamptz,
  constraint conversation_participants_pkey primary key (conversation_id, user_id),
  constraint conversation_participants_conversation_id_fkey
    foreign key (conversation_id) references public.conversations (id) on delete cascade,
  constraint conversation_participants_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  sender_id uuid not null,
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  reactions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint messages_conversation_id_fkey
    foreign key (conversation_id) references public.conversations (id) on delete cascade,
  constraint messages_sender_id_fkey
    foreign key (sender_id) references auth.users (id) on delete cascade
);

create index if not exists chat_profiles_display_name_idx
  on public.chat_profiles (lower(display_name));

create index if not exists chat_profiles_username_idx
  on public.chat_profiles (lower(username));

create index if not exists conversations_last_message_at_idx
  on public.conversations (last_message_at desc);

create index if not exists conversation_participants_user_id_idx
  on public.conversation_participants (user_id, conversation_id);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.touch_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set
    updated_at = coalesce(new.created_at, timezone('utc', now())),
    last_message_at = coalesce(new.created_at, timezone('utc', now()))
  where id = new.conversation_id;

  return new;
end;
$$;

create or replace function public.is_conversation_participant(
  check_conversation_id uuid,
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
    from public.conversation_participants cp
    where cp.conversation_id = check_conversation_id
      and cp.user_id = check_user_id
  );
$$;

create or replace function public.open_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_conversation_id uuid;
  new_conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if other_user_id is null then
    raise exception 'A recipient is required';
  end if;

  if current_user_id = other_user_id then
    raise exception 'You cannot start a direct conversation with yourself';
  end if;

  if not exists (
    select 1
    from public.chat_profiles
    where user_id = other_user_id
  ) then
    raise exception 'That member is not available for chat yet';
  end if;

  select c.id
  into existing_conversation_id
  from public.conversations c
  join public.conversation_participants cp
    on cp.conversation_id = c.id
  where c.kind = 'direct'
    and cp.user_id in (current_user_id, other_user_id)
  group by c.id
  having count(*) = 2
    and count(*) filter (where cp.user_id = current_user_id) = 1
    and count(*) filter (where cp.user_id = other_user_id) = 1
    and (
      select count(*)
      from public.conversation_participants all_participants
      where all_participants.conversation_id = c.id
    ) = 2
  limit 1;

  if existing_conversation_id is not null then
    return existing_conversation_id;
  end if;

  insert into public.conversations (kind, created_by)
  values ('direct', current_user_id)
  returning id into new_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id, joined_at, last_read_at)
  values
    (new_conversation_id, current_user_id, timezone('utc', now()), timezone('utc', now())),
    (new_conversation_id, other_user_id, timezone('utc', now()), null);

  return new_conversation_id;
end;
$$;

drop trigger if exists chat_profiles_set_updated_at on public.chat_profiles;
create trigger chat_profiles_set_updated_at
before update on public.chat_profiles
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row
execute function public.touch_conversation_from_message();

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_body_or_attachment_check;
alter table public.messages
add constraint messages_body_or_attachment_check
check (
  char_length(trim(coalesce(body, ''))) between 1 and 2000
  or (
    jsonb_typeof(attachments) = 'array'
    and jsonb_array_length(attachments) > 0
  )
);

alter table public.chat_profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

drop policy if exists "chat_profiles_select_authenticated" on public.chat_profiles;
create policy "chat_profiles_select_authenticated"
on public.chat_profiles
for select
to authenticated
using (true);

drop policy if exists "chat_profiles_insert_self" on public.chat_profiles;
create policy "chat_profiles_insert_self"
on public.chat_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "chat_profiles_update_self" on public.chat_profiles;
create policy "chat_profiles_update_self"
on public.chat_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
on public.conversations
for select
to authenticated
using (
  public.is_conversation_participant(conversations.id)
);

drop policy if exists "conversations_insert_creator" on public.conversations;
create policy "conversations_insert_creator"
on public.conversations
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "conversation_participants_select_participant" on public.conversation_participants;
create policy "conversation_participants_select_participant"
on public.conversation_participants
for select
to authenticated
using (
  public.is_conversation_participant(conversation_participants.conversation_id)
);

drop policy if exists "conversation_participants_update_self" on public.conversation_participants;
create policy "conversation_participants_update_self"
on public.conversation_participants
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
on public.messages
for select
to authenticated
using (
  public.is_conversation_participant(messages.conversation_id)
);

drop policy if exists "messages_insert_sender" on public.messages;
create policy "messages_insert_sender"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and public.is_conversation_participant(messages.conversation_id)
);

drop policy if exists "messages_update_participant" on public.messages;
create policy "messages_update_participant"
on public.messages
for update
to authenticated
using (
  public.is_conversation_participant(messages.conversation_id)
)
with check (
  public.is_conversation_participant(messages.conversation_id)
);

grant execute on function public.open_direct_conversation(uuid) to authenticated;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;
