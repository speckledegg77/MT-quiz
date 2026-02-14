\# Musical Theatre Quiz Web App: Context Pack



Stack

\- Next.js (App Router) on Vercel

\- Supabase Postgres + Storage (audio bucket)

\- No sign-in, players join by name, stored locally per room code



Core URLs

\- /host creates room, shows join link + QR, starts game

\- /display/\[code] TV screen, shows QR only in lobby, plays audio when audio\_mode allows

\- /join joins lobby only

\- /play/\[code] player phone screen, supports dark mode, supports phone audio when enabled



Audio

\- Audio served via /api/audio?path=... which downloads from Supabase Storage bucket "audio"

\- Host selects audio mode: display, phones, both

\- Phones require one tap to enable audio, autoplay may still fail on some devices so "Play clip" exists



Scoring

\- No fastest-correct

\- Every correct answer gives that team +1



Timing and flow

\- Question opens, teams answer

\- As soon as all teams have answered, the question closes early and reveal begins after reveal\_delay\_seconds

\- answer\_seconds acts as a maximum if someone never answers



Database (tables/columns used)

\- rooms: code, phase, question\_ids, question\_index, countdown\_seconds, answer\_seconds, reveal\_delay\_seconds, reveal\_seconds, open\_at, close\_at, reveal\_at, next\_at, audio\_mode, selected\_packs

\- players: room\_id, name, score

\- answers: room\_id, player\_id, question\_id, option\_index, is\_correct

\- RPC: increment\_player\_score(p\_player\_id uuid)



Known issues / next tasks

\- Phone audio often needs manual "Play clip" even after enable

\- Game sometimes feels slow to advance after last answer

\- Add more round types and pack tagging in data/questions.ts



