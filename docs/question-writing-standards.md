# Musical Theatre Quiz App: Question Writing Standards

## Purpose

This document sets the standard for writing quiz questions so they feel fair, clear, and fun, and so they import cleanly into the admin CSV workflow.

Use this together with:

- `docs/shows-reference.md`
- `docs/questions_csv/question-import-template.csv`
- `docs/import-regression-checklist.md`

## Core principles

Write questions that test knowledge, not guesswork.

Keep questions clear and self-contained so the host does not need to explain what you meant.

Keep one clear correct answer per question.

If you cannot write three plausible MCQ distractors, switch the question to a text answer.

## Writing the question

Write the question text first.

Keep each question focused on one fact.

Avoid vague references such as “this song” or “that character”. Name the show, performer, character, or song when it prevents confusion.

You can name a show in the question when the question asks about a different fact in that show.

Example: “In Sweeney Todd, what is Mrs Lovett’s first name?”

Do not include show names in brackets in the question text.

Do not include numbering like `AUDIO 01:` or `PICTURE 02:`.

Do not include `(clip: ...)` in the question text.

## Never give the answer away in the question

Do not write questions where the question contains the answer.

Do not write questions where the question contains wording that functions as the answer in disguise.

This includes subtitles, taglines, nicknames, or unique phrases that point straight to one show, song, or person.

Bad example:
Which musical has the character of Sweeney Todd?

Not allowed when the answer is the show title:
In which musical do you meet the demon barber of Fleet Street?

Better:
Which Sondheim musical is set around a pie shop?

### Subtitle and tagline rule

Do not use subtitle phrases as clues when the question asks for the show title, unless the question is specifically about the subtitle itself.

Even when the question is about the subtitle, avoid using wording that makes the answer too obvious.

### Quick self-check

If a player can answer by spotting one obvious phrase rather than knowing the fact, rewrite it.

## Choosing the answer type

Use MCQ when you can write three strong wrong answers and you want fast pacing.

Use text answers when you want more challenge, or when MCQ distractors would feel forced or silly.

## MCQ standards

MCQ must have exactly four options.

Do not use “All of the above” or “None of the above”.

### MCQ options must be plausible

Every option must feel feasible to someone with a reasonable level of musical theatre knowledge.

Keep all options in the same lane.

If the correct answer is a Sondheim show, pick other Sondheim shows or close neighbours from the same era and style.

Match the format across all options.

If one option is a full name, all options must be full names.

If one option is a song title, all options must be song titles.

Avoid giveaway outliers.

Do not include jokey answers.

Do not include options that clearly do not belong.

Avoid double-correct answers.

Plausible does not mean “also correct”.

If two options could be defended, tighten the question or change the options.

### Performer MCQ: viability rule

When a question asks about an originator or casting fact, choose distractors who feel viable for the role at that time.

You can choose distractors from the same production, the same era, or a similar casting space. The key is that they feel like plausible casting choices.

Example style:
Who originated the role of Eva Perón on Broadway?
Patti LuPone
Elaine Paige
Diana Rigg
Angela Lansbury

## Text answer standards

Provide one clean canonical answer.

Only add accepted answers when you expect genuinely different valid strings you want to accept.

Do not accept answers that make marking unfair.

If the question asks for a performer, do not accept the character name.

### Matching tolerance

The live text-answer matcher already normalises case, punctuation, apostrophes, and spacing before comparison.

It also tolerates omission of a leading `a`, `an`, or `the` at the start of a title.

For longer answers, the app now allows mild typo tolerance.

Do not treat that as permission to stop curating accepted answers. Use `accepted_answers` for fair human variants that you actively want to allow.

Examples:
- missing or present leading article when it materially changes how players are likely to type the title
- punctuation-heavy titles
- very common subtitle trims

Do not add huge lists of misspellings or vague near-misses.

## Lyric title questions

Lyric-title questions need slightly different rules.

### Answer target

For lyric-title questions, the answer target is usually the song title.

That means:
- `answer_type` is usually `text` for the first pass
- `prompt_target` should usually be `song_title`
- `clue_source` should usually be `lyric_excerpt`
- `media_type` should usually be `text`

### Wording

Keep the stem clear about what the player is naming.

Good styles:
- `Name the musical theatre song from these lyrics:`
- `Which song title matches this lyric excerpt?`

Do not accidentally ask for the show title if the intended answer is the song title.

### Excerpt length

Use the shortest excerpt that still feels complete and fair.

Two lines is often enough.

Some songs need three or four lines when two lines would feel cut off or too vague.

Do not force every lyric clue into the same line count.

### Formatting

When lyric questions need line breaks, put real line breaks into `question_text`.

Do not fake lyric layout with slashes unless there is a specific reason.

The live app now preserves line breaks on player, display, and admin screens, so multiline lyric blocks are allowed.

### Duplicate songs

It is acceptable for the same song to appear more than once with different lyric clues when the variety is deliberate.

Use judgement so a pack does not feel repetitive.

## Show key rules

Use `primary_show_key` only when the question clearly maps to one show.

Use the canonical key from `docs/shows-reference.md`.

Keys are lower snake_case.

Do not invent new show keys in a content-writing chat.

If the right show is not in the reference file yet, add it to the shows seed and the reference doc first.

If a question does not clearly belong to one show, leave `primary_show_key` blank.

## Explanations are required

Every question must include an explanation.

Use one or two sentences to confirm the answer and add useful context.

Do not just repeat the question.

## Audio questions

Choose short recognisable clips that test recognition.

Avoid long intros, silence, or heavy dialogue unless that is the point of the question.

Audio question text must start with `AUDIO:`.

## Picture questions

Pick images that remain readable on a TV.

Poster titles should be legible.

Cast photos should show clear faces.

Set photos should have an obvious focal point.

Picture question text must start with `PICTURE:`.

## Quickfire-specific guidance

Quickfire should stay short, readable, and fast.

For Quickfire v1, prefer MCQ and picture questions.

Do not write audio-dependent Quickfire questions until audio duration and pacing rules are properly defined.

Avoid long explanations, long answer strings, or overly fiddly wording that will make the end-of-round review hard to scan.

## Managing repetition

Use judgement.

Try not to reuse the exact same set of four MCQ options within a pack, since it encourages pattern spotting.

Some repetition is fine in narrow era or theme packs where the same pool of viable options will naturally recur.

Avoid using the same distractor too many times in a short stretch.

## CSV export and import rules

We generate CSVs for import. CSV breaks easily when fields contain commas or quotes, so keep the format simple and consistent.

### Required column order

Use this exact order for the current question importer:

`pack_id, pack_name, pack_round_type, question_id, question_round_type, answer_type, question_text, option_a, option_b, option_c, option_d, answer_index, answer_text, accepted_answers, explanation, audio_path, image_path, media_type, prompt_target, clue_source, primary_show_key, media_duration_ms, audio_clip_type`

### Legacy tolerance

Older CSVs may still include `pack_sort_order` after `pack_round_type`.

The importer still tolerates that legacy column, but it ignores it. Do not include it in new CSVs.

### Quote every text-like field

For new CSVs, always wrap these fields in double quotes on every row, even when the current value does not contain a comma:

- `pack_name`
- `question_text`
- `option_a`
- `option_b`
- `option_c`
- `option_d`
- `answer_text`
- `accepted_answers`
- `explanation`
- `audio_path`
- `image_path`
- `primary_show_key`

This is the safest rule for content generated in another chat.

Bad:
`Sincerely, Me`

Good:
`"Sincerely, Me"`

Bad:
`He said "hello"`

Good:
`"He said ""hello"""`

### Escaping rule

If the content contains a double quote character, escape it by doubling it.

Example:
`He said "hello"` becomes `"He said ""hello"""`

### `accepted_answers` format

The current documented format is a pipe-separated list inside one CSV cell.

Example:
`"Diana Goodman|Diana"`

Only add accepted answers when they are genuinely fair alternatives. Do not add loose variations that make marking inconsistent.

The importer still accepts a JSON array string for backward compatibility, but that is no longer the preferred format.

### `media_duration_ms` format

Use a whole number of milliseconds.

Example:
`5000`

Leave it blank when there is no timed media clip.

### `audio_clip_type` format

Use the current allowed clip type values from the app.

At the time of writing, common values include:

- `song_intro`
- `underscoring`
- `dialogue`
- `stinger`
- `other`

If you are unsure, check the current app enum before import.

## Import safety checks

Before a real import:

- run validate-only first
- check all comma-containing fields are quoted
- check all quote-containing fields are escaped
- check `primary_show_key` values exist in `docs/shows-reference.md`
- check `accepted_answers` uses pipe separators, not free text
- check MCQ rows really have four options
- check text-answer rows do not accidentally carry stale MCQ options
- check lyric rows that need line breaks contain real multiline `question_text`

Use `docs/import-regression-checklist.md` when testing importer behaviour after changes.
