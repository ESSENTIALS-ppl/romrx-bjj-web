import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Loader2 } from 'lucide-react'
import { BASE_EXPLAINER_URL } from '../lib/utils'

/**
 * Coach signup is parked until Spring 2027.
 * No Stripe checkout, no account creation during beta.
 */
export function CoachSignup() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleNotify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    setLoading(true)
    try {
      // Prefer Netlify Forms capture when this route is served behind the marketing site.
      // Fallback: mailto for environments without form handling.
      const body = new URLSearchParams({
        'form-name': 'coach-waitlist',
        email: trimmed,
        source: 'signup-coach-parked',
      })
      await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }).catch(() => {
        window.location.href = `mailto:jim@romrx.io?subject=${encodeURIComponent('Coach Spring 2027 notify')}&body=${encodeURIComponent(trimmed)}`
      })
      setDone(true)
    } catch {
      setError('Something went wrong. Email jim@romrx.io instead.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-teal-light rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users size={22} className="text-teal" />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-gold mb-2">Coming Spring 2027</p>
          <h1 className="font-display font-bold text-teal text-2xl">Coach tools coming Spring 2027</h1>
          <p className="text-sm text-charcoal-light mt-2">
            Not open during beta. Base and athlete sport packs come first. Leave your email and we will notify you at Spring 2027.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-teal-light p-6 space-y-4 shadow-sm">
          {done ? (
            <p className="text-sm text-teal font-semibold text-center">
              You are on the list. We will notify you when coach tools open Spring 2027.
            </p>
          ) : (
            <form onSubmit={handleNotify} className="space-y-4" name="coach-waitlist" data-netlify="true">
              <input type="hidden" name="form-name" value="coach-waitlist" />
              <div className="space-y-1">
                <label className="text-sm font-semibold text-charcoal">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal transition-colors"
                />
              </div>
              {error && (
                <p className="text-xs text-red-tier bg-red-tier-bg rounded-xl px-3 py-2">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3 disabled:opacity-50"
              >
                {loading
                  ? <><Loader2 size={16} className="animate-spin" /> Saving...</>
                  : 'Notify me for Spring 2027'}
              </button>
            </form>
          )}
          <p className="text-center text-xs text-charcoal-light">
            Or email{' '}
            <a href="mailto:jim@romrx.io?subject=Coach%20Spring%202027%20notify" className="text-teal font-semibold hover:underline">
              jim@romrx.io
            </a>
          </p>
          <p className="text-center text-xs text-charcoal-light">
            Pricing and signup open Spring 2027. Not available in beta.
          </p>
        </div>

        <p className="text-center text-sm text-charcoal-light">
          Are you an athlete?{' '}
          <a href={BASE_EXPLAINER_URL} className="text-teal font-semibold hover:underline">
            Athlete signup here
          </a>
        </p>
        <p className="text-center text-sm text-charcoal-light">
          Already have an account?{' '}
          <Link to="/login" className="text-teal font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
