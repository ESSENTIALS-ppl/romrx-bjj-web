# compute-tiers v33 — readiness engine

Fires from the AFTER INSERT trigger on `public.assessments`.

## What it does
1. Recomputes `worst_joints` + `rom_total` on the assessment (v32 parity).
2. For sports with a technique catalog (`bjj`, `bodybuilding`), scores every
   technique into a GREEN / YELLOW / RED **tier** and writes one row per
   technique into `technique_eligibility` (upsert on
   `user_id, assessment_id, technique_id`).

## The R/Y/G rule (worst-joint driven)
For each technique, only the joints it requires (`<joint>_min` not null/0) are
considered. For each required joint, the athlete's **worse** of left/right is
compared to the `_min` threshold:

- **RED** — any required (measured) joint `< 90%` of its `_min`
- **YELLOW** — any measured joint in the `90–100%` band, **OR** any required
  joint the athlete never measured (NULL → caution, data incomplete)
- **GREEN** — every required joint measured **and** `≥` its `_min`

`limiting_joints[]` lists the joints driving a non-green tier (measured
shortfalls as `joint:value vs min X`, unmeasured as `joint:not_measured(min X)`).

## Why v33 exists
v32 was a boot-safe stub that skipped all technique scoring
(`bjj_tier_scoring_deferred_to_v33`), leaving `technique_eligibility` stale
(537 null + 11 legacy `DELAY_TECHNIQUE`). Readiness was effectively dead — the
"all-30" test profile produced no flags. v33 restores it.

## Validation
Logic was validated locally against all 13 production assessments and matches
1:1 with the set-based SQL backfill (`../migrations/*_pr0_recompute_*`). The
"all-30" test profile (`send.jim.scott+basetest1`) now correctly lights up
mostly RED with real limiting joints.

Missing-joint handling (unmeasured required joint → YELLOW) was chosen to avoid
false-greens (e.g. a BB athlete with NULL shoulder_er previously showed 27
techniques as safe-green; they now correctly show caution).
