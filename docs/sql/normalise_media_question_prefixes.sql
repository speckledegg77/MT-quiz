select id, round_type, text
from public.questions
where round_type in ('audio','picture')
  and (
    (round_type = 'audio' and text not like 'AUDIO:%')
    or
    (round_type = 'picture' and text not like 'PICTURE:%')
    or
    text ~* '\(clip:'
    or
    text ~* '^\s*(AUDIO|PICTURE)\s+\d+'
    or
    text ~* '^\s*(audio|picture|image)\s*\('
  )
order by round_type, id;