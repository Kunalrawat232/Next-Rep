# Open questions

| Question                                                    | Current default / decision                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-confirm voice sets after a short delay, or always tap? | **Always require a tap** for the MVP (confirmed 2026-10-08).                                                                          |
| Default unit                                                | **kg** (confirmed).                                                                                                                   |
| Which Gemini model on the free tier?                        | Set via `GEMINI_MODEL`; choose a fast, cheap model available on the free tier at build time. Never hardcoded.                         |
| Sync `raw_transcript` or keep it local only?                | **Sync it** (confirmed 2026-10-08): it is the user's own data and useful for debugging and QA. Revisit for privacy before submission. |
| Rate limiting for `/api/parse` on serverless                | **Supabase table `api_rate_limits`** (decided 2026-10-08), because in-memory counters do not survive across serverless instances.     |
