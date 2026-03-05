-- Run this in Supabase: Database -> SQL editor

-- Rooms: teams vs solo
alter table public.rooms
  add column if not exists game_mode text not null default 'teams';

alter table public.rooms
  add column if not exists team_names jsonb;

alter table public.rooms
  add column if not exists team_score_mode text not null default 'total';

-- Players: which team a player belongs to (nullable for solo games)
alter table public.players
  add column if not exists team_name text;
