create table if not exists public.answer_review_overrides (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  answer_id uuid not null unique references public.answers(id) on delete cascade,
  original_is_correct boolean not null,
  original_score_delta integer not null,
  overridden_is_correct boolean not null,
  overridden_score_delta integer not null,
  reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists answer_review_overrides_room_idx
  on public.answer_review_overrides (room_id);

alter table public.answer_review_overrides enable row level security;
