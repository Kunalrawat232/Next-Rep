# Design system

The Next Rep design system (colours, typography, spacing, core components) and logo were created in **Claude Design** and handed off on 2026-10-08. The saved handoff (tokens plus 14 artboards) is in [`handoff/2026-10-08/`](handoff/2026-10-08/); the second handoff of 2026-10-09 (60 artboards) is in [`handoff/2026-10-09/`](handoff/2026-10-09/). Decisions on how it is applied are in [ADR-008](../architecture/decisions/008-design-tokens-and-theming.md).

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

## Glass

Surfaces are translucent glass over a soft colour layer (`#ambient`, fixed behind the app), set in the tokens block of `src/index.css` for both themes: `--glass-fill`, `--glass-fill-strong`, `--glass-line` (the `border-glass-line` colour), `--glass-highlight`, `--glass-shadow`, `--glass-blur`, `--ambient-a/b/c`. Use `glass-flat` for cards, buttons, chips and pills (no blur, so cheap in long lists) and `glass` for the few overlays that sit over scrolling content (bars, dialogs). `Card`, `Button` and `Chip` already do. Text colours must keep 4.5:1 on the glass over the brightest ambient glow; `tests/design/tokens.test.ts` checks it. The floating Workout button is also a liquid glass lens (liquid-gl, one config in `src/lib/liquidGlass.ts`, a Settings switch). See [ADR-016](../architecture/decisions/016-liquid-glass.md).

## Loaders

A screen waiting for data shows a skeleton of what is coming (a title and glass cards of shimmering blocks), not a word: `LoadingMessage` (`variant="page"`, the default). Inside a card, `LoadingMessage variant="inline"` is a ring with two short blocks. While the app starts and finds out who is signed in, `FullPageLoader` shows the mark inside a turning ring. Every loader fades in after 200 ms (`.loader-in`), so data that arrives at once shows no loader at all; the shimmer and the ring stand still when the person asked for less motion; and each is one announced status with a hidden label (the visible picture is not read out). Build any new loader from `Skeleton` and `Spinner` in `src/components/Loading.tsx`.

## Shared components

Keep these names identical in code and in Claude Design.

**Built** (generic ones in `src/components/`, feature ones next to their feature):

- `src/components/`: `Logo`, `Button` (primary, secondary), `TextField`, `AppShell` (sidebar from 1024px, bottom tab bar below, floating mic as the phone's Workout entry), `Chip`, `BackLink`, `Switch`, and the shared boxes and messages listed in the next section.
- Features: `AmbiguityPrompt`, `BreakdownCard` (the design's `WeightBreakdown`), `SetList` (the design's `SetRow`), `RestTimer` and `OfflineBanner` (`src/features/workout`), `SyncBadge` (`src/features/sync`), `ExercisePicker` (`src/features/exercises`), `ProgressChart` and `PrBadge` (`src/features/progress`; the design name was `PRBadge`, the code spells it `PrBadge`).

**Not built yet:** `VoiceButton` (the workout screen has a disabled voice button), `TranscriptBubble`, `SetConfirmCard` (the confirm step for voice sets), `SuggestionCard` (today's suggestion is plain markup on Home, not a component). Status: planned (Phase 3), not built yet, for the three voice ones.

## Status

As of 2026-10-10: tokens, font, logo, PWA icons, shell, sign-in, Home, gym setup, exercise picker, history, progress, settings (with the light theme switch) and the empty, loading and error states are applied. Not applied: the voice screens and prompts that need voice (listening, parsing, `SetConfirmCard`) and the offline-banner variants for voice, which are planned for Phase 3. Home, settings, units and the shared components below are on `feat/home`, not yet merged. Run `/design-sync` once the first real feature components exist.

## Shared UI components (`src/components`)

Screens are built from these and never copy their classes (`src/components/noCopies.test.ts` fails if they come back):

- `Card` and `cardClasses`: the bordered box. The border colour is its tone (normal, `danger`, `warning`, `success`, `accent`). Callers add only layout classes (`flex flex-col gap-3`): border, background, radius and padding are fixed, because when two Tailwind utilities conflict the stylesheet decides, not their order, so a caller cannot override them.
- `ErrorMessage` (red box; with `onRetry` it holds a Try again button), `RetryMessage` (plain, with Try again), `LoadingMessage`, `EmptyState` (title, message, ways forward), `NotFound` (title, message, way back), `PageHeader` (back link, title, optional action), `Section` (titled card labelled by its heading), `Switch`, `Button`, `Chip`, `TextField`, `BackLink`.
- Wrappers do not add landmarks or accessible names of their own: an unlabelled box is not a region.

Left as they are on purpose: an error box with its button outside it (`GymsLoadError` and four pages), the retry messages in Settings and the sign-out panel (their own text style), the sign-in route's loading line, the Choose exercise header (a close link, not a back link), the list of problems on the log screen and the gym form's bar rows (no background).
