# Design system

The Next Rep design system (colours, typography, spacing, core components) and logo are created in **Claude Design** (due by 10 Oct 2026). Until the handoff arrives, UI uses the placeholder tokens in `src/index.css` (`surface`, `surface-raised`, `ink`, `ink-muted`, `accent`) so the later handoff maps cleanly.

## Direction

Clean and minimal, Apple-like. Dark mode by default.

## Gym UX principles

Mobile-first. Large tap targets (at least 48px), readable at arm's length, one-handed use, high contrast, minimal typing.

## Shared component names

Keep these names identical in code and in Claude Design:

`VoiceButton`, `TranscriptBubble`, `SetConfirmCard`, `WeightBreakdown`, `AmbiguityPrompt`, `SetRow`, `SyncBadge`, `RestTimer`, `ExercisePicker`, `ProgressChart`, `PRBadge`, `SuggestionCard`, `OfflineBanner`.

## Status

Tokens pending the Claude Design handoff. Update this file with the real tokens when it lands, and run `/design-sync` once the first real components exist.
