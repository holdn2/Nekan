-- A burial is final. The state half stops being able to undo one.
--
-- 0004 split the row in two and let each half go to whichever side stamped it
-- later. That is right for the pair the state half was named after -- a task
-- moves between completed and trashed, and the last device to move it says
-- where it stands -- but purging is not a third place. It is the end, and what
-- is left is a marker: this id existed, do not take it back.
--
-- Handing that half to a device that merely trashed the task rubs the marker
-- out:
--
--   1. Phone purges a task      -> text emptied, purged_at set, both stamps T
--   2. Laptop, which has not seen that yet, trashes the same task
--                               -> deleted_at set, state stamp T+1
--   3. Merge                    -> content from the phone (empty text),
--                                  state from the laptop (no purged_at)
--
-- The task is alive again on both devices, with no text, because the content
-- half came from the side that buried it and burying is what emptied it. The
-- empty rows people see are this.
--
-- This predates the split. Before 0004 the laptop's whole row won and the task
-- came back *with* its text, which is worse and was equally silent; the split
-- did not cause the bug, it changed what the bug looks like. The clients carry
-- the same rule -- shared/sync/merge.ts and main/store.ts -- and all three have
-- to agree or the row settles differently depending on who is asked.
--
-- Nothing is lost by keeping it. Neither app has a screen that undoes a purge,
-- and the only thing that removes a tombstone is the 90-day TTL: locally
-- dropExpiredTombstones(), here purge_expired_tombstones().

create or replace function public.tasks_before_write()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' then
    -- Each half is kept or replaced on its own. The tie goes to the row
    -- already stored, in both halves and for the reason it always did: if
    -- both sides kept their own copy on a tie, two devices that wrote in the
    -- same millisecond would never converge. The clients yield on ties too.
    if new.updated_at <= old.updated_at then
      new.text       := old.text;
      new.quadrant   := old.quadrant;
      new.space      := old.space;
      new.due_date   := old.due_date;
      new.memo       := old.memo;
      new.order_key  := old.order_key;
      new.created_at := old.created_at;
      new.updated_at := old.updated_at;
    end if;

    if new.state_at <= old.state_at then
      new.completed_at := old.completed_at;
      new.deleted_at   := old.deleted_at;
      new.purged_at    := old.purged_at;
      new.state_at     := old.state_at;
    end if;

    -- And then the one exception, after the halves have settled. A newer
    -- state half may arrive without the burial this row already carries; it
    -- does not get to take it away. When the half was kept above this is
    -- already old.purged_at and the coalesce changes nothing.
    new.purged_at := coalesce(new.purged_at, old.purged_at);

    -- Neither half moved: nothing to store, and no sequence number to spend.
    -- Returning null in a BEFORE trigger skips the row silently, which is what
    -- it did before for the whole row. Reached only when both halves tied, so
    -- the line above was a no-op and there is no burial being dropped here.
    if new.updated_at <= old.updated_at and new.state_at <= old.state_at then
      return null;
    end if;
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

-- No backfill. Rows that were resurrected before this are already alive with
-- their text gone, and the server cannot tell those apart from a task somebody
-- emptied on purpose -- the burial that would prove it is exactly what was
-- lost. They stay as they are; this stops new ones.
