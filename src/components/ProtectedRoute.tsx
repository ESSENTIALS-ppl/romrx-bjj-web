import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { SportProvider } from '../sports/SportProvider'
import { evaluateAccess } from '../lib/access'

interface ProtectedRouteProps {
  /**
   * Sport slug this route group requires (e.g. 'bjj', 'bodybuilding'). Pass the
   * sentinel 'active' to require the entitlement for the user's currently active
   * sport. Omit for Base-only routes, which require just active Base + a completed
   * assessment.
   */
  requireSport?: string
  /**
   * Coach/School CRM route group: require active subscription + coach entitlement,
   * but NOT a completed assessment. Coaches/gyms manage athletes and do not assess
   * their own body.
   */
  requireCoach?: boolean
}

export function ProtectedRoute({ requireSport, requireCoach }: ProtectedRouteProps = {}) {
  const { session, user, loading } = useAuth()
  const { profile, assessment, loading: profileLoading } = useProfile(user?.id)

  // Loading gate: never evaluate the access gate (and never render gated content
  // or redirect) until auth AND profile have resolved. Prevents content flash and
  // premature redirects.
  if (loading || (session && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Don't redirect if URL contains Supabase auth tokens — let AuthCallback handle it
  const hasAuthToken = window.location.hash.includes('access_token') ||
                       window.location.search.includes('code=')
  if (hasAuthToken) return null

  if (!session) return <Navigate to="/login" replace />

  // Three-part gate: base active + completed assessment (+ sport entitlement for
  // +sport routes). base_status and sport_entitlement both derive from
  // Stripe-synced state on the profile — never client-only flags.
  const decision = evaluateAccess({ profile, assessment, requireSport, requireCoach })
  if (decision.status === 'redirect') {
    return <Navigate to={decision.to} replace />
  }

  return (
    <SportProvider
      userId={user?.id}
      activeSportSlug={profile?.active_sport}
      sportsEnabled={profile?.sports_enabled}
    >
      <Outlet />
    </SportProvider>
  )
}
