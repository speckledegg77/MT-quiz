# Import regression checklist

Use this after any change to the question importer, Heads Up importer, CSV templates, or authoring guidance.

## Question CSV checks

Run validate-only first, then a real import on a safe test pack.

Check these cases:

- a question with a comma in `question_text`
- a question with a comma in an MCQ option, for example `"Sincerely, Me"`
- a question with a quote inside a field
- a text-answer row with pipe-separated `accepted_answers`
- an audio row with `media_duration_ms`
- a row with blank optional fields
- a row with `primary_show_key` set to a real existing show key
- a deliberately broken row with an unquoted comma, to see whether the importer fails clearly

## Heads Up CSV checks

Run validate-only first, then a real import on a safe test pack.

Check these cases:

- an item with a comma in `answer_text`
- a `person` row with multiple `person_roles`
- a row with several `pack_names`
- a row with blank `primary_show_key`
- a row that updates an existing item
- a row that would create a duplicate natural key if dedupe failed
- a deliberately broken row with an invalid `primary_show_key`

## Manual data checks after import

- the imported values appear in the admin UI
- commas and quotes display correctly
- no column shift happened
- no unexpected blank fields were created
- new shows, packs, or Heads Up pack links were created only when intended
- duplicate Heads Up items were not created

## Rule of thumb

For generated CSVs, quote every text-like field every time.

Do not rely on the importer to rescue badly formatted CSV.
