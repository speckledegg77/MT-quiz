# Decisions

Keep this as a log of decisions we have already made so we do not keep reopening them.

- No sign-in. Players join by room code.
- The app is hosted by one person. The display screen is the TV view. Phones are for answering.
- Work directly on `main` and let Vercel deploy from `main`.
- For coding chats, use verified GitHub raw files or uploaded local files as the source of truth for core files.
- Provide full replacement code for changed files.
- Use shared UI components where they already exist.
- Keep the app simple first and add round types one at a time.
- Teams mode and solo mode both stay.
- In teams mode, players choose from host-defined team names.
- Team names must be unique.
- If team sizes differ, the scoreboard uses average points per player.
- Players choose a Joker round in the lobby.
- Joker rules stay as: correct `+2`, wrong `-1`, no submitted answer `-1` in the Joker round.
- Outside the Joker round, correct answers score `+1` and wrong or missing answers score `0`.
- There is no “Get ready” countdown before a question opens.
- Timed and untimed answer modes both stay.
- Selected but unsubmitted MCQ answers auto-submit at the end of the hidden grace window.
- Free text answers stay manual.
- The question should close early once every player has submitted.
- Audio modes stay as: display, phones, both.
- Phone audio still needs a one-time enable tap, and manual play remains as fallback.
- Audio should stop when the question closes.
- The display should show the join QR code only before the game starts.
- End-of-round summaries stay. The host sets how long they remain visible.
- The host can still skip the round review early.
- The final summary should be mobile-friendly and should show the winner.
- The player and display pages should avoid repeated or cluttered labels where the same detail already appears elsewhere.
- Shared theme surface tokens live in `app/globals.css` and should be used consistently.
- Use the `JokerBadge` component instead of pasting the Joker symbol inline.
