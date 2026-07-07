import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { SportProvider } from '../sports/SportProvider'

// Statuses that grant access to /dashboard/*. Trial access is allowed because
// Stripe issues 'trialing' only after a valid payment method is on file — but
// see the Signup paths: we never set 'trialing' client-side. The only way to
// land here in 'trialing' is via a Stripe webhook on a real Stripe trial.
const PAID_STATUSES = new Set(['active', 'trialing'])

export function ProtectedRoute() {
  const { session, user, loading } = useAuth()
  const { profile, loading: profileLoading } = useProfile(user?.id)

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

  // Paywall gate. Anyone whose subscription_status is not in PAID_STATUSES
  // (e.g. 'pending', 'past_due', 'canceled', null) gets routed to the
  // assessment/checkout flow instead of the dashboard. Coaches use the same
  // gate — CoachSignup also creates rows as 'pending'.
  if (profile && !PAID_STATUSES.has(profile.subscription_status)) {
    return <Navigate to="/onboarding/results" replace />
  }

  // SportProvider is hardcoded to BJJ (SITE_SPORT). We intentionally do NOT
  // pass profile.active_sport here: branding/nav must never depend on the
  // shared active_sport field, and this app never writes it either.
  return (
    <SportProvider>
      <Outlet />
    </SportProvider>
  )
}
