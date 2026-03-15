alter table if exists public.questions
  add column if not exists audio_clip_type text;

comment on column public.questions.audio_clip_type is
  'Audio clue category, for example song_intro, song_clip, dialogue_quote, or sound_effect.';
