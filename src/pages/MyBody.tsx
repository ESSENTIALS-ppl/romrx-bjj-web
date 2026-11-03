import { useAuth } from '../hooks/useAuth'
import { BASE_ASSESSMENT_HREF } from '../lib/baseAssessment'
import { useProfile } from '../hooks/useProfile'
import type { Assessment } from '../hooks/useProfile'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { cn, beltColor, formatJoint } from '../lib/utils'
import { AlertTriangle, Activity, TrendingUp } from 'lucide-react'
import { useHipFlexCutover } from '../lib/hipFlexCutover'
import { computePRS, readinessBand, scoredView } from '../lib/readiness'
import { JOINT_SCORE_TARGETS, jointDisplayRowsForAssessment, formatMeasure, type JointDisplayRow } from '../lib/mobilityBands'
import { isLumbarKey } from '../lib/lumbarFlag'
import { BAND_FULL } from '../lib/mobilityBands'

// ── Position Readiness Score ──────────────────────────────────────────────────
// computePRS lives in ../lib/readiness (hip flexion is not in the score).

function getPRSTier(a: object) {
  // FG-37 J1: Base bands (Steady / Building / Needs focus) from the same worst-joint rule as Base mobilityBands.ts
  const band = readinessBand(a)
  if (band === 3) return { label: BAND_FULL[3],      color: 'text-teal',       bg: 'bg-teal-light',      ring: 'border-teal/40' }
  if (band === 2) return { label: BAND_FULL[2], color: 'text-yellow-tier', bg: 'bg-yellow-tier-bg',  ring: 'border-yellow-tier/40' }
  return { label: BAND_FULL[1],    color: 'text-red-tier',   bg: 'bg-red-tier-bg',     ring: 'border-red-tier/40' }
}

// Per-joint targets are Base's (JOINT_SCORE_TARGETS in lib/mobilityBands.ts), not the old pack elite numbers (Grant Nov 2 2026).
const OPTIMAL: Record<string, number> = {
  'Hip Flex': JOINT_SCORE_TARGETS.hip_flex, 'Hip ER': JOINT_SCORE_TARGETS.hip_er, 'Hip IR': JOINT_SCORE_TARGETS.hip_ir, 'Hip Abd': JOINT_SCORE_TARGETS.hip_abd,
  'Shoulder ER': JOINT_SCORE_TARGETS.shoulder_er, 'Shoulder Flex': JOINT_SCORE_TARGETS.shoulder_flex, 'Ankle DF': JOINT_SCORE_TARGETS.ankle_df,
  'Cervical Lat': JOINT_SCORE_TARGETS.cervical_lat, 'Cervical Flex': JOINT_SCORE_TARGETS.cervical_flex, 'Cervical Ext': JOINT_SCORE_TARGETS.cervical_ext,
}

function norm(val: number, optimal: number) {
  return Math.min(100, Math.round((val / optimal) * 100))
}

const JOINTS = [
  { key: 'Hip ER',       get: (a: Assessment) => norm(Math.max(a.hip_er_l ?? 0, a.hip_er_r ?? 0), OPTIMAL['Hip ER']) },
  { key: 'Hip IR',       get: (a: Assessment) => norm(Math.max(a.hip_ir_l ?? 0, a.hip_ir_r ?? 0), OPTIMAL['Hip IR']) },
  { key: 'Hip Abd',      get: (a: Assessment) => norm(Math.max(a.hip_abd_l ?? 0, a.hip_abd_r ?? 0), OPTIMAL['Hip Abd']) },
  { key: 'Shoulder ER',  get: (a: Assessment) => norm(Math.max(a.shoulder_er_l ?? 0, a.shoulder_er_r ?? 0), OPTIMAL['Shoulder ER']) },
  { key: 'Shoulder Flex',get: (a: Assessment) => norm(Math.max(a.shoulder_flex_l ?? 0, a.shoulder_flex_r ?? 0), OPTIMAL['Shoulder Flex']) },
  { key: 'Ankle DF',     get: (a: Assessment) => norm(Math.max(a.ankle_df_l ?? 0, a.ankle_df_r ?? 0), OPTIMAL['Ankle DF']) },
  { key: 'Cerv Lat',     get: (a: Assessment) => norm(Math.max(a.cervical_lat_l ?? 0, a.cervical_lat_r ?? 0), OPTIMAL['Cervical Lat']) },
  { key: 'Cerv Flex',    get: (a: Assessment) => norm(a.cervical_flex ?? 0, OPTIMAL['Cervical Flex']) },
  { key: 'Cerv Ext',     get: (a: Assessment) => norm(a.cervical_ext ?? 0, OPTIMAL['Cervical Ext']) },
]

function buildRadar(assessments: Assessment[]) {
  return JOINTS.map(j => {
    const row: Record<string, string | number> = { joint: j.key }
    assessments.forEach((a, i) => { row[`v${i}`] = j.get(a) })
    return row
  })
}

// Joint names stay as this site already shows them; Base's row label is the fallback.
const JOINT_LABEL: Record<string, string> = {}

// Hip flexion is hidden (unmeasured) for assessments saved before the FG-36 cutover.
const hipView = (a: Assessment) => scoredView(a) as Assessment

function JointBar({ row, label }: { row: JointDisplayRow; label: string }) {
  // Base's own per-joint rows (worse side, % of the Base target, Base band). A joint the user did not measure draws nothing.
  const { left, right, midline, pct, band, unit } = row
  if (pct == null) return null
  const asym = left != null && right != null ? Math.abs(left - right) : 0
  const isBad = band === 1

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-32 shrink-0">
        <p className={cn('text-xs font-medium', isBad ? 'text-red-tier' : 'text-charcoal')}>{label}</p>
        {asym > 10 && (
          <p className="text-xs text-gold flex items-center gap-0.5 mt-0.5">
            <AlertTriangle size={9} /> {formatMeasure(asym)}{unit} gap
          </p>
        )}
      </div>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500',
            band === 3 ? 'bg-teal' : band === 2 ? 'bg-gold' : 'bg-red-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-20 text-right shrink-0 text-xs text-charcoal-light">
        {midline != null ? `${formatMeasure(midline)}${unit}` : `${formatMeasure(left)}${unit} / ${formatMeasure(right)}${unit}`}
      </div>
      <div className="w-8 text-right shrink-0">
        <span className={cn('text-xs font-bold',
          band === 3 ? 'text-teal' : band === 2 ? 'text-yellow-600' : 'text-red-tier')}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

export function MyBody() {
  useHipFlexCutover() // re-render when the FG-36 cutover is read
  const { user } = useAuth()
  const { profile, assessment, assessments, loading } = useProfile(user?.id)

  if (loading) return <Spinner />

  if (!assessment) return (
    <EmptyState
      icon={Activity}
      title="No assessment on file"
      description="Complete your ROM self-assessment to see your body map, joint breakdown, and technique readiness."
      action={<a href={BASE_ASSESSMENT_HREF} className="btn-primary text-sm">Get started</a>}
    />
  )

  const radarData = buildRadar(assessments.length > 0 ? assessments : assessment ? [assessment] : [])
  const RADAR_COLORS = ['#008080', '#f59e0b', '#60a5fa', '#c084fc']
  const RADAR_LABELS = assessments.map(a =>
    new Date(a.assessed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  )
  const belt = profile?.belt ?? 'white'
  const prs = computePRS(assessment)
  const tier = getPRSTier(assessment)
  // Older rows may still list hip flexion; it is never a priority joint or a red flag.
  const priorityJoints = (assessment.worst_joints ?? [])
  const redFlagReasons = (assessment.red_flag_reasons ?? [])

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Body"
        subtitle={`Assessed ${new Date(assessment.assessed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
        badge={`${belt} belt`}
        badgeColor={beltColor(belt)}
      />

      {/* Position Readiness Score */}
      <div className={cn('flex items-center gap-4 rounded-2xl border p-4', tier.bg, tier.ring.replace('border-', 'border ').replace('/40', ''))}>
        <div className={cn('w-16 h-16 rounded-full border-2 flex flex-col items-center justify-center shrink-0', tier.ring)}>
          <span className={cn('font-display font-bold text-2xl leading-none', tier.color)}>{prs}</span>
          <span className={cn('text-[10px] font-bold', tier.color)}>/100</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <TrendingUp size={13} className={tier.color} />
            <span className={cn('text-xs font-bold uppercase tracking-wider', tier.color)}>Protocol Score</span>
          </div>
          <p className={cn('text-lg font-bold leading-tight', tier.color)}>{tier.label}</p>
          <p className="text-xs text-charcoal-light mt-0.5">Retest every 6 weeks to track progress</p>
        </div>
      </div>

      {assessment.red_flag_triggered && redFlagReasons.length > 0 && (
        <div className="flex items-start gap-3 bg-red-tier-bg border border-red-200 rounded-2xl p-4">
          <AlertTriangle size={18} className="text-red-tier mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-tier">Notes from your assessment</p>
            <p className="text-xs text-red-tier/80 mt-0.5 leading-relaxed">
              {redFlagReasons.join(' · ')}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SectionCard title="ROM Protocol">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData} margin={{ top: 4, right: 20, bottom: 4, left: 20 }}>
              <PolarGrid stroke="#cde0e0" />
              <PolarAngleAxis dataKey="joint" tick={{ fontSize: 9, fill: '#5a7070', fontFamily: 'Inter' }} />
              {[...RADAR_LABELS].reverse().map((label, ri) => {
                const i = RADAR_LABELS.length - 1 - ri
                return (
                  <Radar
                    key={label}
                    name={label}
                    dataKey={`v${i}`}
                    stroke={RADAR_COLORS[i]}
                    fill={RADAR_COLORS[i]}
                    fillOpacity={i === 0 ? 0.1 : 0}
                    strokeWidth={i === 0 ? 2.5 : 2}
                    strokeDasharray={i === 0 ? undefined : '5 3'}
                    dot={i === 0 ? { fill: RADAR_COLORS[i], r: 3 } : false}
                  />
                )
              })}
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e0ecec', fontFamily: 'Inter' }}
                formatter={(v, name) => [`${v}%`, name]}
              />
              {RADAR_LABELS.length > 1 && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />}
            </RadarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Summary">
          <div className="space-y-3 mt-2">
            {priorityJoints.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-2">Priority joints</p>
                <div className="flex flex-wrap gap-1.5">
                  {priorityJoints.map(j => (
                    <span key={j} className="text-xs bg-red-tier-bg text-red-tier px-2.5 py-1 rounded-full font-medium">
                      {formatJoint(j)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {assessment.rom_total != null && (
              <div className="flex justify-between items-center py-2.5 border-t border-teal-light">
                <span className="text-sm text-charcoal-light">ROM Total Score</span>
                <span className="text-sm font-bold text-charcoal">{assessment.rom_total}</span>
              </div>
            )}
            {assessment.rom_percentile != null && (
              <div className="flex justify-between items-center py-2.5 border-t border-teal-light">
                <span className="text-sm text-charcoal-light">Percentile</span>
                <span className="text-sm font-bold text-charcoal">{assessment.rom_percentile}th</span>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Joint Breakdown" subtitle="Worse side shown: % of your Base target">
        <div className="divide-y divide-teal-light/60">
          {jointDisplayRowsForAssessment(hipView(assessment))
            .filter(r => !isLumbarKey(r.key))
            .map(r => <JointBar key={r.key} row={r} label={JOINT_LABEL[r.key] ?? r.label} />)}
        </div>
      </SectionCard>
    </div>
  )
}
