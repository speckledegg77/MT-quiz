# Roadmap

This file tracks the live plan. Keep it short and practical.

## Current priority

- [ ] Add host-side answer adjudication so disputed text answers can be reviewed and corrected safely during a live room.
- [ ] Build better answer-audit tools into the admin questions page so text-answer cleanup is faster and safer.
- [ ] Keep consolidating the round-plan model so packs stay content sources and rounds stay gameplay definitions.

## Next feature candidates

- [x] Add Heads Up gameplay round behaviour on top of the new separate content model, then move it to a turn-based v2 flow with role-based player views.
- [ ] Add Karaoke round format.
- [ ] Review remote phone audio autoplay and decide whether the gain is worth the browser pain.
- [ ] Allow optional late joins after the game has started.
- [ ] Add a replay flow so the host can run another game with the same room setup more easily.

## Structural and content model work

- [ ] Keep moving room creation away from pack-led setup towards explicit round types and round rules.
- [ ] Revisit question tagging so questions can be selected into suitable round types more flexibly.
- [ ] Decide the minimum tagging model needed for round selection, for example: round type, media type, show, difficulty, era, performer, character.
- [ ] Keep tagging simple enough that question writing and import do not become painful.
- [ ] Review whether Quickfire-safe content should stay limited to MCQ and picture until audio duration is handled properly.

## Quality of life

- [x] Canonicalise Tailwind theme-token classes where useful so IntelliSense suggestions are reduced.
- [x] Do a shared cleanup pass on repeated timer and state-handling logic across Host, Player, and Display.
- [ ] Review whether any host controls still feel duplicated or unclear.
- [ ] Add a compact host review view for disputed answers, including raw submissions, normalised text, and room-only score overrides.
- [ ] Tighten template and round-builder labels so Quickfire, Standard, and future round types feel clearly different.
- [ ] Add stronger answer-audit filters, previews, and bulk helpers to the admin questions screen.

## Content building

- [x] Seed a broader canonical `shows` list and keep `docs/shows-reference.md` in sync.
- [ ] Expand the question bank, especially for rounds that need larger eligible pools.
- [x] Build out the `Waxing Lyrical` text and MCQ packs.
- [x] Validate and import the final `Waxing Lyrical (MCQ)` master.
- [ ] Build beta-friendly round content next, starting with decade packs and stronger intro-led audio rounds.
- [ ] Add pack-side Heads Up curation tools so packs can add and remove large numbers of existing items quickly.
- [ ] Polish Heads Up turn review and correction flow after live playtesting.
- [ ] Decide whether Heads Up should support host-selected team order and turn order overrides.
- [ ] Add more images in Supabase Storage for picture rounds.
- [ ] Add more audio clips in Supabase Storage once audio rules are clearer.
- [ ] Define and build specialist audio sets such as intros, overtures, and entr'actes once the main intro format feels solid.
- [ ] Keep pack naming, metadata, and show links consistent.
- [ ] Build enough Quickfire-safe questions to support reliable testing and hosting.

## Later

- [ ] Host dashboard for stats.
- [ ] Export tooling for the question bank.

## Recently completed

- [x] Add importer guidance for quoted CSV fields, show-key discipline, and a regression checklist.
- [x] Review and tidy the main question CSV import format, plus add Heads Up CSV import and validate-only checks.
- [x] Heads Up v1 data model and admin workflow with separate items and pack management.
- [x] Heads Up v2 turn-based gameplay with role-based player views, TV clue toggle, and 60s or 90s turn options.
- [x] Shared round-flow cleanup for stage labels, mode badges, and stale-question suppression across Host, Player, and Display.
- [x] Simple vs Advanced host creation split started, with Simple mode driven by ready round templates and Advanced kept as the power-tool path.
- [x] Quickfire v1 as a real round behaviour.
- [x] Quickfire fastest-correct bonus scoring.
- [x] Quickfire round review with correct answers and player-by-player results.
- [x] Quickfire template support in the round template model.
- [x] Per-round timing defaults, including different defaults for Standard and Quickfire rounds.
- [x] Tailwind canonical theme-class cleanup for token-based utilities.
- [x] Simple mode can collapse Game Summary and Recommended Rounds for a cleaner first view.
- [x] Infinite simple game type using one continuous question run from the chosen packs.
- [x] Infinite mode polish, including clearer progress, Joker messaging, and an End game host control.
- [x] Fix Infinite availability so a blank limit uses the currently selected pack pool rather than a stale wider count.
- [x] Improve text-answer matching for punctuation, leading articles, and mild long-title typo tolerance.
- [x] Add admin editing for canonical text answers and accepted alternatives.
- [x] Remove stale admin question list caps.
- [x] Stop admin questions loading from depending on `questions.is_active` and stale count views.
- [x] Preserve lyric question line breaks on player, display, admin list, and admin detail screens.
- [x] Complete and import `Waxing Lyrical (Text)`.
- [x] Produce the final `Waxing Lyrical (MCQ)` master.
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
- [x] Round templates now use alphabetical ordering by name, and sort order is no longer used in template selection or admin editing.
