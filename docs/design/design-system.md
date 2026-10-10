# Design system

The Next Rep design system (colours, typography, spacing, core components) and logo were created in **Claude Design** and handed off on 2026-10-08. The saved handoff (tokens plus 14 artboards) is in [`handoff/2026-10-08/`](handoff/2026-10-08/). Decisions on how it is applied are in [ADR-008](../architecture/decisions/008-design-tokens-and-theming.md).

## Direction

Clean and minimal, Apple-like. Dark by default; borders, not shadows, separate surfaces; one accent colour, used sparingly.

## Gym UX principles

Mobile-first. Large tap targets (at least 48px, the `min-h-touch` utility), readable at arm's length, one-handed use, high contrast, minimal typing.

## Tokens

The source of truth in code is `src/index.css` (`@theme` for dark, `[data-theme='light']` for light). `tests/design/tokens.test.ts` checks the CSS against the handed-off `tokens.json` and checks every text pair for WCAG AA contrast (4.5:1) in both themes.

| Token                            | Dark                              | Light                             | Use                                  |
| -------------------------------- | --------------------------------- | --------------------------------- | ------------------------------------ |
| `surface-100`                    | `#000000`                         | `#FBFBFD`                         | page background                      |
| `surface-200`                    | `#1C1C1E`                         | `#FFFFFF`                         | cards, sheets                        |
| `surface-300`                    | `#2C2C2E`                         | `#F2F2F5`                         | inputs, chips                        |
| `ink` / `ink-muted`              | `#F5F5F7` / `#A1A1A6`             | `#1D1D1F` / `#6E6E73`             | text                                 |
| `line`                           | `#38383A`                         | `#D2D2D7`                         | borders, dividers                    |
| `accent` / `on-accent`           | `#5B8CFF` / `#000000`             | `#2563EB` / `#FFFFFF`             | primary action, active tab, focus    |
| `success` / `warning` / `danger` | `#34C759` / `#FF9F0A` / `#FF453A` | `#18793A` / `#B25E00` / `#D70015` | status, always with an icon or label |

Type: Geist (self-hosted, variable). Styles `display` 40/44, `title` 28/34, `headline` 20/26, `body` 17/24, `callout` 15/20, `caption` 13/18, `metric` 56/60. Spacing 8/16/24/32. Radii `sm` 8, `md` 14, `full` 999. Use them as Tailwind utilities (`bg-surface-200`, `text-ink-muted`, `border-line`, `text-title`, `rounded-md`).

## Shared components

Built so far, in `src/components/`: `Logo`, `Button` (primary, secondary), `TextField`, `AppShell` (sidebar from 1024px, bottom tab bar below). Keep these names identical in code and in Claude Design; the rest come with their features:

`VoiceButton`, `TranscriptBubble`, `SetConfirmCard`, `WeightBreakdown`, `AmbiguityPrompt`, `SetRow`, `SyncBadge`, `RestTimer`, `ExercisePicker`, `ProgressChart`, `PRBadge`, `SuggestionCard`, `OfflineBanner`.

## Status

Tokens, font, logo, PWA icons, shell, sign-in and home are applied. Not yet designed: gym setup, history, settings, exercise picker, sign-up, empty and error states (due 11 to 15 Oct). The light theme exists in CSS but has no switch until Settings. Run `/design-sync` once the first real feature components exist.

## Shared UI components (`src/components`)

Screens are built from these and never copy their classes (`src/components/noCopies.test.ts` fails if they come back):

- `Card` and `cardClasses`: the bordered box. The border colour is its tone (normal, `danger`, `warning`, `success`, `accent`). Callers add only layout classes (`flex flex-col gap-3`): border, background, radius and padding are fixed, because when two Tailwind utilities conflict the stylesheet decides, not their order, so a caller cannot override them.
- `ErrorMessage` (red box; with `onRetry` it holds a Try again button), `RetryMessage` (plain, with Try again), `LoadingMessage`, `EmptyState` (title, message, ways forward), `NotFound` (title, message, way back), `PageHeader` (back link, title, optional action), `Section` (titled card labelled by its heading), `Switch`, `Button`, `Chip`, `TextField`, `BackLink`.
- Wrappers do not add landmarks or accessible names of their own: an unlabelled box is not a region.

Left as they are on purpose: an error box with its button outside it (`GymsLoadError` and four pages), the retry messages in Settings and the sign-out panel (their own text style), the sign-in route's loading line, the Choose exercise header (a close link, not a back link), the list of problems on the log screen and the gym form's bar rows (no background).
