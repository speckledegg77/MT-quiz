# Decisions

Keep this as a log of decisions we have already made so we do not keep reopening them.

## Core working rules

- No sign-in. Players join by room code.
- The app is hosted by one person. The display screen is the TV view. Phones are for answering.
- Work directly on `main` and let Vercel deploy from `main`.
- For coding chats, use verified GitHub raw files or uploaded local files as the source of truth for core files.
- Provide full replacement code for changed files.
- Use shared UI components where they already exist.
- Keep the app simple first and add round types one at a time.
- Simple mode can offer more than one host-friendly game type, but it must still build the same underlying round-plan structure.

## Game structure and scoring

- Teams mode and solo mode both stay.
- In teams mode, players choose from host-defined team names.
- Team names must be unique.
- If team sizes differ, the scoreboard uses average points per player.
- Players choose a Joker round in the lobby.
- Joker rules stay as: correct `+2`, wrong `-1`, no submitted answer `-1` in the Joker round.
- Outside the Joker round, correct answers score `+1` and wrong or missing answers score `0`.
- There is no “Get ready” countdown before a question opens.
- Timed and untimed answer modes both stay.
- Selected but unsubmitted MCQ answers auto-submit at the end of the hidden grace window.
- Free text answers stay manual.
- The question should close early once every player has submitted.
- End-of-round summaries stay. The host sets how long they remain visible.
- The host can still skip the round review early.
- The final summary should be mobile-friendly and should show the winner.

## Audio and media

- Audio modes stay as: display, phones, both.
- Phone audio still needs a one-time enable tap, and manual play remains as fallback.
- Audio should stop when the question closes.
- The display should show the join QR code only before the game starts.
- Store bucket-relative paths only in the database, not full URLs or bucket-prefixed paths.

## Round-plan architecture

- Packs are content sources.
- Metadata defines question eligibility.
- Round templates are reusable gameplay definitions.
- Room round plans are the actual rounds chosen for one game.
- Even Quick Random should still build real rounds under the hood.
- Legacy pack-based rooms stay supported through a compatibility layer while the round-plan model beds in.
- Infinite simple games run as one continuous standard round under the hood, so they skip round setup without creating a separate game engine.
- Infinite mode keeps Joker hidden, shows question progress as a continuous run, and gives the host an explicit End game control.
- In Simple mode, a blank Infinite question limit means every currently available question from the selected packs, not a stale wider pool.

## Quickfire

- Quickfire is a real round behaviour, not just a naming convention.
- Quickfire rounds are not Joker-eligible.
- Quickfire skips the per-question reveal and goes straight to the round flow.
- Quickfire v1 stays limited to safe non-audio content until audio duration and pacing are handled properly.
- Quickfire scoring is `+1` for any correct answer, plus `+1` for the fastest correct player on that question.
- Quickfire round review shows the correct answer and exactly who got it right, with `⚡` on the fastest correct player.
- Quickfire and Standard rounds can use different default timings.
- Hosts can still override timings per round.

## Heads Up content model

- Heads Up content should not be forced into the normal `questions` table. It should use separate Heads Up tables.
- Heads Up items can belong to more than one Heads Up pack. Pack membership should stay many-to-many.
- People-based Heads Up items should use `person_roles` as a multi-select field rather than one fixed role.
- One logical Heads Up item is unique by normalised `answer_text`, `item_type`, and `primary_show_key`.
- Heads Up gameplay starts as a manual-round option only, using one Heads Up pack per round.
- Heads Up uses role-based live views. The guesser sees only the timer plus Correct and Pass. Clue-givers see the live clue plus timer.
- In team mode, turns alternate by team, then rotate to the next player within that team. In solo mode, turns rotate through all players globally.
- In team mode, only the active team gets the live clue view on phones. The other team sees a waiting screen.
- In solo mode, all non-active players become clue-givers for the active guesser.
- Heads Up rounds support a round-level TV display toggle: show clue on TV or timer only. The default is timer only.
- Heads Up rounds support 60 second and 90 second turn lengths, with 60 seconds as the default.
- Heads Up scoring is recorded by the active guesser on their phone, with host undo and end-of-turn review before the turn is confirmed.

## UI and code conventions

- Host setup should default to a Simple path for quick game creation, with Advanced setup hidden behind an explicit button.
- Simple host setup is a UI layer only. It still builds a real `round_plan` under the hood, rather than creating a separate game engine.
- Advanced setup keeps the full round builder, template tools, metadata filters, timing overrides, and legacy compatibility options.
- The player and display pages should avoid repeated or cluttered labels where the same detail already appears elsewhere.
- Shared theme surface tokens live in `app/globals.css` and should be used consistently.
- Use the `JokerBadge` component instead of pasting the Joker symbol inline.
- When a colour or token already exists in the Tailwind theme, use the canonical utility class instead of an arbitrary value form.
- Examples: `text-foreground` instead of `text-[var(--foreground)]`, `text-muted-foreground` instead of `text-[var(--muted-foreground)]`, `bg-card` instead of `bg-[var(--card)]`, `bg-muted` instead of `bg-[var(--muted)]`, and `border-border` instead of `border-[var(--border)]`.
- Only use arbitrary value classes when there is no suitable canonical theme utility, or when the value is a true one-off such as a custom calculation or unusual dimension.
- Shared stage labels, run badges, and mode badges should come from common helpers so Host, Player, Display, and summaries stay in sync.
- Shared round-flow helpers should decide derived client stage and whether stale questions stay hidden between rounds.
- Lyric and excerpt-based question text should preserve real line breaks on player, display, and admin screens.
- Admin answer editing for text-answer questions should sit in the questions dashboard rather than living only in CSV workflows.
- Round templates now use alphabetical ordering by name, and sort order is no longer used in template selection or admin editing.

## Answer matching and lyric packs

- The app is intended for adult private groups, so 18+ lyric or quote material is acceptable.
- Lyric packs use the `Waxing Lyrical` naming pattern, with separate Text and MCQ variants.
- For lyric-title questions, the text-answer pack should be built first. The MCQ pack can then be created from the same approved lyric set.
- Text-answer matching should normalise case, punctuation, apostrophes, and spacing before comparison.
- Text-answer matching should tolerate omission of a leading `a`, `an`, or `the` at the start of the answer.
- Text-answer matching can be mildly typo-tolerant for longer answers, but curated `accepted_answers` are still preferred over very loose fuzzy matching.
- `accepted_answers` should be used for fair human variants, not as a dumping ground for every imaginable misspelling.
- For lyric question wording, varied stems are fine, but the clue must stay clear that the answer target is the song title.
- British spelling should be preferred in generated content unless the changed spelling would alter a proper noun or the exact intended title.

## Authoring and import discipline

- `docs/shows-reference.md` is the canonical source for `show_key` values.
- New content-writing chats should use the current writing standards and CSV templates from the repo rather than inventing their own format.
- Generated CSV rows should quote every text-like field, even when the current value does not contain a comma.
- Question CSV generation should use the current full importer column order, including metadata fields after `image_path`.
