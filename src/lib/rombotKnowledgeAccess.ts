// Canonical specification of ROMBot's one-way sport-awareness rule.
//
// This is the executable source of truth for what a ROMBot of a given tier is
// allowed to surface from public.rombot_knowledge. The live enforcement is the
// Postgres RLS policy `rombot_knowledge_read_sport_entitled`; the pgTAP test in
// supabase/tests/rombot_knowledge_rls_test.sql proves the DB matches this rule,
// and rombotKnowledgeAccess.test.ts locks the rule so it cannot be weakened
// without a failing test.
//
// The rule (authoritative):
//   A knowledge row for `sport` is visible to a user with `platforms[]` iff
//   sport === 'general'  OR  platforms includes sport.
// i.e. everyone gets general knowledge; sport-specific knowledge is gated on the
// user's entitlement, and is NEVER visible across sports.

export const GENERAL_SPORT = 'general'

export const ROMBOT_KNOWLEDGE_TABLE = 'rombot_knowledge'
export const ROMBOT_KNOWLEDGE_POLICY_NAME = 'rombot_knowledge_read_sport_entitled'

// Substrings the live RLS policy `qual` MUST contain to preserve the one-way
// sport-aware shape. The pgTAP test asserts these against pg_policies; this
// module keeps them in lockstep with the JS rule below.
export const EXPECTED_POLICY_QUAL_MARKERS = [
  GENERAL_SPORT, // the general-for-everyone branch
  'platforms', // entitlement source
  'auth.uid()', // scoped to the calling user
  'ANY', // sport = ANY(platforms)
] as const

/** True iff a knowledge row tagged `sport` is visible to a user holding `platforms`. */
export function canReadSport(sport: string, platforms: readonly string[]): boolean {
  return sport === GENERAL_SPORT || platforms.includes(sport)
}

/** The subset of `allSports` a user with `platforms` may read, sorted for stable comparison. */
export function visibleSports(
  allSports: readonly string[],
  platforms: readonly string[],
): string[] {
  return allSports.filter((s) => canReadSport(s, platforms)).sort()
}
