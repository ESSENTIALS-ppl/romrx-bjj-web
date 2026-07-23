import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Spinner } from '../components/Spinner'
import { baseExplainerUrl } from '../lib/utils'

// The standalone athlete signup form has been retired. New-athlete onboarding
// now always begins on the Base explainer page at romrx.io/bjj, so old
// bookmarks and campaign links to /signup cannot bypass Base. We replace (not
// push) the history entry so the retired route never lands in the back stack.
// The target is an external origin, so this cannot loop back into the app.
export function Signup() {
  const { search } = useLocation()

  useEffect(() => {
    window.location.replace(baseExplainerUrl(search))
  }, [search])

  return <Spinner />
}
