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
  Wand2, PenLine, CheckCircle2,
  Flame, Brain, Zap, Footprints, CircleDot,
  Bookmark, Share2, Trash2, Check, Lock,
  ChevronLeft, Star,
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
  'Throws':       'standing',
  'Guards':       'bottom_guard',
  'Passes':       'top_passing',
  'Sweeps':       'bottom_guard',
  'Controls':     'dominant_top',
  'Submissions':  'dominant_top',
}
const CAT_TO: Record<string, string> = {
  'Throws':       'top_passing',
  'Guards':       'bottom_guard',
  'Passes':       'dominant_top',
  'Sweeps':       'top_passing',
  'Controls':     'dominant_top',
  'Submissions':  'finish',
}

// Sequence for each path
const OFFENSE_SEQ = ['Throws', 'Passes', 'Controls', 'Submissions'] as const
const DEFENSE_SEQ = ['Guards', 'Sweeps', 'Controls', 'Submissions'] as const

// AI path sequences
const STANDING_SEQ = ['Throws', 'Passes', 'Controls', 'Submissions'] as const
const ONTOP_SEQ    = ['Passes', 'Controls', 'Controls', 'Submissions'] as const
const ONBOTTOM_SEQ = ['Guards', 'Sweeps', 'Controls', 'Submissions'] as const

type PathMode       = 'offense' | 'defense'
type GenMode        = 'quick' | 'custom' | 'ai'
type Tab            = 'gameplan' | 'myflows' | 'library'
type AIStart        = 'standing' | 'ontop' | 'onbottom'
type AIFinish       = 'chokes' | 'arm' | 'legs'
type AIStyle        = 'explosive' | 'technical'

// ── Saved plan shape ──────────────────────────────────────────────────────────
interface FlowTech {
  id: string
  name: string
  code: string
  tier: string
  flag: string | null
  category: string
  belt: string
  limiting_joints?: string[]
}

interface SavedPlan {
  id: string
  name: string
  description: string
  createdAt: string
  pathMode: string
  techniques: FlowTech[]
}

// ── Game plan name map ────────────────────────────────────────────────────────
function getAIPlanName(start: AIStart, finish: AIFinish, style: AIStyle): string {
  if (start === 'standing' && finish === 'chokes' && style === 'explosive') return 'The Takedown Finisher'
  if (start === 'standing' && finish === 'chokes' && style === 'technical') return 'The Judo Strangler'
  if (start === 'standing' && finish === 'arm'    && style === 'explosive') return 'The Combat Wrestler'
  if (start === 'standing' && finish === 'arm'    && style === 'technical') return 'The Chain Attacker'
  if (start === 'standing' && finish === 'legs')                            return 'The Standing Leg Hunter'
  if (start === 'ontop'    && finish === 'chokes' && style === 'explosive') return 'The Pressure Strangler'
  if (start === 'ontop'    && finish === 'chokes' && style === 'technical') return 'The Steady Grinder'
  if (start === 'ontop'    && finish === 'arm'    && style === 'explosive') return 'The Smash Passer'
  if (start === 'ontop'    && finish === 'arm'    && style === 'technical') return 'The Control Specialist'
  if (start === 'ontop'    && finish === 'legs')                            return 'The Leg Hunter'
  if (start === 'onbottom' && finish === 'chokes' && style === 'explosive') return 'The Guard Shark'
  if (start === 'onbottom' && finish === 'chokes' && style === 'technical') return 'The Technical Wrapper'
  if (start === 'onbottom' && finish === 'arm'    && style === 'explosive') return 'The Hip Escape Finisher'
  if (start === 'onbottom' && finish === 'arm'    && style === 'technical') return 'The Guard Technician'
  if (start === 'onbottom' && finish === 'legs')                            return 'The Leg Lace Specialist'
  return 'Custom Game Plan'
}

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

function pickByFinish(eligible: TechniqueEligibility[], finish: AIFinish): TechniqueEligibility | null {
  if (eligible.length === 0) return null

  const keywords: Record<AIFinish, string[]> = {
    chokes: ['choke', 'strangle', 'naked', 'triangle', 'guillotine'],
    arm:    ['armbar', 'kimura', 'americana', 'arm'],
    legs:   ['heel', 'kneebar', 'ankle', 'leg'],
  }

  const kws = keywords[finish]
  const preferred = eligible.filter(e => {
    const name = (e.techniques as { name: string }).name.toLowerCase()
    return kws.some(k => name.includes(k))
  })

  if (preferred.length > 0) return pick(preferred)

  // fall back: GREEN first, then YELLOW
  const greens = eligible.filter(e => e.tier === 'GREEN')
  if (greens.length > 0) return pick(greens)
  return pick(eligible)
}

function eligToFlowTech(e: TechniqueEligibility): FlowTech {
  const t = e.techniques as { code: string; name: string; belt: string; category: string }
  return {
    id:              e.id,
    name:            t.name,
    code:            t.code,
    tier:            e.tier,
    flag:            e.flag,
    category:        t.category,
    belt:            t.belt,
    limiting_joints: e.limiting_joints ?? [],
  }
}

// ── Save helper ───────────────────────────────────────────────────────────────
function savePlan(name: string, description: string, pathMode: string, techniques: FlowTech[]) {
  const plans: SavedPlan[] = JSON.parse(localStorage.getItem('romrx_game_plans') || '[]')
  const newPlan: SavedPlan = {
    id: Date.now().toString(),
    name,
    description,
    createdAt: new Date().toISOString(),
    pathMode,
    techniques,
  }
  localStorage.setItem('romrx_game_plans', JSON.stringify([newPlan, ...plans]))
}

// ── VisualFlow component ──────────────────────────────────────────────────────
interface VisualFlowStep {
  tech: FlowTech | null
  category: string
}

function tierBorderClass(tier: string | null): string {
  if (tier === 'GREEN')  return 'border-l-4 border-l-teal'
  if (tier === 'YELLOW') return 'border-l-4 border-l-yellow-400'
  return 'border-l-4 border-l-gray-200'
}

function FlowNode({
  step, index, totalSteps, eligibility,
}: {
  step: VisualFlowStep
  index: number
  totalSteps: number
  eligibility: TechniqueEligibility[]
}) {
  const isFirst  = index === 0
  const isLast   = index === totalSteps - 1
  const fromPos  = CAT_FROM[step.category] ?? 'standing'
  const toPos    = CAT_TO[step.category]   ?? 'finish'
  const isFinish = isLast && toPos === 'finish'
  const joints   = step.tech?.limiting_joints ?? []

  if (!step.tech) {
    const locked = limitingJoints(eligibility, step.category)
    return (
      <div>
        {isFirst && (
          <div className="flex items-center gap-2 py-2 pl-1">
            <MapPin size={13} className="text-teal shrink-0" />
            <span className="text-xs font-bold text-teal uppercase tracking-wider">{POS[fromPos] ?? fromPos}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-charcoal-light my-1 ml-3">
          <ArrowDown size={12} />
          <span className="text-[10px] uppercase tracking-widest font-semibold">{step.category}</span>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 border-l-4 border-l-gray-300">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-gray-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-500">No {step.category} available</p>
              {locked.length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Work on {locked.map(j => formatJoint(j)).join(', ')} to unlock {step.category} techniques.
                </p>
              )}
            </div>
          </div>
        </div>
        {isLast && (
          <div className="flex items-center gap-2 py-2 pl-1 mt-1">
            <Trophy size={13} className="text-teal shrink-0" />
            <span className="text-xs font-bold text-teal uppercase tracking-wider">Submission</span>
          </div>
        )}
      </div>
    )
  }

  const effectiveTier = step.tech.flag === 'DELAY_TECHNIQUE' ? 'RED' : step.tech.tier

  return (
    <div>
      {isFirst && (
        <div className="flex items-center gap-2 py-2 pl-1">
          <MapPin size={13} className="text-teal shrink-0" />
          <span className="text-xs font-bold text-teal uppercase tracking-wider">{POS[fromPos] ?? fromPos}</span>
        </div>
      )}
      <div className="flex items-center gap-1 text-charcoal-light my-1 ml-3">
        <ArrowDown size={12} />
        <span className="text-[10px] uppercase tracking-widest font-semibold">{step.category}</span>
      </div>
      <div className={cn(
        'rounded-2xl border border-teal-light bg-white overflow-hidden',
        tierBorderClass(effectiveTier),
        isFinish && 'border border-yellow-300 bg-yellow-50',
      )}>
        {isFinish && (
          <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
            <Trophy size={13} className="text-yellow-600" />
            <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider">Submission</span>
          </div>
        )}
        <div className="px-4 py-3">
          <p className="text-[10px] font-mono text-charcoal-light uppercase tracking-wider">{step.tech.code}</p>
          <p className="text-sm font-semibold text-charcoal leading-snug mt-0.5">{step.tech.name}</p>
          <div className="flex gap-1.5 mt-2 flex-wrap items-center">
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full capitalize font-medium', beltColor(step.tech.belt))}>
              {step.tech.belt}
            </span>
            <TierBadge tier={effectiveTier} flag={step.tech.flag} size="sm" />
          </div>
          {joints.length > 0 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              <AlertTriangle size={10} className="text-yellow-600 shrink-0" />
              {joints.map(j => (
                <span key={j} className="text-[10px] bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded-full">
                  {formatJoint(j)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {isLast && (
        <div className="flex items-center gap-2 py-2 pl-1 mt-1">
          {isFinish
            ? <Trophy size={13} className="text-teal shrink-0" />
            : <MapPin size={13} className="text-teal shrink-0" />}
          <span className="text-xs font-bold text-teal uppercase tracking-wider">
            {isFinish ? 'Submission' : (POS[toPos] ?? toPos)}
          </span>
        </div>
      )}
    </div>
  )
}

function VisualFlow({
  steps, eligibility,
}: {
  steps: VisualFlowStep[]
  eligibility: TechniqueEligibility[]
}) {
  return (
    <div className="space-y-1 bg-white rounded-2xl border border-teal-light p-5">
      {steps.map((step, i) => (
        <FlowNode
          key={`${step.category}-${i}`}
          step={step}
          index={i}
          totalSteps={steps.length}
          eligibility={eligibility}
        />
      ))}
    </div>
  )
}

// ── Position pill (used in custom builder) ────────────────────────────────────
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

// ── Custom Builder — one step selector ────────────────────────────────────────
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
              <p className="text-sm text-charcoal-light">Choose a {category} technique...</p>
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

// ── Saved Plan Card ───────────────────────────────────────────────────────────
function SavedPlanCard({
  plan,
  onLoad,
  onDelete,
}: {
  plan: SavedPlan
  onLoad: (plan: SavedPlan) => void
  onDelete: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const g = plan.techniques.filter(t => t.tier === 'GREEN' && !t.flag).length
  const y = plan.techniques.filter(t => t.tier === 'YELLOW' && !t.flag).length
  const r = plan.techniques.filter(t => t.tier === 'RED' || t.flag === 'DELAY_TECHNIQUE').length

  const handleShare = () => {
    const url = window.location.href + '#plan=' + btoa(JSON.stringify(plan))
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const dateStr = new Date(plan.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="bg-white rounded-2xl border border-teal-light p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-charcoal text-sm">{plan.name}</p>
          <p className="text-xs text-charcoal-light mt-0.5">{dateStr}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={handleShare}
            className="p-1.5 rounded-lg text-charcoal-light hover:text-teal hover:bg-teal-light transition-colors"
            title="Copy share link"
          >
            {copied ? <Check size={14} className="text-teal" /> : <Share2 size={14} />}
          </button>
          {confirmDelete ? (
            <div className="flex gap-1 items-center">
              <button
                onClick={() => onDelete(plan.id)}
                className="text-[11px] bg-red-500 text-white px-2 py-1 rounded-lg font-semibold"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[11px] bg-gray-100 text-charcoal-light px-2 py-1 rounded-lg"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-charcoal-light hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete plan"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Technique chain */}
      <p className="text-xs text-charcoal-light leading-relaxed">
        {plan.techniques.map(t => t.name).join(' → ')}
      </p>

      {/* Tier strip */}
      <div className="flex gap-1.5 flex-wrap">
        {g > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tier-green">{g} GREEN</span>}
        {y > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tier-yellow">{y} YELLOW</span>}
        {r > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tier-red">{r} RED</span>}
      </div>

      <button
        onClick={() => onLoad(plan)}
        className="w-full py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition-colors"
      >
        Load Plan
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function MyGame() {
  const { user } = useAuth()
  const { profile, eligibility, loading } = useProfile(user?.id)

  const [tab, setTab]           = useState<Tab>('gameplan')
  const [genMode, setGenMode]   = useState<GenMode>('ai')
  const [pathMode, setPathMode] = useState<PathMode | null>(null)

  // Quick generate state
  const [quickFlow, setQuickFlow] = useState<TechniqueEligibility[]>([])

  // Custom builder state
  const [customPicks, setCustomPicks] = useState<(TechniqueEligibility | null)[]>([null, null, null, null])

  // AI wizard state
  const [aiStep, setAiStep]           = useState<number>(0) // 0 = step1, 1 = step2, 2 = step3, 3 = result
  const [aiStart, setAiStart]         = useState<AIStart | null>(null)
  const [aiFinish, setAiFinish]       = useState<AIFinish | null>(null)
  const [aiStyle, setAiStyle]         = useState<AIStyle | null>(null)
  const [aiFlow, setAiFlow]           = useState<FlowTech[]>([])
  const [aiPlanName, setAiPlanName]   = useState<string>('')
  const [aiDescription, setAiDescription] = useState<string>('')

  // Save state
  const [savingPlanName, setSavingPlanName]   = useState<string>('')
  const [showSaveInput, setShowSaveInput]     = useState(false)
  const [savedConfirm, setSavedConfirm]       = useState(false)

  // Loaded plan from My Flows
  const [loadedPlan, setLoadedPlan] = useState<SavedPlan | null>(null)

  // My Flows state
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('romrx_game_plans') || '[]')
    } catch {
      return []
    }
  })

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
    setLoadedPlan(null)
  }, [eligibility, sequence])

  const quickRegenerate = useCallback(() => {
    if (!pathMode) return
    setQuickFlow(sequence(pathMode).map(cat => pick(eligibleInCat(eligibility, cat)) as TechniqueEligibility))
    setLoadedPlan(null)
  }, [pathMode, eligibility, sequence])

  // Custom: when path changes, reset picks
  const setCustomPath = useCallback((p: PathMode) => {
    setPathMode(p)
    setCustomPicks([null, null, null, null])
    setLoadedPlan(null)
  }, [])

  const setPick = useCallback((stepIdx: number, tech: TechniqueEligibility | null) => {
    setCustomPicks(prev => prev.map((v, i) => i === stepIdx ? tech : v))
  }, [])

  // AI generate
  const generateAIFlow = useCallback((start: AIStart, finish: AIFinish, style: AIStyle) => {
    const seqMap: Record<AIStart, readonly string[]> = {
      standing: STANDING_SEQ,
      ontop:    ONTOP_SEQ,
      onbottom: ONBOTTOM_SEQ,
    }
    const seq = seqMap[start]

    const flow: FlowTech[] = seq.map((cat, i) => {
      const eligible = eligibleInCat(eligibility, cat)
      const isLastStep = i === seq.length - 1
      let chosen: TechniqueEligibility | null = null
      if (isLastStep) {
        chosen = pickByFinish(eligible, finish)
      } else {
        const greens = eligible.filter(e => e.tier === 'GREEN')
        chosen = pick(greens.length > 0 ? greens : eligible)
      }
      if (!chosen) return null
      return eligToFlowTech(chosen)
    }).filter((t): t is FlowTech => t !== null)

    const planName = getAIPlanName(start, finish, style)

    const g = eligibility.filter(e => e.tier === 'GREEN' && !e.flag).length
    const y = eligibility.filter(e => e.tier === 'YELLOW' && !e.flag).length
    const hipNote = eligibility.some(e => (e.limiting_joints ?? []).some(j => j.startsWith('hip')))
      ? ' Hip mobility is a key area to address to expand your options further.'
      : ''

    const startLabels: Record<AIStart, string> = {
      standing: 'starting on the feet',
      ontop:    'starting in a top position',
      onbottom: 'starting from guard',
    }
    const finishLabels: Record<AIFinish, string> = {
      chokes: 'choke finishes',
      arm:    'arm attack submissions',
      legs:   'leg attack submissions',
    }
    const styleLabels: Record<AIStyle, string> = {
      explosive: 'an explosive, physical approach',
      technical: 'a patient, technical approach',
    }

    const desc = `Based on your ROM profile (${g} GREEN, ${y} YELLOW techniques available), this game plan is built around ${startLabels[start]}, targeting ${finishLabels[finish]} with ${styleLabels[style]}.${hipNote} Focus on drilling the GREEN-tier moves first and work toward the YELLOW techniques as your mobility improves.`

    setAiFlow(flow)
    setAiPlanName(planName)
    setAiDescription(desc)
    setSavingPlanName(planName)
    setAiStep(3)
    setLoadedPlan(null)
  }, [eligibility])

  const resetAIWizard = () => {
    setAiStep(0)
    setAiStart(null)
    setAiFinish(null)
    setAiStyle(null)
    setAiFlow([])
    setShowSaveInput(false)
    setSavedConfirm(false)
  }

  // Handle save
  const handleSavePlan = (name: string, description: string, pathModeStr: string, techniques: FlowTech[]) => {
    savePlan(name, description, pathModeStr, techniques)
    const updated: SavedPlan[] = JSON.parse(localStorage.getItem('romrx_game_plans') || '[]')
    setSavedPlans(updated)
    setSavedConfirm(true)
    setShowSaveInput(false)
    setTimeout(() => setSavedConfirm(false), 3000)
  }

  const handleDeletePlan = (id: string) => {
    const updated = savedPlans.filter(p => p.id !== id)
    localStorage.setItem('romrx_game_plans', JSON.stringify(updated))
    setSavedPlans(updated)
  }

  const handleLoadPlan = (plan: SavedPlan) => {
    setLoadedPlan(plan)
    setTab('gameplan')
    setGenMode('quick')
    setPathMode(null)
    setQuickFlow([])
  }

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
  const customComplete = customPicks.every(p => p !== null)

  // Convert quick flow to VisualFlow steps
  const quickFlowSteps: VisualFlowStep[] = seq.map((cat, i) => ({
    tech: quickFlow[i] ? eligToFlowTech(quickFlow[i]) : null,
    category: cat,
  }))

  // Convert custom picks to VisualFlow steps
  const customFlowSteps: VisualFlowStep[] = seq.map((cat, i) => ({
    tech: customPicks[i] ? eligToFlowTech(customPicks[i]!) : null,
    category: cat,
  }))

  // Convert AI flow to VisualFlow steps
  const aiFlowSteps: VisualFlowStep[] = aiFlow.map(t => ({
    tech: t,
    category: t.category,
  }))

  // Convert loaded plan to VisualFlow steps
  const loadedFlowSteps: VisualFlowStep[] = loadedPlan
    ? loadedPlan.techniques.map(t => ({ tech: t, category: t.category }))
    : []

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
        {([
          ['gameplan', 'Game Plan'],
          ['myflows',  'My Flows'],
          ['library',  'Technique Library'],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('flex-1 text-sm font-semibold py-2 rounded-xl transition-all',
              tab === t ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal-light hover:text-charcoal'
            )}>{label}</button>
        ))}
      </div>

      {/* ── GAME PLAN ── */}
      {tab === 'gameplan' && (
        <div className="space-y-4">

          {/* Loaded plan banner */}
          {loadedPlan && (
            <div className="bg-teal-light rounded-2xl p-4 flex items-center justify-between gap-3 border border-teal/20">
              <div>
                <p className="text-sm font-bold text-teal">Loaded: {loadedPlan.name}</p>
                <p className="text-xs text-teal/70 mt-0.5">{loadedPlan.description}</p>
              </div>
              <button
                onClick={() => setLoadedPlan(null)}
                className="shrink-0 text-xs text-teal font-semibold bg-white px-3 py-1.5 rounded-xl border border-teal/20"
              >
                Clear
              </button>
            </div>
          )}

          {/* Loaded plan VisualFlow */}
          {loadedPlan && (
            <div className="space-y-3">
              <VisualFlow steps={loadedFlowSteps} eligibility={eligibility} />
            </div>
          )}

          {!loadedPlan && (
            <>
              {/* Generator mode toggle — 3 pills */}
              <div className="flex gap-1.5 bg-surface rounded-2xl p-1">
                {([
                  ['ai',     'AI Build',     Wand2],
                  ['quick',  'Quick Flow',   RefreshCw],
                  ['custom', 'Build My Own', PenLine],
                ] as const).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setGenMode(mode)
                      setPathMode(null)
                      setQuickFlow([])
                      setCustomPicks([null, null, null, null])
                      if (mode === 'ai') resetAIWizard()
                    }}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-all',
                      genMode === mode
                        ? 'bg-white text-charcoal shadow-sm'
                        : 'text-charcoal-light hover:text-charcoal'
                    )}
                  >
                    <Icon size={13} />
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>

              {/* ── AI BUILD ── */}
              {genMode === 'ai' && (
                <div className="space-y-5">
                  {aiStep < 3 && (
                    <div className="space-y-4">
                      {/* Progress indicator */}
                      <div className="flex items-center gap-2">
                        {[0, 1, 2].map(s => (
                          <div key={s} className="flex items-center gap-2">
                            <div className={cn(
                              'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                              s === aiStep ? 'bg-teal text-white' :
                              s < aiStep  ? 'bg-teal/20 text-teal' :
                                            'bg-surface text-charcoal-light'
                            )}>
                              {s < aiStep ? <Check size={10} /> : s + 1}
                            </div>
                            {s < 2 && <div className={cn('flex-1 h-0.5 w-8', s < aiStep ? 'bg-teal/30' : 'bg-surface')} />}
                          </div>
                        ))}
                        <span className="text-xs text-charcoal-light ml-1">
                          {aiStep === 0 ? 'Starting position' : aiStep === 1 ? 'Preferred finish' : 'Your style'}
                        </span>
                      </div>

                      {/* Step 1: Starting position */}
                      {aiStep === 0 && (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-charcoal">Where do you usually start?</p>
                          <div className="grid grid-cols-1 gap-3">
                            {([
                              ['standing', 'Standing', 'I pull guard or fight for takedowns', Swords] as const,
                              ['ontop',    'On Top',   'I look to pass and control',           Shield] as const,
                              ['onbottom', 'On Bottom','I play guard',                          Shield] as const,
                            ]).map(([val, label, sub, Icon]) => (
                              <button
                                key={val}
                                onClick={() => { setAiStart(val); setAiStep(1) }}
                                className={cn(
                                  'flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                                  aiStart === val
                                    ? 'border-teal bg-teal text-white'
                                    : 'border-teal-light bg-white hover:border-teal/40'
                                )}
                              >
                                <Icon
                                  size={22}
                                  className={cn(aiStart === val ? 'text-white' : 'text-teal', val === 'onbottom' ? 'rotate-180' : '')}
                                />
                                <div>
                                  <p className="font-bold text-sm">{label}</p>
                                  <p className={cn('text-xs mt-0.5', aiStart === val ? 'text-white/80' : 'text-charcoal-light')}>{sub}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Step 2: Preferred finish */}
                      {aiStep === 1 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setAiStep(0)} className="text-charcoal-light hover:text-charcoal">
                              <ChevronLeft size={16} />
                            </button>
                            <p className="text-sm font-semibold text-charcoal">What is your go-to finish?</p>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {([
                              ['chokes', 'Chokes',      'Rear naked, triangle, guillotine',  CircleDot,  null]         as const,
                              ['arm',    'Arm Attacks',  'Armbar, kimura, americana',         Zap,        null]         as const,
                              ['legs',   'Leg Attacks',  'Heel hook, kneebar, ankle lock',    Footprints, 'Blue belt+ only'] as const,
                            ]).map(([val, label, sub, Icon, note]) => (
                              <button
                                key={val}
                                onClick={() => { setAiFinish(val); setAiStep(2) }}
                                className={cn(
                                  'flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                                  aiFinish === val
                                    ? 'border-teal bg-teal text-white'
                                    : 'border-teal-light bg-white hover:border-teal/40'
                                )}
                              >
                                <Icon size={22} className={aiFinish === val ? 'text-white' : 'text-teal'} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-sm">{label}</p>
                                    {note && (
                                      <span className={cn(
                                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                                        aiFinish === val ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
                                      )}>{note}</span>
                                    )}
                                  </div>
                                  <p className={cn('text-xs mt-0.5', aiFinish === val ? 'text-white/80' : 'text-charcoal-light')}>{sub}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Step 3: Style */}
                      {aiStep === 2 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setAiStep(1)} className="text-charcoal-light hover:text-charcoal">
                              <ChevronLeft size={16} />
                            </button>
                            <p className="text-sm font-semibold text-charcoal">Your game style?</p>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {([
                              ['explosive', 'Explosive', 'Physical, aggressive, fast-paced',  Flame] as const,
                              ['technical', 'Technical', 'Patient, methodical, position-first', Brain] as const,
                            ]).map(([val, label, sub, Icon]) => (
                              <button
                                key={val}
                                onClick={() => setAiStyle(val)}
                                className={cn(
                                  'flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                                  aiStyle === val
                                    ? 'border-teal bg-teal text-white'
                                    : 'border-teal-light bg-white hover:border-teal/40'
                                )}
                              >
                                <Icon size={22} className={aiStyle === val ? 'text-white' : 'text-teal'} />
                                <div>
                                  <p className="font-bold text-sm">{label}</p>
                                  <p className={cn('text-xs mt-0.5', aiStyle === val ? 'text-white/80' : 'text-charcoal-light')}>{sub}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                          {/* Generate button appears after selecting style */}
                          {aiStyle !== null && (
                            <button
                              onClick={() => {
                                if (aiStart && aiFinish && aiStyle) {
                                  generateAIFlow(aiStart, aiFinish, aiStyle)
                                }
                              }}
                              className="w-full py-3 rounded-2xl bg-teal text-white font-bold text-sm hover:bg-teal/90 transition-colors flex items-center justify-center gap-2"
                            >
                              <Star size={15} />
                              Generate My Game Plan
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI result */}
                  {aiStep === 3 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-base font-bold text-charcoal">{aiPlanName}</p>
                          <p className="text-xs text-charcoal-light mt-0.5">AI-generated game plan</p>
                        </div>
                        <button
                          onClick={resetAIWizard}
                          className="flex items-center gap-1.5 text-xs font-semibold text-teal bg-teal-light px-3 py-2 rounded-xl hover:bg-teal/20 transition-colors"
                        >
                          <ChevronLeft size={12} /> Rebuild
                        </button>
                      </div>

                      {/* Description */}
                      <div className="bg-surface rounded-2xl p-4">
                        <p className="text-xs text-charcoal-light leading-relaxed">{aiDescription}</p>
                      </div>

                      {/* Visual flow */}
                      <VisualFlow steps={aiFlowSteps} eligibility={eligibility} />

                      {/* Action buttons */}
                      <div className="flex flex-col gap-2">
                        {!showSaveInput && !savedConfirm && (
                          <button
                            onClick={() => { setSavingPlanName(aiPlanName); setShowSaveInput(true) }}
                            className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-teal/90 transition-colors"
                          >
                            <Bookmark size={14} />
                            Save This Plan
                          </button>
                        )}
                        {showSaveInput && (
                          <div className="space-y-2">
                            <input
                              value={savingPlanName}
                              onChange={e => setSavingPlanName(e.target.value)}
                              className="w-full px-4 py-2.5 text-sm rounded-xl border border-teal-light focus:outline-none focus:border-teal bg-white"
                              placeholder="Name your game plan..."
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  handleSavePlan(savingPlanName || aiPlanName, aiDescription, 'ai', aiFlow)
                                }}
                                className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90"
                              >
                                Confirm Save
                              </button>
                              <button
                                onClick={() => setShowSaveInput(false)}
                                className="px-4 py-2 rounded-xl border border-teal-light text-sm text-charcoal-light hover:bg-surface"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        {savedConfirm && (
                          <div className="flex items-center gap-2 py-2.5 px-4 bg-teal-light rounded-xl text-teal text-sm font-semibold">
                            <Check size={14} /> Plan saved to My Flows
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (aiStart && aiFinish && aiStyle) {
                                generateAIFlow(aiStart, aiFinish, aiStyle)
                              }
                            }}
                            className="flex-1 py-2 rounded-xl border border-teal-light text-sm font-semibold text-charcoal hover:bg-surface flex items-center justify-center gap-2"
                          >
                            <RefreshCw size={13} /> Regenerate
                          </button>
                          <button
                            onClick={() => {
                              const url = window.location.href + '#plan=' + btoa(JSON.stringify({ name: aiPlanName, techniques: aiFlow }))
                              navigator.clipboard.writeText(url)
                            }}
                            className="flex-1 py-2 rounded-xl border border-teal-light text-sm font-semibold text-charcoal hover:bg-surface flex items-center justify-center gap-2"
                          >
                            <Share2 size={13} /> Share
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── QUICK FLOW ── */}
              {genMode === 'quick' && (
                <div className="space-y-4">
                  <p className="text-xs text-charcoal-light text-center">
                    Pick your starting position and ROMRx generates a flow using your GREEN and YELLOW techniques.
                  </p>

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

                  {quickFlow.length > 0 && pathMode && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-charcoal">{pathMode === 'offense' ? 'Offense' : 'Defense'} Flow</p>
                          <p className="text-xs text-charcoal-light">GREEN + YELLOW only</p>
                        </div>
                        <button onClick={quickRegenerate}
                          className="flex items-center gap-1.5 text-xs font-semibold text-teal bg-teal-light px-3 py-2 rounded-xl hover:bg-teal/20 transition-colors">
                          <RefreshCw size={12} /> New Flow
                        </button>
                      </div>

                      <VisualFlow steps={quickFlowSteps} eligibility={eligibility} />

                      {/* Save quick flow */}
                      {!showSaveInput && !savedConfirm && (
                        <button
                          onClick={() => {
                            setSavingPlanName(pathMode === 'offense' ? 'Offense Flow' : 'Defense Flow')
                            setShowSaveInput(true)
                          }}
                          className="w-full py-2.5 rounded-xl border border-teal-light text-sm font-semibold text-charcoal hover:bg-surface flex items-center justify-center gap-2"
                        >
                          <Bookmark size={14} /> Save This Flow
                        </button>
                      )}
                      {showSaveInput && (
                        <div className="space-y-2">
                          <input
                            value={savingPlanName}
                            onChange={e => setSavingPlanName(e.target.value)}
                            className="w-full px-4 py-2.5 text-sm rounded-xl border border-teal-light focus:outline-none focus:border-teal bg-white"
                            placeholder="Name your flow..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const techs = quickFlowSteps
                                  .filter(s => s.tech !== null)
                                  .map(s => s.tech!)
                                handleSavePlan(savingPlanName, '', pathMode ?? 'offense', techs)
                              }}
                              className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90"
                            >
                              Confirm Save
                            </button>
                            <button
                              onClick={() => setShowSaveInput(false)}
                              className="px-4 py-2 rounded-xl border border-teal-light text-sm text-charcoal-light hover:bg-surface"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {savedConfirm && (
                        <div className="flex items-center gap-2 py-2.5 px-4 bg-teal-light rounded-xl text-teal text-sm font-semibold">
                          <Check size={14} /> Flow saved to My Flows
                        </div>
                      )}

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

                  {pathMode && (
                    <div className="space-y-3">
                      {seq.map((cat, i) => {
                        const eligible = eligibleInCat(eligibility, cat)
                        const fromPos = CAT_FROM[cat]
                        const toPos = CAT_TO[cat]
                        const isLast = i === seq.length - 1

                        return (
                          <div key={cat} className="space-y-1">
                            <PositionPill pos={fromPos} />
                            <ArrowDown size={14} className="text-charcoal-light mx-3 my-0" />

                            <p className="text-xs font-bold text-charcoal uppercase tracking-wide px-1 mb-1">
                              Step {i + 1} - {cat}
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

                      {/* Custom complete: show visual flow + save */}
                      {customComplete && (
                        <div className="space-y-3">
                          <div className="bg-teal-light rounded-2xl p-4 text-center space-y-1 border border-teal/20">
                            <CheckCircle2 size={20} className="text-teal mx-auto" />
                            <p className="text-sm font-bold text-teal">Flow complete</p>
                          </div>

                          <VisualFlow steps={customFlowSteps} eligibility={eligibility} />

                          {!showSaveInput && !savedConfirm && (
                            <button
                              onClick={() => {
                                setSavingPlanName(pathMode === 'offense' ? 'My Offense Build' : 'My Defense Build')
                                setShowSaveInput(true)
                              }}
                              className="w-full py-2.5 rounded-xl border border-teal-light text-sm font-semibold text-charcoal hover:bg-surface flex items-center justify-center gap-2"
                            >
                              <Bookmark size={14} /> Save This Flow
                            </button>
                          )}
                          {showSaveInput && (
                            <div className="space-y-2">
                              <input
                                value={savingPlanName}
                                onChange={e => setSavingPlanName(e.target.value)}
                                className="w-full px-4 py-2.5 text-sm rounded-xl border border-teal-light focus:outline-none focus:border-teal bg-white"
                                placeholder="Name your flow..."
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    const techs = customFlowSteps
                                      .filter(s => s.tech !== null)
                                      .map(s => s.tech!)
                                    handleSavePlan(savingPlanName, '', pathMode ?? 'offense', techs)
                                  }}
                                  className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90"
                                >
                                  Confirm Save
                                </button>
                                <button
                                  onClick={() => setShowSaveInput(false)}
                                  className="px-4 py-2 rounded-xl border border-teal-light text-sm text-charcoal-light hover:bg-surface"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                          {savedConfirm && (
                            <div className="flex items-center gap-2 py-2.5 px-4 bg-teal-light rounded-xl text-teal text-sm font-semibold">
                              <Check size={14} /> Flow saved to My Flows
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── MY FLOWS ── */}
      {tab === 'myflows' && (
        <div className="space-y-4">
          {savedPlans.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No saved game plans yet"
              description="Build one in the Game Plan tab."
            />
          ) : (
            <div className="space-y-3">
              {savedPlans.map(plan => (
                <SavedPlanCard
                  key={plan.id}
                  plan={plan}
                  onLoad={handleLoadPlan}
                  onDelete={handleDeletePlan}
                />
              ))}
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
