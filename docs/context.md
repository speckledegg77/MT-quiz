# Musical Theatre Quiz Web App: Context Pack

Live URL: https://mt-quiz.vercel.app  
Context last updated: 2026-02-15  
Repo URL: https://github.com/speckledegg77/MT-quiz  
Repo commit: (fill this in each time you start a new chat)
How to get it:
- In PowerShell in the repo folder: `git rev-parse --short HEAD`

Branch workflow: work directly on `main` and push to GitHub. Vercel auto-deploys from `main`.

---

## How we work in this project (chat conventions)

### New chat starter (copy and paste this at the top of the next chat)
Live URL: https://mt-quiz.vercel.app  
Repo commit: (run `git rev-parse --short HEAD`)  
Context file: docs/context.md (uploaded in Project)

Issue:
Done means:

Notes (optional):
- Any error messages (paste full output)
- Any URLs you tested

### How ChatGPT replies (consistent format)
1. Restate the goal in one sentence.
2. Give step-by-step instructions with exact file paths.
3. Provide full copy/paste replacements when asked.
4. Give git commands as:
   - `git add ...`
   - `git commit -m "..."`
   - `git push`
5. Do one step at a time so errors can be pasted back.

### End of issue checklist (do this before starting a new chat)
- Update "Repo commit" and "Context last updated" at the top of this file
- Add a short note under "Recent changes" for what we did
- Update "Known issues / next tasks" if needed

---

## What this app is
A musical theatre quiz for private games. One host controls the flow. A TV shows the questions. Players answer on their phones. No sign-in.

---

## Stack
- Next.js (App Router) deployed on Vercel
- Supabase Postgres for game state and question bank
- Supabase Storage for audio and images
- No authentication, admin routes protected by an admin token

---

## Main pages
- `/` home
- `/host` create a room, choose packs and question counts, choose audio mode, then start game
- `/join?code=XXXX` join a room (lobby only), enter a team name
- `/play/[code]` player phone screen, answers questions
- `/display/[code]` TV screen, shows the question and scoreboard
- `/admin/import` admin import tool (CSV import plus media upload)

---

## Question bank (current design)
Questions no longer live in `data/questions.ts`. They live in Supabase tables.

High level behaviour:
- Host picks one or more packs
- Host sets how many questions to take from each pack
- Room creation randomly samples questions from each selected pack
- A room stores the chosen question ids so the game stays consistent for all players

Answer types supported:
- `mcq` (4 options, one correct)
- `text` (typed answer, normalised matching with some tolerance)

Round types supported:
- `general` (standard)
- `audio`
- `picture`

---

## Admin import and media upload

### Admin page
`/admin/import`

What it does:
- Imports packs and questions from CSV
- Uploads audio and images to Supabase Storage
- Returns a bucket-relative `path` that you paste into CSV (`audio_path` or `image_path`)

### Admin protection
Admin endpoints require header `x-admin-token` and compare it to `process.env.ADMIN_TOKEN`.

Environment variables:
- Local: add `ADMIN_TOKEN=...` to `.env.local`
- Vercel: Project Settings → Environment Variables → add `ADMIN_TOKEN`

### CSV columns (current)
pack_id, pack_name, pack_round_type, pack_sort_order,
question_id, question_round_type, answer_type, question_text,
option_a, option_b, option_c, option_d, answer_index,
answer_text, accepted_answers, explanation, audio_path, image_path

Rules:
- MCQ: `answer_type=mcq`, fill options A-D and `answer_index` (0-3)
- Text: `answer_type=text`, fill `answer_text`, optional `accepted_answers` as a JSON array string
- Audio: set `question_round_type=audio` and fill `audio_path`
- Picture: set `question_round_type=picture` and fill `image_path`

### Media path rules (important)
Store bucket-relative paths in the DB, for example:
- `2026-02-15/1700000000000-clip.mp3`
- `2026-02-15/1700000000000-image.png`

Do not store:
- a leading `/`
- `audio/` or `images/`
- a full signed URL

---

## Media uploads (why it works)
Vercel functions have request/response size limits. To avoid breaking audio uploads:
- Admin upload routes return a signed upload token
- The browser uploads the file directly to Supabase Storage

This means large audio files can upload successfully.

Public env vars required for browser upload:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Where to set them:
- Local in `.env.local`
- Vercel in Environment Variables

---

## Media playback (why it works)
Audio and image serving uses redirects to Supabase signed download URLs:
- `/api/audio?path=...` returns a redirect to a signed Supabase URL
- `/api/image?path=...` returns a redirect to a signed Supabase URL

This avoids streaming the file through Vercel.

---

## MCQ option randomisation (current behaviour)
MCQ options are shuffled per room and question, but stay consistent within the room:
- Everyone in the room sees the same order
- A different room gets a different order
- Answer checking uses the same shuffle logic so scoring stays correct

Implementation:
- `lib/mcqShuffle.ts`
- Used by `app/api/room/state/route.ts` and `app/api/room/answer/route.ts`

---

## Typed answer matching (current behaviour)
Typed answers allow reasonable variations:
- case and punctuation differences
- common acronyms (for example DEH, NTN, POTO)
- token prefixes (for example “phant op”)
- small typos (within limits)

Implementation lives in:
- `app/api/room/answer/route.ts`

---

## Host pack selection and per-pack counts
Host chooses:
- which packs to include
- how many questions to draw from each pack
- audio mode (display, phones, both)
- timings (countdown, answer window, reveal)

UI notes:
- Buttons have explicit styling to avoid the “text-only button” issue caused by global CSS.

Implementation:
- `app/host/page.tsx`

---

## Timing and flow
- Room starts in `lobby`
- Host presses Start Game to begin
- Each question has a countdown then an open answering window
- A question can close early once all teams have answered
- Reveal happens after `reveal_delay_seconds`, then stays visible for `reveal_seconds`
- The display auto-advances when stage becomes `needs_advance`

---

## Database (Supabase)
Core gameplay tables:
rooms
- code, phase
- question_ids, question_index
- countdown_seconds, answer_seconds, reveal_delay_seconds, reveal_seconds
- open_at, close_at, reveal_at, next_at
- audio_mode, selected_packs

players
- room_id, name, score, joined_at

answers
- room_id, player_id, question_id
- option_index, answer_text, is_correct

RPC
- increment_player_score(p_player_id uuid)

Question bank tables (names may vary but concept is):
- packs
- questions
- pack-to-question linking table

Storage buckets:
- `audio`
- `images`

---

## Recent changes (add new bullet per issue)
- Admin import page supports CSV import and media upload.
- Audio and images use signed URL redirects for playback.
- MCQ options shuffle per room/question.
- Typed answers accept sensible variants.
- Host UI supports per-pack question counts and button styling is fixed.

---

## Known issues / next tasks
- Create a few substantive question packs (enough to play full games).
- Improve admin experience for bulk pack creation and editing (optional).
- Add more round types and question formats only if needed (keep it simple first).

---

## What we want next (fill in for the next chat)
Issue:
Done means:
