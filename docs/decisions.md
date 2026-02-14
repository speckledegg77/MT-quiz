\# Decisions



Keep this as a log of choices we have made so we do not re-litigate them later.



\- No sign-in. Players enter a team name. Player ID is stored locally per room code.

\- Game is hosted by one person. Display screen is the “TV view”. Phones are for answering.

\- App is deployed on Vercel so it runs without the host computer.

\- Supabase is used for rooms, players, answers, and Storage for audio clips.

\- Audio is served through /api/audio?path=... (server-side download from Supabase Storage).

\- Audio modes exist: display, phones, both.

\- Phone audio needs a one-time “Enable audio” tap. Autoplay may still fail on some devices so “Play clip” remains.

\- QR code exists for joining. Display shows QR only during lobby.

\- Scoring is not fastest-correct. Every correct answer scores +1 for that team.

\- Question closes early once all teams have answered. Otherwise it closes at answer\_seconds.

\- Player phone screen supports dark mode (explicit theming, colourScheme set).

\- Keep the app “simple first”, add round types one at a time.



