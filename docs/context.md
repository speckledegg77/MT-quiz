# Musical Theatre Quiz Web App: Context Pack

Live URL: https://mt-quiz.vercel.app  
Repo URL: https://github.com/speckledegg77/MT-quiz  
Branch workflow: work directly on `main` and push to GitHub. Vercel auto-deploys from `main`.

Context last updated: 2026-03-08  
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

---

## Current game flow

### Modes
- Teams mode
- Solo mode

### Lobby
- Host creates a room and can choose packs, filters, timing, rounds, and audio mode.
- Players join from phones.
- In teams mode, players choose a team from the host-defined team list.
- Players choose a Joker round in the lobby.
- TV display shows the join QR code before the game starts.

### Question flow
- No “Get ready” countdown. Questions open straight away.
- Timed mode uses an answer timer.
- Untimed mode keeps the question open until everyone answers or the host reveals.
- If every player submits before the timer ends, the question now closes much faster and moves to reveal quickly.
- Selected but unsubmitted MCQ answers auto-submit at the end of the hidden grace window.
- Free text answers stay manual.
- Audio stops when the question closes.

### Reveal
- Player and display pages show the correct answer on reveal.
- MCQ option labels like “Option 1” have been removed from player and display.

### End of round
- After the last question in a round, the app shows a round summary screen.
- The host sets how long the round summary stays visible.
- The next round then starts automatically.
- The host can still skip the round review early.

### End of game
- Final summary shows nested team and player breakdowns.
- Mobile layout is card-based and no longer relies on a wide round matrix.
- The summary now shows the winning player or team instead of only “Thanks for playing”.

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

### Team scoring
- If team sizes match, teams use total points.
- If team sizes differ, the scoreboard switches to average points per player.

---

## Important UI and behaviour decisions now live

- Host page uses a cleaner two-column layout.
- Packs show on the right when `Select packs` is ticked.
- Host sidebar no longer uses sticky behaviour that clashes with the top bar.
- Player page uses a shared page shell and a tighter mobile layout.
- Player timer card and running score card sit on the same row.
- iPhone input zoom issue is fixed by setting mobile form controls to `16px`.
- Explicit light and dark theme switching works on phones, including when the device itself is in dark mode.
- Shared theme surface tokens now exist in `app/globals.css`, including `--card`, `--border`, `--muted`, and `--muted-foreground`.
- Special symbol issues were reduced by using a shared `JokerBadge` component.

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

Game state:
- `rooms`
- `players`
- `answers`
- `round_results`
- `question_finalisations`

### Important current fields
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

Admin page:
- `/admin/import`

Admin protection:
- routes require header `x-admin-token`
- token comes from `process.env.ADMIN_TOKEN`

Admin routes:
- `/api/admin/import-questions`
- `/api/admin/upload-media`
- `/api/admin/upload-audio`
- `/api/admin/upload-image`

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
