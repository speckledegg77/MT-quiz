# Musical Theatre Quiz Web App: Context Pack

Live URL: https://mt-quiz.vercel.app  
Repo URL: https://github.com/speckledegg77/MT-quiz  
Branch workflow: work directly on `main` and push to GitHub. Vercel auto-deploys from `main`.

Context last updated: 2026-03-14  
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
- `/host` host setup and live host controls
- `/join?code=XXXX` join a room
- `/play/[code]` player phone screen
- `/display/[code]` TV screen
- `/admin/import` admin import and media upload tools
- `/admin/questions` question metadata dashboard
- `/admin/shows` shows manager
- `/admin/round-templates` round templates manager
- `/admin/heads-up` Heads Up items and packs manager

---

## Current build state

### Modes
- Teams mode
- Solo mode

### Lobby
- Host setup now has a Simple path for quick game creation and an Advanced path for the full round builder.
- Simple mode uses ready round templates to assemble a recommended game plan, while Advanced keeps the existing manual, quick-random, and legacy controls.
- Host creates a room and can choose timing, rounds, audio mode, and round-plan setup.
- Simple setup now offers a recommended game path and an Infinite path. Infinite runs as one continuous stream of questions from the chosen packs.
- Infinite mode now shows continuous-run progress, keeps Joker hidden, and gives the host an End game control while the run is live.
- Players join from phones.
- In teams mode, players choose a team from the host-defined team list.
- Players choose a Joker round in the lobby.
- TV display shows the join QR code before the game starts.

### Heads Up content model
- Heads Up content now lives outside the normal questions table.
- `heads_up_items` stores playable answers such as shows, songs, characters, people, and phrases.
- `heads_up_packs` stores themed decks.
- `heads_up_pack_items` lets one item belong to several packs.
- Person items can carry multiple roles such as performer, composer, and lyricist.

### Round-plan model
- Packs are content sources.
- Metadata defines question eligibility.
- Round templates are reusable gameplay definitions.
- Room round plans are the actual rounds selected for one game.
- Legacy pack-led rooms still work through a compatibility layer.

### Question flow
- No “Get ready” countdown. Questions open straight away.
- Timed and untimed answer modes both work.
- If every player submits before the timer ends, the question closes much faster.
- Selected but unsubmitted MCQ answers auto-submit at the end of the hidden grace window.
- Free text answers stay manual.
- Audio stops when the question closes.

### Standard round behaviour
- Player and display pages show the correct answer on reveal.
- End-of-round summary screens stay in place and can auto-advance.
- The host can still skip the round review early.

### Quickfire
- Quickfire is a real round behaviour.
- Quickfire rounds are not Joker-eligible.
- Quickfire currently stays limited to safe non-audio content.
- Each correct answer scores `+1`.
- The fastest correct player on each question gets an extra `+1`.
- Quickfire skips the per-question reveal.
- Quickfire uses an end-of-round review that shows the correct answer and exactly who got it right, with `⚡` on the fastest correct player.
- Default timings are now per round type rather than one shared room default.

### End of game
- Final summary shows nested team and player breakdowns.
- Mobile layout is card-based and no longer relies on a wide round matrix.
- The completed screen shows the winning player or team.

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
- The dashboard includes warnings, suggestions, bulk apply, bulk apply suggested values, filters for missing metadata, and a sticky detail panel.

### Shows manager
- Shows can be created and edited in the UI.
- `primary_show_key` dropdowns now come from the `shows` table.
- Show suggestions use question text first, then single-show pack fallback.

### Round templates
- There is a `round_templates` table.
- Templates can be created and edited in the UI.
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
