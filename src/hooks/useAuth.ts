import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Cross-domain SSO hand-off: when arriving from romrx.io, the session
    // tokens are passed in the URL fragment. Consume them BEFORE the auth
    // guard decides, so the user does not flash to /login. We await
    // setSession, strip the hash, then fall through to the normal getSession.
    const consumeHashSession = async () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        // Strip the tokens from the URL so they do not linger.
        history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }

    consumeHashSession()
      .catch(() => {})
      .then(() => supabase.auth.getSession())
      .then(({ data }) => {
        setSession(data.session)
        setUser(data.session?.user ?? null)
        setLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return { session, user, loading, signOut }
}
