# ADR-001: Online-first with offline set logging

- **Status:** accepted (2026-10-08)

## Context

Gyms are often in basements with poor signal. An online-only logger fails at the worst moment, but full offline sync with conflict resolution is a large amount of work for a one-month solo build.

## Decision

Online by default, but **creating sets works offline**. Sets get client-generated UUIDs, are saved to IndexedDB first, and are pushed by a sync worker using idempotent upserts. Offline, only creation is allowed; editing and deleting require a connection. Deletes are soft deletes done online. Details: [offline sync](../offline-sync.md).

## Alternatives considered

- **Online only:** simplest, but fails the core use case (logging between sets with bad signal).
- **Full offline-first with conflict resolution (CRDT / last-write-wins):** most capable, but large effort and a big source of bugs for little benefit, since one user logs from one device at a time.

## Consequences

- No conflict resolution is needed.
- A user cannot fix a typo in a set until they are online.
- Voice recognition and Gemini still need internet; tap logging is the offline path.
- Local data can be evicted by the browser, so syncing happens as soon as possible.
