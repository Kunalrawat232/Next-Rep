# ADR-013: Hotlinked exercise demonstrations

- **Status:** accepted (2026-10-16). Replaces the "No media" decision in [ADR-010](010-exercise-library-and-muscle-search.md).

## Context

ADR-010 left out the exercise dataset's pictures: they are © Gym visual, and the dataset's own README tells reusers to "obtain your own license" for the media. The developer wants each exercise to show an animated demonstration, and accepts that the use is non-commercial (a hackathon project, free to use, no income) and that the licence question is not settled by hotlinking.

## Decision

- **Hotlink, never copy.** The app loads each GIF (and a still thumbnail) at run time from the dataset's files on the jsDelivr CDN, pinned to one commit of the dataset. Nothing is downloaded, committed, bundled or cached by the service worker; a test checks the cache config and the repository for pictures.
- **Exact ids, then names.** `scripts/match-exercise-demos.mjs` writes `src/domain/exercises.demo.json` (our exercise id to the dataset's paths, plus its secondary muscles). Imported exercises match exactly, by the id the import derived from the dataset id; the 56 hand-made ones match by normalised name, with a reviewed overrides file for the rest. A name several rows share is never guessed. At the time of writing 878 of 892 exercises have a demonstration. The script prints a report of matched, ambiguous, declined and unmatched.
- **A static file, not a database column.** No migration, seed or RLS change; the map is reviewed in a diff and loaded as its own chunk (about 150 KB) only on the exercise page.
- **One place for the provider** (`src/domain/exercises/demoMedia.ts`): the base URL, the credit text and an `enabled` switch. Swapping to licensed media later, or turning all demonstrations off, touches only that file.
- **Never an error.** No entry, offline, a broken address or "reduce motion" each show a quiet placeholder or the still thumbnail in the same square, so the page does not shift.
- **Credit and limit stated:** in Settings, the README and `THIRD_PARTY_NOTICES.md`: © Gym visual, non-commercial.

## Alternatives considered

- **Keep ADR-010's "no media":** safest, but no demonstrations.
- **Download and host the GIFs:** copies the owner's files; ruled out by the licence wording and by the brief.
- **A `demo_media_url` column on `exercises`:** needs migration 0004, a seed regeneration and a hosted apply for no gain over a reviewed file.
- **The raw GitHub address instead of jsDelivr:** it caches for 5 minutes, is not meant to serve other sites, and can be rate limited.

## Consequences

- The licence risk is accepted by the developer, not removed. If the project is ever used commercially, license the media from Gym visual or set `DEMO_MEDIA.enabled` to `false`.
- The picture request goes from the user's browser to jsDelivr, which sees their IP address and the file asked for; the app sends no referrer (`referrerpolicy="no-referrer"`).
- The CDN must be reachable; otherwise the placeholder shows. Pinning to a commit means a later change in the dataset never alters what is shown.
- Re-run the matching after the exercise list changes (see the README).
