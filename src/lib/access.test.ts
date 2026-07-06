import { describe, it, expect } from 'vitest'
import type { Assessment, Profile } from '../hooks/useProfile'
import {
  evaluateAccess,
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
})
