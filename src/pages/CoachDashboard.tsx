import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/EmptyState'
import { cn, beltColor } from '../lib/utils'
import {
  Users, Flame, FileText, Search, X, Printer,
  ChevronDown, Save, AlertTriangle, ClipboardList,
  Zap, RotateCcw,
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

// ── Types ──────────────────────────────────────────────────────────────────────
interface AthleteRosterItem {
  id: string
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
        <span className="text-charcoal-light shrink-0">{gap}°</span>
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
        placeholder="Add a coaching note…"
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
          {saved ? '✓ Saved' : saving ? 'Saving…' : <><Save size={12} /> Save Note</>}
        </button>
      </div>
    </div>
  )
}

// ── Athlete Card ───────────────────────────────────────────────────────────────
function AthleteCard({
  athlete,
  session,
}: {
  athlete: AthleteRosterItem
  session: { access_token: string } | null
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [noteOpen, setNoteOpen] = useState(false)

  const visibleJoints = athlete.priorityJoints
    .filter(j => !dismissed.has(j.joint))
    .slice(0, 3)

  return (
    <div className="bg-white rounded-2xl border border-teal-light p-4 flex flex-col gap-3 hover:border-teal/40 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-charcoal leading-snug truncate">{athlete.name}</p>
          <p className="text-xs text-charcoal-light truncate">{athlete.email}</p>
        </div>
        <BeltBadge belt={athlete.belt} />
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

      {/* Notes button + editor */}
      <div>
        <button
          onClick={() => setNoteOpen(o => !o)}
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

        {noteOpen && (
          <InlineNoteEditor
            athleteId={athlete.id}
            initialNote=""
            session={session}
            onClose={() => setNoteOpen(false)}
          />
        )}
      </div>
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
            <span className="opacity-60 shrink-0 mt-0.5">•</span>
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
  loading,
  session,
}: {
  roster: AthleteRosterItem[]
  loading: boolean
  session: { access_token: string } | null
}) {
  const [search, setSearch] = useState('')

  const filtered = roster.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search athletes…"
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
            <AthleteCard key={a.id} athlete={a} session={session} />
          ))}
        </div>
      )}
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
              {selectedCode ? (selectedTech?.technique_name ?? selectedCode) : 'Choose a technique…'}
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
            {saved ? '✓ Saved' : saving ? 'Saving…' : <><Save size={12} /> Save</>}
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
  const { session } = useAuth()
  const [tab, setTab] = useState<Tab>('roster')
  const [roster, setRoster] = useState<AthleteRosterItem[]>([])
  const [rosterLoading, setRosterLoading] = useState(true)

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

  const tabs: Array<{ id: Tab; label: string; icon: typeof Users }> = [
    { id: 'roster',  label: 'Roster',           icon: Users },
    { id: 'warmup',  label: 'Warmup Generator', icon: RotateCcw },
    { id: 'notes',   label: 'Notes',            icon: FileText },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Coach Dashboard"
        subtitle={rosterLoading ? 'Loading…' : `${roster.length} athlete${roster.length !== 1 ? 's' : ''}`}
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
        <RosterTab roster={roster} loading={rosterLoading} session={session} />
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
