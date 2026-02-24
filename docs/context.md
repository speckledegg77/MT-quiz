# Musical Theatre Quiz Web App: Context Pack

Live URL: https://mt-quiz.vercel.app  
Repo URL: https://github.com/speckledegg77/MT-quiz  
Branch workflow: work directly on `main` and push to GitHub. Vercel auto-deploys from `main`.

Context last updated: 2026-02-22  
Repo commit: 91855bcbbf9a118d07747fa43f4656478b2702d6
How to get it:
- In PowerShell in the repo folder: `git rev-parse --short HEAD`

---

## New chat starter (copy and paste at the top of the next chat)

Live URL: https://mt-quiz.vercel.app  
Repo commit: 91855bcbbf9a118d07747fa43f4656478b2702d6  
Context file: docs/context.md (uploaded in Project)

Issue:
Done means:

Notes (optional):
- Any error messages (paste full output)
- Any URLs you tested

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
- `/host` create a room, choose packs (optional), choose question selection and filters, then start game
- `/join?code=XXXX` join a room, enter a team name
- `/play/[code]` player phone screen (answers, audio support on phone, reveal and game finished screen)
- `/display/[code]` TV screen (question, scoreboard, reveal, game finished screen)
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

These should be used instead of inline styles.

---

## Supabase tables and storage (high level)

Question bank:
- `packs` (uses `display_name`, `round_type`, `sort_order`, `is_active`)
- `questions` (includes `round_type`, `answer_type`, options, answer, `audio_path`, `image_path`)
- `pack_questions` (links packs to questions)

Game state:
- `rooms` (stores `code`, `phase`, `question_ids`, timings, `audio_mode`, `selected_packs`)
- `players` (stores `room_id`, `name`, `score`)

Storage buckets:
- `audio`
- `images`

Media path rule (important):
Store bucket-relative paths only in the DB, for example:
- `2026-02-17/audio-008.mp3`
- `2026-02-17/image-003.png`

Do not store:
- a leading `/`
- `audio/` or `images/`
- a full URL

DB schema snapshot:
- docs/db_schema_export_2026-02-22.json

Tables confirmed in schema:
- packs, questions, pack_questions
- rooms, players
- answers (one answer per player per question)
- round_results (winner per question)
---

## Admin import and bulk media upload

Admin page:
- `/admin/import` (combined CSV import and bulk media upload)

Admin protection:
- Admin endpoints require header `x-admin-token`
- Compared to `process.env.ADMIN_TOKEN`

Environment variables:
- `ADMIN_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Server-side Supabase admin uses service role key in your existing setup (wherever `supabaseAdmin` is defined)

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

This avoids proxying file bytes through Vercel.

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

Room creation:
- `app/api/room/create/route.ts` fetches questions for the chosen packs and uses `buildQuestionIdList(...)`

---

## Host page behaviour

File:
- `app/host/page.tsx`

Key behaviour:
- Pack selection toggle: use all packs by default, or choose packs
- Packs table shown on the right when “Choose packs” is enabled
- Pack rows are single-line with truncation
- Per-pack count input is a small numeric text field (no spinner buttons)
- Per-pack count input allows blank while typing, then clamps on blur
- Host can filter question types (no audio, no image, audio only, picture only, audio+image)

Host sends to `/api/room/create`:
- `selectionStrategy`
- `roundFilter`
- `totalQuestions`
- `selectedPacks`
- `rounds` (per-pack counts when using per_pack)
- timing fields and `audioMode`

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

## Display and player experience

TV display:
- `app/display/[code]/page.tsx`
- Shows scoreboard during play and a Game Completed screen
- Uses a clean trophy SVG icon (single-stroke) to avoid rendering issues

Phone player:
- `app/play/[code]/page.tsx`
- Shows reveal (correct answer and explanation)
- Shows Game Completed screen with final scoreboard
- Supports audio on phone when audio mode is phones or both, with an enable step

Join page:
- `app/join/page.tsx` styled to match the app

Home page:
- `app/page.tsx` styled to match the app and works in dark mode

---

## Recent changes (add to this list each time)

- Added class-based theme toggle and consistent header navigation
- Rebuilt Host page layout and packs table for better usability
- Added pack selection toggle (use all packs or choose packs)
- Added question type filters: no image and audio+image only
- Added bulk media upload to admin import page
- Fixed audio path rule so storage lookups work
- Rebuilt display and player pages with reveal and game completed screens

## Standing rule: CSV safety for question packs
All generated question pack CSVs must use the fixed column order and must quote question_text, explanation, answer_text, accepted_answers, and all mcq options. accepted_answers must be a quoted JSON array string. Do not insert any extra blank columns.