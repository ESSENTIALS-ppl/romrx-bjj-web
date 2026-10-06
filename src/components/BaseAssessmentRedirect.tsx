import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from './Spinner'
import { baseExplainerUrl } from '../lib/utils'
import { BASE_ASSESSMENT_HREF } from '../lib/baseAssessment'

// /onboarding/assessment. The standalone BJJ assessment is retired (Jim, Oct 6 2026):
// the Base assessment on romrx.io is the only assessment. Old bookmarks, emails
// (s1-2 / s1-3 / s1-4 link here) and any in-app link still land on this path:
//   - signed in here: romrx.io sign-in -> Base assessment -> back to My Body
//   - signed out: the Base explainer (romrx.io/bjj), campaign params kept. That is
//     the Base-first new-member path (sign up, assess, then add BJJ).
// Rollback: put <Route path="/onboarding/assessment" element={<Assessment />} />
// back inside <OnboardingRoute> in App.tsx (pages/Assessment.tsx is kept, unrouted).
export function BaseAssessmentRedirect() {
  const { session, loading } = useAuth()

  // Let useAuth finish consuming SSO / magic-link tokens before deciding.
  const hasAuthToken = window.location.hash.includes('access_token') ||
                       window.location.search.includes('code=')

  useEffect(() => {
    if (loading || hasAuthToken) return
    window.location.replace(session ? BASE_ASSESSMENT_HREF : baseExplainerUrl(window.location.search))
  }, [loading, session, hasAuthToken])

  return <Spinner />
}
