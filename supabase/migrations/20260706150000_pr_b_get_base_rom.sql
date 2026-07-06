-- ============================================================================
-- PR-B : get_base_rom RPC + latest-assessment index
-- ----------------------------------------------------------------------------
-- Canonical, efficient READ path by which Base and the +sport packs (+BJJ,
-- +BodyBuilding) consume an athlete's current Base ROM assessment. Base
-- (romrx.io/app) is the single source of truth for the ROM model; this is a
-- read over the existing `assessments` table and does NOT fork it.
--
-- "Base ROM assessment" = the athlete's MOST RECENT assessment whose
-- sport marks it as a Base assessment. In this codebase the Base app records
-- assessments with sport = 'general' (confirmed in pr0/assessments*.json export:
-- the "basetest" Base-app accounts use sport='general', while the sport packs
-- use 'bjj' / 'bodybuilding'). We also accept 'base' defensively in case that
-- slug is adopted later. Ordering is by assessed_at DESC (the timestamp column
-- the frontend already orders on: ResultsPreview / Settings / MyProtocol).
--
-- Completeness rule (Jim): "If there are numbers in their assessment it's a
-- complete assessment, even if they skip some." We therefore return the latest
-- Base row whenever it exists, with NO all-fields / placeholder / uniformity
-- check. A row with some null joints is still returned.
--
-- Auth model: SECURITY DEFINER + explicit auth.uid() check (same pattern as the
-- existing get_my_profile RPC, which bypasses RLS and filters server-side by
-- auth.uid()). The function only ever returns the CALLER'S OWN athlete data:
-- when p_athlete_id is null it defaults to auth.uid(); if a p_athlete_id is
-- passed it must equal auth.uid(), otherwise the function returns no rows. This
-- closes the "read arbitrary athletes" hole. Cross-athlete access for coaches is
-- intentionally deferred (see issue #32 RLS) and is the single documented place
-- to widen authorization later.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + CREATE INDEX IF NOT EXISTS.
-- ============================================================================

BEGIN;

-- 1) Index: make "latest assessment for an athlete" cheap at ~1,000 users.
--    Keyed on (user_id, assessed_at DESC) because user_id is the ownership
--    column the app filters on (assessments.user_id = auth.uid()) and every
--    "latest assessment" query in the app orders by assessed_at DESC. This one
--    index serves get_base_rom AND the existing ResultsPreview / Settings /
--    MyProtocol reads, so it is kept general (not partial on sport).
CREATE INDEX IF NOT EXISTS idx_assessments_user_id_assessed_at
    ON public.assessments (user_id, assessed_at DESC);

-- 2) get_base_rom RPC.
--    Returns 0 or 1 rows of the full assessments rowtype (all joint values,
--    rom_total, worst_joints, assessed_at, sport, and id = assessment_id).
--    Returning SETOF assessments keeps the shape in lock-step with the table,
--    so new joint columns are picked up automatically and nothing is filtered.
CREATE OR REPLACE FUNCTION public.get_base_rom(p_athlete_id uuid DEFAULT NULL)
RETURNS SETOF public.assessments
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid    uuid := auth.uid();
    v_target uuid := COALESCE(p_athlete_id, auth.uid());
BEGIN
    -- No authenticated caller, or a request for someone else's athlete:
    -- return nothing (no error, no data leak). Coach access is deferred (#32).
    IF v_uid IS NULL OR v_target IS DISTINCT FROM v_uid THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT a.*
    FROM public.assessments a
    WHERE a.user_id = v_target
      AND a.sport IN ('general', 'base')   -- Base ROM assessment marker
    ORDER BY a.assessed_at DESC NULLS LAST
    LIMIT 1;
END;
$$;

-- Only authenticated users may call it; the body still self-checks auth.uid().
REVOKE ALL ON FUNCTION public.get_base_rom(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_base_rom(uuid) TO authenticated;

COMMIT;

-- Verification (run manually after apply, as an authenticated user):
--   SELECT id, sport, assessed_at, rom_total FROM get_base_rom();
--   -- own athlete explicitly (returns same row):
--   SELECT id FROM get_base_rom(auth.uid());
--   -- someone else's id returns zero rows:
--   SELECT count(*) FROM get_base_rom('00000000-0000-0000-0000-000000000000');
