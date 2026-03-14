do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'round_templates_behaviour_type_check'
  ) then
    alter table public.round_templates
      drop constraint round_templates_behaviour_type_check;
  end if;
end $$;

alter table public.round_templates
  add constraint round_templates_behaviour_type_check
  check (behaviour_type in ('standard', 'quickfire'));
