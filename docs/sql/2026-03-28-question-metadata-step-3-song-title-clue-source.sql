alter table public.questions
  drop constraint if exists questions_clue_source_check;

alter table public.questions
  add constraint questions_clue_source_check
  check (
    clue_source in (
      'direct_fact',
      'song_title',
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
