-- Stage 4D: rename Spotlight storage tables from heads_up_* to spotlight_*
--
-- Run this before deploying the Stage 4D app code.
--
-- This migration:
-- 1. renames the three real tables to spotlight_*
-- 2. renames the main indexes and constraints to spotlight_* where practical
-- 3. keeps temporary compatibility views under the old heads_up_* names
--
-- Important:
-- - The compatibility views are temporary.
-- - They are intended only to soften the migration window while any missed query is found.
-- - Stage 4E should remove them once the app no longer depends on the old names.

begin;

-- Drop any old compatibility views first in case this script is re-run.
do $$
begin
  if exists (select 1 from pg_class where oid = 'public.heads_up_pack_items'::regclass and relkind = 'v') then
    execute 'drop view public.heads_up_pack_items';
  end if;
exception when undefined_table then
  null;
end $$;

do $$
begin
  if exists (select 1 from pg_class where oid = 'public.heads_up_packs'::regclass and relkind = 'v') then
    execute 'drop view public.heads_up_packs';
  end if;
exception when undefined_table then
  null;
end $$;

do $$
begin
  if exists (select 1 from pg_class where oid = 'public.heads_up_items'::regclass and relkind = 'v') then
    execute 'drop view public.heads_up_items';
  end if;
exception when undefined_table then
  null;
end $$;

-- Rename the core tables if they still use the legacy names.
do $$
begin
  if to_regclass('public.heads_up_items') is not null and to_regclass('public.spotlight_items') is null then
    alter table public.heads_up_items rename to spotlight_items;
  end if;

  if to_regclass('public.heads_up_packs') is not null and to_regclass('public.spotlight_packs') is null then
    alter table public.heads_up_packs rename to spotlight_packs;
  end if;

  if to_regclass('public.heads_up_pack_items') is not null and to_regclass('public.spotlight_pack_items') is null then
    alter table public.heads_up_pack_items rename to spotlight_pack_items;
  end if;
end $$;

-- Rename standard primary-key constraints.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'heads_up_items_pkey') then
    alter table public.spotlight_items rename constraint heads_up_items_pkey to spotlight_items_pkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'heads_up_packs_pkey') then
    alter table public.spotlight_packs rename constraint heads_up_packs_pkey to spotlight_packs_pkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'heads_up_pack_items_pkey') then
    alter table public.spotlight_pack_items rename constraint heads_up_pack_items_pkey to spotlight_pack_items_pkey;
  end if;
end $$;

-- Rename check constraints.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'heads_up_items_item_type_check') then
    alter table public.spotlight_items
      rename constraint heads_up_items_item_type_check to spotlight_items_item_type_check;
  end if;
  if exists (select 1 from pg_constraint where conname = 'heads_up_items_difficulty_check') then
    alter table public.spotlight_items
      rename constraint heads_up_items_difficulty_check to spotlight_items_difficulty_check;
  end if;
  if exists (select 1 from pg_constraint where conname = 'heads_up_items_person_roles_check') then
    alter table public.spotlight_items
      rename constraint heads_up_items_person_roles_check to spotlight_items_person_roles_check;
  end if;
end $$;

-- Rename foreign-key constraints on the join table.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'heads_up_pack_items_pack_id_fkey') then
    alter table public.spotlight_pack_items
      rename constraint heads_up_pack_items_pack_id_fkey to spotlight_pack_items_pack_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'heads_up_pack_items_item_id_fkey') then
    alter table public.spotlight_pack_items
      rename constraint heads_up_pack_items_item_id_fkey to spotlight_pack_items_item_id_fkey;
  end if;
end $$;

-- Rename indexes created in the original migrations.
do $$
begin
  if to_regclass('public.idx_heads_up_items_is_active') is not null then
    alter index public.idx_heads_up_items_is_active rename to idx_spotlight_items_is_active;
  end if;
  if to_regclass('public.idx_heads_up_items_item_type') is not null then
    alter index public.idx_heads_up_items_item_type rename to idx_spotlight_items_item_type;
  end if;
  if to_regclass('public.idx_heads_up_items_difficulty') is not null then
    alter index public.idx_heads_up_items_difficulty rename to idx_spotlight_items_difficulty;
  end if;
  if to_regclass('public.idx_heads_up_items_primary_show_key') is not null then
    alter index public.idx_heads_up_items_primary_show_key rename to idx_spotlight_items_primary_show_key;
  end if;
  if to_regclass('public.idx_heads_up_pack_items_item_id') is not null then
    alter index public.idx_heads_up_pack_items_item_id rename to idx_spotlight_pack_items_item_id;
  end if;
  if to_regclass('public.idx_heads_up_packs_name_lower') is not null then
    alter index public.idx_heads_up_packs_name_lower rename to idx_spotlight_packs_name_lower;
  end if;
  if to_regclass('public.idx_heads_up_items_natural_key_unique') is not null then
    alter index public.idx_heads_up_items_natural_key_unique rename to idx_spotlight_items_natural_key_unique;
  end if;
end $$;

-- Recreate the old table names as simple compatibility views.
create view public.heads_up_items as
select * from public.spotlight_items;

create view public.heads_up_packs as
select * from public.spotlight_packs;

create view public.heads_up_pack_items as
select * from public.spotlight_pack_items;

commit;
