insert into public.shows (show_key, display_name, alt_names)
values
  ('aida', 'Aida', '["Disney''s Aida"]'::jsonb),
  ('assassins', 'Assassins', '[]'::jsonb),
  ('beetlejuice', 'Beetlejuice', '[]'::jsonb),
  ('cabaret', 'Cabaret', '[]'::jsonb),
  ('coco', 'Coco', '[]'::jsonb),
  ('company', 'Company', '[]'::jsonb),
  ('dear_evan_hansen', 'Dear Evan Hansen', '[]'::jsonb),
  ('encanto', 'Encanto', '[]'::jsonb),
  ('follies', 'Follies', '[]'::jsonb),
  ('frozen', 'Frozen', '[]'::jsonb),
  ('gypsy', 'Gypsy', '[]'::jsonb),
  ('hamilton', 'Hamilton', '[]'::jsonb),
  ('merrily_we_roll_along', 'Merrily We Roll Along', '[]'::jsonb),
  ('moana', 'Moana', '[]'::jsonb),
  ('newsies', 'Newsies', '[]'::jsonb),
  ('next_to_normal', 'Next to Normal', '["NTN"]'::jsonb),
  ('operation_mincemeat', 'Operation Mincemeat', '["Operation Mincemeat: A New Musical","Operation Mincemeat: The Musical"]'::jsonb),
  ('pacific_overtures', 'Pacific Overtures', '[]'::jsonb),
  ('passion', 'Passion', '[]'::jsonb),
  ('sunday_in_the_park_with_george', 'Sunday in the Park with George', '[]'::jsonb),
  ('tangled', 'Tangled', '[]'::jsonb),
  ('the_lion_king', 'The Lion King', '[]'::jsonb),
  ('the_little_mermaid', 'The Little Mermaid', '[]'::jsonb),
  ('two_strangers_carry_a_cake_across_new_york', 'Two Strangers (Carry a Cake Across New York)', '["Two Strangers"]'::jsonb),
  ('wicked', 'Wicked', '[]'::jsonb)
on conflict (show_key)
do update set
  display_name = excluded.display_name,
  alt_names = excluded.alt_names,
  updated_at = now();