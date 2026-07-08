# Database guardrail tests

## `rombot_knowledge_rls_test.sql` — ROMBot one-way sport-awareness (RLS)

pgTAP test proving `public.rombot_knowledge` never leaks sport knowledge across
tiers: Base sees only `general`; each sport pack sees `general` + its own
sport(s) and never another sport's rows. It also asserts RLS is enabled and the
policy `rombot_knowledge_read_sport_entitled` keeps its expected shape.

All fixtures are ephemeral and the transaction ends in `ROLLBACK`, so it never
mutates real `rombot_knowledge` or `users` rows.

### Run it

```bash
# via the Supabase CLI (spins up the local test DB, applies migrations, runs pgTAP)
supabase test db

# or directly against a database that has pgTAP installed
pg_prove -d "$DATABASE_URL" supabase/tests/rombot_knowledge_rls_test.sql
```

> The companion `src/lib/rombotKnowledgeAccess.test.ts` (vitest) locks the same
> rule as an executable truth table and asserts this SQL file keeps its required
> assertions, so the guard can't be silently gutted in CI environments without a
> Postgres instance.
