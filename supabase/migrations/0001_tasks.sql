-- One row per task per user: a copy of what the clients hold.
--
-- The client's local data.json stays the source of truth. This table exists so
-- a second device can catch up, not so the server can become the original --
-- if it goes away, every installed app keeps working on its own file.
--
-- Two rules are enforced here rather than in any client, because a client can
-- be old, wrong, or lying:
--   * last-write-wins, ties going to the row already stored
--   * server_seq is handed out by the server, never accepted from a client
-- Both live in tasks_before_write() below.

-- The sync cursor. One sequence for the whole table: a client only ever reads
-- rows of its own user, so gaps in its view of the numbers are expected and
-- harmless -- what matters is that the numbers only ever go up.
create sequence if not exists public.tasks_seq;

create table if not exists public.tasks (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Made by the client (Date.now() + random, no coordination). Scoping the key
  -- to the user makes a collision between two people impossible instead of
  -- merely unlikely, and costs nothing -- every query is per-user anyway.
  id text not null,

  text text,
  quadrant text,
  space text,
  due_date text,
  memo text,
  order_key text,

  -- Client clocks, in epoch milliseconds. Kept as the client wrote them: they
  -- are the LWW input, and rewriting them server-side would break the compare.
  created_at bigint,
  updated_at bigint not null default 0,
  completed_at bigint,
  deleted_at bigint,
  -- A permanently deleted task is a tombstone, not a missing row. Dropping the
  -- row instead would let a device that has not synced yet push it back.
  purged_at bigint,

  server_seq bigint not null,

  primary key (user_id, id)
);

-- The one query a client makes when pulling: everything of mine past a cursor.
create index if not exists tasks_user_seq_idx
  on public.tasks (user_id, server_seq);

create or replace function public.tasks_before_write()
returns trigger
language plpgsql
as $$
begin
  -- Last-write-wins. An update carrying an older -- or equal -- updated_at is
  -- dropped silently (returning null in a BEFORE trigger skips the row).
  --
  -- The tie has to go to the row already stored. If both sides kept their own
  -- copy on a tie, two devices that edited in the same millisecond would never
  -- converge; the client yields on ties for exactly the same reason, so the
  -- pair of rules settles on whatever the server holds.
  if TG_OP = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;

  -- The cursor is the server's to hand out. A client clock cannot order writes
  -- made on other machines, and one that is wrong would make its own changes
  -- invisible to everyone else forever.
  new.server_seq := nextval('public.tasks_seq');
  return new;
end;
$$;

drop trigger if exists tasks_before_write on public.tasks;
create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- Grants ---------------------------------------------------------------------
-- Spelled out rather than left to Supabase's default privileges, which are a
-- project setting and not part of this file.
--
-- The sequence grant is the one that is easy to miss: tasks_before_write() is
-- not security definer, so nextval() runs as whoever is writing. Without it
-- every insert fails on permission, and only at runtime.

grant select, insert, update on public.tasks to authenticated;
grant usage, select on sequence public.tasks_seq to authenticated;

-- Signed out means no tasks at all. The policies below would refuse anyway --
-- auth.uid() is null and matches no row -- but a caller that cannot reach the
-- table does not have to be argued with.
revoke all on public.tasks from anon;
revoke all on sequence public.tasks_seq from anon;

-- Row level security ---------------------------------------------------------
-- The anon key is public by design; this is the actual boundary.

alter table public.tasks enable row level security;

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks
  for select using (auth.uid() = user_id);

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks
  for insert with check (auth.uid() = user_id);

drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Deliberately no delete policy: deleting is a tombstone (purged_at), never a
-- removed row, so no client should be able to make one disappear. The only
-- real delete is the cleanup below, which runs as service_role and bypasses
-- RLS.

-- Tombstone cleanup ----------------------------------------------------------

-- 90 days, the same TTL as TOMBSTONE_TTL_MS in src/shared/core.js. If one side
-- changes, change both: a server that forgets first would let a client push an
-- expired tombstone back in.
create or replace function public.purge_expired_tombstones()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.tasks
   where purged_at is not null
     and purged_at < (extract(epoch from now()) * 1000)::bigint
                     - (90 * 24 * 60 * 60 * 1000);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_expired_tombstones() from public, anon, authenticated;
