-- Two holes in 0005, both found in review, both the same shape: the burial was
-- being treated as part of the state half when it belongs to neither.
--
-- ONE. The state half assigns `new.purged_at := old.purged_at` before the
-- coalesce runs, so an *incoming* burial whose state stamp lost was already
-- overwritten by the time the coalesce looked. Reachable: device A purges at
-- T, device B completes the same task at T+1 and reaches the server first.
-- A's burial then arrives with the older state stamp and is dropped -- the
-- exact case 0005 was written to stop, surviving in the direction nobody
-- tested. The clients had it right, so the three places did not agree.
--
-- TWO. Keeping the tombstone while the content half takes the newer text puts
-- the words back. The row is invisible -- every screen filters a purged row
-- out -- but the text is stored, and it is pushed to every device and sits
-- here for the ninety days the tombstone lives. Somebody asked for those
-- words to be destroyed and they were not.
--
-- So the burial is settled first, out of both comparisons, and a row that
-- carries one carries nothing else. The skip at the end has to know about it:
-- a write whose halves both tie can still be the one delivering the burial,
-- and returning null would throw it away in silence.

create or replace function public.tasks_before_write()
returns trigger
language plpgsql
as $$
declare
  buried bigint;
begin
  if TG_OP = 'UPDATE' then
    -- Before either half, and out of the reach of both. A burial does not
    -- race: whichever side holds one is the side that is right, because the
    -- other side simply has not heard yet.
    buried := coalesce(new.purged_at, old.purged_at);

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

    -- No purged_at here any more. It is not a place the task can be in, and
    -- letting the state winner carry it is what let a trash undo a burial.
    if new.state_at <= old.state_at then
      new.completed_at := old.completed_at;
      new.deleted_at   := old.deleted_at;
      new.state_at     := old.state_at;
    end if;

    new.purged_at := buried;
    if new.purged_at is not null then
      new.text := '';
      new.memo := null;
    end if;

    -- Neither half moved and no burial landed: nothing to store, and no
    -- sequence number to spend. Returning null in a BEFORE trigger skips the
    -- row silently, which is what it did before for the whole row -- so the
    -- burial has to be part of the question, or it is dropped without a word.
    if new.updated_at <= old.updated_at
       and new.state_at <= old.state_at
       and new.purged_at is not distinct from old.purged_at
       and new.text is not distinct from old.text
       and new.memo is not distinct from old.memo then
      return null;
    end if;
  else
    -- An insert that arrives already buried carries no words either.
    if new.purged_at is not null then
      new.text := '';
      new.memo := null;
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

-- Rows that already carry words behind a tombstone are emptied. Unlike the
-- resurrections 0005 chose not to touch, there is nothing ambiguous here: a
-- purged row is not supposed to have any, and the words are the thing somebody
-- asked to be rid of. Clients pick the change up on their next pull.
update public.tasks
   set text = '', memo = null
 where purged_at is not null
   and (text <> '' or memo is not null);
