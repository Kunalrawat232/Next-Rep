# Design workflow

Designs come from **Claude Design** via handoff bundles (**Export > Hand off to Claude Code**), one screen or feature at a time. Chosen style: clean and minimal (Apple-like).

## Timing (so no screen is built twice)

- **By 10 Oct:** the developer creates the design system (colours, typography, spacing, core components) and logo in Claude Design. From Phase 1 onward, all UI uses these design tokens, even before full screen designs exist.
- **11 to 15 Oct:** the developer designs the key screens in priority order (see [screens](screens.md)).
- **16 to 20 Oct:** each screen's handoff is applied **at the moment its feature is built**, not afterwards.
- **23 to 24 Oct:** polish and consistency only, never a redesign.

## Rules

- If a feature is built before its design arrives, build it functional and plain with the design tokens and the shared component names, so the later handoff maps cleanly.
- Keep component names identical to the list in the [design system](design-system.md).
- After the first real components exist, run `/design-sync` to keep Claude Design and the codebase aligned (run `/update` first if the command is missing).
- Record each design iteration in the [AI log](../learning/ai-log.md).
- The `frontend-design` plugin is guidance only; the design system wins.

## Handoff log

- **2026-10-09:** second handoff, same artifact (tokens unchanged): 60 artboards in total (the first 14 revised, the rest new), saved in `handoff/2026-10-09/`. Decision: on phones the Workout entry is a floating mic button, built the same day.

- **2026-10-08:** first handoff received as a Claude Design artifact (tokens, 7 mobile and 7 web artboards), saved in `handoff/2026-10-08/`. Applied: tokens, Geist, logo, PWA icons, responsive shell, sign-in, home. Gaps sent back to design: gym setup, history, settings, exercise picker, sign-up, empty and error states, and the "Did you mean 60?" and "total without the bar" prompts.
