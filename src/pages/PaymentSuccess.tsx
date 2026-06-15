import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, Loader2, Mail } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

// Lands here from Stripe's success_url. The Stripe webhook flips
// subscription_status from 'pending' -> 'active', but that's async — if we
// drop the user straight onto /dashboard/* ProtectedRoute will bounce them
// back to /onboarding/results because the profile still reads 'pending'.
//
// So: poll the DB directly (bypassing the cached useProfile) until we see
// 'active' or 'trialing', then forward to the dashboard. Cap the wait so the
// user is never stuck; if the webhook is delayed past the cap, fall through
// to the dashboard anyway — ProtectedRoute will re-evaluate on next render
// once the row updates.

const POLL_INTERVAL_MS = 1500
const MAX_WAIT_MS      = 30_000
const PAID = new Set(['active', 'trialing'])

export function PaymentSuccess() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'waiting' | 'ready' | 'slow'>('waiting')
  const startedAt = useRef<number>(Date.now())

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      navigate('/login', { replace: true })
      return
    }

    let cancelled = false

    const check = async () => {
      const { data } = await supabase
        .from('users')
        .select('subscription_status')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (data?.subscription_status && PAID.has(data.subscription_status)) {
        setStatus('ready')
        // Tiny delay so the success state is visible
        setTimeout(() => navigate('/dashboard/my-body', { replace: true }), 600)
        return
      }

      if (Date.now() - startedAt.current >= MAX_WAIT_MS) {
        setStatus('slow')
        return
      }

      setTimeout(check, POLL_INTERVAL_MS)
    }

    check()
    return () => { cancelled = true }
  }, [user, authLoading, navigate])

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-charcoal-dark rounded-2xl border border-teal/30 p-8 text-center space-y-5">
        {status === 'waiting' && (
          <>
            <Loader2 size={40} className="text-teal mx-auto animate-spin" />
            <h1 className="font-display font-bold text-warm-white text-xl">Activating your membership…</h1>
            <p className="text-sm text-warm-white/60 leading-relaxed">
              Payment received. We're unlocking your dashboard — this usually takes a few seconds.
            </p>
          </>
        )}

        {status === 'ready' && (
          <>
            <CheckCircle size={44} className="text-teal mx-auto" />
            <h1 className="font-display font-bold text-warm-white text-xl">You're in.</h1>
            <p className="text-sm text-warm-white/60">Loading your dashboard…</p>
          </>
        )}

        {status === 'slow' && (
          <>
            <Mail size={40} className="text-gold mx-auto" />
            <h1 className="font-display font-bold text-warm-white text-xl">Payment received</h1>
            <p className="text-sm text-warm-white/70 leading-relaxed">
              Stripe is taking a moment to confirm. You'll get a welcome email the second your membership goes live — usually within a minute.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  startedAt.current = Date.now()
                  setStatus('waiting')
                }}
                className="w-full py-3 bg-teal text-white rounded-xl font-semibold text-sm hover:bg-teal/90 transition-colors"
              >
                Check again
              </button>
              <button
                onClick={() => navigate('/dashboard/my-body', { replace: true })}
                className="w-full py-3 bg-transparent border border-warm-white/20 text-warm-white/70 rounded-xl font-semibold text-sm hover:bg-warm-white/5 transition-colors"
              >
                Continue to dashboard
              </button>
            </div>
            <p className="text-xs text-warm-white/40 pt-2">
              Still having trouble? Email <a href="mailto:jim@romrxbjj.com" className="text-teal underline">jim@romrxbjj.com</a> — we'll fix it immediately.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
