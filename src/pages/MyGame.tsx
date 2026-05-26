import { useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import type { TechniqueEligibility } from '../hooks/useProfile'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { TierBadge } from '../components/ui/TierBadge'
import { formatJoint, beltColor, cn } from '../lib/utils'
import {
  Search, Layers, AlertTriangle, Swords, Shield,
  RefreshCw, ChevronDown, ChevronRight, MapPin, Trophy,
  ArrowDown,
} from 'lucide-react'

// ── Position labels ───────────────────────────────────────────────────────────
const POS: Record<string, string> = {
  standing:     'Standing',
  clinch:       'Clinch / Tie-Up',
  top_passing:  'Guard vs. Top',
  dominant_top: 'Dominant Position (Top)',
  bottom_guard: 'Guard (Bottom)',
  back_control: 'Back Control',
  finish:       'Submission',
}

// Which position each category "comes from" and "leads to"
const CAT_FROM: Record<string, string> = {
  'Throws':             'standing',
  'Guards':             'bottom_guard',
  'Passes':             'top_passing',
  'Sweeps':             'bottom_guard',
  'Controls':           'dominant_top',
  'Submissions':        'dominant_top',
  'Submission defense': 'bottom_guard',
}
const CAT_TO: Record<string, string> = {
  'Throws':             'top_passing',
  'Guards':             'bottom_guard',
  'Passes':             'dominant_top',
  'Sweeps':             'top_passing',
  'Controls':           'dominant_top',
  'Submissions':        'finish',
  'Submission defense': 'bottom_guard',
}

// ── Flow steps: category sequence per path ────────────────────────────────────
const OFFENSE_SEQUENCE = ['Throws', 'Passes', 'Controls', 'Submissions'] as const
const DEFENSE_SEQUENCE = ['Guards', 'Sweeps', 'Controls', 'Submissions'] as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function pick<T>(arr: T[]): T | null {
  if (!arr.length) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

function eligibleInCategory(eligibility: TechniqueEligibility[], category: string) {
  return eligibility.filter(e => {
    const tech = e.techniques as { category: string }
    return (e.tier === 'GREEN' || e.tier === 'YELLOW') && !e.flag &&
      tech.category.toLowerCase() === category.toLowerCase()
  })
}

function limitingJointsForCategory(eligibility: TechniqueEligibility[], category: string): string[] {
  const reds = eligibility.filter(e => {
    const tech = e.techniques as { category: string }
    return (e.tier === 'RED' || e.flag === 'DELAY_TECHNIQUE') && tech.category.toLowerCase() === category.toLowerCase()
  })
  const joints = new Set<string>()
  reds.forEach(e => (e.limiting_joints ?? []).forEach(j => joints.add(j)))
  return Array.from(joints).slice(0, 3)
}

// ── Flow step types ───────────────────────────────────────────────────────────
interface FlowStep {
  fromPos: string
  category: string
  technique: TechniqueEligibility | null   // null = no GREEN available
  toPos: string
  limitingJoints: string[]                 // only when technique is null
}

function generateFlow(
  eligibility: TechniqueEligibility[],
  mode: 'offense' | 'defense'
): FlowStep[] {
  const sequence = mode === 'offense' ? OFFENSE_SEQUENCE : DEFENSE_SEQUENCE
  return sequence.map(cat => {
    const eligible = eligibleInCategory(eligibility, cat)
    const chosen = pick(eligible)
    return {
      fromPos: CAT_FROM[cat],
      category: cat,
      technique: chosen,
      toPos: CAT_TO[cat],
      limitingJoints: chosen ? [] : limitingJointsForCategory(eligibility, cat),
    }
  })
}

// ── FlowCard (one step) ───────────────────────────────────────────────────────
function PositionPill({ pos }: { pos: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <MapPin size={13} className="text-teal shrink-0" />
      <span className="text-xs font-bold text-teal uppercase tracking-wider">{POS[pos] ?? pos}</span>
    </div>
  )
}

function FlowStepCard({ step, index }: { step: FlowStep; index: number }) {
  const [open, setOpen] = useState(false)
  const tech = step.technique?.techniques as { code: string; name: string; belt: string; category: string } | undefined
  const hasGreen = !!step.technique

  return (
    <div>
      {/* From position */}
      {index === 0 && <PositionPill pos={step.fromPos} />}

      <ArrowDown size={14} className="text-charcoal-light mx-3 my-0.5" />

      {hasGreen ? (
        <div className="rounded-2xl border border-teal-light bg-white overflow-hidden">
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-start gap-3 p-4 text-left"
          >
            <div className="w-2 h-2 rounded-full bg-teal shrink-0 mt-1.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono text-charcoal-light uppercase tracking-wider">{tech?.code}</span>
                  <p className="text-sm font-semibold text-charcoal leading-snug">{tech?.name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <TierBadge tier="GREEN" size="sm" />
                  {open ? <ChevronDown size={13} className="text-charcoal-light" /> : <ChevronRight size={13} className="text-charcoal-light" />}
                </div>
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <span className="text-[11px] bg-surface text-charcoal-light px-2 py-0.5 rounded-full capitalize">{tech?.category}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize font-medium ${beltColor(tech?.belt ?? '')}`}>{tech?.belt}</span>
              </div>
            </div>
          </button>

          {open && step.technique?.limiting_joints && (
            <div className="px-4 pb-4 border-t border-teal-light pt-3">
              <p className="text-xs text-charcoal-light">This technique is fully unlocked based on your current ROM. Keep training it.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={14} className="text-yellow-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-700">No GREEN {step.category} yet</p>
              <p className="text-xs text-yellow-600 mt-0.5">Your ROM is limiting these techniques. Work on:</p>
              {step.limitingJoints.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {step.limitingJoints.map(j => (
                    <span key={j} className="text-[11px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">{formatJoint(j)}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ArrowDown size={14} className="text-charcoal-light mx-3 my-0.5" />

      {/* To position */}
      {step.toPos === 'finish' ? (
        <div className="flex items-center gap-2 py-2">
          <Trophy size={13} className="text-teal shrink-0" />
          <span className="text-xs font-bold text-teal uppercase tracking-wider">Submission</span>
        </div>
      ) : (
        <PositionPill pos={step.toPos} />
      )}
    </div>
  )
}

// ── Technique card (library tab) ──────────────────────────────────────────────
const CATEGORIES = ['All', 'Throws', 'Passes', 'Guards', 'Sweeps', 'Controls', 'Submissions', 'Submission defense']
const TIERS = ['All', 'GREEN', 'YELLOW', 'RED'] as const

function TechCard({ item }: { item: TechniqueEligibility }) {
  const tech = item.techniques as { code: string; name: string; belt: string; category: string }
  const isDelay = item.flag === 'DELAY_TECHNIQUE'
  return (
    <div className="bg-white rounded-2xl border border-teal-light p-4 flex flex-col gap-2.5 hover:border-teal/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-mono text-charcoal-light uppercase tracking-wider">{tech.code}</span>
          <p className="text-sm font-semibold text-charcoal leading-snug mt-0.5 line-clamp-2">{tech.name}</p>
        </div>
        <TierBadge tier={isDelay ? null : item.tier} flag={item.flag} size="sm" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] bg-surface text-charcoal-light px-2 py-0.5 rounded-full capitalize">{tech.category}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize font-medium ${beltColor(tech.belt)}`}>{tech.belt}</span>
      </div>
      {item.limiting_joints && item.limiting_joints.length > 0 && (
        <div className="pt-2 border-t border-teal-light/60">
          <div className="flex items-center gap-1 mb-1.5">
            <AlertTriangle size={10} className="text-gold" />
            <span className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wide">Limiting</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {item.limiting_joints.map(j => (
              <span key={j} className="text-[11px] bg-yellow-tier-bg text-yellow-tier px-2 py-0.5 rounded-full">{formatJoint(j)}</span>
            ))}
          </div>
        </div>
      )}
      {isDelay && (
        <div className="pt-2 border-t border-red-100">
          <p className="text-[11px] text-red-tier bg-red-tier-bg rounded-lg px-2.5 py-1.5 leading-snug">
            Build prerequisite mobility before attempting this technique.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Tab = 'generator' | 'library'

export function MyGame() {
  const { user } = useAuth()
  const { profile, eligibility, loading } = useProfile(user?.id)

  const [tab, setTab]       = useState<Tab>('generator')
  const [mode, setMode]     = useState<'offense' | 'defense' | null>(null)
  const [flow, setFlow]     = useState<FlowStep[] | null>(null)

  // Library filters
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [tierFilter, setTierFilter] = useState<typeof TIERS[number]>('All')

  const generate = useCallback((m: 'offense' | 'defense') => {
    setMode(m)
    setFlow(generateFlow(eligibility, m))
  }, [eligibility])

  const regenerate = useCallback(() => {
    if (mode) setFlow(generateFlow(eligibility, mode))
  }, [mode, eligibility])

  if (loading) return <Spinner />

  if (eligibility.length === 0) return (
    <EmptyState
      icon={Layers}
      title="No techniques rated yet"
      description="Submit your ROM assessment to unlock your personalized game plan and flow generator."
    />
  )

  const g = eligibility.filter(e => e.tier === 'GREEN' && !e.flag).length
  const y = eligibility.filter(e => e.tier === 'YELLOW' && !e.flag).length
  // DELAY_TECHNIQUE is an internal flag — count as RED in the UI
  const r = eligibility.filter(e => e.tier === 'RED' || e.flag === 'DELAY_TECHNIQUE').length

  const filtered = eligibility.filter(item => {
    const tech = item.techniques as { name: string; category: string }
    // DELAY_TECHNIQUE counts as RED in the UI
    const effectiveTier = item.flag === 'DELAY_TECHNIQUE' ? 'RED' : item.tier
    return (
      (tierFilter === 'All' || effectiveTier === tierFilter) &&
      (catFilter  === 'All' || tech.category.toLowerCase().includes(catFilter.toLowerCase())) &&
      (!search || tech.name.toLowerCase().includes(search.toLowerCase()))
    )
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Game"
        subtitle={`${eligibility.length} techniques rated · ${profile?.belt ?? 'white'} belt`}
      />

      {/* Tier summary strip */}
      <div className="flex gap-2 flex-wrap">
        {([['GREEN', g, 'tier-green'], ['YELLOW', y, 'tier-yellow'], ['RED', r, 'tier-red']] as const).map(([label, count, cls]) => (
          <span key={label} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${cls}`}>
            {count} {label}
          </span>
        ))}
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 bg-surface rounded-2xl p-1">
        {([['generator', 'Flow Generator'], ['library', 'Technique Library']] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 text-sm font-semibold py-2 rounded-xl transition-all',
              tab === t ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal-light hover:text-charcoal'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── FLOW GENERATOR TAB ── */}
      {tab === 'generator' && (
        <div className="space-y-5">
          {/* Mode selection */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => generate('offense')}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all',
                mode === 'offense'
                  ? 'border-teal bg-teal text-white shadow-md'
                  : 'border-teal-light bg-white text-charcoal hover:border-teal/40'
              )}
            >
              <Swords size={24} className={mode === 'offense' ? 'text-white' : 'text-teal'} />
              <div className="text-center">
                <p className="font-bold text-sm">Offense</p>
                <p className={cn('text-xs mt-0.5 leading-snug', mode === 'offense' ? 'text-teal-light' : 'text-charcoal-light')}>
                  I get the takedown
                </p>
              </div>
            </button>

            <button
              onClick={() => generate('defense')}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all',
                mode === 'defense'
                  ? 'border-teal bg-teal text-white shadow-md'
                  : 'border-teal-light bg-white text-charcoal hover:border-teal/40'
              )}
            >
              <Shield size={24} className={mode === 'defense' ? 'text-white' : 'text-teal'} />
              <div className="text-center">
                <p className="font-bold text-sm">Defense</p>
                <p className={cn('text-xs mt-0.5 leading-snug', mode === 'defense' ? 'text-teal-light' : 'text-charcoal-light')}>
                  They get the takedown
                </p>
              </div>
            </button>
          </div>

          {/* No mode selected yet */}
          {!flow && (
            <div className="bg-white rounded-2xl border border-teal-light p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-charcoal">Choose your starting position</p>
              <p className="text-xs text-charcoal-light leading-relaxed max-w-sm mx-auto">
                ROMRx will generate a personalized flow roll using your GREEN and YELLOW techniques. RED techniques are never included.
              </p>
            </div>
          )}

          {/* Generated flow */}
          {flow && (
            <div className="space-y-4">
              {/* Header with regen */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-charcoal">
                    {mode === 'offense' ? 'Offense' : 'Defense'} Flow
                  </p>
                  <p className="text-xs text-charcoal-light">
                    GREEN + YELLOW only · RED excluded · based on your ROM
                  </p>
                </div>
                <button
                  onClick={regenerate}
                  className="flex items-center gap-1.5 text-xs font-semibold text-teal bg-teal-light px-3 py-2 rounded-xl hover:bg-teal/20 transition-colors"
                >
                  <RefreshCw size={12} /> New Flow
                </button>
              </div>

              {/* Flow chain */}
              <div className="bg-white rounded-2xl border border-teal-light p-5">
                <div className="space-y-0">
                  {flow.map((step, i) => (
                    <FlowStepCard key={i} step={step} index={i} />
                  ))}
                </div>
              </div>

              {/* Context note */}
              <p className="text-center text-xs text-charcoal-light px-4">
                Tap any technique to expand it. Hit "New Flow" for a different path. Improve your RED techniques to add more options.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── TECHNIQUE LIBRARY TAB ── */}
      {tab === 'library' && (
        <div className="space-y-4">
          <SectionCard>
            <div className="space-y-3">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search techniques..."
                  className="w-full pl-8 pr-4 py-2 text-sm rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white transition-colors"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCatFilter(c)}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors capitalize ${
                      catFilter === c ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:bg-gray-100'
                    }`}
                  >{c}</button>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {TIERS.map(t => (
                  <button key={t} onClick={() => setTierFilter(t)}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                      tierFilter === t ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:bg-gray-100'
                    }`}
                  >{t}</button>
                ))}
              </div>
            </div>
          </SectionCard>

          {filtered.length === 0 ? (
            <p className="text-center text-charcoal-light text-sm py-10">No techniques match your filters.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(item => <TechCard key={item.id} item={item} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
