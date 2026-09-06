-- Two stamps per task, and a trigger that compares them separately.
--
-- Until now a task carried one stamp and last-write-wins took the whole row.
-- That loses work in a shape people actually hit: complete a task on the
-- phone, write a memo on the laptop before the phone's row arrives, and the
-- laptop's row wins -- carrying the memo it wrote and the empty completion it
-- never touched. The task comes back to life on both devices, and nothing
-- anywhere reports a conflict, because from LWW's side nothing went wrong.
--
-- So `updated_at` now means "the content changed" -- text, place, order, memo,
-- due date -- and `state_at` means "the state changed" -- completed, trashed,
-- purged. Each half goes to whichever side stamped it later.
--
-- This is not field-by-field merging, which would want a stamp per column and
-- somewhere to keep them. It buys the case where two devices changed
-- *different halves* of the same task, and leaves the rest alone: two devices
-- editing the same memo still settle on one of them.

-- Applying this and updating the clients is one sitting, not two.
--
-- A client from before the split stamps the whole row with `updated_at` and
-- sends no `state_at` -- and PostgREST updates only the columns it was given,
-- so the trigger sees the stored value as `new` and reads a tie. Its content
-- half lands and its completion is dropped. Worse, on that client's next pull
-- the server's row ties on `updated_at`, the server wins the tie, and the
-- completion goes from the screen too.
--
-- The other order is no better. A new client completing a task stamps only
-- `state_at`, and the old trigger compares `updated_at`, sees no change, and
-- skips the row -- while the client's watermark moves past it. That one is a
-- permanent loss, not a delayed one.
--
-- There is no clause that fixes both, because a BEFORE trigger cannot tell
-- "no state_at was sent" from "a state_at equal to mine was sent", and the
-- rules those two need are opposite. So the answer is not SQL: apply this and
-- put the new code on every device before using any of them again.

alter table public.tasks
  add column if not exists state_at bigint not null default 0;

-- Existing rows carried one stamp for the whole row, so that is what their
-- state stamp is. Zero would say "this row's state is older than anything",
-- and the first row to arrive from any device would take the state half of
-- every task in the account.
update public.tasks set state_at = updated_at where state_at = 0;

-- The clients do the same, in `stateStamp()`: a row with no state stamp
-- answers with its content stamp. The two rules have to agree or a row that
-- predates this migration would merge differently on either side.

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

    -- Neither half moved: nothing to store, and no sequence number to spend.
    -- Returning null in a BEFORE trigger skips the row silently, which is what
    -- it did before for the whole row.
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
