import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Lock, Mail, Loader2, Eye, EyeOff } from 'lucide-react'

export function Login() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [mode, setMode]           = useState<'password' | 'magic'>('password')

  useEffect(() => {
    if (session) navigate('/dashboard/my-body', { replace: true })
  }, [session, navigate])

  // ---- Email + password sign-in ----
  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true); setError('')

    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Incorrect email or password.'
        : err.message)
    }
    // success → useEffect above handles redirect via session change
  }

  // ---- Magic link fallback ----
  const handleMagic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true); setError('')

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })
    setLoading(false)
    if (err) {
      setError(err.message.includes('rate') || err.message.includes('many')
        ? 'Too many attempts — wait a minute and try again, or use a password instead.'
        : err.message)
    } else {
      setMagicSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display font-bold text-teal text-3xl">ROMRx</h1>
          <p className="text-charcoal-light text-sm mt-1">BJJ Athlete Dashboard</p>
        </div>

        <div className="bg-white rounded-2xl border border-teal-light p-6 shadow-sm">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-surface rounded-xl p-1 mb-5">
            <button
              onClick={() => { setMode('password'); setError('') }}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'password' ? 'bg-white text-teal shadow-sm' : 'text-charcoal-light hover:text-charcoal'
              }`}
            >
              Password
            </button>
            <button
              onClick={() => { setMode('magic'); setError(''); setMagicSent(false) }}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'magic' ? 'bg-white text-teal shadow-sm' : 'text-charcoal-light hover:text-charcoal'
              }`}
            >
              Magic link
            </button>
          </div>

          {mode === 'password' ? (
            <form onSubmit={handlePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-1.5">
                  Email
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus
                  className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal focus:bg-white transition-colors pr-10"
                  />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-light hover:text-teal">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && <p className="text-xs text-red-tier bg-red-tier-bg rounded-lg px-3 py-2">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
                Sign in
              </button>

              <p className="text-center text-xs text-charcoal-light">
                No password?{' '}
                <button type="button" onClick={() => { setMode('magic'); setError('') }}
                  className="text-teal underline">
                  Send a magic link instead
                </button>
              </p>
            </form>
          ) : magicSent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-teal-light rounded-full flex items-center justify-center mx-auto mb-3">
                <Mail size={22} className="text-teal" />
              </div>
              <h2 className="font-display font-bold text-base text-charcoal mb-1">Check your email</h2>
              <p className="text-sm text-charcoal-light">Link sent to <strong>{email}</strong></p>
              <button onClick={() => { setMagicSent(false); setMode('password') }}
                className="mt-4 text-teal text-xs underline">
                Use password instead
              </button>
            </div>
          ) : (
            <form onSubmit={handleMagic} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-1.5">
                  Email
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus
                  className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal focus:bg-white transition-colors"
                />
              </div>

              {error && <p className="text-xs text-red-tier bg-red-tier-bg rounded-lg px-3 py-2">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                Send magic link
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-charcoal-light mt-6">Position Readiness Protocol™ by ROMRx</p>
      </div>
    </div>
  )
}
