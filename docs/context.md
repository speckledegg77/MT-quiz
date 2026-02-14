# Musical Theatre Quiz Web App: Context Pack

Live URL: https://mt-quiz.vercel.app  
Context last updated: 2026-02-14  
Repo commit: 4a76ee7
Repo URL: https://github.com/speckledegg77/MT-quiz


## How we work in this project (chat conventions)

### New chat starter (copy and paste this)
Live URL:
Repo commit:
Context file: docs/context.md (uploaded in Project)

Issue:
Done means:

Notes (optional):

### How ChatGPT replies (consistent format)
1. I restate the goal in one sentence.
2. I give step-by-step instructions with exact file paths.
3. I include copy and paste code blocks.
4. I include the git commands as three lines:
   git add ...
   git commit -m "..."
   git push
5. I end with a short checklist to confirm it works.

### End of issue checklist (we do this before starting a new chat)
- Update "Repo commit" and "Context last updated" at the top of this file
- Update "Known issues / next tasks" with what changed
- If we added a new workflow, add it to this section

## What this app is
A musical theatre quiz for private games. One host controls the flow. A TV shows the questions. Players answer on their phones. No sign-in.

## Stack
- Next.js (App Router) deployed on Vercel
- Supabase Postgres for game state
- Supabase Storage for audio clips
- No authentication

## Main pages
- `/` home
- `/host` create a room, choose packs (rounds), choose audio mode, then start game
- `/join?code=XXXX` join a room (lobby only), enter a team name
- `/play/[code]` player phone screen, answers questions, supports dark mode
- `/display/[code]` TV screen, shows the question and scoreboard

## Question bank
- Questions live in `data/questions.ts`
- Each question includes:
  - `id`, `text`, `options`, `answerIndex`, `explanation`
  - `roundType` (for example `general`, `audio`)
  - `packs: string[]` (used for host round selection)
  - `audioPath` for audio questions (stored in Supabase Storage bucket `audio`)
- Host round list is generated from the actual packs in `data/questions.ts` via `GET /api/packs`

## Audio
- Audio files live in Supabase Storage bucket `audio`
- Audio is served via `GET /api/audio?path=...` (server downloads from Supabase and streams it)
- Host chooses audio playback mode:
  - `display` plays on the TV screen
  - `phones` plays on player phones (remote friendly)
  - `both` plays on both
- Phones require a user tap to enable audio (mobile browser rules). Autoplay may still fail on some devices, so manual “Play clip” remains as fallback.

## Scoring
- No fastest-correct scoring
- Every team that answers correctly gets +1

## Timing and flow
- Room starts in `lobby`
- Host presses Start Game to begin
- Each question has a countdown then an open answering window
- A question closes early once all teams have answered
- Reveal happens after `reveal_delay_seconds`, then stays visible for `reveal_seconds`
- The display auto-advances when stage becomes `needs_advance`

## QR codes
- Host screen shows a QR code for the join link
- Display screen shows the join QR code only during the lobby

## Database (Supabase)
Tables and key columns used by the app:

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
- option_index, is_correct

RPC
- increment_player_score(p_player_id uuid)

## Known issues / next tasks
- Remote phone audio often needs manual “Play clip” even after enabling audio
- Advancing after the last answer can feel slow
- Add more questions and add more packs in `data/questions.ts` so round selection becomes meaningful
