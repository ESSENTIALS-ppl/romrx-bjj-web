import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/EmptyState'
import { cn, beltColor } from '../lib/utils'
import { supabase } from '../lib/supabase'
import {
  Users, Flame, FileText, Search, X, Printer,
  ChevronDown, Save, AlertTriangle, ClipboardList,
  Zap, RotateCcw, BookOpen, ChevronRight,
  Award, Video, Dumbbell,
} from 'lucide-react'

// ── Constants ──────────────────────────────────────────────────────────────────
const COACH_ROSTER_URL   = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-coach-roster`
const COACH_ACTIONS_URL  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-actions`

const TYPE_LABEL: Record<string, string> = {
  T: 'Throws',
  P: 'Passes',
  G: 'Guards',
  S: 'Sweeps',
  C: 'Controls',
  X: 'Submissions',
}

const RAMP_STEPS = [
  { key: 'raise',      label: 'R — Raise',      minutes: '3 min',  field: 'raise_drills',      bg: 'bg-teal',         text: 'text-white' },
  { key: 'activate',   label: 'A — Activate',   minutes: '5 min',  field: 'activate_drills',   bg: 'bg-gold',         text: 'text-charcoal' },
  { key: 'mobilize',   label: 'M — Mobilize',   minutes: '5 min',  field: 'mobilize_drills',   bg: 'bg-charcoal',     text: 'text-white' },
  { key: 'potentiate', label: 'P — Potentiate', minutes: '7 min',  field: 'potentiate_drills', bg: 'bg-teal-dark',    text: 'text-white' },
] as const

const BELT_ORDER = ['white', 'blue', 'purple', 'brown', 'black']
const CATEGORIES = ['Throws', 'Guards', 'Passes', 'Sweeps', 'Controls', 'Submissions']

// ── Types ──────────────────────────────────────────────────────────────────────
interface AthleteGamePlan {
  id: string
  name: string
  path_mode: string
  techniques: Array<{ name: string; category: string }>
  created_at: string
}

interface AthleteRosterItem {
  id: string
  user_id?: string
  email: string
  name: string
  belt: string
  gym: string | null
  lastAssessmentDate: string | null
  techniques: { green: number; yellow: number; red: number; total: number }
  priorityJoints: Array<{ joint: string; gap: number; left: number; right: number }>
}

interface TechniqueWarmup {
  code: string
  technique_name: string
  belt: string
  technique_type: string
  primary_joints: string
  raise_drills: string
  activate_drills: string
  mobilize_drills: string
  potentiate_drills: string
}

interface TechniqueItem {
  code: string
  technique_name: string
  belt: string
  technique_type: string
  primary_joints: string
}

interface AthleteNote {
  id: string
  athlete_id: string
  note: string
  updated_at: string
}

type Tab = 'roster' | 'warmup' | 'notes'

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(iso: string | null): string {
  if (!iso) return 'Not yet assessed'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function jointDotColor(gap: number): string {
  if (gap >= 15) return 'bg-red-tier'
  if (gap >= 8)  return 'bg-gold'
  return 'bg-green-tier'
}

function formatJointName(j: string): string {
  return j.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function groupTechniques(techniques: TechniqueItem[]): Record<string, Record<string, TechniqueItem[]>> {
  const result: Record<string, Record<string, TechniqueItem[]>> = {}
  for (const t of techniques) {
    const belt = t.belt ?? 'White'
    const typeFull = TYPE_LABEL[t.technique_type] ?? t.technique_type
    if (!result[belt]) result[belt] = {}
    if (!result[belt][typeFull]) result[belt][typeFull] = []
    result[belt][typeFull].push(t)
  }
  return result
}

// ── Readiness ─────────────────────────────────────────────────────────────────
function getReadiness(t: { green: number; yellow: number; red: number; total: number }) {
  if (t.total === 0) return { label: 'No Data', color: 'gray' }
  const greenPct = t.green / t.total
  const redPct = t.red / t.total
  if (redPct > 0.6) return { label: 'AT RISK', color: 'red' }
  if (greenPct > 0.55) return { label: 'READY', color: 'green' }
  return { label: 'DEVELOPING', color: 'yellow' }
}

function readinessSortKey(item: AthleteRosterItem): number {
  const r = getReadiness(item.techniques)
  if (r.label === 'AT RISK') return 0
  if (r.label === 'DEVELOPING') return 1
  if (r.label === 'READY') return 2
  return 3
}

function ReadinessPill({ t }: { t: { green: number; yellow: number; red: number; total: number } }) {
  const r = getReadiness(t)
  const cls =
    r.color === 'red'    ? 'bg-red-tier-bg text-red-tier' :
    r.color === 'green'  ? 'bg-green-tier-bg text-green-tier' :
    r.color === 'yellow' ? 'bg-yellow-tier-bg text-yellow-tier' :
                           'bg-surface text-charcoal-light'
  return (
    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide', cls)}>
      {r.label}
    </span>
  )
}

// ── Belt Badge ─────────────────────────────────────────────────────────────────
function BeltBadge({ belt }: { belt: string }) {
  return (
    <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize', beltColor(belt.toLowerCase()))}>
      {belt}
    </span>
  )
}

// ── Technique Count Badges ─────────────────────────────────────────────────────
function TierCounts({ green, yellow, red }: { green: number; yellow: number; red: number }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      <span className="tier-green text-[11px] px-2 py-0.5 rounded-full">{green} G</span>
      <span className="tier-yellow text-[11px] px-2 py-0.5 rounded-full">{yellow} Y</span>
      <span className="tier-red    text-[11px] px-2 py-0.5 rounded-full">{red} R</span>
    </div>
  )
}

// ── Priority Joint Flag ────────────────────────────────────────────────────────
function JointFlag({
  joint,
  gap,
  onDismiss,
}: {
  joint: string
  gap: number
  onDismiss: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs bg-surface rounded-xl px-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn('w-2 h-2 rounded-full shrink-0', jointDotColor(gap))} />
        <span className="text-charcoal font-medium truncate">{formatJointName(joint)}</span>
        <span className="text-charcoal-light shrink-0">{gap}deg</span>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 text-charcoal-light hover:text-charcoal transition-colors"
        aria-label="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// ── Inline Note Editor ─────────────────────────────────────────────────────────
function InlineNoteEditor({
  athleteId,
  initialNote,
  session,
  onClose,
}: {
  athleteId: string
  initialNote: string
  session: { access_token: string } | null
  onClose: () => void
}) {
  const [note, setNote] = useState(initialNote)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (!session) return
    setSaving(true)
    try {
      await fetch(COACH_ACTIONS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'save_note', athlete_id: athleteId, note }),
      })
      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 1200)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={3}
        placeholder="Add a coaching note..."
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors resize-none"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
        >
          {saved ? '✓ Saved' : saving ? 'Saving...' : <><Save size={12} /> Save Note</>}
        </button>
      </div>
    </div>
  )
}

// ── Promote Dialog ─────────────────────────────────────────────────────────────
function PromoteDialog({
  athlete,
  onPromote,
  onClose,
}: {
  athlete: AthleteRosterItem
  onPromote: (belt: string) => Promise<void>
  onClose: () => void
}) {
  const currentIdx = BELT_ORDER.indexOf(athlete.belt.toLowerCase())
  const options = BELT_ORDER.slice(currentIdx + 1)
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  async function handlePromote() {
    if (!selected) return
    setSaving(true)
    try {
      await onPromote(selected)
      setMsg({ type: 'ok', text: `Promoted to ${selected}!` })
      setTimeout(onClose, 1500)
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Promotion failed' })
    } finally {
      setSaving(false)
    }
  }

  if (options.length === 0) {
    return (
      <div className="mt-3 border-t border-teal-light pt-3 text-xs text-charcoal-light">
        {athlete.name} is already at the highest belt rank.
        <button onClick={onClose} className="ml-2 text-teal hover:underline">Close</button>
      </div>
    )
  }

  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <p className="text-xs font-semibold text-charcoal">Promote to:</p>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(b => (
          <button
            key={b}
            onClick={() => setSelected(b)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-bold uppercase transition-all',
              beltColor(b),
              selected === b ? 'ring-2 ring-offset-1 ring-teal' : 'opacity-60 hover:opacity-90'
            )}
          >
            {b}
          </button>
        ))}
      </div>
      {msg && (
        <p className={cn('text-xs', msg.type === 'ok' ? 'text-green-tier' : 'text-red-tier')}>{msg.text}</p>
      )}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">
          Cancel
        </button>
        <button
          onClick={handlePromote}
          disabled={!selected || saving}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving ? 'Promoting...' : <><Award size={12} /> Confirm Promotion</>}
        </button>
      </div>
    </div>
  )
}

// ── Assign Drill Form ──────────────────────────────────────────────────────────
function AssignDrillForm({
  athlete,
  coachId,
  onClose,
}: {
  athlete: AthleteRosterItem
  coachId: string
  onClose: () => void
}) {
  const [techniqueName, setTechniqueName] = useState('')
  const [category, setCategory] = useState('Throws')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit() {
    if (!techniqueName.trim()) { setErr('Technique name is required.'); return }
    if (!athlete.user_id) { setErr('Athlete user ID not found.'); return }
    setSaving(true)
    setErr(null)
    const { error } = await supabase.from('coach_assignments').insert({
      coach_id: coachId,
      athlete_user_id: athlete.user_id,
      technique_name: techniqueName.trim(),
      category,
      note: note.trim() || null,
    })
    setSaving(false)
    if (error) {
      setErr(error.message)
    } else {
      setSaved(true)
      setTimeout(onClose, 1200)
    }
  }

  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <p className="text-xs font-semibold text-charcoal">Assign Drill to {athlete.name}</p>
      <input
        type="text"
        value={techniqueName}
        onChange={e => setTechniqueName(e.target.value)}
        placeholder="Technique name (required)"
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors"
      />
      <select
        value={category}
        onChange={e => setCategory(e.target.value)}
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors"
      >
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={2}
        placeholder="Optional note for athlete..."
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none"
      />
      {err && <p className="text-xs text-red-tier">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || saved}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
        >
          {saved ? '✓ Assigned!' : saving ? 'Saving...' : <><Dumbbell size={12} /> Assign Drill</>}
        </button>
      </div>
    </div>
  )
}

// ── Add Video Form ─────────────────────────────────────────────────────────────
function AddVideoForm({
  athlete,
  coachId,
  onClose,
}: {
  athlete: AthleteRosterItem
  coachId: string
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function validateUrl(u: string) {
    return u.startsWith('https://youtu.be') || u.startsWith('https://www.youtube.com')
  }

  async function handleSubmit() {
    if (!title.trim()) { setErr('Title is required.'); return }
    if (!url.trim() || !validateUrl(url.trim())) { setErr('Please enter a valid YouTube URL (https://youtu.be/... or https://www.youtube.com/...).'); return }
    if (!athlete.user_id) { setErr('Athlete user ID not found.'); return }
    setSaving(true)
    setErr(null)
    const { error } = await supabase.from('coach_video_feedback').insert({
      coach_id: coachId,
      athlete_user_id: athlete.user_id,
      youtube_url: url.trim(),
      title: title.trim(),
      notes: notes.trim() || null,
    })
    setSaving(false)
    if (error) {
      setErr(error.message)
    } else {
      setSaved(true)
      setTimeout(onClose, 1200)
    }
  }

  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <p className="text-xs font-semibold text-charcoal">Add Video for {athlete.name}</p>
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Video title (required)"
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors"
      />
      <input
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="YouTube URL (required)"
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors"
      />
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        placeholder="Optional notes..."
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none"
      />
      {err && <p className="text-xs text-red-tier">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || saved}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
        >
          {saved ? '✓ Added!' : saving ? 'Saving...' : <><Video size={12} /> Add Video</>}
        </button>
      </div>
    </div>
  )
}

// ── Athlete Game Plans ────────────────────────────────────────────────────────
// athleteId here is the athletes.id (PK), not auth user_id
function AthleteGamePlans({ athleteId }: { athleteId: string }) {
  const [plans, setPlans] = useState<AthleteGamePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    setLoading(true)
    // Resolve user_id from athletes table, then query game_plans
    supabase
      .from('athletes')
      .select('user_id')
      .eq('id', athleteId)
      .maybeSingle()
      .then(({ data: athleteRow }) => {
        const userId = athleteRow?.user_id
        if (!userId) {
          setPlans([])
          setLoading(false)
          return
        }
        return supabase
          .from('game_plans')
          .select('id, name, path_mode, techniques, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(3)
          .then(({ data }) => {
            setPlans((data as AthleteGamePlan[]) ?? [])
            setLoading(false)
          })
      })
  }, [athleteId, expanded])

  return (
    <div className="border-t border-teal-light pt-3">
      <button
        onClick={() => setExpanded(o => !o)}
        className="flex items-center justify-between w-full text-xs font-semibold text-charcoal-light hover:text-charcoal transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen size={12} className="text-teal" />
          Game Plans
        </span>
        <ChevronRight size={12} className={cn('transition-transform', expanded && 'rotate-90')} />
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {loading ? (
            <p className="text-xs text-charcoal-light py-2">Loading...</p>
          ) : plans.length === 0 ? (
            <p className="text-xs text-charcoal-light py-1">No game plans saved yet.</p>
          ) : (
            plans.map(plan => (
              <div key={plan.id} className="bg-surface rounded-xl px-3 py-2 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-xs font-semibold text-charcoal leading-snug truncate">{plan.name}</p>
                    {plan.path_mode === 'competition' && (
                      <span className="shrink-0 text-[9px] font-bold bg-red-tier text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                        COMP
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-charcoal-light shrink-0">
                    {new Date(plan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                {plan.techniques && plan.techniques.length > 0 && (
                  <p className="text-[10px] text-charcoal-light leading-relaxed">
                    {plan.techniques.map((t) => t.name).join(' \u2192 ')}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Athlete Card ───────────────────────────────────────────────────────────────
function AthleteCard({
  athlete,
  session,
  coachId,
  drillCount,
  protocolCount,
  onBeltUpdate,
}: {
  athlete: AthleteRosterItem
  session: { access_token: string } | null
  coachId: string | null
  drillCount: number
  protocolCount: number
  onBeltUpdate: (userId: string, newBelt: string) => void
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [noteOpen, setNoteOpen] = useState(false)
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [assignDrillOpen, setAssignDrillOpen] = useState(false)
  const [addVideoOpen, setAddVideoOpen] = useState(false)

  const visibleJoints = athlete.priorityJoints
    .filter(j => !dismissed.has(j.joint))
    .slice(0, 3)

  async function handlePromote(newBelt: string) {
    const { data, error } = await supabase.rpc('coach_promote_athlete', {
      p_athlete_user_id: athlete.user_id,
      p_new_belt: newBelt,
    })
    if (error) throw new Error(error.message)
    if (data?.ok === false) throw new Error(data?.error ?? 'Promotion failed')
    if (athlete.user_id) onBeltUpdate(athlete.user_id, newBelt)
  }

  function closeAll() {
    setNoteOpen(false)
    setPromoteOpen(false)
    setAssignDrillOpen(false)
    setAddVideoOpen(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-teal-light p-4 flex flex-col gap-3 hover:border-teal/40 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-charcoal leading-snug truncate">{athlete.name}</p>
          <p className="text-xs text-charcoal-light truncate">{athlete.email}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <BeltBadge belt={athlete.belt} />
          <ReadinessPill t={athlete.techniques} />
        </div>
      </div>

      {/* Last assessment */}
      <div className="flex items-center gap-1.5">
        {athlete.lastAssessmentDate ? (
          <span className="text-xs text-charcoal-light">
            Assessed: <span className="font-medium text-charcoal">{formatDate(athlete.lastAssessmentDate)}</span>
          </span>
        ) : (
          <span className="text-xs font-semibold text-gold bg-gold/10 px-2 py-0.5 rounded-full">Not yet assessed</span>
        )}
        {drillCount > 0 && (
          <span className="text-[10px] bg-teal-light text-teal px-2 py-0.5 rounded-full font-medium">
            {drillCount} drill{drillCount !== 1 ? 's' : ''} logged
          </span>
        )}
        <span className={cn(
          'text-[10px] px-2 py-0.5 rounded-full font-medium',
          protocolCount >= 5 ? 'bg-green-tier-bg text-green-tier' :
          protocolCount >= 3 ? 'bg-yellow-tier-bg text-yellow-tier' :
          'bg-surface text-charcoal-light'
        )}>
          {protocolCount}/7 ROM sessions
        </span>
      </div>

      {/* Technique tiers */}
      <TierCounts
        green={athlete.techniques.green}
        yellow={athlete.techniques.yellow}
        red={athlete.techniques.red}
      />

      {/* Priority joints */}
      {visibleJoints.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle size={10} className="text-gold" /> Priority Joints
          </p>
          {visibleJoints.map(j => (
            <JointFlag
              key={j.joint}
              joint={j.joint}
              gap={j.gap}
              onDismiss={() => setDismissed(d => new Set([...d, j.joint]))}
            />
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => { closeAll(); setNoteOpen(o => !o) }}
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
            noteOpen
              ? 'bg-charcoal text-white'
              : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100'
          )}
        >
          <FileText size={12} />
          {noteOpen ? 'Close Notes' : 'Notes'}
        </button>

        {coachId && athlete.user_id && (
          <>
            <button
              onClick={() => { closeAll(); setPromoteOpen(o => !o) }}
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
                promoteOpen
                  ? 'bg-charcoal text-white'
                  : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100'
              )}
            >
              <Award size={12} />
              Promote
            </button>
            <button
              onClick={() => { closeAll(); setAssignDrillOpen(o => !o) }}
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
                assignDrillOpen
                  ? 'bg-teal text-white'
                  : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100'
              )}
            >
              <Dumbbell size={12} />
              Assign Drill
            </button>
            <button
              onClick={() => { closeAll(); setAddVideoOpen(o => !o) }}
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
                addVideoOpen
                  ? 'bg-teal text-white'
                  : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100'
              )}
            >
              <Video size={12} />
              Add Video
            </button>
          </>
        )}
      </div>

      {noteOpen && (
        <InlineNoteEditor
          athleteId={athlete.id}
          initialNote=""
          session={session}
          onClose={() => setNoteOpen(false)}
        />
      )}

      {promoteOpen && coachId && (
        <PromoteDialog
          athlete={athlete}
          onPromote={handlePromote}
          onClose={() => setPromoteOpen(false)}
        />
      )}

      {assignDrillOpen && coachId && (
        <AssignDrillForm
          athlete={athlete}
          coachId={coachId}
          onClose={() => setAssignDrillOpen(false)}
        />
      )}

      {addVideoOpen && coachId && (
        <AddVideoForm
          athlete={athlete}
          coachId={coachId}
          onClose={() => setAddVideoOpen(false)}
        />
      )}

      {/* Game Plans */}
      <AthleteGamePlans athleteId={athlete.id} />
    </div>
  )
}

// ── RAMP Card ─────────────────────────────────────────────────────────────────
function RampCard({
  label,
  minutes,
  drills,
  bg,
  text,
}: {
  label: string
  minutes: string
  drills: string
  bg: string
  text: string
}) {
  const items = drills.split(';').map(s => s.trim()).filter(Boolean)
  return (
    <div className={cn('rounded-2xl p-4 flex flex-col gap-2', bg, text)}>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest opacity-75">{minutes}</p>
        <p className="font-display font-bold text-base leading-tight">{label}</p>
      </div>
      <ul className="space-y-1">
        {items.map((drill, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-snug">
            <span className="opacity-60 shrink-0 mt-0.5">-</span>
            <span>{drill}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── TAB: ROSTER ────────────────────────────────────────────────────────────────
function RosterTab({
  roster,
  setRoster,
  loading,
  session,
  coachId,
  drillCounts,
  protocolCounts,
}: {
  roster: AthleteRosterItem[]
  setRoster: React.Dispatch<React.SetStateAction<AthleteRosterItem[]>>
  loading: boolean
  session: { access_token: string } | null
  coachId: string | null
  drillCounts: Record<string, number>
  protocolCounts: Record<string, number>
}) {
  const [search, setSearch] = useState('')

  const sorted = [...roster].sort((a, b) => readinessSortKey(a) - readinessSortKey(b))
  const filtered = sorted.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase())
  )

  function handleBeltUpdate(userId: string, newBelt: string) {
    setRoster(prev => prev.map(a => a.user_id === userId ? { ...a, belt: newBelt } : a))
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search athletes..."
          className="w-full pl-8 pr-4 py-2 text-sm rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No athletes found"
          description={search ? 'Try a different name.' : 'No athletes on your roster yet.'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(a => (
            <AthleteCard
              key={a.id}
              athlete={a}
              session={session}
              coachId={coachId}
              drillCount={a.user_id ? (drillCounts[a.user_id] ?? 0) : 0}
              protocolCount={a.user_id ? (protocolCounts[a.user_id] ?? 0) : 0}
              onBeltUpdate={handleBeltUpdate}
            />
          ))}
        </div>
      )}

      {/* Data disclosure note */}
      <p className="text-xs text-charcoal-light text-center pt-2">
        Athletes are informed that their full ROM data is visible to their connected coach per the ROMRxBJJ Terms of Service.
      </p>
    </div>
  )
}

// ── TAB: WARMUP GENERATOR ──────────────────────────────────────────────────────
function WarmupTab({ session }: { session: { access_token: string } | null }) {
  const [techniques, setTechniques] = useState<TechniqueItem[]>([])
  const [loadingTechs, setLoadingTechs] = useState(true)
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [warmup, setWarmup] = useState<TechniqueWarmup | null>(null)
  const [loadingWarmup, setLoadingWarmup] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const authHeaders = useCallback(() => ({
    'Authorization': `Bearer ${session?.access_token ?? ''}`,
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  }), [session])

  useEffect(() => {
    if (!session) return
    setLoadingTechs(true)
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'list_techniques' }),
    })
      .then(r => r.json())
      .then(data => setTechniques(Array.isArray(data) ? data : data.techniques ?? []))
      .catch(() => setTechniques([]))
      .finally(() => setLoadingTechs(false))
  }, [session, authHeaders])

  async function handleSelectCode(code: string) {
    setSelectedCode(code)
    setDropdownOpen(false)
    if (!code || !session) return
    setLoadingWarmup(true)
    setWarmup(null)
    try {
      const res = await fetch(COACH_ACTIONS_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action: 'get_warmup', code }),
      })
      const data = await res.json()
      setWarmup(data?.warmup ?? data ?? null)
    } catch {
      setWarmup(null)
    } finally {
      setLoadingWarmup(false)
    }
  }

  const grouped = groupTechniques(techniques)
  const beltOrder = ['White', 'Blue', 'Purple', 'Brown', 'Black']
  const selectedTech = techniques.find(t => t.code === selectedCode)

  if (loadingTechs) return <Spinner />

  return (
    <div className="space-y-4">
      {/* Dropdown */}
      <SectionCard title="Select Technique">
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className={cn(
              'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all',
              selectedCode
                ? 'border-teal bg-teal/5'
                : 'border-teal-light bg-white hover:border-teal/30'
            )}
          >
            <span className={cn('text-sm', selectedCode ? 'text-charcoal font-semibold' : 'text-charcoal-light')}>
              {selectedCode ? (selectedTech?.technique_name ?? selectedCode) : 'Choose a technique...'}
            </span>
            <ChevronDown
              size={14}
              className={cn('text-charcoal-light transition-transform shrink-0', dropdownOpen && 'rotate-180')}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-teal-light shadow-lg overflow-hidden max-h-72 overflow-y-auto">
              {techniques.length === 0 ? (
                <div className="px-4 py-3 text-xs text-charcoal-light">No techniques available.</div>
              ) : (
                beltOrder.map(belt => {
                  const types = grouped[belt]
                  if (!types) return null
                  return (
                    <div key={belt}>
                      <div className="px-4 py-2 bg-surface border-b border-teal-light/50 sticky top-0">
                        <span className={cn('text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full', beltColor(belt.toLowerCase()))}>
                          {belt} Belt
                        </span>
                      </div>
                      {Object.entries(types).map(([typeName, items]) => (
                        <div key={typeName}>
                          <div className="px-4 py-1.5 bg-surface/50">
                            <span className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wider">{typeName}</span>
                          </div>
                          {items.map(t => (
                            <button
                              key={t.code}
                              onClick={() => handleSelectCode(t.code)}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface transition-colors border-b border-teal-light/30 last:border-0',
                                selectedCode === t.code && 'bg-teal/5'
                              )}
                            >
                              <span className="text-[10px] font-mono text-charcoal-light w-14 shrink-0">{t.code}</span>
                              <span className="text-sm text-charcoal leading-snug">{t.technique_name}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Warmup display */}
      {loadingWarmup && <Spinner />}

      {!loadingWarmup && warmup && (
        <div className="space-y-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display font-bold text-charcoal text-base">{warmup.technique_name}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <BeltBadge belt={warmup.belt} />
                {warmup.primary_joints.split(',').map(j => j.trim()).filter(Boolean).map(j => (
                  <span key={j} className="text-[11px] bg-teal-light text-teal px-2 py-0.5 rounded-full font-medium">
                    {formatJointName(j)}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-charcoal bg-surface hover:bg-gray-100 px-3 py-2 rounded-xl transition-colors border border-teal-light"
            >
              <Printer size={13} /> Print
            </button>
          </div>

          {/* RAMP cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {RAMP_STEPS.map(step => (
              <RampCard
                key={step.key}
                label={step.label}
                minutes={step.minutes}
                drills={(warmup as unknown as Record<string, string>)[step.field] ?? ''}
                bg={step.bg}
                text={step.text}
              />
            ))}
          </div>
        </div>
      )}

      {!loadingWarmup && !warmup && selectedCode && (
        <EmptyState
          icon={Flame}
          title="No warmup found"
          description="No RAMP warmup data is available for this technique yet."
        />
      )}

      {!selectedCode && (
        <EmptyState
          icon={Zap}
          title="Select a technique"
          description="Choose a technique above to generate its RAMP warmup protocol."
        />
      )}
    </div>
  )
}

// ── TAB: NOTES ─────────────────────────────────────────────────────────────────
function NoteCard({
  note,
  athleteName,
  session,
}: {
  note: AthleteNote
  athleteName: string
  session: { access_token: string } | null
}) {
  const [text, setText] = useState(note.note)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (!session) return
    setSaving(true)
    try {
      await fetch(COACH_ACTIONS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'save_note', athlete_id: note.athlete_id, note: text }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-charcoal">{athleteName}</p>
          <span className="text-xs text-charcoal-light">
            {new Date(note.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            {saved ? '✓ Saved' : saving ? 'Saving...' : <><Save size={12} /> Save</>}
          </button>
        </div>
      </div>
    </SectionCard>
  )
}

function NotesTab({
  roster,
  session,
}: {
  roster: AthleteRosterItem[]
  session: { access_token: string } | null
}) {
  const [notes, setNotes] = useState<AthleteNote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'get_notes' }),
    })
      .then(r => r.json())
      .then(data => setNotes(Array.isArray(data) ? data : data.notes ?? []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false))
  }, [session])

  const rosterMap = Object.fromEntries(roster.map(a => [a.id, a.name]))

  if (loading) return <Spinner />

  if (notes.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No notes yet"
        description="Use the Notes button on each athlete card to add coaching notes."
      />
    )
  }

  return (
    <div className="space-y-3">
      {notes.map(n => (
        <NoteCard
          key={n.id}
          note={n}
          athleteName={rosterMap[n.athlete_id] ?? 'Unknown Athlete'}
          session={session}
        />
      ))}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function CoachDashboard() {
  const { session, user } = useAuth()
  const [tab, setTab] = useState<Tab>('roster')
  const [roster, setRoster] = useState<AthleteRosterItem[]>([])
  const [rosterLoading, setRosterLoading] = useState(true)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [drillCounts, setDrillCounts] = useState<Record<string, number>>({})
  const [protocolCounts, setProtocolCounts] = useState<Record<string, number>>({})

  // Load coach row on mount
  useEffect(() => {
    if (!user) return
    supabase.from('coaches').select('id').eq('user_id', user.id).single()
      .then(({ data }) => { if (data) setCoachId(data.id) })
  }, [user])

  // Fetch roster on mount
  useEffect(() => {
    if (!session) return
    setRosterLoading(true)
    fetch(COACH_ROSTER_URL, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    })
      .then(r => r.json())
      .then(data => setRoster(Array.isArray(data) ? data : data.roster ?? []))
      .catch(() => setRoster([]))
      .finally(() => setRosterLoading(false))
  }, [session])

  // Load drill session counts after roster loads
  useEffect(() => {
    if (roster.length === 0) return
    const userIds = roster.map(a => a.user_id).filter(Boolean) as string[]
    if (userIds.length === 0) return

    async function loadDrillCounts() {
      const counts: Record<string, number> = {}
      await Promise.all(
        userIds.map(async uid => {
          const { count } = await supabase
            .from('drill_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', uid)
          counts[uid] = count ?? 0
        })
      )
      setDrillCounts(counts)
    }
    loadDrillCounts()
  }, [roster])

  // Load protocol session counts (last 7 days) after roster loads
  useEffect(() => {
    if (roster.length === 0) return
    const userIds = roster.map(a => a.user_id).filter(Boolean) as string[]
    if (userIds.length === 0) return
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    async function loadProtocolCounts() {
      const { data } = await supabase
        .from('protocol_sessions')
        .select('user_id')
        .in('user_id', userIds)
        .gte('session_date', sevenDaysAgo)
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        counts[row.user_id] = (counts[row.user_id] ?? 0) + 1
      }
      setProtocolCounts(counts)
    }
    loadProtocolCounts()
  }, [roster])

  const tabs: Array<{ id: Tab; label: string; icon: typeof Users }> = [
    { id: 'roster',  label: 'Roster',           icon: Users },
    { id: 'warmup',  label: 'Warmup Generator', icon: RotateCcw },
    { id: 'notes',   label: 'Notes',            icon: FileText },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Coach Dashboard"
        subtitle={rosterLoading ? 'Loading...' : `${roster.length} athlete${roster.length !== 1 ? 's' : ''}`}
      />

      {/* Tab selector */}
      <div className="flex gap-1 bg-surface rounded-2xl p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold py-2 rounded-xl transition-all',
              tab === id
                ? 'bg-white text-charcoal shadow-sm'
                : 'text-charcoal-light hover:text-charcoal'
            )}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'roster' && (
        <RosterTab
          roster={roster}
          setRoster={setRoster}
          loading={rosterLoading}
          session={session}
          coachId={coachId}
          drillCounts={drillCounts}
          protocolCounts={protocolCounts}
        />
      )}
      {tab === 'warmup' && (
        <WarmupTab session={session} />
      )}
      {tab === 'notes' && (
        <NotesTab roster={roster} session={session} />
      )}
    </div>
  )
}
