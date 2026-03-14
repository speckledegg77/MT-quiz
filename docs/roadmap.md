# Roadmap

This file tracks the live plan. Keep it short and practical.

## Current priority

- [ ] Add host-side round feasibility checks so the host can see whether a round has enough eligible questions before starting a game.
- [ ] Do a host, player, and display UX pass now that Quickfire works as a real round behaviour.
- [ ] Keep consolidating the round-plan model so packs stay content sources and rounds stay gameplay definitions.

## Next feature candidates

- [ ] Add a Heads Up-style round.
- [ ] Add Karaoke round format.
- [ ] Review remote phone audio autoplay and decide whether the gain is worth the browser pain.
- [ ] Allow optional late joins after the game has started.
- [ ] Add a replay flow so the host can run another game with the same room setup more easily.

## Structural and content model work

- [ ] Keep moving room creation away from pack-led setup towards explicit round types and round rules.
- [ ] Revisit question tagging so questions can be selected into suitable round types more flexibly.
- [ ] Decide the minimum tagging model needed for round selection, for example: round type, media type, show, difficulty, era, performer, character.
- [ ] Keep tagging simple enough that question writing and import do not become painful.
- [ ] Decide how Heads Up-style rounds would use existing question and answer data.
- [ ] Review whether Quickfire-safe content should stay limited to MCQ and picture until audio duration is handled properly.

## Quality of life

- [x] Canonicalise Tailwind theme-token classes where useful so IntelliSense suggestions are reduced.
- [ ] Do a shared cleanup pass on repeated timer and state-handling logic across Host, Player, and Display.
- [ ] Review whether any host controls still feel duplicated or unclear.
- [ ] Tighten template and round-builder labels so Quickfire, Standard, and future round types feel clearly different.

## Content building

- [ ] Expand the question bank, especially for rounds that need larger eligible pools.
- [ ] Add more images in Supabase Storage for picture rounds.
- [ ] Add more audio clips in Supabase Storage once audio rules are clearer.
- [ ] Keep pack naming, metadata, and show links consistent.
- [ ] Build enough Quickfire-safe questions to support reliable testing and hosting.

## Later

- [ ] Host dashboard for stats.
- [ ] Export tooling for the question bank.

## Recently completed

- [x] Quickfire v1 as a real round behaviour.
- [x] Quickfire fastest-correct bonus scoring.
- [x] Quickfire round review with correct answers and player-by-player results.
- [x] Quickfire template support in the round template model.
- [x] Per-round timing defaults, including different defaults for Standard and Quickfire rounds.
- [x] Tailwind canonical theme-class cleanup for token-based utilities.
- [x] Teams mode and solo mode.
- [x] Unique team names with random musical-pun suggestions.
- [x] Joker round choice in lobby.
- [x] Joker scoring and penalties.
- [x] Per-round structure with editable round names.
- [x] End-of-round summary screen with timer.
- [x] Final game summary with per-round breakdowns.
- [x] Mobile-friendly final summary layout.
- [x] Winner shown on the completed screen.
- [x] Remove the “Get ready” countdown.
- [x] Player timer display.
- [x] Untimed answers mode.
- [x] Faster close when all answers are submitted.
- [x] Auto-submit selected MCQ answers at expiry.
- [x] Correct answer reveal on player and display.
- [x] Audio stops when the question closes.
- [x] Display QR only in the lobby.
- [x] Host page layout tidy-up.
- [x] Light and dark mode fixes, including phone behaviour.
- [x] iPhone input zoom fix.
