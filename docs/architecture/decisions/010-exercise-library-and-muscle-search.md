# ADR-010: A bundled exercise library with muscle search

- **Status:** accepted (2026-10-09). The "No media" decision below is replaced by [ADR-013](013-hotlinked-exercise-demonstrations.md).

## Context

The app shipped 56 hand-checked exercises with voice aliases. The developer wanted a larger library and search by muscle. The open dataset [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) has 1,324 exercises with muscle data. Its data is MIT-licensed; its images and GIFs belong to Gym visual and are not licensed to us.

## Decision

- **Two sources, one list.** The curated exercises (56 at the time) stay first-class (hand-checked, with aliases such as "bench", needed for voice logging). The imported exercises (about 830) sit below them, about 890 in all. Both are global rows in `seed.sql`, because a logged set points at an exercise by id and the row must exist.
- **Import, then review, then commit.** `scripts/import-exercises.mjs` reads the dataset once and writes `src/domain/exercises.extended.json`. It keeps only equipment that maps to how we count weight (barbell, EZ bar, Smith, dumbbell, cable, machine, bodyweight), drops cardio, neck, stretches, mobility and "(male)"-style variants, drops names that duplicate a curated exercise, and maps the dataset's body parts and targets to our three body parts and 16 muscles. It leaves out kettlebell, band, weighted and the other equipment that does not fit. Ids are version 5 UUIDs of the dataset id under a fixed namespace, so re-running changes nothing. The 17 MB source is not stored in the repo.
- **No media.** Only text fields are used. This keeps us inside the licence; the attribution and MIT text are in `THIRD_PARTY_NOTICES.md`.
- **Migration 0003 adds `exercises.muscle`** (nullable, 16 values, check constraint). Custom exercises leave it empty and fall back to upper, lower or core.
- **Search is local and works offline.** The library is bundled and loaded as its own chunk when an exercise screen opens, so other screens do not pay for it (12 KB gzipped). Every query word must match the start of a word in the name, an alias, the muscle (with everyday words such as "pecs" or "delts"), the body part or the equipment. Names rank above aliases, aliases above muscles, and your own then curated exercises above imported ones. Typing costs about 0.03 ms per search over the whole library; a test keeps it under a few milliseconds.
- **The list is cut to 40 results at a time**, because drawing about 900 rows is what would be slow, not searching them.
- **Only the user's own exercises come from the network.** If they cannot load, the built-in ones still work and a notice says so.
- **Custom exercises** cannot reuse an existing name or spoken word, so voice logging stays unambiguous. The spoken-words limit is counted in bytes (1000), as in the database.
- **EZ bar and Smith exercises appear under the Barbell chip**, since the design's chips have no place for them.

## Alternatives considered

- **Import everything (1,324):** more rows, but kettlebell, band and "weighted" exercises would carry weight rules we have not defined, and near-duplicate names would make "say a curl" ambiguous.
- **Fetch the library from Supabase on each visit:** no bundle cost, but search would not work offline.
- **Use the dataset's images and GIFs:** nicer rows, but they need Gym visual's own licence.
- **Match only upper, lower and core:** no data change, but too coarse to be useful.

## Consequences

- The migration and the larger seed must be applied to the hosted project (see the deployment guide).
- Imported names are in the dataset's wording and have no aliases, so voice logging prefers the curated exercises.
- The muscle for some imported exercises follows the dataset and may not match a trainer's view.
- A new exercise from a later dataset version needs a re-import and a re-seed.
