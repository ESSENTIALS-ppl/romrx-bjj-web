import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from './Spinner'
import { BASE_RETEST_URL, baseExplainerUrl } from '../lib/utils'

// The standalone sport assessment wizard is retired: Base is the only app that
// assesses ROM. Anything that still points at /onboarding/assessment (old
// bookmarks, emails, cached links) is sent to Base here.
//   - signed in on this site: Base My Body (Base login first, then Retest or first assessment)
//   - signed out: the Base explainer page (romrx.io/bjj), campaign query kept
export function BaseAssessmentRedirect() {
  const { session, loading } = useAuth()

  // Let useAuth finish consuming Supabase SSO / magic-link tokens first.
  const hasAuthToken = window.location.hash.includes('access_token') ||
                       window.location.search.includes('code=')

  useEffect(() => {
    if (loading || hasAuthToken) return
    window.location.replace(session ? BASE_RETEST_URL : baseExplainerUrl(window.location.search))
  }, [loading, session, hasAuthToken])

  return <Spinner />
}
