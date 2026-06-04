import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
  Zap, GraduationCap, BookOpen, ChevronRight,
  Award, Video, Dumbbell, NotebookPen, Plus, CheckCircle2,
  Syringe, ShieldPlus, ChevronLeft, ChevronRight as ChevronR,
  Trophy, Target, Calendar, Scale, Check, Info,
} from 'lucide-react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts'

// ── Constants ──────────────────────────────────────────────────────────────────
const COACH_ROSTER_URL  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-coach-roster`
const COACH_ACTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-actions`

const TYPE_LABEL: Record<string, string> = {
  T: 'Takedowns', P: 'Passes', G: 'Guards', S: 'Sweeps', C: 'Controls', X: 'Submissions',
}

const RAMP_STEPS = [
  { key: 'raise',      label: 'R — Raise',      minutes: '3 min', field: 'raise_drills',      bg: 'bg-teal',      text: 'text-white' },
  { key: 'activate',   label: 'A — Activate',   minutes: '5 min', field: 'activate_drills',   bg: 'bg-gold',      text: 'text-charcoal' },
  { key: 'mobilize',   label: 'M — Mobilize',   minutes: '5 min', field: 'mobilize_drills',   bg: 'bg-charcoal',  text: 'text-white' },
  { key: 'potentiate', label: 'P — Potentiate', minutes: '7 min', field: 'potentiate_drills', bg: 'bg-teal-dark', text: 'text-white' },
] as const

const BELT_ORDER = ['white', 'blue', 'purple', 'brown', 'black']
const CATEGORIES = ['Takedowns', 'Guards', 'Passes', 'Sweeps', 'Controls', 'Submissions']

const BODY_PARTS = ['Shoulder', 'Knee', 'Ankle', 'Wrist', 'Neck', 'Hip', 'Elbow', 'Finger/Hand', 'Rib', 'Back', 'Other']
const MECHANISMS = ['Tap late', 'Hard landing', 'Drilling', 'Overuse', 'Unknown']
const SIDES = ['Left', 'Right', 'Both', 'N/A']

const CUE_SECTION_META = [
  { prefix: 'Why it works:', emoji: '💡', label: 'Why It Works',  bg: 'bg-teal/10',     border: 'border-teal/20',    text: 'text-teal' },
  { prefix: 'Verbal cue:',   emoji: '🗣',  label: 'Verbal Cue',   bg: 'bg-gold/10',     border: 'border-gold/20',    text: 'text-gold' },
  { prefix: 'Visual demo:',  emoji: '👁',  label: 'Visual Demo',  bg: 'bg-sky-50',      border: 'border-sky-200',    text: 'text-sky-700' },
  { prefix: 'Tactile cue:',  emoji: '🤲', label: 'Tactile Cue',  bg: 'bg-violet-50',   border: 'border-violet-200', text: 'text-violet-700' },
  { prefix: 'Common error:', emoji: '⚠️', label: 'Common Error', bg: 'bg-red-50',      border: 'border-red-200',    text: 'text-red-tier' },
  { prefix: 'Fix:',          emoji: '✅', label: 'The Fix',      bg: 'bg-green-50',    border: 'border-green-200',  text: 'text-green-tier' },
]

// ── Types ──────────────────────────────────────────────────────────────────────
interface AthleteGamePlan {
  id: string; name: string; path_mode: string
  techniques: Array<{ name: string; category: string }>; created_at: string
}
interface AthleteRosterItem {
  id: string; user_id?: string; email: string; name: string; belt: string; gym: string | null
  lastAssessmentDate: string | null
  techniques: { green: number; yellow: number; red: number; total: number }
  priorityJoints: Array<{ joint: string; gap: number; left: number; right: number }>
}
interface TechniqueWarmup {
  code: string; technique_name: string; belt: string; technique_type: string; primary_joints: string
  raise_drills: string; activate_drills: string; mobilize_drills: string; potentiate_drills: string
  coaching_cue: string | null; submission_type: string | null
}
interface TechniqueItem {
  code: string; technique_name: string; belt: string; technique_type: string; primary_joints: string; submission_type?: string | null
}
interface AthleteNote {
  id: string; athlete_id: string; note: string; updated_at: string
}
interface JointDetail {
  joint: string; display: string; actual: number | null
  side: string; severity: 'minor' | 'moderate' | 'significant' | null
}
interface TechniqueReadinessItem {
  user_id: string; name: string; belt: string; tier: string
  joint_details: JointDetail[]; injuries: Array<{ body_part: string; stage: number }>
}
interface TeachingEntry {
  id: string; technique_code: string; technique_name: string; technique_type: string; notes: string | null; taught_at: string
}
interface CompetitorRecord {
  id: string; athlete_user_id: string; is_ready: boolean
  next_comp_name: string | null; next_comp_date: string | null
  weight_class: string | null; weight_unit: string
  current_weight: number | null; target_weight: number | null
  marked_ready_at: string
}
interface ActiveInjury { body_part: string; stage: number; status: string }
interface AttendanceInfo {
  lastSeen: string | null      // ISO date of most recent class_date
  presentToday: boolean        // checked in for CURRENT_DATE
  classes30d: number           // distinct class_dates in last 30 days
}

type Tab = 'team' | 'coaching' | 'competitions' | 'injury' | 'school'
type TeamSubTab = 'roster' | 'notes'
type CoachingSubTab = 'technique' | 'journal'

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
    const belt = t.belt ? (t.belt.charAt(0).toUpperCase() + t.belt.slice(1)) : 'White'
    const typeFull = t.technique_type === 'X' && t.submission_type
      ? `Submissions - ${t.submission_type}`
      : (TYPE_LABEL[t.technique_type] ?? t.technique_type)
    if (!result[belt]) result[belt] = {}
    if (!result[belt][typeFull]) result[belt][typeFull] = []
    result[belt][typeFull].push(t)
  }
  return result
}
function parseCue(cueText: string) {
  const result: Array<{ prefix: string; text: string; emoji: string; label: string; bg: string; border: string; text2: string }> = []
  for (const s of CUE_SECTION_META) {
    const idx = cueText.indexOf(s.prefix)
    if (idx === -1) continue
    const start = idx + s.prefix.length
    let end = cueText.length
    for (const other of CUE_SECTION_META) {
      if (other.prefix === s.prefix) continue
      const oIdx = cueText.indexOf(other.prefix, idx + 1)
      if (oIdx !== -1 && oIdx < end) end = oIdx
    }
    result.push({ prefix: s.prefix, text: cueText.slice(start, end).trim(), emoji: s.emoji, label: s.label, bg: s.bg, border: s.border, text2: s.text })
  }
  return result
}

// ── Readiness ─────────────────────────────────────────────────────────────────
function getReadiness(t: { green: number; yellow: number; red: number; total: number }) {
  if (t.total === 0) return { label: 'No Data', color: 'gray' }
  const greenPct = t.green / t.total
  const redPct = t.red / t.total
  if (redPct > 0.6)   return { label: 'AT RISK',    color: 'red' }
  if (greenPct > 0.55) return { label: 'READY',     color: 'green' }
  return { label: 'DEVELOPING', color: 'yellow' }
}
// ── Attendance ────────────────────────────────────────────────────────────────
const AT_RISK_DAYS = 14   // no attendance in this many days => at-risk
function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso + 'T00:00:00')
  const now = new Date()
  const ms = now.setHours(0, 0, 0, 0) - then.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round(ms / 86_400_000))
}
function lastSeenLabel(iso: string | null): string {
  const d = daysSince(iso)
  if (d === null) return 'Never checked in'
  if (d === 0) return 'Last seen today'
  if (d === 1) return 'Last seen yesterday'
  return `Last seen ${d}d ago`
}
function isAtRisk(info: AttendanceInfo | undefined): boolean {
  if (!info) return false
  const d = daysSince(info.lastSeen)
  return d === null || d >= AT_RISK_DAYS
}
function AtRiskBadge() {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide bg-red-tier-bg text-red-tier flex items-center gap-1">
      <AlertTriangle size={9} /> At Risk
    </span>
  )
}
// Local YYYY-MM-DD (matches what the coach sees, avoids UTC drift)
function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
// Optimistic state updaters for attendance map
function applyCheckIn(prev: Record<string, AttendanceInfo>, uid: string, today: string): Record<string, AttendanceInfo> {
  const cur = prev[uid]
  if (cur?.presentToday) return prev
  const lastSeen = cur && (cur.lastSeen ?? '') > today ? cur.lastSeen : today
  return { ...prev, [uid]: { lastSeen, presentToday: true, classes30d: (cur?.classes30d ?? 0) + 1 } }
}
function applyCheckOut(prev: Record<string, AttendanceInfo>, uid: string, today: string): Record<string, AttendanceInfo> {
  const cur = prev[uid]
  if (!cur?.presentToday) return prev
  // We don't know the previous lastSeen without a refetch; conservatively clear today's flag.
  const classes30d = Math.max(0, cur.classes30d - 1)
  const lastSeen = cur.lastSeen === today ? null : cur.lastSeen
  return { ...prev, [uid]: { lastSeen, presentToday: false, classes30d } }
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
function BeltBadge({ belt }: { belt: string }) {
  return (
    <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize', beltColor(belt.toLowerCase()))}>
      {belt}
    </span>
  )
}
function TierCounts({ green, yellow, red }: { green: number; yellow: number; red: number }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      <span className="tier-green text-[11px] px-2 py-0.5 rounded-full">{green} G</span>
      <span className="tier-yellow text-[11px] px-2 py-0.5 rounded-full">{yellow} Y</span>
      <span className="tier-red    text-[11px] px-2 py-0.5 rounded-full">{red} R</span>
    </div>
  )
}
function JointFlag({ joint, gap, onDismiss }: { joint: string; gap: number; onDismiss?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs bg-surface rounded-xl px-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn('w-2 h-2 rounded-full shrink-0', jointDotColor(gap))} />
        <span className="text-charcoal font-medium truncate">{formatJointName(joint)}</span>
        <span className="text-charcoal-light shrink-0">{gap}deg</span>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 text-charcoal-light hover:text-charcoal transition-colors" aria-label="Dismiss">
          <X size={12} />
        </button>
      )}
    </div>
  )
}

// ── Inline Note Editor ─────────────────────────────────────────────────────────
function InlineNoteEditor({ athleteId, initialNote, session, onClose, onSaved }: {
  athleteId: string; initialNote: string; session: { access_token: string } | null
  onClose: () => void; onSaved?: (note: string) => void
}) {
  const [note, setNote] = useState(initialNote)
  const [loading, setLoading] = useState(!initialNote)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load existing note if not provided
  useEffect(() => {
    if (initialNote || !session || !athleteId) { setLoading(false); return }
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_note_for_athlete', athlete_id: athleteId }),
    }).then(r => r.json()).then(d => { setNote(d.note ?? ''); setLoading(false) }).catch(() => setLoading(false))
  }, [athleteId, session, initialNote])

  async function handleSave() {
    if (!session) return
    setSaving(true)
    try {
      await fetch(COACH_ACTIONS_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_note', athlete_id: athleteId, note }),
      })
      setSaved(true)
      onSaved?.(note)
      setTimeout(() => { setSaved(false); onClose() }, 1400)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="mt-3 border-t border-teal-light pt-3"><Spinner /></div>
  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Add a coaching note..."
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors resize-none" />
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving || saved} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
          {saved ? '✓ Saved' : saving ? 'Saving...' : <><Save size={12} /> Save Note</>}
        </button>
      </div>
    </div>
  )
}

// ── Promote Dialog ─────────────────────────────────────────────────────────────
function PromoteDialog({ athlete, attendance, onPromote, onClose }: {
  athlete: AthleteRosterItem; attendance: AttendanceInfo | undefined
  onPromote: (belt: string) => Promise<void>; onClose: () => void
}) {
  const currentIdx = BELT_ORDER.indexOf(athlete.belt.toLowerCase())
  const options = BELT_ORDER.slice(currentIdx + 1)
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Eligibility signals (informational only — coach always decides)
  const classes30d = attendance?.classes30d ?? 0
  const seenDays = daysSince(attendance?.lastSeen ?? null)
  const readiness = getReadiness(athlete.techniques)
  const matActive = seenDays !== null && seenDays < AT_RISK_DAYS
  const consistentMat = classes30d >= 8           // ~2x/wk over a month
  const romReady = readiness.label === 'READY'
  const signals = [
    { ok: matActive,      label: matActive ? `On the mat (${lastSeenLabel(attendance?.lastSeen ?? null).replace('Last seen ', '')})` : 'Inactive on the mat' },
    { ok: consistentMat,  label: `${classes30d} class${classes30d !== 1 ? 'es' : ''} in last 30d` },
    { ok: romReady,       label: `ROM readiness: ${readiness.label}` },
  ]

  async function handlePromote() {
    if (!selected) return
    setSaving(true)
    try {
      await onPromote(selected)
      setMsg({ type: 'ok', text: `Promoted to ${selected}!` })
      setTimeout(onClose, 1500)
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Promotion failed' })
    } finally { setSaving(false) }
  }

  if (options.length === 0) return (
    <div className="mt-3 border-t border-teal-light pt-3 text-xs text-charcoal-light">
      {athlete.name} is already at the highest belt rank.
      <button onClick={onClose} className="ml-2 text-teal hover:underline">Close</button>
    </div>
  )
  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      {/* Eligibility hint — informational, never blocks */}
      <div className="rounded-xl bg-surface px-3 py-2 space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-charcoal-light">Readiness signals</p>
        <div className="flex flex-col gap-1">
          {signals.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              {s.ok
                ? <CheckCircle2 size={12} className="text-green-tier shrink-0" />
                : <AlertTriangle size={12} className="text-gold shrink-0" />}
              <span className={cn(s.ok ? 'text-charcoal' : 'text-charcoal-light')}>{s.label}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-charcoal-light italic pt-0.5">Signals are guidance only — your call as the coach.</p>
      </div>
      <p className="text-xs font-semibold text-charcoal">Promote to:</p>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(b => (
          <button key={b} onClick={() => setSelected(b)}
            className={cn('px-3 py-1 rounded-full text-xs font-bold uppercase transition-all', beltColor(b), selected === b ? 'ring-2 ring-offset-1 ring-teal' : 'opacity-60 hover:opacity-90')}>
            {b}
          </button>
        ))}
      </div>
      {msg && <p className={cn('text-xs', msg.type === 'ok' ? 'text-green-tier' : 'text-red-tier')}>{msg.text}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
        <button onClick={handlePromote} disabled={!selected || saving} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
          {saving ? 'Promoting...' : <><Award size={12} /> Confirm Promotion</>}
        </button>
      </div>
    </div>
  )
}

// ── Assign Drill Form ──────────────────────────────────────────────────────────
function AssignDrillForm({ athlete, coachId, onClose }: { athlete: AthleteRosterItem; coachId: string; onClose: () => void }) {
  const [techniqueName, setTechniqueName] = useState('')
  const [category, setCategory] = useState('Takedowns')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit() {
    if (!techniqueName.trim()) { setErr('Technique name is required.'); return }
    if (!athlete.user_id) { setErr('Athlete user ID not found.'); return }
    setSaving(true); setErr(null)
    const { error } = await supabase.from('coach_assignments').insert({
      coach_id: coachId, athlete_user_id: athlete.user_id,
      technique_name: techniqueName.trim(), category, note: note.trim() || null,
    })
    setSaving(false)
    if (error) { setErr(error.message) } else { setSaved(true); setTimeout(onClose, 1200) }
  }

  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <p className="text-xs font-semibold text-charcoal">Assign Drill to {athlete.name}</p>
      <input type="text" value={techniqueName} onChange={e => setTechniqueName(e.target.value)} placeholder="Technique name (required)"
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors" />
      <select value={category} onChange={e => setCategory(e.target.value)}
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors">
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Optional note for athlete..."
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none" />
      {err && <p className="text-xs text-red-tier">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving || saved} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
          {saved ? '✓ Assigned!' : saving ? 'Saving...' : <><Dumbbell size={12} /> Assign Drill</>}
        </button>
      </div>
    </div>
  )
}

// ── Add Video Form ─────────────────────────────────────────────────────────────
function AddVideoForm({ athlete, coachId, onClose }: { athlete: AthleteRosterItem; coachId: string; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function validateUrl(u: string) { return u.startsWith('https://youtu.be') || u.startsWith('https://www.youtube.com') }

  async function handleSubmit() {
    if (!title.trim()) { setErr('Title is required.'); return }
    if (!url.trim() || !validateUrl(url.trim())) { setErr('Enter a valid YouTube URL.'); return }
    if (!athlete.user_id) { setErr('Athlete user ID not found.'); return }
    setSaving(true); setErr(null)
    const { error } = await supabase.from('coach_video_feedback').insert({
      coach_id: coachId, athlete_user_id: athlete.user_id,
      youtube_url: url.trim(), title: title.trim(), notes: notes.trim() || null,
    })
    setSaving(false)
    if (error) { setErr(error.message) } else { setSaved(true); setTimeout(onClose, 1200) }
  }

  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <p className="text-xs font-semibold text-charcoal">Add Video for {athlete.name}</p>
      <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Video title (required)"
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors" />
      <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube URL (required)"
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors" />
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..."
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none" />
      {err && <p className="text-xs text-red-tier">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving || saved} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
          {saved ? '✓ Added!' : saving ? 'Saving...' : <><Video size={12} /> Add Video</>}
        </button>
      </div>
    </div>
  )
}

// ── Injury Form ────────────────────────────────────────────────────────────────
function InjuryForm({ athlete, session, onClose }: {
  athlete: AthleteRosterItem; session: { access_token: string } | null; onClose: () => void
}) {
  const [bodyPart, setBodyPart] = useState('')
  const [severity, setSeverity] = useState(5)
  const [side, setSide] = useState('Unknown')
  const [mechanism, setMechanism] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit() {
    if (!bodyPart || !athlete.user_id || !session) { setErr('Select a body part'); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch(COACH_ACTIONS_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log_injury', athlete_user_id: athlete.user_id, body_part: bodyPart, severity, side, mechanism: mechanism || null, notes: notes.trim() || null }),
      })
      const data = await res.json()
      if (data.error) { setErr(data.error); return }
      setSaved(true)
      setTimeout(onClose, 1500)
    } finally { setSaving(false) }
  }

  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <p className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
        <Syringe size={12} className="text-red-tier" /> Report Injury — {athlete.name}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <select value={bodyPart} onChange={e => setBodyPart(e.target.value)}
          className="text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors">
          <option value="">Body part...</option>
          {BODY_PARTS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={side} onChange={e => setSide(e.target.value)}
          className="text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors">
          {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-charcoal-light shrink-0">Severity: {severity}/10</span>
        <input type="range" min={1} max={10} value={severity} onChange={e => setSeverity(Number(e.target.value))} className="flex-1 accent-teal" />
      </div>
      <select value={mechanism} onChange={e => setMechanism(e.target.value)}
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors">
        <option value="">Mechanism (optional)...</option>
        {MECHANISMS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..."
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none" />
      {err && <p className="text-xs text-red-tier">{err}</p>}
      {saved && <p className="text-xs text-green-tier flex items-center gap-1"><CheckCircle2 size={12} /> Injury logged. Stage 0 — Off Mat assigned.</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving || saved} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50 bg-red-tier hover:bg-red-tier/90">
          {saved ? '✓ Logged' : saving ? 'Saving...' : <><Syringe size={12} /> Log Injury</>}
        </button>
      </div>
    </div>
  )
}

// ── Athlete Game Plans ─────────────────────────────────────────────────────────
function AthleteGamePlans({ athleteUserId, session }: { athleteUserId: string; session: { access_token: string } | null }) {
  const [plans, setPlans] = useState<AthleteGamePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded || !athleteUserId || !session) return
    setLoading(true)
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_athlete_game_plans', athlete_user_id: athleteUserId }),
    }).then(r => r.json()).then(data => { setPlans(Array.isArray(data.plans) ? data.plans : []); setLoading(false) }).catch(() => setLoading(false))
  }, [athleteUserId, session, expanded])

  return (
    <div className="border-t border-teal-light pt-3">
      <button onClick={() => setExpanded(o => !o)} className="flex items-center justify-between w-full text-xs font-semibold text-charcoal-light hover:text-charcoal transition-colors">
        <span className="flex items-center gap-1.5"><BookOpen size={12} className="text-teal" /> Game Plans</span>
        <ChevronRight size={12} className={cn('transition-transform', expanded && 'rotate-90')} />
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {loading ? <p className="text-xs text-charcoal-light py-2">Loading...</p> :
           plans.length === 0 ? <p className="text-xs text-charcoal-light py-1">No game plans saved yet.</p> :
           plans.map(plan => (
            <div key={plan.id} className="bg-surface rounded-xl px-3 py-2 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-xs font-semibold text-charcoal leading-snug truncate">{plan.name}</p>
                  {plan.path_mode === 'competition' && (
                    <span className="shrink-0 text-[9px] font-bold bg-red-tier text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">COMP</span>
                  )}
                </div>
                <span className="text-[10px] text-charcoal-light shrink-0">{new Date(plan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              {plan.techniques && plan.techniques.length > 0 && (
                <p className="text-[10px] text-charcoal-light leading-relaxed">{plan.techniques.map(t => t.name).join(' \u2192 ')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Athlete Card ───────────────────────────────────────────────────────────────
function AthleteCard({ athlete, session, coachId, drillCount, protocolCount, onBeltUpdate, noteText, onNoteUpdated, isCompReady, compSaving, onToggleCompReady, attendance, attSaving, onToggleAttendance }: {
  athlete: AthleteRosterItem; session: { access_token: string } | null; coachId: string | null
  drillCount: number; protocolCount: number; onBeltUpdate: (userId: string, newBelt: string) => void
  noteText: string; onNoteUpdated: (athleteId: string, note: string) => void
  isCompReady: boolean; compSaving: boolean; onToggleCompReady: (athlete: AthleteRosterItem, next: boolean) => void
  attendance: AttendanceInfo | undefined; attSaving: boolean; onToggleAttendance: (athlete: AthleteRosterItem, present: boolean) => void
}) {
  const [noteOpen, setNoteOpen]           = useState(false)
  const [promoteOpen, setPromoteOpen]     = useState(false)
  const [assignDrillOpen, setAssignDrillOpen] = useState(false)
  const [addVideoOpen, setAddVideoOpen]   = useState(false)
  const [injuryOpen, setInjuryOpen]       = useState(false)

  const visibleJoints = athlete.priorityJoints.slice(0, 3)
  const readiness = getReadiness(athlete.techniques)
  const atRisk = isAtRisk(attendance)
  const presentToday = attendance?.presentToday ?? false
  const borderClass =
    atRisk                       ? 'border-red-tier/70' :
    readiness.color === 'red'    ? 'border-red-tier/70' :
    readiness.color === 'green'  ? 'border-green-tier/60' :
    readiness.color === 'yellow' ? 'border-gold/60' :
                                   'border-teal-light'

  async function handlePromote(newBelt: string) {
    const { data, error } = await supabase.rpc('coach_promote_athlete', { p_athlete_user_id: athlete.user_id, p_new_belt: newBelt })
    if (error) throw new Error(error.message)
    if (data?.ok === false) throw new Error(data?.error ?? 'Promotion failed')
    if (athlete.user_id) onBeltUpdate(athlete.user_id, newBelt)
  }

  function closeAll() { setNoteOpen(false); setPromoteOpen(false); setAssignDrillOpen(false); setAddVideoOpen(false); setInjuryOpen(false) }

  return (
    <div className={cn('bg-white rounded-2xl border-2 p-4 flex flex-col gap-3 transition-colors', borderClass)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-charcoal leading-snug truncate">{athlete.name}</p>
          <p className="text-xs text-charcoal-light truncate">{athlete.email}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <BeltBadge belt={athlete.belt} />
          {atRisk ? <AtRiskBadge /> : <ReadinessPill t={athlete.techniques} />}
        </div>
      </div>

      {/* Last assessment row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {athlete.lastAssessmentDate ? (
          <span className="text-xs text-charcoal-light">Assessed: <span className="font-medium text-charcoal">{formatDate(athlete.lastAssessmentDate)}</span></span>
        ) : (
          <span className="text-xs font-semibold text-gold bg-gold/10 px-2 py-0.5 rounded-full">Not yet assessed</span>
        )}
        {drillCount > 0 && <span className="text-[10px] bg-teal-light text-teal px-2 py-0.5 rounded-full font-medium">{drillCount} drill{drillCount !== 1 ? 's' : ''}</span>}
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium',
          protocolCount >= 5 ? 'bg-green-tier-bg text-green-tier' : protocolCount >= 3 ? 'bg-yellow-tier-bg text-yellow-tier' : 'bg-surface text-charcoal-light')}>
          {protocolCount}/7 ROM this wk
        </span>
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1',
          atRisk ? 'bg-red-tier-bg text-red-tier' : 'bg-surface text-charcoal-light')}>
          <Calendar size={9} /> {lastSeenLabel(attendance?.lastSeen ?? null)}
        </span>
      </div>

      {/* Technique tiers */}
      <TierCounts green={athlete.techniques.green} yellow={athlete.techniques.yellow} red={athlete.techniques.red} />

      {/* Note snippet */}
      {noteText && (
        <p className="text-[11px] text-charcoal-light bg-surface rounded-xl px-3 py-1.5 line-clamp-2 italic">
          "{noteText}"
        </p>
      )}

      {/* Priority joints */}
      {visibleJoints.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle size={10} className="text-gold" /> Priority Joints
          </p>
          {visibleJoints.map(j => <JointFlag key={j.joint} joint={j.joint} gap={j.gap} />)}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => { closeAll(); setNoteOpen(o => !o) }}
          className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
            noteOpen ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100')}>
          <FileText size={12} />{noteOpen ? 'Close Notes' : 'Notes'}
        </button>

        {coachId && athlete.user_id && (<>
          <button onClick={() => { closeAll(); setPromoteOpen(o => !o) }}
            className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
              promoteOpen ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100')}>
            <Award size={12} /> Promote
          </button>
          <button onClick={() => { closeAll(); setAssignDrillOpen(o => !o) }}
            className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
              assignDrillOpen ? 'bg-teal text-white' : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100')}>
            <Dumbbell size={12} /> Assign Drill
          </button>
          <button onClick={() => { closeAll(); setAddVideoOpen(o => !o) }}
            className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
              addVideoOpen ? 'bg-teal text-white' : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100')}>
            <Video size={12} /> Add Video
          </button>
          <button onClick={() => { closeAll(); setInjuryOpen(o => !o) }}
            className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
              injuryOpen ? 'bg-red-tier text-white' : 'bg-red-50 text-red-tier hover:bg-red-100')}>
            <Syringe size={12} /> Injury
          </button>
        </>)}
      </div>

      {/* One-tap check-in */}
      {coachId && athlete.user_id && (
        <button
          onClick={() => onToggleAttendance(athlete, !presentToday)}
          disabled={attSaving}
          aria-pressed={presentToday}
          className={cn(
            'w-full flex items-center justify-center gap-2 text-xs font-bold px-3 py-2 rounded-xl transition-all border-2 disabled:opacity-60',
            presentToday
              ? 'border-green-tier/60 bg-green-tier-bg text-green-tier'
              : 'border-dashed border-teal-light bg-surface text-charcoal-light hover:border-teal hover:text-teal'
          )}>
          {attSaving ? 'Saving…' : presentToday
            ? <><CheckCircle2 size={13} /> Present Today</>
            : <><Calendar size={13} /> Check In Today</>}
        </button>
      )}

      {/* Ready for Competition — highlight moment */}
      {coachId && athlete.user_id && (
        <button
          onClick={() => onToggleCompReady(athlete, !isCompReady)}
          disabled={compSaving}
          aria-pressed={isCompReady}
          className={cn(
            'group w-full flex items-center gap-2.5 rounded-2xl px-3 py-2.5 transition-all border-2 disabled:opacity-60',
            isCompReady
              ? 'border-gold bg-gradient-to-r from-gold/15 to-gold/5 shadow-sm'
              : 'border-dashed border-teal-light bg-surface hover:border-gold/50 hover:bg-gold/5'
          )}>
          <span className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all',
            isCompReady ? 'bg-gold text-white' : 'bg-white border-2 border-teal-light text-transparent group-hover:border-gold/60'
          )}>
            <Check size={15} strokeWidth={3} />
          </span>
          <span className="min-w-0 text-left">
            <span className={cn('flex items-center gap-1.5 text-xs font-bold leading-tight', isCompReady ? 'text-gold' : 'text-charcoal')}>
              {isCompReady ? <><Trophy size={12} /> Ready for Competition</> : 'Mark Ready for Competition'}
            </span>
            <span className="text-[10px] text-charcoal-light leading-tight">
              {compSaving ? 'Saving…' : isCompReady ? 'Showing in My Competitors' : 'Add to your competitors'}
            </span>
          </span>
        </button>
      )}

      {noteOpen && <InlineNoteEditor athleteId={athlete.id} initialNote={noteText} session={session} onClose={() => setNoteOpen(false)} onSaved={n => onNoteUpdated(athlete.id, n)} />}
      {promoteOpen && coachId && <PromoteDialog athlete={athlete} attendance={attendance} onPromote={handlePromote} onClose={() => setPromoteOpen(false)} />}
      {assignDrillOpen && coachId && <AssignDrillForm athlete={athlete} coachId={coachId} onClose={() => setAssignDrillOpen(false)} />}
      {addVideoOpen && coachId && <AddVideoForm athlete={athlete} coachId={coachId} onClose={() => setAddVideoOpen(false)} />}
      {injuryOpen && <InjuryForm athlete={athlete} session={session} onClose={() => setInjuryOpen(false)} />}
      <AthleteGamePlans athleteUserId={athlete.user_id ?? ''} session={session} />
    </div>
  )
}

// ── RAMP Card ──────────────────────────────────────────────────────────────────
function RampCard({ label, minutes, drills, bg, text }: { label: string; minutes: string; drills: string; bg: string; text: string }) {
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
            <span className="opacity-60 shrink-0 mt-0.5">-</span><span>{drill}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Coaching Cue Card (visual) ─────────────────────────────────────────────────
function CoachingCueCard({ cue }: { cue: string }) {
  const sections = parseCue(cue)
  if (sections.length === 0) return (
    <div className="mt-3 rounded-2xl border border-gold/40 bg-gold/10 p-4">
      <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <GraduationCap size={13} className="text-gold" /> Coaching Cue
      </p>
      <p className="text-xs text-charcoal leading-relaxed whitespace-pre-wrap">{cue}</p>
    </div>
  )
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-bold text-charcoal uppercase tracking-wide flex items-center gap-1.5">
        <GraduationCap size={13} className="text-gold" /> Coaching Cue
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sections.map((s, i) => (
          <div key={i} className={cn('rounded-xl border p-3', s.bg, s.border)}>
            <p className={cn('text-[10px] font-bold uppercase tracking-wide mb-1', s.text2)}>
              {s.emoji} {s.label}
            </p>
            <p className="text-xs text-charcoal leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Technique Readiness Panel ──────────────────────────────────────────────────
function TechniqueReadinessPanel({ session, code }: {
  session: { access_token: string } | null; code: string
}) {
  const [readiness, setReadiness] = useState<TechniqueReadinessItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session || !code) return
    setLoading(true)
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_technique_readiness', code }),
    }).then(r => r.json()).then(data => {
      setReadiness(Array.isArray(data.readiness) ? data.readiness : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [session, code])

  if (loading) return <div className="text-xs text-charcoal-light py-2 italic">Loading athlete readiness...</div>
  if (readiness.length === 0) return null

  return (
    <div className="mt-4 rounded-2xl border border-teal-light bg-white p-4">
      <div className="mb-3">
        <p className="text-xs font-bold text-charcoal uppercase tracking-wide flex items-center gap-1.5">
          <Users size={13} className="text-teal" /> Athlete Readiness
        </p>
      </div>
      <div className="space-y-3">
        {readiness.map(r => {
          const hasInjury = r.injuries.length > 0
          const tier = (r.tier ?? 'unassessed').toLowerCase()
          const tierBadgeColor =
            tier === 'green'  ? 'text-green-tier bg-green-tier-bg' :
            tier === 'yellow' ? 'text-gold bg-yellow-tier-bg' :
            tier === 'red'    ? 'text-red-tier bg-red-tier-bg' :
                                'text-charcoal-light bg-surface'
          const tierLabel = tier === 'green' ? 'READY' : tier === 'yellow' ? 'DEVELOPING' : tier === 'red' ? 'AT RISK' : 'UNASSESSED'
          const hasJointDetails = (r.joint_details ?? []).length > 0
          return (
            <div key={r.user_id} className={cn(
              'rounded-xl p-3 border',
              tier === 'red' ? 'border-red-tier/30 bg-red-50/50' :
              tier === 'yellow' ? 'border-gold/30 bg-gold/5' :
              tier === 'green' ? 'border-green-tier/30 bg-green-50/50' :
              'border-teal-light bg-surface'
            )}>
              {/* Athlete header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {hasInjury && <span title="Active injury">🩹</span>}
                  <span className="text-xs font-semibold text-charcoal truncate">{r.name}</span>
                  {hasInjury && (
                    <span className="text-[10px] text-red-tier bg-red-50 px-1.5 py-0.5 rounded-full shrink-0">
                      {r.injuries.map(i => i.body_part).join(', ')}
                    </span>
                  )}
                </div>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0', tierBadgeColor)}>
                  {tierLabel}
                </span>
              </div>

              {/* Joint limitation details - actual value + severity, NO threshold exposed */}
              {hasJointDetails && (
                <div className="mt-2 space-y-1">
                  {(r.joint_details ?? []).map(j => {
                    const sevColor =
                      j.severity === 'significant' ? 'text-red-tier' :
                      j.severity === 'moderate'    ? 'text-gold' :
                                                     'text-charcoal-light'
                    // Always show a label — fall back to 'limiting joint' if no threshold data
                    const sevLabel =
                      j.severity === 'significant' ? 'significant limitation' :
                      j.severity === 'moderate'    ? 'moderate limitation' :
                      j.severity === 'minor'       ? 'minor limitation' :
                                                     'limiting joint'
                    return (
                      <div key={j.joint} className="flex items-center gap-2 text-[11px] pl-1">
                        <span className="font-medium text-charcoal-light w-24 shrink-0">
                          {j.display}{j.side && j.side !== 'mid' ? ` (${j.side})` : ''}
                        </span>
                        {j.actual !== null && (
                          <span className="font-semibold text-charcoal">{j.actual}°</span>
                        )}
                        <span className={cn('font-medium', sevColor)}>— {sevLabel}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Green = all clear */}
              {tier === 'green' && (
                <p className="text-[11px] text-green-tier mt-1.5 pl-1">All ROM requirements met</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TAB: ROSTER ────────────────────────────────────────────────────────────────
function RosterTab({ roster, setRoster, loading, session, coachId, drillCounts, protocolCounts, noteMap, onNoteUpdated, compReadySet, compSavingSet, onToggleCompReady, attendanceMap, attendanceLoading, attSavingSet, onToggleAttendance, onMarkAllPresent }: {
  roster: AthleteRosterItem[]; setRoster: React.Dispatch<React.SetStateAction<AthleteRosterItem[]>>
  loading: boolean; session: { access_token: string } | null; coachId: string | null
  drillCounts: Record<string, number>; protocolCounts: Record<string, number>
  noteMap: Record<string, string>; onNoteUpdated: (athleteId: string, note: string) => void
  compReadySet: Set<string>; compSavingSet: Set<string>
  onToggleCompReady: (athlete: AthleteRosterItem, next: boolean) => void
  attendanceMap: Record<string, AttendanceInfo>; attendanceLoading: boolean
  attSavingSet: Set<string>
  onToggleAttendance: (athlete: AthleteRosterItem, present: boolean) => void
  onMarkAllPresent: (athletes: AthleteRosterItem[]) => void
}) {
  const [search, setSearch] = useState('')
  const sorted = [...roster].sort((a, b) => readinessSortKey(a) - readinessSortKey(b))
  const filtered = sorted.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()))

  function handleBeltUpdate(userId: string, newBelt: string) {
    setRoster(prev => prev.map(a => a.user_id === userId ? { ...a, belt: newBelt } : a))
  }

  // Attendance summary across the full roster (not filtered by search)
  const withUid = roster.filter(a => a.user_id)
  const presentToday = withUid.filter(a => attendanceMap[a.user_id!]?.presentToday).length
  const atRiskCount  = withUid.filter(a => isAtRisk(attendanceMap[a.user_id!])).length
  const allPresent   = withUid.length > 0 && presentToday === withUid.length
  const notYetPresent = filtered.filter(a => a.user_id && !attendanceMap[a.user_id]?.presentToday)

  if (loading) return <Spinner />
  return (
    <div className="space-y-4">
      {/* Attendance summary */}
      {coachId && withUid.length > 0 && (
        <div className="bg-white rounded-2xl border border-teal-light p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-green-tier-bg text-green-tier flex items-center justify-center shrink-0"><CheckCircle2 size={17} /></span>
                <div className="leading-tight">
                  <p className="text-lg font-bold text-charcoal">{presentToday}<span className="text-sm text-charcoal-light font-medium">/{withUid.length}</span></p>
                  <p className="text-[10px] uppercase tracking-wide text-charcoal-light font-semibold">Present today</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', atRiskCount > 0 ? 'bg-red-tier-bg text-red-tier' : 'bg-surface text-charcoal-light')}><AlertTriangle size={16} /></span>
                <div className="leading-tight">
                  <p className={cn('text-lg font-bold', atRiskCount > 0 ? 'text-red-tier' : 'text-charcoal')}>{atRiskCount}</p>
                  <p className="text-[10px] uppercase tracking-wide text-charcoal-light font-semibold">At risk ({AT_RISK_DAYS}d+)</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => onMarkAllPresent(notYetPresent)}
              disabled={attendanceLoading || allPresent || notYetPresent.length === 0}
              className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 disabled:opacity-50">
              <CheckCircle2 size={13} /> {allPresent ? 'All present' : `Mark all present${notYetPresent.length ? ` (${notYetPresent.length})` : ''}`}
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search athletes..."
          className="w-full pl-8 pr-4 py-2 text-sm rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white transition-colors" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No athletes found" description={search ? 'Try a different name.' : 'No athletes on your roster yet.'} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(a => (
            <AthleteCard key={a.id} athlete={a} session={session} coachId={coachId}
              drillCount={a.user_id ? (drillCounts[a.user_id] ?? 0) : 0}
              protocolCount={a.user_id ? (protocolCounts[a.user_id] ?? 0) : 0}
              onBeltUpdate={handleBeltUpdate}
              noteText={noteMap[a.id] ?? ''}
              onNoteUpdated={onNoteUpdated}
              isCompReady={a.user_id ? compReadySet.has(a.user_id) : false}
              compSaving={a.user_id ? compSavingSet.has(a.user_id) : false}
              onToggleCompReady={onToggleCompReady}
              attendance={a.user_id ? attendanceMap[a.user_id] : undefined}
              attSaving={a.user_id ? attSavingSet.has(a.user_id) : false}
              onToggleAttendance={onToggleAttendance}
            />
          ))}
        </div>
      )}
      <p className="text-xs text-charcoal-light text-center pt-2">
        Athletes are informed that their full ROM data is visible to their connected coach per the ROMRxBJJ Terms of Service.
      </p>
    </div>
  )
}

// ── TAB: COACHING (Warmup Generator + Cue + Readiness) ────────────────────────
function WarmupTab({ session, techniques, loadingTechs, selectedCode, setSelectedCode, warmup, setWarmup, onAddToJournal }: {
  session: { access_token: string } | null
  techniques: TechniqueItem[]; loadingTechs: boolean
  selectedCode: string; setSelectedCode: (c: string) => void
  warmup: TechniqueWarmup | null; setWarmup: (w: TechniqueWarmup | null) => void
  onAddToJournal: (code: string, name: string, type: string, notes: string) => void
}) {
  const [loadingWarmup, setLoadingWarmup] = useState(false)
  const [dropdownOpen, setDropdownOpen]   = useState(false)
  const [sessionNotes, setSessionNotes]   = useState('')
  const [loggedMsg, setLoggedMsg]         = useState('')

  const authHeaders = useCallback(() => ({
    'Authorization': `Bearer ${session?.access_token ?? ''}`,
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  }), [session])

  async function handleSelectCode(code: string) {
    setSelectedCode(code)
    setDropdownOpen(false)
    if (!code || !session) return
    setLoadingWarmup(true)
    setWarmup(null)
    try {
      const res = await fetch(COACH_ACTIONS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'get_warmup', code }) })
      const data = await res.json()
      setWarmup(data?.warmup ?? data ?? null)
    } catch { setWarmup(null) }
    finally { setLoadingWarmup(false) }
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
            className={cn('w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all',
              selectedCode ? 'border-teal bg-teal/5' : 'border-teal-light bg-white hover:border-teal/30')}>
            <span className={cn('text-sm', selectedCode ? 'text-charcoal font-semibold' : 'text-charcoal-light')}>
              {selectedCode ? (selectedTech?.technique_name ?? selectedCode) : 'Choose a technique...'}
            </span>
            <ChevronDown size={14} className={cn('text-charcoal-light transition-transform shrink-0', dropdownOpen && 'rotate-180')} />
          </button>

          {dropdownOpen && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-teal-light shadow-lg overflow-hidden max-h-72 overflow-y-auto">
              {techniques.length === 0 ? <div className="px-4 py-3 text-xs text-charcoal-light">No techniques available.</div> : (
                beltOrder.map(belt => {
                  const types = grouped[belt]
                  if (!types) return null
                  return (
                    <div key={belt}>
                      <div className="px-4 py-2 bg-surface border-b border-teal-light/50 sticky top-0">
                        <span className={cn('text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full', beltColor(belt.toLowerCase()))}>{belt} Belt</span>
                      </div>
                      {Object.entries(types).map(([typeName, items]) => (
                        <div key={typeName}>
                          <div className="px-4 py-1.5 bg-surface/50">
                            <span className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wider">{typeName}</span>
                          </div>
                          {items.map(t => (
                            <button key={t.code} onClick={() => handleSelectCode(t.code)}
                              className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface transition-colors border-b border-teal-light/30 last:border-0',
                                selectedCode === t.code && 'bg-teal/5')}>
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

      {loadingWarmup && <Spinner />}

      {!loadingWarmup && warmup && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display font-bold text-charcoal text-base">{warmup.technique_name}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <BeltBadge belt={warmup.belt} />
                {warmup.primary_joints.split(',').map(j => j.trim()).filter(Boolean).map(j => (
                  <span key={j} className="text-[11px] bg-teal-light text-teal px-2 py-0.5 rounded-full font-medium">{formatJointName(j)}</span>
                ))}
              </div>
            </div>
            <button onClick={() => window.print()} className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-charcoal bg-surface hover:bg-gray-100 px-3 py-2 rounded-xl transition-colors border border-teal-light">
              <Printer size={13} /> Print
            </button>
          </div>

          {/* RAMP cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {RAMP_STEPS.map(step => (
              <RampCard key={step.key} label={step.label} minutes={step.minutes}
                drills={(warmup as unknown as Record<string, string>)[step.field] ?? ''} bg={step.bg} text={step.text} />
            ))}
          </div>

          {/* Coaching Cue - visual sections */}
          {warmup.coaching_cue && <CoachingCueCard cue={warmup.coaching_cue} />}

          {/* Athlete Readiness for this technique */}
          <TechniqueReadinessPanel session={session} code={warmup.code} />

          {/* Session Notes */}
          <div className="mt-3 rounded-2xl border border-teal-light bg-white p-4 space-y-2">
            <p className="text-xs font-bold text-charcoal uppercase tracking-wide flex items-center gap-1.5">
              <FileText size={13} className="text-teal" /> Session Notes
            </p>
            <p className="text-[11px] text-charcoal-light">
              Optional notes for this session — included when you log to Journal below.
            </p>
            <textarea
              value={sessionNotes}
              onChange={e => setSessionNotes(e.target.value)}
              rows={3}
              placeholder="e.g. 8 athletes, 20 min drilling. Blue belts struggled with the entry timing..."
              className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors resize-none"
            />
          </div>

          {/* Add Session to Journal — standalone button below everything */}
          <div className="flex items-center justify-between gap-4">
            {loggedMsg ? (
              <p className="text-xs text-green-tier flex items-center gap-1.5">
                <CheckCircle2 size={12} /> {loggedMsg}
              </p>
            ) : <span />}
            <button
              onClick={() => {
                if (!warmup) return
                onAddToJournal(warmup.code, warmup.technique_name, warmup.technique_type, sessionNotes)
                setLoggedMsg(`Logged: ${warmup.technique_name}`)
                setSessionNotes('')
                setTimeout(() => setLoggedMsg(''), 3000)
              }}
              className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
            >
              <NotebookPen size={15} /> Add Session to Journal
            </button>
          </div>
        </div>
      )}

      {!loadingWarmup && !warmup && selectedCode && (
        <EmptyState icon={Flame} title="No warmup found" description="No RAMP warmup data available for this technique yet." />
      )}
      {!selectedCode && (
        <EmptyState icon={Zap} title="Select a technique" description="Choose a technique above to generate its RAMP warmup protocol." />
      )}
    </div>
  )
}

// ── TAB: JOURNAL ──────────────────────────────────────────────────────────────
const TYPE_FULL: Record<string, string> = { T: 'Takedowns', P: 'Passes', G: 'Guards', S: 'Sweeps', C: 'Controls', X: 'Submissions' }

function JournalTab({ session, pendingLog }: { session: { access_token: string } | null; pendingLog: { code: string; name: string; type: string; notes: string } | null }) {
  const [techniques, setTechniques]   = useState<TechniqueItem[]>([])
  const [selectedCode, setSelectedCode] = useState('')
  const [dropOpen, setDropOpen]       = useState(false)
  const [logNote, setLogNote]         = useState('')
  const [logging, setLogging]         = useState(false)
  const [logMsg, setLogMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [entries, setEntries]         = useState<TeachingEntry[]>([])
  const [counts, setCounts]           = useState<Record<string, number>>({})
  const [journalNote, setJournalNote] = useState('')
  const [savingNote, setSavingNote]   = useState(false)
  const [noteSaved, setNoteSaved]     = useState(false)
  const [loading, setLoading]         = useState(true)

  const authHeaders = useCallback(() => ({
    'Authorization': `Bearer ${session?.access_token ?? ''}`,
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  }), [session])

  useEffect(() => {
    if (!session) return
    setLoading(true)
    Promise.all([
      fetch(COACH_ACTIONS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'list_techniques' }) }).then(r => r.json()),
      fetch(COACH_ACTIONS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'get_teaching_log' }) }).then(r => r.json()),
      fetch(COACH_ACTIONS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'get_journal_note' }) }).then(r => r.json()),
    ]).then(([techData, logData, noteData]) => {
      setTechniques(Array.isArray(techData.techniques) ? techData.techniques : [])
      setEntries(Array.isArray(logData.entries) ? logData.entries : [])
      setCounts(logData.counts ?? {})
      setJournalNote(noteData.note ?? '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [session, authHeaders])

  // Handle pending log from Coaching tab "Add to Journal" (includes session notes)
  useEffect(() => {
    if (!pendingLog || !session) return
    const tech = { code: pendingLog.code, technique_name: pendingLog.name, technique_type: pendingLog.type }
    doLog(tech, pendingLog.notes || null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLog])

  async function doLog(tech: { code: string; technique_name: string; technique_type: string }, noteOverride: string | null) {
    if (!session) return
    setLogging(true); setLogMsg(null)
    try {
      const res = await fetch(COACH_ACTIONS_URL, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ action: 'log_technique_taught', technique_code: tech.code, technique_name: tech.technique_name, technique_type: tech.technique_type, notes: noteOverride }),
      })
      const data = await res.json()
      if (data.success && data.entry) {
        setEntries(prev => [data.entry, ...prev])
        setCounts(prev => ({ ...prev, [tech.technique_type]: (prev[tech.technique_type] ?? 0) + 1 }))
        setSelectedCode(''); setLogNote('')
        setLogMsg({ type: 'ok', text: `Logged: ${tech.technique_name}` })
        setTimeout(() => setLogMsg(null), 3000)
      } else {
        setLogMsg({ type: 'err', text: data.error ?? 'Failed to log' })
      }
    } finally { setLogging(false) }
  }

  async function handleLog() {
    const tech = techniques.find(t => t.code === selectedCode)
    if (!tech) return
    await doLog({ code: tech.code, technique_name: tech.technique_name, technique_type: tech.technique_type }, logNote.trim() || null)
  }

  async function handleSaveNote() {
    if (!session) return
    setSavingNote(true)
    try {
      await fetch(COACH_ACTIONS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'save_journal_note', note: journalNote }) })
      setNoteSaved(true); setTimeout(() => setNoteSaved(false), 2000)
    } finally { setSavingNote(false) }
  }

  const radarData = [
    { category: 'Takedowns',   value: counts['T'] ?? 0 },
    { category: 'Guards',      value: counts['G'] ?? 0 },
    { category: 'Passes',      value: counts['P'] ?? 0 },
    { category: 'Sweeps',      value: counts['S'] ?? 0 },
    { category: 'Controls',    value: counts['C'] ?? 0 },
    { category: 'Submissions', value: counts['X'] ?? 0 },
  ]
  const totalTaught = Object.values(counts).reduce((a, b) => a + b, 0)
  const grouped = groupTechniques(techniques)
  const beltOrder = ['White', 'Blue', 'Purple', 'Brown', 'Black']
  const selectedTech = techniques.find(t => t.code === selectedCode)

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      {logMsg && (
        <div className={cn('rounded-xl px-4 py-2 text-sm flex items-center gap-2', logMsg.type === 'ok' ? 'bg-green-tier-bg text-green-tier' : 'bg-red-50 text-red-tier')}>
          {logMsg.type === 'ok' && <CheckCircle2 size={14} />}{logMsg.text}
        </div>
      )}

      <SectionCard title="Log Technique Taught">
        <div className="space-y-3">
          <div className="relative">
            <button onClick={() => setDropOpen(o => !o)} className={cn('w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all',
              selectedCode ? 'border-teal bg-teal/5' : 'border-teal-light bg-white hover:border-teal/30')}>
              <span className={cn('text-sm', selectedCode ? 'text-charcoal font-semibold' : 'text-charcoal-light')}>
                {selectedCode ? (selectedTech?.technique_name ?? selectedCode) : 'Select a technique you taught...'}
              </span>
              <ChevronDown size={14} className={cn('text-charcoal-light shrink-0 transition-transform', dropOpen && 'rotate-180')} />
            </button>
            {dropOpen && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-teal-light shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                {beltOrder.map(belt => {
                  const types = grouped[belt]; if (!types) return null
                  return (
                    <div key={belt}>
                      <div className="px-4 py-2 bg-surface border-b border-teal-light/50 sticky top-0">
                        <span className={cn('text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full', beltColor(belt.toLowerCase()))}>{belt} Belt</span>
                      </div>
                      {Object.entries(types).map(([typeName, items]) => (
                        <div key={typeName}>
                          <div className="px-4 py-1.5 bg-surface/50"><span className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wider">{typeName}</span></div>
                          {items.map(t => (
                            <button key={t.code} onClick={() => { setSelectedCode(t.code); setDropOpen(false) }}
                              className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface transition-colors border-b border-teal-light/30 last:border-0', selectedCode === t.code && 'bg-teal/5')}>
                              <span className="text-sm text-charcoal">{t.technique_name}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <textarea value={logNote} onChange={e => setLogNote(e.target.value)} rows={2} placeholder="Session notes (optional)..."
            className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none" />
          <div className="flex justify-end">
            <button onClick={handleLog} disabled={!selectedCode || logging} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-50">
              <Plus size={12} /> Log It
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`Teaching Balance${totalTaught > 0 ? ` (${totalTaught} total)` : ''}`}>
        {totalTaught === 0 ? (
          <p className="text-xs text-charcoal-light py-4 text-center">Log techniques to see your category balance. A well-rounded coach teaches across all areas.</p>
        ) : (
          <div className="space-y-3">
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="#e2f0ee" />
                <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: '#4a5568', fontWeight: 600 }} />
                <Radar name="Techniques Taught" dataKey="value" stroke="#0d9488" fill="#0d9488" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center">
              {radarData.filter(d => d.value > 0).map(d => (
                <span key={d.category} className="text-[11px] bg-surface px-2 py-1 rounded-full">
                  <span className="font-semibold text-teal">{d.value}</span><span className="text-charcoal-light ml-1">{d.category}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {entries.length > 0 && (
        <SectionCard title="Recent Teaching Log">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {entries.slice(0, 20).map(e => (
              <div key={e.id} className="flex items-start justify-between gap-3 text-xs py-2 border-b border-teal-light/40 last:border-0">
                <div className="min-w-0">
                  <p className="font-semibold text-charcoal truncate">{e.technique_name}</p>
                  {e.notes && <p className="text-charcoal-light mt-0.5 truncate">{e.notes}</p>}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="text-[10px] bg-surface px-2 py-0.5 rounded-full text-charcoal-light font-medium">{TYPE_FULL[e.technique_type] ?? e.technique_type}</span>
                  <span className="text-[10px] text-charcoal-light">{new Date(e.taught_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Coach Notes">
        <div className="space-y-3">
          <textarea value={journalNote} onChange={e => setJournalNote(e.target.value)} rows={5}
            placeholder="Personal coaching notes, class plans, observations, goals..."
            className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors resize-none" />
          <div className="flex justify-end">
            <button onClick={handleSaveNote} disabled={savingNote || noteSaved} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
              {noteSaved ? <><CheckCircle2 size={12} /> Saved</> : savingNote ? 'Saving...' : <><Save size={12} /> Save Notes</>}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

// ── TAB: NOTES (per-athlete) ───────────────────────────────────────────────────
function NoteCard({ note, athleteName, session }: { note: AthleteNote; athleteName: string; session: { access_token: string } | null }) {
  const [text, setText] = useState(note.note)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  async function handleSave() {
    if (!session) return
    setSaving(true)
    try {
      await fetch(COACH_ACTIONS_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_note', athlete_id: note.athlete_id, note: text }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  return (
    <SectionCard>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-charcoal">{athleteName}</p>
          <span className="text-xs text-charcoal-light">{new Date(note.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
          className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors resize-none" />
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving || saved} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
            {saved ? '✓ Saved' : saving ? 'Saving...' : <><Save size={12} /> Save</>}
          </button>
        </div>
      </div>
    </SectionCard>
  )
}

function NotesTab({ roster, session }: { roster: AthleteRosterItem[]; session: { access_token: string } | null }) {
  const [notes, setNotes] = useState<AthleteNote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_notes' }),
    }).then(r => r.json()).then(data => setNotes(Array.isArray(data) ? data : data.notes ?? [])).catch(() => setNotes([])).finally(() => setLoading(false))
  }, [session])

  const rosterMap = Object.fromEntries(roster.map(a => [a.id, a.name]))

  if (loading) return <Spinner />
  if (notes.length === 0) return <EmptyState icon={ClipboardList} title="No notes yet" description="Use the Notes button on each athlete card to add coaching notes." />

  return (
    <div className="space-y-3">
      {notes.map(n => <NoteCard key={n.id} note={n} athleteName={rosterMap[n.athlete_id] ?? 'Unknown Athlete'} session={session} />)}
    </div>
  )
}

// ── Competition helpers ────────────────────────────────────────────────────
function weeksUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const ms = target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24 * 7))
}
// 8-week periodized prep phases (week-of-prep → focus)
function prepPhaseForWeeksOut(weeksOut: number): { phase: string; focus: string; color: string } {
  if (weeksOut >= 7) return { phase: 'Base',        focus: 'Volume, conditioning, mobility correction', color: 'bg-teal/15 text-teal' }
  if (weeksOut >= 5) return { phase: 'Build',        focus: 'Position sparring, gameplan reps',          color: 'bg-teal/15 text-teal' }
  if (weeksOut >= 3) return { phase: 'Sharpen',      focus: 'Hard rounds, competition simulation',        color: 'bg-gold/20 text-gold' }
  if (weeksOut >= 1) return { phase: 'Taper',        focus: 'Reduce volume, sharpen timing, recover',      color: 'bg-gold/20 text-gold' }
  return                     { phase: 'Comp Week',   focus: 'Rest, weight check, RAMP day-of',             color: 'bg-red-tier-bg text-red-tier' }
}
// ROM clearance signal: green light unless red-heavy ROM or active injury
function romClearance(t: { green: number; yellow: number; red: number; total: number }, hasActiveInjury: boolean):
  { label: string; color: string; cleared: boolean; reason: string } {
  if (t.total === 0) return { label: 'No ROM Data', color: 'bg-surface text-charcoal-light', cleared: false, reason: 'Athlete has not been assessed yet.' }
  if (hasActiveInjury) return { label: 'Hold — Active Injury', color: 'bg-red-tier-bg text-red-tier', cleared: false, reason: 'Active injury on return-to-mat protocol. Clear injury before competing.' }
  const redPct = t.red / t.total
  const greenPct = t.green / t.total
  if (redPct > 0.3) return { label: 'Not Cleared', color: 'bg-red-tier-bg text-red-tier', cleared: false, reason: `${t.red} technique${t.red !== 1 ? 's' : ''} in red ROM tier — mobility gaps to address.` }
  if (greenPct < 0.5) return { label: 'Cleared w/ Caution', color: 'bg-yellow-tier-bg text-yellow-tier', cleared: true, reason: 'Developing ROM — cleared to compete, monitor flagged joints.' }
  return { label: 'ROM Cleared', color: 'bg-green-tier-bg text-green-tier', cleared: true, reason: 'Mobility supports full competition readiness.' }
}

// ── Competitor Tile ─────────────────────────────────────────────────────────
function CompetitorTile({ athlete, record, activeInjuries, onUpdateRecord, onRemove }: {
  athlete: AthleteRosterItem; record: CompetitorRecord
  activeInjuries: ActiveInjury[]
  onUpdateRecord: (athleteUserId: string, patch: Partial<CompetitorRecord>) => Promise<void>
  onRemove: (athlete: AthleteRosterItem) => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [compName, setCompName] = useState(record.next_comp_name ?? '')
  const [compDate, setCompDate] = useState(record.next_comp_date ?? '')
  const [weightClass, setWeightClass] = useState(record.weight_class ?? '')
  const [weightUnit, setWeightUnit] = useState(record.weight_unit ?? 'lb')
  const [currentWeight, setCurrentWeight] = useState(record.current_weight?.toString() ?? '')
  const [targetWeight, setTargetWeight] = useState(record.target_weight?.toString() ?? '')

  const readiness = getReadiness(athlete.techniques)
  const hasActiveInjury = activeInjuries.length > 0
  const clearance = romClearance(athlete.techniques, hasActiveInjury)
  const weeksOut = weeksUntil(record.next_comp_date)
  const prep = weeksOut !== null ? prepPhaseForWeeksOut(weeksOut) : null
  const cutKg = record.current_weight != null && record.target_weight != null
    ? Math.max(0, record.current_weight - record.target_weight) : null

  const readinessColor =
    readiness.color === 'red'    ? 'bg-red-tier-bg text-red-tier' :
    readiness.color === 'green'  ? 'bg-green-tier-bg text-green-tier' :
    readiness.color === 'yellow' ? 'bg-yellow-tier-bg text-yellow-tier' :
                                   'bg-surface text-charcoal-light'

  async function save() {
    setSaving(true)
    try {
      await onUpdateRecord(record.athlete_user_id, {
        next_comp_name: compName.trim() || null,
        next_comp_date: compDate || null,
        weight_class: weightClass.trim() || null,
        weight_unit: weightUnit,
        current_weight: currentWeight ? Number(currentWeight) : null,
        target_weight: targetWeight ? Number(targetWeight) : null,
      })
      setEditOpen(false)
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-gold/40 overflow-hidden">
      {/* Header band */}
      <div className="bg-gradient-to-r from-gold/15 to-gold/5 px-4 py-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-charcoal leading-tight truncate">
            <Trophy size={14} className="text-gold shrink-0" /> {athlete.name}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <BeltBadge belt={athlete.belt} />
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide', readinessColor)}>{readiness.label}</span>
          </div>
        </div>
        <button onClick={() => onRemove(athlete)} title="Remove from competitors"
          className="shrink-0 text-charcoal-light hover:text-red-tier transition-colors" aria-label="Remove from competitors">
          <X size={15} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* ROM clearance */}
        <div className="rounded-xl border border-teal-light p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-charcoal-light uppercase tracking-wide">
              <ShieldPlus size={11} className="text-teal" /> Pre-Comp ROM Clearance
            </span>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold', clearance.color)}>{clearance.label}</span>
          </div>
          <p className="text-[11px] text-charcoal-light leading-snug">{clearance.reason}</p>
          <div className="flex gap-1.5 pt-0.5">
            <span className="tier-green text-[10px] px-2 py-0.5 rounded-full">{athlete.techniques.green} G</span>
            <span className="tier-yellow text-[10px] px-2 py-0.5 rounded-full">{athlete.techniques.yellow} Y</span>
            <span className="tier-red text-[10px] px-2 py-0.5 rounded-full">{athlete.techniques.red} R</span>
          </div>
        </div>

        {/* Active injury flag */}
        {hasActiveInjury && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-1">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-tier uppercase tracking-wide">
              <Syringe size={11} /> Active Injury — Return-to-Mat
            </span>
            {activeInjuries.map((inj, i) => (
              <p key={i} className="text-[11px] text-charcoal leading-snug">
                {inj.body_part} — Stage {inj.stage}/9 {(STAGE_LABELS[inj.stage]?.name) ? `(${STAGE_LABELS[inj.stage].name})` : ''}
              </p>
            ))}
          </div>
        )}

        {/* 8-week periodized prep countdown */}
        <div className="rounded-xl border border-teal-light p-3 space-y-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-charcoal-light uppercase tracking-wide">
            <Calendar size={11} className="text-teal" /> Periodized Prep
          </span>
          {weeksOut === null ? (
            <p className="text-[11px] text-charcoal-light italic">Set a competition date to start the 8-week prep countdown.</p>
          ) : weeksOut < 0 ? (
            <p className="text-[11px] text-charcoal-light">{record.next_comp_name || 'Competition'} was {Math.abs(weeksOut)} week{Math.abs(weeksOut) !== 1 ? 's' : ''} ago.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-charcoal truncate">{record.next_comp_name || 'Competition'}</p>
                <span className="text-[11px] font-bold text-teal shrink-0">{weeksOut === 0 ? 'This week' : `${weeksOut} wk out`}</span>
              </div>
              <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
                <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${Math.max(4, Math.min(100, ((8 - Math.min(weeksOut, 8)) / 8) * 100))}%` }} />
              </div>
              {prep && (
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide', prep.color)}>{prep.phase}</span>
                  <span className="text-[11px] text-charcoal-light leading-snug">{prep.focus}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Weight class & cut */}
        <div className="rounded-xl border border-teal-light p-3 space-y-1.5">
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-charcoal-light uppercase tracking-wide">
            <Scale size={11} className="text-teal" /> Weight Class & Cut
          </span>
          {record.weight_class || cutKg !== null ? (
            <div className="flex items-center gap-3 flex-wrap">
              {record.weight_class && <span className="text-xs font-semibold text-charcoal">{record.weight_class}</span>}
              {record.current_weight != null && (
                <span className="text-[11px] text-charcoal-light">Now: <span className="font-semibold text-charcoal">{record.current_weight}{record.weight_unit}</span></span>
              )}
              {record.target_weight != null && (
                <span className="text-[11px] text-charcoal-light">Target: <span className="font-semibold text-charcoal">{record.target_weight}{record.weight_unit}</span></span>
              )}
              {cutKg !== null && cutKg > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gold/20 text-gold">Cut {cutKg.toFixed(1)}{record.weight_unit}</span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-charcoal-light italic">No weight class set.</p>
          )}
        </div>

        {/* Day-of RAMP */}
        <div className="rounded-xl bg-teal/5 border border-teal-light p-3 space-y-1">
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-teal uppercase tracking-wide">
            <Flame size={11} /> Day-of RAMP Warmup
          </span>
          <p className="text-[11px] text-charcoal-light leading-snug">
            Raise · Activate · Mobilize · Potentiate — prioritize this athlete's flagged joints
            {athlete.priorityJoints.length > 0
              ? `: ${athlete.priorityJoints.slice(0, 3).map(j => formatJointName(j.joint)).join(', ')}.`
              : '.'}
          </p>
        </div>

        {/* Edit comp details */}
        <button onClick={() => setEditOpen(o => !o)}
          className={cn('w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition-all',
            editOpen ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100')}>
          <Target size={12} /> {editOpen ? 'Close' : 'Edit Competition Details'}
        </button>

        {editOpen && (
          <div className="space-y-2 pt-1">
            <input value={compName} onChange={e => setCompName(e.target.value)} placeholder="Competition name (e.g. IBJJF Pan)"
              className="w-full px-3 py-2 text-xs rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white" />
            <input type="date" value={compDate} onChange={e => setCompDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white" />
            <input value={weightClass} onChange={e => setWeightClass(e.target.value)} placeholder="Weight class (e.g. Middleweight)"
              className="w-full px-3 py-2 text-xs rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white" />
            <div className="flex gap-2">
              <input value={currentWeight} onChange={e => setCurrentWeight(e.target.value)} placeholder="Current" inputMode="decimal"
                className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white" />
              <input value={targetWeight} onChange={e => setTargetWeight(e.target.value)} placeholder="Target" inputMode="decimal"
                className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white" />
              <select value={weightUnit} onChange={e => setWeightUnit(e.target.value)}
                className="px-2 py-2 text-xs rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white">
                <option value="lb">lb</option>
                <option value="kg">kg</option>
              </select>
            </div>
            <button onClick={save} disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-teal text-white hover:bg-teal-dark transition-all disabled:opacity-60">
              <Save size={12} /> {saving ? 'Saving…' : 'Save Details'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TAB: MY COMPETITORS (live) ──────────────────────────────────────────────
function CompetitorsTab({ roster, competitors, injuriesByAthlete, loading, onUpdateRecord, onRemove }: {
  roster: AthleteRosterItem[]
  competitors: Record<string, CompetitorRecord>
  injuriesByAthlete: Record<string, ActiveInjury[]>
  loading: boolean
  onUpdateRecord: (athleteUserId: string, patch: Partial<CompetitorRecord>) => Promise<void>
  onRemove: (athlete: AthleteRosterItem) => void
}) {
  if (loading) return <Spinner />
  const readyAthletes = roster.filter(a => a.user_id && competitors[a.user_id]?.is_ready)
  // soonest competition first, then athletes with no date
  const sorted = [...readyAthletes].sort((a, b) => {
    const da = competitors[a.user_id!]?.next_comp_date
    const db = competitors[b.user_id!]?.next_comp_date
    if (da && db) return da.localeCompare(db)
    if (da) return -1
    if (db) return 1
    return 0
  })

  return (
    <div className="space-y-4">
      {/* Intro banner */}
      <div className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/10 to-teal/5 p-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gold/15 flex items-center justify-center shrink-0">
            <Trophy size={20} className="text-gold" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display font-bold text-charcoal text-lg leading-tight">My Competitors</h2>
            <p className="text-sm text-charcoal-light leading-relaxed">
              Athletes you've marked <span className="font-semibold text-gold">Ready for Competition</span> on the roster appear here — with ROM clearance, periodized prep, weight cut, and day-of warmup. Uncheck an athlete and they leave this list.
            </p>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={Trophy} title="No competitors yet"
          description="Go to My Team → Roster and tap 'Mark Ready for Competition' on any athlete. They'll show up here, ready to prep." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map(a => (
            <CompetitorTile key={a.id} athlete={a} record={competitors[a.user_id!]}
              activeInjuries={injuriesByAthlete[a.user_id!] ?? []}
              onUpdateRecord={onUpdateRecord} onRemove={onRemove} />
          ))}
        </div>
      )}
      <p className="text-xs text-charcoal-light text-center pt-1">
        Readiness and clearance are computed from the same ROM and injury data on your dashboard — intelligence no other platform offers.
      </p>
    </div>
  )
}

// ── In Development Placeholder ───────────────────────────────────────────────
function RoadmapPreviewTab({ icon: Icon, title, description, phases }: {
  icon: typeof Users
  title: string
  description: string
  phases: Array<{ tag: string; tagColor: string; heading: string; items: string[] }>
}) {
  return (
    <div className="space-y-5">
      {/* Intro banner */}
      <div className="rounded-2xl border border-teal-light bg-gradient-to-br from-teal/5 to-gold/5 p-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-teal/10 flex items-center justify-center shrink-0">
            <Icon size={20} className="text-teal" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display font-bold text-charcoal text-lg leading-tight">{title}</h2>
            <p className="text-sm text-charcoal-light leading-relaxed">{description}</p>
          </div>
        </div>
      </div>

      {/* Phased roadmap */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {phases.map((phase, i) => (
          <div key={i} className="rounded-2xl border border-teal-light bg-white p-4 space-y-3">
            <span className={cn('inline-block text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide', phase.tagColor)}>
              {phase.tag}
            </span>
            <p className="text-sm font-semibold text-charcoal leading-snug">{phase.heading}</p>
            <ul className="space-y-1.5">
              {phase.items.map((f, j) => (
                <li key={j} className="flex items-start gap-2 text-xs text-charcoal-light leading-snug">
                  <ChevronRight size={12} className="text-teal mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-charcoal-light text-center pt-1">
        Built on the same ROM, readiness, and injury data already powering your dashboard.
      </p>
    </div>
  )
}

// ── My Injury Tab ─────────────────────────────────────────────────────────────
// Return-to-Mat protocol. Each stage has a coach-facing why / what / how so a coach
// can always explain to an athlete WHY they're at a stage, WHAT they're allowed to
// do, and HOW they earn the next stage. `description` kept as the short summary.
const STAGE_GUIDE: Record<number, {
  name: string; description: string; color: string; band: string
  why: string; what: string; how: string
}> = {
  0: {
    name: 'Off Mat', color: 'text-red-tier', band: 'Protect',
    description: 'Complete rest — no physical activity affecting injury.',
    why: 'Tissue is in the acute/inflammatory phase. Loading it now risks re-injury and a longer total layoff.',
    what: 'Complete rest from anything that loads the injury. Off the mat entirely. Manage pain and swelling.',
    how: 'Pain at rest is gone and daily-life movement is pain-free before moving to Stage 1.',
  },
  1: {
    name: 'Cardio Only', color: 'text-red-tier', band: 'Protect',
    description: 'Bike, swim, walk — no grappling contact.',
    why: 'Keep the engine and uninjured body conditioned without stressing the healing tissue.',
    what: 'Low-impact cardio that does not involve the injured area — bike, swim, walk. Zero grappling contact.',
    how: 'Cardio is pain-free and the athlete can move the injured area through a basic range without pain.',
  },
  2: {
    name: 'Solo Movement', color: 'text-gold', band: 'Reintroduce',
    description: 'Individual movement patterns, no contact.',
    why: 'Restore range of motion and reawaken movement patterns before adding any external load.',
    what: 'Solo mobility and BJJ movement patterns — shrimps, bridges, rolls — at the athlete\'s own pace. Still no contact.',
    how: 'Full or near-full range restored, solo movements pain-free at normal speed.',
  },
  3: {
    name: 'Technical Solo', color: 'text-gold', band: 'Reintroduce',
    description: 'Solo drilling of non-affected techniques only.',
    why: 'Rebuild technical sharpness and confidence on movements that don\'t challenge the injury.',
    what: 'Solo technique drilling (sprawls, guard retention shadow-drills) that avoids the injured area.',
    how: 'Solo technique reps are crisp and confident with no compensation or guarding.',
  },
  4: {
    name: 'Technical Drilling', color: 'text-gold', band: 'Reintroduce',
    description: 'Compliant partner, zero resistance.',
    why: 'First reintroduction of a partner — controlled load to test tolerance without unpredictability.',
    what: 'Drilling with a fully compliant partner at zero resistance. Partner gives no surprises.',
    how: 'Controlled partner drilling is pain-free with no swelling or soreness the next day.',
  },
  5: {
    name: 'Positional (Protected)', color: 'text-teal', band: 'Rebuild',
    description: 'Sparring avoiding the injury area.',
    why: 'Reintroduce live resistance in a contained way while still shielding the injury.',
    what: 'Positional sparring with rules that protect the injured area (e.g. no leg attacks for a knee).',
    how: 'Protected live rounds feel stable and confident, no pain during or after.',
  },
  6: {
    name: 'Flow Rolling', color: 'text-teal', band: 'Rebuild',
    description: 'Light intensity, injury-aware partner only.',
    why: 'Bridge from positional to full rolling at an intensity the tissue can handle.',
    what: 'Light, continuous flow rolling with a trusted, injury-aware partner. No spikes in intensity.',
    how: 'Flow rolling is comfortable and the athlete trusts the area under light unpredictability.',
  },
  7: {
    name: 'Modified Training', color: 'text-teal', band: 'Rebuild',
    description: 'Full class with specific technique restrictions.',
    why: 'Return to the room with the team while keeping a few guardrails on the riskiest positions.',
    what: 'Full class participation with a short list of specific restrictions (named positions/submissions to avoid).',
    how: 'Full class with restrictions causes no setbacks across a full week of training.',
  },
  8: {
    name: 'Full Training', color: 'text-green-tier', band: 'Return',
    description: 'No modifications — full intensity.',
    why: 'Tissue tolerates full training load; restrictions are no longer needed.',
    what: 'Normal training — full intensity, no restrictions. Train like everyone else.',
    how: 'Sustained full training with zero symptoms qualifies the athlete for competition clearance.',
  },
  9: {
    name: 'Competition Ready', color: 'text-green-tier', band: 'Return',
    description: 'Competition cleared — coach sign-off required.',
    why: 'Athlete has proven full tolerance and is cleared for the demands of competition.',
    what: 'Cleared for competition prep and competing. Coach has signed off on full readiness.',
    how: 'This is the final stage — clear the injury to take the athlete off the protocol.',
  },
}

// Backward-compatible alias (older references expect STAGE_LABELS)
const STAGE_LABELS = STAGE_GUIDE

interface InjuryRecord {
  id: string; athlete_user_id: string; body_part: string; injury_type: string
  side: string; severity: number; stage: number; status: string
  injury_date: string; notes: string | null
}

function InjuryCard({
  injury, athleteName, session, onUpdated,
}: {
  injury: InjuryRecord; athleteName: string
  session: { access_token: string } | null
  onUpdated: (id: string, stage: number, status: string) => void
}) {
  const [stageNote, setStageNote] = useState('')
  const [saving, setSaving]       = useState(false)
  const [expanded, setExpanded]   = useState(false)

  const stageInfo = STAGE_LABELS[injury.stage] ?? STAGE_LABELS[0]
  const isCleared = injury.status === 'cleared'

  async function advance(newStage: number, newStatus?: string) {
    if (!session) return
    setSaving(true)
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-actions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_injury_stage', injury_id: injury.id, stage: newStage, status: newStatus ?? injury.status, notes: stageNote.trim() || null }),
      })
      onUpdated(injury.id, newStage, newStatus ?? injury.status)
    } finally { setSaving(false) }
  }

  const severityColor = injury.severity >= 8 ? 'text-red-tier' : injury.severity >= 5 ? 'text-gold' : 'text-charcoal-light'

  return (
    <div className={cn('rounded-2xl border-2 p-4 space-y-3', isCleared ? 'border-green-tier/40 bg-green-50/30' : 'border-teal-light bg-white')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-charcoal">{athleteName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-semibold text-charcoal">{injury.body_part}</span>
            {injury.side !== 'unknown' && injury.side !== 'N/A' && (
              <span className="text-[10px] bg-surface px-2 py-0.5 rounded-full text-charcoal-light">{injury.side}</span>
            )}
            <span className={cn('text-[10px] font-semibold', severityColor)}>{injury.severity}/10</span>
            <span className="text-[10px] text-charcoal-light">{new Date(injury.injury_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full uppercase', isCleared ? 'bg-green-tier-bg text-green-tier' : 'bg-red-50 text-red-tier')}>
          {isCleared ? 'Cleared' : 'Active'}
        </span>
      </div>

      {/* Stage progress bar + always-visible quick stage controls */}
      {!isCleared && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={cn('text-xs font-bold', stageInfo.color)}>Stage {injury.stage}/9 — {stageInfo.name}</p>
            {/* Quick − / + stage steppers, always visible */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => advance(injury.stage - 1)} disabled={saving || injury.stage <= 0}
                title="Move back a stage"
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface text-charcoal-light hover:text-charcoal hover:bg-teal-light transition-colors disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              <span className="text-[11px] font-bold text-charcoal tabular-nums w-4 text-center">{injury.stage}</span>
              <button onClick={() => advance(injury.stage + 1)} disabled={saving || injury.stage >= 9}
                title="Advance a stage"
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-teal text-white hover:bg-teal/90 transition-colors disabled:opacity-30">
                <ChevronR size={14} />
              </button>
            </div>
          </div>
          <div className="w-full bg-teal-light rounded-full h-1.5">
            <div className="bg-teal h-1.5 rounded-full transition-all duration-500" style={{ width: `${(injury.stage / 9) * 100}%` }} />
          </div>
          <p className="text-[11px] text-charcoal-light">{stageInfo.description}</p>
          {/* Action row: details toggle + heal/clear */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button onClick={() => setExpanded(o => !o)}
              className="text-[11px] font-semibold text-teal hover:text-teal/80 transition-colors flex items-center gap-1">
              <Info size={12} /> {expanded ? 'Hide details' : 'Stage details + notes'}
            </button>
            <button onClick={() => advance(injury.stage, 'cleared')} disabled={saving}
              title="Heal: clear this injury and remove from protocol"
              className="flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-green-tier text-white hover:bg-green-tier/90 transition-colors disabled:opacity-50">
              <CheckCircle2 size={12} /> Heal &amp; Clear
            </button>
          </div>
        </div>
      )}

      {/* Stage advancement controls */}
      {expanded && !isCleared && (
        <div className="border-t border-teal-light pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-charcoal uppercase tracking-wide">Next Stage</p>
              <p className={cn('text-xs font-semibold', STAGE_LABELS[Math.min(injury.stage + 1, 9)]?.color)}>
                Stage {Math.min(injury.stage + 1, 9)} — {STAGE_LABELS[Math.min(injury.stage + 1, 9)]?.name}
              </p>
              <p className="text-[10px] text-charcoal-light">{STAGE_LABELS[Math.min(injury.stage + 1, 9)]?.description}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-charcoal uppercase tracking-wide">Return Protocol</p>
              {Object.entries(STAGE_LABELS).slice(injury.stage + 1, injury.stage + 4).map(([s, info]) => (
                <p key={s} className="text-[10px] text-charcoal-light">{s}: {info.name}</p>
              ))}
            </div>
          </div>
          <textarea value={stageNote} onChange={e => setStageNote(e.target.value)} rows={2}
            placeholder="Advancement notes (saved with next stage change)..."
            className="w-full text-xs rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none" />
          <p className="text-[10px] text-charcoal-light">Use the <span className="font-semibold">− / +</span> steppers above to move stages, or <span className="font-semibold text-green-tier">Heal &amp; Clear</span> to remove from protocol. Notes here save with the next change.</p>
        </div>
      )}

      {injury.notes && (
        <p className="text-[11px] text-charcoal-light italic bg-surface rounded-xl px-3 py-1.5">Note: {injury.notes}</p>
      )}
    </div>
  )
}

function MyInjuryTab({ session, roster }: { session: { access_token: string } | null; roster: AthleteRosterItem[] }) {
  const [injuries, setInjuries] = useState<InjuryRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [showCleared, setShowCleared] = useState(false)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-actions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_injuries' }),
    }).then(r => r.json()).then(data => {
      setInjuries(Array.isArray(data.injuries) ? data.injuries : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [session])

  function handleUpdated(id: string, stage: number, status: string) {
    setInjuries(prev => prev.map(inj => inj.id === id ? { ...inj, stage, status } : inj))
  }

  // Build name map from roster
  const nameMap: Record<string, string> = {}
  for (const a of roster) { if (a.user_id) nameMap[a.user_id] = a.name }

  const active  = injuries.filter(i => i.status !== 'cleared')
  const cleared = injuries.filter(i => i.status === 'cleared')

  if (loading) return <Spinner />

  if (injuries.length === 0) {
    return (
      <div className="space-y-5">
        <EmptyState
          icon={ShieldPlus}
          title="No active injuries"
          description="Injuries logged from athlete cards will appear here. Use the Injury button on any athlete card to log a new injury."
        />
        <StageCheatSheet />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Active injuries */}
      {active.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-charcoal uppercase tracking-wide flex items-center gap-2">
            <Syringe size={13} className="text-red-tier" /> Active ({active.length})
          </p>
          {active.map(inj => (
            <InjuryCard key={inj.id} injury={inj}
              athleteName={nameMap[inj.athlete_user_id] ?? 'Athlete'}
              session={session} onUpdated={handleUpdated} />
          ))}
        </div>
      )}

      {/* Cleared injuries toggle */}
      {cleared.length > 0 && (
        <div>
          <button onClick={() => setShowCleared(o => !o)}
            className="text-xs text-charcoal-light hover:text-charcoal flex items-center gap-1.5 transition-colors">
            <ChevronRight size={12} className={cn('transition-transform', showCleared && 'rotate-90')} />
            {showCleared ? 'Hide' : 'Show'} cleared injuries ({cleared.length})
          </button>
          {showCleared && (
            <div className="mt-3 space-y-3">
              {cleared.map(inj => (
                <InjuryCard key={inj.id} injury={inj}
                  athleteName={nameMap[inj.athlete_user_id] ?? 'Athlete'}
                  session={session} onUpdated={handleUpdated} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Return-to-Mat cheat sheet — full why/what/how reference, placed at bottom */}
      <StageCheatSheet />
    </div>
  )
}

// Full coach-facing reference: why each stage exists, what the athlete can do, and
// how they earn the next stage. Lives at the bottom of the My Injury tab so a coach
// can always explain a stage to an athlete instead of just naming a number.
function StageCheatSheet() {
  const [open, setOpen] = useState(true)
  const bandColor: Record<string, string> = {
    Protect: 'bg-red-50 text-red-tier',
    Reintroduce: 'bg-gold/15 text-gold',
    Rebuild: 'bg-teal-light text-teal',
    Return: 'bg-green-tier-bg text-green-tier',
  }
  return (
    <SectionCard title="">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2">
          <BookOpen size={15} className="text-teal" />
          <span className="text-sm font-bold text-charcoal">Return-to-Mat Protocol — Coach Cheat Sheet</span>
        </span>
        <ChevronDown size={16} className={cn('text-charcoal-light transition-transform', open && 'rotate-180')} />
      </button>
      <p className="text-[11px] text-charcoal-light mt-1">
        What each stage means, what the athlete is cleared to do, and how they earn the next stage.
      </p>

      {open && (
        <div className="mt-4 space-y-3">
          {Object.entries(STAGE_GUIDE).map(([stage, info]) => (
            <div key={stage} className="rounded-2xl border border-teal-light bg-surface/60 p-3">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={cn('text-xs font-bold', info.color)}>Stage {stage}</span>
                <span className="text-sm font-bold text-charcoal">{info.name}</span>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide', bandColor[info.band] ?? 'bg-surface text-charcoal-light')}>
                  {info.band}
                </span>
              </div>
              <div className="grid sm:grid-cols-3 gap-2.5">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-charcoal-light uppercase tracking-wide">Why</p>
                  <p className="text-[11px] text-charcoal leading-snug">{info.why}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-charcoal-light uppercase tracking-wide">What they can do</p>
                  <p className="text-[11px] text-charcoal leading-snug">{info.what}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-charcoal-light uppercase tracking-wide">How to progress</p>
                  <p className="text-[11px] text-charcoal leading-snug">{info.how}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function CoachDashboard({ defaultSection = 'team' }: { defaultSection?: Tab }) {
  const { session, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [teamSubTab, setTeamSubTab] = useState<TeamSubTab>('roster')
  const [coachSubTab, setCoachSubTab] = useState<CoachingSubTab>('technique')

  // When navigated to coaching tab with a pending journal log (from Add to Journal)
  const pendingFromRoute = (location.state as { pendingLog?: { code: string; name: string; type: string; notes: string } } | null)?.pendingLog
  const [roster, setRoster] = useState<AthleteRosterItem[]>([])
  const [rosterLoading, setRosterLoading] = useState(true)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [drillCounts, setDrillCounts]       = useState<Record<string, number>>({})
  const [protocolCounts, setProtocolCounts] = useState<Record<string, number>>({})
  const [noteMap, setNoteMap]               = useState<Record<string, string>>({})
  const [competitors, setCompetitors]       = useState<Record<string, CompetitorRecord>>({})
  const [competitorsLoading, setCompetitorsLoading] = useState(true)
  const [compSavingSet, setCompSavingSet]   = useState<Set<string>>(new Set())
  const [injuriesByAthlete, setInjuriesByAthlete] = useState<Record<string, ActiveInjury[]>>({})
  const [attendanceMap, setAttendanceMap]   = useState<Record<string, AttendanceInfo>>({})
  const [attendanceLoading, setAttendanceLoading] = useState(true)
  const [attSavingSet, setAttSavingSet]     = useState<Set<string>>(new Set())

  // Lifted coaching tab state (persists across tab switches)
  const [coachingTechs, setCoachingTechs]         = useState<TechniqueItem[]>([])
  const [coachingLoadingTechs, setCoachingLoadingTechs] = useState(true)
  const [selectedCode, setSelectedCode]           = useState('')
  const [warmup, setWarmup]                       = useState<TechniqueWarmup | null>(null)
  // pendingJournalLog comes from route state when navigating from Add to Journal
  const pendingJournalLog = pendingFromRoute ?? null

  // Load coach row
  useEffect(() => {
    if (!user) return
    supabase.from('coaches').select('id').eq('user_id', user.id).single().then(({ data }) => { if (data) setCoachId(data.id) })
  }, [user])

  // Load roster
  useEffect(() => {
    if (!session) return
    setRosterLoading(true)
    fetch(COACH_ROSTER_URL, {
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
    }).then(r => r.json()).then(data => setRoster(Array.isArray(data) ? data : data.athletes ?? [])).catch(() => setRoster([])).finally(() => setRosterLoading(false))
  }, [session])

  // Load coaching techniques once (persisted)
  useEffect(() => {
    if (!session || coachingTechs.length > 0) return
    setCoachingLoadingTechs(true)
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_techniques' }),
    }).then(r => r.json()).then(data => setCoachingTechs(Array.isArray(data.techniques) ? data.techniques : [])).catch(() => {}).finally(() => setCoachingLoadingTechs(false))
  }, [session, coachingTechs.length])

  // Drill counts
  useEffect(() => {
    if (roster.length === 0) return
    const userIds = roster.map(a => a.user_id).filter(Boolean) as string[]
    if (userIds.length === 0) return
    async function load() {
      const counts: Record<string, number> = {}
      await Promise.all(userIds.map(async uid => {
        const { count } = await supabase.from('drill_sessions').select('*', { count: 'exact', head: true }).eq('user_id', uid)
        counts[uid] = count ?? 0
      }))
      setDrillCounts(counts)
    }
    load()
  }, [roster])

  // Protocol counts via admin edge function (bypasses RLS reliably)
  useEffect(() => {
    if (!session || roster.length === 0) return
    const userIds = roster.map(a => a.user_id).filter(Boolean) as string[]
    if (userIds.length === 0) return
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_protocol_counts', athlete_user_ids: userIds }),
    }).then(r => r.json()).then(data => setProtocolCounts(data.counts ?? {})).catch(() => {})
  }, [session, roster])

  // Load all coach notes for display on cards
  useEffect(() => {
    if (!session) return
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_notes' }),
    }).then(r => r.json()).then(data => {
      const map: Record<string, string> = {}
      for (const n of data.notes ?? []) { if (n.athlete_id && n.note) map[n.athlete_id] = n.note }
      setNoteMap(map)
    }).catch(() => {})
  }, [session])

  function handleNoteUpdated(athleteId: string, note: string) {
    setNoteMap(prev => ({ ...prev, [athleteId]: note }))
  }

  // Load competitor rows for this coach
  useEffect(() => {
    if (!coachId) return
    setCompetitorsLoading(true)
    supabase.from('coach_competitors').select('*').eq('coach_id', coachId)
      .then(({ data }) => {
        const map: Record<string, CompetitorRecord> = {}
        for (const r of (data ?? []) as CompetitorRecord[]) map[r.athlete_user_id] = r
        setCompetitors(map)
      })
      .then(undefined, () => setCompetitors({}))
      .then(() => setCompetitorsLoading(false))
  }, [coachId])

  // Load active injuries grouped by athlete (coach-scoped via RLS)
  useEffect(() => {
    if (!coachId) return
    supabase.from('athlete_injuries')
      .select('athlete_user_id, body_part, stage, status')
      .eq('coach_id', coachId).neq('status', 'cleared')
      .then(({ data }) => {
        const map: Record<string, ActiveInjury[]> = {}
        for (const inj of (data ?? []) as Array<ActiveInjury & { athlete_user_id: string }>) {
          if (!map[inj.athlete_user_id]) map[inj.athlete_user_id] = []
          map[inj.athlete_user_id].push({ body_part: inj.body_part, stage: inj.stage, status: inj.status })
        }
        setInjuriesByAthlete(map)
      })
      .then(undefined, () => setInjuriesByAthlete({}))
  }, [coachId])

  // Toggle 'Ready for Competition' — upsert (true) or update is_ready=false
  async function handleToggleCompReady(athlete: AthleteRosterItem, next: boolean) {
    if (!coachId || !athlete.user_id) return
    const uid = athlete.user_id
    setCompSavingSet(prev => new Set(prev).add(uid))
    try {
      if (next) {
        const { data, error } = await supabase.from('coach_competitors')
          .upsert({ coach_id: coachId, athlete_user_id: uid, is_ready: true, marked_ready_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            { onConflict: 'coach_id,athlete_user_id' })
          .select().single()
        if (error) throw error
        if (data) setCompetitors(prev => ({ ...prev, [uid]: data as CompetitorRecord }))
      } else {
        const { data, error } = await supabase.from('coach_competitors')
          .update({ is_ready: false, updated_at: new Date().toISOString() })
          .eq('coach_id', coachId).eq('athlete_user_id', uid)
          .select().maybeSingle()
        if (error) throw error
        setCompetitors(prev => {
          const copy = { ...prev }
          if (data) copy[uid] = data as CompetitorRecord
          else delete copy[uid]
          return copy
        })
      }
    } catch { /* keep UI state; surfaced via no change */ }
    finally {
      setCompSavingSet(prev => { const s = new Set(prev); s.delete(uid); return s })
    }
  }

  // Update competition details on a competitor record
  async function handleUpdateCompetitorRecord(athleteUserId: string, patch: Partial<CompetitorRecord>) {
    if (!coachId) return
    const { data, error } = await supabase.from('coach_competitors')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('coach_id', coachId).eq('athlete_user_id', athleteUserId)
      .select().single()
    if (error) throw error
    if (data) setCompetitors(prev => ({ ...prev, [athleteUserId]: data as CompetitorRecord }))
  }

  // Remove from competitors (X on tile) — sets is_ready=false
  function handleRemoveCompetitor(athlete: AthleteRosterItem) {
    if (athlete.user_id) handleToggleCompReady(athlete, false)
  }

  // Load attendance for this coach (last 30 days) -> per-athlete summary
  useEffect(() => {
    if (!coachId) return
    setAttendanceLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const sinceStr = since.toISOString().slice(0, 10)
    const todayStr = localDateStr()
    supabase.from('attendance')
      .select('athlete_user_id, class_date')
      .eq('coach_id', coachId).gte('class_date', sinceStr)
      .then(({ data }) => {
        const map: Record<string, AttendanceInfo> = {}
        for (const row of (data ?? []) as Array<{ athlete_user_id: string; class_date: string }>) {
          const uid = row.athlete_user_id
          const existing = map[uid]
          if (!existing) {
            map[uid] = { lastSeen: row.class_date, presentToday: row.class_date === todayStr, classes30d: 1 }
          } else {
            existing.classes30d += 1
            if (row.class_date > (existing.lastSeen ?? '')) existing.lastSeen = row.class_date
            if (row.class_date === todayStr) existing.presentToday = true
          }
        }
        setAttendanceMap(map)
      })
      .then(undefined, () => setAttendanceMap({}))
      .then(() => setAttendanceLoading(false))
  }, [coachId])

  // Toggle one athlete's check-in for today (insert / delete today's row)
  async function handleToggleAttendance(athlete: AthleteRosterItem, present: boolean) {
    if (!coachId || !athlete.user_id) return
    const uid = athlete.user_id
    const todayStr = localDateStr()
    setAttSavingSet(prev => new Set(prev).add(uid))
    try {
      if (present) {
        const { error } = await supabase.from('attendance')
          .upsert({ coach_id: coachId, athlete_user_id: uid, class_date: todayStr, checked_in_by: user?.id ?? null },
            { onConflict: 'coach_id,athlete_user_id,class_date' })
        if (error) throw error
        setAttendanceMap(prev => applyCheckIn(prev, uid, todayStr))
      } else {
        const { error } = await supabase.from('attendance')
          .delete().eq('coach_id', coachId).eq('athlete_user_id', uid).eq('class_date', todayStr)
        if (error) throw error
        setAttendanceMap(prev => applyCheckOut(prev, uid, todayStr))
      }
    } catch { /* leave state unchanged on failure */ }
    finally {
      setAttSavingSet(prev => { const s = new Set(prev); s.delete(uid); return s })
    }
  }

  // Bulk: mark a list of athletes present today
  async function handleMarkAllPresent(athletes: AthleteRosterItem[]) {
    if (!coachId) return
    const todayStr = localDateStr()
    const rows = athletes
      .filter(a => a.user_id)
      .map(a => ({ coach_id: coachId, athlete_user_id: a.user_id!, class_date: todayStr, checked_in_by: user?.id ?? null }))
    if (rows.length === 0) return
    const uids = rows.map(r => r.athlete_user_id)
    setAttSavingSet(prev => { const s = new Set(prev); uids.forEach(u => s.add(u)); return s })
    try {
      const { error } = await supabase.from('attendance')
        .upsert(rows, { onConflict: 'coach_id,athlete_user_id,class_date' })
      if (error) throw error
      setAttendanceMap(prev => {
        let next = prev
        for (const u of uids) next = applyCheckIn(next, u, todayStr)
        return next
      })
    } catch { /* leave state unchanged */ }
    finally {
      setAttSavingSet(prev => { const s = new Set(prev); uids.forEach(u => s.delete(u)); return s })
    }
  }

  const compReadySet = new Set(
    Object.values(competitors).filter(c => c.is_ready).map(c => c.athlete_user_id)
  )

  function handleAddToJournal(code: string, name: string, type: string, notes: string) {
    navigate('/dashboard/coach-coaching', { state: { pendingLog: { code, name, type, notes } } })
  }

  // Auto-switch to journal sub-tab if we arrived here via Add to Journal
  useEffect(() => {
    if (defaultSection === 'coaching' && pendingFromRoute) {
      setCoachSubTab('journal')
    }
  }, [defaultSection, pendingFromRoute])

  const sectionTitle = {
    team: `My Team${!rosterLoading ? ` — ${roster.length} athlete${roster.length !== 1 ? 's' : ''}` : ''}`,
    coaching: 'My Coaching',
    competitions: 'My Competitors',
    injury: 'My Injury',
    school: 'My School',
  }[defaultSection] ?? 'Coach Dashboard'

  return (
    <div className="space-y-5">
      <PageHeader title={sectionTitle} subtitle="" />

      {/* MY TEAM ─ Roster + Notes sub-tabs */}
      {defaultSection === 'team' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-surface rounded-xl p-1 w-fit">
            {(['roster', 'notes'] as TeamSubTab[]).map(s => (
              <button key={s} onClick={() => setTeamSubTab(s)}
                className={cn('px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                  teamSubTab === s ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal-light hover:text-charcoal')}>
                {s === 'roster' ? 'Roster' : 'Notes'}
              </button>
            ))}
          </div>
          {teamSubTab === 'roster' && (
            <RosterTab roster={roster} setRoster={setRoster} loading={rosterLoading} session={session} coachId={coachId}
              drillCounts={drillCounts} protocolCounts={protocolCounts} noteMap={noteMap} onNoteUpdated={handleNoteUpdated}
              compReadySet={compReadySet} compSavingSet={compSavingSet} onToggleCompReady={handleToggleCompReady}
              attendanceMap={attendanceMap} attendanceLoading={attendanceLoading} attSavingSet={attSavingSet}
              onToggleAttendance={handleToggleAttendance} onMarkAllPresent={handleMarkAllPresent} />
          )}
          {teamSubTab === 'notes' && <NotesTab roster={roster} session={session} />}
        </div>
      )}

      {/* MY COACHING ─ Technique + Journal sub-tabs */}
      {defaultSection === 'coaching' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-surface rounded-xl p-1 w-fit">
            {(['technique', 'journal'] as CoachingSubTab[]).map(s => (
              <button key={s} onClick={() => setCoachSubTab(s)}
                className={cn('px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                  coachSubTab === s ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal-light hover:text-charcoal')}>
                {s === 'technique' ? 'Technique' : 'Journal'}
              </button>
            ))}
          </div>
          {coachSubTab === 'technique' && (
            <WarmupTab session={session} techniques={coachingTechs} loadingTechs={coachingLoadingTechs}
              selectedCode={selectedCode} setSelectedCode={setSelectedCode} warmup={warmup} setWarmup={setWarmup}
              onAddToJournal={handleAddToJournal} />
          )}
          {coachSubTab === 'journal' && (
            <JournalTab session={session} pendingLog={pendingJournalLog ?? null} />
          )}
        </div>
      )}

      {/* MY COMPETITORS ─ live */}
      {defaultSection === 'competitions' && (
        <CompetitorsTab
          roster={roster}
          competitors={competitors}
          injuriesByAthlete={injuriesByAthlete}
          loading={rosterLoading || competitorsLoading}
          onUpdateRecord={handleUpdateCompetitorRecord}
          onRemove={handleRemoveCompetitor}
        />
      )}

      {/* MY INJURY ─ Return-to-mat tracker */}
      {defaultSection === 'injury' && (
        <MyInjuryTab session={session} roster={roster} />
      )}

      {/* MY SCHOOL ─ Roadmap preview */}
      {defaultSection === 'school' && (
        <RoadmapPreviewTab
          icon={GraduationCap}
          title="Your School"
          description="Connect your gym to ROMRxBJJ. Bring your whole team onto one program, invite athletes in a few taps, and see your school's mobility and readiness at a glance."
          phases={[
            {
              tag: 'Coming Soon',
              tagColor: 'bg-teal/15 text-teal',
              heading: 'Team foundation',
              items: [
                'Gym / school profile',
                'Athlete invite and onboarding',
                'School-wide ROM readiness snapshot',
              ],
            },
            {
              tag: 'Planned',
              tagColor: 'bg-gold/20 text-gold',
              heading: 'Gym operations',
              items: [
                'Multi-coach support and roles',
                'Coach profiles and credentials',
                'School-wide stats and trends',
              ],
            },
          ]}
        />
      )}
    </div>
  )
}
