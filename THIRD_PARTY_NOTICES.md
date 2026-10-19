# Third-party notices

## Liquid glass effect: liquid-gl

The floating Workout button on phones uses [liquid-gl](https://github.com/naughtyduk/liquidGL) (version
3.0.0, no runtime dependencies), loaded on demand where WebGL exists. It is released under the MIT
licence, reproduced below as that licence requires. See
[ADR-016](docs/architecture/decisions/016-liquid-glass.md).

```text
MIT License

Copyright (c) NaughtyDuk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

Exclusion of Assets

The MIT License above applies only to the source code of this project (the
contents of the `scripts/` and `package/` directories). It does NOT apply to
the contents of the `assets/` directory (including but not limited to the
audio files under `assets/audio/` and `assets/fonts/`), which are provided
for demonstration purposes only and may not be copied, redistributed, or
reused outside of this repository without separate permission from their
respective rights holders.

---

Support Open Source

If this project has been useful to you, please consider supporting its
continued open-source development at https://liquidgl.naughtyduk.com
```

## Exercise photos: yuhonas/free-exercise-db

Photos of the popular exercises (a start and an end pose, crossfaded by the app) are loaded at run time
from [free-exercise-db](https://github.com/yuhonas/free-exercise-db), which is released under the
Unlicense (public domain). They are hotlinked through jsDelivr, pinned to one commit, and are not
stored, bundled or cached by Next Rep. The repository's page names the licence as Unlicense without
a separate statement for the images. See
[ADR-014](docs/architecture/decisions/014-photo-crossfade-demonstrations.md).

## Exercise data: hasaneyldrm/exercises-dataset

About 835 of the exercises in `src/domain/exercises.extended.json` (names, equipment, body parts and
muscle groups) were selected and converted from the open
[exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset), using
`scripts/import-exercises.mjs`. The dataset's data is released under the MIT License, reproduced
below as that licence requires.

**Exercise demonstrations (hotlinked, not part of this project's files):** the dataset's animated
GIFs and thumbnails are © Gym visual (https://gymvisual.com/), redistributed in the dataset under
separate terms. Next Rep does not store, bundle or cache them: the exercise page loads them at run
time from the dataset's files on the jsDelivr CDN, for non-commercial use, and credits the owner on
the About page (Settings, then "About and credits"). The licence below covers the dataset's data, **not** this media. If the project is ever used
commercially, the media must be licensed from Gym visual or removed: set `DEMO_MEDIA.enabled` to
`false` in `src/domain/exercises/demoMedia.ts`. See
[ADR-013](docs/architecture/decisions/013-hotlinked-exercise-demonstrations.md) (which replaces the "no
media" decision in [ADR-010](docs/architecture/decisions/010-exercise-library-and-muscle-search.md)).

```text
MIT License

Copyright (c) 2026 Hasan Emir Yıldırım

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation and data files (the "Software"),
to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

------------------------------------------------------------------------------
MEDIA EXCEPTION
------------------------------------------------------------------------------

The MIT license above covers ONLY the code, tooling, dataset structure, and
instruction text/translations in this repository.

It DOES NOT cover the exercise media in the `images/` and `videos/`
directories. That media is © Gym visual (https://gymvisual.com/) and is
included here with the rights holder's written permission, at 180×180
resolution, and must retain the attribution "© Gym visual —
https://gymvisual.com/". Its use and reuse are governed by Gym visual's Terms
& Conditions (https://gymvisual.com/content/3-terms-and-conditions-of-use) and
by `NOTICE.md` in this repository — NOT by the MIT license above. Cloning this
repository does not grant you any license to the media; obtain your own from
Gym visual.
```
