import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  canReadSport,
  visibleSports,
  ROMBOT_KNOWLEDGE_POLICY_NAME,
  ROMBOT_KNOWLEDGE_TABLE,
  EXPECTED_POLICY_QUAL_MARKERS,
} from './rombotKnowledgeAccess'

// The three sports present in rombot_knowledge today. The rule is data-agnostic,
// but these are the concrete tiers we guard against cross-leakage.
const ALL_SPORTS = ['general', 'bjj', 'bodybuilding'] as const

// -----------------------------------------------------------------------------
// Layer 1 — the one-way sport-awareness truth table.
// A regression in the intended rule (e.g. letting Base see a sport, or one sport
// leaking into another) must break these.
// -----------------------------------------------------------------------------
describe('ROMBot one-way sport-awareness rule', () => {
  it('Base user (platforms={}) sees general only — ZERO sport-specific knowledge', () => {
    const platforms: string[] = []
    expect(visibleSports(ALL_SPORTS, platforms)).toEqual(['general'])
    expect(canReadSport('bjj', platforms)).toBe(false)
    expect(canReadSport('bodybuilding', platforms)).toBe(false)
  })

  it('BJJ user (platforms={bjj}) sees general + bjj, ZERO bodybuilding', () => {
    const platforms = ['bjj']
    expect(visibleSports(ALL_SPORTS, platforms)).toEqual(['bjj', 'general'])
    expect(canReadSport('bodybuilding', platforms)).toBe(false)
  })

  it('Bodybuilding user (platforms={bodybuilding}) sees general + bodybuilding, ZERO bjj', () => {
    const platforms = ['bodybuilding']
    expect(visibleSports(ALL_SPORTS, platforms)).toEqual(['bodybuilding', 'general'])
    expect(canReadSport('bjj', platforms)).toBe(false)
  })

  it('Multi-sport user (platforms={bjj,bodybuilding}) sees general + both', () => {
    const platforms = ['bjj', 'bodybuilding']
    expect(visibleSports(ALL_SPORTS, platforms)).toEqual(['bjj', 'bodybuilding', 'general'])
  })

  it('general knowledge is visible to every tier', () => {
    for (const platforms of [[], ['bjj'], ['bodybuilding'], ['bjj', 'bodybuilding']]) {
      expect(canReadSport('general', platforms)).toBe(true)
    }
  })

  it('an unentitled sport is never visible regardless of other entitlements', () => {
    expect(canReadSport('judo', ['bjj', 'bodybuilding'])).toBe(false)
  })
})

// -----------------------------------------------------------------------------
// Layer 2 — integrity of the DB-layer guard (pgTAP file).
// Prevents the authoritative RLS test from being silently gutted: if someone
// removes the policy-shape assertion, the RLS-enabled check, or a tier case,
// this trips in CI even though CI can't run Postgres.
// -----------------------------------------------------------------------------
describe('pgTAP RLS guard integrity (supabase/tests/rombot_knowledge_rls_test.sql)', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/tests/rombot_knowledge_rls_test.sql'),
    'utf8',
  )

  it('targets the rombot_knowledge table and its policy', () => {
    expect(sql).toContain(ROMBOT_KNOWLEDGE_TABLE)
    expect(sql).toContain(ROMBOT_KNOWLEDGE_POLICY_NAME)
  })

  it('asserts RLS is enabled on the table', () => {
    expect(sql).toMatch(/relrowsecurity/)
  })

  it('asserts the policy keeps its one-way sport-aware shape', () => {
    for (const marker of EXPECTED_POLICY_QUAL_MARKERS) {
      expect(sql).toContain(marker)
    }
  })

  it('exercises all four entitlement tiers', () => {
    expect(sql).toContain("ARRAY[]::text[]") // Base {}
    expect(sql).toContain("ARRAY['bjj']")
    expect(sql).toContain("ARRAY['bodybuilding']")
    expect(sql).toContain("ARRAY['bjj','bodybuilding']")
  })

  it('is non-destructive: fixtures are rolled back', () => {
    expect(sql).toMatch(/ROLLBACK\s*;?\s*$/)
  })
})
