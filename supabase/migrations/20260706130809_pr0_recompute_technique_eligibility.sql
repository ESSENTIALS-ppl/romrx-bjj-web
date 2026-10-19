-- ============================================================================
-- PR-0 recompute-all migration : backfill technique_eligibility (R/Y/G v33)
-- Mirrors compute-tiers v33 worst-joint rule. Idempotent (re-runnable).
-- Missing required joint => YELLOW (caution). RED dominates. GREEN when
-- every required joint is measured AND >= its _min, OR the technique has NO
-- threshold on any assessed joint (nothing we measure blocks it -> ready).
-- ============================================================================

BEGIN;

-- 1) Retire the stale legacy `flag` CHECK and clear off-model flag values.
--    Canonical readiness lives in `tier` (GREEN/YELLOW/RED). `flag` is legacy.
ALTER TABLE public.technique_eligibility
  DROP CONSTRAINT IF EXISTS eligibility_flag_check;
UPDATE public.technique_eligibility SET flag = NULL WHERE flag IS NOT NULL;

-- 2) Recompute tiers for every existing assessment (bjj + bodybuilding).
WITH
-- All (assessment, technique) pairs in scope. Techniques with no evaluable
-- requirement still appear here and resolve to GREEN below.
all_pairs AS (
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
),
per_joint AS (
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'hip_er'::text AS joint,
           t.hip_er_min::numeric AS thresh,
           (LEAST(COALESCE(a.hip_er_l, a.hip_er_r), COALESCE(a.hip_er_r, a.hip_er_l)))::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.hip_er_min IS NOT NULL AND t.hip_er_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'hip_ir'::text AS joint,
           t.hip_ir_min::numeric AS thresh,
           (LEAST(COALESCE(a.hip_ir_l, a.hip_ir_r), COALESCE(a.hip_ir_r, a.hip_ir_l)))::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.hip_ir_min IS NOT NULL AND t.hip_ir_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'hip_abd'::text AS joint,
           t.hip_abd_min::numeric AS thresh,
           (LEAST(COALESCE(a.hip_abd_l, a.hip_abd_r), COALESCE(a.hip_abd_r, a.hip_abd_l)))::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.hip_abd_min IS NOT NULL AND t.hip_abd_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'hip_flex'::text AS joint,
           t.hip_flex_min::numeric AS thresh,
           (LEAST(COALESCE(a.hip_flex_l, a.hip_flex_r), COALESCE(a.hip_flex_r, a.hip_flex_l)))::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.hip_flex_min IS NOT NULL AND t.hip_flex_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'shoulder_er'::text AS joint,
           t.shoulder_er_min::numeric AS thresh,
           (LEAST(COALESCE(a.shoulder_er_l, a.shoulder_er_r), COALESCE(a.shoulder_er_r, a.shoulder_er_l)))::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.shoulder_er_min IS NOT NULL AND t.shoulder_er_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'shoulder_flex'::text AS joint,
           t.shoulder_flex_min::numeric AS thresh,
           (LEAST(COALESCE(a.shoulder_flex_l, a.shoulder_flex_r), COALESCE(a.shoulder_flex_r, a.shoulder_flex_l)))::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.shoulder_flex_min IS NOT NULL AND t.shoulder_flex_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'ankle_df'::text AS joint,
           t.ankle_df_min::numeric AS thresh,
           (LEAST(COALESCE(a.ankle_df_l, a.ankle_df_r), COALESCE(a.ankle_df_r, a.ankle_df_l)))::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.ankle_df_min IS NOT NULL AND t.ankle_df_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'cervical_rot'::text AS joint,
           t.cervical_rot_min::numeric AS thresh,
           (LEAST(COALESCE(a.cervical_rot_l, a.cervical_rot_r), COALESCE(a.cervical_rot_r, a.cervical_rot_l)))::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.cervical_rot_min IS NOT NULL AND t.cervical_rot_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'cervical_lat'::text AS joint,
           t.cervical_lat_min::numeric AS thresh,
           (LEAST(COALESCE(a.cervical_lat_l, a.cervical_lat_r), COALESCE(a.cervical_lat_r, a.cervical_lat_l)))::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.cervical_lat_min IS NOT NULL AND t.cervical_lat_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'lumbar_flex'::text AS joint,
           t.lumbar_flex_min::numeric AS thresh,
           (a.lumbar_flex)::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.lumbar_flex_min IS NOT NULL AND t.lumbar_flex_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'lumbar_ext'::text AS joint,
           t.lumbar_ext_min::numeric AS thresh,
           (a.lumbar_ext)::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.lumbar_ext_min IS NOT NULL AND t.lumbar_ext_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'cervical_flex'::text AS joint,
           t.cervical_flex_min::numeric AS thresh,
           (a.cervical_flex)::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.cervical_flex_min IS NOT NULL AND t.cervical_flex_min <> 0
    UNION ALL
    SELECT a.id AS assessment_id, a.user_id, a.athlete_id, a.sport,
           t.id AS technique_id, t.code AS technique_code,
           'cervical_ext'::text AS joint,
           t.cervical_ext_min::numeric AS thresh,
           (a.cervical_ext)::numeric AS aval
    FROM assessments a
    JOIN techniques t ON t.sport = a.sport
    WHERE a.sport IN ('bjj','bodybuilding')
      AND t.cervical_ext_min IS NOT NULL AND t.cervical_ext_min <> 0
),
-- Per (assessment, technique): worst measured ratio, missing-joint flag, and
-- arrays of limiting-joint descriptions for non-green tiers.
per_tech AS (
    SELECT
        assessment_id, user_id, athlete_id, sport, technique_id, technique_code,
        -- worst ratio among MEASURED required joints (NULL if none measured)
        MIN(CASE WHEN aval IS NOT NULL THEN aval / NULLIF(thresh,0) END) AS worst_ratio,
        -- any required joint with no measurement?
        BOOL_OR(aval IS NULL) AS has_missing,
        -- limiting joints that are RED (< 90% of min)
        ARRAY_REMOVE(ARRAY_AGG(
            CASE WHEN aval IS NOT NULL AND aval / NULLIF(thresh,0) < 0.9
                 THEN joint || ':' || aval::text || ' vs min ' || thresh::text END
        ), NULL) AS red_joints,
        -- limiting joints in the 90-100% YELLOW band
        ARRAY_REMOVE(ARRAY_AGG(
            CASE WHEN aval IS NOT NULL
                      AND aval / NULLIF(thresh,0) >= 0.9
                      AND aval / NULLIF(thresh,0) < 1.0
                 THEN joint || ':' || aval::text || ' vs min ' || thresh::text END
        ), NULL) AS yellow_joints,
        -- required joints never measured
        ARRAY_REMOVE(ARRAY_AGG(
            CASE WHEN aval IS NULL
                 THEN joint || ':not_measured(min ' || thresh::text || ')' END
        ), NULL) AS missing_joints
    FROM per_joint
    GROUP BY assessment_id, user_id, athlete_id, sport, technique_id, technique_code
),
scored AS (
    SELECT
        p.assessment_id, p.user_id, p.athlete_id, p.sport, p.technique_id, p.technique_code,
        CASE
            -- No evaluable requirement (no per_tech row) -> GREEN by rule.
            WHEN pt.technique_id IS NULL THEN 'GREEN'
            WHEN pt.worst_ratio IS NOT NULL AND pt.worst_ratio < 0.9 THEN 'RED'
            WHEN (COALESCE(array_length(pt.yellow_joints,1),0) > 0) OR pt.has_missing THEN 'YELLOW'
            ELSE 'GREEN'
        END AS tier,
        CASE
            WHEN pt.technique_id IS NULL THEN ARRAY[]::text[]
            WHEN pt.worst_ratio IS NOT NULL AND pt.worst_ratio < 0.9 THEN pt.red_joints
            WHEN (COALESCE(array_length(pt.yellow_joints,1),0) > 0) OR pt.has_missing
                 THEN pt.yellow_joints || pt.missing_joints
            ELSE ARRAY[]::text[]
        END AS limiting_joints
    FROM all_pairs p
    LEFT JOIN per_tech pt ON pt.assessment_id = p.assessment_id
                         AND pt.technique_id = p.technique_id
)
INSERT INTO public.technique_eligibility
    (user_id, athlete_id, assessment_id, technique_id, technique_code, sport, tier, limiting_joints, computed_at)
SELECT user_id, athlete_id, assessment_id, technique_id, technique_code, sport, tier, limiting_joints, now()
FROM scored
ON CONFLICT (user_id, assessment_id, technique_id)
DO UPDATE SET
    tier            = EXCLUDED.tier,
    limiting_joints = EXCLUDED.limiting_joints,
    technique_code  = EXCLUDED.technique_code,
    sport           = EXCLUDED.sport,
    athlete_id      = EXCLUDED.athlete_id,
    computed_at     = EXCLUDED.computed_at;

COMMIT;

-- Verification (run manually after apply):
--   SELECT sport, tier, count(*) FROM technique_eligibility GROUP BY sport, tier ORDER BY sport, tier;
