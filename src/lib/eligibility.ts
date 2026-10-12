// BJJ My Game reads technique tiers. get_my_profile returns every BJJ
// technique_eligibility row for the user, across ALL of their assessments (it is not
// limited to the latest one). After a second assessment (now always a Base retest on
// romrx.io) each technique would show up twice, with the old and the new tier, and the
// GREEN / YELLOW / RED counts would double. Keep one row per technique: the most
// recently computed. Same order get_my_profile used (by tier).
//
// Pure module (no imports) so scripts/base-assessment-redirect.test.mjs can load it.

export interface EligibilityRowLike {
  technique_id: string
  tier: string
  computed_at?: string | null
}

export function latestPerTechnique<T extends EligibilityRowLike>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => {
    const ta = a.computed_at ? Date.parse(a.computed_at) : 0
    const tb = b.computed_at ? Date.parse(b.computed_at) : 0
    return tb - ta
  })
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of sorted) {
    if (seen.has(r.technique_id)) continue
    seen.add(r.technique_id)
    out.push(r)
  }
  return out.sort((a, b) => (a.tier < b.tier ? -1 : a.tier > b.tier ? 1 : 0))
}
