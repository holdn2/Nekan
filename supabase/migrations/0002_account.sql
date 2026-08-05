-- Leaving, and taking everything with you.
--
-- The other half of this -- getting your data *out* -- is already in the app:
-- Ctrl+E writes the whole board to PDF, HTML or Markdown from the local file,
-- with no account and no network. Nothing here needs to duplicate it.

-- Delete my own account, and with it every row that hangs off it.
--
-- A client cannot reach auth.users at all, and should not: handing out a key
-- that can is how one deleted account becomes all of them. This runs as the
-- function's owner instead, and the only id it will ever act on is the one in
-- the caller's own token.
--
-- The tasks go with it through the foreign key's on delete cascade, tombstones
-- included -- there is nothing left to sync back, because there is no longer an
-- account to sync it to.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
