import { useEffect, useRef, useState } from 'react'
import { MessageSquarePlus, X } from 'lucide-react'
import { FeedbackWidget } from './FeedbackWidget'

export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Focus management: trap focus, ESC to close, return focus on close
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    const node = dialogRef.current
    const getFocusable = () =>
      node
        ? Array.from(
            node.querySelectorAll<HTMLElement>(
              'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')
        : []

    // Focus first focusable element on open
    getFocusable()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable()
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Return focus to the trigger (or whatever had focus before)
      ;(triggerRef.current ?? previouslyFocused)?.focus()
    }
  }, [open])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const handleSuccess = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 2000)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 min-h-[44px] px-4 py-3 rounded-full bg-teal text-white shadow-lg hover:bg-teal/90 focus:outline-none focus:ring-2 focus:ring-teal focus:ring-offset-2 transition-colors"
      >
        <MessageSquarePlus size={18} />
        <span className="text-sm font-semibold">Feedback</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 id="feedback-dialog-title" className="font-display font-bold text-lg text-charcoal">
                Send feedback
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close feedback"
                className="p-1 rounded-full text-charcoal-light hover:bg-surface transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <FeedbackWidget onSuccess={handleSuccess} />
          </div>
        </div>
      )}
    </>
  )
}
