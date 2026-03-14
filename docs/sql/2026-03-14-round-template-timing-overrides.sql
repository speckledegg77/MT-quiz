alter table public.round_templates
  add column if not exists default_answer_seconds integer,
  add column if not exists default_round_review_seconds integer;

alter table public.round_templates
  drop constraint if exists round_templates_default_answer_seconds_check,
  drop constraint if exists round_templates_default_round_review_seconds_check;

alter table public.round_templates
  add constraint round_templates_default_answer_seconds_check
    check (default_answer_seconds is null or (default_answer_seconds >= 0 and default_answer_seconds <= 120)),
  add constraint round_templates_default_round_review_seconds_check
    check (default_round_review_seconds is null or (default_round_review_seconds >= 0 and default_round_review_seconds <= 120));
