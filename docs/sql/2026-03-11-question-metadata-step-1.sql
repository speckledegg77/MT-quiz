create table if not exists public.shows (
  show_key text primary key,
  display_name text not null,
  alt_names jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.questions
  add column if not exists media_type text,
  add column if not exists prompt_target text,
  add column if not exists clue_source text,
  add column if not exists primary_show_key text,
  add column if not exists metadata_review_state text not null default 'unreviewed',
  add column if not exists metadata_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_media_type_check'
  ) then
    alter table public.questions
      add constraint questions_media_type_check
      check (media_type in ('text', 'audio', 'image'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_prompt_target_check'
  ) then
    alter table public.questions
      add constraint questions_prompt_target_check
      check (
        prompt_target in (
          'show_title',
          'song_title',
          'performer_name',
          'character_name',
          'creative_name',
          'fact_value'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_clue_source_check'
  ) then
    alter table public.questions
      add constraint questions_clue_source_check
      check (
        clue_source in (
          'direct_fact',
          'song_clip',
          'overture_clip',
          'entracte_clip',
          'lyric_excerpt',
          'poster_art',
          'production_photo',
          'cast_headshot',
          'prop_image'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_metadata_review_state_check'
  ) then
    alter table public.questions
      add constraint questions_metadata_review_state_check
      check (
        metadata_review_state in (
          'unreviewed',
          'suggested',
          'confirmed',
          'needs_attention'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_primary_show_key_fkey'
  ) then
    alter table public.questions
      add constraint questions_primary_show_key_fkey
      foreign key (primary_show_key)
      references public.shows(show_key);
  end if;
end $$;

create index if not exists idx_questions_metadata_review_state
  on public.questions (metadata_review_state);

create index if not exists idx_questions_primary_show_key
  on public.questions (primary_show_key);