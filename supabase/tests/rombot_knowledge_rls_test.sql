-- ============================================================================
-- PR-C : ROMBot one-way sport-awareness guardrail (RLS layer)
-- ----------------------------------------------------------------------------
-- Proves, at the database layer, that public.rombot_knowledge enforces one-way
-- sport-awareness so a future change to the RLS policy, the users.platforms
-- field, or the retrieval path cannot silently leak sport knowledge across
-- tiers:
--
--   Base (platforms = '{}')            -> general only, ZERO bjj/bodybuilding
--   +BJJ  (platforms = '{bjj}')        -> general + bjj, ZERO bodybuilding
--   +BB   (platforms = '{bodybuilding}') -> general + bodybuilding, ZERO bjj
--   multi (platforms = '{bjj,bodybuilding}') -> general + both
--
-- Enforcement being guarded (verified against prod): RLS is ENABLED on
-- public.rombot_knowledge with a single SELECT policy
-- `rombot_knowledge_read_sport_entitled`:
--   (sport = 'general')
--   OR (sport = ANY(COALESCE((SELECT users.platforms
--                             FROM users WHERE users.id = auth.uid()),
--                            ARRAY[]::text[])))
--
-- HOW TO RUN (does NOT touch production data — all fixtures are rolled back):
--   supabase test db
-- or, against a specific database, with pgTAP + pg_prove installed:
--   pg_prove -d "$DATABASE_URL" supabase/tests/rombot_knowledge_rls_test.sql
--
-- SAFETY: everything runs inside a single transaction that ends in ROLLBACK.
-- No real rombot_knowledge or users rows are inserted, updated, or deleted.
--
-- NOTE on fixtures: this test inserts ephemeral rows into auth.users,
-- public.users and public.rombot_knowledge. Only the columns needed by the
-- policy are set (users.id, users.platforms). If the live schema declares other
-- NOT NULL columns without defaults on public.users, add them to the inserts
-- below — the assertions themselves are the authoritative part and should not
-- change. The users self-read relies on the same users-table RLS that prod
-- uses (a user can read its own row); that is what the policy subquery depends
-- on in production, so the test faithfully reproduces the real access path.
-- ============================================================================

BEGIN;

SELECT plan(11);

-- ----------------------------------------------------------------------------
-- Static guards: the policy/table shape itself. Dropping RLS or altering the
-- policy predicate trips these immediately.
-- ----------------------------------------------------------------------------

-- 1) The table exists.
SELECT has_table('public', 'rombot_knowledge', 'rombot_knowledge table exists');

-- 2) RLS is enabled on the table.
SELECT is(
  (SELECT relrowsecurity FROM pg_class
   WHERE oid = 'public.rombot_knowledge'::regclass),
  true,
  'RLS is enabled on rombot_knowledge'
);

-- 3) The expected policy exists.
SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename  = 'rombot_knowledge'
     AND policyname = 'rombot_knowledge_read_sport_entitled'),
  1,
  'policy rombot_knowledge_read_sport_entitled exists'
);

-- 4) The policy predicate matches the expected one-way sport-aware shape.
--    We assert on the normalized qual so a well-meaning rewrite that changes
--    the semantics (e.g. dropping the general-OR branch, or widening the
--    entitlement source) trips the test.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'rombot_knowledge'
      AND policyname = 'rombot_knowledge_read_sport_entitled'
      AND qual ILIKE '%sport%=%''general''%'
      AND qual ILIKE '%platforms%'
      AND qual ILIKE '%auth.uid()%'
      AND qual ILIKE '%= ANY%'
  ),
  'policy qual keeps the (sport=general) OR (sport = ANY(users.platforms for auth.uid())) shape'
);

-- ----------------------------------------------------------------------------
-- Behavioural guards: ephemeral fixtures + per-tier JWT impersonation.
-- ----------------------------------------------------------------------------

-- Fixture identities (fixed UUIDs so we can impersonate them via JWT claims).
--   base user  : 11111111-1111-1111-1111-111111111111  platforms '{}'
--   bjj user   : 22222222-2222-2222-2222-222222222222  platforms '{bjj}'
--   bb user    : 33333333-3333-3333-3333-333333333333  platforms '{bodybuilding}'
--   multi user : 44444444-4444-4444-4444-444444444444  platforms '{bjj,bodybuilding}'

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'pr-c-base@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'pr-c-bjj@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'pr-c-bb@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'pr-c-multi@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, platforms) VALUES
  ('11111111-1111-1111-1111-111111111111', ARRAY[]::text[]),
  ('22222222-2222-2222-2222-222222222222', ARRAY['bjj']),
  ('33333333-3333-3333-3333-333333333333', ARRAY['bodybuilding']),
  ('44444444-4444-4444-4444-444444444444', ARRAY['bjj','bodybuilding'])
ON CONFLICT (id) DO UPDATE SET platforms = EXCLUDED.platforms;

-- Ephemeral knowledge rows, one per sport, tagged so we can find only ours and
-- never depend on brittle production totals.
INSERT INTO public.rombot_knowledge (sport, topic, chunk) VALUES
  ('general',      'pr-c-fixture', 'pr-c general chunk'),
  ('bjj',          'pr-c-fixture', 'pr-c bjj chunk'),
  ('bodybuilding', 'pr-c-fixture', 'pr-c bodybuilding chunk');

-- Helper: run a visibility count for the currently-impersonated user, scoped to
-- our fixture rows only (topic = 'pr-c-fixture').
-- We switch to the `authenticated` role and set the JWT sub so auth.uid()
-- resolves to each fixture user, then RESET back to the test superuser.

-- ---- Base user: general only ------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.rombot_knowledge
   WHERE topic = 'pr-c-fixture' AND sport <> 'general'),
  0,
  'Base (platforms={}) sees ZERO sport-specific fixture rows'
);
SELECT is(
  (SELECT count(*)::int FROM public.rombot_knowledge
   WHERE topic = 'pr-c-fixture' AND sport = 'general'),
  1,
  'Base (platforms={}) can see the general fixture row'
);
RESET ROLE;

-- ---- BJJ user: general + bjj, no bodybuilding -------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.rombot_knowledge
   WHERE topic = 'pr-c-fixture' AND sport = 'bodybuilding'),
  0,
  'BJJ user (platforms={bjj}) sees ZERO bodybuilding fixture rows'
);
SELECT is(
  (SELECT array_agg(sport ORDER BY sport) FROM public.rombot_knowledge
   WHERE topic = 'pr-c-fixture'),
  ARRAY['bjj','general'],
  'BJJ user sees exactly {general, bjj} fixture rows'
);
RESET ROLE;

-- ---- Bodybuilding user: general + bodybuilding, no bjj ----------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

SELECT is(
  (SELECT count(*)::int FROM public.rombot_knowledge
   WHERE topic = 'pr-c-fixture' AND sport = 'bjj'),
  0,
  'Bodybuilding user (platforms={bodybuilding}) sees ZERO bjj fixture rows'
);
SELECT is(
  (SELECT array_agg(sport ORDER BY sport) FROM public.rombot_knowledge
   WHERE topic = 'pr-c-fixture'),
  ARRAY['bodybuilding','general'],
  'Bodybuilding user sees exactly {general, bodybuilding} fixture rows'
);
RESET ROLE;

-- ---- Multi-sport user: general + both --------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

SELECT is(
  (SELECT array_agg(sport ORDER BY sport) FROM public.rombot_knowledge
   WHERE topic = 'pr-c-fixture'),
  ARRAY['bjj','bodybuilding','general'],
  'Multi-sport user (platforms={bjj,bodybuilding}) sees {general, bjj, bodybuilding}'
);
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
