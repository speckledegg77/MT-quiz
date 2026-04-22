# Musical Theatre Quiz Web App: Context Pack

Live URL: https://mt-quiz.vercel.app  
Repo URL: https://github.com/speckledegg77/MT-quiz  
Branch workflow: work directly on `main` and push to GitHub. Vercel auto-deploys from `main`.

Context last updated: 2026-04-21  
Repo commit: fill this in with `git rev-parse --short HEAD`

---

## New chat starter

Repo: https://github.com/speckledegg77/MT-quiz  
Default branch: main  
Live URL: https://mt-quiz.vercel.app  
Repo commit: <paste current short commit hash>  
Context file: docs/context.md  
Roadmap file: docs/roadmap.md  
Decisions file: docs/decisions.md

Source of truth:
- Use GitHub `main` if it matches my local files.
- If I upload a newer local file or zip, that upload becomes the source of truth for that turn.
- For core files, confirm which source you used before you give replacements.

Core files:
- `app/host/page.tsx`
- `app/play/[code]/page.tsx`
- `app/display/[code]/page.tsx`
- `app/api/room/*`
- `app/layout.tsx`
- `app/globals.css`
- `components/GameCompletedSummary.tsx`
- `components/RoundSummaryCard.tsx`

Ways of working:
- Provide full replacement code for every file that changes.
- Include any new files as full contents too.
- Do not ask me to find sections or edit small parts.
- Always list the exact file paths that need creating or replacing.
- Before major replacements, remind me to make a checkpoint commit.
- Use `npm run build` as the default local check before a commit.
- Give the three git lines at the end of a step.
- Do not use `rg` or `grep` in your instructions. Use VS Code search instead.

Issue:
Done means:
What I tried:
Errors:

---

## What this app is

A musical theatre quiz for private games. One host controls the flow. A TV shows the questions. Players answer on their phones. There is no sign-in.

---

## Stack

- Next.js App Router on Vercel
- Supabase Postgres for game state and question bank
- Supabase Storage for audio and images
- Tailwind via `app/globals.css`
- Admin routes protected by an admin token header

---

## Main routes

- `/` home
- `/host` host landing page that routes into easy setup or direct host controls
- `/host/wizard` easy setup wizard for first-time or casual hosts
- `/host/direct` existing host setup and live host controls
- `/join?code=XXXX` join a room
- `/play/[code]` player phone screen
- `/display/[code]` TV screen
- Spotlight migration status: routes, UI, round-plan values, room state, and storage tables now use Spotlight naming. The old migration bridges have been removed.
- `/admin/import` admin import and media upload tools for question CSVs, Spotlight CSVs, and media
- `/admin/questions` question metadata dashboard
- `/admin/shows` shows manager
- `/admin/round-templates` round templates manager
- `/admin/spotlight` Spotlight items and packs manager
- Old `/admin/heads-up` and `heads-up` API compatibility aliases have now been removed from the app layer.

---

## Current build state

### Modes
- Teams mode
- Solo mode

### Lobby
- `/host` is now a landing page that helps the user choose between the easy setup wizard and the existing direct host controls.
- The easy setup wizard is quiz-first and guides the host through room creation, TV launch, player joining, and start.
- The direct host page keeps the current Simple and Advanced setup tools plus the live control centre.
- Host setup now has a Simple path for quick game creation and an Advanced path for the full round builder.
- Simple mode uses ready round templates to assemble a recommended game plan, while Advanced keeps the existing manual, quick-random, and legacy controls.
- Host creates a room and can choose timing, rounds, audio mode, and round-plan setup.
- Simple setup now offers a recommended game path and an Infinite path. Infinite runs as one continuous stream of questions from the chosen packs.
- If the Infinite question limit is blank, it means every currently available question from the selected packs, not the wider all-pack pool.
- Infinite mode now shows continuous-run progress, keeps Joker hidden, and gives the host an End game control while the run is live.
- Players join from phones.
- In teams mode, players choose a team from the host-defined team list.
- Players choose a Joker round in the lobby.
- TV display shows the join QR code before the game starts.

### Spotlight content model
- Spotlight is now the public and internal app name for this round and content model. Routes, persisted round-plan values, room state, and storage tables now use Spotlight naming.
- `spotlight_items` stores playable answers such as shows, songs, characters, people, and phrases.
- `spotlight_packs` stores themed decks.
- `spotlight_pack_items` lets one item belong to several packs.
- Person items can carry multiple roles such as performer, composer, and lyricist.
- Spotlight gameplay appears as a manual round behaviour, using one Spotlight pack per round.
- Spotlight turns now use role-based phone views. The guesser sees only the timer plus Correct and Pass. Clue-givers see the clue card plus timer.
- In teams mode, only the active team gets the live clue view. In solo mode, all non-active players become clue-givers.
- Spotlight rounds now support a TV display setting to either show the live clue or hide it behind a timer-only view.
- Spotlight rounds now support 60 second and 90 second turn lengths, with 60 seconds as the default.
- Spotlight scoring is now driven by the active guesser on their phone, with host undo and review before the turn is confirmed.
- Live Spotlight packs have now been rebuilt and rebalanced so every live pack is at or above 100 clues.

### Round-plan model
- Packs are content sources.
- Metadata defines question eligibility.
- Round templates are reusable gameplay definitions.
- Room round plans are the actual rounds selected for one game.
- Legacy pack-led rooms still work through a compatibility layer.
- The host pack chooser now keeps core packs and specialist round-source packs visible first.
- Single-show packs can stay in the data model as source packs, but the host UI should treat them as secondary to metadata-led round building.

### Question flow
- No “Get ready” countdown. Questions open straight away.
- Timed and untimed answer modes both work.
- If every player submits before the timer ends, the question closes much faster.
- Selected but unsubmitted MCQ answers auto-submit at the end of the hidden grace window.
- Free text answers stay manual.
- Audio stops when the question closes.
- Lyric and excerpt-based question text preserve real line breaks on player, display, admin list, and admin detail screens.

### Standard round behaviour
- Player and display pages show the correct answer on reveal.
- End-of-round summary screens stay in place and can auto-advance.
- The host can still skip the round review early.

### Text answers and lyric packs
- Text-answer matching normalises case, punctuation, apostrophes, and spacing before comparison.
- Text-answer matching tolerates omission of a leading `a`, `an`, or `the` at the start of the answer.
- Text-answer matching is mildly typo-tolerant for longer titles.
- Curated `accepted_answers` still matter and are preferred to very loose fuzzy matching.
- The admin questions dashboard lets the user review and edit `answer_text` and `accepted_answers` for text-answer questions.
- `Waxing Lyrical (Text)` is complete and imported.
- `Waxing Lyrical (MCQ)` is complete and imported, but still needs a manual review pass.
- Host-side room review is now the next live-host priority, starting with text-answer adjudication.

### Admin questions page
- The admin questions list no longer depends on stale caps.
- The admin questions flow should not depend on `questions.is_active`.
- Pack loading for the admin questions page should not depend on a stale `packs_with_counts` view.
- Selecting a question should open the detail panel without schema-dependent errors.

### Quickfire
- Quickfire is a real round behaviour.
- Quickfire rounds are not Joker-eligible.
- Quickfire can include safe MCQ audio clips up to 7 seconds when the clip starts on recognisable material.
- Each correct answer scores `+1`.
- The fastest correct player on each question gets an extra `+1`.
- Quickfire skips the per-question reveal.
- Quickfire uses an end-of-round review that shows the correct answer and exactly who got it right, with `⚡` on the fastest correct player.
- Host answer disputes should be handled through a room-only review panel rather than by editing the question bank mid-game.
- Default timings are now per round type rather than one shared room default.

### End of game
- Final summary shows nested team and player breakdowns.
- Mobile layout is card-based and no longer relies on a wide round matrix.
- The completed screen shows the winning player or team.
- Beta-facing content priorities after lyric import are decade packs, intro-led audio rounds, then more specialist audio such as overtures and entr'actes.

---

## Scoring and Joker rules

### Base scoring
- Correct answer outside the Joker round: `+1`
- Wrong answer outside the Joker round: `0`
- No answer outside the Joker round: `0`

### Joker round
- Correct answer: `+2`
- Wrong answer: `-1`
- No submitted answer: `-1`

### Quickfire
- Correct answer: `+1`
- Fastest correct player bonus: `+1`
- No Joker in Quickfire

### Team scoring
- If team sizes match, teams use total points.
- If team sizes differ, the scoreboard switches to average points per player.

---

## Metadata and admin model now live

### Question metadata
- Question metadata dashboard exists.
- Metadata fields include `media_type`, `prompt_target`, `clue_source`, `primary_show_key`, and `metadata_review_state`.
- The dashboard includes warnings, suggestions, bulk apply, bulk apply suggested values, metadata filters, filters for missing metadata, and a sticky detail panel.
- Text-answer questions can be reviewed and edited for canonical answer and accepted alternatives from the admin detail panel.

### Import tools
- The admin import page supports validate-only and real import modes for the main question bank CSV.
- The current question CSV format includes metadata columns after `image_path`, including `media_type`, `prompt_target`, `clue_source`, and `primary_show_key`, plus `media_duration_ms` and `audio_clip_type`.
- Legacy `pack_sort_order` is still tolerated by the importer, but it is ignored.
- A separate Spotlight CSV import supports item import, automatic pack creation by name, validate-only checks, and natural-key dedupe against existing Spotlight items.

### Shows manager
- Shows can be created and edited in the UI.
- `primary_show_key` dropdowns now come from the `shows` table.
- Show suggestions use question text first, then single-show pack fallback.

### Round templates
- There is a `round_templates` table.
- Templates can be created and edited in the UI.
- Round templates now support answer-type filtering, so MCQ and text-only variants can be separated cleanly.
- Host setup can add rounds from templates.
- Manual rounds can be saved back as templates.
- Quick Random can build rounds from selected active templates.

---

## Important UI and behaviour decisions now live

- Host page uses a cleaner two-column layout.
- In Simple mode, Game Summary and Recommended Rounds can stay collapsed until the host opens them.
- Player page uses a shared page shell and a tighter mobile layout.
- Mobile form controls stay at `16px` to avoid iPhone zoom.
- Explicit light and dark theme switching works on phones.
- Shared theme surface tokens live in `app/globals.css`, including `--card`, `--border`, `--muted`, and `--muted-foreground`.
- Use canonical Tailwind theme utilities where a theme token already exists, for example `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`, and `border-border`.
- Use the `JokerBadge` component instead of pasting the Joker symbol inline.
- Multiline lyric and excerpt-based question text must render with preserved line breaks rather than being flattened into a single paragraph.

---

## Core files and components

### Key pages
- `app/host/page.tsx`
- `app/play/[code]/page.tsx`
- `app/display/[code]/page.tsx`
- `app/join/page.tsx`
- `app/layout.tsx`
- `app/globals.css`

### Shared components
- `components/PageShell.tsx`
- `components/GameCompletedSummary.tsx`
- `components/RoundSummaryCard.tsx`
- `components/JokerBadge.tsx`
- `components/ThemeToggle.tsx`
- `components/HostJoinedTeamsPanel.tsx`
- `components/ui/Button.tsx`
- `components/ui/Card.tsx`
- `components/ui/Input.tsx`
- `components/ui/QRTile.tsx`

### Key API routes
- `app/api/room/create/route.ts`
- `app/api/room/start/route.ts`
- `app/api/room/answer/route.ts`
- `app/api/room/advance/route.ts`
- `app/api/room/force-close/route.ts`
- `app/api/room/reset/route.ts`
- `app/api/room/joker/route.ts`
- `app/api/room/state/route.ts`
- `app/api/room/feasibility/route.ts`

---

## Database and storage

### Main tables
Question bank:
- `packs`
- `questions`
- `pack_questions`
- `shows`
- `round_templates`

Game state:
- `rooms`
- `players`
- `answers`
- `round_results`
- `question_finalisations`

### Important current fields
- `rooms.build_mode`
- `rooms.round_plan`
- `rooms.round_count`
- `rooms.round_names`
- `players.joker_round_index`
- `answers.joker_active`
- `answers.score_delta`
- `answers.round_index`

### Important SQL helper
- `increment_player_score_by(player_id, delta)`

### Storage buckets
- `audio`
- `images`

### Media path rule
Store bucket-relative paths only in the DB.

Examples:
- `2026-02-17/audio-008.mp3`
- `2026-02-17/image-003.png`

Do not store:
- a leading `/`
- `audio/` or `images/`
- a full URL

---

## Admin tools

Admin protection:
- routes require header `x-admin-token`
- token comes from `process.env.ADMIN_TOKEN`

Admin routes:
- `/api/admin/import-questions`
- `/api/admin/upload-media`
- `/api/admin/upload-audio`
- `/api/admin/upload-image`
- `/api/admin/round-templates`
- `/api/admin/shows`
- `/api/admin/questions/[questionId]/answer`

---

## Question selection and packs

Selection helper:
- `lib/questionSelection.ts`

Selection strategies:
- `all_packs`
- `per_pack`

Round filters:
- `mixed`
- `no_audio`
- `no_image`
- `audio_only`
- `picture_only`
- `audio_and_image`

Pack loading:
- Host page currently reads packs client-side from Supabase.
- Keep this unless it starts causing access or RLS problems.

---

## Known working rules for future chats

- Do not overwrite a core file unless you have verified the current file from GitHub raw or from an uploaded local file.
- If GitHub and local may differ, ask for the current file or zip first.
- When using uploaded files, say clearly that the upload is the source of truth.
- For major changes, prefer small, testable steps.
- For project continuity, update `docs/context.md`, `docs/roadmap.md`, and `docs/decisions.md` at the end of a substantial work block.
- For UI and UX changes, prefer canonical Tailwind theme utilities over arbitrary value classes wherever a theme token already exists.
- Round-flow cleanup has centralised stage/status labels, mode badges, and stale-question suppression into shared helpers in `lib/gameMode.ts` and `lib/roundFlow.ts`.
- Round templates now use alphabetical ordering by name, and sort order is no longer used in template selection or admin editing.
- Flattening multiline lyric or excerpt text on player, display, admin list, or admin detail screens counts as a regression unless replaced by an equivalent newline-preserving approach.

## Authoring references

- `docs/shows-reference.md` is the canonical source for `primary_show_key` values.
- `docs/question-writing-standards.md` is the canonical guide for quiz-question CSV generation.
- `docs/spotlight-writing-standards.md` is the canonical guide for Spotlight CSV generation.
- `docs/import-regression-checklist.md` is the quick test list for importer changes.
