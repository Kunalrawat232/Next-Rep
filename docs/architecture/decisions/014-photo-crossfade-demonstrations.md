# ADR-014: Photo crossfade demonstrations for the popular exercises

- **Status:** accepted (2026-10-16): tried on a branch, the developer liked it and kept it. Supplements [ADR-013](013-hotlinked-exercise-demonstrations.md).

## Context

The Gym visual animations (ADR-013) are 180×180 pixels with 12 frames at about 10 frames per second. That is what the file holds, so a squat looks choppy, and nothing in the app can fix it. The developer wants smooth up-and-down motion. Real smooth video has no free, openly licensed source we know of.

## Decision

- **A second, sharper source for the popular exercises.** [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense) has two 750×500 photos per exercise, a start pose and an end pose. The app shows them in a 3:2 box and **crossfades** the end pose over the start pose and back (3.2 s, ease-in-out, in CSS). This reads as the movement without being video. It is only two poses: it cannot show the path between them.
- **Same rules as ADR-013.** Hotlinked from jsDelivr pinned to one commit, never stored, bundled or cached. Paths in the map are checked (a folder name of letters, digits, `_` and `-` only). Both sources have their own switch in `demoMedia.ts`.
- **Photos first, animation as the fallback.** An exercise with photos shows them; every other exercise keeps the Gym visual animation, so nothing loses its demonstration. The two datasets share no ids, so photos are matched by normalised name (the same matcher, which never guesses and does not trust a lone row whose bracketed note names a variant) plus a reviewed overrides file. `scripts/match-exercise-photos.mjs` prints the report.
- **Coverage today:** 136 of 892 exercises, which is 53 of the 56 hand-made popular ones (the imported exercises are named differently in the two datasets).
- **The animation is shown at its own 180 px** (not stretched) inside the same 3:2 box.
- **Reduce motion:** only the start photo shows. If the end photo fails, the start photo stays.

## Alternatives considered

- **Keep only the animations:** no change, choppy.
- **Licence real video** (Gym visual HD videos, ExerciseDB, MuscleWiki) or **record our own clips** for the main lifts: the way to true smooth motion; costs money or time, so not done here.
- **Interpolate the 12-frame GIFs in the browser:** cannot invent the missing frames.

## Consequences

- To go back to animations only, set `PHOTO_MEDIA.enabled` to `false` in `demoMedia.ts`.
- Photos are 38 KB each, loaded only on the exercise page, and only when the page is opened.
- The photo dataset's licence is stated as Unlicense; its README does not separately state one for the images, so the credit says so and the claim is worth rechecking before a commercial release.
