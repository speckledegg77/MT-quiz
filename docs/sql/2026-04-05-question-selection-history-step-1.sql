begin;

create table if not exists public.question_selection_history (
  id uuid primary key default gen_random_uuid(),
  selection_group_id uuid not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  question_id text not null,
  round_index integer not null default 0,
  round_name text not null default '',
  behaviour_type text not null default 'standard',
  selected_at timestamptz not null default now()
);

create index if not exists question_selection_history_selected_at_idx
  on public.question_selection_history (selected_at desc);

create index if not exists question_selection_history_group_idx
  on public.question_selection_history (selection_group_id, selected_at desc);

create index if not exists question_selection_history_question_idx
  on public.question_selection_history (question_id, selected_at desc);

alter table public.question_selection_history enable row level security;

commit;
