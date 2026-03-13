create table if not exists public.round_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  behaviour_type text not null default 'standard',
  default_question_count integer not null default 10,
  joker_eligible boolean not null default true,
  counts_towards_score boolean not null default true,
  source_mode text not null default 'selected_packs',
  default_pack_ids jsonb not null default '[]'::jsonb,
  selection_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'round_templates_behaviour_type_check'
  ) then
    alter table public.round_templates
      add constraint round_templates_behaviour_type_check
      check (behaviour_type in ('standard'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'round_templates_source_mode_check'
  ) then
    alter table public.round_templates
      add constraint round_templates_source_mode_check
      check (source_mode in ('selected_packs', 'specific_packs', 'all_questions'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'round_templates_default_question_count_check'
  ) then
    alter table public.round_templates
      add constraint round_templates_default_question_count_check
      check (default_question_count > 0);
  end if;
end $$;

create index if not exists idx_round_templates_is_active
  on public.round_templates (is_active);

create index if not exists idx_round_templates_sort_order
  on public.round_templates (sort_order, name);