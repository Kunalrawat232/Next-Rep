# database

The Supabase (Postgres) side: tables, Row Level Security, migrations, the seed, and the rate-limit tables and functions used by the Vercel functions. The device-side tables are in [local-data](../local-data/index.md).

| Doc                                                      | Read when                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [schema-and-rls.md](schema-and-rls.md)                   | Touching a table, a column, a policy, a trigger, a migration or the seed.                                             |
| [rate-limits-and-ceiling.md](rate-limits-and-ceiling.md) | Touching `consume_rate_limit`, `consume_daily_ceiling`, the counters, or the limits of `/api/parse` and `/api/coach`. |

Also: [data model](../../docs/architecture/data-model.md), [security checklist](../../docs/security/security-checklist.md), [threat model](../../docs/security/threat-model.md); ADR [009](../../docs/architecture/decisions/009-gym-bars-and-default-gym.md), [015](../../docs/architecture/decisions/015-one-gym-per-user.md). Deploying migrations: [deployment](../../docs/delivery/deployment.md).
