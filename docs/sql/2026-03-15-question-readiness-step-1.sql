alter table public.questions
  add column if not exists media_duration_ms integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_media_duration_ms_check'
  ) then
    alter table public.questions
      add constraint questions_media_duration_ms_check
      check (media_duration_ms is null or media_duration_ms >= 0);
  end if;
end $$;

create index if not exists idx_questions_media_duration_ms
  on public.questions (media_duration_ms);
