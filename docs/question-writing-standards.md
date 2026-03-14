# Musical Theatre Quiz App: Question Writing Standards

## Purpose

This document sets the standard for writing quiz questions so they feel fair, clear, and fun, and so they import cleanly into the admin CSV workflow.

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

We generate CSVs for import. CSV breaks easily when fields contain commas or when JSON gets treated as multiple columns. To prevent that, always follow these rules.

### Required column order

Do not change this order:

`pack_id, pack_name, pack_round_type, pack_sort_order, question_id, question_round_type, answer_type, question_text, option_a, option_b, option_c, option_d, answer_index, answer_text, accepted_answers, explanation, audio_path, image_path`

### Always quote these CSV fields

Wrap these fields in double quotes on every row:

- `question_text`
- `explanation`
- `answer_text`
- `accepted_answers`
- `option_a`
- `option_b`
- `option_c`
- `option_d`

### Escaping rule

If the content contains a double quote character, escape it by doubling it.

Example:
`He said "hello"` becomes `"He said ""hello"""`

### `accepted_answers` format

`accepted_answers` must be a valid JSON array string and must be quoted as a CSV cell.

Example:
`"[""Diana Goodman"", ""Diana""]"`

Only add accepted answers when they are genuinely fair alternatives. Do not add loose variations that make marking inconsistent.

### Column shift warning

Never insert an extra empty column after `answer_index`.

That shifts the remaining fields and causes commas inside `accepted_answers` to split the row.

## Final checks before import

Each question has one clear correct answer.

Nothing in the question gives the answer away.

MCQ distractors are plausible and not outliers.

Text answers have fair marking.

Audio and picture questions have the correct media references.

Question IDs are unique.

Each row includes the required pack and question fields for import.
