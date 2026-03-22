-- Heads Up v1: enforce one logical item per natural key.
--
-- Natural key:
-- - normalised answer_text
-- - item_type
-- - primary_show_key, with null treated as blank
--
-- Run the duplicate check first. If it returns any rows, stop and clean those up before
-- creating the unique index.

select
  lower(btrim(answer_text)) as answer_key,
  item_type,
  coalesce(primary_show_key, '') as show_key,
  count(*) as duplicate_count,
  array_agg(id order by created_at) as item_ids
from public.heads_up_items
group by 1, 2, 3
having count(*) > 1
order by duplicate_count desc, answer_key asc;

create unique index if not exists idx_heads_up_items_natural_key_unique
  on public.heads_up_items (
    lower(btrim(answer_text)),
    item_type,
    coalesce(primary_show_key, '')
  );

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'heads_up_items'
  and indexname = 'idx_heads_up_items_natural_key_unique';
