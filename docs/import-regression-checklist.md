# Import regression checklist

Use this after any change to the question importer, Heads Up importer, CSV templates, authoring guidance, or text-answer matching.

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
- a question that uses the current metadata columns after `image_path`

## Lyric and text-answer checks

Run validate-only first, then a real import on a safe lyric pack.

Check these cases:

- a multiline lyric question with real line breaks in `question_text`
- a lyric question with punctuation-heavy song title, for example `"Sincerely, Me"`
- a long title with accepted answers present
- a title that should accept omission of a leading `a`, `an`, or `the`
- a title that should still be rejected if a key content word is wrong
- a long awkward title with mild misspelling, for example `Ballad of Czolgosz`
- a text-answer row where `accepted_answers` is blank and the matcher alone should still behave reasonably
- a text-answer row where `accepted_answers` contains several pipe-separated fair variants

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
- lyric question line breaks render properly on player, display, and admin screens
- text-answer canonical answer and accepted answers are editable in the admin questions panel

## Rule of thumb

For generated CSVs, quote every text-like field every time.

Do not rely on the importer to rescue badly formatted CSV.
