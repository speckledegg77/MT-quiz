alter table public.rooms
  add column if not exists heads_up_state jsonb not null default '{}'::jsonb;
