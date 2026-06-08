import { useState } from 'react'
import { Loader2, Send, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DEFAULT_SPORT_KEY } from '../sports/registry'
import { cn } from '../lib/utils'

type Category = 'bug' | 'feature' | 'general'

const FEEDBACK_CATEGORIES: { value: Category; label: string }[] = [
  { value: 'bug', label: "Something's broken" },
  { value: 'feature', label: 'Feature idea' },
  { value: 'general', label: 'General feedback' },
]

const MAX_MESSAGE = 1000
const MIN_MESSAGE = 5

export function FeedbackWidget({ onSuccess }: { onSuccess?: () => void }) {
  const [category, setCategory] = useState<Category>('general')
  const [message, setMessage] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const tooShort = message.trim().length < MIN_MESSAGE
  const nearLimit = message.length >= MAX_MESSAGE - 50

  const handleSubmit = async () => {
    if (submitting || tooShort) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('submit-feedback', {
        body: {
          category,
          message: message.trim(),
          sport: DEFAULT_SPORT_KEY,
          page_url: window.location.pathname,
          honeypot,
        },
      })
      if (error || data?.error) {
        throw new Error(error?.message ?? data?.error ?? 'Submission failed.')
      }
      setMsg({ type: 'ok', text: 'Thanks! We got it. 💪' })
      setMessage('')
      setCategory('general')
      onSuccess?.()
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Could not send feedback. Try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Category — segmented toggle group */}
      <div
        role="radiogroup"
        aria-label="Feedback category"
        className="flex gap-2 flex-wrap"
      >
        {FEEDBACK_CATEGORIES.map(({ value, label }) => {
          const active = category === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setCategory(value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-teal',
                active
                  ? 'bg-teal text-white'
                  : 'bg-surface text-charcoal-light border border-teal-light hover:bg-teal-light hover:text-teal',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Message */}
      <div>
        <label htmlFor="feedback-message" className="sr-only">
          Your feedback
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={e => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
          maxLength={MAX_MESSAGE}
          rows={4}
          placeholder="Tell us what happened or what you'd like to see…"
          className="w-full rounded-xl border border-teal-light bg-surface px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal resize-y"
        />
        <div className="flex justify-end mt-1">
          <span
            className={cn(
              'text-xs',
              nearLimit ? 'text-red-tier font-semibold' : 'text-charcoal-light',
            )}
          >
            {message.length}/{MAX_MESSAGE}
          </span>
        </div>
      </div>

      {/* Honeypot — visually hidden, present in DOM for spam bots */}
      <input
        type="text"
        name="honeypot"
        value={honeypot}
        onChange={e => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute w-px h-px -m-px overflow-hidden p-0 border-0"
        style={{ clip: 'rect(0 0 0 0)' }}
      />

      {/* Message banner */}
      {msg && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium',
            msg.type === 'ok' ? 'bg-teal-light text-teal' : 'bg-red-tier-bg text-red-tier',
          )}
        >
          {msg.type === 'ok' ? <CheckCircle2 size={14} /> : <span className="text-xs font-bold">!</span>}
          {msg.text}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || tooShort}
        className="btn-primary flex items-center gap-2 disabled:opacity-50"
      >
        {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        {submitting ? 'Sending…' : 'Send feedback'}
      </button>
    </div>
  )
}
