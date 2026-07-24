import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from './Spinner'
import { baseExplainerUrl } from '../lib/utils'

// Guards the onboarding assessment funnel (/onboarding/assessment,
// /onboarding/results). These are the authenticated, post-Base in-app steps:
// an existing user takes or retakes the ROM assessment and sees results /
// checkout. A visitor with no session is a new athlete who reached the
// assessment outside Base (a stale deep link, old campaign, or bookmark), so
// we send them to the canonical Base explainer instead of the retired
// standalone funnel, where the wizard would only dead-end at submit.
export function OnboardingRoute() {
  const { session, loading } = useAuth()

  // While Supabase SSO / magic-link tokens are still in the URL, useAuth is
  // consuming them to establish the session. Defer any redirect until that
  // settles so we never bounce a valid hand-off out to Base.
  const hasAuthToken = window.location.hash.includes('access_token') ||
                       window.location.search.includes('code=')

  useEffect(() => {
    if (!loading && !session && !hasAuthToken) {
      window.location.replace(baseExplainerUrl(window.location.search))
    }
  }, [loading, session, hasAuthToken])

  if (loading || hasAuthToken) return <Spinner />
  if (!session) return <Spinner />
  return <Outlet />
}
