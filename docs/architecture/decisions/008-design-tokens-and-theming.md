# ADR-008: Design tokens in CSS, dark by default, self-hosted Geist

- **Status:** accepted (2026-10-08)

## Context

The Claude Design handoff defines colours for a dark and a light theme, a type scale, spacing and radii, and uses the Geist typeface. The app must work offline in a gym, so nothing visual can depend on a third-party request.

## Decision

- **Tokens live in `src/index.css`** as Tailwind `@theme` variables (dark values) with a `[data-theme='light']` override. Components use the utilities (`bg-surface-200`, `text-ink-muted`) and never raw hex values. Light is complete and has a switch in Settings (2026-10-10): the choice is kept on the device (`next-rep-theme`, one key for the device, not per user) and applied by a small script in `index.html` before the first paint, so there is no dark flash. The same script and the app set the browser's `theme-color`; a test keeps those values equal to the `surface-100` tokens. The script is inline: if a strict `script-src` is added to the Content-Security-Policy later (today it only sets `frame-ancestors`), it needs a hash or nonce, or the flash returns.
- **Dark is the default**, as the design specifies for use during a workout. Theme colour in the manifest and `index.html` is `#000000`.
- **Geist is self-hosted** through `@fontsource-variable/geist` (OFL-1.1, no dependencies, no runtime requests). Only the Latin cut is precached for offline use; other subsets load on demand when online. Geist Mono is not installed because no screen uses it.
- **Tests guard the tokens:** CSS must equal the saved `tokens.json`, and every text/background pair must reach 4.5:1 in both themes.
- **PWA icons** are rendered from the logo with the already-installed Playwright Chromium (`scripts/generate-icons.mjs`) and committed. The manifest declares 192, 512 and a maskable 512; a test checks the files exist with the declared sizes.
- **Responsive shell:** one `nav` element laid out by CSS, a bottom tab bar below 1024px and a sidebar above. Pages not built yet appear as disabled items.

## Alternatives considered

- **Google Fonts link (as in the design files):** adds a third-party request and fails offline.
- **Theme tokens in a TypeScript object:** a second source of truth beside Tailwind.
- **Separate mobile and desktop components:** two code paths for every screen.

## Consequences

- The font adds about 180 KB to `node_modules` and 29 KB (Latin) to the offline cache.
- The design's sign-in is magic-link only; the app keeps email + password (ADR-007), so that screen is the design's style, not its exact content.
