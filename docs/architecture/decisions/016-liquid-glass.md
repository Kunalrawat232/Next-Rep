# ADR-016: Glass surfaces in CSS, and one liquid glass lens

- **Status:** accepted (2026-10-19; proposed 2026-10-16); merged to main. To revert, see Consequences.

## Context

The developer asked to use [liquidGL](https://github.com/naughtyduk/liquidGL) across the design system. liquidGL is a WebGL lens that bends a snapshot of the page behind an element, in the style of Apple's Liquid Glass. It was tested on a throwaway page (headless Chromium, a Pixel 7 profile) before anything was built:

- It snapshots the page once. Our pages change all the time (route changes, loaded data, timers, animation, photo crossfades), and its own notes list CSS animations as unsupported and long pages as a GPU texture risk. So a snapshot of the whole page is the wrong thing to refract.
- Snapshotting a fixed **colour layer behind the app** instead (`#ambient`) works: it never changes, so it is never stale, and it is only as big as the screen.
- Over our near-black palette the refraction is hard to see. On the bottom bar it looked the same as plain CSS glass. A lens **tint is multiplied with the refracted colour**, so an accent-tinted button came out almost black and its icon vanished. A clear glass bubble with an accent icon and a hairline ring looked good.

## Decision

- **CSS glass across the system.** Tokens in `src/index.css`: translucent fills, a hairline edge, a highlight and soft shadow, for both themes, over a soft colour layer (`#ambient`, fixed, in the app shell) that gives glass something to show. `glass-flat` (no blur) is used for cards, buttons, chips and pills, which are many on a page and cost nothing; `glass` (with a backdrop blur, solid where unsupported or when less transparency is asked for) is used for the few overlays: the bars and dialogs. Text on glass is checked against the contrast rules in both themes (`tests/design/tokens.test.ts`).
- **liquidGL on three surfaces, all small, rounded and floating:** the Workout button (a clear glass bubble with an accent dumbbell), the **floating tab bar** (on phones the bottom bar is now a rounded glass dock, inset from the screen edges; from 1024 px up it is the sidebar again) and the **rest timer pill**, which is now sticky at the top of the workout screen and counts down while the sets list scrolls. A flat full-width bar showed no visible gain over CSS glass, which is why the tab bar was made a rounded dock first; cards and dialogs get no lens (GPU cost for no visible change).
- **A lens per element, not one at startup,** so elements that come and go (the rest pill) get and lose theirs: `useLiquidGlass(ref, preset)` with two presets, `round` (circles and pills) and `dock` (a long bar), in `src/lib/liquidGlass.ts`.
- **Safe by construction:** one config (`src/lib/liquidGlass.ts`, with an `enabled` flag); each lens is loaded on demand and only where WebGL exists, never on desktop widths, and not when the person asked for less transparency or more contrast; started again when the theme changes; taken off on the way out; any failure leaves the CSS glass as it was. A Settings switch ("Liquid glass effect", on by default) turns it off and is kept on the device. The library is not precached for offline use.
- **Dependency:** `liquid-gl` 3.0.0, exact, MIT, no dependencies, no install scripts; about 300 KB unpacked (on demand), a single maintainer, first published July 2026. Types are declared by hand in `src/types/liquid-gl.d.ts`.
- **The workout button icon** is a dumbbell (it was a microphone, which is now on the workout screen itself).

## Alternatives considered

- **liquidGL on every card, button and bar:** a WebGL render each, stale snapshots on a single-page app, and no visible gain on a dark palette.
- **SVG displacement filters for refraction:** Chromium only.
- **No liquidGL at all:** viable (the CSS glass carries the look); the lens is a small, removable extra.

## Consequences

- **The library turns off pointer events on the element it lenses** (it treats it as decoration), which made the whole tab bar and the Workout button unclickable on a phone. One rule in `src/index.css` (`[data-liquid] { pointer-events: auto !important }`, tested in `tests/design/tokens.test.ts`) turns them back on. Any new lens on a control needs that rule to keep applying. The round Workout button is not shown on the `/workout` screens, where it covered their buttons.

- The glass effect is only as visible as the colour behind it. The ambient layer is deliberately soft, so text contrast stays above 4.5:1; a stronger background would show more refraction but fail the contrast rules.
- Reverting: set `LIQUID_GLASS.enabled` to false, or remove `liquid-gl` and the `.liquidGL` class; the CSS glass does not depend on it.
- Not checked in a real phone browser or on real GPUs: only headless Chromium with software rendering.
