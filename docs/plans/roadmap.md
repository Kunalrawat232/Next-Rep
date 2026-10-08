# Roadmap

Milestones are guidance. If behind, cut from "Could" first, then "Should", **never** compromise tests or security.

| Dates        | Phase                 | Goals                                                                                                                                                                                           |
| ------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7 to 8 Oct   | Phase 0: Foundation   | Repo, context files, scaffold, CI, Supabase schema, deploy "hello world"; distribute and retire the project brief. _Developer in parallel: design system + logo in Claude Design_               |
| 9 to 10 Oct  | Phase 1: Core logging | Auth, RLS, gyms/bars, exercise library, tap logging, weight breakdown, using design tokens. _Developer: finish design system + logo_                                                            |
| 11 to 15 Oct | Phase 2: Insight      | History, progress charts, PRs; full unit tests for weight maths. _Developer: design key screens in Claude Design_                                                                               |
| 16 to 20 Oct | Phase 3: Big build    | Day 1 to 2 voice + parser + validators; Day 3 offline queue + sync; Day 4 Gemini fallback; Day 5 progression rules + AI-assisted test pass. Apply each screen handoff when its feature is built |
| 21 to 22 Oct | Phase 4: Optional     | Laya spike ONLY if everything above works (timeboxed, see [ADR-004](../architecture/decisions/004-laya-deferred.md)); otherwise bug fixing                                                      |
| 23 to 24 Oct | Phase 5: Harden       | UX polish and consistency (no redesigns), security review, edge cases, colleague testing                                                                                                        |
| **25 Oct**   | **Feature freeze**    | No new features after this                                                                                                                                                                      |
| 26 to 29 Oct | Phase 6: Ship         | Docs, AI write-up, QA report, demo video + backup take                                                                                                                                          |
| 30 Oct       | Submit                | Final checks; submit by afternoon                                                                                                                                                               |

**At code freeze (25 Oct): switch "Confirm email" on** in the Supabase Auth settings, so duplicate sign-ups stop revealing which addresses are registered (see ADR-007). Before that, on 23 to 24 Oct: check that confirmation emails really arrive (the free default mail service is limited to about 2 an hour and is best effort), test sign-up and the "check your email" path on a Vercel preview, and keep two pre-confirmed demo accounts for judges, so nobody is blocked by a missing email.

**To revisit at the start of Phase 3 (16 Oct):** re-evaluate the graphify knowledge-graph tool once `parser`, `sync` and `api` exist; it was removed in Phase 0 because the project was too small to benefit (see the AI log, 2026-10-08).
