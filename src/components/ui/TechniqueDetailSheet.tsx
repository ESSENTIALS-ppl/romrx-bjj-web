import { useEffect, useState } from 'react'
import { X, PlayCircle } from 'lucide-react'
import type { TechniqueEligibility } from '../../hooks/useProfile'
import { supabase } from '../../lib/supabase'
import { beltColor, cn } from '../../lib/utils'
import { TierBadge } from './TierBadge'

export type TechniqueDescription = {
  when: string
  setup: string[]
  execution: string[]
}

type TechRow = {
  description: TechniqueDescription | null
  video_url: string | null
}

/** Convert a YouTube watch/share URL into an embeddable URL. Returns null if not YouTube. */
function youtubeEmbedUrl(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return `https://www.youtube.com/embed/${m[1]}`
  }
  return null
}

function VideoSlot({ videoUrl, name }: { videoUrl: string | null; name: string }) {
  const embed = videoUrl ? youtubeEmbedUrl(videoUrl) : null
  return (
    <div className="relative w-full aspect-video bg-charcoal overflow-hidden">
      {embed ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={embed}
          title={name}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : videoUrl ? (
        <video className="absolute inset-0 h-full w-full object-cover" src={videoUrl} controls />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-charcoal to-charcoal-light text-white/90">
          <PlayCircle size={40} className="opacity-70" />
          <span className="text-sm font-medium tracking-wide">Video coming soon</span>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-display font-bold uppercase tracking-widest text-teal">{title}</h3>
      {children}
    </section>
  )
}

export function TechniqueDetailSheet({
  item,
  onClose,
}: {
  item: TechniqueEligibility
  onClose: () => void
}) {
  const tech = item.techniques as { code: string; name: string; belt: string; category: string }
  const isDelay = item.flag === 'DELAY_TECHNIQUE'

  const [shown, setShown] = useState(false)
  const [detail, setDetail] = useState<TechRow | null>(null)
  const [loading, setLoading] = useState(true)

  // Trigger slide-up after mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // description / video_url are not returned by the get_my_profile RPC,
  // so fetch them directly from the techniques table when the sheet opens.
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('techniques')
        .select('description, video_url')
        .eq('id', item.technique_id)
        .maybeSingle()
      if (active) {
        setDetail((data as TechRow) ?? { description: null, video_url: null })
        setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [item.technique_id])

  function handleClose() {
    setShown(false)
    setTimeout(onClose, 300)
  }

  const desc = detail?.description ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={tech.name}
    >
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className={cn(
          'absolute inset-0 bg-black/50 transition-opacity duration-300',
          shown ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Sheet */}
      <div
        className={cn(
          'relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white shadow-2xl',
          'rounded-t-3xl sm:rounded-3xl',
          'transition-transform duration-300 ease-out',
          shown ? 'translate-y-0' : 'translate-y-full sm:translate-y-8',
        )}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/50 transition-colors"
        >
          <X size={16} />
        </button>

        {/* 1. Video slot */}
        <VideoSlot videoUrl={detail?.video_url ?? null} name={tech.name} />

        <div className="p-5 space-y-5">
          {/* 2. Header */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-display font-bold text-charcoal leading-tight">{tech.name}</h2>
              <TierBadge tier={isDelay ? 'RED' : item.tier} flag={item.flag} size="md" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[11px] bg-surface text-charcoal-light px-2 py-0.5 rounded-full capitalize">{tech.category}</span>
              <span className={cn('text-[11px] px-2 py-0.5 rounded-full capitalize font-medium', beltColor(tech.belt))}>{tech.belt}</span>
            </div>
          </div>

          {/* 3–5. Instructional detail (null-safe: hidden entirely when no description) */}
          {loading ? (
            <div className="py-6 flex justify-center">
              <div className="h-5 w-5 rounded-full border-2 border-teal border-t-transparent animate-spin" />
            </div>
          ) : desc ? (
            <div className="space-y-5">
              {desc.when && (
                <Section title="When to Use">
                  <p className="text-base text-charcoal leading-relaxed text-left">{desc.when}</p>
                </Section>
              )}
              {desc.setup?.length > 0 && (
                <Section title="Setup">
                  <ol className="list-decimal space-y-1.5 pl-5 text-base text-charcoal leading-relaxed text-left marker:text-teal marker:font-semibold">
                    {desc.setup.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                </Section>
              )}
              {desc.execution?.length > 0 && (
                <Section title="Execution">
                  <ol className="list-decimal space-y-1.5 pl-5 text-base text-charcoal leading-relaxed text-left marker:text-teal marker:font-semibold">
                    {desc.execution.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                </Section>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
