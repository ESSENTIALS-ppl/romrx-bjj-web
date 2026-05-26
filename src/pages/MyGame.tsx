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
  RefreshCw, ChevronDown, MapPin, Trophy, ArrowDown,
  Wand2, PenLine, CheckCircle2, ChevronRight,
} from 'lucide-react'

// ── Position labels ───────────────────────────────────────────────────────────
const POS: Record<string, string> = {
  standing:     'Standing',
  top_passing:  'Guard vs. Top',
  dominant_top: 'Dominant Position',
  bottom_guard: 'Guard (Bottom)',
  finish:       'Submission',
}

// Category → from/to position
const CAT_FROM: Record<string, string> = {
  'Throws':  'standing',
  'Guards':  'bottom_guard',
  'Passes':  'top_passing',
  'Sweeps':  'bottom_guard',
  'Controls':'dominant_top',
  'Submissions':'dominant_top',
}
const CAT_TO: Record<string, string> = {
  'Throws':  'top_passing',
  'Guards':  'bottom_guard',
  'Passes':  'dominant_top',
  'Sweeps':  'top_passing',
  'Controls':'dominant_top',
  'Submissions':'finish',
}

// Sequence for each path
const OFFENSE_SEQ = ['Throws', 'Passes', 'Controls', 'Submissions'] as const
const DEFENSE_SEQ = ['Guards', 'Sweeps', 'Controls', 'Submissions'] as const

type PathMode = 'offense' | 'defense'
type GenMode  = 'quick' | 'custom'

// ── Helpers ───────────────────────────────────────────────────────────────────
function pick<T>(arr: T[]): T | null {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null
}

function eligibleInCat(eligibility: TechniqueEligibility[], cat: string) {
  return eligibility.filter(e => {
    const t = e.techniques as { category: string }
    return (e.tier === 'GREEN' || e.tier === 'YELLOW') && !e.flag &&
      t.category.toLowerCase() === cat.toLowerCase()
  })
}

function limitingJoints(eligibility: TechniqueEligibility[], cat: string): string[] {
  const reds = eligibility.filter(e => {
    const t = e.techniques as { category: string }
    return (e.tier === 'RED' || e.flag === 'DELAY_TECHNIQUE') &&
      t.category.toLowerCase() === cat.toLowerCase()
  })
  const joints = new Set<string>()
  reds.forEach(e => (e.limiting_joints ?? []).forEach(j => joints.add(j)))
  return Array.from(joints).slice(0, 3)
}

// ── Position pill ─────────────────────────────────────────────────────────────
function PositionPill({ pos, isFinish }: { pos: string; isFinish?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-2 pl-1">
      {isFinish
        ? <Trophy size={13} className="text-teal shrink-0" />
        : <MapPin size={13} className="text-teal shrink-0" />}
      <span className="text-xs font-bold text-teal uppercase tracking-wider">
        {isFinish ? 'Submission' : (POS[pos] ?? pos)}
      </span>
    </div>
  )
}

// ── Quick Generate — flow display card ───────────────────────────────────────
function QuickStepCard({ technique, category, toPos, index, isLast }: {
  technique: TechniqueEligibility | null
  category: string
  toPos: string
  index: number
  isLast: boolean
}) {
  const [open, setOpen] = useState(false)
  const tech = technique?.techniques as { code: string; name: string; belt: string; category: string } | undefined

  return (
    <div>
      {index === 0 && <PositionPill pos={CAT_FROM[category] ?? 'standing'} />}
      <ArrowDown size={14} className="text-charcoal-light mx-3 my-0.5" />

      {technique ? (
        <div className="rounded-2xl border border-teal-light bg-white overflow-hidden">
          <button onClick={() => setOpen(o => !o)} className="w-full flex items-start gap-3 p-4 text-left">
            <div className="w-2 h-2 rounded-full bg-teal shrink-0 mt-1.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-mono text-charcoal-light uppercase tracking-wider">{tech?.code}</p>
                  <p className="text-sm font-semibold text-charcoal leading-snug">{tech?.name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <TierBadge tier={technique.tier} flag={technique.flag} size="sm" />
                  {open ? <ChevronDown size={13} className="text-charcoal-light" /> : <ChevronRight size={13} className="text-charcoal-light" />}
                </div>
              </div>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[11px] bg-surface text-charcoal-light px-2 py-0.5 rounded-full capitalize">{tech?.category}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize font-medium ${beltColor(tech?.belt ?? '')}`}>{tech?.belt}</span>
              </div>
            </div>
          </button>
          {open && (
            <div className="px-4 pb-3 border-t border-teal-light pt-2.5">
              <p className="text-xs text-charcoal-light">This technique is within your ROM capacity. Train it consistently.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={14} className="text-yellow-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-700">No available {category} yet</p>
              <p className="text-xs text-yellow-600 mt-0.5 leading-snug">
                Improve these joints to unlock:
              </p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {limitingJoints([], category).map(j => (
                  <span key={j} className="text-[11px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{formatJoint(j)}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <ArrowDown size={14} className="text-charcoal-light mx-3 my-0.5" />
      <PositionPill pos={toPos} isFinish={isLast && toPos === 'finish'} />
    </div>
  )
}

// ── Custom Builder — one step selector ───────────────────────────────────────
function StepSelector({ category, eligible, selected, onSelect }: {
  category: string
  eligible: TechniqueEligibility[]
  selected: TechniqueEligibility | null
  onSelect: (t: TechniqueEligibility | null) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedTech = selected?.techniques as { name: string; code: string } | undefined

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all',
          selected
            ? 'border-teal bg-teal/5'
            : 'border-teal-light bg-white hover:border-teal/30'
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {selected
            ? <CheckCircle2 size={16} className="text-teal shrink-0" />
            : <div className="w-4 h-4 rounded-full border-2 border-charcoal-light shrink-0" />}
          <div className="min-w-0">
            {selected ? (
              <>
                <p className="text-[10px] text-charcoal-light font-mono uppercase tracking-wider">{selectedTech?.code}</p>
                <p className="text-sm font-semibold text-charcoal leading-tight truncate">{selectedTech?.name}</p>
              </>
            ) : (
              <p className="text-sm text-charcoal-light">Choose a {category} technique…</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selected && <TierBadge tier={selected.tier} flag={selected.flag} size="sm" />}
          <ChevronDown size={14} className={cn('text-charcoal-light transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-teal-light shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {eligible.length === 0 ? (
            <div className="px-4 py-3 text-xs text-charcoal-light">
              No GREEN or YELLOW {category} available yet.
            </div>
          ) : (
            eligible.map(e => {
              const t = e.techniques as { code: string; name: string; belt: string }
              return (
                <button
                  key={e.id}
                  onClick={() => { onSelect(e); setOpen(false) }}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface transition-colors border-b border-teal-light/50 last:border-0',
                    selected?.id === e.id && 'bg-teal/5'
                  )}
                >
                  <div>
                    <p className="text-[10px] font-mono text-charcoal-light uppercase tracking-wider">{t.code}</p>
                    <p className="text-sm font-semibold text-charcoal leading-snug">{t.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${beltColor(t.belt)}`}>{t.belt}</span>
                  </div>
                  <TierBadge tier={e.tier} flag={e.flag} size="sm" />
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ── Technique library card ────────────────────────────────────────────────────
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
        <TierBadge tier={isDelay ? 'RED' : item.tier} flag={item.flag} size="sm" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] bg-surface text-charcoal-light px-2 py-0.5 rounded-full capitalize">{tech.category}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize font-medium ${beltColor(tech.belt)}`}>{tech.belt}</span>
      </div>
      {item.limiting_joints && item.limiting_joints.length > 0 && (
        <div className="pt-2 border-t border-teal-light/60">
          <div className="flex items-center gap-1 mb-1.5">
            <AlertTriangle size={10} className="text-yellow-600" />
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

// ── Main ──────────────────────────────────────────────────────────────────────
type Tab = 'generator' | 'library'

export function MyGame() {
  const { user } = useAuth()
  const { profile, eligibility, loading } = useProfile(user?.id)

  const [tab, setTab]           = useState<Tab>('generator')
  const [genMode, setGenMode]   = useState<GenMode>('quick')
  const [pathMode, setPathMode] = useState<PathMode | null>(null)

  // Quick generate state
  const [quickFlow, setQuickFlow] = useState<TechniqueEligibility[]>([])

  // Custom builder state: one selection per step (4 steps)
  const [customPicks, setCustomPicks] = useState<(TechniqueEligibility | null)[]>([null, null, null, null])

  // Library filters
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('All')
  const [tierFilter, setTierFilter] = useState<typeof TIERS[number]>('All')

  const sequence = useCallback((p: PathMode) =>
    p === 'offense' ? [...OFFENSE_SEQ] : [...DEFENSE_SEQ], [])

  // Quick generate
  const quickGenerate = useCallback((p: PathMode) => {
    setPathMode(p)
    setQuickFlow(sequence(p).map(cat => pick(eligibleInCat(eligibility, cat)) as TechniqueEligibility))
  }, [eligibility, sequence])

  const quickRegenerate = useCallback(() => {
    if (!pathMode) return
    setQuickFlow(sequence(pathMode).map(cat => pick(eligibleInCat(eligibility, cat)) as TechniqueEligibility))
  }, [pathMode, eligibility, sequence])

  // Custom: when path changes, reset picks
  const setCustomPath = useCallback((p: PathMode) => {
    setPathMode(p)
    setCustomPicks([null, null, null, null])
  }, [])

  const setPick = useCallback((stepIdx: number, tech: TechniqueEligibility | null) => {
    setCustomPicks(prev => prev.map((v, i) => i === stepIdx ? tech : v))
  }, [])

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
  const r = eligibility.filter(e => e.tier === 'RED' || e.flag === 'DELAY_TECHNIQUE').length

  const filtered = eligibility.filter(item => {
    const tech = item.techniques as { name: string; category: string }
    const effectiveTier = item.flag === 'DELAY_TECHNIQUE' ? 'RED' : item.tier
    return (
      (tierFilter === 'All' || effectiveTier === tierFilter) &&
      (catFilter  === 'All' || tech.category.toLowerCase().includes(catFilter.toLowerCase())) &&
      (!search || tech.name.toLowerCase().includes(search.toLowerCase()))
    )
  })

  const seq = pathMode ? sequence(pathMode) : OFFENSE_SEQ

  // Custom flow complete when all 4 steps picked
  const customComplete = customPicks.every(p => p !== null)

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

      {/* Page tabs */}
      <div className="flex gap-1 bg-surface rounded-2xl p-1">
        {([['generator', 'Flow Generator'], ['library', 'Technique Library']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('flex-1 text-sm font-semibold py-2 rounded-xl transition-all',
              tab === t ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal-light hover:text-charcoal'
            )}>{label}</button>
        ))}
      </div>

      {/* ── FLOW GENERATOR ── */}
      {tab === 'generator' && (
        <div className="space-y-4">

          {/* Generator mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setGenMode('quick'); setPathMode(null); setQuickFlow([]) }}
              className={cn('flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-semibold text-sm transition-all',
                genMode === 'quick'
                  ? 'border-teal bg-teal text-white'
                  : 'border-teal-light bg-white text-charcoal hover:border-teal/30'
              )}>
              <Wand2 size={15} /> Quick Generate
            </button>
            <button onClick={() => { setGenMode('custom'); setPathMode(null); setCustomPicks([null,null,null,null]) }}
              className={cn('flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-semibold text-sm transition-all',
                genMode === 'custom'
                  ? 'border-teal bg-teal text-white'
                  : 'border-teal-light bg-white text-charcoal hover:border-teal/30'
              )}>
              <PenLine size={15} /> Build My Own
            </button>
          </div>

          {/* ── QUICK GENERATE ── */}
          {genMode === 'quick' && (
            <div className="space-y-4">
              <p className="text-xs text-charcoal-light text-center">
                Pick your starting position and ROMRx generates a flow using your GREEN and YELLOW techniques.
              </p>

              {/* Offense / Defense */}
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['offense', 'Offense', 'I get the takedown', Swords],
                  ['defense', 'Defense', 'They get the takedown', Shield],
                ] as const).map(([p, label, sub, Icon]) => (
                  <button key={p} onClick={() => quickGenerate(p)}
                    className={cn('flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all',
                      pathMode === p && genMode === 'quick'
                        ? 'border-teal bg-teal text-white shadow-md'
                        : 'border-teal-light bg-white text-charcoal hover:border-teal/40'
                    )}>
                    <Icon size={24} className={pathMode === p && genMode === 'quick' ? 'text-white' : 'text-teal'} />
                    <div className="text-center">
                      <p className="font-bold text-sm">{label}</p>
                      <p className={cn('text-xs mt-0.5', pathMode === p && genMode === 'quick' ? 'text-teal-light' : 'text-charcoal-light')}>
                        {sub}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Generated flow */}
              {quickFlow.length > 0 && pathMode && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-charcoal">{pathMode === 'offense' ? 'Offense' : 'Defense'} Flow</p>
                      <p className="text-xs text-charcoal-light">GREEN + YELLOW only · RED excluded</p>
                    </div>
                    <button onClick={quickRegenerate}
                      className="flex items-center gap-1.5 text-xs font-semibold text-teal bg-teal-light px-3 py-2 rounded-xl hover:bg-teal/20 transition-colors">
                      <RefreshCw size={12} /> New Flow
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl border border-teal-light p-5">
                    {seq.map((cat, i) => (
                      <QuickStepCard
                        key={cat}
                        technique={quickFlow[i] ?? null}
                        category={cat}
                        toPos={CAT_TO[cat]}
                        index={i}
                        isLast={i === seq.length - 1}
                      />
                    ))}
                  </div>

                  <p className="text-center text-xs text-charcoal-light">
                    Hit "New Flow" to randomize a different path. Switch to "Build My Own" to choose each move yourself.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── CUSTOM BUILDER ── */}
          {genMode === 'custom' && (
            <div className="space-y-4">
              <p className="text-xs text-charcoal-light text-center">
                Choose your starting position, then pick your own techniques at each step.
              </p>

              {/* Offense / Defense */}
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['offense', 'Offense', 'I get the takedown', Swords],
                  ['defense', 'Defense', 'They get the takedown', Shield],
                ] as const).map(([p, label, sub, Icon]) => (
                  <button key={p} onClick={() => setCustomPath(p)}
                    className={cn('flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all',
                      pathMode === p
                        ? 'border-teal bg-teal text-white shadow-md'
                        : 'border-teal-light bg-white text-charcoal hover:border-teal/40'
                    )}>
                    <Icon size={24} className={pathMode === p ? 'text-white' : 'text-teal'} />
                    <div className="text-center">
                      <p className="font-bold text-sm">{label}</p>
                      <p className={cn('text-xs mt-0.5', pathMode === p ? 'text-teal-light' : 'text-charcoal-light')}>{sub}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Step selectors */}
              {pathMode && (
                <div className="space-y-3">
                  {seq.map((cat, i) => {
                    const eligible = eligibleInCat(eligibility, cat)
                    const fromPos = CAT_FROM[cat]
                    const toPos = CAT_TO[cat]
                    const isLast = i === seq.length - 1

                    return (
                      <div key={cat} className="space-y-1">
                        {/* Position label */}
                        <PositionPill pos={fromPos} />
                        <ArrowDown size={14} className="text-charcoal-light mx-3 my-0" />

                        {/* Step header */}
                        <p className="text-xs font-bold text-charcoal uppercase tracking-wide px-1 mb-1">
                          Step {i + 1} — {cat}
                        </p>

                        {eligible.length === 0 ? (
                          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-3 flex items-start gap-2.5">
                            <AlertTriangle size={14} className="text-yellow-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-yellow-700">No GREEN or YELLOW {cat} available yet. Work on your ROM to unlock these techniques.</p>
                          </div>
                        ) : (
                          <StepSelector
                            category={cat}
                            eligible={eligible}
                            selected={customPicks[i]}
                            onSelect={(t) => setPick(i, t)}
                          />
                        )}

                        <ArrowDown size={14} className="text-charcoal-light mx-3 my-1" />
                        <PositionPill pos={toPos} isFinish={isLast && toPos === 'finish'} />
                      </div>
                    )
                  })}

                  {/* Complete flow summary */}
                  {customComplete && (
                    <div className="bg-teal-light rounded-2xl p-4 text-center space-y-1 border border-teal/20">
                      <CheckCircle2 size={20} className="text-teal mx-auto" />
                      <p className="text-sm font-bold text-teal">Flow complete!</p>
                      <p className="text-xs text-teal/80">
                        {customPicks.map(p => (p?.techniques as { name: string })?.name).filter(Boolean).join(' → ')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TECHNIQUE LIBRARY ── */}
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
                    }`}>{c}</button>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {TIERS.map(t => (
                  <button key={t} onClick={() => setTierFilter(t)}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                      tierFilter === t ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:bg-gray-100'
                    }`}>{t}</button>
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
