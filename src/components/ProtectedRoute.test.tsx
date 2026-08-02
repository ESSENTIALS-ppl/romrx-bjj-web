import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Assessment, Profile } from '../hooks/useProfile'

// Mock the data hooks so we can drive auth/profile/assessment/loading states.
const useAuthMock = vi.fn()
const useProfileMock = vi.fn()
vi.mock('../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }))
vi.mock('../hooks/useProfile', () => ({ useProfile: () => useProfileMock() }))

// SportProvider pulls from Supabase; stub it to a passthrough for routing tests.
vi.mock('../sports/SportProvider', () => ({
  SportProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { ProtectedRoute } from './ProtectedRoute'

const profile: Profile = {
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
}

const assessment = { id: 'a-1', user_id: 'user-1', hip_er_l: 45 } as unknown as Assessment

function renderGuard(requireSport?: string) {
  return render(
    <MemoryRouter initialEntries={['/dashboard/my-body']}>
      <Routes>
        <Route element={<ProtectedRoute requireSport={requireSport} />}>
          <Route path="/dashboard/my-body" element={<div>PROTECTED CONTENT</div>} />
        </Route>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route path="/onboarding/results" element={<div>PAYWALL PAGE</div>} />
        <Route path="/onboarding/assessment" element={<div>ASSESSMENT PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderCoachGuard() {
  window.history.replaceState({}, '', '/dashboard/coach')
  return render(
    <MemoryRouter initialEntries={['/dashboard/coach']}>
      <Routes>
        <Route element={<ProtectedRoute requireCoach />}>
          <Route path="/dashboard/coach" element={<div>COACH CONTENT</div>} />
        </Route>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route path="/onboarding/results" element={<div>PAYWALL PAGE</div>} />
        <Route path="/onboarding/assessment" element={<div>ASSESSMENT PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/dashboard/my-body')
})

describe('ProtectedRoute', () => {
  it('renders protected content when active + assessment + sport entitlement', () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'user-1' } }, user: { id: 'user-1' }, loading: false })
    useProfileMock.mockReturnValue({ profile, assessment, loading: false })

    renderGuard('active')

    expect(screen.getByText('PROTECTED CONTENT')).toBeInTheDocument()
  })

  it('redirects to login when there is no session', () => {
    useAuthMock.mockReturnValue({ session: null, user: null, loading: false })
    useProfileMock.mockReturnValue({ profile: null, assessment: null, loading: false })

    renderGuard()

    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument()
  })

  it('redirects to paywall when base is not active', () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'user-1' } }, user: { id: 'user-1' }, loading: false })
    useProfileMock.mockReturnValue({
      profile: { ...profile, subscription_status: 'past_due' },
      assessment,
      loading: false,
    })

    renderGuard()

    expect(screen.getByText('PAYWALL PAGE')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument()
  })

  it('redirects to assessment when active but no completed assessment', () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'user-1' } }, user: { id: 'user-1' }, loading: false })
    useProfileMock.mockReturnValue({ profile, assessment: null, loading: false })

    renderGuard()

    expect(screen.getByText('ASSESSMENT PAGE')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument()
  })

  it('redirects a +sport route to paywall when sport entitlement is missing', () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'user-1' } }, user: { id: 'user-1' }, loading: false })
    useProfileMock.mockReturnValue({
      profile: { ...profile, active_sport: 'bodybuilding', sports_enabled: ['bjj'] },
      assessment,
      loading: false,
    })

    renderGuard('active')

    expect(screen.getByText('PAYWALL PAGE')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument()
  })

  it('shows a loading spinner without redirecting or flashing content while profile loads', () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'user-1' } }, user: { id: 'user-1' }, loading: false })
    useProfileMock.mockReturnValue({ profile: null, assessment: null, loading: true })

    const { container } = renderGuard('active')

    expect(screen.queryByText('PROTECTED CONTENT')).not.toBeInTheDocument()
    expect(screen.queryByText('PAYWALL PAGE')).not.toBeInTheDocument()
    expect(screen.queryByText('ASSESSMENT PAGE')).not.toBeInTheDocument()
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders coach content for an active coach WITHOUT an assessment', () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'user-1' } }, user: { id: 'user-1' }, loading: false })
    useProfileMock.mockReturnValue({
      profile: { ...profile, portal_role: 'coach', subscription_tier: 'coach' },
      assessment: null,
      loading: false,
    })

    renderCoachGuard()

    expect(screen.getByText('COACH CONTENT')).toBeInTheDocument()
  })

  it('redirects a coach route to paywall when the user is not a coach', () => {
    useAuthMock.mockReturnValue({ session: { user: { id: 'user-1' } }, user: { id: 'user-1' }, loading: false })
    useProfileMock.mockReturnValue({
      profile: { ...profile, portal_role: 'athlete' },
      assessment,
      loading: false,
    })

    renderCoachGuard()

    expect(screen.getByText('PAYWALL PAGE')).toBeInTheDocument()
    expect(screen.queryByText('COACH CONTENT')).not.toBeInTheDocument()
  })

  it('shows a loading spinner while auth is still resolving', () => {
    useAuthMock.mockReturnValue({ session: null, user: null, loading: true })
    useProfileMock.mockReturnValue({ profile: null, assessment: null, loading: false })

    const { container } = renderGuard()

    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })
})
