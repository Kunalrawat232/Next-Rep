# Prompt template for Claude Code

The structure used when giving Claude Code a task. It keeps prompts short and makes the output reviewable.

```
Goal:        <one sentence: the outcome, not the steps>
Context:     <docs to read first, e.g. docs/domain/weight-rules.md; files likely involved>
Constraints: <rules that apply: pure domain, no new deps, data model frozen, ...>
Plan first:  show a short plan (files to change, approach, tests) and wait for "go"
Tests:       <what must be covered; table-driven where possible>
Done when:   code + tests pass, lint and types clean, docs updated, ai-log entry added
```

## Principles

- Plan before coding; ask before adding dependencies, changing the data model or changing a decision.
- One feature or fix per task; commit after each working step.
- Name the docs the AI must read, rather than pasting them.
- Say what to do when unsure: check docs, say so, do not guess.
- After each task, log it in [`docs/learning/ai-log.md`](../learning/ai-log.md).
