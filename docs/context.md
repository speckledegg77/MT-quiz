# Musical Theatre Quiz Web App: Context Pack

Live URL: https://mt-quiz.vercel.app  
Repo URL: https://github.com/speckledegg77/MT-quiz  
Branch workflow: work directly on `main` and push to GitHub. Vercel auto-deploys from `main`.

Context last updated: 2026-02-25  
Repo commit: fde1d8a  
How to get it:
- In PowerShell in the repo folder: `git rev-parse --short HEAD`

---

## New chat starter (copy and paste at the top of the next chat)

Live URL: https://mt-quiz.vercel.app  
Repo commit: 91855bcbbf9a118d07747fa43f4656478b2702d6  
Context file: docs/context.md (uploaded in Project)

Issue:
Done means:

What I tried:
- Exact steps I took

Errors:
- Paste full error output (terminal or Vercel)

---

## Ways of working for code changes

Non-negotiables:
- Provide full replacement code for every file that changes, ready to copy and paste.
- Include any new files as full contents too.
- Do not ask me to find sections or edit small parts.
- Always list the exact file paths that need creating or replacing.

If you do not have the latest version of a file:
- Ask me to paste the full file.
- Then return a full replacement file.

Build and push flow:
- Use `npm run build` as the default local check before a commit.
- Give the three git lines to commit and push.
- If we keep iterating on the same step, you can hold the three git lines until the end of that step.

Three git lines:
- `git add -A`
- `git commit -m "MESSAGE"`
- `git push`

Tooling constraint:
- Do not give commands that depend on `rg` or `grep`. Use VS Code search instructions instead.

---

## UI component rule: Button variants

Valid variants from `components/ui/Button.tsx`:
- `primary`
- `secondary`
- `ghost`
- `danger`

Do not use `variant="default"`.

If you want the normal primary button, omit `variant` or pass `variant="primary"`.

---

## Host packs: client-side Supabase vs API route

Client-side (current approach):
- `app/host/page.tsx` reads `packs` directly using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Pros: simple, fewer files, fast to change.
- Cons: it relies on RLS allowing reads of `packs` for anon users.

API route approach:
- Host page calls an internal endpoint like `/api/packs`.
- Pros: keeps all DB logic server-side and gives you one place to change pack rules.
- Cons: more code and you still need to secure the endpoint properly.

We keep the client-side approach for now unless it causes access problems.

---

## What this app is

A musical theatre quiz for private games. One host controls the flow. A TV shows the questions. Players answer on their phones. No sign-in.

---

## Stack

- Next.js (App Router) deployed on Vercel
- Supabase Postgres for game state and question bank
- Supabase Storage for audio and images
- Admin routes protected by an admin token header

---

## Main pages

- `/` home
- `/host` create a room, choose packs, choose question selection and filters
- `/join?code=XXXX` join a room, enter a team name
- `/play/[code]` player phone screen
- `/display/[code]` TV screen
- `/admin/import` admin tool (CSV import plus bulk media upload)

---

## Theming and UI

Tailwind is installed and active via `app/globals.css`.

Dark mode is class-based:
- `app/globals.css` defines CSS variables for light and dark
- `components/ThemeToggle.tsx` toggles the `dark` class on `<html>` and stores `mtq_theme` in localStorage
- `app/layout.tsx` includes a sticky header with Host, Join, and theme toggle

Shared UI components:
- `components/ui/Button.tsx`
- `components/ui/Card.tsx`
- `components/ui/Input.tsx`

Use these instead of custom button markup.

---

## Supabase tables and storage (high level)

Question bank:
- `packs` (uses `display_name`, `round_type`, `sort_order`, `is_active`)
- `questions` (includes `round_type`, `answer_type`, options, answer, `audio_path`, `image_path`)
- `pack_questions` (links packs to questions)

Game state:
- `rooms` (stores `code`, `phase`, `question_ids`, timings, `audio_mode`, `selected_packs`)
- `players` (stores `room_id`, `name`, `score`)
- `answers` (one answer per player per question)
- `round_results` (winner per question)

Storage buckets:
- `audio`
- `images`

Media path rule:
Store bucket-relative paths only in the DB, for example:
- `2026-02-17/audio-008.mp3`
- `2026-02-17/image-003.png`

Do not store:
- a leading `/`
- `audio/` or `images/`
- a full URL

DB schema snapshot:
- docs/db_schema_export_2026-02-22.json

---

## Admin import and bulk media upload

Admin page:
- `/admin/import`

Admin protection:
- Admin endpoints require header `x-admin-token`
- Compared to `process.env.ADMIN_TOKEN`

Environment variables:
- `ADMIN_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

CSV import API:
- `/api/admin/import-questions`

Bulk media upload API:
- `/api/admin/upload-media`
- Accepts multipart form fields: `bucket` (audio or images), optional `folder`, optional `upsert`, and `files` (multiple)

---

## Media playback

Media routes redirect to signed Supabase download URLs:
- `/api/audio?path=...`
- `/api/image?path=...`

---

## Question selection (core logic)

Selection helper:
- `lib/questionSelection.ts`

Selection strategies:
- `per_pack` (host sets a count for each selected pack)
- `all_packs` (host sets one total across the selected set)

Round filters supported:
- `mixed`
- `no_audio`
- `no_image`
- `audio_only`
- `picture_only`
- `audio_and_image` (audio + picture only)

---

## Join feed: show teams joining

Goal:
- Show a live list of teams that have joined a room on the TV display and on the Host page.
- Show unique team names only.

Files:
- `components/JoinedTeamsPanel.tsx` (dedupes by team name)
- `components/HostJoinedTeamsPanel.tsx`
- `app/display/[code]/page.tsx` renders join panel in lobby view
- `app/host/page.tsx` renders join panel after room creation

Supabase requirement:
- `players` table needs `created_at timestamptz not null default now()`
- Supabase Realtime must be enabled for the `public.players` table

---

## Game flow

Room phases:
- `lobby`
- `running`
- `finished`

Stages (during running):
- countdown
- open
- wait
- reveal
- needs_advance (display auto-calls `/api/room/advance`)

---

## Known gotchas

- Do not use `variant="default"` on Button.
- Do not use `rg` or `grep` in instructions.
- Run `npm run build` before committing when we touch UI components or TypeScript types.

---