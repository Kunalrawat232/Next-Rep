# Exercise data maintenance

How to refresh the exercise animations and photos after the exercise list changes. Neither dataset is stored in the repository (see [ADR-013](../architecture/decisions/013-hotlinked-exercise-demonstrations.md) and [ADR-014](../architecture/decisions/014-photo-crossfade-demonstrations.md)).

## Animations

Download `data/exercises.json` from [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (do not commit it), then run:

```bash
node scripts/match-exercise-demos.mjs path/to/exercises.json
```

This prints the report of matched, ambiguous, declined and unmatched exercises. Add `--write` to update `src/domain/exercises.demo.json`, then run `npx prettier --write` on that file so the diff only shows real changes. Decisions for names that do not match go in `scripts/exercise-demo-overrides.json`.

## Photos

Photos of the popular exercises come from [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense) and are hotlinked, not stored. Re-run:

```bash
node scripts/match-exercise-photos.mjs path/to/dist/exercises.json
```

Add `--write`, then run Prettier on `src/domain/exercises.photos.json`. Decisions go in `scripts/exercise-photo-overrides.json`.
