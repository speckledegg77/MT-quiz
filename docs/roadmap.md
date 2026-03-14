# Roadmap

This file tracks the live plan. Keep it short and practical.

## Current priority

- [ ] Consolidate the current build, tidy docs, and agree the next feature set.
- [ ] Decide the next round type to build first.
- [ ] Move from pack-led quiz building towards explicit round types and round rules.

## Next feature candidates

- [x] Add Quickfire round rules.
- [ ] Add a Heads Up-style round.
- [ ] Add Karaoke round format.
- [ ] Rework room creation so the host chooses specific round types, not just packs.
- [ ] Revisit question tagging so questions can be selected into suitable round types more flexibly.
- [ ] Review remote phone audio autoplay and decide whether the gain is worth the browser pain.
- [ ] Allow optional late joins after the game has started.
- [ ] Add a replay flow so the host can run another game with the same room setup more easily.

## Structural/content model work

- [ ] Define the target round-type model clearly before changing the data structure.
- [ ] Decide whether packs remain as an import/editor concept while gameplay moves to round types.
- [ ] Decide the minimum tagging model needed for round selection, for example: round type, media type, show, difficulty, era, performer, character.
- [ ] Keep tagging simple enough that question writing and import do not become painful.
- [ ] Decide how Heads Up-style rounds would use existing question and answer data.

## Quality of life

- [ ] Do a host, player, and display UX pass now that Quickfire exists as a real round behaviour.

- [ ] Do a shared cleanup pass on repeated timer and state-handling logic across Host, Player, and Display.
- [ ] Canonicalise Tailwind classes where useful so IntelliSense suggestions are reduced.
- [ ] Review whether any host controls still feel duplicated or unclear.

## Content building

- [ ] Expand the question bank.
- [ ] Add more audio clips and images in Supabase Storage.
- [ ] Keep pack naming and tagging consistent.

## Later

- [ ] Host dashboard for stats.
- [ ] Export tooling for the question bank.

## Recently completed

- [x] Quickfire v1 as a real round behaviour.
- [x] Quickfire fastest-correct bonus scoring.
- [x] Quickfire round review with correct answers and player-by-player results.
- [x] Quickfire template support in the round template model.
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
