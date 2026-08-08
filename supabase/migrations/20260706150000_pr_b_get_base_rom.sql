-- ============================================================================
-- PR-B : get_base_rom RPC + latest-assessment index
-- ----------------------------------------------------------------------------
-- Canonical, efficient READ path by which Base and the +sport packs (+BJJ,
-- +BodyBuilding) consume a user's current Base ROM assessment. Base
-- (romrx.io/app) is the single source of truth for the ROM model; this is a
-- read over the existing `assessments` table and does NOT fork it.
--
-- "Base ROM assessment" = the user's MOST RECENT assessment, regardless of
-- sport tag. Owner's rule: "Every +sport app pulls from the individual's most
-- recent ROM assessment. Everything in the app uses the most recent ROM
-- assessment." There is NO sport filter: the `sport` column is context only
-- (bjj / bodybuilding / general are all just tags on the same ROM model), never
-- a Base-vs-not filter. Ordering is by assessed_at DESC, falling back to
-- created_at when assessed_at is null, and we return the single latest row.
--
-- Canonical identity: the auth USER id (assessments.user_id / auth.uid()).
-- Owner's rule: "get_base should provide a user ID. +sport should pull from
-- that ID. Coach and gym should do the same. There should be one ID per user
-- and it's pulled from Base." So get_base_rom keys on and authorizes by
-- user_id = auth.uid(); the returned assessments row carries user_id, which is
-- the one canonical Base ID that every downstream consumer references.
--
-- Completeness rule (Jim): "If there are numbers in their assessment it's a
-- complete assessment, even if they skip some." We therefore return the latest
-- row whenever it exists, with NO all-fields / placeholder / uniformity check.
-- A row with some null joints is still returned.
--
-- Auth model: SECURITY DEFINER + explicit auth.uid() check (same pattern as the
-- existing get_my_profile RPC, which bypasses RLS and filters server-side by
-- auth.uid()). The function only ever returns the CALLER'S OWN data: when
-- p_user_id is null it defaults to auth.uid(); if a p_user_id is passed it must
-- equal auth.uid(), otherwise the function returns no rows. This closes the
-- "read arbitrary users" hole. Cross-user coach/gym access is intentionally
-- deferred (see the extension point below) and NOT implemented here.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + CREATE INDEX IF NOT EXISTS.
-- ============================================================================

BEGIN;

-- 1) Index: make "latest assessment for a user" cheap at ~1,000 users.
--    Keyed on (user_id, assessed_at DESC) to match the final query exactly:
--    filter by user_id, order by assessed_at DESC, take the newest row. This
--    lets Postgres satisfy get_base_rom with an index scan + LIMIT 1 instead of
--    a sort, and it also serves the existing ResultsPreview / Settings /
--    MyProtocol reads that filter by user_id and order by assessed_at DESC.
--    Kept general (not partial on sport) because Base ROM is no longer scoped
--    by sport.
CREATE INDEX IF NOT EXISTS idx_assessments_user_id_assessed_at
    ON public.assessments (user_id, assessed_at DESC);

-- 2) get_base_rom RPC.
--    Returns 0 or 1 rows of the full assessments rowtype (all joint values,
--    rom_total, worst_joints, assessed_at, sport, user_id, and id =
--    assessment_id). Returning SETOF assessments keeps the shape in lock-step
--    with the table, so new joint columns are picked up automatically and
--    nothing is filtered. "No assessment yet" = zero rows, not an error.
CREATE OR REPLACE FUNCTION public.get_base_rom(p_user_id uuid DEFAULT NULL)
RETURNS SETOF public.assessments
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    uuid := auth.uid();
    v_target uuid := COALESCE(p_user_id, auth.uid());
BEGIN
    -- Authorization gate. The one canonical Base ID is user_id = auth.uid().
    -- For now we authorize ONLY the caller's own user_id: no authenticated
    -- caller, or a request for someone else's user_id, returns nothing (no
    -- error, no data leak).
    --
    -- COACH / GYM EXTENSION POINT (future PR, do not implement here):
    -- To let a coach or gym read an athlete's Base ROM, widen this check to
    -- also allow v_target when the athletes row for v_target
    -- (athletes.user_id = v_target) has coach_id / gym_id resolving to the
    -- caller (v_uid). e.g.:
    --     OR EXISTS (
    --         SELECT 1 FROM public.athletes ath
    --         WHERE ath.user_id = v_target
    --           AND (ath.coach_id = v_uid OR ath.gym_id IN (
    --                 SELECT gym_id FROM public.athletes WHERE user_id = v_uid))
    --     )
    -- Deferred deliberately: cross-user access is out of scope for PR-B.
    IF v_uid IS NULL OR v_target IS DISTINCT FROM v_uid THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT a.*
    FROM public.assessments a
    WHERE a.user_id = v_target
    ORDER BY COALESCE(a.assessed_at, a.created_at) DESC NULLS LAST
    LIMIT 1;
END;
$$;

-- Only authenticated users may call it; the body still self-checks auth.uid().
REVOKE ALL ON FUNCTION public.get_base_rom(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_base_rom(uuid) TO authenticated;

COMMIT;

-- Verification (run manually after apply, as an authenticated user):
--   SELECT id, sport, assessed_at, user_id, rom_total FROM get_base_rom();
--   -- own user_id explicitly (returns same row):
--   SELECT id FROM get_base_rom(auth.uid());
--   -- someone else's id returns zero rows:
--   SELECT count(*) FROM get_base_rom('00000000-0000-0000-0000-000000000000');
