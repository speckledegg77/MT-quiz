# Musical Theatre Quiz Web App UI Guide

## Purpose

This guide records the UI decisions already made for the app so future changes stay consistent. It is a working guide, not a full design system. When there is any conflict, the most recently approved uploaded file for that screen wins.

## Core style direction

The app uses two different UI modes.

### Admin screens

Admin screens should feel like compact power tools.

That means:
- dense but readable layouts
- clear hierarchy
- low visual noise
- secondary tools hidden until needed
- labels and controls aligned cleanly
- helper text shown only when needed

Admin screens should not feel like airy dashboard marketing pages.

### Host, player, and display screens

These screens should feel simpler and more guided than admin.

That means:
- fewer competing controls
- larger primary actions where needed
- stronger state cues
- minimal repeated labels
- clean mobile behaviour

## General principles

### 1. Keep the primary task obvious

Each page should make its main job clear at first glance.

Examples:
- host page: build and run a game
- player page: answer the current question
- display page: show the game clearly to the room
- admin questions page: review and edit metadata quickly

### 2. Compress secondary actions

If a tool is useful but not needed all the time, collapse it by default.

Examples:
- bulk actions on admin questions
- field guide on admin questions
- similar future helper panels

### 3. Use help sparingly

Do not let helper text create extra height or break field alignment.

Preferred order:
1. clear labels
2. clear option names
3. tooltip help on hover and focus
4. inline text only when the user must see it all the time

### 4. Make dense screens calm

Dense screens are fine, but they should not feel messy.

Use:
- consistent control heights
- even spacing rhythm
- restrained colour use
- chips only for useful state, not decoration
- muted support text

### 5. Build in small, testable passes

Do not rework an entire screen when only one part needs changing. Apply narrow changes to the latest approved file for that screen.

## Visual language

### Cards

Use cards as work areas, not decoration.

Rules:
- prefer clean card surfaces
- keep padding consistent within a page
- avoid stacking many oversized cards inside one another
- use card headers only when they help scanning
- for collapsible tools, use a clear clickable header row

### Chips and pills

Use chips to show status, not as general styling.

Good uses:
- selected count
- metadata review state
- warning present
- question type
- Quickfire badge

Avoid:
- chips for empty or zero-value states unless they add real meaning
- too many chip colours in one row

### Buttons

Buttons should reflect importance.

Rules:
- primary action should be visually strongest
- secondary actions should be quieter
- destructive actions should stand out clearly but not dominate the page
- dense admin screens should use tighter button heights than host/player views when practical

### Icons

Use icons only when they improve speed or clarity.

Rules:
- tooltip trigger icons are encouraged for admin help text
- keep icon use consistent
- avoid decorative icon clutter

## Density and spacing

### Admin screens

Target: compact but not cramped.

Rules:
- controls should be tight enough that users can scan several fields without excessive scrolling
- rows should be denser than host or player screens
- secondary explanatory text should not create uneven vertical spacing
- lists should favour compact rows with a clear first line and quieter secondary line

### Host, player, and display screens

Target: moderate density.

Rules:
- prioritise clarity over compactness
- leave more space around primary actions and question content
- keep mobile ergonomics strong

## Forms and controls

### Labels

Rules:
- labels should be short and consistent
- align labels cleanly across a group of fields
- when extra guidance is needed, prefer a tooltip trigger beside the label

### Helper text

Rules:
- do not place always-visible helper text under every field on dense admin forms
- use tooltip help for secondary guidance
- reserve inline helper text for critical warnings or requirements

### Selects and inputs

Rules:
- keep control heights consistent within a form block
- dense admin forms should use tighter select and input sizing
- controls should align in clean grids
- helper text must not distort control alignment

### Tooltips

Use tooltips for:
- field guidance
- suggested value reasoning
- compact admin help

Rules:
- tooltip triggers must work on hover and keyboard focus
- the visible default state should stay clean and short
- tooltip copy should be short and concrete

## Layout patterns

### Sticky panels

Sticky panels are encouraged when one side of the page is the main working detail area.

Current preferred pattern:
- list or filters on the left
- sticky detail panel on the right

Rules:
- sticky panels should stay usable on shorter screens
- avoid sticky behaviour that traps content or hides controls

### Collapsible sections

Use collapsible sections for secondary tools.

Rules:
- default closed if the tool is occasional
- default open if the user needs it continuously
- the header should show enough summary to explain what is inside

### List rows

Rules:
- make rows denser before making them more decorative
- keep the primary identifier easy to spot
- place supporting metadata in a quieter second line
- show warnings compactly
- selection state should be obvious without making every row heavy

## Multiline question rendering contract

For lyric and excerpt-based question text, newline preservation is a UI contract, not a cosmetic preference.

Rules:
- preserve real line breaks on the player page
- preserve real line breaks on the display page
- preserve real line breaks in the admin questions list
- preserve real line breaks in the admin questions detail panel
- use a newline-preserving implementation such as `whitespace-pre-line` or an equivalent approach
- flattening multiline lyric or excerpt blocks back into a single paragraph counts as a regression unless there is an explicit approved replacement

## Page-specific rules

## Admin questions page

This is the reference screen for the admin power-tool style.

Rules:
- compact power-tool feel
- question list should be dense and easy to scan
- detail panel should stay sticky
- metadata editor should be tighter than a normal form
- helper text should use tooltips rather than stacked paragraphs
- bulk actions should be collapsed by default
- field guide should be collapsed by default
- audio preview should sit naturally in the detail workflow
- suggested values should be compact and use tooltip help for reasoning
- text-answer questions should expose canonical answer and accepted-answer editing in the detail panel
- multiline question text should remain readable in the detail panel, especially for lyric and excerpt-based questions
- admin question loading should not rely on stale schema assumptions such as `questions.is_active` or on stale precomputed views where direct queries are safer

Do not:
- let helper text break alignment
- let cards become oversized for the amount of content shown
- show low-value chips such as constant zero states

## Admin readiness page

Rules:
- use the same compact power-tool direction as admin questions
- present counts and exclusions clearly
- group related readiness numbers together
- keep breakdowns readable without making every metric equally loud

## Host page

Rules:
- `/host` should now work as a path-chooser first, not as the full power-tool screen.
- the landing page should explain the host screen, TV display, and player phones in plain language before asking the user to choose a path.
- the easy wizard should keep the next step obvious and hand off cleanly into the existing host controls once the room is created.
- clear game-building workflow
- strong hierarchy between round setup and supporting panels
- sticky or fixed secondary panels are fine when they aid setup
- avoid clutter and repeated wording
- when pack selection changes affect candidate counts, the UI should move into an explicit checking state rather than showing stale totals

## Player page

Rules:
- mobile-first
- clean primary action area
- no repeated labels where the state already explains itself
- keep controls at mobile-safe sizing
- lyric or excerpt-based question text should preserve real line breaks when the source text includes them

## Display page

Rules:
- optimise for visibility at distance
- minimise unnecessary labels and controls
- prioritise question clarity, timing clarity, and score clarity
- lyric or excerpt-based question text should preserve real line breaks when the source text includes them

## Theming and tokens

Use the shared theme tokens consistently.

Rules:
- use canonical Tailwind theme utilities where a token exists
- prefer `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`, and `border-border`
- use arbitrary value classes only for true one-off values

## Consistency rules for future changes

When making UI changes:
- always start from the most recently uploaded approved file for that screen
- do not rebuild from memory or from an older snapshot
- change one screen or one area at a time when possible
- keep new patterns aligned with the existing accepted page style
- update this guide when a new UI direction is approved

## Current accepted patterns worth preserving

- compact power-tool admin style
- collapsed secondary tools on admin questions
- sticky detail panel on admin questions
- tooltip help instead of bulky helper text on dense admin forms
- compact metadata controls
- compact suggested values layout with tooltip reasoning
- denser question list rows
- canonical Tailwind token classes

## When to update this guide

Update this guide when:
- a new page pattern is approved
- a new form or list style becomes the preferred approach
- a new helper-text or tooltip rule is agreed
- a substantial UI pass changes the direction of a screen
- host setup should open from a simple, low-friction landing page by default
- the landing page should make the difference between easy setup and existing host controls obvious at a glance
- advanced host controls should stay hidden behind an explicit button or reveal
- quick-start flows should use sensible recommended defaults and preview the resulting plan when possible
