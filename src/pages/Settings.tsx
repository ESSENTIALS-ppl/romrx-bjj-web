import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import type { Assessment } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import {
  Save, Loader2, ExternalLink, Mail, HelpCircle,
  LogOut, Trash2, ChevronRight, ClipboardList, TrendingUp,
} from 'lucide-react'
import { beltColor, cn } from '../lib/utils'

const BELTS = ['white', 'blue', 'purple', 'brown', 'black']
const SIDES = ['right', 'left']

// ── PRS helpers (mirrors MyBody.tsx) ─────────────────────────────────────────
const PRS_BILATERAL = [
  { l: 'hip_er_l',        r: 'hip_er_r',        riskBelow: 40,  normalMin: 40  },
  { l: 'hip_ir_l',        r: 'hip_ir_r',        riskBelow: 30,  normalMin: 30  },
  { l: 'hip_abd_l',       r: 'hip_abd_r',       riskBelow: 30,  normalMin: 40  },
  { l: 'hip_flex_l',      r: 'hip_flex_r',      riskBelow: 100, normalMin: 100 },
  { l: 'shoulder_er_l',   r: 'shoulder_er_r',   riskBelow: 60,  normalMin: 60  },
  { l: 'shoulder_flex_l', r: 'shoulder_flex_r', riskBelow: 120, normalMin: 140 },
  { l: 'ankle_df_l',      r: 'ankle_df_r',      riskBelow: 10,  normalMin: 10  },
  { l: 'cervical_rot_l',  r: 'cervical_rot_r',  riskBelow: 60,  normalMin: 70  },
]
const PRS_UNILATERAL = [
  { key: 'lumbar_flex', riskBelow: 40, normalMin: 40 },
  { key: 'lumbar_ext',  riskBelow: 15, normalMin: 20 },
  { key: 'thoracic_rot',riskBelow: 30, normalMin: 40 },
]

function computePRS(a: Assessment): number {
  let score = 100
  for (const j of PRS_BILATERAL) {
    const l = (a as unknown as Record<string, number | null>)[j.l]
    const r = (a as unknown as Record<string, number | null>)[j.r]
    if (l != null && r != null) {
      const minVal = Math.min(l, r)
      const gap    = Math.abs(l - r)
      if (minVal < j.riskBelow) score -= 8
      else if (minVal < j.normalMin) score -= 4
      if (gap >= 15) score -= 6
      else if (gap >= 8) score -= 3
    }
  }
  for (const j of PRS_UNILATERAL) {
    const v = (a as unknown as Record<string, number | null>)[j.key]
    if (v != null) {
      if (v < j.riskBelow) score -= 6
      else if (v < j.normalMin) score -= 3
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)))
}

function getPRSTier(s: number) {
  if (s >= 85) return { label: 'ELITE',      color: 'text-teal',        bg: 'bg-teal-light' }
  if (s >= 70) return { label: 'STRONG',     color: 'text-teal',        bg: 'bg-teal-light' }
  if (s >= 55) return { label: 'DEVELOPING', color: 'text-yellow-tier', bg: 'bg-yellow-tier-bg' }
  if (s >= 40) return { label: 'RESTRICTED', color: 'text-yellow-tier', bg: 'bg-yellow-tier-bg' }
  return              { label: 'AT RISK',    color: 'text-red-tier',    bg: 'bg-red-tier-bg' }
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-4">
      <h2 className="text-xs font-bold text-charcoal uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  )
}

// ── Row link/button ───────────────────────────────────────────────────────────
function SettingsRow({
  icon, label, sublabel, onClick, href, danger = false,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  onClick?: () => void
  href?: string
  danger?: boolean
}) {
  const cls = cn(
    'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left',
    danger
      ? 'bg-red-tier-bg border-red-200 text-red-tier hover:bg-red-100'
      : 'bg-surface border-teal-light text-charcoal hover:bg-teal-light'
  )
  const inner = (
    <>
      <span className={cn('shrink-0', danger ? 'text-red-tier' : 'text-charcoal-light')}>{icon}</span>
      <span className="flex-1">
        {label}
        {sublabel && <span className="block text-xs text-charcoal-light font-normal mt-0.5">{sublabel}</span>}
      </span>
      <ChevronRight size={14} className={danger ? 'text-red-tier/50' : 'text-charcoal-light'} />
    </>
  )
  if (href) return <a href={href} className={cls}>{inner}</a>
  return <button onClick={onClick} className={cls}>{inner}</button>
}

// ─────────────────────────────────────────────────────────────────────────────
export function Settings() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { profile, loading } = useProfile(user?.id)

  // Profile fields
  const [fullName, setFullName]       = useState('')
  const [belt, setBelt]               = useState('')
  const [dominantSide, setDominantSide] = useState('right')
  const [gymName, setGymName]         = useState('')
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)

  // Subscription
  const [subExpiry, setSubExpiry]     = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  // Assessment history
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [asLoading, setAsLoading]     = useState(true)

  // Delete modal
  const [showDelete, setShowDelete]   = useState(false)
  const [deleteText, setDeleteText]   = useState('')
  const [deleting, setDeleting]       = useState(false)

  // ── Sync profile into local state ──
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      setBelt(profile.belt ?? 'white')
    }
  }, [profile])

  // ── Load athlete + subscription expiry + assessments ──
  useEffect(() => {
    if (!user) return
    async function loadData() {
      // Athlete row
      const { data: athlete } = await supabase
        .from('athletes')
        .select('dominant_side, gym_name')
        .eq('user_id', user!.id)
        .single()
      if (athlete) {
        setDominantSide(athlete.dominant_side ?? 'right')
        setGymName(athlete.gym_name ?? '')
      }

      // Subscription expiry from users table
      const { data: userData } = await supabase
        .from('users')
        .select('subscription_expiry')
        .eq('id', user!.id)
        .single()
      if (userData?.subscription_expiry) {
        setSubExpiry(userData.subscription_expiry)
      }

      // All assessments newest-first
      setAsLoading(true)
      const { data: asmts } = await supabase
        .from('assessments')
        .select('*')
        .eq('user_id', user!.id)
        .order('assessed_at', { ascending: false })
      setAssessments((asmts as Assessment[]) ?? [])
      setAsLoading(false)
    }
    loadData()
  }, [user])

  // ── Save handler ──
  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    await Promise.all([
      supabase.from('users').update({ full_name: fullName, belt }).eq('id', user.id),
      supabase.from('athletes').update({ belt, dominant_side: dominantSide, gym_name: gymName }).eq('user_id', user.id),
    ])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // ── Stripe portal ──
  const handleManageSub = async () => {
    setPortalLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: { return_url: window.location.href },
      })
      if (error) throw error
      if (data?.url) window.location.href = data.url
    } catch (e) {
      console.error('Stripe portal error', e)
    } finally {
      setPortalLoading(false)
    }
  }

  // ── Sign out ──
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // ── Delete account ──
  const handleDelete = async () => {
    if (!user || deleteText !== 'DELETE') return
    setDeleting(true)
    try {
      await supabase.from('athletes').delete().eq('user_id', user.id)
      await supabase.from('users').update({ subscription_status: 'canceled' }).eq('id', user.id)
      await supabase.auth.signOut()
      navigate('/login')
    } catch (e) {
      console.error('Delete error', e)
      setDeleting(false)
    }
  }

  // ── Loading spinner ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isActive = ['active', 'trialing'].includes(profile?.subscription_status ?? '')

  return (
    <>
      <div className="max-w-lg space-y-5 pb-16">
        <h1 className="font-display font-bold text-2xl text-charcoal">Settings</h1>

        {/* ── PROFILE ── */}
        <Section title="Profile">
          <div>
            <label className="text-xs text-charcoal-light font-semibold uppercase tracking-wide block mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-xl border border-teal-light bg-surface px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>

          <div>
            <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide mb-1">Email</p>
            <p className="text-sm text-charcoal">{profile?.email ?? user?.email}</p>
          </div>

          <div>
            <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide mb-2">Belt</p>
            <div className="flex gap-2 flex-wrap">
              {BELTS.map(b => (
                <button
                  key={b}
                  onClick={() => setBelt(b)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold uppercase transition-all',
                    belt === b
                      ? beltColor(b) + ' ring-2 ring-offset-1 ring-teal'
                      : beltColor(b) + ' opacity-50 hover:opacity-80'
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide mb-2">
              Dominant Side
            </p>
            <div className="flex gap-2">
              {SIDES.map(s => (
                <button
                  key={s}
                  onClick={() => setDominantSide(s)}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors',
                    dominantSide === s
                      ? 'bg-teal text-white'
                      : 'bg-surface text-charcoal-light border border-teal-light hover:bg-teal-light'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-charcoal-light font-semibold uppercase tracking-wide block mb-1">
              Gym / Academy
            </label>
            <input
              type="text"
              value={gymName}
              onChange={e => setGymName(e.target.value)}
              placeholder="e.g. Alliance BJJ Columbus"
              className="w-full rounded-xl border border-teal-light bg-surface px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <p className="text-xs text-charcoal-light mt-1">
              Your coach uses this to find you in their roster.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saved ? 'Saved!' : 'Save Profile'}
          </button>
        </Section>

        {/* ── SUBSCRIPTION ── */}
        <Section title="Subscription">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-charcoal-light">Plan</p>
              <span className="text-xs bg-teal-light text-teal font-semibold px-3 py-1 rounded-full capitalize">
                {profile?.subscription_tier ?? 'free'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-charcoal-light">Status</p>
              <span className={cn(
                'text-xs font-semibold px-3 py-1 rounded-full capitalize',
                isActive
                  ? 'bg-green-tier-bg text-green-tier'
                  : 'bg-red-tier-bg text-red-tier'
              )}>
                {profile?.subscription_status ?? 'inactive'}
              </span>
            </div>

            {subExpiry && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-charcoal-light">Renews</p>
                <p className="text-sm font-medium text-charcoal">
                  {new Date(subExpiry).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </p>
              </div>
            )}
          </div>

          {isActive && (
            <button
              onClick={handleManageSub}
              disabled={portalLoading}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surface border border-teal-light text-sm font-medium text-charcoal hover:bg-teal-light transition-colors"
            >
              <span>Manage Subscription</span>
              {portalLoading
                ? <Loader2 size={15} className="animate-spin text-teal" />
                : <ExternalLink size={15} className="text-charcoal-light" />
              }
            </button>
          )}
        </Section>

        {/* ── ASSESSMENT HISTORY ── */}
        <Section title="Assessment History">
          <div className="flex items-center justify-between -mt-2 mb-1">
            <p className="text-xs text-charcoal-light">Your past ROM snapshots</p>
            <a
              href="/onboarding/assessment"
              className="text-xs font-semibold text-teal hover:underline"
            >
              + New Assessment
            </a>
          </div>

          {asLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-teal border-t-transparent rounded-full animate-spin" />
            </div>
          ) : assessments.length === 0 ? (
            <div className="text-center py-6">
              <ClipboardList size={28} className="mx-auto text-charcoal-light mb-2" />
              <p className="text-sm text-charcoal-light mb-2">No assessments on file yet.</p>
              <a
                href="/onboarding/assessment"
                className="inline-block text-sm font-semibold text-teal hover:underline"
              >
                Take your first assessment
              </a>
            </div>
          ) : (
            <div className="divide-y divide-teal-light/60">
              {assessments.map((a, i) => {
                const prs  = computePRS(a)
                const tier = getPRSTier(prs)
                const dateStr = new Date(a.assessed_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })
                return (
                  <div key={a.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-10 h-10 rounded-full flex flex-col items-center justify-center shrink-0 border', tier.bg)}>
                        <span className={cn('font-display font-bold text-sm leading-none', tier.color)}>{prs}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-charcoal">{dateStr}</p>
                        <p className={cn('text-xs font-bold', tier.color)}>{tier.label}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {i === 0 && (
                        <span className="text-xs bg-teal-light text-teal px-2 py-0.5 rounded-full font-semibold">
                          Latest
                        </span>
                      )}
                      <a
                        href="/onboarding/assessment"
                        className="flex items-center gap-1 text-xs font-semibold text-teal hover:underline"
                      >
                        <TrendingUp size={12} />
                        Retest
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── SUPPORT ── */}
        <Section title="Support">
          <div className="space-y-2 -mt-1">
            <SettingsRow
              icon={<Mail size={15} />}
              label="Email us"
              sublabel="ROMRxBJJ@gmail.com"
              href="mailto:ROMRxBJJ@gmail.com"
            />
            <SettingsRow
              icon={<HelpCircle size={15} />}
              label="Questions and FAQ"
              sublabel="Send us a question anytime"
              href="mailto:ROMRxBJJ@gmail.com?subject=ROMRxBJJ%20Question"
            />
          </div>
        </Section>

        {/* ── ACCOUNT ── */}
        <Section title="Account">
          <div className="space-y-2 -mt-1">
            <SettingsRow
              icon={<LogOut size={15} />}
              label="Sign out"
              onClick={handleSignOut}
            />
            <div className="pt-2 mt-1 border-t border-red-100">
              <p className="text-xs text-charcoal-light mb-2">Danger zone</p>
              <SettingsRow
                icon={<Trash2 size={15} />}
                label="Delete account"
                sublabel="Removes all your data permanently"
                onClick={() => setShowDelete(true)}
                danger
              />
            </div>
          </div>
        </Section>
      </div>

      {/* ── DELETE MODAL ── */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-tier-bg flex items-center justify-center shrink-0">
                <Trash2 size={16} className="text-red-tier" />
              </div>
              <h3 className="font-display font-bold text-lg text-charcoal">Delete Account</h3>
            </div>

            <p className="text-sm text-charcoal-light leading-relaxed">
              This removes your profile, assessments, and protocol data. It cannot be undone.
              Type <span className="font-bold text-charcoal">DELETE</span> to confirm.
            </p>

            <input
              type="text"
              value={deleteText}
              onChange={e => setDeleteText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full rounded-xl border border-red-200 bg-surface px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-red-400"
            />

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowDelete(false); setDeleteText('') }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-surface border border-teal-light text-sm font-medium text-charcoal hover:bg-teal-light transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteText !== 'DELETE' || deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-tier text-white text-sm font-medium disabled:opacity-40 hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
