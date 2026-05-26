import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Mail, Loader2 } from 'lucide-react'

export function Login() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (session) navigate('/my-body', { replace: true })
  }, [session, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/my-body`,
        shouldCreateUser: false, // Only allow existing users
      },
    })

    setLoading(false)
    if (err) {
      setError('No account found for that email. Contact your coach or ROMRx support.')
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display font-bold text-teal text-3xl">ROMRx</h1>
          <p className="text-charcoal-light text-sm mt-1">BJJ Athlete Dashboard</p>
        </div>

        <div className="card">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-teal-light rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail size={24} className="text-teal" />
              </div>
              <h2 className="font-display font-bold text-lg text-charcoal mb-2">Check your email</h2>
              <p className="text-sm text-charcoal-light">
                We sent a sign-in link to <strong>{email}</strong>. Click it to access your dashboard.
              </p>
              <p className="text-xs text-charcoal-light mt-3">Link expires in 1 hour.</p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="mt-4 text-teal text-sm underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="font-display font-bold text-xl text-charcoal mb-1">Sign in</h2>
                <p className="text-sm text-charcoal-light">We'll send a magic link to your email.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal focus:bg-white transition-colors"
                />
              </div>

              {error && (
                <p className="text-xs text-red-tier bg-red-tier-bg rounded-lg px-3 py-2">{error}</p>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                Send sign-in link
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-charcoal-light mt-6">
          Position Readiness Protocol™ by ROMRx
        </p>
      </div>
    </div>
  )
}
