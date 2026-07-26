#!/usr/bin/env python3
"""
PR-0 compute-tiers v33 DRY-RUN (no DB writes).
Applies the agreed R/Y/G worst-joint rule to each assessment x technique.

RULE (worst-joint driven):
For each technique, look ONLY at joints it requires (technique.<joint>_min not null/0).
For each required joint, take the athlete's WORSE of left/right (min of l/r).
Compare that worse value vs the _min threshold:
  - GREEN : every required joint >= its _min
  - YELLOW: every required joint >= 90% of _min, but >=1 joint in the 90-100% band
  - RED   : any required joint < 90% of _min
limiting_joints = the joints that fall short (yellow band joints for yellow; sub-90% joints for red).
"""
import json, os

HERE = os.path.dirname(__file__)
A = json.load(open(os.path.join(HERE, 'assessments_full.json')))
T = json.load(open(os.path.join(HERE, 'techniques.json')))

# Map each technique _min column -> the assessment joint value getter.
# Single-value joints (no l/r) map directly; bilateral joints use worse (min) of l/r.
BILATERAL = {
    'hip_er': ('hip_er_l', 'hip_er_r'),
    'hip_ir': ('hip_ir_l', 'hip_ir_r'),
    'hip_abd': ('hip_abd_l', 'hip_abd_r'),
    'hip_flex': ('hip_flex_l', 'hip_flex_r'),
    'shoulder_er': ('shoulder_er_l', 'shoulder_er_r'),
    'shoulder_flex': ('shoulder_flex_l', 'shoulder_flex_r'),
    'ankle_df': ('ankle_df_l', 'ankle_df_r'),
    'cervical_rot': ('cervical_rot_l', 'cervical_rot_r'),
    'cervical_lat': ('cervical_lat_l', 'cervical_lat_r'),
}
SINGLE = {
    'lumbar_flex': 'lumbar_flex',
    'lumbar_ext': 'lumbar_ext',
    'cervical_flex': 'cervical_flex',
    'cervical_ext': 'cervical_ext',
}

# Which _min columns we can actually evaluate given assessment columns present.
EVALUABLE = set(BILATERAL) | set(SINGLE)

def athlete_value(assessment, joint):
    """Worse (min) of l/r for bilateral, direct for single. None if missing."""
    if joint in BILATERAL:
        l, r = BILATERAL[joint]
        vals = [assessment.get(l), assessment.get(r)]
        vals = [v for v in vals if v is not None]
        return min(vals) if vals else None
    if joint in SINGLE:
        return assessment.get(SINGLE[joint])
    return None

YELLOW_BAND = 0.90  # 90%

def classify(assessment, technique):
    required = []
    for col, v in technique.items():
        if not col.endswith('_min'):
            continue
        if v is None or v == 0:
            continue
        joint = col[:-4]  # strip _min
        if joint not in EVALUABLE:
            continue  # joint not assessable -> skip (can't penalize on missing data model)
        required.append((joint, float(v)))

    if not required:
        # No threshold on any assessed joint -> nothing we measure can block it,
        # athlete is ready by rule. (Jim 2026-07-06) GREEN, not skipped.
        return {'flag': 'green', 'limiting_joints': [], 'worst_ratio': None}

    limiting = []
    worst_ratio = None
    missing = []
    for joint, thresh in required:
        av = athlete_value(assessment, joint)
        if av is None:
            # MISSING-JOINT RULE (Jim, 2026-07-06): required joint with no measurement
            # => YELLOW (caution, data incomplete). Never silently GREEN.
            missing.append({'joint': joint, 'value': None, 'min': thresh, 'reason': 'not_measured'})
            continue
        ratio = av / thresh if thresh else 1.0
        if worst_ratio is None or ratio < worst_ratio:
            worst_ratio = ratio
        if ratio < 1.0:
            limiting.append({'joint': joint, 'value': av, 'min': thresh, 'ratio': round(ratio, 3)})

    # RED dominates everything.
    if worst_ratio is not None and worst_ratio < YELLOW_BAND:
        lj = [x for x in limiting if x['ratio'] < YELLOW_BAND]
        return {'flag': 'red', 'limiting_joints': lj, 'worst_ratio': round(worst_ratio, 3)}

    # Any measured shortfall in 90-100% band => YELLOW.
    band_lj = [x for x in limiting if YELLOW_BAND <= x['ratio'] < 1.0]
    # Any missing required joint => YELLOW (caution).
    if band_lj or missing:
        return {'flag': 'yellow',
                'limiting_joints': band_lj + missing,
                'worst_ratio': round(worst_ratio, 3) if worst_ratio is not None else None}

    # All required joints measured and >= their min => GREEN.
    return {'flag': 'green', 'limiting_joints': [], 'worst_ratio': round(worst_ratio, 3) if worst_ratio is not None else None}


def main():
    from collections import Counter
    print("=" * 78)
    print("PR-0 v33 DRY-RUN — R/Y/G worst-joint rule (NO writes)")
    print("=" * 78)

    grand = Counter()
    per_assessment = []
    for a in A:
        sport = a['sport']
        # general assessments (Base) evaluate against... nothing sport-specific.
        # We still run them against BOTH bjj+bb to show the engine handles them.
        techs = [t for t in T if t['sport'] == sport] if sport in ('bjj', 'bodybuilding') else T
        cnt = Counter()
        samples = {'red': [], 'yellow': [], 'green': []}
        for t in techs:
            res = classify(a, t)
            if res is None:
                cnt['skipped'] += 1
                continue
            cnt[res['flag']] += 1
            grand[res['flag']] += 1
            if len(samples[res['flag']]) < 2:
                samples[res['flag']].append((t['code'], res.get('limiting_joints')))
        per_assessment.append((a['email'], sport, len(techs), cnt, samples))

    print("\n%-38s %-12s %5s %5s %5s %5s %6s" % ("email", "sport", "tech", "🔴", "🟡", "🟢", "skip"))
    print("-" * 90)
    for email, sport, n, cnt, samples in per_assessment:
        print("%-38s %-12s %5d %5d %5d %5d %6d" % (
            email[:38], sport, n, cnt['red'], cnt['yellow'], cnt['green'], cnt['skipped']))

    print("\nGRAND TOTAL flags:", dict(grand))

    # Focus: 30s test profile
    print("\n" + "=" * 78)
    print("30s TEST PROFILE — send.jim.scott+basetest1 (all joints = 30, sport=general)")
    print("=" * 78)
    test = next(a for a in A if 'basetest1' in a['email'])
    for sp in ('bjj', 'bodybuilding'):
        techs = [t for t in T if t['sport'] == sp]
        cnt = Counter()
        red_examples = []
        for t in techs:
            res = classify(test, t)
            if res is None:
                cnt['skipped'] += 1; continue
            cnt[res['flag']] += 1
            if res['flag'] == 'red' and len(red_examples) < 3:
                red_examples.append((t['code'], [(x['joint'], x['value'], x['min']) for x in res['limiting_joints']]))
        print(f"\n  vs {sp}: {dict(cnt)}")
        for code, lj in red_examples:
            print(f"    RED {code}: {lj}")

    # sanity: show a green + yellow example somewhere
    print("\n" + "=" * 78)
    print("SANITY — full technique breakdown for send.jim.scott (bjj real athlete)")
    print("=" * 78)
    jim = next(a for a in A if a['email'] == 'send.jim.scott@gmail.com')
    techs = [t for t in T if t['sport'] == 'bjj']
    for flag in ('red', 'yellow', 'green'):
        ex = None
        for t in techs:
            res = classify(jim, t)
            if res and res['flag'] == flag:
                ex = (t['code'], res); break
        if ex:
            print(f"  {flag.upper()} example {ex[0]}: worst_ratio={ex[1].get('worst_ratio')}, limiting={ex[1]['limiting_joints']}")


if __name__ == '__main__':
    main()
