-- Stage 4E-B: final Spotlight persistence cleanup
-- Run this after Stage 4E-A has been applied and tested.
-- This script:
-- 1. renames public.rooms.heads_up_state to public.rooms.spotlight_state if needed
-- 2. drops the temporary heads_up_* compatibility views left over from Stage 4D

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rooms'
      and column_name = 'heads_up_state'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rooms'
      and column_name = 'spotlight_state'
  ) then
    alter table public.rooms rename column heads_up_state to spotlight_state;
  end if;
end $$;

drop view if exists public.heads_up_pack_items;
drop view if exists public.heads_up_packs;
drop view if exists public.heads_up_items;
