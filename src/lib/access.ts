/**
 * access.ts — pure, testable access-gate logic for protected routes.
 *
 * The three-part gate (see PR-A):
 *   1. base_status = active   — user owns Base and it is active/trialing. This is
 *      Stripe's truth, synced by the stripe-webhook function into the users table
 *      and surfaced here as `profile.subscription_status`. Never a client flag.
 *   2. completed assessment    — an assessment row exists with ROM numbers present.
 *      Per Jim's rule: numbers present = complete, even if some fields are skipped.
 *      No uniformity / all-fields-filled / placeholder check.
 *   3. sport_entitlement       — for +sport routes, the user holds that sport pack.
 *      Traces back to Stripe via `profile.sports_enabled` (mirrors `platforms`,
 *      which the stripe-webhook keeps in sync).
 *
 * Base-only routes require #1 + #2; +sport routes require #1 + #2 + #3.
 */
import type { Assessment, Profile } from '../hooks/useProfile'

/**
 * Subscription statuses that count as an active Base entitlement. `trialing` is
 * included because Stripe only issues it after a valid payment method is on file
 * and a real Stripe trial has begun (never set client-side).
 */
export const PAID_STATUSES = new Set(['active', 'trialing'])

/**
 * The raw ROM measurement columns a user enters during an assessment. Derived
 * fields (rom_total, rom_percentile) are intentionally excluded — completeness is
 * judged only on entered measurements.
 */
export const ROM_MEASUREMENT_FIELDS: Array<keyof Assessment> = [
  'hip_er_l', 'hip_er_r', 'hip_ir_l', 'hip_ir_r',
  'hip_abd_l', 'hip_abd_r', 'hip_flex_l', 'hip_flex_r',
  'shoulder_er_l', 'shoulder_er_r', 'shoulder_flex_l', 'shoulder_flex_r',
  'ankle_df_l', 'ankle_df_r',
  'lumbar_flex', 'lumbar_ext',
  'cervical_rot_l', 'cervical_rot_r', 'cervical_lat_l', 'cervical_lat_r',
  'cervical_flex', 'cervical_ext',
  'thoracic_rot', 'thoracic_rot_l', 'thoracic_rot_r',
]

/** Where to send users who fail each part of the gate. */
export const REDIRECTS = {
  /** Not signed in. */
  login: '/login',
  /** Base not active — paywall / upgrade / results+checkout flow. */
  paywall: '/onboarding/results',
  /** Base active but no completed assessment yet. */
  assessment: '/onboarding/assessment',
} as const

/** #1 — Base owned and active, from Stripe-synced subscription_status. */
export function isBaseActive(profile: Profile | null | undefined): boolean {
  return !!profile && PAID_STATUSES.has(profile.subscription_status)
}

/**
 * #2 — A completed assessment exists: an assessment row with at least one ROM
 * measurement number present. Skipped fields are fine.
 */
export function hasCompletedAssessment(
  assessment: Assessment | null | undefined,
): boolean {
  if (!assessment) return false
  return ROM_MEASUREMENT_FIELDS.some((field) => {
    const value = assessment[field]
    return typeof value === 'number' && Number.isFinite(value)
  })
}

/**
 * #3 — The user holds the entitlement for `sportSlug`. sports_enabled mirrors the
 * Stripe-backed `platforms` list. A falsy slug means "no sport requirement".
 */
export function hasSportEntitlement(
  profile: Profile | null | undefined,
  sportSlug: string | null | undefined,
): boolean {
  if (!sportSlug) return true
  return !!profile?.sports_enabled?.includes(sportSlug)
}

export type AccessDecision =
  | { status: 'allow' }
  | { status: 'redirect'; to: string }

export interface AccessInput {
  profile: Profile | null | undefined
  assessment: Assessment | null | undefined
  /**
   * Sport slug this route requires (e.g. 'bjj', 'bodybuilding'). Pass the sentinel
   * 'active' to require entitlement for the user's currently active sport. Omit for
   * Base-only routes.
   */
  requireSport?: string
}

/**
 * Compose the three-part gate into a single decision. Callers must only invoke
 * this once auth + profile have finished loading; loading is handled upstream so
 * gated content never flashes and redirects never fire prematurely.
 */
export function evaluateAccess({
  profile,
  assessment,
  requireSport,
}: AccessInput): AccessDecision {
  if (!isBaseActive(profile)) {
    return { status: 'redirect', to: REDIRECTS.paywall }
  }
  if (!hasCompletedAssessment(assessment)) {
    return { status: 'redirect', to: REDIRECTS.assessment }
  }

  const sportSlug =
    requireSport === 'active' ? profile?.active_sport : requireSport
  if (sportSlug && !hasSportEntitlement(profile, sportSlug)) {
    return { status: 'redirect', to: REDIRECTS.paywall }
  }

  return { status: 'allow' }
}
