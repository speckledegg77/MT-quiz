# Musical Theatre Quiz Web App: Context Pack

Stack
- Next.js (App Router) on Vercel
- Supabase Postgres + Storage (audio bucket)
- No sign-in, players join by name, stored locally per room code

Core URLs
- /host creates room, shows join link + QR, starts game
- /display/[code] TV screen, shows QR only in lobby, plays audio when audio_mode allows
- /join joins lobby only
- /play/[code] player phone screen, supports dark mode, supports phone audio when enabled

Question bank
- Questions live in data/questions.ts
- Each question has packs: string[]
- Host shows available rounds by calling /api/packs, which is generated from the packs values in data/questions.ts

Audio
- Audio served via /api/audio?path=... which downloads from Supabase Storage bucket "audio"
- Host selects audio mode: display, phones, both
- Phones require one tap to enable audio, autoplay may still fail on some devices so "Play clip" exists

Scoring
- No fastest-correct
- Every correct answer gives that team +1

Timing and flow
- Question opens, teams answer
- As soon as all teams have answered, the question closes early and reveal begins after reveal_delay_seconds
- answer_seconds acts as a maximum if someone never answers

Database (tables/columns used)
- rooms: code, phase, question_ids, question_index, countdown_seconds, answer_seconds, reveal_delay_seconds, reveal_seconds, open_at, close_at, reveal_at, next_at, audio_mode, selected_packs
- players: room_id, name, score
- answers: room_id, player_id, question_id, option_index, is_correct
- RPC: increment_player_score(p_player_id uuid)

Known issues / next tasks
- Phone audio often needs manual "Play clip" even after enable
- Game sometimes feels slow to advance after last answer
- Add more round types and pack tagging in data/questions.ts
