import { describe, it, expect } from 'vitest'
import type { Assessment, Profile } from '../hooks/useProfile'
import {
  evaluateAccess,
  hasCoachEntitlement,
  hasCompletedAssessment,
  hasSportEntitlement,
  isBaseActive,
  REDIRECTS,
} from './access'

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    email: 'a@b.com',
    full_name: 'Test User',
    belt: 'white',
    portal_role: 'athlete',
    subscription_status: 'active',
    subscription_tier: 'base',
    platforms: ['bjj'],
    active_sport: 'bjj',
    sports_enabled: ['bjj'],
    ...overrides,
  }
}

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  const base = {
    id: 'a-1',
    user_id: 'user-1',
    assessed_at: '2026-01-01T00:00:00Z',
    red_flag_triggered: false,
  } as Assessment
  return { ...base, ...overrides }
}

describe('isBaseActive', () => {
  it('is true for active', () => {
    expect(isBaseActive(makeProfile({ subscription_status: 'active' }))).toBe(true)
  })
  it('is true for trialing (real Stripe trial)', () => {
    expect(isBaseActive(makeProfile({ subscription_status: 'trialing' }))).toBe(true)
  })
  it('is false for pending/past_due/canceled/null-ish', () => {
    for (const status of ['pending', 'past_due', 'canceled', '']) {
      expect(isBaseActive(makeProfile({ subscription_status: status }))).toBe(false)
    }
  })
  it('is false when profile is missing', () => {
    expect(isBaseActive(null)).toBe(false)
    expect(isBaseActive(undefined)).toBe(false)
  })
})

describe('hasCompletedAssessment', () => {
  it('is false when there is no assessment', () => {
    expect(hasCompletedAssessment(null)).toBe(false)
    expect(hasCompletedAssessment(undefined)).toBe(false)
  })
  it('is true when at least one ROM number is present (skipped fields allowed)', () => {
    expect(hasCompletedAssessment(makeAssessment({ hip_er_l: 42 }))).toBe(true)
  })
  it('does not require all fields — a single number counts', () => {
    expect(hasCompletedAssessment(makeAssessment({ cervical_flex: 30 }))).toBe(true)
  })
  it('is false when the row exists but every ROM measurement is null', () => {
    expect(hasCompletedAssessment(makeAssessment({ hip_er_l: null, hip_er_r: null }))).toBe(false)
  })
  it('accepts zero as a real number', () => {
    expect(hasCompletedAssessment(makeAssessment({ lumbar_flex: 0 }))).toBe(true)
  })
})

describe('hasSportEntitlement', () => {
  it('is true when no sport is required', () => {
    expect(hasSportEntitlement(makeProfile({ sports_enabled: [] }), undefined)).toBe(true)
  })
  it('is true when the sport is in sports_enabled', () => {
    expect(hasSportEntitlement(makeProfile({ sports_enabled: ['bjj', 'bodybuilding'] }), 'bodybuilding')).toBe(true)
  })
  it('is false when the sport is not entitled', () => {
    expect(hasSportEntitlement(makeProfile({ sports_enabled: ['bjj'] }), 'bodybuilding')).toBe(false)
  })
})

describe('hasCoachEntitlement', () => {
  it('is true for a coach portal_role', () => {
    expect(hasCoachEntitlement(makeProfile({ portal_role: 'coach' }))).toBe(true)
  })
  it('is false for an athlete', () => {
    expect(hasCoachEntitlement(makeProfile({ portal_role: 'athlete' }))).toBe(false)
  })
  it('is false when profile is missing', () => {
    expect(hasCoachEntitlement(null)).toBe(false)
    expect(hasCoachEntitlement(undefined)).toBe(false)
  })
})

describe('evaluateAccess — three-part gate', () => {
  it('allows when base active + assessment + sport entitlement', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ sports_enabled: ['bjj'], active_sport: 'bjj' }),
        assessment: makeAssessment({ hip_er_l: 45 }),
        requireSport: 'active',
      }),
    ).toEqual({ status: 'allow' })
  })

  it('allows a Base-only route with just active + assessment', () => {
    expect(
      evaluateAccess({
        profile: makeProfile(),
        assessment: makeAssessment({ hip_er_l: 45 }),
      }),
    ).toEqual({ status: 'allow' })
  })

  it('redirects to paywall when base is not active', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ subscription_status: 'past_due' }),
        assessment: makeAssessment({ hip_er_l: 45 }),
      }),
    ).toEqual({ status: 'redirect', to: REDIRECTS.paywall })
  })

  it('redirects to assessment when active but no completed assessment', () => {
    expect(
      evaluateAccess({
        profile: makeProfile(),
        assessment: null,
      }),
    ).toEqual({ status: 'redirect', to: REDIRECTS.assessment })
  })

  it('redirects to paywall when the required sport entitlement is missing', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ sports_enabled: ['bjj'], active_sport: 'bodybuilding' }),
        assessment: makeAssessment({ hip_er_l: 45 }),
        requireSport: 'active',
      }),
    ).toEqual({ status: 'redirect', to: REDIRECTS.paywall })
  })

  it('base failure takes precedence over assessment failure', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ subscription_status: 'canceled' }),
        assessment: null,
      }),
    ).toEqual({ status: 'redirect', to: REDIRECTS.paywall })
  })

  it('resolves an explicit sport slug requirement', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ sports_enabled: ['bjj'] }),
        assessment: makeAssessment({ hip_er_l: 45 }),
        requireSport: 'bodybuilding',
      }),
    ).toEqual({ status: 'redirect', to: REDIRECTS.paywall })
  })

  // FIX 1 — the sport gate must fail CLOSED. A required sport with no resolvable
  // entitled slug must DENY, not fall through to allow.
  it('DENIES when a sport is required but active_sport is null', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ active_sport: null as unknown as string, sports_enabled: ['bjj'] }),
        assessment: makeAssessment({ hip_er_l: 45 }),
        requireSport: 'active',
      }),
    ).toEqual({ status: 'redirect', to: REDIRECTS.paywall })
  })

  it('DENIES when a sport is required but active_sport is empty string', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ active_sport: '', sports_enabled: ['bjj'] }),
        assessment: makeAssessment({ hip_er_l: 45 }),
        requireSport: 'active',
      }),
    ).toEqual({ status: 'redirect', to: REDIRECTS.paywall })
  })

  it('DENIES when active_sport is present but NOT in sports_enabled', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ active_sport: 'bodybuilding', sports_enabled: ['bjj'] }),
        assessment: makeAssessment({ hip_er_l: 45 }),
        requireSport: 'active',
      }),
    ).toEqual({ status: 'redirect', to: REDIRECTS.paywall })
  })

  it('ALLOWS when active_sport is present and entitled', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ active_sport: 'bjj', sports_enabled: ['bjj'] }),
        assessment: makeAssessment({ hip_er_l: 45 }),
        requireSport: 'active',
      }),
    ).toEqual({ status: 'allow' })
  })
})

describe('evaluateAccess — coach/school gate', () => {
  it('ALLOWS a coach with an active subscription and NO assessment', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ portal_role: 'coach', subscription_tier: 'coach' }),
        assessment: null,
        requireCoach: true,
      }),
    ).toEqual({ status: 'allow' })
  })

  it('DENIES when the user has no coach entitlement', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ portal_role: 'athlete' }),
        assessment: makeAssessment({ hip_er_l: 45 }),
        requireCoach: true,
      }),
    ).toEqual({ status: 'redirect', to: REDIRECTS.paywall })
  })

  it('DENIES a coach whose subscription is not active', () => {
    expect(
      evaluateAccess({
        profile: makeProfile({ portal_role: 'coach', subscription_status: 'pending' }),
        assessment: null,
        requireCoach: true,
      }),
    ).toEqual({ status: 'redirect', to: REDIRECTS.paywall })
  })

  it('does NOT require an assessment for coach routes (no assessment redirect)', () => {
    const decision = evaluateAccess({
      profile: makeProfile({ portal_role: 'coach' }),
      assessment: null,
      requireCoach: true,
    })
    expect(decision).not.toEqual({ status: 'redirect', to: REDIRECTS.assessment })
    expect(decision).toEqual({ status: 'allow' })
  })
})
