create extension if not exists pgcrypto;

create table if not exists public.heads_up_items (
  id uuid primary key default gen_random_uuid(),
  answer_text text not null,
  item_type text not null,
  person_roles text[] null,
  difficulty text not null default 'medium',
  primary_show_key text null references public.shows(show_key) on update cascade on delete set null,
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'heads_up_items_item_type_check'
  ) then
    alter table public.heads_up_items
      add constraint heads_up_items_item_type_check
      check (item_type in ('show', 'song', 'character', 'person', 'phrase', 'other'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'heads_up_items_difficulty_check'
  ) then
    alter table public.heads_up_items
      add constraint heads_up_items_difficulty_check
      check (difficulty in ('easy', 'medium', 'hard'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'heads_up_items_person_roles_check'
  ) then
    alter table public.heads_up_items
      add constraint heads_up_items_person_roles_check
      check (
        (
          item_type = 'person'
          and person_roles is not null
          and cardinality(person_roles) > 0
          and person_roles <@ array[
            'performer',
            'composer',
            'lyricist',
            'book_writer',
            'director',
            'choreographer',
            'other'
          ]::text[]
        )
        or
        (
          item_type <> 'person'
          and (person_roles is null or cardinality(person_roles) = 0)
        )
      );
  end if;
end $$;

create table if not exists public.heads_up_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.heads_up_pack_items (
  pack_id uuid not null references public.heads_up_packs(id) on delete cascade,
  item_id uuid not null references public.heads_up_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pack_id, item_id)
);

create index if not exists idx_heads_up_items_is_active
  on public.heads_up_items (is_active);

create index if not exists idx_heads_up_items_item_type
  on public.heads_up_items (item_type);

create index if not exists idx_heads_up_items_difficulty
  on public.heads_up_items (difficulty);

create index if not exists idx_heads_up_items_primary_show_key
  on public.heads_up_items (primary_show_key);

create index if not exists idx_heads_up_pack_items_item_id
  on public.heads_up_pack_items (item_id);

create unique index if not exists idx_heads_up_packs_name_lower
  on public.heads_up_packs (lower(name));

alter table public.heads_up_items enable row level security;
alter table public.heads_up_packs enable row level security;
alter table public.heads_up_pack_items enable row level security;